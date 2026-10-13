// Procedurally generated textures (original assets, no external files).
// Every texture is drawn on a canvas at load time: asphalt, pavers, facades, signage atlas, etc.
import * as THREE from 'three';
import { makeRng, Rng } from '../core/math';

export type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng) => void;

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let anisotropy = 4;
export function setAnisotropy(a: number) { anisotropy = a; }

export function canvasTexture(w: number, h: number, draw: Draw, seed = 1, srgb = true): THREE.CanvasTexture {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h, makeRng(seed));
  return toTexture(c, srgb);
}

export function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- noise helpers
function valueNoise(w: number, h: number, cell: number, rng: Rng): Float32Array {
  const gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  // make tileable
  for (let y = 0; y < gh; y++) g[y * gw + gw - 1] = g[y * gw];
  for (let x = 0; x < gw; x++) g[(gh - 1) * gw + x] = g[x];
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / cell, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function fbm(w: number, h: number, rng: Rng, base = 64, octaves = 5): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 0.5, total = 0, cell = base;
  for (let o = 0; o < octaves && cell >= 1; o++) {
    const n = valueNoise(w, h, cell, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
    cell /= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Apply a per-pixel function over the canvas using a noise field. */
function shadeWithNoise(ctx: CanvasRenderingContext2D, w: number, h: number, n: Float32Array, fn: (v: number, i: number, px: Uint8ClampedArray, o: number) => void) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) fn(n[i], i, d, i * 4);
  ctx.putImageData(img, 0, 0);
}

/** Normal map from a height field (tileable). */
export function normalFromHeight(hf: Float32Array, w: number, h: number, strength = 2): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = hf[y * w + ((x - 1 + w) % w)], r = hf[y * w + ((x + 1) % w)];
      const u = hf[((y - 1 + h) % h) * w + x], d = hf[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const o = (y * w + x) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- surfaces
export function asphaltSet(seed = 7) {
  const S = 512;
  const rng = makeRng(seed);
  const n = fbm(S, S, rng, 128, 6);
  const fine = fbm(S, S, rng, 4, 2);
  const height = new Float32Array(S * S);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3a3c';
  ctx.fillRect(0, 0, S, S);
  shadeWithNoise(ctx, S, S, n, (v, i, d, o) => {
    const f = fine[i];
    const speck = f > 0.78 ? 30 : f < 0.22 ? -18 : 0;
    const base = 44 + v * 26 + (f - 0.5) * 22 + speck * 0.8;
    d[o] = base; d[o + 1] = base; d[o + 2] = base + 3;
    height[i] = f * 0.7 + v * 0.3;
  });
  // patches, oil stains, tyre polish
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(20,20,22,0.18)' : 'rgba(110,108,100,0.10)';
    const x = rng.range(0, S), y = rng.range(0, S), w = rng.range(40, 160), h = rng.range(30, 120);
    ctx.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 14; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(10,10,12,0.35)');
    g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.save();
    ctx.translate(rng.range(0, S), rng.range(0, S));
    ctx.scale(rng.range(8, 28), rng.range(6, 18));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // cracks
  ctx.strokeStyle = 'rgba(15,15,15,0.55)';
  for (let i = 0; i < 10; i++) {
    ctx.lineWidth = rng.range(0.6, 1.6);
    ctx.beginPath();
    let x = rng.range(0, S), y = rng.range(0, S);
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += rng.range(-14, 14); y += rng.range(-14, 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const map = toTexture(c);
  const normal = normalFromHeight(height, S, S, 1.2);
  // roughness: stains slightly smoother
  const rc = makeCanvas(S, S);
  const rctx = rc.getContext('2d')!;
  rctx.fillStyle = '#ddd';
  rctx.fillRect(0, 0, S, S);
  shadeWithNoise(rctx, S, S, n, (v, _i, d, o) => {
    const r = 200 + (v - 0.5) * 80;
    d[o] = d[o + 1] = d[o + 2] = r;
  });
  const rough = toTexture(rc, false);
  return { map, normal, rough };
}

export function paverSet(seed = 11, tint: [number, number, number] = [124, 120, 114]) {
  const S = 512;
  const rng = makeRng(seed);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const height = new Float32Array(S * S).fill(1);
  ctx.fillStyle = '#555';
  ctx.fillRect(0, 0, S, S);
  // Interlocking zig-zag pavers approximated by staggered rectangles (8 x 16 grid).
  const bw = S / 8, bh = S / 16;
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 9; col++) {
      const off = (row % 2) * bw * 0.5;
      const x = col * bw - off, y = row * bh;
      const k = rng.range(-18, 18);
      const red = rng.chance(0.06);
      const r = (red ? 150 : tint[0]) + k, g = (red ? 92 : tint[1]) + k, b = (red ? 80 : tint[2]) + k;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(S, y + bh); yy++) {
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(S, x + bw); xx++) {
          const edge = xx - x < 3 || x + bw - xx < 3 || yy - y < 3 || y + bh - yy < 3;
          if (edge) height[yy * S + xx] = 0;
        }
      }
    }
  }
  // dirt & stains
  const n = fbm(S, S, rng, 64, 5);
  shadeWithNoise(ctx, S, S, n, (v, i, d, o) => {
    const k = (v - 0.5) * 50;
    d[o] = Math.max(0, d[o] + k - 6); d[o + 1] = Math.max(0, d[o + 1] + k - 8); d[o + 2] = Math.max(0, d[o + 2] + k - 10);
    height[i] = height[i] * 0.8 + v * 0.2;
  });
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = rng.pick(['rgba(120,20,20,0.25)', 'rgba(40,30,20,0.25)', 'rgba(20,20,20,0.2)']); // paan stains, dirt
    ctx.beginPath();
    ctx.ellipse(rng.range(0, S), rng.range(0, S), rng.range(3, 14), rng.range(2, 10), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  return { map: toTexture(c), normal: normalFromHeight(height, S, S, 4) };
}

export function concreteSet(seed = 3, base = 165) {
  const S = 256;
  const rng = makeRng(seed);
  const n = fbm(S, S, rng, 64, 6);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  shadeWithNoise(ctx, S, S, n, (v, _i, d, o) => {
    const k = base + (v - 0.5) * 70;
    d[o] = k; d[o + 1] = k - 2; d[o + 2] = k - 6; d[o + 3] = 255;
  });
  // water streaks
  for (let i = 0; i < 25; i++) {
    const x = rng.range(0, S);
    const g = ctx.createLinearGradient(x, 0, x, S);
    g.addColorStop(0, 'rgba(40,38,30,0.25)');
    g.addColorStop(1, 'rgba(40,38,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rng.range(2, 8), rng.range(30, S));
  }
  return { map: toTexture(c), normal: normalFromHeight(n, S, S, 2) };
}

export function groundSet(kind: 'grass' | 'dirt' | 'ballast' | 'sand', seed = 5) {
  const S = 512;
  const rng = makeRng(seed);
  const n = fbm(S, S, rng, 96, 6);
  const f = fbm(S, S, rng, 3, 2);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const height = new Float32Array(S * S);
  shadeWithNoise(ctx, S, S, n, (v, i, d, o) => {
    const k = f[i];
    let r = 0, g = 0, b = 0;
    if (kind === 'grass') {
      const dry = v;
      r = 70 + dry * 70 + k * 30; g = 92 + dry * 40 + k * 35; b = 40 + dry * 20;
    } else if (kind === 'dirt') {
      r = 140 + v * 50 + k * 30; g = 112 + v * 40 + k * 22; b = 80 + v * 30 + k * 15;
    } else if (kind === 'sand') {
      r = 190 + v * 30 + k * 20; g = 170 + v * 25 + k * 16; b = 135 + v * 20;
    } else {
      const s = 85 + v * 50 + k * 70;
      r = s; g = s - 4; b = s - 8;
    }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    height[i] = kind === 'ballast' ? k : v * 0.5 + k * 0.5;
  });
  return { map: toTexture(c), normal: normalFromHeight(height, S, S, kind === 'ballast' ? 5 : 2) };
}

// ---------------------------------------------------------------- facades
export type FacadeStyle = 'apartment' | 'chawl' | 'glass' | 'heritage' | 'modern' | 'settlement';

/**
 * Facade tile covering 4 bays x 3 floors (14 m x 9.3 m). Returns colour map (wall in near-white
 * so material colour can tint it), emissive map (lit windows at night) and roughness.
 */
export function facadeSet(style: FacadeStyle, seed = 1) {
  const W = 512, H = 512;
  const rng = makeRng(seed * 131 + style.length);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const e = makeCanvas(W, H);
  const ectx = e.getContext('2d')!;
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  const bays = 4, floors = 3;
  const bw = W / bays, fh = H / floors;

  const n = fbm(W, H, rng, 64, 5);
  // base wall
  const wallBase = style === 'glass' ? [70, 96, 108] : style === 'heritage' ? [200, 182, 148] : style === 'settlement' ? [180, 170, 160] : [212, 206, 194];
  shadeWithNoise(ctx, W, H, n, (v, _i, d, o) => {
    const k = (v - 0.5) * (style === 'glass' ? 20 : 46);
    d[o] = wallBase[0] + k; d[o + 1] = wallBase[1] + k; d[o + 2] = wallBase[2] + k; d[o + 3] = 255;
  });

  const lit = (x: number, y: number, w: number, h: number) => {
    if (!rng.chance(style === 'glass' ? 0.55 : 0.42)) return;
    const col = rng.pick(['#ffd9a0', '#ffe8c0', '#fff4e0', '#cfe3ff', '#ffc890', '#e9f0ff']);
    ectx.fillStyle = col;
    ectx.globalAlpha = rng.range(0.55, 1);
    ectx.fillRect(x, y, w, h);
    ectx.globalAlpha = 1;
  };

  if (style === 'glass') {
    // Curtain wall: big panes with mullions and spandrel bands.
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      ctx.fillStyle = 'rgba(30,40,46,0.85)';
      ctx.fillRect(0, y + fh * 0.78, W, fh * 0.22); // spandrel
      for (let b = 0; b < bays * 2; b++) {
        const x = (b * W) / (bays * 2);
        const g = ctx.createLinearGradient(x, y, x + W / 8, y + fh);
        g.addColorStop(0, 'rgba(150,190,205,0.35)');
        g.addColorStop(1, 'rgba(30,50,60,0.15)');
        ctx.fillStyle = g;
        ctx.fillRect(x + 2, y + 2, W / 8 - 4, fh * 0.76);
        lit(x + 3, y + 3, W / 8 - 6, fh * 0.74);
      }
    }
    ctx.fillStyle = '#9aa3a8';
    for (let b = 0; b <= bays * 2; b++) ctx.fillRect((b * W) / (bays * 2) - 2, 0, 4, H);
    for (let f = 0; f <= floors; f++) ctx.fillRect(0, f * fh - 2, W, 4);
  } else if (style === 'chawl') {
    // Long open corridor (gallery) with railings, doors, laundry.
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      ctx.fillStyle = 'rgba(70,60,50,0.55)';
      ctx.fillRect(0, y + fh * 0.12, W, fh * 0.7); // shaded corridor
      for (let b = 0; b < bays; b++) {
        const x = b * bw;
        // door + window per room
        ctx.fillStyle = rng.pick(['#5b3a22', '#2f5f7a', '#6d2e2e', '#3f5d3a', '#7a5b2a']);
        ctx.fillRect(x + bw * 0.12, y + fh * 0.25, bw * 0.24, fh * 0.57);
        lit(x + bw * 0.13, y + fh * 0.26, bw * 0.22, fh * 0.1);
        ctx.fillStyle = '#20262a';
        ctx.fillRect(x + bw * 0.5, y + fh * 0.32, bw * 0.34, fh * 0.3);
        lit(x + bw * 0.5, y + fh * 0.32, bw * 0.34, fh * 0.3);
        ctx.strokeStyle = '#4a4f52';
        ctx.lineWidth = 2;
        for (let k = 1; k < 6; k++) {
          ctx.beginPath(); ctx.moveTo(x + bw * 0.5 + (k * bw * 0.34) / 6, y + fh * 0.32);
          ctx.lineTo(x + bw * 0.5 + (k * bw * 0.34) / 6, y + fh * 0.62); ctx.stroke();
        }
      }
      // railing
      ctx.fillStyle = '#3d4447';
      ctx.fillRect(0, y + fh * 0.6, W, 4);
      for (let x = 0; x < W; x += 10) ctx.fillRect(x, y + fh * 0.6, 2, fh * 0.22);
      ctx.fillStyle = 'rgba(220,215,200,0.9)';
      ctx.fillRect(0, y + fh * 0.82, W, fh * 0.18); // slab edge
      // laundry
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = rng.pick(['#d23c3c', '#2c64b8', '#e8c33a', '#f2f2f2', '#3a9a52', '#a64ac9', '#ee8a2e']);
        ctx.fillRect(rng.range(0, W), y + fh * 0.6, rng.range(8, 22), rng.range(10, 26));
      }
    }
  } else if (style === 'settlement') {
    // Corrugated sheets, brick, blue tarps, tiny doors.
    for (let b = 0; b < bays * 2; b++) {
      const x = (b * W) / (bays * 2);
      const kind = rng.int(0, 3);
      const cols = ['#8b8f93', '#a5634a', '#2b5fa8', '#c9b48a'];
      ctx.fillStyle = cols[kind];
      ctx.fillRect(x, 0, W / 8, H);
      if (kind === 0) {
        ctx.strokeStyle = 'rgba(40,40,40,0.35)';
        for (let xx = x; xx < x + W / 8; xx += 5) { ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, H); ctx.stroke(); }
        ctx.fillStyle = 'rgba(120,60,30,0.35)';
        ctx.fillRect(x, rng.range(0, H), W / 8, rng.range(20, 80));
      } else if (kind === 1) {
        ctx.strokeStyle = 'rgba(60,30,20,0.4)';
        for (let yy = 0; yy < H; yy += 9) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + W / 8, yy); ctx.stroke(); }
      }
    }
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const x = b * bw + rng.range(10, 40), y = f * fh + fh * 0.3;
        ctx.fillStyle = rng.pick(['#1c2228', '#3a2414', '#244a6b']);
        ctx.fillRect(x, y, bw * 0.3, fh * 0.45);
        lit(x + 2, y + 2, bw * 0.3 - 4, fh * 0.2);
      }
    }
  } else {
    // apartment / heritage / modern: punched windows with grills, sunshades, AC units, stains.
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      for (let b = 0; b < bays; b++) {
        const x = b * bw;
        const ww = style === 'modern' ? bw * 0.7 : bw * 0.46;
        const wh = style === 'heritage' ? fh * 0.56 : fh * 0.42;
        const wx = x + (bw - ww) / 2, wy = y + fh * 0.28;
        // window recess
        ctx.fillStyle = '#1b2228';
        if (style === 'heritage') {
          ctx.beginPath();
          ctx.moveTo(wx, wy + wh);
          ctx.lineTo(wx, wy + ww / 2);
          ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
          ctx.lineTo(wx + ww, wy + wh);
          ctx.closePath();
          ctx.fill();
        } else ctx.fillRect(wx, wy, ww, wh);
        // reflection gradient
        const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
        g.addColorStop(0, 'rgba(160,190,210,0.30)');
        g.addColorStop(0.5, 'rgba(60,80,95,0.1)');
        g.addColorStop(1, 'rgba(160,190,210,0.18)');
        ctx.fillStyle = g;
        ctx.fillRect(wx, wy, ww, wh);
        // curtains sometimes
        if (rng.chance(0.4)) {
          ctx.fillStyle = rng.pick(['rgba(200,80,60,0.55)', 'rgba(230,200,120,0.55)', 'rgba(80,120,170,0.5)', 'rgba(240,240,230,0.5)']);
          ctx.fillRect(wx + 2, wy + 2, ww * rng.range(0.2, 0.5), wh - 4);
        }
        lit(wx + 2, wy + 2, ww - 4, wh - 4);
        // grill (Indian safety grills)
        if (style !== 'modern') {
          ctx.strokeStyle = 'rgba(40,44,46,0.9)';
          ctx.lineWidth = 2;
          for (let k = 1; k < 5; k++) {
            ctx.beginPath(); ctx.moveTo(wx + (k * ww) / 5, wy); ctx.lineTo(wx + (k * ww) / 5, wy + wh); ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
          ctx.strokeRect(wx, wy, ww, wh);
        } else {
          ctx.fillStyle = '#2b2f31';
          ctx.fillRect(wx + ww / 2 - 1, wy, 3, wh);
        }
        // chajja (concrete sunshade) above window
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(wx - 6, wy - 9, ww + 12, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(wx - 6, wy - 12, ww + 12, 3);
        // stain below sill
        const sg = ctx.createLinearGradient(0, wy + wh, 0, wy + wh + fh * 0.4);
        sg.addColorStop(0, 'rgba(60,55,45,0.35)');
        sg.addColorStop(1, 'rgba(60,55,45,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(wx + rng.range(0, ww * 0.6), wy + wh, rng.range(6, 20), fh * 0.4);
        // AC outdoor unit
        if (style !== 'heritage' && rng.chance(0.35)) {
          const ax = x + (rng.chance(0.5) ? 6 : bw - 50), ay = wy + wh + 6;
          ctx.fillStyle = '#e9e9e4';
          ctx.fillRect(ax, ay, 44, 28);
          ctx.fillStyle = '#9a9c98';
          ctx.beginPath(); ctx.arc(ax + 26, ay + 14, 10, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(ax, ay, 44, 28);
        }
      }
      // floor band
      ctx.fillStyle = style === 'heritage' ? 'rgba(160,140,110,0.6)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, y + fh - 6, W, 6);
    }
    // monsoon streaks and grime from top
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, W);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(50,48,40,0.25)');
      g.addColorStop(1, 'rgba(50,48,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, rng.range(0, H * 0.5), rng.range(2, 6), rng.range(40, 260));
    }
    // peeling paint patches
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(150,140,120,0.35)';
      ctx.beginPath();
      ctx.ellipse(rng.range(0, W), rng.range(0, H), rng.range(6, 26), rng.range(4, 16), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const map = toTexture(c);
  const emissive = toTexture(e);
  return { map, emissive };
}

/** Rolling shutter + shop ground floor tile (one shop bay 4 m x 3.6 m). */
export function shopfrontTexture(seed = 2) {
  return canvasTexture(256, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = '#6e6f6c';
    ctx.fillRect(0, 0, w, h);
    // shutter slats
    for (let y = 0; y < h; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? '#8b8d8a' : '#7a7c79';
      ctx.fillRect(0, y, w, 5);
    }
    ctx.fillStyle = 'rgba(70,40,20,0.35)';
    for (let i = 0; i < 20; i++) ctx.fillRect(rng.range(0, w), rng.range(0, h), rng.range(2, 30), rng.range(2, 6));
    ctx.fillStyle = '#3a3c3b';
    ctx.fillRect(0, h - 14, w, 14);
  }, seed);
}

// ---------------------------------------------------------------- signage atlas
export interface SignCell { u0: number; v0: number; u1: number; v1: number }

const SIGN_COLS = 4;
const SIGN_ROWS = 32;

/** Shop signboards (English + Devanagari). Common generic Indian shop names, no trademarks. */
export const GENERIC_SHOP_NAMES: [string, string][] = [
  ['Laxmi General Stores', 'लक्ष्मी जनरल स्टोर्स'], ['Sai Krupa Medical', 'साई कृपा मेडिकल'], ['Royal Tailors', 'रॉयल टेलर्स'],
  ['Hotel Sai Sagar', 'हॉटेल साई सागर'], ['Om Sai Hardware', 'ओम साई हार्डवेयर'], ['Mahalaxmi Jewellers', 'महालक्ष्मी ज्वेलर्स'],
  ['New Bombay Bakery', 'न्यू बॉम्बे बेकरी'], ['Jai Ambe Sweets', 'जय अम्बे स्वीट्स'], ['Shree Krishna Xerox', 'श्री कृष्णा ज़ेरॉक्स'],
  ['Anand Opticians', 'आनंद ऑप्टिशियन्स'], ['Gurukripa Electricals', 'गुरुकृपा इलेक्ट्रिकल्स'], ['Patel Provision Stores', 'पटेल प्रोविज़न स्टोर्स'],
  ['Sagar Pan House', 'सागर पान हाउस'], ['Mumbai Mobile Repair', 'मुंबई मोबाइल रिपेयर'], ['Star Photo Studio', 'स्टार फ़ोटो स्टूडियो'],
  ['Balaji Footwear', 'बालाजी फ़ुटवियर'], ['Ganga Saree Centre', 'गंगा साड़ी सेंटर'], ['Amar Juice Centre', 'अमर ज्यूस सेंटर'],
  ['Shiv Shakti Travels', 'शिव शक्ति ट्रैवल्स'], ['Al-Noor Chicken Centre', 'अल-नूर चिकन सेंटर'], ['Kamat Snacks', 'कामत स्नैक्स'],
  ['Vijay Stationers', 'विजय स्टेशनर्स'], ['Sunrise Dry Cleaners', 'सनराइज़ ड्राई क्लीनर्स'], ['Durga Kitchenware', 'दुर्गा किचनवेयर'],
  ['Kohinoor Watch Co.', 'कोहिनूर वॉच कं.'], ['Bharat Book Depot', 'भारत बुक डिपो'], ['Neelam Beauty Parlour', 'नीलम ब्यूटी पार्लर'],
  ['Sri Venkatesh Idli House', 'श्री वेंकटेश इडली हाउस'], ['Mehta Paints', 'मेहता पेंट्स'], ['Khushi Gift Gallery', 'ख़ुशी गिफ़्ट गैलरी'],
  ['Fresh Dairy Farm', 'फ़्रेश डेयरी फ़ार्म'], ['Ajanta Cycle Mart', 'अजंता साइकिल मार्ट'], ['Universal Computers', 'यूनिवर्सल कंप्यूटर्स'],
  ['Gupta Sweet Mart', 'गुप्ता स्वीट मार्ट'], ['Deepak Lodge', 'दीपक लॉज'], ['Hari Om Restaurant', 'हरि ओम रेस्टोरेंट'],
  ['Shree Datta Medical', 'श्री दत्त मेडिकल'], ['Taj Biryani House', 'ताज बिरयानी हाउस'], ['City Dental Clinic', 'सिटी डेंटल क्लिनिक'],
  ['Sapna Tailoring Classes', 'सपना टेलरिंग क्लासेज़'], ['Prabhat Electronics', 'प्रभात इलेक्ट्रॉनिक्स'], ['Om Namkeen', 'ओम नमकीन'],
];

const SIGN_STYLES = [
  ['#c8102e', '#ffffff'], ['#0a3d8f', '#ffd400'], ['#ffd400', '#b00000'], ['#1d6b2f', '#ffffff'], ['#ffffff', '#c41e3a'],
  ['#ff6f00', '#ffffff'], ['#5b1a8c', '#ffe066'], ['#111111', '#ffcc00'], ['#e6f2ff', '#0b3d91'], ['#8b0000', '#ffe4b5'],
];

/**
 * Texture atlas of shop signs / billboards. Identical signs share a cell (cached by text),
 * so the atlas never overflows into previously drawn signs.
 */
export class SignAtlas {
  texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private next = 0;
  private cw: number;
  private ch: number;
  private cache = new Map<string, SignCell>();
  private w: number;
  private h: number;

  constructor(w = 1024, h = 4096) {
    const c = makeCanvas(w, h);
    this.w = w; this.h = h;
    this.ctx = c.getContext('2d')!;
    this.ctx.fillStyle = '#777';
    this.ctx.fillRect(0, 0, w, h);
    this.cw = w / SIGN_COLS;
    this.ch = h / SIGN_ROWS;
    this.texture = toTexture(c);
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  /** Draw a sign (or reuse an identical one) and return its UV cell. */
  add(title: string, sub: string, styleIdx: number, _opts: { lit?: boolean } = {}): SignCell {
    const key = `${title}|${sub}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.next >= SIGN_COLS * SIGN_ROWS) {
      console.warn('[SignAtlas] full, reusing first cell for', title);
      return this.cache.values().next().value!;
    }
    const idx = this.next++;
    const col = idx % SIGN_COLS, row = Math.floor(idx / SIGN_COLS);
    const x = col * this.cw, y = row * this.ch, w = this.cw, h = this.ch;
    const [bg, fg] = SIGN_STYLES[styleIdx % SIGN_STYLES.length];
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, bg);
    g.addColorStop(1, shade(bg, -25));
    ctx.fillStyle = g;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = shade(fg, -10);
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, title.toUpperCase(), x + w / 2, y + h * 0.38, w - 20, h * 0.42, '800', 'Arial Black, Impact, sans-serif');
    fitText(ctx, sub, x + w / 2, y + h * 0.76, w - 24, h * 0.28, '700', '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif');
    ctx.fillStyle = 'rgba(40,30,20,0.14)';
    ctx.fillRect(x + 1, y + h * 0.8, w - 2, h * 0.2);
    ctx.restore();
    this.texture.needsUpdate = true;
    const cell = { u0: (x + 1) / this.w, u1: (x + w - 1) / this.w, v0: 1 - (y + h - 1) / this.h, v1: 1 - (y + 1) / this.h };
    this.cache.set(key, cell);
    return cell;
  }
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, maxH: number, weight: string, family: string) {
  let size = Math.floor(maxH);
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 8 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

export function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const f = 1 + amt / 100;
  return `rgb(${Math.min(255, c.r * 255 * f) | 0},${Math.min(255, c.g * 255 * f) | 0},${Math.min(255, c.b * 255 * f) | 0})`;
}

/** Simple text panel texture (station boards, road signs, number plates). */
export function textPanel(lines: { text: string; color: string; size: number; font?: string; weight?: string }[], bg: string, w = 512, h = 128, border?: string) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(3, h * 0.04);
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    }
    const total = lines.reduce((s, l) => s + l.size, 0);
    let y = (h - total * h) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of lines) {
      const lh = l.size * h;
      ctx.fillStyle = l.color;
      fitText(ctx, l.text, w / 2, y + lh / 2, w * 0.92, lh * 0.82, l.weight ?? '700', l.font ?? 'Arial, sans-serif');
      y += lh;
    }
  }, 1);
}

/** Indian registration plate texture, e.g. "MH 02 AB 1234". */
export function plateTexture(text: string, kind: 'private' | 'commercial' | 'electric') {
  const bg = kind === 'commercial' ? '#f7d117' : kind === 'electric' ? '#1f8a3b' : '#f5f5f2';
  const fg = kind === 'electric' ? (text.length ? '#ffffff' : '#fff') : '#111111';
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#1b3fa0';
    ctx.fillRect(6, 6, 22, h - 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('IND', 17, h - 14);
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    fitText(ctx, text, w / 2 + 12, h / 2 + 2, w - 46, h * 0.7, '800', '"Arial Narrow", Arial, sans-serif');
  }, 3);
}

/** Leaf-cluster card texture (alpha-tested) for trees. */
export function leafTexture(seed = 4, flowers = false) {
  const t = canvasTexture(256, 256, (ctx, w, h, rng) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * w * 0.46;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.9;
      const flower = flowers && rng.chance(0.35);
      const g = flower ? 150 + rng.int(0, 60) : 80 + rng.int(0, 90);
      ctx.fillStyle = flower ? `rgb(${210 + rng.int(0, 40)},${60 + rng.int(0, 40)},${30})` : `rgb(${Math.floor(g * 0.55)},${g},${Math.floor(g * 0.35)})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng.range(0, Math.PI * 2));
      ctx.beginPath();
      ctx.ellipse(0, 0, rng.range(5, 11), rng.range(2.5, 5), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, seed);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// =============================================================================================
// High-detail PBR-style procedural textures (v2). Drawn at load time; original work, no licences.

function grainField(S: number, rng: Rng, scales: [number, number][]) {
  const out = new Float32Array(S * S);
  let total = 0;
  for (const [cell, w] of scales) {
    const n = valueNoise(S, S, cell, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * w;
    total += w;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Painted plaster (near-white so vertex colour can tint it): repaint patches, grain, hairline cracks. */
export function plasterSet(seed = 31, age = 0.5) {
  const S = 1024;
  const rng = makeRng(seed);
  const low = grainField(S, rng, [[256, 1], [128, 0.6]]);
  const mid = grainField(S, rng, [[32, 1], [16, 0.7]]);
  const fine = grainField(S, rng, [[4, 1], [2, 0.8]]);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const height = new Float32Array(S * S);
  const rough = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const patch = smooth(0.45, 0.62, low[i]);
    const dirt = smooth(0.5, 0.85, mid[i] * 0.6 + low[i] * 0.4) * age;
    let v = 226 - patch * 14 - dirt * 46 + (fine[i] - 0.5) * 22;
    const warm = patch * 6;
    img.data[i * 4] = v + warm; img.data[i * 4 + 1] = v + warm * 0.6; img.data[i * 4 + 2] = v - 4 - dirt * 8; img.data[i * 4 + 3] = 255;
    height[i] = fine[i] * 0.6 + mid[i] * 0.4;
    const r = 215 + (fine[i] - 0.5) * 50 - patch * 20;
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // hairline cracks
  ctx.strokeStyle = 'rgba(60,55,48,0.45)';
  for (let k = 0; k < 14 * (0.5 + age); k++) {
    ctx.lineWidth = rng.range(0.5, 1.3);
    let x = rng.range(0, S), y = rng.range(0, S);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 16; j++) { x += rng.range(-10, 10); y += rng.range(-3, 14); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // exposed brick/concrete where plaster fell off
  for (let k = 0; k < Math.floor(age * 1.5); k++) {
    const x = rng.range(0, S - 200), y = rng.range(0, S - 120), w = rng.range(90, 200), h = rng.range(40, 110);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, rng.range(0, 1), 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(160,135,115,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90,75,62,0.35)';
    ctx.lineWidth = 1.5;
    for (let by = y; by < y + h; by += 9) { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + w, by); ctx.stroke(); }
    ctx.restore();
  }
  const rc = makeCanvas(S, S);
  rc.getContext('2d')!.putImageData(new ImageData(rough, S, S), 0, 0);
  return { map: toTexture(c), normal: normalFromHeight(height, S, S, 1.6), rough: toTexture(rc, false) };
}

const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Monsoon mould / water streak decal (alpha) — drips from sills, chajjas and parapets. */
export function streakTexture(seed = 41) {
  const W = 256, H = 512;
  const rng = makeRng(seed);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const n = fbm(W, H, rng, 32, 4);
  const img = ctx.createImageData(W, H);
  // columns of streaks with varying length
  const cols = new Float32Array(W);
  let v = rng.next();
  for (let x = 0; x < W; x++) { v = v * 0.92 + rng.next() * 0.08; cols[x] = 0.25 + v * 0.75 * (0.6 + 0.4 * Math.sin(x * 0.11 + rng.next())); }
  for (let y = 0; y < H; y++) {
    const ty = y / H;
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, W - 1 - x) / (W * 0.12);
      const len = cols[x];
      let a = (1 - smooth(len * 0.4, len, ty)) * Math.min(1, edge) * (0.55 + 0.45 * n[y * W + x]);
      a *= 0.85;
      const i = (y * W + x) * 4;
      img.data[i] = 34 + n[y * W + x] * 20; img.data[i + 1] = 38 + n[y * W + x] * 18; img.data[i + 2] = 30; img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Dark aggregate asphalt (v2): binder, chippings, tar-sealed cracks, roughness. */
export function asphaltSet2(seed = 7) {
  const S = 1024;
  const rng = makeRng(seed);
  const low = grainField(S, rng, [[256, 1], [96, 0.5]]);
  const chip = grainField(S, rng, [[3, 1], [2, 0.7]]);
  const mid = grainField(S, rng, [[12, 1], [6, 0.6]]);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const height = new Float32Array(S * S);
  const rough = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const stone = smooth(0.55, 0.75, chip[i] * 0.7 + mid[i] * 0.3);
    let b = 24 + low[i] * 12 + stone * 26 + (mid[i] - 0.5) * 8;
    const tint = stone * 4;
    img.data[i * 4] = b + tint; img.data[i * 4 + 1] = b + tint * 0.6; img.data[i * 4 + 2] = b + 2; img.data[i * 4 + 3] = 255;
    height[i] = stone * 0.8 + mid[i] * 0.2;
    const r = 228 - stone * 40 + (low[i] - 0.5) * 30;
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // tar-sealed crack lines
  ctx.strokeStyle = 'rgba(8,8,8,0.7)';
  for (let k = 0; k < 9; k++) {
    ctx.lineWidth = rng.range(2, 5);
    let x = rng.range(0, S), y = rng.range(0, S);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 20; j++) { x += rng.range(-22, 22); y += rng.range(-22, 22); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const rc = makeCanvas(S, S);
  rc.getContext('2d')!.putImageData(new ImageData(rough, S, S), 0, 0);
  return { map: toTexture(c), normal: normalFromHeight(height, S, S, 1.4), rough: toTexture(rc, false) };
}

/** Generic alpha decal: soft-edged irregular blob (patches, oil, dirt). */
export function blobDecal(seed: number, color: [number, number, number], hardness = 0.5) {
  const S = 256;
  const rng = makeRng(seed);
  const n = fbm(S, S, rng, 32, 5);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x / S - 0.5) * 2, dy = (y / S - 0.5) * 2;
    const r = Math.sqrt(dx * dx + dy * dy) + (n[y * S + x] - 0.5) * 0.7;
    const a = 1 - smooth(0.55 * hardness + 0.25, 0.95, r);
    const i = (y * S + x) * 4;
    const k = 0.8 + n[y * S + x] * 0.4;
    img.data[i] = color[0] * k; img.data[i + 1] = color[1] * k; img.data[i + 2] = color[2] * k; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Worn road paint mask: white paint with abrasion holes (alpha). */
export function wornPaintTexture(seed = 13) {
  const W = 64, H = 512;
  const rng = makeRng(seed);
  const n = fbm(W, H, rng, 16, 4);
  const f = fbm(W, H, rng, 2, 2);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const a = smooth(0.3, 0.5, n[i] * 0.7 + f[i] * 0.3);
    img.data[i * 4] = 236; img.data[i * 4 + 1] = 234; img.data[i * 4 + 2] = 226; img.data[i * 4 + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Tree bark (vertical fibres). */
export function barkSet(seed = 17) {
  const W = 256, H = 512;
  const rng = makeRng(seed);
  const n = fbm(W, H, rng, 32, 5);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const height = new Float32Array(W * H);
  const cols = new Float32Array(W);
  for (let x = 0; x < W; x++) cols[x] = rng.next();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = (x + Math.sin(y * 0.03 + cols[(x >> 3) % W] * 6) * 6 + W) % W;
    const ridge = Math.abs(Math.sin((fx / W) * Math.PI * 18 + n[y * W + x] * 3));
    const hgt = ridge * 0.7 + n[y * W + x] * 0.3;
    const v = 52 + hgt * 60;
    const i = (y * W + x) * 4;
    img.data[i] = v * 0.95; img.data[i + 1] = v * 0.85; img.data[i + 2] = v * 0.72; img.data[i + 3] = 255;
    height[y * W + x] = hgt;
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normal: normalFromHeight(height, W, H, 3) };
}

/** Realistic leaf spray card: many narrow leaves on twigs, with colour variation and dark edges. */
export function leafCard(seed = 4, palette: 'green' | 'gulmohar' | 'palm' = 'green') {
  const S = 512;
  const t = canvasTexture(S, S, (ctx, w, h, rng) => {
    ctx.clearRect(0, 0, w, h);
    // dense inner mass first (fills gaps between twigs)
    for (let i = 0; i < 260; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * w * 0.3;
      const k = rng.range(0.55, 1.0);
      const g = (palette === 'palm' ? 120 : 92) * k;
      ctx.fillStyle = `rgb(${g * 0.55 | 0},${g | 0},${g * 0.3 | 0})`;
      ctx.save(); ctx.translate(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); ctx.rotate(rng.range(0, 6.28));
      ctx.beginPath(); ctx.ellipse(0, 0, rng.range(12, 22), rng.range(5, 9), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const twigs = 14;
    for (let tw = 0; tw < twigs; tw++) {
      const a0 = rng.range(0, Math.PI * 2);
      const len = rng.range(0.28, 0.46) * w;
      const sx = w / 2 + Math.cos(a0) * w * 0.05, sy = h / 2 + Math.sin(a0) * h * 0.05;
      const ex = sx + Math.cos(a0) * len, ey = sy + Math.sin(a0) * len;
      ctx.strokeStyle = 'rgba(70,52,36,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      const leaves = 26;
      for (let i = 0; i < leaves; i++) {
        const t = i / leaves;
        const px = sx + (ex - sx) * t, py = sy + (ey - sy) * t;
        for (const side of [-1, 1]) {
          const ang = a0 + side * rng.range(0.5, 1.1);
          const L = rng.range(20, 34) * (1 - t * 0.3), Wd = L * rng.range(0.32, 0.45);
          let g: number, r: number, b: number;
          if (palette === 'gulmohar' && rng.chance(0.3)) { r = 200 + rng.int(0, 45); g = 50 + rng.int(0, 50); b = 25; }
          else { const k = rng.range(0.6, 1.15); g = (palette === 'palm' ? 120 : 98) * k; r = g * rng.range(0.48, 0.66); b = g * rng.range(0.25, 0.4); }
          ctx.save();
          ctx.translate(px + Math.cos(ang) * L * 0.5, py + Math.sin(ang) * L * 0.5);
          ctx.rotate(ang);
          const grad = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
          grad.addColorStop(0, `rgb(${r * 0.7 | 0},${g * 0.7 | 0},${b * 0.7 | 0})`);
          grad.addColorStop(0.5, `rgb(${r | 0},${g | 0},${b | 0})`);
          grad.addColorStop(1, `rgb(${r * 0.85 | 0},${g * 0.9 | 0},${b * 0.8 | 0})`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(0, 0, L / 2, Wd / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(30,40,20,0.35)';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
          ctx.restore();
        }
      }
    }
  }, seed);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Corrugated rolling shutter: ribs, rust runs, faded paint, posters. */
export function shutterTexture2(seed = 5) {
  return canvasTexture(512, 512, (ctx, w, h, rng) => {
    const base = rng.pick(['#7d8486', '#6b7a83', '#8a8f86', '#5d6b74']);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) {
      const g = ctx.createLinearGradient(0, y, 0, y + 10);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, 10);
    }
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, w);
      const g = ctx.createLinearGradient(0, rng.range(0, h * 0.5), 0, h);
      g.addColorStop(0, 'rgba(120,60,25,0)');
      g.addColorStop(1, `rgba(120,60,25,${rng.range(0.2, 0.55)})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, rng.range(2, 10), h);
    }
    // pasted posters / graffiti
    for (let i = 0; i < 2; i++) {
      if (!rng.chance(0.6)) continue;
      ctx.fillStyle = rng.pick(['#e8d9b0', '#f2f2f2', '#f6d34a', '#e85d4a']);
      const x = rng.range(20, w - 140), y = rng.range(80, h - 160);
      ctx.fillRect(x, y, rng.range(80, 130), rng.range(100, 150));
      ctx.fillStyle = 'rgba(40,40,40,0.7)';
      for (let k = 0; k < 6; k++) ctx.fillRect(x + 8, y + 12 + k * 16, rng.range(40, 100), 6);
    }
    ctx.fillStyle = 'rgba(30,25,20,0.45)';
    ctx.fillRect(0, h - 26, w, 26);
  }, seed);
}

/** Drain grate / manhole cover texture. */
export function grateTexture(kind: 'grate' | 'manhole') {
  return canvasTexture(128, 128, (ctx, w, h, rng) => {
    ctx.fillStyle = '#2e2c29';
    ctx.fillRect(0, 0, w, h);
    if (kind === 'grate') {
      ctx.fillStyle = '#0c0c0c';
      for (let x = 8; x < w - 8; x += 12) ctx.fillRect(x, 8, 6, h - 16);
    } else {
      ctx.strokeStyle = '#4a463f';
      ctx.lineWidth = 4;
      for (let r = 12; r < 60; r += 12) { ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.stroke(); }
      for (let a = 0; a < 8; a++) { ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a * 0.785) * 60, 64 + Math.sin(a * 0.785) * 60); ctx.stroke(); }
    }
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(${90 + rng.int(0, 60)},${50 + rng.int(0, 30)},20,0.15)`; ctx.fillRect(rng.range(0, w), rng.range(0, h), 2, 2); }
  }, kind === 'grate' ? 1 : 2);
}

/** Woven tarpaulin / cloth texture (tinted via vertex colour). */
export function clothTexture(seed = 3) {
  return canvasTexture(256, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < w; i += 3) ctx.fillRect(i, 0, 1, h);
    for (let i = 0; i < h; i += 3) ctx.fillRect(0, i, w, 1);
    for (let i = 0; i < 14; i++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(60,50,40,0.18)');
      g.addColorStop(1, 'rgba(60,50,40,0)');
      ctx.save(); ctx.translate(rng.range(0, w), rng.range(0, h)); ctx.scale(rng.range(20, 60), rng.range(10, 40));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }, seed);
}

/** Coconut palm frond: central rib with many narrow leaflets (alpha). UV v runs along the frond. */
export function frondTexture(seed = 9) {
  const t = canvasTexture(256, 512, (ctx, w, h, rng) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#7d7a3e';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, 0); ctx.stroke();
    for (let y = h - 10; y > 6; y -= 7) {
      const t = 1 - y / h;
      const len = (w / 2 - 6) * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95));
      for (const side of [-1, 1]) {
        const g = 95 + rng.int(0, 50);
        ctx.strokeStyle = `rgb(${g * 0.6 | 0},${g},${g * 0.32 | 0})`;
        ctx.lineWidth = rng.range(3, 5);
        ctx.beginPath();
        ctx.moveTo(w / 2, y);
        ctx.quadraticCurveTo(w / 2 + side * len * 0.5, y - 10, w / 2 + side * len, y - 26 - rng.range(0, 10));
        ctx.stroke();
      }
    }
  }, seed);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Packaging labels atlas (8x8 cells): soap boxes, biscuit packs, bottles, detergent... (generic, unbranded). */
export const PACK_CELLS = 8;
export function packagingAtlas(seed = 77) {
  const S = 512, cs = S / PACK_CELLS;
  const t = canvasTexture(S, S, (ctx, w, h, rng) => {
    const bgs = ['#c62828', '#f9a825', '#1565c0', '#2e7d32', '#ef6c00', '#fafafa', '#6a1b9a', '#00838f', '#d81b60', '#4e342e', '#212121', '#ffeb3b'];
    for (let i = 0; i < PACK_CELLS; i++) for (let j = 0; j < PACK_CELLS; j++) {
      const x = i * cs, y = j * cs;
      const bg = rng.pick(bgs);
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, cs, cs);
      ctx.fillStyle = rng.pick(['#ffffff', '#fff3c4', '#ffe082', '#e3f2fd']);
      ctx.fillRect(x, y + cs * rng.range(0.3, 0.5), cs, cs * rng.range(0.15, 0.3));
      ctx.fillStyle = rng.pick(['#d32f2f', '#1976d2', '#388e3c', '#fbc02d', '#ffffff']);
      ctx.beginPath(); ctx.arc(x + cs * rng.range(0.3, 0.7), y + cs * rng.range(0.2, 0.3), cs * rng.range(0.1, 0.18), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(20,20,20,0.75)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + cs * 0.15, y + cs * (0.62 + k * 0.1), cs * rng.range(0.3, 0.7), cs * 0.04);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
    }
  }, seed);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
