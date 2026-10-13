// Building generators: generic Mumbai-style mid-rises, chawls, towers, shopfronts and street stalls.
import * as THREE from 'three';
import { BuildContext, C } from './BuildContext';
import { Frame } from './Frame';
import { Rect, rect, Arm, Zone } from './layout';
import { FacadeStyle, GENERIC_SHOP_NAMES, SignCell } from './textures';
import { buildFacade, FacadeKind, FACADE_INSET, streak } from './facade';
import { cable } from './props';
import { ShopDef } from '../config/shops';

export const FLOOR_H = 3.1;
export const GROUND_SHOP_H = 3.8;
export const KERB_H = 0.15;


const AWNING_COLORS = ['#1f5fbf', '#2f8f46', '#d9531e', '#c62d2d', '#e0b51c', '#7b3fa0', '#1c8c8c'];

export interface BuildingOpts {
  floors: number;
  style: FacadeStyle;
  tint: string;
  front: Arm | null;
  shops: boolean;
  zone: Zone;
  billboard?: boolean;
  /** Full geometric facade (street-facing buildings). false = cheap textured box (block interiors). */
  detail?: boolean;
}

const KIND_OF: Partial<Record<FacadeStyle, FacadeKind>> = { apartment: 'apartment', chawl: 'chawl', heritage: 'heritage', modern: 'modern', glass: 'glass' };

/** Generic building filling rect r. Frontage (shops, balconies) faces `front`. */
export function genericBuilding(ctx: BuildContext, r: Rect, o: BuildingOpts) {
  const rng = ctx.rng;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const base = KERB_H;
  const front = o.front ?? 'S';
  const along = front === 'N' || front === 'S' ? w : d;
  const deep = front === 'N' || front === 'S' ? d : w;
  const fx = front === 'E' ? r.x1 : front === 'W' ? r.x0 : cx;
  const fz = front === 'S' ? r.z1 : front === 'N' ? r.z0 : cz;
  const F = Frame.facing(ctx, fx, base, fz, front);
  const tint = C(o.tint);
  const kind = KIND_OF[o.style];
  const detail = o.detail !== false && kind !== undefined;
  const floorH = kind === 'heritage' ? 3.6 : FLOOR_H;
  const groundH = o.shops ? GROUND_SHOP_H : 0;
  const upperH = o.floors * floorH;
  const top = groundH + upperH;
  const wall = rng.chance(0.55) ? 'plaster_old' : 'plaster';

  if (!detail) {
    // Cheap textured block (seen from distance / above): old facade textures, darker & dirtier.
    const variant = rng.chance(0.5) ? '' : '_b';
    F.box(`facade_${o.style}${variant}`, 0, 0, -deep / 2, along, top, deep, { color: tint.clone().multiplyScalar(0.9), tile: 14, tileV: 9.3, faces: { py: false, ny: false } });
    F.collider(-along / 2, -deep, along / 2, 0, 0, top + 1);
    roof(ctx, F, along, deep, top, tint, wall, o.style === 'glass');
    return top;
  }

  const inset = FACADE_INSET[kind!];
  // Building core behind the facade plane (upper floors).
  F.box(wall, 0, groundH, -inset - (deep - inset) / 2, along, upperH, deep - inset, { color: tint, tile: 3.6, faces: { py: false, ny: false } });
  F.collider(-along / 2, -deep, along / 2, -inset + 0.05, groundH, top + 1);
  buildFacade(F, { width: along, y0: groundH, floors: o.floors, floorH, kind: kind!, tint, rng, wall });

  // Side walls get pipes + grime (frames on each side, facing outwards).
  for (const side of [-1, 1]) {
    const S = new Frame(ctx, F.world(side * along / 2, 0, -deep / 2).x, base, F.world(side * along / 2, 0, -deep / 2).z, F.a + side * Math.PI / 2);
    const pipes = rng.int(0, 2);
    for (let k = 0; k < pipes; k++) S.cyl('plastic', rng.range(-deep / 2 + 1, deep / 2 - 1), 0, 0.1, 0.055, top + 0.5, rng.pick(['#9aa0a0', '#5a5f61', '#2f2f2f']), 8);
    for (let k = 0; k < Math.ceil(deep / 4); k++) streak(S, rng.range(-deep / 2 + 0.5, deep / 2 - 0.5), top, 0.005, rng.range(1.5, 4), rng.range(2, 6), 0.9);
    // a few small side windows
    for (let f = 0; f < o.floors; f++) {
      if (!rng.chance(0.4)) continue;
      const wx = rng.range(-deep / 2 + 1.5, deep / 2 - 1.5 - inset);
      S.box('win_glass', wx, groundH + f * floorH + 1.1, 0.01, 0.7, 0.9, 0.02);
      S.box('frame', wx, groundH + f * floorH + 1.05, 0.02, 0.8, 0.05, 0.04, { color: '#555' });
    }
  }

  if (o.shops) groundFloorShops(ctx, F, along, deep, tint, wall);
  else if (groundH === 0 && o.floors > 0) {
    // ground-floor plinth/skirting so the facade meets the footpath convincingly
    F.box('concrete_dark', 0, 0, 0.02, along, 0.45, 0.08);
  }
  // cable bundle along the facade above the shops (classic Mumbai street look)
  if (o.shops && rng.chance(0.85)) {
    const y = groundH + 0.35;
    const a = new THREE.Vector3(...xyz(F, -along / 2, y, 0.25)), b = new THREE.Vector3(...xyz(F, along / 2, y, 0.25));
    cable(ctx, a, b, 0.25, 0.05, '#151515');
    cable(ctx, a.clone().setY(a.y - 0.15), b.clone().setY(b.y - 0.12), 0.35, 0.02, '#262626');
  }
  roof(ctx, F, along, deep, top, tint, wall, o.style === 'glass');
  if (o.billboard) billboard(ctx, F, 0, top + 1, -1.2, Math.min(12, along - 2));
  return top;
}

function xyz(F: Frame, lx: number, ly: number, lz: number): [number, number, number] {
  const p = F.world(lx, ly, lz);
  return [p.x, p.y, p.z];
}

function roof(ctx: BuildContext, F: Frame, along: number, deep: number, top: number, tint: THREE.Color, wall: string, glass: boolean) {
  const rng = ctx.rng;
  F.box('concrete_dark', 0, top, -deep / 2, along, 0.2, deep, { tile: 4 });
  for (const [lx, lz, w, d] of [[0, -0.1, along, 0.2], [0, -deep + 0.1, along, 0.2], [-along / 2 + 0.1, -deep / 2, 0.2, deep], [along / 2 - 0.1, -deep / 2, 0.2, deep]] as const) {
    F.box(wall, lx, top, lz, w, 1.0, d, { color: tint, tile: 3.6 });
  }
  if (glass) { F.box('metal', 0, top + 0.2, -deep / 2, along * 0.5, 2.6, deep * 0.4, { color: '#8a9399' }); return; }
  const mx = rng.range(-along / 2 + 2.5, along / 2 - 2.5), mz = -deep * rng.range(0.4, 0.7);
  F.box(wall, mx, top, mz, 3.2, 2.7, 3.4, { color: tint.clone().multiplyScalar(0.95), tile: 3.6 });
  F.box('frame', mx, top + 0.2, mz + 1.71, 0.9, 2.0, 0.04, { color: '#4a4a4a' });
  // Sintex-style ribbed black water tanks on a steel stand
  const tanks = rng.int(1, 3);
  for (let t = 0; t < tanks; t++) {
    const tx = mx + (t - (tanks - 1) / 2) * 1.6, ty = top + 2.7;
    F.cyl('plastic', tx, ty, mz, 0.7, 1.25, '#141414', 20);
    for (let k = 1; k < 4; k++) F.geo('plastic', new THREE.TorusGeometry(0.71, 0.025, 4, 24), tx, ty + k * 0.3, mz, 0, '#1d1d1d', 1, 1, 1, Math.PI / 2);
    F.geo('plastic', new THREE.SphereGeometry(0.7, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), tx, ty + 1.25, mz, 0, '#141414', 1, 0.25, 1);
  }
  if (rng.chance(0.45)) F.box('cloth', rng.range(-along / 3, along / 3), top + 0.25, -deep * 0.3, rng.range(3, 5), 0.04, rng.range(2, 4), { color: rng.pick(['#1f5fbf', '#2a6fd6', '#d9822b']), rx: rng.range(-0.08, 0.08) });
  if (rng.chance(0.5)) {
    F.cyl('metal', along / 2 - 1.5, top + 0.2, -1.5, 0.04, 1.0, '#aaaaaa', 6);
    F.geo('metal', new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, 0.9), along / 2 - 1.5, top + 1.3, -1.5, 0, '#dcdcdc', 1, 0.5, 1, 1.2);
  }
  if (rng.chance(0.5)) for (let k = 0; k < rng.int(1, 4); k++) F.box('plastic', rng.range(-along / 2 + 1, along / 2 - 1), top + 0.2, -deep + 1.2, 0.85, 0.6, 0.35, { color: '#e2e1dc' });
  if (rng.chance(0.4)) {
    F.box('metal', 0, top + 2.0, -deep * 0.5, along * 0.6, 0.01, 0.01, { color: '#777' });
    for (let k = 0; k < 5; k++) F.box('cloth', -along * 0.25 + k * along * 0.12, top + 1.3, -deep * 0.5, 0.4, 0.7, 0.01, { color: rng.pick(['#c0392b', '#2c64b8', '#e8c33a', '#f2f2f2', '#3a9a52']) });
  }
  for (let k = 0; k < Math.ceil(along / 3); k++) streak(F, rng.range(-along / 2 + 0.5, along / 2 - 0.5), top + 1.0, 0.005, rng.range(1.2, 3), rng.range(0.8, 2.5), 1);
}

/** Open-front shops with real depth, rusted shutters, sign bands, tarps and spill-out goods. */
function groundFloorShops(ctx: BuildContext, F: Frame, along: number, deep: number, tint: THREE.Color, wall: string) {
  const rng = ctx.rng;
  const H = GROUND_SHOP_H, shopDepth = Math.min(5, deep - 1);
  const n = Math.max(1, Math.floor(along / 4.2));
  const sw = along / n;
  // back rooms + ceiling slab
  F.box(wall, 0, 0, -shopDepth - (deep - shopDepth) / 2, along, H, deep - shopDepth, { color: tint.clone().multiplyScalar(0.9), tile: 3.6 });
  F.box('concrete', 0, H - 0.25, -shopDepth / 2, along, 0.25, shopDepth, { color: '#cfcac0', tile: 3 });
  F.collider(-along / 2, -deep, along / 2, -shopDepth, 0, H);
  for (let i = 0; i < n; i++) {
    const lx = -along / 2 + sw * (i + 0.5);
    const open = rng.chance(0.68);
    // piers between shops
    F.box(wall, lx - sw / 2 + 0.22, 0, -shopDepth / 2, 0.44, H, shopDepth, { color: tint.clone().multiplyScalar(0.88), tile: 3.6 });
    F.collider(lx - sw / 2, -shopDepth, lx - sw / 2 + 0.44, 0, 0, H);
    if (i === n - 1) {
      F.box(wall, lx + sw / 2 - 0.22, 0, -shopDepth / 2, 0.44, H, shopDepth, { color: tint.clone().multiplyScalar(0.88), tile: 3.6 });
      F.collider(lx + sw / 2 - 0.44, -shopDepth, lx + sw / 2, 0, 0, H);
    }
    const iw = sw - 0.44;
    // sign band
    const [en, hi] = rng.pick(GENERIC_SHOP_NAMES);
    const cell = ctx.mats.signs.add(en, hi, rng.int(0, 9));
    F.box('metal', lx, H - 0.95, 0.05, iw + 0.1, 1.0, 0.16, { color: '#1c1c1c' });
    F.sign(lx, H - 0.92, 0.135, iw - 0.06, 0.94, cell);
    if (open) {
      // floor tiles, shelves packed with goods, counter, tube light, ceiling fan
      F.box('paver_warm', lx, 0.0, -shopDepth / 2, iw, 0.03, shopDepth, { tile: 1.2 });
      F.box(wall, lx, 0, -shopDepth + 0.1, iw, H - 0.25, 0.2, { color: tint.clone().multiplyScalar(0.8), tile: 3.6 });
      const levels = 5;
      for (let lv = 0; lv < levels; lv++) {
        const y = 0.3 + lv * 0.5;
        F.box('frame', lx, y, -shopDepth + 0.45, iw - 0.2, 0.03, 0.55, { color: '#6b5139' });
        const items = Math.floor((iw - 0.3) / 0.18);
        for (let k = 0; k < items; k++) {
          if (rng.chance(0.12)) continue;
          const ix = lx - (iw - 0.3) / 2 + k * 0.18 + 0.09;
          const ih = rng.range(0.14, 0.38);
          F.product(ix, y + 0.03, -shopDepth + 0.45 + rng.range(-0.1, 0.1), 0.15, ih, rng.range(0.1, 0.25), rng.int(0, 63));
        }
      }
      for (const s of [-1, 1]) {
        for (let lv = 0; lv < 4; lv++) {
          F.box('frame', lx + s * (iw / 2 - 0.25), 0.4 + lv * 0.55, -shopDepth / 2 - 0.5, 0.45, 0.03, shopDepth - 1.6, { color: '#6b5139' });
          for (let k = 0; k < Math.floor((shopDepth - 1.8) / 0.22); k++) F.product(lx + s * (iw / 2 - 0.25), 0.43 + lv * 0.55, -shopDepth + 1.4 + k * 0.22, 0.3, rng.range(0.14, 0.4), 0.16, rng.int(0, 63));
        }
      }
      if (rng.chance(0.7)) {
        F.box('frame', lx, 0, -1.0, iw * 0.55, 0.95, 0.6, { color: rng.pick(['#5b4636', '#2d3a40', '#7a5a3a']) });
        F.collider(lx - iw * 0.28, -1.3, lx + iw * 0.28, -0.7, 0, 1);
        if (rng.chance(0.6)) for (let k = 0; k < 4; k++) F.cyl('glass', lx - iw * 0.2 + k * 0.22, 0.95, -1.0, 0.07, 0.22, undefined, 10);
      }
      F.box('lamp_white', lx, H - 0.3, -shopDepth * 0.45, Math.min(1.2, iw * 0.6), 0.04, 0.05);
      F.cyl('metal', lx, H - 0.55, -shopDepth * 0.6, 0.02, 0.3, '#ddd', 5);
      for (let b = 0; b < 3; b++) F.box('metal', lx, H - 0.56, -shopDepth * 0.6, 0.9, 0.01, 0.1, { color: '#e8e8e8', ry: (b * Math.PI * 2) / 3 });
      ctx.lights.push({ ...F.world(lx, H - 0.6, -0.3), kind: 'shop' });
      // hanging goods strip (chips packets, shampoo sachets)
      if (rng.chance(0.6)) for (let k = 0; k < 5; k++) for (let m = 0; m < 4; m++) F.product(lx - iw / 2 + 0.4 + k * 0.16, H - 0.75 - m * 0.22, -0.25, 0.13, 0.2, 0.012, rng.int(0, 63));
      // rolled-up shutter
      F.box('shutter', lx, H - 1.02, -0.12, iw, 0.38, 0.32, { tile: 4, tileV: 1 });
      // goods spilling onto the footpath
      if (rng.chance(0.55)) {
        for (let k = 0; k < rng.int(1, 4); k++) {
          const gx = lx + rng.range(-iw / 2 + 0.4, iw / 2 - 0.4);
          if (rng.chance(0.5)) F.box('plastic', gx, 0, 0.45, 0.5, 0.3 * rng.int(1, 3), 0.38, { color: rng.pick(['#c0392b', '#1f5fbf', '#2f855a', '#e8b21f']) }); // crates
          else F.geo('cloth', new THREE.CylinderGeometry(0.24, 0.3, 0.7, 10), gx, 0.35, 0.5, rng.range(0, 3), '#d8c9a3'); // sacks
        }
      }
      ctx.npcSpots.push({ ...F.world(lx, 0, -1.6), heading: F.heading(0), role: 'shopkeeper' });
    } else {
      F.box('shutter', lx, 0, -0.1, iw, H - 0.95, 0.06, { tile: iw, tileV: H - 0.95 });
      F.box('metal', lx, H - 1.0, -0.1, iw, 0.06, 0.1, { color: '#3a3a3a' });
      F.collider(lx - iw / 2, -0.2, lx + iw / 2, 0, 0, H);
      streak(F, lx, H - 0.95, -0.06, iw, rng.range(0.6, 1.6), 0.6);
    }
    // awnings / tarps
    const aw = rng.next();
    if (aw < 0.4) {
      F.box('cloth', lx, H - 1.25, 0.75, iw + 0.2, 0.03, 1.5, { color: rng.pick(AWNING_COLORS), rx: -0.32 });
    } else if (aw < 0.6) {
      // blue tarp stretched to bamboo poles at the kerb
      F.box('cloth', lx, H - 1.0, 1.2, iw + 0.3, 0.03, 2.5, { color: rng.pick(['#1f5fbf', '#2b6fd6', '#e07b1a']), rx: -0.22 });
      for (const s of [-1, 1]) F.cyl('frame', lx + s * iw * 0.45, 0, 2.3, 0.04, 2.45, '#8a7048', 6);
    }
    // vertical projecting sign on some piers
    if (rng.chance(0.3)) {
      const [en2, hi2] = rng.pick(GENERIC_SHOP_NAMES);
      const c2 = ctx.mats.signs.add(en2, hi2, rng.int(0, 9));
      const P = new Frame(ctx, F.world(lx - sw / 2 + 0.22, 0, 0.6).x, KERB_H, F.world(lx - sw / 2 + 0.22, 0, 0.6).z, F.a + Math.PI / 2);
      P.box('metal', 0, H + 0.4, 0, 1.0, 1.6, 0.14, { color: '#222' });
      P.sign(0, H + 0.45, 0.075, 0.94, 1.5, c2);
      P.sign(0, H + 0.45, -0.075, 0.94, 1.5, c2, Math.PI);
    }
  }
}

const ADS: [string, string][] = [
  ['Kesari Raftaar 110', 'माइलेज का राजा — 80 km/l*'], ['DabbaDash', '15 मिनट में खाना — Order Now'], ['Sagar Central Mall', 'Monsoon Sale — Upto 50% Off'],
  ['Rajhans Pixie', 'Chhoti family, bada sapna'], ['PaisaPay UPI', 'Scan karo, pay karo'], ['Gajraj X7', 'Rule every road'],
  ['Mumbai Monsoon Run', '21 km • Register today'], ['Vayu E-Zip', 'Petrol ko bolo bye-bye'], ['Navrang Talkies', 'Now showing: "Dil Se Mumbai"'],
];

export function billboard(ctx: BuildContext, F: Frame, lx: number, ly: number, lz: number, w: number) {
  const [t, s] = ctx.rng.pick(ADS);
  const cell = ctx.mats.signs.add(t, s, ctx.rng.int(0, 9));
  const h = w * 0.33;
  F.box('metal', lx - w * 0.35, ly, lz - 0.3, 0.2, 2.5, 0.2, { color: '#4a4f52' });
  F.box('metal', lx + w * 0.35, ly, lz - 0.3, 0.2, 2.5, 0.2, { color: '#4a4f52' });
  F.box('metal', lx, ly + 2.5, lz - 0.1, w + 0.3, h + 0.3, 0.2, { color: '#30353a' });
  F.sign(lx, ly + 2.65, lz + 0.02, w, h, cell);
  F.box('lamp_white', lx, ly + 2.5 + h + 0.3, lz + 0.4, w * 0.8, 0.08, 0.1);
}

// ------------------------------------------------------------------- interactive shops

/** Rect occupied by a shop definition (front line at x,z; body extends behind). */
export function shopRect(s: ShopDef): Rect {
  const w = s.width, d = s.depth;
  switch (s.facing) {
    case 'N': return rect(s.x - w / 2, s.z, s.x + w / 2, s.z + d);
    case 'S': return rect(s.x - w / 2, s.z - d, s.x + w / 2, s.z);
    case 'E': return rect(s.x - d, s.z - w / 2, s.x, s.z + w / 2);
    case 'W': return rect(s.x, s.z - w / 2, s.x + d, s.z + w / 2);
  }
}

export function buildShop(ctx: BuildContext, s: ShopDef) {
  if (s.form === 'counter') return;
  const cell = ctx.mats.signs.add(s.name, s.nameHi, s.signStyle);
  if (s.form === 'storefront') storefront(ctx, s, cell);
  else if (s.form === 'stall') stall(ctx, s, cell);
  else cart(ctx, s, cell);
}

function storefront(ctx: BuildContext, s: ShopDef, cell: SignCell) {
  const rng = ctx.rng;
  const F = Frame.facing(ctx, s.x, KERB_H, s.z, s.facing);
  const w = s.width, d = s.depth, h = 3.9;
  const wall = rng.pick(['#f1e4c9', '#e4eef0', '#f6d8c4', '#efe9dd']);
  // floor tiles
  F.box('paver_warm', 0, -0.02, -d / 2, w, 0.04, d, { tile: 2 });
  // walls
  F.box('concrete', 0, 0, -d + 0.15, w, h, 0.3, { color: wall, tile: 3, collide: true });
  F.box('concrete', -w / 2 + 0.15, 0, -d / 2, 0.3, h, d, { color: wall, tile: 3, collide: true });
  F.box('concrete', w / 2 - 0.15, 0, -d / 2, 0.3, h, d, { color: wall, tile: 3, collide: true });
  F.box('concrete', 0, h, -d / 2, w, 0.25, d, { color: wall, tile: 3 }); // ceiling slab
  // two residential floors above
  F.box('facade_apartment', 0, h + 0.25, -d / 2, w, FLOOR_H * 2, d, { color: wall, tile: 14, tileV: 9.3, faces: { ny: false } });
  F.collider(-w / 2, -d, w / 2, 0, h, h + 0.25 + FLOOR_H * 2);
  F.box('concrete_dark', 0, h + 0.25 + FLOOR_H * 2, -d / 2, w, 0.2, d);
  F.cyl('plastic', w / 4, h + 0.45 + FLOOR_H * 2, -d / 2, 0.6, 1.1, '#161616', 14);
  // sign + rolled shutter + tube lights
  F.box('paint', 0, h - 0.95, 0.05, w - 0.1, 1.0, 0.14, { color: '#222' });
  F.sign(0, h - 0.92, 0.13, w - 0.3, 0.92, cell);
  F.box('metal', 0, h - 1.25, -0.2, w - 0.6, 0.32, 0.3, { color: '#6d706e' });
  F.box('lamp_white', 0, h - 0.08, -d * 0.35, 1.2, 0.05, 0.08);
  F.box('lamp_white', 0, h - 0.08, -d * 0.75, 1.2, 0.05, 0.08);
  ctx.lights.push({ ...F.world(0, h - 0.4, -d * 0.5), kind: 'tube' });

  const prod = ['#d33', '#e8b21f', '#2b7bd9', '#25a35a', '#f07c1b', '#eee', '#8e44ad', '#c0392b', '#16a085'];
  const shelfRow = (lz: number, len: number, along: 'x' | 'z', lxBase: number) => {
    for (let lvl = 0; lvl < 5; lvl++) {
      const y = 0.25 + lvl * 0.55;
      if (along === 'x') F.box('paint', lxBase, y, lz, len, 0.04, 0.45, { color: '#7a5c3c' });
      else F.box('paint', lxBase, y, lz, 0.45, 0.04, len, { color: '#7a5c3c' });
      const n = Math.floor(len / 0.32);
      for (let k = 0; k < n; k++) {
        const off = -len / 2 + 0.16 + k * 0.32;
        const ph = rng.range(0.18, 0.42);
        if (along === 'x') F.product(lxBase + off, y + 0.04, lz, 0.26, ph, 0.3, rng.int(0, 63));
        else F.product(lxBase, y + 0.04, lz + off, 0.3, ph, 0.26, rng.int(0, 63));
      }
    }
  };

  const counterZ = -Math.min(2.2, d * 0.3);
  switch (s.kind) {
    case 'restaurant':
    case 'cafe': {
      // tables & chairs
      for (let i = 0; i < 4; i++) {
        const tx = -w / 2 + 2 + ((i % 2) * (w - 4)), tz = -2.5 - Math.floor(i / 2) * 3.2;
        F.box('paint', tx, 0, tz, 1.2, 0.75, 0.8, { color: s.kind === 'cafe' ? '#3a2a1e' : '#b8b2a2', collide: true });
        F.box('paint', tx - 0.85, 0, tz, 0.45, 0.45, 0.45, { color: '#7a3b1e' });
        F.box('paint', tx + 0.85, 0, tz, 0.45, 0.45, 0.45, { color: '#7a3b1e' });
        ctx.benches.push({ ...F.world(tx - 0.85, 0.45, tz), heading: F.heading(Math.PI / 2) });
      }
      F.box('paint', 0, 0, -d + 1.4, w * 0.6, 1.05, 0.8, { color: '#5b3a22', collide: true });
      F.box('metal', -1, 1.05, -d + 1.4, 0.6, 0.35, 0.4, { color: '#bbb' });
      ctx.npcSpots.push({ ...F.world(0, 0, -d + 0.8), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      ctx.npcSpots.push({ ...F.world(-w / 2 + 2, 0, -4), heading: F.heading(Math.PI), role: 'customer' });
      break;
    }
    case 'clothing': {
      for (let i = 0; i < 3; i++) {
        const rx = -w / 2 + 1.5 + i * ((w - 3) / 2);
        F.box('metal', rx, 1.6, -d / 2, 0.05, 0.05, d - 3, { color: '#999' });
        for (let k = 0; k < 10; k++) F.box('fabric', rx, 0.6, -d / 2 - (d - 3) / 2 + 0.3 + k * ((d - 3.4) / 10), 0.5, 1.0, 0.06, { color: rng.pick(prod), ry: 0 });
      }
      F.box('paint', 0, 0, counterZ, w * 0.5, 1.0, 0.7, { color: '#5b3a22', collide: true });
      ctx.npcSpots.push({ ...F.world(0, 0, counterZ - 0.8), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      break;
    }
    case 'bank': {
      // ATM lobby with machines and a glass partition
      for (let i = 0; i < 2; i++) {
        F.box('metal', -w / 4 + i * (w / 2), 0, -1.2, 0.9, 1.7, 0.7, { color: '#2a5d9f', collide: true });
        F.box('neon', -w / 4 + i * (w / 2), 1.1, -0.84, 0.5, 0.35, 0.02, { color: '#7fd0ff' });
        ctx.interactables.push({ id: `atm_${s.id}_${i}`, kind: 'atm', ...F.world(-w / 4 + i * (w / 2), 0, -0.4), radius: 1.6, label: 'Use ATM' });
      }
      F.box('glass', 0, 0, -3.2, w - 0.8, 2.6, 0.05, { collide: true });
      F.box('paint', 0, 0, -6, w * 0.6, 1.05, 0.8, { color: '#e9e3d6' });
      ctx.npcSpots.push({ ...F.world(0, 0, -6.8), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      ctx.npcSpots.push({ ...F.world(w / 2 - 0.8, 0, -0.6), heading: F.heading(-Math.PI / 2), role: 'guard', name: 'Security guard' });
      break;
    }
    case 'barber': {
      for (let i = 0; i < 2; i++) {
        const bx = -w / 4 + i * (w / 2);
        F.box('paint', bx, 0, -d + 1.2, 0.7, 0.55, 0.7, { color: '#8b1a1a' });
        F.box('paint', bx, 0.55, -d + 1.5, 0.7, 0.7, 0.12, { color: '#8b1a1a' });
        F.box('glass', bx, 1.1, -d + 0.35, 1.2, 1.3, 0.04);
      }
      ctx.npcSpots.push({ ...F.world(-w / 4, 0, -d + 2.2), heading: F.heading(Math.PI), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      break;
    }
    case 'gym': {
      for (let i = 0; i < 4; i++) {
        F.box('metal', -w / 2 + 1.5 + i * 2.2, 0, -d + 1.5, 1.4, 1.6, 0.6, { color: '#222' });
        F.cyl('metal', -w / 2 + 1.5 + i * 2.2, 1.0, -d + 2.2, 0.25, 0.08, '#111', 12);
      }
      F.box('paint', 0, 0, counterZ, 2.2, 1.0, 0.7, { color: '#111', collide: true });
      ctx.npcSpots.push({ ...F.world(0, 0, counterZ - 0.8), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      ctx.npcSpots.push({ ...F.world(-w / 2 + 2.6, 0, -d + 2.8), heading: F.heading(Math.PI), role: 'customer' });
      break;
    }
    case 'realestate': {
      F.box('paint', 0, 0, -d + 2.5, 2.4, 0.78, 1.0, { color: '#6b4a2e', collide: true });
      F.box('paint', 0, 0, -d + 3.6, 0.5, 0.45, 0.5, { color: '#333' });
      for (let i = 0; i < 4; i++) F.box('paint', -w / 2 + 1.2 + i * 1.5, 1.4, -d + 0.32, 1.1, 0.8, 0.02, { color: rng.pick(['#e8f0ff', '#fff3d6', '#e3f6e8']) });
      ctx.npcSpots.push({ ...F.world(0, 0, -d + 1.6), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      break;
    }
    case 'pharmacy': {
      shelfRow(-d + 0.45, w - 1, 'x', 0);
      F.box('glass', 0, 0, counterZ, w * 0.7, 1.0, 0.6, { collide: true });
      F.box('neon', w / 2 - 0.6, h - 0.4, 0.3, 0.7, 0.7, 0.08, { color: '#18c46b' });
      ctx.npcSpots.push({ ...F.world(0, 0, counterZ - 0.8), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
      break;
    }
    default: {
      // kirana / electronics: wall shelves packed floor to ceiling + front counter
      shelfRow(-d + 0.45, w - 1, 'x', 0);
      shelfRow(-d / 2 - 0.5, d - 2.5, 'z', -w / 2 + 0.55);
      shelfRow(-d / 2 - 0.5, d - 2.5, 'z', w / 2 - 0.55);
      F.box('paint', 0, 0, counterZ, w * 0.55, 1.0, 0.7, { color: s.kind === 'electronics' ? '#1f2a33' : '#6b4a2e', collide: true });
      if (s.kind === 'electronics') F.box('glass', 0, 1.0, counterZ, w * 0.55, 0.05, 0.7);
      else for (let k = 0; k < 6; k++) F.box('plastic', -w * 0.22 + k * 0.4, 1.0, counterZ, 0.3, 0.3, 0.3, { color: rng.pick(['#f0c419', '#c0392b', '#ecf0f1']) }); // jars
      ctx.npcSpots.push({ ...F.world(0, 0, counterZ - 0.8), heading: F.heading(0), role: 'shopkeeper', name: s.keeper, shopId: s.id });
    }
  }
  ctx.interactables.push({ id: s.id, kind: 'shop', ...F.world(0, 0, counterZ + 1.0), radius: 2.6, label: `Shop at ${s.name}`, data: { shopId: s.id } });
}

function stall(ctx: BuildContext, s: ShopDef, cell: SignCell) {
  const rng = ctx.rng;
  const F = Frame.facing(ctx, s.x, KERB_H, s.z, s.facing);
  const w = s.width, d = s.depth;
  // Tapri: metal booth with tin roof and plastic sheet
  F.box('rust', 0, 0, -d / 2, w, 1.0, d, { color: '#6f7d84', collide: true, tile: 1 });
  F.box('paint', 0, 1.0, -d / 2 + 0.2, w + 0.1, 0.05, d + 0.4, { color: '#8b6b4a' });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) F.box('metal', sx * (w / 2 - 0.05), 0, -sz * d + (sz ? 0.05 : -0.05), 0.06, 2.4, 0.06, { color: '#555' });
  F.box('rust', 0, 2.4, -d / 2 + 0.3, w + 0.6, 0.05, d + 1.2, { color: '#9aa2a6', rx: 0.08 });
  F.box('fabric', 0, 2.2, 0.55, w + 0.4, 0.04, 1.1, { color: rng.pick(AWNING_COLORS), rx: -0.25 });
  F.sign(0, 1.75, 0.1, w - 0.1, 0.55, cell);
  // stove + kettle / kadhai
  F.cyl('metal', -w / 4, 1.05, -d / 2, 0.22, 0.15, '#222', 10);
  if (s.kind === 'tea') {
    F.cyl('metal', -w / 4, 1.2, -d / 2, 0.16, 0.28, '#c9a227', 12, 0.11);
    for (let i = 0; i < 6; i++) F.cyl('glass', w / 6 + (i % 3) * 0.12, 1.05, -0.35 - Math.floor(i / 3) * 0.12, 0.035, 0.09, undefined, 6);
  } else {
    F.geo('metal', new THREE.SphereGeometry(0.35, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), -w / 4, 1.38, -d / 2, 0, '#333');
    for (let i = 0; i < 8; i++) F.geo('paint', new THREE.SphereGeometry(0.06, 6, 4), w / 6 + (i % 4) * 0.13, 1.08, -0.4 - Math.floor(i / 4) * 0.13, 0, '#c8862e');
  }
  // hanging snack packets
  for (let i = 0; i < 10; i++) F.box('plastic', -w / 2 + 0.2 + i * (w / 10), 1.95, -0.05, 0.16, 0.24, 0.02, { color: rng.pick(['#f1c40f', '#e74c3c', '#3498db', '#2ecc71']) });
  F.box('lamp_white', 0, 2.3, -d / 2, 0.8, 0.04, 0.05);
  ctx.lights.push({ ...F.world(0, 2.2, -0.2), kind: 'tube' });
  ctx.npcSpots.push({ ...F.world(0, 0, -d - 0.5), heading: F.heading(0), role: 'vendor', name: s.keeper, shopId: s.id });
  F.collider(-w / 2 - 0.2, -d - 1.1, w / 2 + 0.2, -d - 0.9, 0, 2.4);
  ctx.interactables.push({ id: s.id, kind: 'shop', ...F.world(0, 0, 0.8), radius: 2.4, label: `Order at ${s.name}`, data: { shopId: s.id } });
  // plastic stools for customers
  for (let i = 0; i < 2; i++) {
    F.cyl('plastic', w / 2 + 0.6, 0, 0.6 + i * 0.6, 0.18, 0.42, '#c0392b', 10);
    ctx.benches.push({ ...F.world(w / 2 + 0.6, 0.42, 0.6 + i * 0.6), heading: F.heading(-Math.PI / 2) });
  }
}

function cart(ctx: BuildContext, s: ShopDef, cell: SignCell) {
  const rng = ctx.rng;
  const F = Frame.facing(ctx, s.x, KERB_H, s.z, s.facing);
  const w = s.width, d = s.depth;
  F.box('paint', 0, 0.55, -d / 2, w, 0.12, d, { color: '#6b4a2e', collide: true });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) {
    F.geo('rust', new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14), sx * (w / 2 - 0.3), 0.28, -sz * d + (sz ? 0.15 : -0.15), 0, '#333', 1, 1, 1, 0, Math.PI / 2);
  }
  const fruit = s.id === 'mandir_flowers' ? ['#ff9f1a', '#ffd23f', '#ff6f00'] : ['#f5d33a', '#f0a830', '#e8c547', '#7cb342'];
  for (let i = 0; i < 40; i++) {
    F.geo('plastic', new THREE.SphereGeometry(rng.range(0.06, 0.1), 6, 5), rng.range(-w / 2 + 0.2, w / 2 - 0.2), 0.72 + rng.range(0, 0.2), -d / 2 + rng.range(-d / 2 + 0.15, d / 2 - 0.15), 0, rng.pick(fruit));
  }
  // big umbrella
  F.cyl('metal', 0, 0.67, -d / 2, 0.025, 1.9, '#666', 6);
  F.geo('fabric', new THREE.ConeGeometry(1.4, 0.5, 10, 1, true), 0, 2.75, -d / 2, 0, rng.pick(['#1f5fbf', '#d9531e', '#2f8f46']));
  F.sign(0, 0.68, 0.01, w * 0.8, 0.35, cell);
  ctx.npcSpots.push({ ...F.world(0, 0, -d - 0.5), heading: F.heading(0), role: 'vendor', name: s.keeper, shopId: s.id });
  ctx.interactables.push({ id: s.id, kind: 'shop', ...F.world(0, 0, 0.7), radius: 2.2, label: `Buy from ${s.name}`, data: { shopId: s.id } });
}
