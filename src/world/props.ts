// Street furniture and vegetation: trees, streetlights, poles & cable bundles, bus shelters, hoardings.
import * as THREE from 'three';
import { BuildContext, C } from './BuildContext';
import { Frame } from './Frame';
import { place } from './geom';

export type TreeKind = 'rain' | 'gulmohar' | 'neem' | 'palm' | 'ashoka';


/** Set foliage-card normals to point away from the canopy centre (soft, volumetric shading). */
function canopyNormals(g: THREE.BufferGeometry, c: THREE.Vector3, upBias = 0.45) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - c.x, pos.getY(i) - c.y + upBias * 2, pos.getZ(i) - c.z).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
}

export function tree(ctx: BuildContext, x: number, y: number, z: number, kind: TreeKind, scale = 1) {
  const rng = ctx.rng;
  const s = scale * rng.range(0.85, 1.2);
  if (kind === 'palm') {
    // Curved coconut palm: ringed trunk + drooping pinnate fronds.
    const h = 7.5 * s;
    const lean = rng.range(0.05, 0.3), dir = rng.range(0, Math.PI * 2);
    const segs = 8;
    let px = x, pz = z, py = y;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const off = (t: number) => lean * t * t * h * 0.45;
      const ax = x + Math.cos(dir) * off(t0), az = z + Math.sin(dir) * off(t0);
      const bx = x + Math.cos(dir) * off(t1), bz = z + Math.sin(dir) * off(t1);
      const ay = y + t0 * h, by = y + t1 * h;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const g = new THREE.CylinderGeometry(0.15 * s, 0.17 * s, len, 10);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
      g.applyQuaternion(q).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      ctx.batch.add('bark', g, C('#b9ab94'));
      px = bx; py = by; pz = bz;
    }
    const crown = new THREE.Vector3(px, py, pz);
    for (let f = 0; f < 13; f++) {
      const a = (f / 13) * Math.PI * 2 + rng.range(0, 0.3);
      const L = rng.range(3.4, 4.4) * s, W = 1.3 * s;
      const g = new THREE.PlaneGeometry(W, L, 1, 6);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const droop = rng.range(1.2, 2.2);
      for (let i = 0; i < pos.count; i++) {
        const v = (pos.getY(i) + L / 2) / L;
        pos.setZ(i, -v * v * droop * s);
        pos.setX(i, pos.getX(i) * (1 - v * 0.55));
      }
      g.translate(0, L / 2, 0);
      g.rotateX(-1.25 + rng.range(-0.3, 0.25));
      g.rotateY(a);
      g.translate(crown.x, crown.y, crown.z);
      g.computeVertexNormals();
      canopyNormals(g, crown.clone().add(new THREE.Vector3(0, -1, 0)), 0.6);
      ctx.batch.add('palm', g, C('#9fb57f').offsetHSL(0, 0, rng.range(-0.06, 0.04)));
    }
    for (let k = 0; k < 5; k++) ctx.batch.add('paint', place(new THREE.SphereGeometry(0.17 * s, 8, 6), crown.x + rng.range(-0.3, 0.3), crown.y - 0.35, crown.z + rng.range(-0.3, 0.3)), C('#6b6a2a'));
    ctx.col.addBox(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 0, h);
    return;
  }
  const h = (kind === 'ashoka' ? 6.8 : kind === 'rain' ? 4.2 : 3.6) * s;
  const lean = rng.range(-0.07, 0.07), lean2 = rng.range(-0.07, 0.07);
  const trunk = new THREE.CylinderGeometry(0.17 * s, 0.32 * s, h, 12, 4);
  ctx.batch.add('bark', place(trunk, x, y + h / 2, z, 0, 1, 1, 1, lean, lean2), C(kind === 'gulmohar' ? '#8a7766' : '#7d6e60'));
  // whitewashed / red-painted base band (common on Indian street trees)
  ctx.batch.add('paint', place(new THREE.CylinderGeometry(0.33 * s, 0.35 * s, 0.85, 12), x, y + 0.43, z), C(rng.chance(0.6) ? '#e8e4da' : '#a6402c'));
  // tree guard ring at the base
  ctx.batch.add('concrete', place(new THREE.CylinderGeometry(0.75, 0.78, 0.22, 16, 1, true), x, y + 0.11, z), C('#9a948a'));
  const leafKey = kind === 'gulmohar' ? 'blossoms' : 'leaves';
  const tint = C(kind === 'neem' ? '#c9dab0' : kind === 'ashoka' ? '#b4cca0' : '#c4d6a8').offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.05, 0.05));
  const top = new THREE.Vector3(x + lean2 * h, y + h, z - lean * h);
  const cluster = (c: THREE.Vector3, r: number, cards: number, size: number, canopyC: THREE.Vector3) => {
    for (let k = 0; k < cards; k++) {
      const g = new THREE.PlaneGeometry(size, size);
      g.rotateX(rng.range(-1.3, 1.3));
      g.rotateY(rng.range(0, Math.PI));
      g.rotateZ(rng.range(-0.5, 0.5));
      const dx = rng.range(-r, r), dy = rng.range(-r * 0.5, r * 0.6), dz = rng.range(-r, r);
      g.translate(c.x + dx, c.y + dy, c.z + dz);
      canopyNormals(g, canopyC);
      ctx.batch.add(leafKey, g, tint.clone().offsetHSL(0, rng.range(-0.04, 0.04), rng.range(-0.07, 0.05)));
    }
  };
  if (kind === 'ashoka') {
    const cc = new THREE.Vector3(x, y + h * 0.6, z);
    for (let i = 0; i < 9; i++) cluster(new THREE.Vector3(x, y + 2 + i * 0.6 * s, z), (1.1 - i * 0.09) * s, 4, 1.5 * s, cc);
  } else {
    const spread = (kind === 'rain' ? 3.4 : 2.4) * s;
    const canopyC = top.clone().add(new THREE.Vector3(0, 0.8 * s, 0));
    const nb = kind === 'rain' ? 6 : 5;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + rng.range(0, 0.7);
      const bl = rng.range(0.75, 1.0) * spread;
      const rise = rng.range(0.7, 1.6) * s;
      const end = top.clone().add(new THREE.Vector3(Math.cos(a) * bl, rise, Math.sin(a) * bl));
      const dir = end.clone().sub(top);
      const g = new THREE.CylinderGeometry(0.05 * s, 0.13 * s, dir.length(), 6);
      g.translate(0, dir.length() / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
      g.translate(top.x, top.y - 0.2, top.z);
      ctx.batch.add('bark', g, C('#6f6255'));
      cluster(end, 1.2 * s, kind === 'rain' ? 13 : 10, rng.range(2.0, 2.7) * s, canopyC);
    }
    cluster(top.clone().add(new THREE.Vector3(0, 1.4 * s, 0)), 1.5 * s, 16, 2.6 * s, canopyC);
    cluster(top.clone().add(new THREE.Vector3(0, 0.6 * s, 0)), spread * 0.6, 10, 2.4 * s, canopyC);
  }
  ctx.col.addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, h);
}

/** Streetlight on a footpath; arm points towards `armDir` (radians, world yaw). */
export function streetLight(ctx: BuildContext, x: number, y: number, z: number, armYaw: number, double = false) {
  const F = new Frame(ctx, x, y, z, armYaw);
  F.cyl('metal', 0, 0, 0, 0.09, 8.5, '#6c7277', 8, 0.06);
  F.cyl('paint', 0, 0, 0, 0.14, 1.0, '#333333', 8);
  const arms = double ? [1, -1] : [1];
  for (const s of arms) {
    F.box('metal', 0, 8.3, s * 1.1, 0.08, 0.08, 2.2, { color: '#6c7277' });
    F.box('metal', 0, 8.18, s * 2.2, 0.32, 0.16, 0.7, { color: '#55595c' });
    F.box('lamp', 0, 8.12, s * 2.2, 0.26, 0.04, 0.6);
    const w = F.world(0, 8.0, s * 2.2);
    ctx.lights.push({ x: w.x, y: w.y, z: w.z, kind: 'street' });
  }
  ctx.col.addBox(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 0, 8);
}

/** Electricity / cable pole with a crossarm. Returns the attachment point for cables. */
export function cablePole(ctx: BuildContext, x: number, y: number, z: number, yaw: number) {
  const F = new Frame(ctx, x, y, z, yaw);
  F.cyl('concrete', 0, 0, 0, 0.12, 7.5, '#9a978f', 6, 0.08);
  F.box('metal', 0, 7.0, 0, 1.6, 0.08, 0.08, { color: '#444' });
  F.box('plastic', 0.3, 5.5, 0.12, 0.35, 0.5, 0.2, { color: '#555' });
  ctx.col.addBox(x - 0.13, z - 0.13, x + 0.13, z + 0.13, 0, 7);
  return F;
}

/** Sagging cable bundle between two points (catenary approximation). */
export function cable(ctx: BuildContext, a: THREE.Vector3, b: THREE.Vector3, sag = 0.8, radius = 0.02, color = '#1a1a1a') {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, radius, 4, false);
  ctx.batch.add('paint', g, C(color));
}

export function busShelter(ctx: BuildContext, x: number, y: number, z: number, yaw: number, name: string) {
  const F = new Frame(ctx, x, y, z, yaw);
  for (const px of [-2.4, 2.4]) F.box('metal', px, 0, -0.6, 0.1, 2.7, 0.1, { color: '#5b6a74', collide: true });
  F.box('metal', 0, 2.7, -0.2, 5.4, 0.1, 1.9, { color: '#b03a2e' });
  F.box('glass', 0, 0.5, -1.1, 4.8, 1.8, 0.04, { collide: true });
  F.box('paint', 0, 0.45, -0.7, 4.2, 0.06, 0.4, { color: '#9aa4aa' });
  const cell = ctx.mats.signs.add('BUS STOP • ' + name, 'बस थांबा • MBT', 0);
  F.sign(0, 2.82, 0.76, 4.6, 0.55, cell);
  F.box('paint', 2.6, 0, 0.6, 0.08, 2.4, 0.08, { color: '#444' });
  F.box('paint', 2.6, 2.0, 0.6, 0.6, 0.6, 0.04, { color: '#b03a2e' });
  for (let i = -1; i <= 1; i++) ctx.benches.push({ ...F.world(i * 1.3, 0.5, -0.65), heading: yaw });
}

/** Construction hoarding closing a road at the district boundary (diegetic boundary). */
export function hoarding(ctx: BuildContext, x0: number, z0: number, x1: number, z1: number, y = 0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const F = new Frame(ctx, (x0 + x1) / 2, y, (z0 + z1) / 2, yaw);
  const panels = Math.ceil(len / 3);
  for (let i = 0; i < panels; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / panels);
    F.box('paint', lx, 0, 0, len / panels - 0.05, 2.6, 0.08, { color: i % 2 ? '#1e5aa8' : '#f2f2f2' });
  }
  F.box('paint', 0, 2.55, 0, len, 0.12, 0.1, { color: '#e3b11c' });
  const cell = ctx.mats.signs.add('Metro Line 7 Work in Progress', 'मेट्रो कार्य प्रगति पर — असुविधा के लिए खेद है', 1);
  for (let i = 0; i < Math.max(1, Math.floor(len / 14)); i++) F.sign(-len / 2 + 7 + i * 14, 1.0, 0.06, 9, 1.2, cell);
  F.sign(-len / 2 + 7, 1.0, -0.06, 9, 1.2, cell, Math.PI);
  ctx.col.addWall(x0, z0, x1, z1, 0.4, -1, 3);
  // blinking barricade lights
  for (let i = 0; i < panels; i += 2) F.box('neon', -len / 2 + i * (len / panels), 2.65, 0.1, 0.15, 0.15, 0.1, { color: '#ff3b1f' });
}

export function dustbin(ctx: BuildContext, x: number, y: number, z: number) {
  ctx.batch.add('plastic', place(new THREE.CylinderGeometry(0.32, 0.28, 0.9, 10), x, y + 0.45, z), C(ctx.rng.chance(0.5) ? '#2e8b3a' : '#1f5fbf'));
}

/** Leaf-card shrub (median planting, park hedges). */
export function bush(ctx: BuildContext, x: number, y: number, z: number, size = 1) {
  const rng = ctx.rng;
  const c = new THREE.Vector3(x, y + 0.35 * size, z);
  const tint = C('#c4d6a8').offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.06, 0.04));
  for (let k = 0; k < 12; k++) {
    const g = new THREE.PlaneGeometry(1.1 * size, 0.9 * size);
    g.rotateX(rng.range(-1.2, 1.2));
    g.rotateY(rng.range(0, Math.PI));
    g.translate(x + rng.range(-0.35, 0.35) * size, y + rng.range(0.25, 0.6) * size, z + rng.range(-0.35, 0.35) * size);
    canopyNormals(g, c.clone().add(new THREE.Vector3(0, -0.3, 0)));
    ctx.batch.add('leaves', g, tint.clone().offsetHSL(0, 0, rng.range(-0.05, 0.05)));
  }
}
