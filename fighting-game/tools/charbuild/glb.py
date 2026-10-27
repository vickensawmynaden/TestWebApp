"""Minimal glTF 2.0 binary (GLB) writer for skinned, textured characters."""
import io
import json
import struct

import numpy as np

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {'asset': {'version': '2.0', 'generator': 'iron-fist-arena charbuild'},
                  'buffers': [], 'bufferViews': [], 'accessors': [], 'meshes': [], 'nodes': [],
                  'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
                  'skins': [], 'scenes': [{'nodes': []}], 'scene': 0}

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.j['bufferViews'].append(v)
        return len(self.j['bufferViews']) - 1

    def accessor(self, arr, ctype, atype, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        view = self._view(arr.tobytes(), target)
        acc = {'bufferView': view, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': atype}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'] = [float(x) for x in arr.min(0)]
            acc['max'] = [float(x) for x in arr.max(0)]
        self.j['accessors'].append(acc)
        return len(self.j['accessors']) - 1

    def image(self, data, mime):
        view = self._view(data)
        self.j['images'].append({'bufferView': view, 'mimeType': mime})
        self.j['textures'].append({'source': len(self.j['images']) - 1, 'sampler': 0})
        return len(self.j['textures']) - 1

    def image_pil(self, img, fmt='JPEG', quality=88):
        buf = io.BytesIO()
        if fmt == 'JPEG':
            img.convert('RGB').save(buf, 'JPEG', quality=quality, optimize=True)
            return self.image(buf.getvalue(), 'image/jpeg')
        img.save(buf, 'PNG', optimize=True)
        return self.image(buf.getvalue(), 'image/png')

    def material(self, mat):
        self.j['materials'].append(mat)
        return len(self.j['materials']) - 1

    def node(self, n):
        self.j['nodes'].append(n)
        return len(self.j['nodes']) - 1

    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        for k in ('textures', 'images', 'skins', 'materials'):
            if not self.j[k]:
                del self.j[k]
        if 'textures' not in self.j:
            del self.j['samplers']
        js = json.dumps(self.j, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, total))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))
        return total
