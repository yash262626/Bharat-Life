// GPU crowd: hundreds of animated humans in one instanced draw call.
// Skeletal posing (walk/run/idle/sit/ride/squat/phone/umbrella) is evaluated in the vertex shader from
// per-instance parameters, so the CPU only updates a transform + 4 floats per person per frame.
import * as THREE from 'three';
import { buildHumanGeometry, JOINT, UMBRELLA_GRIP } from './HumanMesh';
import { Rng } from '../core/math';

export interface Appearance {
  skin: THREE.Color; top: THREE.Color; bottom: THREE.Color; hair: THREE.Color;
  female: boolean; longSleeve: boolean; beard: 0 | 1 | 2; bag: boolean; height: number; build: number;
}

export const enum Pose { Stand = 0, Sit = 1, Ride = 2, Squat = 3, Phone = 4, Pillion = 5, Drive = 6 }

const SKIN = ['#8d5524', '#a0662f', '#b97a4a', '#c68642', '#7a4a2a', '#d39b6a', '#6b3e1e', '#9a6038', '#b5784a'];
const SHIRTS = ['#f2f2ee', '#cfe1f2', '#7b1e2b', '#c9a227', '#556b2f', '#1f3a5f', '#e8a0b4', '#d8d2c0', '#2f6f8f', '#8a3324', '#e6e6e6', '#3d3d3d', '#9fb8a0'];
const PANTS = ['#2f3437', '#1f2a44', '#8b7d62', '#151515', '#3b4a6b', '#4a4038', '#5a5a5a'];
const SARIS = ['#c2185b', '#d32f2f', '#f57c00', '#2e7d32', '#6a1b9a', '#fbc02d', '#00838f', '#ad1457', '#1565c0', '#e64a19'];
const HAIR = ['#0b0908', '#151110', '#1c1512', '#2a1f18'];

export function randomAppearance(rng: Rng, female = rng.chance(0.42)): Appearance {
  const old = rng.chance(0.15);
  return {
    skin: new THREE.Color(rng.pick(SKIN)),
    top: new THREE.Color(female ? rng.pick([...SARIS, ...SHIRTS]) : rng.pick(SHIRTS)),
    bottom: new THREE.Color(female ? rng.pick(SARIS) : rng.pick(PANTS)),
    hair: new THREE.Color(old ? '#9a9792' : rng.pick(HAIR)),
    female,
    longSleeve: female ? rng.chance(0.3) : rng.chance(0.45),
    beard: female ? 0 : rng.chance(0.35) ? 1 : rng.chance(0.15) ? 2 : 0,
    bag: rng.chance(0.25),
    height: female ? rng.range(0.9, 0.97) : rng.range(0.96, 1.05),
    build: rng.range(0.92, 1.12),
  };
}

const VERT_HEAD = /* glsl */`
attribute float bone;
attribute float region;
attribute vec4 iAnim;   // phase, gait(0 idle..1 walk..2 run), pose, head look (yaw)
attribute vec3 iSkin;
attribute vec3 iTop;
attribute vec3 iBottom;
attribute vec3 iHair;
attribute vec4 iFlags;  // female, longSleeve, beard(0/1/2), bits: 1 umbrella, 2 bag
uniform float uTime;
mat3 rX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 rY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 rZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }
float near(float v, float t){ return 1.0 - step(0.5, abs(v - t)); }
void humanPose(inout vec3 p, inout vec3 n, out vec3 col) {
  float phase = iAnim.x, gait = iAnim.y, pose = iAnim.z, look = iAnim.w;
  float female = iFlags.x;
  float umbrella = mod(iFlags.w, 2.0);
  float bag = step(2.0, iFlags.w);
  float walk = clamp(gait, 0.0, 1.0), run = clamp(gait - 1.0, 0.0, 1.0);
  float amp = walk * (1.0 + run * 0.5);
  float sp = sin(phase), cp = cos(phase);
  float sit = near(pose, 1.0), ride = near(pose, 2.0), squat = near(pose, 3.0), phoneP = near(pose, 4.0), pillion = near(pose, 5.0), drive = near(pose, 6.0);
  float seated = max(max(sit, ride), max(pillion, drive));
  // leg angles (positive = forward swing)
  float thL = sp * 0.48 * amp, thR = -sp * 0.48 * amp;
  float knL = max(0.0, -sin(phase - 1.1)) * (0.85 + run * 0.5) * amp + 0.04;
  float knR = max(0.0, sin(phase - 1.1)) * (0.85 + run * 0.5) * amp + 0.04;
  float arL = -sp * 0.38 * amp, arR = sp * 0.38 * amp;
  float elL = 0.18 + run * 0.9 + (1.0 - walk) * 0.08, elR = elL;
  float abd = 0.06;
  float lean = 0.05 * amp + run * 0.14;
  float t = uTime + phase * 3.0;
  float breathe = (1.0 - walk) * sin(t * 1.7) * 0.012;
  // pose overrides
  float thS = mix(1.55, 1.35, ride + pillion + drive), knS = mix(1.6, 1.35, ride + pillion);
  thL = mix(thL, thS, seated); thR = mix(thR, thS, seated);
  knL = mix(knL, knS, seated); knR = mix(knR, knS, seated);
  float legSpread = (ride + pillion) * 0.22;
  arL = mix(arL, 0.15, sit); arR = mix(arR, 0.15, sit); elL = mix(elL, 0.9, sit); elR = mix(elR, 0.9, sit);
  arL = mix(arL, 0.95, ride + drive); arR = mix(arR, 0.95, ride + drive); elL = mix(elL, 0.55, ride + drive); elR = mix(elR, 0.55, ride + drive);
  // squat (vendors sitting on the footpath)
  thL = mix(thL, 2.1, squat); thR = mix(thR, 2.1, squat); knL = mix(knL, 2.6, squat); knR = mix(knR, 2.6, squat);
  arL = mix(arL, 0.7, squat); arR = mix(arR, 0.7, squat); elL = mix(elL, 0.8, squat); elR = mix(elR, 0.8, squat);
  // phone call: right hand to ear
  arR = mix(arR, 0.35, phoneP); elR = mix(elR, 2.3, phoneP); float abR = mix(abd, 0.45, phoneP);
  // umbrella in right hand
  arR = mix(arR, 0.55, umbrella); elR = mix(elR, 1.75, umbrella);
  lean = mix(lean, 0.12, ride + drive) + squat * 0.35;
  vec3 hipL = vec3(${JOINT.hipL.x}, ${JOINT.hipL.y}, ${JOINT.hipL.z}), hipR = vec3(${JOINT.hipR.x}, ${JOINT.hipR.y}, ${JOINT.hipR.z});
  vec3 kneeL = vec3(${JOINT.kneeL.x}, ${JOINT.kneeL.y}, ${JOINT.kneeL.z}), kneeR = vec3(${JOINT.kneeR.x}, ${JOINT.kneeR.y}, ${JOINT.kneeR.z});
  vec3 shL = vec3(${JOINT.shL.x}, ${JOINT.shL.y}, ${JOINT.shL.z}), shR = vec3(${JOINT.shR.x}, ${JOINT.shR.y}, ${JOINT.shR.z});
  vec3 elbL = vec3(${JOINT.elL.x}, ${JOINT.elL.y}, ${JOINT.elL.z}), elbR = vec3(${JOINT.elR.x}, ${JOINT.elR.y}, ${JOINT.elR.z});
  vec3 neck = vec3(${JOINT.neck.x}, ${JOINT.neck.y}, ${JOINT.neck.z}), waist = vec3(${JOINT.waist.x}, ${JOINT.waist.y}, ${JOINT.waist.z});
  vec3 grip = vec3(${UMBRELLA_GRIP.x}, ${UMBRELLA_GRIP.y}, ${UMBRELLA_GRIP.z});
  int b = int(bone + 0.5);
  mat3 R = mat3(1.0);
  vec3 q = p;
  if (b == 7 || b == 8) { // left leg
    if (b == 8) { mat3 k = rX(knL); q = kneeL + k * (q - kneeL); R = k * R; }
    mat3 h = rX(-thL) * rZ(-legSpread); q = hipL + h * (q - hipL); R = h * R;
  } else if (b == 9 || b == 10) {
    if (b == 10) { mat3 k = rX(knR); q = kneeR + k * (q - kneeR); R = k * R; }
    mat3 h = rX(-thR) * rZ(legSpread); q = hipR + h * (q - hipR); R = h * R;
  } else if (b == 3 || b == 4) {
    if (b == 4) { mat3 e = rX(-elL); q = elbL + e * (q - elbL); R = e * R; }
    mat3 s = rX(-arL) * rZ(abd); q = shL + s * (q - shL); R = s * R;
  } else if (b == 5 || b == 6 || b == 12) {
    if (b == 12) { // umbrella: follow the hand position but stay upright
      vec3 h = grip;
      h = elbR + rX(-elR) * (h - elbR);
      h = shR + (rX(-arR) * rZ(-abR)) * (h - shR);
      q = q - grip + h + vec3(0.0, 0.0, 0.05);
    } else {
      if (b == 6) { mat3 e = rX(-elR); q = elbR + e * (q - elbR); R = e * R; }
      mat3 s = rX(-arR) * rZ(-abR); q = shR + s * (q - shR); R = s * R;
    }
  } else if (b == 2) {
    mat3 h = rY(look) * rX(0.04 * amp + phoneP * 0.15); q = neck + h * (q - neck); R = h * R;
  } else if (b == 11) {
    // sari swings slightly with the stride
    q.x *= 1.0 + 0.06 * amp * sp;
    q.z += (0.93 - q.y) * 0.08 * amp * cp;
  }
  // upper body hierarchy: spine lean + breathing applies to torso, head, arms, umbrella
  if (b >= 1 && b <= 6 || b == 12) {
    mat3 l = rX(lean); q = waist + l * (q - waist); R = l * R;
    q.y += breathe * (q.y - 1.0);
  }
  // seated / squat pelvis drop
  q.y -= seated * 0.42 + squat * 0.55;
  q.z -= seated * 0.05;
  q.y += abs(cp) * 0.025 * amp;
  // visibility by region (collapse hidden pieces)
  float reg = region;
  float hide = 0.0;
  if (near(reg, 5.0) > 0.5 || near(reg, 12.0) > 0.5) hide = 1.0 - female;
  if (near(reg, 9.0) > 0.5) hide = 1.0 - step(0.5, iFlags.z);
  if (near(reg, 11.0) > 0.5) hide = 1.0 - step(1.5, iFlags.z);
  if (near(reg, 7.0) > 0.5) hide = 1.0 - umbrella;
  if (near(reg, 10.0) > 0.5) hide = 1.0 - bag;
  if (hide > 0.5) q = vec3(0.0, 1.0, 0.0);
  p = q;
  n = normalize(R * n);
  // colour by region
  vec3 c = iSkin;
  if (near(reg, 1.0) > 0.5) c = iTop;
  else if (near(reg, 2.0) > 0.5) c = mix(iBottom, iSkin * 0.9, female * 0.0);
  else if (near(reg, 3.0) > 0.5 || near(reg, 9.0) > 0.5 || near(reg, 11.0) > 0.5 || near(reg, 12.0) > 0.5) c = iHair;
  else if (near(reg, 4.0) > 0.5) c = vec3(0.07, 0.06, 0.055) + female * vec3(0.25, 0.12, 0.05);
  else if (near(reg, 5.0) > 0.5) c = iBottom;
  else if (near(reg, 6.0) > 0.5) c = mix(iSkin, iTop, iFlags.y);
  else if (near(reg, 7.0) > 0.5) c = vec3(0.03, 0.035, 0.05);
  else if (near(reg, 8.0) > 0.5) c = vec3(0.02);
  else if (near(reg, 10.0) > 0.5) c = vec3(0.42, 0.3, 0.18);
  col = c;
}
`;

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms, uTime: { value: number }, withColor: boolean) {
  shader.uniforms.uTime = uTime;
  shader.vertexShader = VERT_HEAD + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `vec3 transformed = vec3(position);
     vec3 hNormal = vec3(0.0, 1.0, 0.0);
     #ifdef USE_NORMAL_ATTR
       hNormal = normal;
     #endif
     vec3 hCol;
     humanPose(transformed, hNormal, hCol);
     ${withColor ? 'vColor = vec4(hCol, 1.0);' : ''}`,
  );
  if (withColor) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(normal);
        { vec3 tp = vec3(position); vec3 tc; humanPose(tp, objectNormal, tc); }`)
      .replace('#include <color_vertex>', '#include <color_vertex>');
  }
}

export interface HumanHandle { id: number }

export class HumanRenderer {
  mesh: THREE.InstancedMesh;
  private uTime = { value: 0 };
  private anim: THREE.InstancedBufferAttribute;
  private skin: THREE.InstancedBufferAttribute;
  private top: THREE.InstancedBufferAttribute;
  private bottom: THREE.InstancedBufferAttribute;
  private hair: THREE.InstancedBufferAttribute;
  private flags: THREE.InstancedBufferAttribute;
  private free: number[] = [];
  private used = 0;
  private phase: Float32Array;
  private scale: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private dirty = false;

  constructor(public capacity = 600, detail: 'crowd' | 'hero' = 'crowd') {
    const geo = buildHumanGeometry({ detail });
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    this.anim = mk(4); this.skin = mk(3); this.top = mk(3); this.bottom = mk(3); this.hair = mk(3); this.flags = mk(4);
    geo.setAttribute('iAnim', this.anim);
    geo.setAttribute('iSkin', this.skin);
    geo.setAttribute('iTop', this.top);
    geo.setAttribute('iBottom', this.bottom);
    geo.setAttribute('iHair', this.hair);
    geo.setAttribute('iFlags', this.flags);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, envMapIntensity: 0.6 });
    mat.onBeforeCompile = (sh) => patchShader(sh, this.uTime, true);
    mat.customProgramCacheKey = () => 'human-crowd-v1';
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => patchShader(sh, this.uTime, false);
    depth.customProgramCacheKey = () => 'human-crowd-depth-v1';
    this.mesh.customDepthMaterial = depth;
    this.phase = new Float32Array(capacity);
    this.scale = new Float32Array(capacity).fill(1);
    this.mesh.name = 'crowd';
  }

  add(a: Appearance): HumanHandle {
    let id: number;
    if (this.free.length) id = this.free.pop()!;
    else {
      if (this.used >= this.capacity) throw new Error('HumanRenderer full');
      id = this.used++;
      this.mesh.count = this.used;
    }
    this.skin.setXYZ(id, a.skin.r, a.skin.g, a.skin.b);
    this.top.setXYZ(id, a.top.r, a.top.g, a.top.b);
    this.bottom.setXYZ(id, a.bottom.r, a.bottom.g, a.bottom.b);
    this.hair.setXYZ(id, a.hair.r, a.hair.g, a.hair.b);
    this.flags.setXYZW(id, a.female ? 1 : 0, a.longSleeve ? 1 : 0, a.beard, (a.bag ? 2 : 0));
    this.phase[id] = Math.random() * 6.28;
    this.scale[id] = a.height;
    for (const at of [this.skin, this.top, this.bottom, this.hair, this.flags]) at.needsUpdate = true;
    return { id };
  }

  remove(h: HumanHandle) {
    this.m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(h.id, this.m);
    this.free.push(h.id);
    this.dirty = true;
  }

  setUmbrella(h: HumanHandle, on: boolean) {
    const w = this.flags.getW(h.id);
    const bag = w >= 2 ? 2 : 0;
    this.flags.setW(h.id, bag + (on ? 1 : 0));
    this.flags.needsUpdate = true;
  }

  /**
   * Update a person: world position (feet), heading (yaw, 0 = +z), movement speed (m/s) drives the
   * gait cycle, pose (Pose enum) and head look yaw.
   */
  set(h: HumanHandle, x: number, y: number, z: number, heading: number, speed: number, dt: number, pose: number = Pose.Stand, look = 0) {
    const id = h.id;
    const gait = speed < 0.15 ? 0 : speed < 2.2 ? Math.min(1, speed / 1.2) : 1 + Math.min(1, (speed - 2.2) / 2.5);
    this.phase[id] += dt * (speed / (gait > 1 ? 2.4 : 1.45)) * Math.PI * 2 * (gait > 0 ? 1 : 0);
    this.anim.setXYZW(id, this.phase[id], gait, pose, look);
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), heading);
    const sc = this.scale[id];
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sc, sc, sc));
    this.mesh.setMatrixAt(id, this.m);
    this.dirty = true;
  }

  update(dt: number) {
    this.uTime.value += dt;
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.anim.needsUpdate = true;
      this.dirty = false;
    }
  }
}
