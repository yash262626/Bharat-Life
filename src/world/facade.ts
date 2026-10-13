// Geometric facade generator for Mumbai-style buildings.
// Openings are real recesses (piers/spandrels/lintels), with frames, glass, curtains, box grills,
// chajjas (sunshades), AC units, drain pipes, balconies, chawl galleries and monsoon streak decals.
import * as THREE from 'three';
import { Frame } from './Frame';
import { Rng } from '../core/math';

export type FacadeKind = 'apartment' | 'chawl' | 'heritage' | 'modern' | 'glass';

export interface FacadeOpts {
  width: number; // along local x, centred on 0
  y0: number; // bottom of the facade (top of ground floor)
  floors: number;
  floorH: number;
  kind: FacadeKind;
  tint: THREE.Color;
  rng: Rng;
  /** wall material key: 'plaster' (newer) or 'plaster_old' (weathered) */
  wall: string;
}

const FRAME_COLS = ['#d9d4c8', '#5a4632', '#2f3b3f', '#7c8a8f', '#e6e3dc', '#3d5a4c'];
const CURTAINS = ['#b8402f', '#d9b25c', '#4c6c94', '#e8e1d0', '#7a3e6d', '#3e7a5a', '#c76a2b'];
const CLOTHES = ['#c0392b', '#2c64b8', '#e8c33a', '#f2f2f2', '#3a9a52', '#a64ac9', '#ee8a2e', '#111827', '#f472b6', '#14b8a6'];

/** Inset of the building core behind the facade plane for each kind. */
export const FACADE_INSET: Record<FacadeKind, number> = { apartment: 0.3, chawl: 1.5, heritage: 0.35, modern: 0.3, glass: 0.25 };

export function buildFacade(F: Frame, o: FacadeOpts) {
  switch (o.kind) {
    case 'chawl': return chawlFacade(F, o);
    case 'glass': return glassFacade(F, o);
    default: return punchedFacade(F, o);
  }
}

function strip(F: Frame, key: string, x0: number, x1: number, y0: number, y1: number, depth: number, color: THREE.Color, tile = 2.5) {
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
  F.box(key, (x0 + x1) / 2, y0, -depth / 2, x1 - x0, y1 - y0, depth, { color, tile });
}

/** Decal quad in front of the wall (local +z), top edge at yTop. */
export function streak(F: Frame, x: number, yTop: number, z: number, w: number, h: number, alpha = 1) {
  const g = new THREE.PlaneGeometry(w, h);
  F.geo('grime', g, x, yTop - h / 2, z, 0, new THREE.Color(alpha, alpha, alpha));
}

function window_(F: Frame, o: FacadeOpts, cx: number, sillY: number, ow: number, oh: number, inset: number, opts: { grill: boolean; ac: boolean; chajja: boolean; arch?: boolean }) {
  const rng = o.rng;
  const frameCol = new THREE.Color(rng.pick(FRAME_COLS));
  const lit = rng.chance(0.38);
  // glass pane deep in the recess
  F.box(lit ? (rng.chance(0.7) ? 'win_lit_warm' : 'win_lit_cool') : 'win_glass', cx, sillY, -inset + 0.04, ow, oh, 0.02);
  // curtain behind the glass
  if (rng.chance(0.45)) {
    const cw = ow * rng.range(0.25, 0.55);
    F.box('cloth', cx + (rng.chance(0.5) ? -1 : 1) * (ow - cw) / 2, sillY + 0.02, -inset + 0.015, cw, oh - 0.04, 0.01, { color: rng.pick(CURTAINS) });
  }
  // frame + mullion + transom
  const t = 0.06;
  F.box('frame', cx, sillY, -inset + 0.07, ow, t, 0.06, { color: frameCol });
  F.box('frame', cx, sillY + oh - t, -inset + 0.07, ow, t, 0.06, { color: frameCol });
  F.box('frame', cx - ow / 2 + t / 2, sillY, -inset + 0.07, t, oh, 0.06, { color: frameCol });
  F.box('frame', cx + ow / 2 - t / 2, sillY, -inset + 0.07, t, oh, 0.06, { color: frameCol });
  F.box('frame', cx, sillY, -inset + 0.07, 0.04, oh, 0.05, { color: frameCol });
  if (oh > 1.3) F.box('frame', cx, sillY + oh * 0.72, -inset + 0.07, ow, 0.04, 0.05, { color: frameCol });
  // sill projecting
  F.box('plaster', cx, sillY - 0.06, 0.04, ow + 0.16, 0.06, 0.12, { color: o.tint.clone().multiplyScalar(0.92), tile: 3.6 });
  if (opts.arch) {
    // semicircular arch head with moulding
    const r = ow / 2;
    const disc = new THREE.CircleGeometry(r, 18, 0, Math.PI);
    F.geo(lit ? 'win_lit_warm' : 'win_glass', disc, cx, sillY + oh + 0.02, 0.012);
    const ring = new THREE.TorusGeometry(r + 0.08, 0.07, 6, 18, Math.PI);
    F.geo('plaster', ring, cx, sillY + oh, 0.02, 0, o.tint.clone().multiplyScalar(1.05));
    // louvred wooden shutters folded open
    for (const s of [-1, 1]) F.box('frame', cx + s * (ow / 2 + 0.28), sillY, 0.03, 0.5, oh, 0.04, { color: '#5b3b22' });
  }
  if (opts.chajja) {
    F.box('plaster', cx, sillY + oh + 0.12, 0.25, ow + 0.6, 0.08, 0.55, { color: o.tint.clone().multiplyScalar(0.95), tile: 3.6 });
    streak(F, cx, sillY + oh + 0.1, 0.006, ow + 0.5, rng.range(0.5, 1.2), 0.8);
  }
  if (opts.grill) {
    // Protruding box grill — the signature Mumbai "window box"
    const d = 0.38, bars = Math.max(4, Math.round(ow / 0.12));
    const gc = new THREE.Color(rng.pick(['#2d3436', '#3b4a52', '#6b6b6b', '#1f3a5f', '#4a3424']));
    for (let i = 0; i <= bars; i++) F.box('metal', cx - ow / 2 - 0.05 + (i * (ow + 0.1)) / bars, sillY - 0.02, d, 0.018, oh + 0.04, 0.018, { color: gc });
    for (const yy of [sillY - 0.03, sillY + oh * 0.5, sillY + oh]) F.box('metal', cx, yy, d, ow + 0.12, 0.025, 0.025, { color: gc });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) F.box('metal', cx + s * (ow / 2 + 0.05), sillY - 0.02, 0.06 + k * 0.15, 0.018, oh + 0.04, 0.018, { color: gc });
    F.box('metal', cx, sillY + oh, d / 2, ow + 0.12, 0.03, d, { color: gc });
    F.box('metal', cx, sillY - 0.06, d / 2, ow + 0.12, 0.04, d, { color: gc });
    // potted plants / stored items on the grill shelf
    if (rng.chance(0.5)) {
      for (let k = 0; k < rng.int(1, 3); k++) {
        const px = cx + rng.range(-ow / 2 + 0.15, ow / 2 - 0.15);
        F.cyl('paint', px, sillY - 0.02, d / 2, 0.08, 0.16, rng.pick(['#9c4a2a', '#b5651d', '#d7d2c8']), 8, 0.1);
        F.geo('foliage', new THREE.IcosahedronGeometry(0.16, 1), px, sillY + 0.25, d / 2, 0, rng.pick(['#3f6b2a', '#4c7a31', '#58853a']), 1, 1.2, 1);
      }
    }
    streak(F, cx, sillY - 0.08, 0.006, ow + 0.2, rng.range(0.9, 2.4), 1);
  } else {
    streak(F, cx, sillY - 0.08, 0.006, ow * 0.9, rng.range(0.6, 1.8), 0.85);
  }
  if (opts.ac) {
    const ax = cx + (rng.chance(0.5) ? -1 : 1) * (ow / 2 + 0.55);
    const ay = sillY - 0.75;
    F.box('plastic', ax, ay, 0.22, 0.82, 0.58, 0.3, { color: '#e7e6e1' });
    F.geo('metal', new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), ax + 0.12, ay + 0.29, 0.38, 0, '#3a3c3d', 1, 1, 1, Math.PI / 2);
    F.box('metal', ax, ay - 0.06, 0.18, 0.86, 0.04, 0.36, { color: '#4a4d4f' });
    F.cyl('plastic', ax - 0.3, ay - 0.6, 0.12, 0.012, 0.6, '#d9d9d9', 5);
    streak(F, ax - 0.3, ay - 0.02, 0.006, 0.25, rng.range(1.0, 2.5), 1);
  }
}

function punchedFacade(F: Frame, o: FacadeOpts) {
  const rng = o.rng;
  const heritage = o.kind === 'heritage', modern = o.kind === 'modern';
  const inset = FACADE_INSET[o.kind];
  const n = Math.max(1, Math.round(o.width / (heritage ? 3.2 : modern ? 4.2 : 3.5)));
  const bw = o.width / n;
  const wall = o.wall;
  const tint = o.tint;
  const bandCol = tint.clone().multiplyScalar(heritage ? 0.82 : 0.9);
  // which bays are balconies (vertical stacks look intentional)
  const balconyBay = new Array(n).fill(false).map(() => rng.chance(modern ? 0.45 : o.kind === 'apartment' ? 0.22 : 0.15));
  const grillChance = modern ? 0.12 : heritage ? 0.1 : 0.62;
  for (let f = 0; f < o.floors; f++) {
    const y = o.y0 + f * o.floorH;
    const isBalc = (i: number) => balconyBay[i] && f < o.floors;
    const sill = 0.85;
    const oh = heritage ? 1.75 : modern ? 1.6 : 1.45;
    // openings for this floor
    const openings: { cx: number; ow: number; bottom: number; top: number; balc: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const cx = -o.width / 2 + bw * (i + 0.5);
      if (isBalc(i)) openings.push({ cx, ow: bw * 0.62, bottom: y + 0.02, top: y + 2.25, balc: true });
      else {
        const ow = bw * (modern ? 0.68 : heritage ? 0.42 : 0.5);
        openings.push({ cx, ow, bottom: y + sill, top: y + sill + oh, balc: false });
      }
    }
    // wall strips: full-width spandrel below the lowest opening bottom and lintel above highest top,
    // plus piers and per-opening spandrels/lintels.
    const minBottom = Math.min(...openings.map((p) => p.bottom));
    const maxTop = Math.max(...openings.map((p) => p.top));
    strip(F, wall, -o.width / 2, o.width / 2, y, minBottom, inset, tint);
    strip(F, wall, -o.width / 2, o.width / 2, maxTop, y + o.floorH, inset, tint);
    let x = -o.width / 2;
    for (const p of openings) {
      strip(F, wall, x, p.cx - p.ow / 2, minBottom, maxTop, inset, tint);
      strip(F, wall, p.cx - p.ow / 2, p.cx + p.ow / 2, minBottom, p.bottom, inset, tint);
      strip(F, wall, p.cx - p.ow / 2, p.cx + p.ow / 2, p.top, maxTop, inset, tint);
      x = p.cx + p.ow / 2;
    }
    strip(F, wall, x, o.width / 2, minBottom, maxTop, inset, tint);
    // floor band / cornice
    F.box(wall, 0, y + o.floorH - 0.18, 0.04, o.width + 0.08, heritage ? 0.3 : 0.16, heritage ? 0.3 : 0.12, { color: bandCol, tile: 3.6 });
    if (heritage) F.box(wall, 0, y + o.floorH - 0.32, 0.12, o.width + 0.2, 0.1, 0.3, { color: bandCol, tile: 3.6 });

    for (const p of openings) {
      if (p.balc) {
        // French door + projecting balcony slab with parapet or railing
        const ow = p.ow, dh = p.top - p.bottom;
        F.box(rng.chance(0.3) ? 'win_lit_warm' : 'win_glass', p.cx, p.bottom, -inset + 0.04, ow, dh, 0.02);
        const fc = new THREE.Color(rng.pick(FRAME_COLS));
        F.box('frame', p.cx, p.bottom, -inset + 0.07, 0.05, dh, 0.05, { color: fc });
        F.box('frame', p.cx, p.top - 0.05, -inset + 0.07, ow, 0.05, 0.05, { color: fc });
        const bd = modern ? 1.25 : 1.05;
        const slabW = Math.min(bw - 0.1, ow + 1.0);
        F.box(wall, p.cx, y - 0.02, bd / 2, slabW, 0.16, bd, { color: bandCol, tile: 3.6 });
        streak(F, p.cx, y - 0.02, bd + 0.006, slabW, rng.range(0.4, 1.0), 0.9);
        if (modern && rng.chance(0.6)) {
          F.box('win_glass', p.cx, y + 0.14, bd - 0.03, slabW, 1.0, 0.02);
          F.box('metal', p.cx, y + 1.12, bd - 0.03, slabW, 0.04, 0.05, { color: '#b9bec1' });
        } else if (rng.chance(0.55)) {
          // solid parapet balcony
          F.box(wall, p.cx, y + 0.14, bd - 0.06, slabW, 0.95, 0.12, { color: tint, tile: 3.6 });
          F.box(wall, p.cx - slabW / 2 + 0.06, y + 0.14, bd / 2, 0.12, 0.95, bd, { color: tint, tile: 3.6 });
          F.box(wall, p.cx + slabW / 2 - 0.06, y + 0.14, bd / 2, 0.12, 0.95, bd, { color: tint, tile: 3.6 });
        } else {
          const gc = new THREE.Color(heritage ? '#1e1e1e' : rng.pick(['#2d3436', '#3b4a52', '#5b3a2a']));
          const bars = Math.round(slabW / 0.13);
          for (let k = 0; k <= bars; k++) F.box('metal', p.cx - slabW / 2 + (k * slabW) / bars, y + 0.14, bd - 0.04, 0.02, 0.95, 0.02, { color: gc });
          F.box('metal', p.cx, y + 1.09, bd - 0.04, slabW, 0.05, 0.06, { color: gc });
          // full-height grill enclosure (very common)
          if (!heritage && rng.chance(0.45)) {
            for (let k = 0; k <= bars; k++) F.box('metal', p.cx - slabW / 2 + (k * slabW) / bars, y + 1.1, bd - 0.04, 0.018, o.floorH - 1.25, 0.018, { color: gc });
          }
        }
        // laundry & plants
        if (rng.chance(0.55)) {
          for (let k = 0; k < rng.int(2, 5); k++) {
            F.box('cloth', p.cx - slabW / 2 + 0.3 + k * 0.42, y + 2.0 - rng.range(0.5, 0.9), bd * 0.55, 0.36, rng.range(0.45, 0.85), 0.01, { color: rng.pick(CLOTHES) });
          }
          F.box('metal', p.cx, y + 2.0, bd * 0.55, slabW - 0.1, 0.01, 0.01, { color: '#888' });
        }
        if (rng.chance(0.5)) {
          F.cyl('paint', p.cx + slabW / 2 - 0.3, y + 0.14, bd - 0.3, 0.14, 0.3, '#9c4a2a', 8, 0.17);
          F.geo('foliage', new THREE.IcosahedronGeometry(0.28, 1), p.cx + slabW / 2 - 0.3, y + 0.6, bd - 0.3, 0, '#3f6b2a', 1, 1.3, 1);
        }
        if (rng.chance(0.3)) F.box('plastic', p.cx - slabW / 2 + 0.6, y + 0.14, bd - 0.25, 0.75, 0.55, 0.3, { color: '#e7e6e1' });
      } else {
        window_(F, o, p.cx, p.bottom, p.ow, p.top - p.bottom, inset, {
          grill: rng.chance(grillChance), ac: !heritage && rng.chance(0.28), chajja: !modern && !heritage, arch: heritage,
        });
      }
    }
    // heritage pilasters between bays
    if (heritage) for (let i = 0; i <= n; i++) F.box(wall, -o.width / 2 + i * bw, y, 0.06, 0.4, o.floorH, 0.12, { color: bandCol, tile: 3.6 });
  }
  // drain pipes running down the facade with branch connections
  const pipes = rng.int(1, Math.min(3, n));
  for (let k = 0; k < pipes; k++) {
    const px = -o.width / 2 + bw * rng.int(1, Math.max(1, n - 1)) + rng.range(-0.15, 0.15);
    const top = o.y0 + o.floors * o.floorH + 0.6;
    const pc = rng.pick(['#9aa0a0', '#5a5f61', '#c8c3b6', '#2f2f2f']);
    F.cyl('plastic', px, 0, 0.12, 0.055, top, pc, 8);
    for (let f = 0; f < o.floors; f++) F.box('plastic', px - 0.2, o.y0 + f * o.floorH + 0.6, 0.12, 0.4, 0.08, 0.08, { color: pc });
    streak(F, px, top, 0.004, 0.5, rng.range(2, 5), 0.8);
  }
  // parapet grime
  const topY = o.y0 + o.floors * o.floorH;
  for (let k = 0; k < Math.ceil(o.width / 3); k++) streak(F, -o.width / 2 + rng.range(0.5, o.width - 0.5), topY, 0.005, rng.range(1.5, 3.5), rng.range(1.2, 3.5), 0.9);
}

function chawlFacade(F: Frame, o: FacadeOpts) {
  const rng = o.rng;
  const inset = FACADE_INSET.chawl;
  const n = Math.max(2, Math.round(o.width / 3.3));
  const bw = o.width / n;
  const tint = o.tint;
  for (let f = 0; f < o.floors; f++) {
    const y = o.y0 + f * o.floorH;
    // corridor floor slab (projecting) and soffit band
    F.box(o.wall, 0, y - 0.15, -inset / 2 + 0.15, o.width, 0.18, inset + 0.3, { color: tint.clone().multiplyScalar(0.9), tile: 3.6 });
    F.box(o.wall, 0, y + o.floorH - 0.32, -inset / 2 + 0.15, o.width, 0.32, inset + 0.3, { color: tint, tile: 3.6 });
    streak(F, 0, y + 0.03, 0.156, o.width, rng.range(0.4, 1.0), 0.9);
    // inner wall with doors and small windows
    strip(F, o.wall, -o.width / 2, o.width / 2, y, y + o.floorH - 0.32, 0.25, tint.clone().multiplyScalar(0.94));
    for (let i = 0; i < n; i++) {
      const cx = -o.width / 2 + bw * (i + 0.5);
      const doorCol = rng.pick(['#5b3a22', '#2f5f7a', '#6d2e2e', '#3f5d3a', '#7a5b2a', '#3c3f8f']);
      F.box('frame', cx - bw * 0.22, y + 0.03, -inset + 0.03, 0.85, 2.05, 0.06, { color: doorCol });
      if (rng.chance(0.4)) F.box('cloth', cx - bw * 0.22, y + 1.2, -inset + 0.08, 0.85, 0.9, 0.01, { color: rng.pick(CURTAINS) }); // door curtain
      F.box(rng.chance(0.4) ? 'win_lit_warm' : 'win_glass', cx + bw * 0.2, y + 0.95, -inset + 0.02, 0.9, 0.9, 0.02);
      for (let k = 0; k < 6; k++) F.box('metal', cx + bw * 0.2 - 0.4 + k * 0.16, y + 0.95, -inset + 0.06, 0.016, 0.9, 0.016, { color: '#2d3436' });
      // name plate, buckets, shoes, tulsi pot
      if (rng.chance(0.5)) F.cyl('plastic', cx + bw * 0.38, y + 0.03, -inset + 0.4, 0.17, 0.3, rng.pick(['#1f5fbf', '#e74c3c', '#f1c40f']), 10, 0.2);
      if (rng.chance(0.3)) {
        F.box('plaster', cx + bw * 0.05, y + 0.03, -inset + 0.4, 0.35, 0.6, 0.35, { color: '#c8b28a', tile: 3.6 });
        F.geo('foliage', new THREE.IcosahedronGeometry(0.2, 1), cx + bw * 0.05, y + 0.8, -inset + 0.4, 0, '#3f6b2a');
      }
      // tube light on the corridor ceiling
      F.box('lamp_white', cx, y + o.floorH - 0.36, -inset / 2, 0.6, 0.04, 0.05);
    }
    // columns + railing
    for (let i = 0; i <= n; i++) F.box(o.wall, -o.width / 2 + i * bw, y, -0.12, 0.28, o.floorH - 0.32, 0.28, { color: tint, tile: 3.6 });
    if (f > 0 || o.y0 > 0.5) {
      const bars = Math.round(o.width / 0.14);
      for (let k = 0; k <= bars; k++) F.box('metal', -o.width / 2 + (k * o.width) / bars, y, -0.05, 0.02, 0.95, 0.02, { color: '#2f3a3d' });
      F.box('metal', 0, y + 0.95, -0.05, o.width, 0.05, 0.07, { color: '#2f3a3d' });
    }
    // laundry lines
    for (let i = 0; i < n; i++) {
      if (!rng.chance(0.6)) continue;
      const cx = -o.width / 2 + bw * (i + 0.5);
      F.box('metal', cx, y + 2.15, -0.35, bw - 0.3, 0.01, 0.01, { color: '#777' });
      for (let k = 0; k < rng.int(2, 6); k++) F.box('cloth', cx - bw / 2 + 0.35 + k * 0.45, y + 2.15 - rng.range(0.4, 0.9), -0.35, 0.38, rng.range(0.4, 0.9), 0.01, { color: rng.pick(CLOTHES) });
    }
  }
  const topY = o.y0 + o.floors * o.floorH;
  for (let k = 0; k < Math.ceil(o.width / 4); k++) streak(F, -o.width / 2 + rng.range(0.5, o.width - 0.5), topY, 0.157, rng.range(1.5, 3.5), rng.range(1.5, 4), 1);
}

function glassFacade(F: Frame, o: FacadeOpts) {
  const inset = FACADE_INSET.glass;
  const mull = 1.5;
  const n = Math.max(1, Math.round(o.width / mull));
  const spandrel = new THREE.Color('#2b3338');
  for (let f = 0; f < o.floors; f++) {
    const y = o.y0 + f * o.floorH;
    F.box('frame', 0, y, -inset / 2, o.width, 0.85, inset, { color: spandrel });
    F.box(o.rng.chance(0.3) ? 'win_lit_cool' : 'win_glass_tower', 0, y + 0.85, -0.12, o.width, o.floorH - 0.85, 0.02);
    F.box('metal', 0, y + 0.85, 0.02, o.width, 0.06, 0.12, { color: '#aeb6ba' });
  }
  for (let i = 0; i <= n; i++) F.box('metal', -o.width / 2 + (i * o.width) / n, o.y0, 0.02, 0.07, o.floors * o.floorH, 0.14, { color: '#aeb6ba' });
}
