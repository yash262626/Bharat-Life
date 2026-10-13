// Suburban railway corridor: tracks, OHE masts, platforms, station buildings, foot over-bridges.
import * as THREE from 'three';
import { BuildContext, C } from './BuildContext';
import { Frame } from './Frame';
import { RAIL, STATIONS, StationDef } from './layout';
import { place, uvPlane, uvBox } from './geom';
import { textPanel } from './textures';
import { bench, } from './landmarks';
import { tree } from './props';

const PH = RAIL.platformH;
export const FOB_H = 7.4;

export function buildRailway(ctx: BuildContext) {
  const z0 = RAIL.northEnd - 60, z1 = RAIL.southEnd + 60;
  const len = z1 - z0, cz = (z0 + z1) / 2;
  // Ballast bed
  ctx.batch.add('ballast', place(uvPlane(RAIL.corridorX1 - RAIL.corridorX0, len, 3), (RAIL.corridorX0 + RAIL.corridorX1) / 2, 0.01, cz));
  for (const tx of [RAIL.westTrackX, RAIL.eastTrackX]) {
    // raised ballast shoulder under each track
    const g = uvBox(3.2, 0.2, len, 3);
    ctx.batch.add('ballast', place(g, tx, 0.1, cz));
    for (const s of [-1, 1]) {
      const rail = new THREE.BoxGeometry(0.07, 0.16, len);
      ctx.batch.add('metal', place(rail, tx + (s * RAIL.gauge) / 2, 0.28, cz), C('#8a8780'));
    }
  }
  // Concrete sleepers (instanced: thousands of them)
  const spacing = 0.65;
  const count = Math.floor(len / spacing);
  const sleeperGeo = new THREE.BoxGeometry(2.6, 0.12, 0.25);
  const sleeperMat = ctx.mats.get('concrete', true) as THREE.MeshStandardMaterial;
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, count * 2);
  const m = new THREE.Matrix4();
  let k = 0;
  for (const tx of [RAIL.westTrackX, RAIL.eastTrackX]) {
    for (let i = 0; i < count; i++) {
      m.makeTranslation(tx, 0.22, z0 + i * spacing);
      sleepers.setMatrixAt(k, m);
      sleepers.setColorAt(k++, C('#9a968c'));
    }
  }
  sleepers.receiveShadow = true;
  sleepers.frustumCulled = false;
  ctx.dynamic.add(sleepers);

  // OHE masts + contact wire
  for (let z = z0 + 20; z < z1 - 10; z += 55) {
    for (const side of [-1, 1]) {
      const mx = side < 0 ? RAIL.westTrackX - 3.6 : RAIL.eastTrackX + 3.6;
      if (side < 0 && Math.abs(z - nearestStationZ(z)) < 80) continue; // platform side: masts mounted on platform canopy
      const g = new THREE.BoxGeometry(0.3, 8.2, 0.3);
      ctx.batch.add('metal', place(g, mx, 4.1, z), C('#71777b'));
      const arm = new THREE.BoxGeometry(3.4, 0.12, 0.12);
      ctx.batch.add('metal', place(arm, mx - side * 1.7, 6.6, z), C('#71777b'));
      ctx.batch.add('plastic', place(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), mx - side * 3.2, 6.3, z), C('#8a4b2a'));
    }
  }
  for (const tx of [RAIL.westTrackX, RAIL.eastTrackX]) {
    ctx.batch.add('metal', place(new THREE.BoxGeometry(0.03, 0.03, len), tx, 5.6, cz), C('#3b2a1f'));
    ctx.batch.add('metal', place(new THREE.BoxGeometry(0.03, 0.03, len), tx, 6.6, cz), C('#3b2a1f'));
  }

  for (const s of STATIONS) station(ctx, s);

  // Buffer stops at the termini
  for (const ez of [RAIL.northEnd - 30, RAIL.southEnd + 30]) {
    for (const tx of [RAIL.westTrackX, RAIL.eastTrackX]) {
      ctx.batch.add('paint', place(new THREE.BoxGeometry(2.4, 1.3, 0.8), tx, 0.9, ez), C('#c0392b'));
      ctx.batch.add('paint', place(new THREE.BoxGeometry(2.0, 0.3, 0.82), tx, 1.2, ez), C('#f1c40f'));
    }
  }

  corridorWalls(ctx, z0, z1);
  trackside(ctx, z0, z1);
}

function nearestStationZ(z: number) {
  let best = STATIONS[0].z;
  for (const s of STATIONS) if (Math.abs(s.z - z) < Math.abs(best - z)) best = s.z;
  return best;
}

function corridorWalls(ctx: BuildContext, z0: number, z1: number) {
  // East boundary wall over full length
  wallZ(ctx, RAIL.corridorX1 + 0.2, z0, z1, 2.6, '#bdb6a6');
  // West: inside district (except station hall), and outside district except station plazas.
  const gaps: [number, number][] = [[-24, 24]];
  for (const s of STATIONS) if (!s.home) gaps.push([s.z - 24, s.z + 24]);
  gaps.sort((a, b) => a[0] - b[0]);
  let z = z0;
  for (const [g0, g1] of gaps) {
    if (g0 > z) wallZ(ctx, RAIL.corridorX0 - 0.15, z, g0, 2.4, '#c9c1ae');
    z = Math.max(z, g1);
  }
  if (z < z1) wallZ(ctx, RAIL.corridorX0 - 0.15, z, z1, 2.4, '#c9c1ae');
}

function wallZ(ctx: BuildContext, x: number, z0: number, z1: number, h: number, color: string) {
  const len = z1 - z0;
  const g = uvBox(0.3, h, len, 3);
  ctx.batch.add('concrete', place(g, x, h / 2, (z0 + z1) / 2), C(color));
  ctx.col.addBox(x - 0.2, z0, x + 0.2, z1, -1, h + 0.5);
  // painted wall ads every ~80 m (classic Indian railway boundary walls)
  for (let z = z0 + 30; z < z1 - 20; z += 80) {
    const cell = ctx.mats.signs.add(ctx.rng.pick(['Dr. Batra Dental', 'Sharma Coaching Classes', 'Kesari Tyres', 'Shree Cement', 'Lucky Agarbatti', 'Raja Pipes']), ctx.rng.pick(['सबसे भरोसेमंद', 'आज ही संपर्क करें', 'मज़बूत और टिकाऊ']), ctx.rng.int(0, 9), { lit: false });
    const sg = new THREE.PlaneGeometry(7, 1.6);
    const uv = sg.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, cell.u0, cell.v1); uv.setXY(1, cell.u1, cell.v1); uv.setXY(2, cell.u0, cell.v0); uv.setXY(3, cell.u1, cell.v0);
    const side = x < RAIL.westTrackX ? 1 : -1;
    ctx.batch.add('signs', place(sg, x + side * 0.16, 1.2, z, side > 0 ? Math.PI / 2 : -Math.PI / 2));
  }
}

function station(ctx: BuildContext, s: StationDef) {
  const z = s.z;
  const L = RAIL.platformHalfLen;
  // ---- Platforms (P1 west, P2 east)
  for (const p of [RAIL.p1, RAIL.p2]) {
    const w = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2;
    ctx.batch.add('concrete', place(uvBox(w, PH, L * 2, 2), cx, PH / 2, z), C('#c8c2b4'));
    ctx.batch.add('paver', place(uvPlane(w, L * 2, 1.5), cx, PH + 0.005, z));
    // yellow safety line and platform edge coping
    const edgeX = p === RAIL.p1 ? p.x1 - 0.55 : p.x0 + 0.55;
    ctx.batch.add('marking_yellow', place(uvPlane(0.15, L * 2, 1), edgeX, PH + 0.01, z));
    ctx.batch.add('concrete', place(uvBox(0.4, 0.08, L * 2, 1), p === RAIL.p1 ? p.x1 - 0.2 : p.x0 + 0.2, PH + 0.04, z), C('#e8e2d2'));
    ctx.col.addSurface({ x0: p.x0, z0: z - L, x1: p.x1, z1: z + L, h: PH, tag: 'platform' });
    ctx.col.addBox(p.x0, z - L, p.x1, z + L, -1, PH, 'platform');
    // end ramps
    ctx.col.addSurface({ x0: p.x0, z0: z + L, x1: p.x1, z1: z + L + 8, h: 0, ramp: { axis: 'z', h0: PH, h1: 0 }, tag: 'platform' });
    ctx.col.addSurface({ x0: p.x0, z0: z - L - 8, x1: p.x1, z1: z - L, h: 0, ramp: { axis: 'z', h0: 0, h1: PH }, tag: 'platform' });
    for (const e of [-1, 1]) {
      const rg = new THREE.BoxGeometry(w, 0.1, 8.2);
      place(rg, cx, PH / 2, z + e * (L + 4), 0, 1, 1, 1, e * Math.atan2(PH, 8));
      ctx.batch.add('concrete', rg, C('#bdb7a8'));
    }
    // canopy over central 110 m: pillars + sloped roof sheets
    for (let pz = z - 54; pz <= z + 54; pz += 12) {
      if (pz > z + 36 && pz < z + 62) continue; // keep the FOB stairs clear
      ctx.batch.add('metal', place(new THREE.BoxGeometry(0.3, 4.2, 0.3), cx, PH + 2.1, pz), C('#2e5b8a'));
      ctx.col.addBox(cx - 0.2, pz - 0.2, cx + 0.2, pz + 0.2, PH, PH + 4.2);
    }
    const roof = new THREE.BoxGeometry(w + 2.2, 0.08, 112);
    ctx.batch.add('rust', place(roof, cx, PH + 4.35, z, 0, 1, 1, 1, 0, (p === RAIL.p1 ? 1 : -1) * 0.06), C('#a7adb0'));
    ctx.batch.add('lamp_white', place(new THREE.BoxGeometry(0.12, 0.05, 100), cx, PH + 4.1, z));
    for (let lz = z - 50; lz <= z + 50; lz += 25) ctx.lights.push({ x: cx, y: PH + 4, z: lz, kind: 'tube' });
    // station name boards (Indian Railways style: yellow board, black text, 3 scripts)
    const boardTex = textPanel([
      { text: s.nameMr, color: '#111', size: 0.33, font: '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif', weight: '800' },
      { text: s.nameHi, color: '#111', size: 0.3, font: '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif', weight: '800' },
      { text: s.name.toUpperCase(), color: '#111', size: 0.3, weight: '900' },
    ], '#f5c400', 768, 384, '#111');
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6, side: THREE.DoubleSide });
    for (const bz of [z - 60, z, z + 60]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), boardMat);
      board.position.set(cx, PH + 3.0, bz + 6);
      board.rotation.y = Math.PI / 2;
      ctx.dynamic.add(board);
      ctx.batch.add('metal', place(new THREE.BoxGeometry(0.1, 2.4, 0.1), cx, PH + 1.2, bz + 5), C('#222'));
      ctx.batch.add('metal', place(new THREE.BoxGeometry(0.1, 2.4, 0.1), cx, PH + 1.2, bz + 7), C('#222'));
    }
    for (let bz = z - 40; bz <= z + 40; bz += 20) bench(ctx, cx - (p === RAIL.p1 ? 1.5 : -1.5), bz + 3, p === RAIL.p1 ? Math.PI / 2 : -Math.PI / 2, PH);
    // waiting commuters
    for (let i = 0; i < 10; i++) {
      ctx.npcSpots.push({ x: cx + ctx.rng.range(-1.5, 1.5), y: PH, z: z + ctx.rng.range(-60, 60), heading: p === RAIL.p1 ? Math.PI / 2 : -Math.PI / 2, role: 'commuter' });
    }
  }
  ctx.anchors.set(`station_${s.id}_p1`, { x: (RAIL.p1.x0 + RAIL.p1.x1) / 2, y: PH, z, heading: 0 });
  ctx.anchors.set(`station_${s.id}_p2`, { x: (RAIL.p2.x0 + RAIL.p2.x1) / 2, y: PH, z, heading: 0 });

  fob(ctx, z + 40);
  stationHall(ctx, s);
}

/** Foot over-bridge linking P1 and P2: stairs on each platform + deck across the tracks. */
function fob(ctx: BuildContext, z: number) {
  const s0 = z, s1 = z + 15; // stair run
  const deckZ0 = s1, deckZ1 = s1 + 4;
  const stairs: [number, number][] = [[196, 199], [213, 216]];
  for (const [x0, x1] of stairs) {
    ctx.col.addSurface({ x0, z0: s0, x1, z1: s1, h: 0, ramp: { axis: 'z', h0: PH, h1: FOB_H }, tag: 'stairs' });
    // visual steps
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const h = PH + (FOB_H - PH) * t;
      ctx.batch.add('concrete', place(new THREE.BoxGeometry(x1 - x0, 0.22, (s1 - s0) / steps + 0.02), (x0 + x1) / 2, h - 0.11, s0 + t * (s1 - s0)), C('#bfb8a8'));
    }
    // stringers / side walls (also stop people walking under from the side)
    for (const sx of [x0 - 0.1, x1 + 0.1]) {
      const g = new THREE.BoxGeometry(0.2, 1.1, Math.hypot(s1 - s0, FOB_H - PH));
      place(g, sx, (PH + FOB_H) / 2 + 0.5, (s0 + s1) / 2, 0, 1, 1, 1, -Math.atan2(FOB_H - PH, s1 - s0));
      ctx.batch.add('concrete', g, C('#9aa3a6'));
      ctx.col.addBox(sx - 0.12, s0 + 1, sx + 0.12, s1, PH, FOB_H + 1.2);
    }
    ctx.col.addBox(x0, s0 + 1.2, x1, s1, PH - 0.5, PH + 0.4);
    ctx.batch.add('concrete', place(new THREE.BoxGeometry(x1 - x0, 0.4, 1.2), (x0 + x1) / 2, FOB_H - 0.2, s1 - 0.6), C('#bfb8a8'));
  }
  // deck
  const dx0 = 196, dx1 = 216;
  ctx.col.addSurface({ x0: dx0, z0: deckZ0, x1: dx1, z1: deckZ1, h: FOB_H, tag: 'fob' });
  ctx.batch.add('concrete', place(uvBox(dx1 - dx0, 0.4, deckZ1 - deckZ0, 2), (dx0 + dx1) / 2, FOB_H - 0.2, (deckZ0 + deckZ1) / 2), C('#c4bdae'));
  for (const rz of [deckZ0, deckZ1]) {
    // railings; the deckZ0 side has openings where the stairs arrive
    const segs: [number, number][] = rz === deckZ0 ? [[199, 213]] : [[dx0, dx1]];
    for (const [a, b] of segs) {
      ctx.batch.add('metal', place(new THREE.BoxGeometry(b - a, 1.1, 0.08), (a + b) / 2, FOB_H + 0.55, rz), C('#2e5b8a'));
      ctx.col.addBox(a, rz - 0.15, b, rz + 0.15, FOB_H - 0.3, FOB_H + 1.3);
    }
  }
  for (const ex of [dx0, dx1]) {
    ctx.batch.add('metal', place(new THREE.BoxGeometry(0.08, 1.1, deckZ1 - deckZ0), ex, FOB_H + 0.55, (deckZ0 + deckZ1) / 2), C('#2e5b8a'));
    ctx.col.addBox(ex - 0.15, deckZ0, ex + 0.15, deckZ1, FOB_H - 0.3, FOB_H + 1.3);
  }
  // roof over deck and support columns (between tracks / on platforms)
  ctx.batch.add('rust', place(new THREE.BoxGeometry(dx1 - dx0 + 1, 0.08, deckZ1 - deckZ0 + 1), (dx0 + dx1) / 2, FOB_H + 2.9, (deckZ0 + deckZ1) / 2), C('#a7adb0'));
  for (const cx of [197.5, 206, 214.5]) {
    ctx.batch.add('concrete', place(new THREE.BoxGeometry(0.6, FOB_H, 0.6), cx, FOB_H / 2, deckZ0 + 2), C('#9e9789'));
    ctx.col.addBox(cx - 0.3, deckZ0 + 1.7, cx + 0.3, deckZ0 + 2.3, -1, FOB_H - 0.5);
  }
}

function stationHall(ctx: BuildContext, s: StationDef) {
  const z = s.z;
  const hx0 = 162, hx1 = RAIL.corridorX0, hz0 = z - 22, hz1 = z + 22;
  const base = s.home ? 0.15 : 0.15;
  // hall slab at platform height + entrance steps
  ctx.batch.add('concrete', place(uvBox(hx1 - hx0, PH, hz1 - hz0, 2), (hx0 + hx1) / 2, PH / 2, z), C('#cfc8b8'));
  ctx.batch.add('paver_warm', place(uvPlane(hx1 - hx0, hz1 - hz0, 1.5), (hx0 + hx1) / 2, PH + 0.005, z));
  ctx.col.addSurface({ x0: hx0, z0: hz0, x1: hx1, z1: hz1, h: PH, tag: 'station' });
  ctx.col.addBox(hx0, hz0, hx1, hz1, -1, PH);
  ctx.col.addSurface({ x0: 157.5, z0: z - 10, x1: hx0, z1: z + 10, h: 0, ramp: { axis: 'x', h0: base, h1: PH }, tag: 'stairs' });
  for (let i = 0; i < 5; i++) {
    const h = base + ((PH - base) * (i + 1)) / 5;
    ctx.batch.add('concrete', place(new THREE.BoxGeometry(0.9, h, 20), 157.95 + i * 0.9, h / 2, z), C('#d8d2c2'));
  }
  // walls (north/south), west facade with three arches, roof
  const wallH = 6.5;
  const F = new Frame(ctx, hx0, PH, z, -Math.PI / 2); // local +z = west (street side)
  for (const side of [-1, 1]) {
    const wz = side < 0 ? hz0 + 0.2 : hz1 - 0.2;
    ctx.batch.add('facade_heritage', place(uvBox(hx1 - hx0, wallH, 0.4, 14, 9.3), (hx0 + hx1) / 2, PH + wallH / 2, wz), C('#efe2c6'));
    ctx.col.addBox(hx0, wz - 0.25, hx1, wz + 0.25, PH - 0.5, PH + wallH);
  }
  // west facade segments (gaps for 3 entrances at z-10..-6, -2..2, 6..10)
  const segs: [number, number][] = [[hz0, z - 10], [z - 6, z - 2], [z + 2, z + 6], [z + 10, hz1]];
  for (const [a, b] of segs) {
    ctx.batch.add('facade_heritage', place(uvBox(0.6, wallH, b - a, 14, 9.3), hx0, PH + wallH / 2, (a + b) / 2), C('#efe2c6'));
    ctx.col.addBox(hx0 - 0.3, a, hx0 + 0.3, b, PH - 0.5, PH + wallH);
  }
  ctx.batch.add('facade_heritage', place(uvBox(0.6, 2.2, 20, 14, 9.3), hx0, PH + wallH - 1.1, z), C('#efe2c6'));
  ctx.batch.add('concrete', place(new THREE.BoxGeometry(hx1 - hx0 + 1, 0.4, hz1 - hz0 + 1), (hx0 + hx1) / 2, PH + wallH + 0.2, z), C('#b9ad95'));
  // pediment + clock tower over the entrance
  F.box('concrete', 0, wallH + 0.4, 0.3, 16, 2.6, 1.2, { color: '#e8d8b5' });
  F.box('concrete', 0, wallH + 3.0, 0.3, 5, 3.5, 3, { color: '#e8d8b5' });
  F.geo('paint', new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24), 0, wallH + 4.8, 1.85, 0, '#f8f4e8', 1, 1, 1, Math.PI / 2);
  F.geo('paint', new THREE.ConeGeometry(2.8, 2.2, 4), 0, wallH + 7.6, 0.3, Math.PI / 4, '#8c4a2f');
  const nameTex = textPanel([
    { text: `${s.nameMr}  •  ${s.nameHi}`, color: '#1b2a6b', size: 0.48, font: '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif', weight: '800' },
    { text: s.name.toUpperCase(), color: '#1b2a6b', size: 0.46, weight: '900' },
  ], '#f8f1df', 1024, 192, '#1b2a6b');
  const nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ map: nameTex, emissiveMap: nameTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7 }));
  const nw = F.world(0, wallH + 1.7, 0.92);
  nameMesh.position.set(nw.x, nw.y, nw.z);
  nameMesh.rotation.y = F.heading(0);
  ctx.dynamic.add(nameMesh);
  for (let i = 0; i < 3; i++) ctx.batch.add('lamp_white', place(new THREE.BoxGeometry(14, 0.05, 0.12), (hx0 + hx1) / 2, PH + wallH - 0.1, z - 12 + i * 12));
  ctx.lights.push({ x: (hx0 + hx1) / 2, y: PH + 5, z, kind: 'tube' });

  // Booking office inside along the north wall
  const B = new Frame(ctx, 175, PH, hz0 + 0.5, 0); // local +z = south (into hall)
  B.box('concrete', 0, 0, 2.5, 14, 3.2, 5, { color: '#d9c9a5', collide: true, tile: 3 });
  for (let i = 0; i < 4; i++) {
    B.box('paint', -5 + i * 3.3, 0.9, 5.01, 1.4, 1.1, 0.04, { color: '#1c2a33' });
    B.box('lamp_white', -5 + i * 3.3, 1.9, 5.02, 1.2, 0.05, 0.03);
  }
  const tCell = ctx.mats.signs.add('Booking Office', 'तिकीट घर • टिकट घर', 1);
  B.sign(0, 2.3, 5.05, 7, 0.8, tCell);
  // ATVM machines
  for (let i = 0; i < 2; i++) {
    B.box('plastic', 9 + i * 1.4, 0, 1.0, 1.0, 1.8, 0.7, { color: '#e85d1a', collide: true });
    B.box('neon', 9 + i * 1.4, 1.0, 1.36, 0.5, 0.45, 0.02, { color: '#8fd3ff' });
  }
  if (s.home) {
    ctx.interactables.push({ id: 'ticket_window', kind: 'ticket', ...B.world(-1.7, 0, 6.3), radius: 2.8, label: 'Buy local train ticket', data: { shopId: 'ticket_window' } });
    ctx.interactables.push({ id: 'atvm_sagar', kind: 'ticket', ...B.world(9.7, 0, 2.4), radius: 2.0, label: 'Ticket vending machine (ATVM)', data: { shopId: 'ticket_window' } });
  } else {
    ctx.interactables.push({ id: `ticket_${s.id}`, kind: 'ticket', ...B.world(-1.7, 0, 6.3), radius: 2.8, label: 'Buy local train ticket', data: { shopId: 'ticket_window' } });
  }
  ctx.npcSpots.push({ ...B.world(-1.7, 0, 4.3), heading: 0, role: 'clerk', name: 'Booking clerk' });
  // Book stall + benches in the hall
  const K = new Frame(ctx, 186, PH, hz1 - 2.5, Math.PI);
  K.box('paint', 0, 0, 0, 3.5, 1.1, 1.4, { color: '#2a6e3f', collide: true });
  K.box('paint', 0, 1.1, 0.3, 3.5, 1.5, 0.3, { color: '#2a6e3f' });
  for (let i = 0; i < 12; i++) K.box('plastic', -1.5 + (i % 6) * 0.55, 1.15 + Math.floor(i / 6) * 0.6, 0.55, 0.4, 0.5, 0.05, { color: ctx.rng.pick(['#d33', '#f1c40f', '#3498db', '#fff']) });
  const bCell = ctx.mats.signs.add('Railway Book Stall', 'पुस्तक • अख़बार • मासिक', 3);
  K.sign(0, 2.65, 0.3, 3.4, 0.6, bCell);
  ctx.npcSpots.push({ ...K.world(0, 0, -1.2), heading: Math.PI, role: 'vendor', name: 'Bookstall uncle' });
  bench(ctx, 172, z + 12, Math.PI, PH);
  bench(ctx, 178, z + 12, Math.PI, PH);
  for (let i = 0; i < 6; i++) ctx.npcSpots.push({ x: ctx.rng.range(166, 190), y: PH, z: z + ctx.rng.range(-12, 16), heading: ctx.rng.range(0, 6.28), role: 'commuter' });
  ctx.anchors.set(`station_${s.id}_hall`, { x: 180, y: PH, z, heading: Math.PI / 2 });

  if (!s.home) stationPlaza(ctx, s);
}

/** Small enclosed exit plaza for stations outside the playable district. */
function stationPlaza(ctx: BuildContext, s: StationDef) {
  const z = s.z;
  const x0 = 128, x1 = 157.5, z0 = z - 30, z1 = z + 30;
  ctx.batch.add('paver', place(uvPlane(x1 - x0, z1 - z0, 1.5), (x0 + x1) / 2, 0.15, z));
  ctx.batch.add('concrete', place(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), (x0 + x1) / 2, 0.075, z), C('#bbb'));
  ctx.col.addSurface({ x0, z0, x1, z1, h: 0.15, tag: 'footpath' });
  // walls: north, south, west (with hoarding) and the station hall closes the east side
  wallSeg(ctx, x0, z0, x1, z0);
  wallSeg(ctx, x0, z1, x1, z1);
  wallSeg(ctx, x0, z0, x0, z1);
  wallSeg(ctx, 157.5, z0, 157.5, z - 22);
  wallSeg(ctx, 157.5, z + 22, 157.5, z1);
  ctx.batch.add('concrete', place(new THREE.BoxGeometry(2, 3, 44), 161, 1.5, z), C('#d8cdb5'));
  // stalls, auto stand, trees
  const F = Frame.facing(ctx, x0 + 6, 0.15, z - 18, 'E');
  F.box('rust', 0, 0, -1, 2.6, 1.0, 1.8, { color: '#6f7d84', collide: true });
  F.box('rust', 0, 2.4, -1, 3.0, 0.05, 2.6, { color: '#9aa2a6' });
  const cell = ctx.mats.signs.add(s.id === 'navrang' ? 'Navrang Snacks' : 'Station Canteen', 'चाय • नाश्ता', ctx.rng.int(0, 9));
  F.sign(0, 1.7, 0.05, 2.5, 0.5, cell);
  ctx.npcSpots.push({ ...F.world(0, 0, -2.5), heading: F.heading(0), role: 'vendor' });
  for (let i = 0; i < 8; i++) ctx.npcSpots.push({ x: ctx.rng.range(x0 + 4, x1 - 4), y: 0.15, z: ctx.rng.range(z0 + 4, z1 - 4), heading: ctx.rng.range(0, 6.28), role: 'idle' });
  tree(ctx, x0 + 4, 0.15, z + 20, 'rain');
  tree(ctx, x0 + 4, 0.15, z + 8, 'gulmohar');
  ctx.anchors.set(`station_${s.id}_plaza`, { x: x0 + 14, y: 0.15, z: z + 6, heading: Math.PI / 2 });
  for (let i = 0; i < 4; i++) ctx.parking.push({ x: x0 + 18, z: z + 14 + i * 2.6, heading: Math.PI / 2 });
}

function wallSeg(ctx: BuildContext, x0: number, z0: number, x1: number, z1: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = uvBox(Math.abs(x1 - x0) > 0.1 ? len : 0.3, 2.8, Math.abs(z1 - z0) > 0.1 ? len : 0.3, 3);
  ctx.batch.add('concrete', place(g, (x0 + x1) / 2, 1.4, (z0 + z1) / 2), C('#c9c1ae'));
  ctx.col.addWall(x0, z0, x1, z1, 0.4, -1, 3.2);
}

/** Dense backdrop buildings along the corridor outside the district (seen from the train). */
function trackside(ctx: BuildContext, z0: number, z1: number) {
  const rng = ctx.rng;
  const styles = ['facade_apartment', 'facade_chawl', 'facade_settlement', 'facade_modern', 'facade_apartment_b', 'facade_chawl_b'];
  const tints = ['#efe3c8', '#f2d7a8', '#d9e6e3', '#f4c9b5', '#e8e1f0', '#cfe0c4', '#f1ead8', '#ffffff'];
  const stationNear = (z: number, pad: number) => STATIONS.some((s) => !s.home && Math.abs(s.z - z) < pad);
  for (const side of [-1, 1]) {
    for (let z = z0; z < z1; ) {
      const w = rng.range(10, 24);
      const inDistrict = z > -275 && z < 275;
      if ((side < 0 && inDistrict) || (side < 0 && stationNear(z, 40))) { z += w; continue; }
      const floors = rng.chance(0.15) ? rng.int(10, 22) : rng.int(2, 7);
      const h = floors * 3.1;
      const d = rng.range(10, 18);
      const x = side < 0 ? RAIL.corridorX0 - 3 - d / 2 - rng.range(0, 4) : RAIL.corridorX1 + 3 + d / 2 + rng.range(0, 4);
      const g = uvBox(d, h, w - 1, 14, 9.3, 0, { py: false, ny: false });
      ctx.batch.add(rng.pick(styles), place(g, x, h / 2, z + w / 2), C(rng.pick(tints)));
      ctx.batch.add('concrete_dark', place(new THREE.BoxGeometry(d, 0.3, w - 1), x, h, z + w / 2));
      if (rng.chance(0.6)) ctx.batch.add('plastic', place(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 10), x + rng.range(-d / 3, d / 3), h + 0.8, z + w / 2), C('#161616'));
      // a second row further back for density
      if (rng.chance(0.7)) {
        const f2 = rng.int(4, 18), h2 = f2 * 3.1;
        const g2 = uvBox(14, h2, w - 2, 14, 9.3, 0, { py: false, ny: false });
        ctx.batch.add(rng.pick(styles), place(g2, x + side * (d / 2 + 10), h2 / 2, z + w / 2), C(rng.pick(tints)));
      }
      z += w;
    }
  }
}
