// Procedural vehicle models (original designs of fictional brands).
// Output is a list of parts (geometry + material key + colour) in vehicle-local space:
// +z = forward, +y = up, ground at y = 0, vehicle centred on x. Right-hand drive: driver at -x.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleSpec } from '../config/vehicles';
import { Rng } from '../core/math';

export interface Part { key: string; geo: THREE.BufferGeometry; color?: THREE.Color }
export interface WheelDef { x: number; y: number; z: number; r: number; width: number; steer: boolean; moto: boolean }
export interface VehicleModel {
  parts: Part[];
  wheels: WheelDef[];
  /** Wheel geometry parts centred at origin, axis along x (rotate about x to roll). */
  wheelParts: (w: WheelDef) => Part[];
  driverSeat: THREE.Vector3;
  passengerSeats: THREE.Vector3[];
  headlights: THREE.Vector3[];
  exhaust: THREE.Vector3;
  /** Steering column pivot for cars (steering wheel mesh). */
  steeringWheel?: { pos: THREE.Vector3; tilt: number };
  handlebar?: THREE.Vector3;
}

const col = (c: string | number) => new THREE.Color(c);

/** Rounded-rectangle cross-section extruded along z (for seats, tanks, bumpers). */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 3) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const bev = Math.min(r, d / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.9, bevelSegments: seg, curveSegments: seg });
  g.translate(0, 0, -(d - bev * 2) / 2);
  return g;
}

/**
 * Side profile (points in (z, y)) extruded across the width (x), with rounded edges.
 * `arches` cut semicircular wheel openings into the bottom edge.
 */
export function profileExtrude(pts: [number, number][], width: number, bevel = 0.05, arches: { z: number; r: number; y: number }[] = []) {
  const s = new THREE.Shape();
  // Build outline: pts are listed clockwise starting at the rear-bottom; bottom edge (with arches)
  // is generated from the last point back to the first.
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const last = pts[pts.length - 1], first = pts[0];
  const bottomY = last[1];
  const sorted = [...arches].sort((a, b) => b.z - a.z); // front to rear
  for (const a of sorted) {
    s.lineTo(a.z + a.r, bottomY);
    // arc over the wheel (from front to rear, going up)
    const segs = 14;
    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * Math.PI;
      const zz = a.z + Math.cos(t) * a.r;
      const yy = a.y + Math.sin(t) * a.r;
      s.lineTo(zz, Math.max(bottomY, yy));
    }
    s.lineTo(a.z - a.r, bottomY);
  }
  s.lineTo(first[0], first[1]);
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  // shape (x=z_profile, y) extruded along +z -> rotate so extrusion runs along x
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
function cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
/** Tube between two points. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Smooth ellipsoid panel (radii rx, ry, rz) with optional pitch. */
function ell(rx: number, ry: number, rz: number, x: number, y: number, z: number, pitch = 0, seg = 18, phiLen = Math.PI) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1), 0, Math.PI * 2, 0, phiLen);
  g.scale(rx, ry, rz);
  g.rotateX(pitch);
  g.translate(x, y, z);
  return g;
}

// ------------------------------------------------------------------------------------ wheels
export function carWheelParts(r: number, width: number, style: 'alloy' | 'steel' | 'hubcap' = 'alloy', rimCol = '#b9bdc0'): Part[] {
  // Tyre: lathe profile with rounded shoulders and sidewall
  const pts: THREE.Vector2[] = [];
  const rimR = r * 0.62;
  const hw = width / 2;
  const prof: [number, number][] = [[rimR, -hw * 0.92], [r * 0.9, -hw], [r * 0.985, -hw * 0.85], [r, -hw * 0.55], [r, hw * 0.55], [r * 0.985, hw * 0.85], [r * 0.9, hw], [rimR, hw * 0.92]];
  for (const [rr, y] of prof) pts.push(new THREE.Vector2(rr, y));
  const tyre = new THREE.LatheGeometry(pts, 28);
  tyre.rotateZ(Math.PI / 2);
  const parts: Part[] = [{ key: 'rubber', geo: tyre, color: col('#1b1b1b') }];
  // rim barrel + face
  const face = new THREE.CylinderGeometry(rimR, rimR, width * 0.7, 24, 1, true);
  face.rotateZ(Math.PI / 2);
  parts.push({ key: 'chrome', geo: face, color: col('#5c6064') });
  const disc = new THREE.CircleGeometry(rimR * 0.98, 24);
  disc.rotateY(Math.PI / 2);
  disc.translate(hw * 0.62, 0, 0);
  parts.push({ key: style === 'steel' ? 'car_trim' : 'chrome', geo: disc, color: col(style === 'steel' ? '#2a2c2e' : '#3d4145') });
  if (style === 'alloy') {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const g = box(0.03, rimR * 0.9, rimR * 0.22, hw * 0.66, 0, 0);
      g.translate(0, rimR * 0.45, 0);
      g.rotateX(a);
      parts.push({ key: 'chrome', geo: g, color: col(rimCol) });
    }
    parts.push({ key: 'chrome', geo: cyl(rimR * 0.95, rimR * 0.95, 0.03, 24, hw * 0.64, 0, 0, 0, 0, Math.PI / 2), color: col(rimCol) });
  } else if (style === 'hubcap') {
    const cap = new THREE.SphereGeometry(rimR * 0.95, 20, 8, 0, Math.PI * 2, 0, 0.5);
    cap.rotateZ(-Math.PI / 2);
    cap.translate(hw * 0.35, 0, 0);
    parts.push({ key: 'chrome', geo: cap, color: col('#cfd3d6') });
  } else {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const g = cyl(0.03, 0.03, 0.02, 8, hw * 0.63, Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, 0, 0, Math.PI / 2);
      parts.push({ key: 'car_trim', geo: g, color: col('#111') });
    }
  }
  parts.push({ key: 'chrome', geo: cyl(rimR * 0.18, rimR * 0.18, 0.04, 12, hw * 0.68, 0, 0, 0, 0, Math.PI / 2), color: col('#9a9ea2') });
  return parts;
}

export function motoWheelParts(r: number, width: number, spoked: boolean): Part[] {
  const pts: THREE.Vector2[] = [];
  const rimR = r * 0.78;
  const hw = width / 2;
  for (const [rr, y] of [[rimR, -hw * 0.7], [r * 0.93, -hw], [r, -hw * 0.4], [r, hw * 0.4], [r * 0.93, hw], [rimR, hw * 0.7]] as [number, number][]) pts.push(new THREE.Vector2(rr, y));
  const tyre = new THREE.LatheGeometry(pts, 28);
  tyre.rotateZ(Math.PI / 2);
  const parts: Part[] = [{ key: 'rubber', geo: tyre, color: col('#161616') }];
  const rim = new THREE.TorusGeometry(rimR, 0.012, 6, 32);
  rim.rotateY(Math.PI / 2);
  parts.push({ key: 'chrome', geo: rim, color: col(spoked ? '#c9ccce' : '#2b2b2b') });
  if (spoked) {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const g = tube(V((k % 2 ? 1 : -1) * 0.03, 0, 0), V(0, Math.cos(a) * rimR, Math.sin(a) * rimR), 0.003, 4);
      parts.push({ key: 'chrome', geo: g, color: col('#c9ccce') });
    }
  } else {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const g = box(0.02, rimR, 0.035, 0, 0, 0);
      g.translate(0, rimR / 2, 0);
      g.rotateX(a);
      parts.push({ key: 'car_trim', geo: g, color: col('#2b2b2b') });
    }
  }
  parts.push({ key: 'chrome', geo: cyl(0.045, 0.045, width * 0.9, 12, 0, 0, 0, 0, 0, Math.PI / 2), color: col('#8d9195') });
  parts.push({ key: 'chrome', geo: cyl(r * 0.42, r * 0.42, 0.006, 24, -hw * 0.9, 0, 0, 0, 0, Math.PI / 2), color: col('#a8acaf') }); // brake disc
  return parts;
}

// ------------------------------------------------------------------------------------ builders
export function buildVehicle(spec: VehicleSpec, paint: string, rng: Rng): VehicleModel {
  switch (spec.body) {
    case 'motorcycle':
    case 'sportbike': return motorcycle(spec, paint, rng);
    case 'scooter': return scooter(spec, paint, rng);
    case 'auto': return autoRickshaw(spec, paint);
    case 'bus': return bus(spec, paint);
    case 'truck': return truck(spec, paint, rng);
    default: return car(spec, paint, rng);
  }
}

interface CarShape { belt: number; hood: number; roof: number; wsRake: number; hoodLen: number; rear: 'hatch' | 'notch' | 'box' | 'van' | 'pickup'; trunkLen: number; clearance: number; rearRake: number }

function carShape(spec: VehicleSpec): CarShape {
  const H = spec.height;
  switch (spec.body) {
    case 'hatchback': return { belt: 0.9, hood: 0.78, roof: H, wsRake: 0.75, hoodLen: 0.85, rear: 'hatch', trunkLen: 0.1, clearance: 0.17, rearRake: 0.18 };
    case 'sedan': return { belt: 0.88, hood: 0.76, roof: H, wsRake: 0.85, hoodLen: 1.05, rear: 'notch', trunkLen: 0.9, clearance: 0.17, rearRake: 0.6 };
    case 'taxi': return { belt: 0.86, hood: 0.8, roof: H, wsRake: 0.45, hoodLen: 1.0, rear: 'notch', trunkLen: 0.85, clearance: 0.18, rearRake: 0.4 };
    case 'luxury': return { belt: 0.9, hood: 0.78, roof: H, wsRake: 1.0, hoodLen: 1.35, rear: 'notch', trunkLen: 1.0, clearance: 0.15, rearRake: 0.75 };
    case 'sports': return { belt: 0.75, hood: 0.62, roof: H, wsRake: 1.1, hoodLen: 1.45, rear: 'notch', trunkLen: 0.6, clearance: 0.12, rearRake: 1.1 };
    case 'suv': case 'police': return { belt: 1.1, hood: 1.0, roof: H, wsRake: 0.6, hoodLen: 1.15, rear: 'box', trunkLen: 0.1, clearance: 0.22, rearRake: 0.08 };
    case 'pickup': return { belt: 1.08, hood: 1.0, roof: H, wsRake: 0.55, hoodLen: 1.15, rear: 'pickup', trunkLen: 1.6, clearance: 0.23, rearRake: 0.05 };
    case 'van': case 'ambulance': return { belt: 1.0, hood: 0.95, roof: H, wsRake: 0.65, hoodLen: 0.6, rear: 'van', trunkLen: 0.05, clearance: 0.18, rearRake: 0.03 };
    default: return { belt: 0.9, hood: 0.78, roof: H, wsRake: 0.75, hoodLen: 0.9, rear: 'hatch', trunkLen: 0.1, clearance: 0.17, rearRake: 0.2 };
  }
}

function car(spec: VehicleSpec, paint: string, rng: Rng): VehicleModel {
  const L = spec.length, W = spec.width, R = spec.wheelRadius;
  const sh = carShape(spec);
  const parts: Part[] = [];
  const P = col(paint);
  const zf = L / 2, zr = -L / 2;
  const wf = spec.wheelbase / 2 + (spec.body === 'sports' ? 0.05 : 0.08), wr = -spec.wheelbase / 2 + 0.08;
  const c = sh.clearance;
  const belt = sh.belt, hood = sh.hood, roof = sh.roof;
  // windscreen base / top and rear glass positions
  const wsBase = zf - sh.hoodLen - 0.12;
  const wsTop = wsBase - sh.wsRake;
  const rearBase = sh.rear === 'notch' || sh.rear === 'pickup' ? zr + sh.trunkLen : zr + 0.12;
  const rearTop = rearBase + sh.rearRake;
  // ---- lower body side profile (clockwise from rear bottom)
  const deck = sh.rear === 'notch' ? belt + 0.02 : belt;
  const lower: [number, number][] = [
    [zr + 0.12, c + 0.05], [zr, c + 0.22], [zr - 0.01, deck - 0.12], [zr + 0.08, deck],
    [wsBase, belt], [zf - 0.25, hood], [zf, hood - 0.12], [zf + 0.02, c + 0.24], [zf - 0.12, c + 0.05],
  ];
  const archR = R + 0.07;
  const body = profileExtrude(lower, W, 0.07, [{ z: wf, r: archR, y: R }, { z: wr, r: archR, y: R }]);
  parts.push({ key: 'car_paint', geo: body, color: P });
  // wheel-arch liners (dark) to hide see-through
  for (const wz of [wf, wr]) parts.push({ key: 'car_trim', geo: cyl(archR, archR, W - 0.25, 18, 0, R, wz, 0, 0, Math.PI / 2), color: col('#0d0d0d') });
  // ---- greenhouse (glass) and roof
  const tumble = 0.12;
  if (sh.rear !== 'pickup') {
    const gh: [number, number][] = [[rearBase, belt], [rearTop, roof - 0.05], [wsTop, roof - 0.05], [wsBase, belt]];
    if (sh.rear === 'van') { gh[1] = [zr + 0.05, roof - 0.05]; gh[0] = [zr + 0.02, belt]; }
    const glass = profileExtrude(gh, W - tumble * 2, 0.04);
    parts.push({ key: 'car_glass', geo: glass });
    // roof panel
    const roofLen = (sh.rear === 'van' ? zr + 0.05 : rearTop) - wsTop;
    const roofG = roundedBox(W - tumble * 2 - 0.02, 0.06, Math.abs(roofLen) + 0.12, 0.03);
    roofG.translate(0, roof - 0.03, (wsTop + (sh.rear === 'van' ? zr + 0.05 : rearTop)) / 2);
    parts.push({ key: 'car_paint', geo: roofG, color: spec.body === 'taxi' ? col('#f2c514') : P });
    // A/B/C pillars as body-colour strips on the glass sides
    const pillarCol = spec.body === 'taxi' ? col('#f2c514') : P;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - tumble - 0.005);
      parts.push({ key: 'car_paint', geo: tube(V(x, belt, wsBase), V(x, roof - 0.04, wsTop), 0.045, 6), color: pillarCol });
      const bz = (wsTop + rearTop) / 2 - 0.1;
      parts.push({ key: 'car_trim', geo: box(0.03, roof - belt - 0.05, 0.1, x, (roof + belt) / 2 - 0.02, bz), color: col('#111') });
      if (sh.rear !== 'van') parts.push({ key: 'car_paint', geo: tube(V(x, belt, rearBase), V(x, roof - 0.04, rearTop), 0.07, 6), color: pillarCol });
      // window rubber seals along belt
      parts.push({ key: 'car_trim', geo: box(0.02, 0.025, Math.abs(rearBase - wsBase), s * (W / 2 - 0.09), belt + 0.01, (rearBase + wsBase) / 2), color: col('#151515') });
    }
  } else {
    // pickup: cab + open bed
    const cabRear = wsBase - sh.wsRake - 0.7;
    const gh: [number, number][] = [[cabRear, belt], [cabRear + 0.05, roof - 0.05], [wsTop, roof - 0.05], [wsBase, belt]];
    parts.push({ key: 'car_glass', geo: profileExtrude(gh, W - 0.24, 0.04) });
    const roofG = roundedBox(W - 0.26, 0.06, wsTop - cabRear + 0.1, 0.03);
    roofG.translate(0, roof - 0.03, (wsTop + cabRear) / 2);
    parts.push({ key: 'car_paint', geo: roofG, color: P });
    parts.push({ key: 'car_trim', geo: box(W - 0.2, 0.03, cabRear - zr - 0.15, 0, belt - 0.02, (cabRear + zr) / 2), color: col('#222') });
  }
  // ---- door seams, handles, mirrors, rubbing strips
  const doorZ = sh.rear === 'van' || sh.rear === 'pickup' ? [wsBase - 0.05, wsBase - 1.05] : [wsBase - 0.05, (wsBase + rearBase) / 2 - 0.05, rearBase + 0.25];
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.002);
    for (const dz of doorZ) parts.push({ key: 'car_trim', geo: box(0.006, belt - c - 0.25, 0.012, x, (belt + c) / 2 + 0.05, dz), color: col('#0b0b0b') });
    parts.push({ key: 'car_trim', geo: box(0.006, 0.012, Math.abs(doorZ[0] - doorZ[doorZ.length - 1]), x, c + 0.2, (doorZ[0] + doorZ[doorZ.length - 1]) / 2), color: col('#0b0b0b') });
    for (let k = 0; k < doorZ.length - 1; k++) parts.push({ key: 'chrome', geo: box(0.025, 0.025, 0.14, x + s * 0.01, belt - 0.12, doorZ[k] - 0.3), color: col('#b8bcbf') });
    parts.push({ key: 'car_trim', geo: box(0.02, 0.05, Math.abs(zf - zr) * 0.55, x + s * 0.008, c + 0.36, (wf + wr) / 2), color: col('#2a2a2a') });
    // side mirror
    const mz = wsBase - 0.12;
    parts.push({ key: 'car_trim', geo: box(0.06, 0.04, 0.05, s * (W / 2 + 0.03), belt + 0.06, mz), color: col('#1a1a1a') });
    const mh = roundedBox(0.2, 0.13, 0.08, 0.03);
    mh.translate(s * (W / 2 + 0.13), belt + 0.11, mz);
    parts.push({ key: 'car_paint', geo: mh, color: P });
    parts.push({ key: 'car_glass', geo: box(0.17, 0.1, 0.005, s * (W / 2 + 0.13), belt + 0.11, mz - 0.043) });
    // indicator repeaters
    parts.push({ key: 'indicator', geo: box(0.01, 0.025, 0.06, x + s * 0.004, hood - 0.08, wf + 0.35), color: col('#ff9a1a') });
  }
  // ---- front: grille, headlamps, bumper, fog lamps, plate
  const frontY = (hood + c) / 2;
  parts.push({ key: 'car_trim', geo: roundedBox(W * 0.5, 0.18, 0.06, 0.03).translate(0, hood - 0.2, zf + 0.0), color: col('#141414') });
  parts.push({ key: 'chrome', geo: box(W * 0.5, 0.02, 0.02, 0, hood - 0.1, zf + 0.03), color: col('#c7cbce') });
  for (const s of [-1, 1]) {
    const hl = roundedBox(W * 0.22, 0.13, 0.08, 0.04);
    hl.translate(s * W * 0.34, hood - 0.16, zf - 0.03);
    parts.push({ key: 'headlight', geo: hl });
    parts.push({ key: 'chrome', geo: box(W * 0.2, 0.1, 0.01, s * W * 0.34, hood - 0.16, zf - 0.075), color: col('#d5d8db') });
    parts.push({ key: 'car_trim', geo: cyl(0.04, 0.04, 0.02, 12, s * W * 0.36, c + 0.28, zf + 0.0, Math.PI / 2), color: col('#dcdcdc') });
  }
  parts.push({ key: 'car_trim', geo: roundedBox(W + 0.02, 0.22, 0.14, 0.06).translate(0, c + 0.2, zf - 0.02), color: spec.body === 'sports' ? P : col('#1f1f1f') });
  parts.push({ key: 'car_trim', geo: box(W * 0.6, 0.06, 0.04, 0, c + 0.3, zf + 0.06), color: col('#0a0a0a') });
  // ---- rear: tail lamps, bumper, reflectors
  for (const s of [-1, 1]) {
    const tl = roundedBox(W * 0.2, sh.rear === 'box' || sh.rear === 'van' ? 0.32 : 0.14, 0.06, 0.03);
    tl.translate(s * W * 0.38, (sh.rear === 'box' || sh.rear === 'van' ? belt - 0.05 : deck - 0.12), zr - 0.0);
    parts.push({ key: 'taillight', geo: tl });
  }
  parts.push({ key: 'car_trim', geo: roundedBox(W + 0.02, 0.22, 0.14, 0.06).translate(0, c + 0.2, zr + 0.02), color: col('#1f1f1f') });
  parts.push({ key: 'reflector', geo: box(0.12, 0.03, 0.01, -W * 0.35, c + 0.26, zr - 0.06) });
  parts.push({ key: 'reflector', geo: box(0.12, 0.03, 0.01, W * 0.35, c + 0.26, zr - 0.06) });
  parts.push({ key: 'chrome', geo: cyl(0.03, 0.03, 0.12, 8, -W * 0.3, c + 0.12, zr - 0.02, Math.PI / 2), color: col('#777') });
  // ---- interior (visible through glass)
  if (sh.rear !== 'van' || spec.body === 'ambulance') {
    const seatZ = [wsBase - 0.75, wsBase - 1.6];
    for (const sz of seatZ.slice(0, sh.rear === 'pickup' ? 1 : 2)) {
      for (const s of sz === seatZ[0] ? [-1, 1] : [0]) {
        const sw = sz === seatZ[0] ? W * 0.32 : W * 0.75;
        parts.push({ key: 'vinyl', geo: roundedBox(sw, 0.12, 0.5, 0.04).translate(s * W * 0.22, c + 0.35, sz), color: col('#2b2724') });
        parts.push({ key: 'vinyl', geo: roundedBox(sw, 0.6, 0.12, 0.05).translate(s * W * 0.22, c + 0.7, sz - 0.28), color: col('#2b2724') });
      }
    }
    parts.push({ key: 'car_trim', geo: roundedBox(W - 0.3, 0.2, 0.45, 0.06).translate(0, belt - 0.05, wsBase - 0.15), color: col('#1c1c1c') });
  }
  // ---- special liveries
  if (spec.body === 'taxi') {
    parts.push({ key: 'car_paint', geo: box(W * 0.9, 0.02, 1.0, 0, roof + 0.08, (wsTop + rearTop) / 2), color: col('#2a2a2a') }); // luggage carrier
    for (const s of [-1, 1]) parts.push({ key: 'chrome', geo: box(0.025, 0.08, 1.1, s * W * 0.43, roof + 0.04, (wsTop + rearTop) / 2), color: col('#888') });
    parts.push({ key: 'taxi_sign', geo: box(0.5, 0.14, 0.08, 0, roof + 0.16, wsTop - 0.05), color: col('#f2c514') });
  }
  if (spec.body === 'ambulance' || spec.body === 'police') {
    const barCol = spec.body === 'police' ? '#1d4ed8' : '#e11d48';
    parts.push({ key: 'beacon', geo: roundedBox(W * 0.7, 0.1, 0.25, 0.04).translate(0, roof + 0.07, wsTop - 0.15), color: col(barCol) });
    for (const s of [-1, 1]) parts.push({ key: 'car_trim', geo: box(0.005, 0.18, L * 0.7, s * (W / 2 + 0.004), belt - 0.15, -0.1), color: col(spec.body === 'police' ? '#1e3a8a' : '#dc2626') });
  }
  if (sh.rear === 'pickup') {
    // bed walls
    const bedZ0 = zr + 0.05, bedZ1 = wsBase - sh.wsRake - 0.75;
    for (const s of [-1, 1]) parts.push({ key: 'car_paint', geo: box(0.05, 0.42, bedZ1 - bedZ0, s * (W / 2 - 0.03), belt + 0.15, (bedZ0 + bedZ1) / 2), color: P });
    parts.push({ key: 'car_paint', geo: box(W - 0.06, 0.42, 0.05, 0, belt + 0.15, bedZ0), color: P });
  }
  // underbody
  parts.push({ key: 'car_trim', geo: box(W - 0.1, 0.05, L - 0.5, 0, c + 0.02, 0), color: col('#0e0e0e') });

  const tyreW = spec.body === 'suv' || spec.body === 'pickup' ? 0.24 : spec.body === 'sports' || spec.body === 'luxury' ? 0.26 : 0.18;
  const wx = W / 2 - tyreW / 2 - 0.04;
  const wheels: WheelDef[] = [
    { x: wx, y: R, z: wf, r: R, width: tyreW, steer: true, moto: false }, { x: -wx, y: R, z: wf, r: R, width: tyreW, steer: true, moto: false },
    { x: wx, y: R, z: wr, r: R, width: tyreW, steer: false, moto: false }, { x: -wx, y: R, z: wr, r: R, width: tyreW, steer: false, moto: false },
  ];
  const style: 'alloy' | 'steel' | 'hubcap' = spec.body === 'taxi' ? 'hubcap' : spec.body === 'hatchback' ? (rng.chance(0.5) ? 'steel' : 'hubcap') : 'alloy';
  return {
    parts, wheels,
    wheelParts: (w) => mirrorWheel(carWheelParts(w.r, w.width, style), w.x),
    driverSeat: V(-W * 0.22, c + 0.45, wsBase - 0.75),
    passengerSeats: [V(W * 0.22, c + 0.45, wsBase - 0.75), V(-W * 0.22, c + 0.45, wsBase - 1.6), V(W * 0.22, c + 0.45, wsBase - 1.6)],
    headlights: [V(-W * 0.34, hood - 0.16, zf), V(W * 0.34, hood - 0.16, zf)],
    exhaust: V(-W * 0.3, c + 0.12, zr - 0.05),
    steeringWheel: { pos: V(-W * 0.22, belt + 0.02, wsBase - 0.35), tilt: 1.15 },
  };
  void frontY;
}

/** Wheel parts are authored with the hub face on +x; flip for left-side wheels. */
function mirrorWheel(parts: Part[], x: number): Part[] {
  if (x >= 0) return parts;
  return parts.map((p) => {
    const g = p.geo.clone();
    g.scale(-1, 1, 1);
    // fix winding after mirroring
    if (g.index) {
      const idx = g.index.array as Uint16Array | Uint32Array;
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
    } else {
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) {
        for (const att of Object.values(g.attributes) as THREE.BufferAttribute[]) {
          for (let k = 0; k < att.itemSize; k++) {
            const a = att.array[(i) * att.itemSize + k];
            (att.array as Float32Array)[i * att.itemSize + k] = att.array[(i + 2) * att.itemSize + k];
            (att.array as Float32Array)[(i + 2) * att.itemSize + k] = a;
          }
        }
      }
    }
    g.computeVertexNormals();
    return { ...p, geo: g };
  });
}

// ------------------------------------------------------------------------------------ two-wheelers
function motorcycle(spec: VehicleSpec, paint: string, rng: Rng): VehicleModel {
  const R = spec.wheelRadius, wb = spec.wheelbase;
  const zf = wb / 2, zr = -wb / 2;
  const P = col(paint);
  const parts: Part[] = [];
  const sport = spec.body === 'sportbike';
  const steer = V(0, 0.98, zf - 0.32); // top of steering head
  // front fork (raked)
  for (const s of [-1, 1]) parts.push({ key: 'chrome', geo: tube(V(s * 0.08, R, zf), V(s * 0.08, steer.y - 0.05, steer.z), 0.022), color: col(sport ? '#c9a227' : '#cfd2d4') });
  parts.push({ key: 'car_trim', geo: box(0.22, 0.04, 0.08, 0, steer.y - 0.04, steer.z), color: col('#222') });
  // handlebar, grips, levers, mirrors
  const hb = V(0, steer.y + 0.1, steer.z - 0.05);
  parts.push({ key: 'chrome', geo: tube(V(-0.36, hb.y + 0.03, hb.z - 0.06), V(0.36, hb.y + 0.03, hb.z - 0.06), 0.012), color: col('#c9ccce') });
  for (const s of [-1, 1]) {
    parts.push({ key: 'rubber', geo: cyl(0.018, 0.018, 0.12, 8, s * 0.32, hb.y + 0.03, hb.z - 0.06, 0, 0, Math.PI / 2), color: col('#1a1a1a') });
    parts.push({ key: 'chrome', geo: tube(V(s * 0.22, hb.y + 0.04, hb.z - 0.04), V(s * 0.26, hb.y + 0.3, hb.z - 0.02), 0.006), color: col('#bbb') });
    parts.push({ key: 'car_trim', geo: roundedBox(0.1, 0.06, 0.02, 0.01).translate(s * 0.27, hb.y + 0.32, hb.z - 0.02), color: col('#151515') });
  }
  // headlamp nacelle / fairing
  if (sport) {
    parts.push({ key: 'car_paint', geo: ell(0.2, 0.24, 0.36, 0, 0.82, zf - 0.33, -0.35, 22), color: P });
    parts.push({ key: 'car_paint', geo: ell(0.21, 0.12, 0.42, 0, 0.55, -0.05, 0.1, 18), color: P }); // belly pan
    parts.push({ key: 'headlight', geo: roundedBox(0.2, 0.08, 0.05, 0.03).translate(0, 0.86, zf - 0.08) });
    parts.push({ key: 'car_glass', geo: box(0.26, 0.18, 0.01, 0, 1.12, zf - 0.38, -0.5) });
  } else {
    const lamp = new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    lamp.rotateX(Math.PI / 2);
    lamp.translate(0, 0.93, zf - 0.17);
    parts.push({ key: 'car_paint', geo: lamp, color: col('#1a1a1a') });
    parts.push({ key: 'headlight', geo: cyl(0.085, 0.085, 0.02, 18, 0, 0.93, zf - 0.07, Math.PI / 2) });
    parts.push({ key: 'car_paint', geo: roundedBox(0.26, 0.14, 0.18, 0.05).translate(0, 1.05, zf - 0.25), color: P }); // visor / console
    parts.push({ key: 'car_trim', geo: box(0.16, 0.06, 0.02, 0, 1.1, zf - 0.33, -0.5), color: col('#0e0e0e') });
  }
  // front mudguard
  const mg = new THREE.TorusGeometry(R + 0.04, 0.05, 4, 16, Math.PI * 0.55);
  mg.scale(1, 1, 1.4);
  mg.rotateY(Math.PI / 2);
  mg.rotateX(Math.PI * 0.15);
  mg.translate(0, R, zf);
  parts.push({ key: 'car_paint', geo: mg, color: sport ? P : col('#c9ccce') });
  // frame tubes
  parts.push({ key: 'car_trim', geo: tube(V(0, steer.y - 0.05, steer.z), V(0, 0.55, -0.05), 0.03), color: col('#1c1c1c') });
  parts.push({ key: 'car_trim', geo: tube(V(0, 0.55, -0.05), V(0, 0.78, zr + 0.35), 0.025), color: col('#1c1c1c') });
  // fuel tank (teardrop) with knee indents
  parts.push({ key: 'car_paint', geo: ell(sport ? 0.19 : 0.165, 0.13, 0.32, 0, 0.88, 0.06, -0.12, 22), color: P });
  // tank stripe
  parts.push({ key: 'car_trim', geo: box(sport ? 0.37 : 0.33, 0.025, 0.4, 0, 0.92, 0.05, -0.18), color: col(rng.pick(['#e5e5e5', '#d4af37', '#c62828'])) });
  // seat
  parts.push({ key: 'vinyl', geo: ell(0.14, 0.055, 0.36, 0, 0.88, zr + 0.42, sport ? -0.12 : 0, 18), color: col('#151515') });
  // side panels + tail cowl
  parts.push({ key: 'car_paint', geo: ell(0.13, 0.12, 0.26, 0, 0.74, -0.2, 0, 16), color: P });
  parts.push({ key: 'car_paint', geo: ell(0.1, 0.07, 0.3, 0, 0.82, zr + 0.12, sport ? -0.25 : -0.05, 16), color: P });
  parts.push({ key: 'taillight', geo: roundedBox(0.12, 0.05, 0.04, 0.02).translate(0, 0.8, zr - 0.07) });
  parts.push({ key: 'chrome', geo: tube(V(-0.12, 0.88, zr + 0.25), V(-0.12, 0.88, zr + 0.02), 0.012), color: col('#bbb') });
  parts.push({ key: 'chrome', geo: tube(V(0.12, 0.88, zr + 0.25), V(0.12, 0.88, zr + 0.02), 0.012), color: col('#bbb') });
  parts.push({ key: 'plate', geo: box(0.2, 0.11, 0.005, 0, 0.62, zr - 0.12, 0.25) });
  // rear mudguard
  const rg = new THREE.TorusGeometry(R + 0.05, 0.045, 4, 16, Math.PI * 0.5);
  rg.scale(1, 1, 1.3);
  rg.rotateY(-Math.PI / 2);
  rg.rotateX(Math.PI * 0.2);
  rg.translate(0, R, zr);
  parts.push({ key: 'car_paint', geo: rg, color: P });
  // engine: crankcase + finned cylinder + exhaust
  parts.push({ key: 'chrome', geo: roundedBox(0.24, 0.24, 0.32, 0.05).translate(0, 0.36, 0.0), color: col('#9ea3a6') });
  for (let k = 0; k < 6; k++) parts.push({ key: 'chrome', geo: box(0.2, 0.012, 0.2, 0, 0.52 + k * 0.03, 0.12, -0.35), color: col('#7d8285') });
  parts.push({ key: 'car_trim', geo: box(0.05, 0.08, 0.6, 0.12, 0.38, zr / 2 + 0.05), color: col('#1a1a1a') }); // chain guard
  const ex1 = V(-0.08, 0.5, 0.16), ex2 = V(-0.14, 0.25, -0.05), ex3 = V(-0.16, 0.32, zr + 0.05);
  parts.push({ key: 'chrome', geo: tube(ex1, ex2, 0.022), color: col('#c9ccce') });
  parts.push({ key: 'chrome', geo: tube(ex2, V(-0.15, 0.27, -0.3), 0.022), color: col('#c9ccce') });
  parts.push({ key: 'chrome', geo: tube(V(-0.15, 0.27, -0.3), ex3, 0.045, 12), color: col(sport ? '#3a3a3a' : '#c9ccce') });
  // rear shocks
  for (const s of [-1, 1]) parts.push({ key: 'chrome', geo: tube(V(s * 0.12, R + 0.02, zr + 0.1), V(s * 0.12, 0.8, zr + 0.3), 0.022), color: col(sport ? '#d42' : '#d0d3d5') });
  // swingarm + footpegs + side stand
  for (const s of [-1, 1]) parts.push({ key: 'car_trim', geo: tube(V(s * 0.1, R, zr), V(s * 0.08, 0.4, -0.12), 0.02), color: col('#222') });
  for (const s of [-1, 1]) parts.push({ key: 'rubber', geo: cyl(0.015, 0.015, 0.12, 6, s * 0.18, 0.32, -0.05, 0, 0, Math.PI / 2), color: col('#111') });
  parts.push({ key: 'car_trim', geo: tube(V(-0.12, 0.3, -0.02), V(-0.28, 0.0, 0.05), 0.012), color: col('#222') });
  const wheels: WheelDef[] = [
    { x: 0, y: R, z: zf, r: R, width: sport ? 0.12 : 0.085, steer: true, moto: true },
    { x: 0, y: R, z: zr, r: R, width: sport ? 0.16 : 0.1, steer: false, moto: true },
  ];
  return {
    parts, wheels, wheelParts: (w) => motoWheelParts(w.r, w.width, !sport),
    driverSeat: V(0, 0.9, -0.3), passengerSeats: [V(0, 0.95, zr + 0.25)],
    headlights: [V(0, 0.93, zf - 0.05)], exhaust: ex3, handlebar: hb,
  };
}

function scooter(spec: VehicleSpec, paint: string, rng: Rng): VehicleModel {
  const R = spec.wheelRadius, wb = spec.wheelbase;
  const zf = wb / 2, zr = -wb / 2;
  const P = col(paint);
  const parts: Part[] = [];
  const ev = spec.fuel === 'electric';
  // front leg-shield: curved panel (front view silhouette extruded thin, tilted back)
  const shield = new THREE.Shape();
  shield.moveTo(-0.2, 0); shield.lineTo(0.2, 0);
  shield.quadraticCurveTo(0.23, 0.35, 0.16, 0.7); shield.lineTo(0.09, 0.78); shield.lineTo(-0.09, 0.78); shield.lineTo(-0.16, 0.7);
  shield.quadraticCurveTo(-0.23, 0.35, -0.2, 0);
  const sg = new THREE.ExtrudeGeometry(shield, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 });
  // bend: push the sides back for a curved shield
  const sp = sg.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < sp.count; k++) sp.setZ(k, sp.getZ(k) - sp.getX(k) * sp.getX(k) * 2.2);
  sg.computeVertexNormals();
  sg.rotateX(-0.22);
  sg.translate(0, 0.3, zf - 0.3);
  parts.push({ key: 'car_paint', geo: sg, color: P });
  // floorboard
  parts.push({ key: 'car_trim', geo: roundedBox(0.36, 0.06, 0.5, 0.025).translate(0, 0.3, zf - 0.68), color: col('#202020') });
  // rear body: smooth bulbous side panels
  parts.push({ key: 'car_paint', geo: ell(0.21, 0.26, 0.5, 0, 0.6, zr + 0.28, 0.08, 22), color: P });
  parts.push({ key: 'car_paint', geo: ell(0.17, 0.18, 0.3, 0, 0.45, zf - 0.95, 0, 16), color: P }); // tunnel
  // seat (long, padded)
  parts.push({ key: 'vinyl', geo: ell(0.16, 0.06, 0.42, 0, 0.86, zr + 0.3, 0, 18), color: col(ev ? '#262626' : '#3a2a1e') });
  // steering column + handlebar cover + headlamp
  parts.push({ key: 'car_paint', geo: tube(V(0, 0.95, zf - 0.33), V(0, 1.1, zf - 0.38), 0.045), color: P });
  parts.push({ key: 'car_paint', geo: ell(0.29, 0.07, 0.11, 0, 1.15, zf - 0.4, 0, 18), color: P });
  parts.push({ key: 'headlight', geo: ell(0.07, 0.045, 0.03, 0, 1.15, zf - 0.3, 0, 14) });
  parts.push({ key: 'car_trim', geo: box(0.14, 0.05, 0.02, 0, 1.2, zf - 0.47, -0.6), color: col('#0e0e0e') });
  for (const s of [-1, 1]) {
    parts.push({ key: 'rubber', geo: cyl(0.017, 0.017, 0.11, 8, s * 0.32, 1.15, zf - 0.42, 0, 0, Math.PI / 2), color: col('#1a1a1a') });
    parts.push({ key: 'chrome', geo: tube(V(s * 0.22, 1.18, zf - 0.42), V(s * 0.27, 1.4, zf - 0.4), 0.006), color: col('#bbb') });
    parts.push({ key: 'car_trim', geo: roundedBox(0.09, 0.055, 0.02, 0.01).translate(s * 0.28, 1.42, zf - 0.4), color: col('#151515') });
    parts.push({ key: 'indicator', geo: ell(0.025, 0.018, 0.02, s * 0.2, 0.62, zf - 0.27), color: col('#ff9a1a') });
  }
  // front fork + mudguard
  parts.push({ key: 'car_trim', geo: tube(V(0.05, R, zf), V(0.03, 0.62, zf - 0.22), 0.022), color: col('#2b2b2b') });
  parts.push({ key: 'car_paint', geo: ell(0.07, 0.05, R * 0.75, 0, R + 0.12, zf, 0, 14, Math.PI * 0.5), color: P });
  // rear: tail lamp, plate, grab rail, engine/swingarm & exhaust on the right
  parts.push({ key: 'taillight', geo: ell(0.08, 0.035, 0.03, 0, 0.72, zr - 0.2, 0, 12) });
  parts.push({ key: 'plate', geo: box(0.2, 0.11, 0.005, 0, 0.5, zr - 0.2, 0.15) });
  parts.push({ key: 'chrome', geo: tube(V(-0.14, 0.92, zr + 0.05), V(0.14, 0.92, zr + 0.05), 0.012), color: col('#999') });
  parts.push({ key: 'car_trim', geo: roundedBox(0.12, 0.16, 0.42, 0.04).translate(-0.12, R + 0.05, zr + 0.18), color: col('#3a3a3a') });
  if (!ev) parts.push({ key: 'chrome', geo: tube(V(0.12, 0.25, zr + 0.35), V(0.16, 0.3, zr - 0.08), 0.045, 12), color: col('#5a5a5a') });
  parts.push({ key: 'car_trim', geo: tube(V(-0.1, 0.28, -0.05), V(-0.25, 0.0, 0.0), 0.012), color: col('#222') });
  void rng;
  const wheels: WheelDef[] = [
    { x: 0, y: R, z: zf, r: R, width: 0.1, steer: true, moto: true },
    { x: 0, y: R, z: zr, r: R, width: 0.11, steer: false, moto: true },
  ];
  return {
    parts, wheels, wheelParts: (w) => motoWheelParts(w.r, w.width, false),
    driverSeat: V(0, 0.9, -0.2), passengerSeats: [V(0, 0.95, zr + 0.15)],
    headlights: [V(0, 1.15, zf - 0.28)], exhaust: V(0.16, 0.3, zr - 0.08), handlebar: V(0, 1.15, zf - 0.42),
  };
}

function autoRickshaw(spec: VehicleSpec, paint: string): VehicleModel {
  const L = spec.length, W = spec.width, R = spec.wheelRadius;
  const zf = L / 2 - 0.25, zr = -L / 2 + 0.55;
  const parts: Part[] = [];
  const black = col(paint || '#151515'), yellow = col('#f0c419');
  // floor pan / lower body (rear tub) - black
  const tub: [number, number][] = [[-L / 2, 0.42], [-L / 2 + 0.02, 0.9], [0.35, 0.9], [0.55, 0.55], [0.55, 0.3], [-L / 2 + 0.2, 0.28]];
  parts.push({ key: 'car_paint', geo: profileExtrude(tub, W, 0.08, [{ z: zr, r: R + 0.08, y: R }]), color: black });
  // front cowl (nose) - narrow, rounded, black with yellow top band
  const nose: [number, number][] = [[0.3, 0.3], [0.3, 1.05], [0.85, 1.02], [L / 2 - 0.05, 0.78], [L / 2, 0.45], [L / 2 - 0.25, 0.28]];
  parts.push({ key: 'car_paint', geo: profileExtrude(nose, 0.72, 0.16, [{ z: zf, r: R + 0.07, y: R }]), color: black });
  parts.push({ key: 'car_paint', geo: ell(0.37, 0.12, 0.42, 0, 0.98, 0.72, 0.15, 20, Math.PI / 2), color: yellow });
  // headlamp + indicators on the nose
  parts.push({ key: 'headlight', geo: cyl(0.085, 0.085, 0.05, 18, 0, 0.72, L / 2 + 0.01, Math.PI / 2) });
  parts.push({ key: 'chrome', geo: new THREE.TorusGeometry(0.09, 0.012, 6, 18).translate(0, 0.72, L / 2 + 0.02), color: col('#c9ccce') });
  for (const s of [-1, 1]) parts.push({ key: 'indicator', geo: roundedBox(0.07, 0.05, 0.04, 0.02).translate(s * 0.25, 0.86, L / 2 - 0.15), color: col('#ff9a1a') });
  // windscreen frame + glass
  parts.push({ key: 'car_glass', geo: box(W - 0.15, 0.55, 0.02, 0, 1.33, 0.36, -0.12) });
  for (const s of [-1, 1]) parts.push({ key: 'car_trim', geo: box(0.04, 0.95, 0.04, s * (W / 2 - 0.08), 1.32, 0.33), color: col('#222') });
  // canopy: curved roof sheet over the whole cabin (yellow), with black side flaps rolled up
  const canopy = ell(W / 2 + 0.06, 0.2, (L - 0.6) / 2, 0, 1.7, -0.27, 0, 24, Math.PI / 2);
  parts.push({ key: 'canvas', geo: canopy, color: yellow });
  parts.push({ key: 'canvas', geo: roundedBox(W + 0.1, 0.12, L - 0.58, 0.05).translate(0, 1.68, -0.27), color: yellow });
  // canvas side drop (front part) and rear canvas wall
  for (const s of [-1, 1]) parts.push({ key: 'canvas', geo: box(0.02, 0.32, 0.9, s * (W / 2 + 0.05), 1.5, -0.75), color: col('#1c1c1c') });
  for (const s of [-1, 1]) {
    parts.push({ key: 'canvas', geo: cyl(0.05, 0.05, L - 0.9, 10, s * (W / 2 + 0.02), 1.62, -0.35, Math.PI / 2), color: col('#1a1a1a') });
    // support tubes
    parts.push({ key: 'chrome', geo: tube(V(s * (W / 2 - 0.04), 0.9, -L / 2 + 0.15), V(s * (W / 2 - 0.04), 1.72, -L / 2 + 0.15), 0.018), color: col('#c9ccce') });
    parts.push({ key: 'chrome', geo: tube(V(s * (W / 2 - 0.04), 0.9, -0.15), V(s * (W / 2 - 0.04), 1.72, -0.15), 0.018), color: col('#c9ccce') });
    // grab rail
    parts.push({ key: 'chrome', geo: tube(V(s * (W / 2 + 0.01), 1.05, -0.95), V(s * (W / 2 + 0.01), 1.05, -0.2), 0.012), color: col('#c9ccce') });
  }
  // rear panel with small window, tail lamps, plate, "Horn" style decal band
  parts.push({ key: 'car_paint', geo: box(W, 0.8, 0.04, 0, 1.3, -L / 2 + 0.06), color: yellow });
  parts.push({ key: 'car_glass', geo: box(W * 0.5, 0.25, 0.01, 0, 1.45, -L / 2 + 0.035) });
  for (const s of [-1, 1]) parts.push({ key: 'taillight', geo: roundedBox(0.1, 0.12, 0.04, 0.02).translate(s * (W / 2 - 0.12), 0.75, -L / 2 - 0.01) });
  parts.push({ key: 'plate', geo: box(0.32, 0.16, 0.005, 0, 0.62, -L / 2 - 0.025) });
  // passenger bench + backrest, driver seat
  parts.push({ key: 'vinyl', geo: roundedBox(W - 0.12, 0.14, 0.45, 0.05).translate(0, 0.98, -0.85), color: col('#3b2a20') });
  parts.push({ key: 'vinyl', geo: roundedBox(W - 0.12, 0.45, 0.12, 0.05).translate(0, 1.25, -1.1), color: col('#3b2a20') });
  parts.push({ key: 'vinyl', geo: roundedBox(0.45, 0.12, 0.35, 0.04).translate(0, 1.02, -0.05), color: col('#3b2a20') });
  // handlebar + fare meter (iconic)
  const hb = V(0, 1.22, 0.42);
  parts.push({ key: 'chrome', geo: tube(V(-0.32, hb.y, hb.z), V(0.32, hb.y, hb.z), 0.014), color: col('#c9ccce') });
  for (const s of [-1, 1]) parts.push({ key: 'rubber', geo: cyl(0.02, 0.02, 0.12, 8, s * 0.3, hb.y, hb.z, 0, 0, Math.PI / 2), color: col('#151515') });
  parts.push({ key: 'car_trim', geo: roundedBox(0.16, 0.2, 0.1, 0.02).translate(0.42, 1.2, 0.36), color: col('#1c1c1c') });
  parts.push({ key: 'meter', geo: box(0.12, 0.05, 0.01, 0.42, 1.24, 0.415) });
  for (const s of [-1, 1]) {
    parts.push({ key: 'chrome', geo: tube(V(s * 0.45, 1.2, 0.4), V(s * 0.58, 1.55, 0.42), 0.007), color: col('#bbb') });
    parts.push({ key: 'car_trim', geo: roundedBox(0.12, 0.08, 0.02, 0.01).translate(s * 0.6, 1.57, 0.42), color: col('#151515') });
  }
  // engine/exhaust underneath at rear
  parts.push({ key: 'chrome', geo: tube(V(0.3, 0.3, -0.6), V(0.42, 0.28, -L / 2 - 0.02), 0.035), color: col('#555') });
  parts.push({ key: 'car_trim', geo: box(W - 0.3, 0.06, L - 0.6, 0, 0.3, -0.2), color: col('#0e0e0e') });
  const wheels: WheelDef[] = [
    { x: 0, y: R, z: zf, r: R, width: 0.12, steer: true, moto: false },
    { x: W / 2 - 0.12, y: R, z: zr, r: R, width: 0.12, steer: false, moto: false },
    { x: -(W / 2 - 0.12), y: R, z: zr, r: R, width: 0.12, steer: false, moto: false },
  ];
  return {
    parts, wheels, wheelParts: (w) => mirrorWheel(carWheelParts(w.r, w.width, 'steel'), w.x),
    driverSeat: V(0, 1.06, -0.05), passengerSeats: [V(-0.35, 1.04, -0.85), V(0, 1.04, -0.85), V(0.35, 1.04, -0.85)],
    headlights: [V(0, 0.72, L / 2 + 0.02)], exhaust: V(0.42, 0.28, -L / 2 - 0.02), handlebar: hb,
  };
}

function bus(spec: VehicleSpec, paint: string): VehicleModel {
  const L = spec.length, W = spec.width, H = spec.height, R = spec.wheelRadius;
  const parts: Part[] = [];
  const red = col(paint), cream = col('#efe6cf');
  const zf = L / 2, zr = -L / 2;
  const wf = zf - 2.3, wr = zr + 2.9;
  const lower: [number, number][] = [[zr, 0.4], [zr, 1.35], [zf - 0.05, 1.35], [zf, 1.2], [zf, 0.45], [zf - 0.1, 0.35]];
  parts.push({ key: 'car_paint', geo: profileExtrude(lower, W, 0.08, [{ z: wf, r: R + 0.1, y: R }, { z: wr, r: R + 0.1, y: R }]), color: red });
  parts.push({ key: 'car_glass', geo: roundedBox(W - 0.04, 1.05, L - 0.3, 0.06).translate(0, 1.9, -0.05) });
  // window pillars
  for (let z = zr + 0.6; z < zf - 1.2; z += 1.25) for (const s of [-1, 1]) parts.push({ key: 'car_paint', geo: box(0.03, 1.05, 0.12, s * (W / 2 - 0.0), 1.9, z), color: cream });
  parts.push({ key: 'car_paint', geo: roundedBox(W, 0.65, L, 0.12).translate(0, 2.75, 0), color: cream });
  parts.push({ key: 'car_paint', geo: box(W + 0.01, 0.12, L - 0.1, 0, 1.4, 0), color: cream });
  // front: big windscreen, destination LED board, headlamps, bumper
  parts.push({ key: 'car_glass', geo: box(W - 0.2, 1.2, 0.02, 0, 1.95, zf + 0.0, 0.08) });
  parts.push({ key: 'led_board', geo: box(W - 0.5, 0.3, 0.02, 0, 2.75, zf + 0.04) });
  for (const s of [-1, 1]) parts.push({ key: 'headlight', geo: roundedBox(0.3, 0.14, 0.05, 0.03).translate(s * (W / 2 - 0.35), 0.8, zf + 0.01) });
  parts.push({ key: 'car_trim', geo: roundedBox(W + 0.04, 0.35, 0.15, 0.06).translate(0, 0.5, zf), color: col('#1c1c1c') });
  parts.push({ key: 'car_trim', geo: roundedBox(W + 0.04, 0.35, 0.15, 0.06).translate(0, 0.5, zr), color: col('#1c1c1c') });
  for (const s of [-1, 1]) parts.push({ key: 'taillight', geo: roundedBox(0.18, 0.4, 0.04, 0.03).translate(s * (W / 2 - 0.2), 1.0, zr - 0.02) });
  // doors (left side: front and middle)
  for (const dz of [zf - 1.0, -0.4]) parts.push({ key: 'car_trim', geo: box(0.02, 2.1, 1.0, W / 2 + 0.01, 1.4, dz), color: col('#2a2a2a') });
  // seats inside
  for (let z = zr + 1.2; z < zf - 2.0; z += 0.85) for (const s of [-1, 1]) parts.push({ key: 'vinyl', geo: roundedBox(0.9, 0.5, 0.45, 0.06).translate(s * 0.62, 1.15, z), color: col('#3b5a8a') });
  const wheels: WheelDef[] = [
    { x: W / 2 - 0.18, y: R, z: wf, r: R, width: 0.3, steer: true, moto: false }, { x: -(W / 2 - 0.18), y: R, z: wf, r: R, width: 0.3, steer: true, moto: false },
    { x: W / 2 - 0.18, y: R, z: wr, r: R, width: 0.3, steer: false, moto: false }, { x: -(W / 2 - 0.18), y: R, z: wr, r: R, width: 0.3, steer: false, moto: false },
  ];
  return {
    parts, wheels, wheelParts: (w) => mirrorWheel(carWheelParts(w.r, w.width, 'steel'), w.x),
    driverSeat: V(-W / 2 + 0.6, 1.4, zf - 0.9), passengerSeats: [], headlights: [V(-W / 2 + 0.35, 0.8, zf), V(W / 2 - 0.35, 0.8, zf)],
    exhaust: V(-W / 2 + 0.3, 0.4, zr), steeringWheel: { pos: V(-W / 2 + 0.6, 1.75, zf - 0.55), tilt: 0.5 },
  };
  void H;
}

function truck(spec: VehicleSpec, paint: string, rng: Rng): VehicleModel {
  const L = spec.length, W = spec.width, R = spec.wheelRadius;
  const parts: Part[] = [];
  const P = col(paint);
  const zf = L / 2, zr = -L / 2;
  const wf = zf - 1.2, wr = zr + 1.8;
  // cab
  const cab: [number, number][] = [[zf - 1.9, 0.75], [zf - 1.9, 2.6], [zf - 0.25, 2.6], [zf, 2.0], [zf, 0.6], [zf - 0.2, 0.5]];
  parts.push({ key: 'car_paint', geo: profileExtrude(cab, W, 0.08, [{ z: wf, r: R + 0.1, y: R }]), color: P });
  parts.push({ key: 'car_glass', geo: box(W - 0.3, 0.75, 0.02, 0, 2.05, zf - 0.08, 0.15) });
  for (const s of [-1, 1]) parts.push({ key: 'car_glass', geo: box(0.02, 0.6, 0.8, s * (W / 2 + 0.005), 2.0, zf - 0.8) });
  parts.push({ key: 'chrome', geo: box(W * 0.7, 0.45, 0.04, 0, 1.15, zf + 0.02), color: col('#b9bdc0') });
  for (const s of [-1, 1]) parts.push({ key: 'headlight', geo: cyl(0.11, 0.11, 0.05, 16, s * (W / 2 - 0.3), 1.0, zf + 0.02, Math.PI / 2) });
  parts.push({ key: 'car_trim', geo: roundedBox(W + 0.06, 0.3, 0.2, 0.05).translate(0, 0.6, zf), color: col('#1c1c1c') });
  // cargo body: wooden decorated tray with painted panels
  const deco = rng.pick(['#e8b21f', '#2a6fb5', '#c2421b', '#2f8b3a']);
  parts.push({ key: 'car_paint', geo: box(W + 0.05, 0.1, L - 2.1, 0, 1.0, zr + (L - 2.1) / 2), color: col('#5b3a22') });
  for (const s of [-1, 1]) {
    parts.push({ key: 'car_paint', geo: box(0.08, 1.2, L - 2.1, s * (W / 2 + 0.02), 1.65, zr + (L - 2.1) / 2), color: col(deco) });
    for (let k = 0; k < 5; k++) parts.push({ key: 'car_trim', geo: box(0.09, 1.2, 0.06, s * (W / 2 + 0.03), 1.65, zr + 0.2 + k * ((L - 2.4) / 4)), color: col('#7a2e1b') });
  }
  parts.push({ key: 'car_paint', geo: box(W + 0.05, 1.2, 0.08, 0, 1.65, zr + 0.02), color: col(deco) });
  parts.push({ key: 'horn_ok', geo: box(W * 0.8, 0.45, 0.01, 0, 1.65, zr - 0.03) });
  for (const s of [-1, 1]) parts.push({ key: 'taillight', geo: roundedBox(0.15, 0.1, 0.04, 0.02).translate(s * (W / 2 - 0.2), 0.75, zr - 0.02) });
  // tarpaulin roll
  parts.push({ key: 'canvas', geo: cyl(0.18, 0.18, W, 12, 0, 2.4, zf - 2.1, 0, 0, Math.PI / 2), color: col('#2b5fa8') });
  parts.push({ key: 'car_trim', geo: box(W - 0.4, 0.25, L - 0.5, 0, 0.65, -0.2), color: col('#151515') });
  const wheels: WheelDef[] = [
    { x: W / 2 - 0.25, y: R, z: wf, r: R, width: 0.28, steer: true, moto: false }, { x: -(W / 2 - 0.25), y: R, z: wf, r: R, width: 0.28, steer: true, moto: false },
    { x: W / 2 - 0.3, y: R, z: wr, r: R, width: 0.5, steer: false, moto: false }, { x: -(W / 2 - 0.3), y: R, z: wr, r: R, width: 0.5, steer: false, moto: false },
  ];
  return {
    parts, wheels, wheelParts: (w) => mirrorWheel(carWheelParts(w.r, w.width, 'steel'), w.x),
    driverSeat: V(-W / 2 + 0.55, 1.55, zf - 0.9), passengerSeats: [V(W / 2 - 0.55, 1.55, zf - 0.9)],
    headlights: [V(-W / 2 + 0.3, 1.0, zf), V(W / 2 - 0.3, 1.0, zf)], exhaust: V(-W / 2, 0.5, zr + 2), steeringWheel: { pos: V(-W / 2 + 0.55, 1.85, zf - 0.55), tilt: 0.6 },
  };
}

/** Flatten a model (body + wheels at rest) into parts, optionally leaning (two-wheelers on side stands). */
export function staticParts(m: VehicleModel, leanRad = 0): Part[] {
  const out: Part[] = [...m.parts];
  for (const w of m.wheels) {
    for (const p of m.wheelParts(w)) {
      const g = p.geo.clone();
      g.translate(w.x, w.y, w.z);
      out.push({ ...p, geo: g });
    }
  }
  if (leanRad) {
    const mat = new THREE.Matrix4().makeRotationZ(leanRad);
    return out.map((p) => ({ ...p, geo: p.geo.clone().applyMatrix4(mat) }));
  }
  return out;
}

/** Merge parts by material key (for dynamic vehicles: few draw calls each). */
export function mergeByKey(parts: Part[]): Map<string, THREE.BufferGeometry> {
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = p.color ?? new THREE.Color(1, 1, 1);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    let l = buckets.get(p.key);
    if (!l) buckets.set(p.key, (l = []));
    l.push(g);
  }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [k, l] of buckets) {
    const m = mergeGeometries(l, false);
    if (m) out.set(k, m);
  }
  return out;
}
