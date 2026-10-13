// Hand-authored landmark structures (petrol pump, garage, showroom, temple, chawl, office tower...).
import * as THREE from 'three';
import { BuildContext, C } from './BuildContext';
import { Frame } from './Frame';
import { Landmark, rect } from './layout';
import { genericBuilding, KERB_H, FLOOR_H, billboard } from './buildings';
import { textPanel } from './textures';
import { uvPlane, place } from './geom';
import { tree } from './props';

export function buildLandmark(ctx: BuildContext, l: Landmark) {
  ctx.reserve(l.r);
  switch (l.kind) {
    case 'petrol': return petrol(ctx, l);
    case 'garage': return garage(ctx, l);
    case 'showroom': return showroom(ctx, l);
    case 'office': return office(ctx, l);
    case 'chawl': return chawl(ctx, l);
    case 'temple': return temple(ctx, l);
    case 'park': return park(ctx, l);
    case 'maidan': return maidan(ctx, l);
    case 'hospital': return hospital(ctx, l);
    case 'police': return police(ctx, l);
    case 'mall': return mall(ctx, l);
    case 'school': return school(ctx, l);
    case 'settlement': return settlement(ctx, l);
    case 'busdepot': return busDepot(ctx, l);
    case 'apartments': return towers(ctx, l);
    case 'station': return; // built by railway.ts
  }
}

function petrol(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const F = new Frame(ctx, (r.x0 + r.x1) / 2, KERB_H, (r.z0 + r.z1) / 2, -Math.PI / 2); // front faces west (coastal road)
  // concrete apron
  ctx.batch.add('concrete', place(uvPlane(r.x1 - r.x0, r.z1 - r.z0, 4), (r.x0 + r.x1) / 2, KERB_H + 0.01, (r.z0 + r.z1) / 2), C('#c9c6bd'));
  // canopy on 4 pillars
  for (const px of [-7, 7]) for (const pz of [-4, 4]) F.box('paint', px, 0, pz, 0.6, 5.2, 0.6, { color: '#f2f2f2', collide: true });
  F.box('paint', 0, 5.2, 0, 20, 0.9, 12, { color: '#f4f4f4' });
  F.box('paint', 0, 5.25, 6.02, 20, 0.8, 0.06, { color: '#0d5aa7' });
  F.box('paint', 0, 5.25, -6.02, 20, 0.8, 0.06, { color: '#0d5aa7' });
  F.box('paint', 0, 5.6, 6.06, 20, 0.12, 0.04, { color: '#f5b400' });
  F.box('lamp_white', 0, 5.15, 0, 16, 0.05, 9);
  ctx.lights.push({ ...F.world(0, 5, 0), kind: 'flood' });
  ctx.lights.push({ ...F.world(-5, 5, 0), kind: 'flood' });
  // dispensers on islands
  for (const pz of [-2.5, 2.5]) {
    F.box('concrete', 0, 0, pz, 9, 0.2, 1.2, { color: '#d0ccc2' });
    for (const px of [-2.5, 2.5]) {
      F.box('plastic', px, 0.2, pz, 0.9, 1.9, 0.6, { color: '#f5f5f5', collide: true });
      F.box('paint', px, 1.2, pz, 0.92, 0.5, 0.62, { color: '#0d5aa7' });
      F.box('neon', px, 1.55, pz + 0.31, 0.6, 0.25, 0.02, { color: '#79ff7a' });
      F.box('neon', px, 1.55, pz - 0.31, 0.6, 0.25, 0.02, { color: '#79ff7a' });
      const wp = F.world(px, 0, pz + (pz > 0 ? 1.8 : -1.8));
      ctx.interactables.push({ id: `pump_${px}_${pz}`, kind: 'pump', ...wp, radius: 3.2, label: 'Refuel vehicle', data: { shopId: 'petrol' } });
    }
  }
  // kiosk + price board
  F.box('concrete', 0, 0, -13, 10, 3.4, 5, { color: '#f4f1ea', collide: true, tile: 3 });
  F.box('glass', 0, 0.3, -10.45, 7, 2.4, 0.06);
  F.box('paint', 0, 3.4, -13, 10.4, 0.6, 5.4, { color: '#0d5aa7' });
  const priceTex = textPanel([
    { text: 'SAGAR FUELS', color: '#f5b400', size: 0.3, weight: '900' },
    { text: 'PETROL  ₹104.50 / L', color: '#ffffff', size: 0.25 },
    { text: 'DIESEL   ₹92.30 / L', color: '#ffffff', size: 0.25 },
  ], '#0d3f7a', 512, 384);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({ map: priceTex, emissiveMap: priceTex, emissive: 0xffffff, emissiveIntensity: 0.4 }));
  const bp = F.world(-11, 3.5, 9);
  board.position.set(bp.x, bp.y, bp.z);
  board.rotation.y = F.heading(0);
  ctx.dynamic.add(board);
  F.box('metal', -11, 0, 9, 0.2, 2.6, 0.2, { color: '#777' });
  ctx.npcSpots.push({ ...F.world(2.5, 0, 0), heading: F.heading(0), role: 'attendant', name: 'Pump attendant', shopId: 'petrol' });
  ctx.npcSpots.push({ ...F.world(-2.5, 0, -3.8), heading: F.heading(Math.PI), role: 'attendant' });
  // air & water post
  F.box('paint', 8, 0, -9, 0.4, 1.3, 0.4, { color: '#c0392b' });
}

function garage(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const rng = ctx.rng;
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z1, 'S');
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  ctx.batch.add('concrete_dark', place(uvPlane(w, d, 3), (r.x0 + r.x1) / 2, KERB_H + 0.01, (r.z0 + r.z1) / 2));
  // shed: back wall + side walls + corrugated roof
  F.box('rust', 0, 0, -d + 0.2, w, 5, 0.4, { color: '#8d9599', collide: true, tile: 2 });
  F.box('rust', -w / 2 + 0.2, 0, -d / 2, 0.4, 5, d, { color: '#8d9599', collide: true, tile: 2 });
  F.box('rust', w / 2 - 0.2, 0, -d / 2 - d * 0.2, 0.4, 5, d * 0.6, { color: '#8d9599', collide: true, tile: 2 });
  F.box('rust', 0, 5, -d / 2 + 1, w + 0.6, 0.08, d + 2, { color: '#a7aeb0', rx: 0.06 });
  for (let i = 0; i < 4; i++) F.box('metal', -w / 2 + 2 + i * ((w - 4) / 3), 0, -2, 0.25, 5, 0.25, { color: '#444' });
  const cell = ctx.mats.signs.add('Sharma Auto Works', 'शर्मा ऑटो वर्क्स', 8);
  F.box('paint', 0, 5.1, 0.6, 12, 1.4, 0.15, { color: '#222' });
  F.sign(0, 5.15, 0.7, 11.6, 1.3, cell);
  // workshop clutter: tyre stacks, oil drums, workbench, car lift
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < rng.int(2, 5); k++) F.geo('rust', new THREE.TorusGeometry(0.32, 0.12, 6, 12), -w / 2 + 1.2, 0.12 + k * 0.24, -d + 1.5 + i * 1.1, 0, '#1a1a1a', 1, 1, 1, Math.PI / 2);
  }
  for (let i = 0; i < 3; i++) F.cyl('rust', w / 2 - 1.2, 0, -d + 1.2 + i * 0.9, 0.3, 0.9, rng.pick(['#1e5aa8', '#b22222', '#2e7d32']), 12);
  F.box('paint', 0, 0, -d + 1, 4, 0.9, 0.8, { color: '#5b3a22', collide: true });
  F.box('metal', 0, 0.9, -d + 1, 3.6, 0.1, 0.6, { color: '#888' });
  F.box('metal', 4, 0, -d + 6, 0.3, 1.6, 4, { color: '#c0392b' });
  F.box('metal', 6.6, 0, -d + 6, 0.3, 1.6, 4, { color: '#c0392b' });
  F.box('lamp_white', 0, 4.8, -d / 2, 2, 0.05, 0.1);
  ctx.lights.push({ ...F.world(0, 4.5, -d / 2), kind: 'tube' });
  ctx.npcSpots.push({ ...F.world(0, 0, -d + 2.1), heading: F.heading(0), role: 'mechanic', name: 'Sharma Mama', shopId: 'garage' });
  ctx.npcSpots.push({ ...F.world(5.3, 0, -d + 4.5), heading: F.heading(Math.PI / 2), role: 'mechanic', name: 'Chhotu' });
  ctx.interactables.push({ id: 'garage', kind: 'garage', ...F.world(0, 0, -d + 3.8), radius: 3, label: 'Talk to Sharma Mama (garage)', data: { shopId: 'garage' } });
  // parking spots for player vehicles (inside, facing street)
  for (let i = 0; i < 4; i++) ctx.anchors.set(`garage_spot_${i}`, { ...F.world(-w / 2 + 4 + i * 6.5, 0, -d / 2 + 2), heading: F.heading(0) });
}

function showroom(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z1, 'S');
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  F.box('paver_warm', 0, 0, -d / 2, w, 0.06, d, { tile: 1.2 });
  F.box('glass', 0, 0.06, -0.3, w - 1, 6.5, 0.1, { collide: true });
  F.box('concrete', 0, 0, -d + 0.3, w, 7.5, 0.6, { color: '#f5f5f5', collide: true, tile: 3 });
  F.box('concrete', -w / 2 + 0.3, 0, -d / 2, 0.6, 7.5, d, { color: '#f5f5f5', collide: true, tile: 3 });
  F.box('concrete', w / 2 - 0.3, 0, -d / 2, 0.6, 7.5, d, { color: '#f5f5f5', collide: true, tile: 3 });
  F.box('concrete', 0, 6.56, -d / 2, w, 1.0, d, { color: '#eeeeee', tile: 3 });
  F.box('facade_glass', 0, 7.5, -d / 2, w, FLOOR_H * 2, d, { tile: 14, tileV: 9.3, faces: { ny: false } });
  F.collider(-w / 2, -d, w / 2, 0, 6.5, 7.5 + FLOOR_H * 2);
  const cell = ctx.mats.signs.add('Rajhans Motors', 'राजहंस मोटर्स • Authorised Dealer', 7);
  F.box('paint', 0, 6.6, 0.02, w * 0.7, 1.0, 0.1, { color: '#111' });
  F.sign(0, 6.62, 0.1, w * 0.68, 0.95, cell);
  for (let i = 0; i < 3; i++) F.box('lamp_white', -w / 3 + i * (w / 3), 6.5, -d / 2, 3, 0.05, 0.4);
  ctx.lights.push({ ...F.world(0, 6, -d / 2), kind: 'tube' });
  // door gap in glass: entrance at centre (glass wall split)
  ctx.anchors.set('showroom_display_0', { ...F.world(-w / 4, 0.06, -d / 2), heading: F.heading(Math.PI / 4) });
  ctx.anchors.set('showroom_display_1', { ...F.world(w / 4, 0.06, -d / 2 - 2), heading: F.heading(-Math.PI / 4) });
  ctx.anchors.set('showroom_delivery', { ...F.world(0, 0, 4.5), heading: F.heading(Math.PI / 2) });
  ctx.npcSpots.push({ ...F.world(0, 0.06, 1.2), heading: F.heading(0), role: 'shopkeeper', name: 'Ms. Kapoor', shopId: 'showroom' });
  ctx.interactables.push({ id: 'showroom', kind: 'showroom', ...F.world(0, 0, 1.8), radius: 2.8, label: 'Browse vehicles (Rajhans Motors)', data: { shopId: 'showroom' } });
}

function office(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const floors = l.floors ?? 20;
  // glass tower set back from Nehru Road with an entrance plaza facing west
  genericBuilding(ctx, rect(r.x0 + 7, r.z0, r.x1, r.z1), { floors, style: 'glass', tint: '#ffffff', front: 'W', shops: false, zone: 'corporate' });
  const F = Frame.facing(ctx, r.x0, KERB_H, (r.z0 + r.z1) / 2, 'W');
  F.box('paver_warm', 0, 0.01, -3.5, 16, 0.03, 7, { tile: 1.2 });
  F.box('metal', 0, 4, -4, 12, 0.3, 6, { color: '#c8cdd0' });
  F.box('metal', -5.5, 0, -1.2, 0.3, 4, 0.3, { color: '#c8cdd0', collide: true });
  F.box('metal', 5.5, 0, -1.2, 0.3, 4, 0.3, { color: '#c8cdd0', collide: true });
  const cell = ctx.mats.signs.add('Infinity Tower', 'इन्फ़िनिटी टावर • Business Park', 8);
  F.sign(0, 4.35, -0.98, 8, 1.1, cell);
  F.box('paint', -4, 0, -5, 1.6, 2.2, 1.4, { color: '#c8cdd0', collide: true });
  ctx.npcSpots.push({ ...F.world(-4, 0, -3.8), heading: F.heading(0), role: 'guard', name: 'Security guard' });
  ctx.interactables.push({ id: 'office_door', kind: 'door', ...F.world(0, 0, -6.2), radius: 2.4, label: 'Enter Infinity Tower', data: { interior: 'office' } });
  ctx.anchors.set('office_entrance', { ...F.world(0, 0, -4), heading: F.heading(0) });
  for (const s of [-1, 1]) F.cyl('paint', s * 7, 0, -2, 0.5, 0.6, '#8a8278', 12);
}

function chawl(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  genericBuilding(ctx, rect(r.x0, r.z0 + 1.5, r.x1, r.z1), { floors: l.floors ?? 4, style: 'chawl', tint: '#e8d4ae', front: 'N', shops: false, zone: 'chawl' });
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z0 + 1.5, 'N');
  const cell = ctx.mats.signs.add('Shanti Niwas', 'शांति निवास चाल • 1952', 1);
  F.sign(0, FLOOR_H * 4 + 0.3, 0.1, 8, 1.1, cell);
  // stair entrance at west end
  const w = r.x1 - r.x0;
  F.box('paint', w / 2 - 3, 0, 0.3, 2.2, 2.4, 0.2, { color: '#3b2a1a' });
  ctx.interactables.push({ id: 'chawl_door', kind: 'door', ...F.world(w / 2 - 3, 0, 1.2), radius: 2, label: 'Enter Shanti Niwas (your room)', data: { interior: 'room', requires: 'room_shanti' } });
  ctx.anchors.set('home_door', { ...F.world(w / 2 - 3, 0, 1.6), heading: F.heading(0) });
  // community water tap & bench
  F.box('concrete', -w / 4, 0, 1.2, 1.2, 0.5, 0.6, { color: '#999' });
  ctx.npcSpots.push({ ...F.world(-w / 4 + 1, 0, 1.8), heading: F.heading(Math.PI), role: 'idle', name: 'Joshi kaka' });
  ctx.npcSpots.push({ ...F.world(-w / 4 - 1, 0, 1.8), heading: F.heading(Math.PI * 0.8), role: 'idle' });
}

function temple(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z1, 'S');
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  // compound wall with gate
  F.box('concrete', -w / 4 - 1, 0, -0.2, w / 2 - 2, 1.4, 0.3, { color: '#e8a33c', collide: true });
  F.box('concrete', w / 4 + 1, 0, -0.2, w / 2 - 2, 1.4, 0.3, { color: '#e8a33c', collide: true });
  F.box('concrete', -w / 2 + 0.15, 0, -d / 2, 0.3, 1.4, d, { color: '#e8a33c', collide: true });
  F.box('concrete', w / 2 - 0.15, 0, -d / 2, 0.3, 1.4, d, { color: '#e8a33c', collide: true });
  F.box('concrete', 0, 0, -d + 0.15, w, 1.4, 0.3, { color: '#e8a33c', collide: true });
  // gate arch
  F.box('concrete', -2, 0, -0.2, 0.6, 4, 0.6, { color: '#d4881f' });
  F.box('concrete', 2, 0, -0.2, 0.6, 4, 0.6, { color: '#d4881f' });
  F.box('concrete', 0, 4, -0.2, 5, 0.8, 0.7, { color: '#d4881f' });
  // plinth with steps
  const pz = -d * 0.55;
  F.box('concrete', 0, 0, pz, 12, 1.2, 12, { color: '#efe4d0', collide: true });
  for (let i = 0; i < 4; i++) {
    F.box('concrete', 0, 0, pz + 6 + 1.2 - i * 0.3, 4, 0.3 * (i + 1), 0.3, { color: '#efe4d0' });
  }
  F.surface(-2, pz + 6, 2, pz + 7.3, 0.6, 'stone');
  ctx.col.addSurface({ ...rectFromFrame(F, -6, pz - 6, 6, pz + 6), h: KERB_H + 1.2, tag: 'stone' });
  // mandapa: pillars and flat roof
  for (const px of [-4.5, -1.5, 1.5, 4.5]) F.box('concrete', px, 1.2, pz + 4.5, 0.5, 3, 0.5, { color: '#f6efe2', collide: true });
  F.box('concrete', 0, 4.2, pz + 3, 11, 0.4, 5, { color: '#f6efe2' });
  // garbhagriha + shikhara (stacked tapering tiers)
  F.box('concrete', 0, 1.2, pz - 2, 6, 4, 6, { color: '#f6efe2', collide: true });
  for (let i = 0; i < 8; i++) {
    const s = 6 - i * 0.65;
    F.box('concrete', 0, 5.2 + i * 0.9, pz - 2, s, 0.9, s, { color: i % 2 ? '#f0c27a' : '#f6efe2' });
  }
  F.geo('metal', new THREE.SphereGeometry(0.5, 12, 8), 0, 12.9, pz - 2, 0, '#d4a017');
  F.geo('metal', new THREE.ConeGeometry(0.2, 0.9, 8), 0, 13.7, pz - 2, 0, '#d4a017');
  // saffron flag
  F.cyl('metal', 0.4, 13, pz - 2, 0.03, 2.5, '#888', 5);
  F.geo('fabric', triangle(1.2, 0.7), 0.4, 15.1, pz - 2, 0, '#ff7f00');
  // deity alcove glow and bell
  F.box('lamp', 0, 2.2, pz + 1.02, 1.6, 1.8, 0.05, { color: '#ff9a3c' });
  ctx.lights.push({ ...F.world(0, 3, pz + 2), kind: 'shop' });
  F.geo('metal', new THREE.ConeGeometry(0.22, 0.35, 10, 1, true), 0, 3.6, pz + 4.6, 0, '#c9a227');
  // marigold garlands on gate
  for (let i = 0; i < 10; i++) F.geo('plastic', new THREE.SphereGeometry(0.09, 6, 4), -2 + i * 0.45, 3.8 - Math.sin((i / 9) * Math.PI) * 0.4, 0.2, 0, i % 2 ? '#ff8c00' : '#ffd000');
  ctx.npcSpots.push({ ...F.world(0, 1.2, pz + 1.8), heading: F.heading(0), role: 'priest', name: 'Pujari ji' });
  ctx.npcSpots.push({ ...F.world(-1, 1.2, pz + 3.5), heading: F.heading(Math.PI), role: 'devotee' });
  ctx.npcSpots.push({ ...F.world(1.2, 1.2, pz + 3.2), heading: F.heading(Math.PI), role: 'devotee' });
  ctx.interactables.push({ id: 'temple', kind: 'npc', ...F.world(0, 1.2, pz + 3), radius: 2.5, label: 'Offer prayers', data: { npc: 'pujari' } });
  ctx.anchors.set('temple', { ...F.world(0, 0, 1), heading: F.heading(0) });
}

function rectFromFrame(F: Frame, lx0: number, lz0: number, lx1: number, lz1: number) {
  const [ax, az] = F.p(lx0, lz0);
  const [bx, bz] = F.p(lx1, lz1);
  return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
}

function triangle(w: number, h: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, w, -h / 2, 0, 0, -h, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

function park(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const rng = ctx.rng;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  ctx.batch.add('grass', place(uvPlane(w, d, 6), cx, KERB_H + 0.02, cz));
  // walking track loop
  for (const [x, z, ww, dd] of [[cx, r.z0 + 3, w - 4, 2.2], [cx, r.z1 - 3, w - 4, 2.2], [r.x0 + 3, cz, 2.2, d - 4], [r.x1 - 3, cz, 2.2, d - 4]] as const) {
    ctx.batch.add('dirt', place(uvPlane(ww, dd, 3), x, KERB_H + 0.04, z));
  }
  // railing fence with gate on south side
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(len, 1.1, 0.06);
    place(g, (x0 + x1) / 2, KERB_H + 0.55, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    ctx.batch.add('metal', g, C('#2f6b3a'));
    ctx.col.addWall(x0, z0, x1, z1, 0.15, 0, 1.2);
  };
  fence(r.x0, r.z0, r.x1, r.z0);
  fence(r.x0, r.z0, r.x0, r.z1);
  fence(r.x1, r.z0, r.x1, r.z1);
  fence(r.x0, r.z1, cx - 2, r.z1);
  fence(cx + 2, r.z1, r.x1, r.z1);
  const sign = ctx.mats.signs.add('Nana-Nani Park', 'नाना-नानी पार्क • BMC', 3);
  const F = Frame.facing(ctx, cx, KERB_H, r.z1, 'S');
  F.box('metal', -2.2, 0, 0, 0.12, 3, 0.12, { color: '#2f6b3a' });
  F.box('metal', 2.2, 0, 0, 0.12, 3, 0.12, { color: '#2f6b3a' });
  F.sign(0, 2.2, 0.05, 4.2, 0.8, sign);
  // trees, benches, swing frame
  for (let i = 0; i < 22; i++) {
    const x = rng.range(r.x0 + 6, r.x1 - 6), z = rng.range(r.z0 + 6, r.z1 - 6);
    if (Math.abs(x - cx) < 8 && Math.abs(z - cz) < 6) continue;
    tree(ctx, x, KERB_H, z, rng.pick(['rain', 'gulmohar', 'neem']));
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const x = r.x0 + 10 + (i >> 1) * ((w - 20) / 3), z = cz + side * (d / 2 - 6);
    bench(ctx, x, z, side > 0 ? Math.PI : 0);
  }
  const S = Frame.facing(ctx, cx, KERB_H, cz, 'S');
  S.box('metal', -2, 0, 0, 0.1, 2.6, 0.1, { color: '#c0392b' });
  S.box('metal', 2, 0, 0, 0.1, 2.6, 0.1, { color: '#c0392b' });
  S.box('metal', 0, 2.6, 0, 4.1, 0.1, 0.1, { color: '#c0392b' });
  S.box('plastic', -1, 0.5, 0, 0.6, 0.06, 0.3, { color: '#f1c40f' });
  S.box('plastic', 1, 0.5, 0, 0.6, 0.06, 0.3, { color: '#2980b9' });
  ctx.anchors.set('park', { x: cx, y: KERB_H, z: r.z1 + 1 });
  for (let i = 0; i < 6; i++) ctx.npcSpots.push({ x: rng.range(r.x0 + 8, r.x1 - 8), y: KERB_H, z: rng.range(r.z0 + 8, r.z1 - 8), heading: rng.range(0, 6.28), role: 'idle' });
}

export function bench(ctx: BuildContext, x: number, z: number, heading: number, y = KERB_H) {
  const F = new Frame(ctx, x, y, z, heading);
  F.box('paint', 0, 0.42, 0, 1.8, 0.06, 0.45, { color: '#6b4a2e' });
  F.box('paint', 0, 0.5, -0.22, 1.8, 0.4, 0.05, { color: '#6b4a2e' });
  F.box('metal', -0.8, 0, 0, 0.06, 0.42, 0.4, { color: '#333' });
  F.box('metal', 0.8, 0, 0, 0.06, 0.42, 0.4, { color: '#333' });
  F.collider(-0.9, -0.25, 0.9, 0.25, 0, 0.5);
  ctx.benches.push({ ...F.world(-0.45, 0.42, 0.05), heading });
  ctx.benches.push({ ...F.world(0.45, 0.42, 0.05), heading });
}

function maidan(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  ctx.batch.add('dirt', place(uvPlane(w, d, 8), cx, KERB_H + 0.02, cz));
  // patches of grass
  for (let i = 0; i < 8; i++) {
    ctx.batch.add('grass', place(uvPlane(ctx.rng.range(10, 25), ctx.rng.range(8, 20), 6), ctx.rng.range(r.x0 + 15, r.x1 - 15), KERB_H + 0.03, ctx.rng.range(r.z0 + 12, r.z1 - 12)));
  }
  // cricket pitch + stumps
  ctx.batch.add('paint', place(uvPlane(3, 20, 1), cx, KERB_H + 0.04, cz), C('#c8b48a'));
  for (const e of [-1, 1]) for (let s = -1; s <= 1; s++) {
    const g = new THREE.CylinderGeometry(0.02, 0.02, 0.71, 5);
    ctx.batch.add('paint', place(g, cx + s * 0.11, KERB_H + 0.38, cz + e * 10), C('#f2e3c6'));
  }
  // low wall and pavilion
  ctx.col.addWall(r.x0, r.z1, r.x1, r.z1, 0.3, 0, 0.8);
  const g = new THREE.BoxGeometry(w, 0.8, 0.3);
  ctx.batch.add('concrete', place(g, cx, KERB_H + 0.4, r.z1), C('#d8d2c4'));
  const P = Frame.facing(ctx, r.x1 - 10, KERB_H, r.z0 + 6, 'W');
  P.box('concrete', 0, 0, -3, 12, 3, 6, { color: '#f0e6d6', collide: true, tile: 3 });
  P.box('paint', 0, 3, -2, 13, 0.2, 8, { color: '#2e6b3c' });
  const cell = ctx.mats.signs.add('Shivaji Maidan', 'शिवाजी मैदान • Cricket Club', 3);
  P.sign(0, 3.3, 2.05, 6, 0.9, cell);
  for (let i = 0; i < 18; i++) tree(ctx, ctx.rng.range(r.x0 + 2, r.x1 - 2), KERB_H, ctx.rng.chance(0.5) ? r.z0 + 2 : r.z1 - 2.5, 'rain');
  // cricket players (stationary poses for now)
  const roles = ['batsman', 'bowler', 'fielder', 'fielder', 'fielder', 'keeper', 'fielder'];
  roles.forEach((role, i) => {
    const pos = role === 'batsman' ? { x: cx + 0.4, z: cz - 9.2 } : role === 'keeper' ? { x: cx, z: cz - 12 } : role === 'bowler' ? { x: cx, z: cz + 12 } : { x: cx + Math.cos(i * 1.3) * 30, z: cz + Math.sin(i * 1.3) * 25 };
    ctx.npcSpots.push({ x: pos.x, y: KERB_H, z: pos.z, heading: role === 'batsman' || role === 'keeper' ? 0 : Math.PI, role: 'cricket' });
  });
  ctx.anchors.set('maidan', { x: cx, y: KERB_H, z: cz });
}

function hospital(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  genericBuilding(ctx, rect(r.x0, r.z0 + 4, r.x1, r.z1), { floors: l.floors ?? 6, style: 'modern', tint: '#f7f7f5', front: 'N', shops: false, zone: 'mixed' });
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z0 + 4, 'N');
  F.box('paint', 0, 3.6, 2, 12, 0.3, 4, { color: '#f0f0f0' });
  F.box('paint', -5.6, 0, 3.8, 0.3, 3.6, 0.3, { color: '#eee', collide: true });
  F.box('paint', 5.6, 0, 3.8, 0.3, 3.6, 0.3, { color: '#eee', collide: true });
  const cell = ctx.mats.signs.add('Lifeline Hospital', 'लाइफ़लाइन अस्पताल • 24x7 Emergency', 0);
  F.sign(0, FLOOR_H * 6 - 2.2, 0.1, 14, 1.8, cell);
  F.box('neon', 0, FLOOR_H * 6 + 0.4, 0.2, 0.8, 2.4, 0.15, { color: '#ff2a2a' });
  F.box('neon', 0, FLOOR_H * 6 + 1.2, 0.2, 2.4, 0.8, 0.15, { color: '#ff2a2a' });
  ctx.interactables.push({ id: 'hospital_desk', kind: 'hospital', ...F.world(0, 0, 2.5), radius: 2.5, label: 'Hospital reception', data: { shopId: 'hospital_desk' } });
  ctx.anchors.set('hospital', { ...F.world(0, 0, 3), heading: F.heading(0) });
  ctx.anchors.set('ambulance_bay', { ...F.world(9, 0, 3), heading: F.heading(Math.PI / 2) });
  ctx.npcSpots.push({ ...F.world(-3, 0, 2.2), heading: F.heading(0), role: 'guard', name: 'Ward boy' });
}

function police(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z0, 'N');
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  F.box('concrete', 0, 0, -d / 2 - 1, w - 2, 3.4, d - 4, { color: '#2a5fa6', collide: true, tile: 3 });
  F.box('concrete', 0, 3.4, -d / 2 - 1, w - 1.6, 0.4, d - 3.6, { color: '#f2f2f2' });
  F.box('concrete', 0, 0, -d / 2 - 1, w - 2.02, 1.0, d - 4.02, { color: '#f2f2f2' });
  const cell = ctx.mats.signs.add('Police Chowki', 'पुलिस चौकी • सागर नगर', 1);
  F.sign(0, 2.5, -2.98, 6, 0.8, cell, Math.PI);
  F.box('paint', -3, 0, -1.5, 2.8, 0.9, 0.3, { color: '#f5d10a' });
  F.box('paint', -3, 0.9, -1.5, 2.8, 0.2, 0.32, { color: '#111' });
  ctx.npcSpots.push({ ...F.world(1.5, 0, -2), heading: F.heading(Math.PI), role: 'police', name: 'Havaldar Patil' });
  ctx.anchors.set('police', { ...F.world(0, 0, -1), heading: F.heading(Math.PI) });
}

function mall(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z1, 'S');
  const w = r.x1 - r.x0, d = r.z1 - r.z0 - 12;
  const h = (l.floors ?? 5) * 4.5;
  F.box('facade_modern_b', 0, 0, -12 - d / 2, w, h, d, { color: '#e9edf0', tile: 14, tileV: 9.3, faces: { py: false } });
  F.collider(-w / 2, -12 - d, w / 2, -12, 0, h);
  F.box('concrete_dark', 0, h, -12 - d / 2, w, 0.3, d);
  F.box('glass', 0, 0, -12.05, w * 0.5, h * 0.8, 0.1);
  F.box('metal', 0, h * 0.8, -11.6, w * 0.55, 0.6, 1.2, { color: '#ccd' });
  const cell = ctx.mats.signs.add('Sagar Central', 'सागर सेंट्रल मॉल', 6);
  F.sign(0, h * 0.82, -11.5, 24, 4, cell);
  // giant LED screen
  F.box('neon', w / 2 - 14, h * 0.35, -11.9, 16, 9, 0.2, { color: '#3d7bff' });
  // forecourt drop-off & parked cars area
  F.box('paver', 0, 0, -6, w, 0.04, 12, { tile: 1.2 });
  for (let i = 0; i < 6; i++) ctx.npcSpots.push({ ...F.world(-w / 4 + i * 4, 0, -8), heading: F.heading(ctx.rng.range(-1, 1)), role: 'idle' });
  ctx.anchors.set('mall', { ...F.world(0, 0, -4), heading: F.heading(0) });
}

function school(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  genericBuilding(ctx, rect(r.x0, r.z0, r.x1, r.z0 + 16), { floors: 3, style: 'apartment', tint: '#f3d36b', front: 'S', shops: false, zone: 'mixed' });
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z0 + 16, 'S');
  const cell = ctx.mats.signs.add('Vidya Mandir School', 'विद्या मंदिर • Estd. 1968', 4);
  F.sign(0, FLOOR_H * 3 - 1.6, 0.06, 12, 1.4, cell);
  ctx.batch.add('dirt', place(uvPlane(r.x1 - r.x0, r.z1 - r.z0 - 16, 5), (r.x0 + r.x1) / 2, KERB_H + 0.02, r.z0 + 16 + (r.z1 - r.z0 - 16) / 2));
  ctx.col.addWall(r.x0, r.z0, r.x0, r.z1, 0.25, 0, 1.8);
  ctx.col.addWall(r.x1, r.z0, r.x1, r.z1, 0.25, 0, 1.8);
  for (const x of [r.x0, r.x1]) ctx.batch.add('concrete', place(new THREE.BoxGeometry(0.25, 1.8, r.z1 - r.z0), x, KERB_H + 0.9, (r.z0 + r.z1) / 2), C('#e8d9a0'));
}

function settlement(ctx: BuildContext, l: Landmark) {
  // Dense self-built neighbourhood: small houses, narrow lanes, colourful walls, blue tarps.
  const { r } = l;
  const rng = ctx.rng;
  const lane = 2.2;
  for (let z = r.z0 + 1; z < r.z1 - 5; z += 9) {
    for (let x = r.x0 + 1; x < r.x1 - 4; ) {
      const w = rng.range(3.2, 5.5);
      if (x + w > r.x1 - 1) break;
      const d = rng.range(5.5, 7.5);
      const floors = rng.chance(0.35) ? 2 : 1;
      const h = floors * 2.8;
      const col = rng.pick(['#5aa0c8', '#e7b04a', '#d96a5b', '#86b86a', '#c9b3e0', '#f2efe6', '#e08ab0', '#7fc4b0']);
      const g = new THREE.BoxGeometry(w - 0.1, h, d);
      ctx.batch.add('facade_settlement', place(g, x + w / 2, KERB_H + h / 2, z + d / 2), C(col));
      ctx.col.addBox(x, z, x + w - 0.1, z + d, 0, h + KERB_H);
      // corrugated roof sheet, sometimes with tarp + stones holding it
      const roof = new THREE.BoxGeometry(w + 0.3, 0.05, d + 0.4);
      ctx.batch.add('rust', place(roof, x + w / 2, KERB_H + h + 0.05, z + d / 2, 0, 1, 1, 1, 0.05), C(rng.chance(0.4) ? '#2b5fa8' : '#9aa0a3'));
      for (let k = 0; k < 3; k++) ctx.batch.add('concrete', place(new THREE.DodecahedronGeometry(0.15), x + rng.range(0.3, w - 0.3), KERB_H + h + 0.15, z + rng.range(0.3, d - 0.3)));
      if (rng.chance(0.5)) {
        const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10);
        ctx.batch.add('plastic', place(drum, x + 0.4, KERB_H + 0.4, z + d + 0.4), C(rng.pick(['#1f5fbf', '#f1c40f', '#111'])));
      }
      if (rng.chance(0.3)) ctx.lights.push({ x: x + w / 2, y: KERB_H + 2.4, z: z + d + 0.3, kind: 'tube' });
      x += w + (rng.chance(0.15) ? lane : 0);
    }
    // lane walk spots
    ctx.npcSpots.push({ x: rng.range(r.x0 + 3, r.x1 - 3), y: KERB_H, z: z + 8, heading: rng.range(0, 6.28), role: 'idle' });
  }
}

function busDepot(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  ctx.batch.add('concrete_dark', place(uvPlane(w, d, 4), cx, KERB_H + 0.02, cz));
  const F = Frame.facing(ctx, r.x0, KERB_H, cz, 'W');
  for (let i = 0; i < 5; i++) F.box('metal', -d / 2 + 4 + i * ((d - 8) / 4), 0, -w + 4, 0.3, 6, 0.3, { color: '#556', collide: true });
  F.box('rust', 0, 6, -w + 8, d - 4, 0.1, 12, { color: '#8b9496', rx: -0.04 });
  const cell = ctx.mats.signs.add('MBT Bus Depot', 'बस डिपो • सागर नगर', 0);
  F.box('paint', 0, 0, -0.3, d - 16, 2.2, 0.3, { color: '#c9c3b5', collide: true });
  F.sign(0, 2.3, -0.1, 9, 1.0, cell);
  F.box('metal', 0, 0, -0.3, 0.2, 2.2, 0.2);
  ctx.anchors.set('depot_bus_0', { ...F.world(-8, 0, -w + 9), heading: F.heading(Math.PI / 2) });
  ctx.anchors.set('depot_bus_1', { ...F.world(8, 0, -w + 9), heading: F.heading(Math.PI / 2) });
}

function towers(ctx: BuildContext, l: Landmark) {
  const { r } = l;
  const w = r.x1 - r.x0;
  genericBuilding(ctx, rect(r.x0, r.z0, r.x0 + w * 0.42, r.z1 - 6), { floors: l.floors ?? 16, style: 'modern', tint: '#f4efe6', front: 'S', shops: false, zone: 'residential', billboard: false });
  genericBuilding(ctx, rect(r.x1 - w * 0.42, r.z0, r.x1, r.z1 - 6), { floors: (l.floors ?? 16) - 2, style: 'modern', tint: '#e6eef2', front: 'S', shops: false, zone: 'residential' });
  const F = Frame.facing(ctx, (r.x0 + r.x1) / 2, KERB_H, r.z1, 'S');
  // compound wall + gate + security cabin
  F.box('concrete', -w / 4 - 2, 0, -0.2, w / 2 - 4, 1.8, 0.3, { color: '#d9d2c3', collide: true });
  F.box('concrete', w / 4 + 2, 0, -0.2, w / 2 - 4, 1.8, 0.3, { color: '#d9d2c3', collide: true });
  F.box('paint', -4.5, 0, -1.6, 1.6, 2.3, 1.6, { color: '#c8c1b0', collide: true });
  const cell = ctx.mats.signs.add('Sea Breeze Towers', 'सी ब्रीज़ टावर्स CHS', 7);
  F.sign(0, 1.9, 0.0, 6, 0.8, cell);
  ctx.npcSpots.push({ ...F.world(-3.2, 0, -0.8), heading: F.heading(0), role: 'guard', name: 'Watchman' });
  billboard(ctx, F, 0, 1.8, -3, 10);
}
