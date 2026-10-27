// Procedurally generated textures (no external image assets).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function noiseTexture(size = 256, seed = 1, contrast = 40, base = 128) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = base + (r() - 0.5) * contrast;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Woven fabric bump pattern.
export function clothTexture(seed = 3) {
  const size = 256;
  const [c, g] = canvas(size, size);
  const r = rng(seed);
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.08})`; g.fillRect(0, y, size, 1);
  }
  for (let x = 0; x < size; x += 2) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.08})`; g.fillRect(x, 0, 1, size);
  }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0.05)`; g.fillRect(r() * size, r() * size, 3, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// Stone tile floor: colour + roughness maps.
export function floorTextures(seed = 7) {
  const size = 1024, tiles = 8;
  const [c, g] = canvas(size, size);
  const [rc, rg] = canvas(size, size);
  const r = rng(seed);
  const ts = size / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const shade = 46 + r() * 22;
      const warm = r() * 6;
      g.fillStyle = `rgb(${shade + warm},${shade + warm * 0.6},${shade + 4})`;
      g.fillRect(tx * ts, ty * ts, ts, ts);
      rg.fillStyle = `rgb(${120 + r() * 60},${120 + r() * 60},${120 + r() * 60})`;
      rg.fillRect(tx * ts, ty * ts, ts, ts);
      // speckle
      for (let k = 0; k < 260; k++) {
        const x = tx * ts + r() * ts, y = ty * ts + r() * ts, a = r() * 0.15;
        g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${a})`;
        g.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
      }
      // polished worn patch (low roughness)
      const grd = rg.createRadialGradient(tx * ts + ts / 2, ty * ts + ts / 2, 2, tx * ts + ts / 2, ty * ts + ts / 2, ts * 0.6);
      grd.addColorStop(0, 'rgba(40,40,40,0.5)'); grd.addColorStop(1, 'rgba(40,40,40,0)');
      rg.fillStyle = grd; rg.fillRect(tx * ts, ty * ts, ts, ts);
    }
  }
  // grout lines
  g.strokeStyle = 'rgba(10,10,12,0.9)'; g.lineWidth = 5;
  rg.strokeStyle = 'rgb(240,240,240)'; rg.lineWidth = 5;
  for (let i = 0; i <= tiles; i++) {
    for (const ctx of [g, rg]) {
      ctx.beginPath(); ctx.moveTo(i * ts, 0); ctx.lineTo(i * ts, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * ts); ctx.lineTo(size, i * ts); ctx.stroke();
    }
  }
  // cracks
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2;
  for (let k = 0; k < 18; k++) {
    let x = r() * size, y = r() * size; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(rc);
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 8; }
  return { map, rough };
}

// Painted emblem for the arena centre.
export function emblemTexture() {
  const size = 512;
  const [c, g] = canvas(size, size);
  g.clearRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.strokeStyle = 'rgba(200,170,90,0.85)'; g.lineWidth = 10;
  g.beginPath(); g.arc(0, 0, 230, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(200,170,90,0.75)';
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate(i * Math.PI / 4);
    g.beginPath(); g.moveTo(0, -190); g.lineTo(14, -150); g.lineTo(-14, -150); g.closePath(); g.fill();
    g.restore();
  }
  g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('鉄', 0, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function radialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const [c, g] = canvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function skyTexture() {
  const [c, g] = canvas(16, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.0, '#05060c');
  grd.addColorStop(0.35, '#0f1430');
  grd.addColorStop(0.55, '#3a2440');
  grd.addColorStop(0.62, '#a0463a');
  grd.addColorStop(0.68, '#e08a4a');
  grd.addColorStop(0.75, '#2a1a22');
  grd.addColorStop(1.0, '#0a0a0e');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
