"""Auto-rig static character GLBs into skinned, game-ready GLBs.

    python3 tools/charbuild/rig.py [fighter ...]      (default: all fighters in rigdefs.py)

Input:  assets/source/<file>.glb   single textured mesh, standing, facing +Z, Y up.
Output: assets/characters/<fighter>.glb   skinned mesh + humanoid skeleton + JPEG texture,
        with the rest-pose joint table in scene extras (read by js/render/SkinnedFighter.js).

Pipeline
  1. normalise the mesh to 1.8 units tall, read the joint table from rigdefs.py, mirror L -> R
     about the body centre, refine limb joints to the centre of the limb cross-section;
  2. optional tail: chain joints placed automatically along the tail by geodesic distance;
  3. skin weights from *volumetric geodesic* distance: the mesh is voxelised and filled, and
     each bone's distance field is computed through the solid (Dijkstra on the voxel graph),
     so an arm never pulls the torso it merely rests against; weights fall off from the nearest
     bone, top 4 kept, then smoothed over the welded surface;
  4. write the GLB: bones with identity rest rotation (joint positions only), inverse bind
     matrices, u8 joints / normalised weights, 2048 JPEG texture.
"""
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra

sys.path.insert(0, os.path.dirname(__file__))
from glb import GLB, FLOAT, UBYTE, USHORT  # noqa: E402
from rigdefs import MODELS  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
NORM_H = 1.8

# Skeleton: (bone, parent, head joint, tail joint). Bone names avoid '.', which glTF loaders strip.
BODY_BONES = [
    ('hips', None, 'pelvis', 'spine'),
    ('spine', 'hips', 'spine', 'chest'),
    ('chest', 'spine', 'chest', 'neck'),
    ('neck', 'chest', 'neck', 'head'),
    ('head', 'neck', 'head', 'headTop'),
]
for s in ('L', 'R'):
    BODY_BONES += [
        (f'clavicle_{s}', 'chest', f'clav.{s}', f'shoulder.{s}'),
        (f'upperarm_{s}', f'clavicle_{s}', f'shoulder.{s}', f'elbow.{s}'),
        (f'forearm_{s}', f'upperarm_{s}', f'elbow.{s}', f'wrist.{s}'),
        (f'hand_{s}', f'forearm_{s}', f'wrist.{s}', f'handTip.{s}'),
        (f'thigh_{s}', 'hips', f'hip.{s}', f'knee.{s}'),
        (f'shin_{s}', f'thigh_{s}', f'knee.{s}', f'ankle.{s}'),
        (f'foot_{s}', f'shin_{s}', f'ankle.{s}', f'ball.{s}'),
        (f'toe_{s}', f'foot_{s}', f'ball.{s}', f'toe.{s}'),
    ]


# ------------------------------------------------------------------ GLB input
def read_glb(path):
    d = open(path, 'rb').read()
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    b = d[20 + jl + 8:]

    def acc(i):
        a = j['accessors'][i]
        v = j['bufferViews'][a['bufferView']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        arr = np.frombuffer(b, dt, a['count'] * n, off)
        return arr.reshape(a['count'], n) if n > 1 else arr

    assert len(j['meshes']) == 1 and len(j['meshes'][0]['primitives']) == 1, 'expected a single mesh primitive'
    pr = j['meshes'][0]['primitives'][0]
    at = pr['attributes']
    img = j['images'][0]
    v = j['bufferViews'][img['bufferView']]
    raw = b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    return {
        'P': acc(at['POSITION']).astype(np.float64), 'N': acc(at['NORMAL']).astype(np.float64),
        'UV': acc(at['TEXCOORD_0']).astype(np.float64), 'I': acc(pr['indices']).astype(np.int64).reshape(-1, 3),
        'image': Image.open(io.BytesIO(raw)).convert('RGB'), 'material': j['materials'][pr.get('material', 0)],
    }


# ------------------------------------------------------------------ joints
def mirror_joints(cfg):
    cx = cfg.get('cx', 0.0)
    J = {}
    for k, v in cfg['joints'].items():
        v = np.array(v, dtype=np.float64)
        if k.endswith('.L'):
            J[k] = v + [cx, 0, 0]
            r = k[:-2] + '.R'
            J[r] = np.array(cfg.get('right', {}).get(k[:-2], [-v[0], v[1], v[2]]), dtype=np.float64) + [cx, 0, 0]
        else:
            J[k] = v + [cx, 0, 0]
    return J


def refine_joint(P, j, axis, radius, slab=0.015, max_shift=0.06):
    """Move joint j to the centroid of the limb cross-section through j (perpendicular to axis)."""
    axis = axis / np.linalg.norm(axis)
    d = P - j
    along = d @ axis
    perp = d - np.outer(along, axis)
    m = (np.abs(along) < slab) & (np.linalg.norm(perp, axis=1) < radius)
    if m.sum() < 12:
        return j
    c = P[m].mean(0)
    shift = (c - j) - ((c - j) @ axis) * axis
    n = np.linalg.norm(shift)
    if n > max_shift:
        shift *= max_shift / n
    return j + shift


def refine_all(P, J, cfg):
    no = set(cfg.get('norefine', []))
    for s in ('L', 'R'):
        for joint, a, b, r in (('elbow', 'shoulder', 'wrist', 0.1), ('wrist', 'elbow', 'handTip', 0.08),
                               ('knee', 'hip', 'ankle', 0.13), ('shoulder', 'clav', 'elbow', 0.0)):
            k = f'{joint}.{s}'
            if r and k not in no and joint not in no:
                J[k] = refine_joint(P, J[k], J[f'{b}.{s}'] - J[f'{a}.{s}'], r * cfg.get('limbScale', 1))
    cx = cfg.get('cx', 0.0)
    for k in ('spine', 'chest', 'neck'):
        if k in no:
            continue
        m = (np.abs(P[:, 1] - J[k][1]) < 0.015) & (np.abs(P[:, 0] - cx) < 0.12)
        if m.sum() > 12:
            z = P[m, 2]
            J[k][2] = 0.5 * (z.min() + z.max())
    return J


# ------------------------------------------------------------------ voxels
class Voxels:
    def __init__(self, P, I, h):
        self.h = h
        lo = P.min(0) - 3 * h
        self.origin = lo
        self.shape = tuple(np.ceil((P.max(0) + 3 * h - lo) / h).astype(int))
        occ = np.zeros(self.shape, bool)
        # sample every triangle densely enough to leave no voxel gaps
        A, B, C = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
        edge = np.maximum.reduce([np.linalg.norm(B - A, axis=1), np.linalg.norm(C - B, axis=1), np.linalg.norm(A - C, axis=1)])
        n = np.clip(np.ceil(edge / (0.5 * h)).astype(int), 1, 64)
        for k in np.unique(n):
            sel = n == k
            u, v = np.meshgrid(np.arange(k + 1), np.arange(k + 1), indexing='ij')
            keep = (u + v) <= k
            u, v = u[keep] / k, v[keep] / k
            pts = A[sel, None] * (1 - u - v)[None, :, None] + B[sel, None] * u[None, :, None] + C[sel, None] * v[None, :, None]
            idx = np.floor((pts.reshape(-1, 3) - lo) / h).astype(int)
            occ[idx[:, 0], idx[:, 1], idx[:, 2]] = True
        solid = ndimage.binary_fill_holes(occ) | occ
        self.solid = solid
        self.ids = -np.ones(self.shape, np.int64)
        cells = np.argwhere(solid)
        self.ids[tuple(cells.T)] = np.arange(len(cells))
        self.cells = cells
        self.centers = lo + (cells + 0.5) * h
        # 26-connected graph weighted by centre distance
        rows, cols, w = [], [], []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    if (dx, dy, dz) <= (0, 0, 0):
                        continue
                    nb = cells + [dx, dy, dz]
                    ok = np.all((nb >= 0) & (nb < self.shape), axis=1)
                    j = np.full(len(cells), -1)
                    j[ok] = self.ids[tuple(nb[ok].T)]
                    ok = j >= 0
                    rows.append(np.nonzero(ok)[0]); cols.append(j[ok])
                    w.append(np.full(ok.sum(), h * np.sqrt(dx * dx + dy * dy + dz * dz)))
        r, c, w = np.concatenate(rows), np.concatenate(cols), np.concatenate(w)
        self.graph = sparse.coo_matrix((np.concatenate([w, w]), (np.concatenate([r, c]), np.concatenate([c, r]))), shape=(len(cells),) * 2).tocsr()

    def cell_of(self, X):
        idx = np.floor((X - self.origin) / self.h).astype(int)
        idx = np.clip(idx, 0, np.array(self.shape) - 1)
        out = self.ids[tuple(idx.T)]
        miss = out < 0
        if miss.any():
            # nearest solid cell for the few vertices that land outside the voxelised shell
            from scipy.spatial import cKDTree
            _, nn = cKDTree(self.centers).query(X[miss])
            out[miss] = nn
        return out

    def segment_seeds(self, a, b):
        ab = b - a
        L2 = max(ab @ ab, 1e-12)
        t = np.clip(((self.centers - a) @ ab) / L2, 0, 1)
        d = np.linalg.norm(self.centers - (a + t[:, None] * ab), axis=1)
        return np.nonzero(d <= max(self.h * 0.9, d.min() + self.h * 0.5))[0]

    def geodesic(self, seeds, limit):
        return dijkstra(self.graph, indices=seeds, min_only=True, limit=limit)


# ------------------------------------------------------------------ tails
def tail_chain(V, P, cfg, J):
    """Joints along a tail: geodesic distance from the tail base inside the tail region, binned."""
    t = cfg['tail']
    base = np.array(t['base'], dtype=np.float64) + [cfg.get('cx', 0.0), 0, 0]
    region = t['region'](V.centers - [cfg.get('cx', 0.0), 0, 0])
    sub = np.nonzero(region)[0]
    g = V.graph[sub][:, sub]
    seed = np.argmin(np.linalg.norm(V.centers[sub] - base, axis=1))
    d = dijkstra(g, indices=seed)
    ok = np.isfinite(d)
    dmax = d[ok].max()
    n = t['segments']
    pts = [V.centers[sub][seed]]
    for i in range(1, n + 1):
        lo, hi = dmax * (i - 0.5) / n, dmax * min(1.0, (i + 0.5) / n)
        if i == n:
            lo = dmax * (1 - 0.6 / n)
        m = ok & (d >= lo) & (d <= hi)
        pts.append(V.centers[sub][m].mean(0))
    for i, p in enumerate(pts):
        J[f'tail{i}'] = p
    return [(f'tail{i + 1}', 'hips' if i == 0 else f'tail{i}', f'tail{i}', f'tail{i + 1}') for i in range(n)]


# ------------------------------------------------------------------ weights
def skin_weights(V, P, I, bones, J, sigma):
    cells = V.cell_of(P)
    D = np.empty((len(P), len(bones)))
    E = np.empty((len(P), len(bones)))
    for bi, (name, _, h, t) in enumerate(bones):
        a, b = J[h], J[t]
        D[:, bi] = V.geodesic(V.segment_seeds(a, b), np.inf)[cells]
        ab = b - a
        u = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        E[:, bi] = np.linalg.norm(P - (a + u[:, None] * ab), axis=1)
    # Mesh islands not connected to any bone through the volume fall back to straight-line distance.
    lost = ~np.isfinite(D).any(1)
    D[lost] = E[lost]
    D[~np.isfinite(D)] = 1e3
    dmin = D.min(1, keepdims=True)
    W = np.exp(-((D - dmin) / sigma) ** 2)
    W[D - dmin > 2.5 * sigma] = 0
    W = smooth_weights(W, P, I, iters=3)
    print(f'    {int(lost.sum())} vertices on unconnected islands (euclidean fallback)')
    return top4(W)


def smooth_weights(W, P, I, iters):
    # weld split vertices (UV seams) so smoothing crosses seams
    key = np.round(P / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.ravel()
    n = weld.max() + 1
    Wu = np.zeros((n, W.shape[1]))
    np.add.at(Wu, weld, W)
    cnt = np.bincount(weld, minlength=n)[:, None]
    Wu /= cnt
    e = np.concatenate([I[:, [0, 1]], I[:, [1, 2]], I[:, [2, 0]]])
    e = weld[e]
    A = sparse.coo_matrix((np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n)).tocsr()
    A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel()[:, None] + 1e-9
    for _ in range(iters):
        Wu = 0.5 * Wu + 0.5 * (A @ Wu) / deg
    return Wu[weld]


def top4(W):
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, 1)
    w[w < 0.02] = 0
    w /= w.sum(1, keepdims=True)
    # quantise to u8 that sums exactly to 255
    q = np.floor(w * 255).astype(np.int64)
    q[:, 0] += 255 - q.sum(1)
    return idx.astype(np.uint8), q.astype(np.uint8)


# ------------------------------------------------------------------ output
def write_rigged(out, M, P, N, UV, I, bones, J, joints_idx, weights_q, cfg, info):
    g = GLB()
    names = [b[0] for b in bones]
    parent = {b[0]: b[1] for b in bones}
    head = {b[0]: J[b[2]] for b in bones}
    nodes = {}
    for nm in names:  # parents precede children in the table
        p = parent[nm]
        t = head[nm] - (head[p] if p else 0)
        nodes[nm] = g.node({'name': nm, 'translation': [float(x) for x in t]})
        if p:
            g.j['nodes'][nodes[p]].setdefault('children', []).append(nodes[nm])
    arm = g.node({'name': 'Armature', 'children': [nodes['hips']]})
    ibm = np.zeros((len(names), 16), np.float32)
    for i, nm in enumerate(names):
        m = np.eye(4)
        m[:3, 3] = -head[nm]
        ibm[i] = m.T.ravel()  # column-major
    ibm_acc = g.accessor(ibm, FLOAT, 'MAT4')
    g.j['skins'].append({'joints': [nodes[n] for n in names], 'inverseBindMatrices': ibm_acc, 'skeleton': nodes['hips']})

    buf = io.BytesIO()
    img = M['image']
    if cfg.get('texture', 2048) != img.size[0]:
        img = img.resize((cfg['texture'],) * 2, Image.LANCZOS)
    img.save(buf, 'JPEG', quality=cfg.get('jpeg', 86), optimize=True, progressive=True)
    tex = g.image(buf.getvalue(), 'image/jpeg')
    mat = {'name': cfg['name'], 'pbrMetallicRoughness': {'baseColorTexture': {'index': tex}, 'metallicFactor': cfg['metal'], 'roughnessFactor': cfg['rough']}}
    mi = g.material(mat)
    attrs = {
        'POSITION': g.accessor(P.astype(np.float32), FLOAT, 'VEC3', 34962, minmax=True),
        'NORMAL': g.accessor(N.astype(np.float32), FLOAT, 'VEC3', 34962),
        'TEXCOORD_0': g.accessor(UV.astype(np.float32), FLOAT, 'VEC2', 34962),
        'JOINTS_0': g.accessor(joints_idx, UBYTE, 'VEC4', 34962),
        'WEIGHTS_0': g.accessor(weights_q, UBYTE, 'VEC4', 34962, normalized=True),
    }
    ind = g.accessor(I.astype(np.uint16 if len(P) < 65536 else np.uint32).ravel(), USHORT if len(P) < 65536 else 5125, 'SCALAR', 34963)
    g.j['meshes'].append({'name': cfg['name'], 'primitives': [{'attributes': attrs, 'indices': ind, 'material': mi}]})
    body = g.node({'name': 'Body', 'mesh': 0, 'skin': 0})
    g.j['scenes'][0]['nodes'] = [arm, body]
    g.j['scenes'][0]['extras'] = info
    return g.write(out)


def weapon_info(cfg, J, off, k):
    w = cfg.get('weapon')
    if not w:
        return None
    tip = (np.array(w['tip'], dtype=np.float64) - off) * k
    d = tip - J['wrist.' + w['side']]
    return {'hand': 'hand_' + w['side'], 'dir': [float(x) for x in d / np.linalg.norm(d)], 'aim': w['aim']}


def build(fid):
    cfg = MODELS[fid]
    src = os.path.join(ROOT, 'assets', 'source', cfg['src'])
    M = read_glb(src)
    P0 = M['P']
    s = NORM_H / P0[:, 1].max()
    P = (P0 - [0, P0[:, 1].min(), 0]) * s
    J = refine_all(P, mirror_joints(cfg), cfg)
    h = cfg.get('voxel', 0.012)
    V = Voxels(P, M['I'], h)
    bones = list(BODY_BONES)
    if cfg.get('tail'):
        bones += tail_chain(V, P, cfg, J)
    joints_idx, weights_q = skin_weights(V, P, M['I'], bones, J, cfg.get('sigma', 0.035))

    # recentre on the pelvis and scale to the in-game height (fighter scale 1.0)
    off = np.array([J['pelvis'][0], 0, J['pelvis'][2]])
    k = cfg['height'] / NORM_H
    P = (P - off) * k
    J = {n: (p - off) * k for n, p in J.items()}
    N = M['N'] / (np.linalg.norm(M['N'], axis=1, keepdims=True) + 1e-12)
    dist = lambda a, b: float(np.linalg.norm(J[a] - J[b]))  # noqa: E731
    info = {'rig': {
        'version': 1, 'source': cfg['src'], 'height': float(P[:, 1].max()),
        'joints': {n: [round(float(x), 5) for x in p] for n, p in J.items()},
        'bones': [[b[0], b[1], b[2], b[3]] for b in bones],
        'lengths': {'upperArm': (dist('shoulder.L', 'elbow.L') + dist('shoulder.R', 'elbow.R')) / 2,
                    'foreArm': (dist('elbow.L', 'wrist.L') + dist('elbow.R', 'wrist.R')) / 2,
                    'thigh': (dist('hip.L', 'knee.L') + dist('hip.R', 'knee.R')) / 2,
                    'shin': (dist('knee.L', 'ankle.L') + dist('knee.R', 'ankle.R')) / 2},
        'weapon': weapon_info(cfg, J, off, k),
        'tail': bool(cfg.get('tail')),
    }}
    os.makedirs(os.path.join(ROOT, 'assets', 'characters'), exist_ok=True)
    out = os.path.join(ROOT, 'assets', 'characters', f'{fid}.glb')
    size = write_rigged(out, M, P, N, M['UV'], M['I'], bones, J, joints_idx, weights_q, cfg, info)
    print(f'{fid}: {cfg["src"]} -> {os.path.relpath(out, ROOT)}  {size / 1e6:.2f} MB, {len(P)} verts, {len(M["I"])} tris, '
          f'{len(bones)} bones, {int(V.solid.sum())} voxels, lengths {json.dumps({k: round(v, 3) for k, v in info["rig"]["lengths"].items()})}')
    return info


def dump_joints(fid, path):
    """Refined joint table in normalised source space (for the overlay preview)."""
    cfg = MODELS[fid]
    M = read_glb(os.path.join(ROOT, 'assets', 'source', cfg['src']))
    P = (M['P'] - [0, M['P'][:, 1].min(), 0]) * (NORM_H / M['P'][:, 1].max())
    J = refine_all(P, mirror_joints(cfg), cfg)
    json.dump({k: [float(x) for x in v] for k, v in J.items()}, open(path, 'w'))


if __name__ == '__main__':
    if sys.argv[1:2] == ['--joints']:
        dump_joints(sys.argv[2], sys.argv[3])
        sys.exit()
    ids = sys.argv[1:] or list(MODELS)
    report = {fid: build(fid)['rig'] for fid in ids}
    json.dump(report, open(os.path.join(ROOT, 'assets', 'characters', 'rig-report.json') if len(ids) == len(MODELS) else os.devnull, 'w'), indent=1)
