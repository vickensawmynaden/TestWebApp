// Procedural canvas textures, so the game ships with no image assets.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function make(w, h, draw, { repeatX = 1, repeatY = 1, clampY = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = clampY ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function noise(ctx, w, h, r, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
}

export function woodFloor() {
  const r = rng(11);
  return make(512, 512, (ctx, w, h) => {
    const rows = 8, ph = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 160 + r() * 200;
        const l = 18 + r() * 10;
        ctx.fillStyle = `hsl(${22 + r() * 8}, ${38 + r() * 12}%, ${l}%)`;
        ctx.fillRect(x, y * ph, len, ph);
        ctx.strokeStyle = 'rgba(0,0,0,.18)';
        for (let g = 0; g < 7; g++) {
          ctx.beginPath();
          const gy = y * ph + r() * ph;
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len * .3, gy + (r() - .5) * 8, x + len * .6, gy + (r() - .5) * 8, x + len, gy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(x, y * ph, 2, ph);
        x += len;
      }
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, y * ph, w, 2);
    }
    noise(ctx, w, h, r, 4000);
  }, { repeatX: 1, repeatY: 1 });
}

// Wallpaper above dark wood wainscoting (matches the u-tiling done in world.js).
export function wallpaper() {
  const r = rng(5);
  return make(256, 512, (ctx, w, h) => {
    const split = h * 0.62;
    ctx.fillStyle = '#8a7b62';
    ctx.fillRect(0, 0, w, split);
    // damask-ish stripes
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(60,45,30,.22)';
      ctx.fillRect(x, 0, 12, split);
      for (let y = 10; y < split; y += 40) {
        ctx.beginPath();
        ctx.ellipse(x + 22, y + (x / 32 % 2) * 20, 6, 10, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(70,52,34,.25)';
        ctx.fill();
      }
    }
    // water stains
    for (let i = 0; i < 6; i++) {
      const g = ctx.createRadialGradient(r() * w, r() * split, 0, r() * w, r() * split, 40 + r() * 80);
      g.addColorStop(0, 'rgba(40,30,15,.25)'); g.addColorStop(1, 'rgba(40,30,15,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, split);
    }
    // crown trim
    ctx.fillStyle = '#3b2617'; ctx.fillRect(0, 0, w, 10);
    // chair rail
    ctx.fillStyle = '#2e1c10'; ctx.fillRect(0, split - 6, w, 14);
    ctx.fillStyle = '#4a2f1b'; ctx.fillRect(0, split - 4, w, 4);
    // panels
    ctx.fillStyle = '#3a2416'; ctx.fillRect(0, split + 8, w, h - split - 8);
    for (let x = 0; x < w; x += 128) {
      ctx.strokeStyle = '#24150c'; ctx.lineWidth = 6;
      ctx.strokeRect(x + 14, split + 26, 100, h - split - 70);
      ctx.strokeStyle = 'rgba(120,80,50,.25)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 18, split + 30, 92, h - split - 78);
    }
    ctx.fillStyle = '#1d110a'; ctx.fillRect(0, h - 22, w, 22);
    noise(ctx, w, h, r, 5000, 0.07);
  }, { clampY: true });
}

export function stone() {
  const r = rng(7);
  return make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3c3b38'; ctx.fillRect(0, 0, w, h);
    const bh = 32;
    for (let y = 0; y < h; y += bh) {
      let x = (y / bh) % 2 ? -40 : 0;
      while (x < w) {
        const bw = 60 + r() * 50;
        const l = 22 + r() * 12;
        ctx.fillStyle = `hsl(${30 + r() * 20}, 6%, ${l}%)`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        x += bw;
      }
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(40,60,30,${0.1 + r() * 0.2})`;
      ctx.beginPath(); ctx.arc(r() * w, h - r() * 160, 10 + r() * 30, 0, 7); ctx.fill();
    }
    noise(ctx, w, h, r, 9000, 0.1);
  });
}

export function ground() {
  const r = rng(3);
  return make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#26281c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const hue = 60 + r() * 40, l = 10 + r() * 14;
      ctx.fillStyle = `hsla(${hue}, 25%, ${l}%, .5)`;
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 4 + r() * 22, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,100,60,.35)';
    for (let i = 0; i < 2500; i++) {
      const x = r() * w, y = r() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - .5) * 4, y - 3 - r() * 6); ctx.stroke();
    }
    noise(ctx, w, h, r, 8000, 0.12);
  }, { repeatX: 40, repeatY: 40 });
}

export function dirt() {
  const r = rng(9);
  return make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3226'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `hsla(30, 18%, ${14 + r() * 18}%, .6)`;
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 1 + r() * 5, 0, 7); ctx.fill();
    }
    noise(ctx, w, h, r, 5000, 0.15);
  });
}

export function plaster() {
  const r = rng(13);
  return make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5a5246'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) {
      const g = ctx.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 30 + r() * 60);
      g.addColorStop(0, 'rgba(30,22,12,.35)'); g.addColorStop(1, 'rgba(30,22,12,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    noise(ctx, w, h, r, 4000, 0.1);
  }, { repeatX: 6, repeatY: 6 });
}

export function rug() {
  const r = rng(17);
  return make(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a0f0d'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = '#2a0706'; ctx.lineWidth = 8; ctx.strokeRect(18, 18, w - 36, h - 36);
    for (let y = 40; y < h - 40; y += 48) {
      ctx.fillStyle = '#6d1a14';
      ctx.beginPath(); ctx.moveTo(w / 2, y); ctx.lineTo(w / 2 + 22, y + 24); ctx.lineTo(w / 2, y + 48); ctx.lineTo(w / 2 - 22, y + 24); ctx.fill();
    }
    noise(ctx, w, h, r, 4000, 0.15);
  });
}

export function bark() {
  const r = rng(19);
  return make(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a231c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.2 + r() * 0.4})`; ctx.lineWidth = 1 + r() * 3;
      const x = r() * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + (r() - .5) * 20, h * .3, x + (r() - .5) * 20, h * .6, x, h); ctx.stroke();
    }
    noise(ctx, w, h, r, 3000, 0.12);
  });
}

export function painting(seed) {
  const r = rng(seed);
  return make(128, 160, (ctx, w, h) => {
    ctx.fillStyle = '#3a2a12'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1510'; ctx.fillRect(12, 12, w - 24, h - 24);
    const g = ctx.createLinearGradient(0, 12, 0, h - 12);
    g.addColorStop(0, `hsl(${r() * 60}, 20%, 18%)`); g.addColorStop(1, `hsl(${r() * 60}, 25%, 8%)`);
    ctx.fillStyle = g; ctx.fillRect(14, 14, w - 28, h - 28);
    // a gloomy portrait silhouette
    ctx.fillStyle = `hsl(25, 25%, ${18 + r() * 10}%)`;
    ctx.beginPath(); ctx.ellipse(w / 2, h * .42, 18, 24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0e0b08';
    ctx.beginPath(); ctx.ellipse(w / 2, h * .9, 40, 40, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(w / 2 - 9, h * .4, 6, 3); ctx.fillRect(w / 2 + 3, h * .4, 6, 3);
    noise(ctx, w, h, r, 1500, 0.15);
  });
}

export function radial(inner, outer) {
  const t = make(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
