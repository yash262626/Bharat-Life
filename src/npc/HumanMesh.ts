// Procedural human body mesh for GPU-animated crowds.
// One continuous-looking mesh made of lofted segments with per-vertex `bone` and `region` attributes.
// Rest pose: standing, arms slightly away from the body, facing +z, feet on y = 0, height ~1.70 m.
// NOTE: this is a stylised placeholder body, not a scanned/realistic human (see docs/ASSETS.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BONE = { pelvis: 0, spine: 1, head: 2, uArmL: 3, fArmL: 4, uArmR: 5, fArmR: 6, thighL: 7, shinL: 8, thighR: 9, shinR: 10, skirt: 11, umbrella: 12 } as const;
export const REGION = { skin: 0, top: 1, bottom: 2, hair: 3, shoe: 4, skirt: 5, sleeve: 6, umbrella: 7, eye: 8, beard: 9, bag: 10, fullBeard: 11, bun: 12 } as const;

/** Joint pivots in rest pose (left = +x). */
export const JOINT = {
  hipL: new THREE.Vector3(0.095, 0.93, 0), hipR: new THREE.Vector3(-0.095, 0.93, 0),
  kneeL: new THREE.Vector3(0.1, 0.5, 0.01), kneeR: new THREE.Vector3(-0.1, 0.5, 0.01),
  shL: new THREE.Vector3(0.19, 1.41, -0.01), shR: new THREE.Vector3(-0.19, 1.41, -0.01),
  elL: new THREE.Vector3(0.235, 1.13, -0.02), elR: new THREE.Vector3(-0.235, 1.13, -0.02),
  neck: new THREE.Vector3(0, 1.47, -0.01), waist: new THREE.Vector3(0, 1.0, 0),
};

function tag(g: THREE.BufferGeometry, bone: number, region: number) {
  const n = g.attributes.position.count;
  g.setAttribute('bone', new THREE.Float32BufferAttribute(new Float32Array(n).fill(bone), 1));
  g.setAttribute('region', new THREE.Float32BufferAttribute(new Float32Array(n).fill(region), 1));
  return g;
}

function clean(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'bone', 'region'].includes(k)) out.deleteAttribute(k);
  return out;
}

/**
 * Tapered tube between a and b with elliptical cross-section; rings closed with hemispherical caps
 * so joints look smooth. `regionAt(t)` allows clothing boundaries along the segment.
 */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, bone: number, regionAt: (t: number) => number, opts: { flat?: number; seg?: number; rings?: number } = {}) {
  const seg = opts.seg ?? 10, rings = opts.rings ?? 6;
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const parts: THREE.BufferGeometry[] = [];
  // body of the limb split into bands so each band can carry its own clothing region
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings, t1 = (i + 1) / rings;
    const ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
    // slight muscle bulge
    const bulge = (t: number) => 1 + Math.sin(t * Math.PI) * 0.08;
    const g = new THREE.CylinderGeometry(rb * bulge(t1), ra * bulge(t0), len / rings, seg, 1, true);
    g.translate(0, (t0 + t1) / 2 * len, 0);
    if (opts.flat) g.scale(1, 1, opts.flat);
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    parts.push(tag(clean(g), bone, regionAt((t0 + t1) / 2)));
  }
  // joint caps
  for (const [p, r, t] of [[a, r0, 0], [b, r1, 1]] as const) {
    const s = new THREE.SphereGeometry(r * 1.02, seg, 6);
    if (opts.flat) s.scale(1, 1, opts.flat);
    s.translate(p.x, p.y, p.z);
    parts.push(tag(clean(s), bone, regionAt(t)));
  }
  return parts;
}

/** Elliptical-ring loft (torso, pelvis). rings: [y, halfWidth, halfDepth, zOffset, region] */
function loft(rings: [number, number, number, number, number][], bone: number, seg = 16) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    const [y0, w0, d0, z0, reg] = rings[i];
    const [y1, w1, d1, z1] = rings[i + 1];
    const pos: number[] = [];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const p = (y: number, w: number, d: number, z: number, a: number) => [Math.sin(a) * w, y, Math.cos(a) * d + z];
      const A = p(y0, w0, d0, z0, a0), B = p(y0, w0, d0, z0, a1), Cc = p(y1, w1, d1, z1, a1), D = p(y1, w1, d1, z1, a0);
      pos.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // smooth normals radially (outward from axis) for a soft body look
    const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute;
    for (let v = 0; v < P.count; v++) {
      const y = P.getY(v);
      const t = (y - y0) / (y1 - y0 || 1);
      const w = w0 + (w1 - w0) * t, d = d0 + (d1 - d0) * t, z = z0 + (z1 - z0) * t;
      const nx = P.getX(v) / (w * w), nz = (P.getZ(v) - z) / (d * d);
      const l = Math.hypot(nx, nz) || 1;
      N.setXYZ(v, nx / l, 0, nz / l);
    }
    parts.push(tag(g, bone, reg));
  }
  return parts;
}

/** Rest-pose right-hand grip point. */
export const UMBRELLA_GRIP = new THREE.Vector3(-0.25, 0.81, 0.005);

export interface HumanBuildOpts { detail?: 'crowd' | 'hero' }

/** Build the shared crowd body. Variation (gender, clothing, colours) is applied per instance in the shader. */
export function buildHumanGeometry(opts: HumanBuildOpts = {}): THREE.BufferGeometry {
  const hero = opts.detail === 'hero';
  const seg = hero ? 18 : 10;
  const parts: THREE.BufferGeometry[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const R = REGION;
  // Pelvis + torso (pants up to waist, shirt above)
  parts.push(...loft([
    [0.86, 0.15, 0.1, 0.0, R.bottom], [0.95, 0.165, 0.11, 0.0, R.bottom], [1.02, 0.15, 0.1, 0.005, R.top],
    [1.14, 0.155, 0.105, 0.01, R.top], [1.27, 0.175, 0.115, 0.0, R.top], [1.36, 0.185, 0.11, -0.01, R.top],
    [1.43, 0.165, 0.09, -0.01, R.top], [1.47, 0.07, 0.06, -0.01, R.skin],
  ], BONE.spine, seg + 6));
  // collar / shoulders caps
  for (const s of [1, -1]) {
    const sh = new THREE.SphereGeometry(0.075, seg, 8);
    sh.scale(1.1, 0.8, 0.95);
    sh.translate(s * 0.17, 1.4, -0.01);
    parts.push(tag(clean(sh), BONE.spine, R.top));
  }
  // neck
  parts.push(...limb(V(0, 1.44, -0.01), JOINT.neck.clone().add(V(0, 0.05, 0)), 0.055, 0.05, BONE.head, () => R.skin, { seg }));
  // head: skull + jaw, nose, ears, eyes, brows, hair cap
  const skull = new THREE.SphereGeometry(0.105, seg + 4, 14);
  skull.scale(0.93, 1.12, 1.03);
  skull.translate(0, 1.625, 0.0);
  parts.push(tag(clean(skull), BONE.head, R.skin));
  const jaw = new THREE.SphereGeometry(0.075, seg, 8);
  jaw.scale(1.05, 0.9, 1.0);
  jaw.translate(0, 1.565, 0.03);
  parts.push(tag(clean(jaw), BONE.head, R.skin));
  const nose = new THREE.ConeGeometry(0.018, 0.05, 6);
  nose.rotateX(Math.PI / 2 + 0.35);
  nose.translate(0, 1.61, 0.112);
  parts.push(tag(clean(nose), BONE.head, R.skin));
  for (const s of [1, -1]) {
    const ear = new THREE.SphereGeometry(0.022, 6, 5);
    ear.scale(0.5, 1.2, 0.9);
    ear.translate(s * 0.098, 1.62, -0.005);
    parts.push(tag(clean(ear), BONE.head, R.skin));
    const eye = new THREE.SphereGeometry(0.0135, 8, 6);
    eye.scale(1.2, 0.8, 0.6);
    eye.translate(s * 0.036, 1.637, 0.1);
    parts.push(tag(clean(eye), BONE.head, R.eye));
    const brow = new THREE.BoxGeometry(0.038, 0.008, 0.012);
    brow.rotateZ(s * -0.12);
    brow.translate(s * 0.036, 1.665, 0.102);
    parts.push(tag(clean(brow), BONE.head, R.hair));
  }
  // moustache (shown for some men via region 'beard')
  const mou = new THREE.BoxGeometry(0.05, 0.01, 0.012);
  mou.translate(0, 1.582, 0.104);
  parts.push(tag(clean(mou), BONE.head, R.beard));
  const beard = new THREE.SphereGeometry(0.078, seg, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5);
  beard.scale(1.06, 0.9, 1.04);
  beard.translate(0, 1.575, 0.028);
  parts.push(tag(clean(beard), BONE.head, R.fullBeard));
  // hair cap (back & top); long hair / bun for women handled by `hair` + skirt flag in shader
  const hair = new THREE.SphereGeometry(0.112, seg + 4, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hair.scale(0.95, 1.08, 1.06);
  hair.rotateX(-0.35);
  hair.translate(0, 1.645, -0.012);
  parts.push(tag(clean(hair), BONE.head, R.hair));
  const bun = new THREE.SphereGeometry(0.05, 10, 8);
  bun.translate(0, 1.62, -0.12);
  parts.push(tag(clean(bun), BONE.head, R.bun)); // female-only hair bun
  // Arms: sleeve region on upper arm, 'sleeve' (long/short configurable) on forearm
  for (const [s, ua, fa] of [[1, BONE.uArmL, BONE.fArmL], [-1, BONE.uArmR, BONE.fArmR]] as const) {
    const sh = s > 0 ? JOINT.shL : JOINT.shR, el = s > 0 ? JOINT.elL : JOINT.elR;
    const wr = V(s * 0.25, 0.87, 0.0);
    parts.push(...limb(sh, el, 0.052, 0.042, ua, (t) => (t < 0.55 ? R.top : R.sleeve), { seg }));
    parts.push(...limb(el, wr, 0.04, 0.03, fa, (t) => (t < 0.85 ? R.sleeve : R.skin), { seg }));
    const hand = new THREE.SphereGeometry(0.042, seg, 8);
    hand.scale(0.6, 1.25, 0.95);
    hand.translate(wr.x, wr.y - 0.06, wr.z + 0.005);
    parts.push(tag(clean(hand), fa, R.skin));
  }
  // Legs
  for (const [s, th, sh] of [[1, BONE.thighL, BONE.shinL], [-1, BONE.thighR, BONE.shinR]] as const) {
    const hip = s > 0 ? JOINT.hipL : JOINT.hipR, knee = s > 0 ? JOINT.kneeL : JOINT.kneeR;
    const ankle = V(s * 0.1, 0.085, -0.01);
    parts.push(...limb(hip, knee, 0.088, 0.062, th, () => R.bottom, { seg }));
    parts.push(...limb(knee, ankle, 0.058, 0.04, sh, () => R.bottom, { seg }));
    const foot = new THREE.SphereGeometry(0.05, seg, 8);
    foot.scale(0.85, 0.55, 2.3);
    foot.translate(ankle.x, 0.045, 0.06);
    parts.push(tag(clean(foot), sh, R.shoe));
  }
  // Sari / long skirt: cone from waist to ankles (only shown for instances with the skirt flag)
  const skirt = new THREE.CylinderGeometry(0.17, 0.27, 0.86, seg + 6, 3, true);
  skirt.translate(0, 0.52, 0.0);
  parts.push(tag(clean(skirt), BONE.skirt, R.skirt));
  // pallu (sari drape over the shoulder) - part of the skirt region
  const pallu = new THREE.BoxGeometry(0.14, 0.62, 0.02);
  pallu.rotateZ(0.5);
  pallu.translate(0.05, 1.2, 0.115);
  parts.push(tag(clean(pallu), BONE.spine, R.skirt));
  // Umbrella in the right hand (only shown when raining)
  // authored relative to the rest-pose right hand (UMBRELLA_GRIP); the shader keeps it upright
  const stick = new THREE.CylinderGeometry(0.008, 0.008, 0.95, 5);
  stick.translate(UMBRELLA_GRIP.x, UMBRELLA_GRIP.y + 0.45, UMBRELLA_GRIP.z);
  parts.push(tag(clean(stick), BONE.umbrella, R.umbrella));
  const canopy = new THREE.ConeGeometry(0.55, 0.28, 14, 1, true);
  canopy.translate(UMBRELLA_GRIP.x, UMBRELLA_GRIP.y + 0.95, UMBRELLA_GRIP.z);
  parts.push(tag(clean(canopy), BONE.umbrella, R.umbrella));
  // Shoulder bag / jhola (shown for some)
  const bag = new THREE.BoxGeometry(0.06, 0.24, 0.2);
  bag.translate(0.21, 0.98, 0.0);
  parts.push(tag(clean(bag), BONE.spine, R.bag));

  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  merged.boundingSphere!.radius = 1.5;
  return merged;
}
