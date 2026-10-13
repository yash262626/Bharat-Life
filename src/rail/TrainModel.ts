// Procedural suburban EMU coach (Mumbai local inspired; original design).
// Local space: +z = forward along the track, x across, y up from rail top. Coach length 20 m.
import * as THREE from 'three';
import { mergeByKey, Part, roundedBox } from '../vehicles/VehicleModels';
import { MaterialLib } from '../world/materials';

export const COACH_LEN = 20;
export const COACH_W = 3.66;
export const FLOOR_Y = 1.05;
export const DOOR_Z = [-6.6, 0, 6.6];

const col = (c: string) => new THREE.Color(c);

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function coachParts(cab: 'front' | 'rear' | 'none', motor: boolean): Part[] {
  const P: Part[] = [];
  const L = COACH_LEN, W = COACH_W, H = 3.95;
  const cream = col('#e8dcc0'), maroon = col('#7a2430'), roofC = col('#8f9496'), dark = col('#1a1c1e');
  const wallT = 0.06;
  // side walls built from panels so door openings are real holes (Mumbai locals run with doors open)
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - wallT / 2);
    let z = -L / 2;
    const edges = [...DOOR_Z.map((d) => [d - 0.65, d + 0.65]), [L / 2, L / 2]];
    for (const [d0, d1] of edges) {
      const len = d0 - z;
      if (len > 0.01) {
        // lower panel (cream), window band (glass + bars), upper band (maroon stripe + cream)
        P.push({ key: 'car_paint', geo: box(wallT, 0.95, len, x, FLOOR_Y + 0.475, z + len / 2), color: cream });
        P.push({ key: 'car_paint', geo: box(wallT * 1.1, 0.22, len, x, FLOOR_Y + 1.0, z + len / 2), color: maroon });
        P.push({ key: 'car_glass', geo: box(wallT * 0.5, 0.95, len, x, FLOOR_Y + 1.6, z + len / 2) });
        const bars = Math.floor(len / 0.12);
        for (let k = 0; k < bars; k++) P.push({ key: 'chrome', geo: box(0.02, 0.95, 0.018, x + s * 0.03, FLOOR_Y + 1.6, z + 0.06 + k * 0.12), color: col('#9aa0a3') });
        P.push({ key: 'car_paint', geo: box(wallT, 0.75, len, x, FLOOR_Y + 2.45, z + len / 2), color: cream });
        P.push({ key: 'car_paint', geo: box(wallT * 1.1, 0.18, len, x, FLOOR_Y + 2.1, z + len / 2), color: maroon });
      }
      z = d1;
    }
    // door frames + grab handles at openings
    for (const d of DOOR_Z) {
      P.push({ key: 'car_trim', geo: box(0.08, 2.0, 0.06, x, FLOOR_Y + 1.0, d - 0.66), color: dark });
      P.push({ key: 'car_trim', geo: box(0.08, 2.0, 0.06, x, FLOOR_Y + 1.0, d + 0.66), color: dark });
      P.push({ key: 'car_paint', geo: box(wallT, 0.82, 1.3, x, FLOOR_Y + 2.42, d), color: cream });
      P.push({ key: 'chrome', geo: box(0.03, 1.6, 0.03, x - s * 0.15, FLOOR_Y + 1.0, d), color: col('#c9ccce') });
      // step plate
      P.push({ key: 'car_trim', geo: box(0.25, 0.04, 1.3, x + s * 0.05, FLOOR_Y - 0.02, d), color: col('#555') });
    }
  }
  // roof: curved shell
  const roof = new THREE.CylinderGeometry(W / 2 + 0.02, W / 2 + 0.02, L, 20, 1, true, -Math.PI / 2, Math.PI);
  roof.rotateX(Math.PI / 2).scale(1, 0.32, 1).translate(0, FLOOR_Y + 2.82, 0);
  P.push({ key: 'car_paint', geo: roof, color: roofC });
  for (let z = -L / 2 + 2; z < L / 2 - 1; z += 3.2) P.push({ key: 'car_trim', geo: roundedBox(0.9, 0.18, 1.2, 0.08).translate(0, FLOOR_Y + 3.35, z), color: col('#6f7477') });
  if (motor) {
    // pantograph
    P.push({ key: 'car_trim', geo: box(1.4, 0.15, 1.8, 0, FLOOR_Y + 3.4, 3), color: dark });
    const arm1 = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6); arm1.rotateX(0.9).translate(0, FLOOR_Y + 3.95, 2.6);
    const arm2 = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6); arm2.rotateX(-0.9).translate(0, FLOOR_Y + 4.45, 3.4);
    P.push({ key: 'chrome', geo: arm1, color: col('#555') }, { key: 'chrome', geo: arm2, color: col('#555') });
    P.push({ key: 'chrome', geo: box(1.6, 0.05, 0.12, 0, FLOOR_Y + 4.95, 3.0), color: col('#333') });
  }
  // floor + underframe + bogies
  P.push({ key: 'car_trim', geo: box(W - 0.1, 0.08, L, 0, FLOOR_Y, 0), color: col('#5b5348') });
  P.push({ key: 'car_trim', geo: box(W - 0.4, 0.55, L - 1, 0, FLOOR_Y - 0.4, 0), color: dark });
  for (const bz of [-L / 2 + 2.8, L / 2 - 2.8]) {
    P.push({ key: 'car_trim', geo: box(2.4, 0.45, 2.6, 0, 0.62, bz), color: col('#23262a') });
    for (const wz of [-0.95, 0.95]) for (const s of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 18);
      wheel.rotateZ(Math.PI / 2).translate(s * 0.78, 0.46, bz + wz);
      P.push({ key: 'rubber', geo: wheel, color: col('#2d2f31') });
    }
  }
  // ends: gangway / cab
  for (const e of [-1, 1]) {
    const isCab = (e === 1 && cab === 'front') || (e === -1 && cab === 'rear');
    const z = e * (L / 2 - 0.03);
    if (isCab) {
      P.push({ key: 'car_paint', geo: box(W, 1.0, 0.08, 0, FLOOR_Y + 0.5, z), color: maroon });
      P.push({ key: 'car_glass', geo: box(W - 0.5, 1.0, 0.04, 0, FLOOR_Y + 1.55, z + e * 0.03) });
      P.push({ key: 'car_paint', geo: box(W, 0.9, 0.08, 0, FLOOR_Y + 2.5, z), color: cream });
      P.push({ key: 'car_paint', geo: box(W, 1.0, 0.08, 0, FLOOR_Y - 0.4, z), color: col('#d9b52a') }); // yellow warning nose
      for (const s of [-1, 1]) P.push({ key: 'headlight', geo: new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16).rotateX(Math.PI / 2).translate(s * 1.1, FLOOR_Y + 0.35, z + e * 0.05) });
      P.push({ key: 'led_board', geo: box(1.6, 0.28, 0.03, 0, FLOOR_Y + 2.45, z + e * 0.05) });
      P.push({ key: 'car_trim', geo: box(0.6, 0.35, 0.3, 0, FLOOR_Y - 0.7, z + e * 0.2), color: dark });
    } else {
      P.push({ key: 'car_paint', geo: box(W, H - 0.3, 0.06, 0, FLOOR_Y + (H - 0.3) / 2 - 0.25, z), color: cream });
      P.push({ key: 'car_trim', geo: box(1.2, 2.1, 0.08, 0, FLOOR_Y + 1.05, z), color: dark });
    }
  }
  // interior: longitudinal + bay seats, poles, handle rails, fans, tube lights
  for (let z = -L / 2 + 1.0; z < L / 2 - 0.8; z += 1.5) {
    if (DOOR_Z.some((d) => Math.abs(d - z) < 1.1)) continue;
    for (const s of [-1, 1]) {
      P.push({ key: 'vinyl', geo: roundedBox(0.95, 0.1, 1.2, 0.03).translate(s * 1.1, FLOOR_Y + 0.45, z), color: col('#7d8a93') });
      P.push({ key: 'car_trim', geo: box(0.9, 0.45, 0.06, s * 1.1, FLOOR_Y + 0.22, z), color: col('#4b5257') });
    }
  }
  for (const d of DOOR_Z) for (const s of [-1, 1]) P.push({ key: 'chrome', geo: box(0.04, 2.1, 0.04, s * 0.55, FLOOR_Y + 1.05, d), color: col('#c9ccce') });
  for (const s of [-1, 1]) P.push({ key: 'chrome', geo: box(0.03, 0.03, L - 1, s * 0.55, FLOOR_Y + 2.05, 0), color: col('#c9ccce') });
  for (let z = -L / 2 + 2; z < L / 2; z += 4) {
    P.push({ key: 'lamp_white', geo: box(0.08, 0.04, 1.2, 0, FLOOR_Y + 2.62, z) });
    P.push({ key: 'car_trim', geo: new THREE.CylinderGeometry(0.4, 0.4, 0.03, 12).translate(0.9, FLOOR_Y + 2.6, z + 1.5), color: col('#e8e8e8') });
  }
  return P;
}

/** Build a coach mesh group (merged by material). */
export function buildCoach(mats: MaterialLib, cab: 'front' | 'rear' | 'none', motor: boolean): THREE.Group {
  const g = new THREE.Group();
  for (const [key, geo] of mergeByKey(coachParts(cab, motor))) {
    const mat = mats.get(key, true);
    const m = new THREE.Mesh(geo, key === 'car_paint' || key === 'car_trim' ? withDoubleSide(mat) : mat);
    m.castShadow = key !== 'car_glass';
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

const dsCache = new Map<THREE.Material, THREE.Material>();
function withDoubleSide(m: THREE.Material) {
  let c = dsCache.get(m);
  if (!c) { c = m.clone(); c.side = THREE.DoubleSide; dsCache.set(m, c); }
  return c;
}
