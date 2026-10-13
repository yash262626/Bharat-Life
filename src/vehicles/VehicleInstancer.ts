// GPU-instanced vehicle rendering: one InstancedMesh per (model, material) and per wheel part.
// Paint colour varies per instance via instanceColor on the 'car_paint' mesh only.
import * as THREE from 'three';
import { VEHICLES } from '../config/vehicles';
import { buildVehicle, mergeByKey, VehicleModel } from './VehicleModels';
import { MaterialLib } from '../world/materials';
import { makeRng } from '../core/math';

interface TypeEntry {
  model: VehicleModel;
  body: Map<string, THREE.InstancedMesh>;
  wheel: Map<string, THREE.InstancedMesh>;
  capacity: number;
  used: number;
  free: number[];
}

export interface VehicleInstance { type: string; slot: number }

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class VehicleInstancer {
  group = new THREE.Group();
  private types = new Map<string, TypeEntry>();
  private m = new THREE.Matrix4();
  private wm = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(private mats: MaterialLib) {
    this.group.name = 'vehicles-instanced';
  }

  private entry(type: string, capacity = 400): TypeEntry {
    let t = this.types.get(type);
    if (t) return t;
    const spec = VEHICLES[type];
    if (!spec) throw new Error(`Unknown vehicle ${type}`);
    const model = buildVehicle(spec, '#ffffff', makeRng(type.length * 31));
    const body = new Map<string, THREE.InstancedMesh>();
    for (const [key, geo] of mergeByKey(model.parts)) {
      const mesh = new THREE.InstancedMesh(geo, this.mats.get(key, true), capacity);
      mesh.castShadow = key !== 'car_glass';
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `${type}:${key}`;
      body.set(key, mesh);
      this.group.add(mesh);
    }
    const wheel = new Map<string, THREE.InstancedMesh>();
    const wcap = capacity * model.wheels.length;
    // wheel parts are authored for a right-side wheel; left wheels are turned 180 degrees about Y
    const parts = model.wheelParts({ ...model.wheels[0], x: 1 });
    for (const [key, geo] of mergeByKey(parts)) {
      const mesh = new THREE.InstancedMesh(geo, this.mats.get(key, true), wcap);
      mesh.castShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      wheel.set(key, mesh);
      this.group.add(mesh);
    }
    t = { model, body, wheel, capacity, used: 0, free: [] };
    this.types.set(type, t);
    return t;
  }

  add(type: string, color: string | THREE.Color, pos: THREE.Vector3, heading: number, lean = 0): VehicleInstance {
    const t = this.entry(type);
    let slot: number;
    if (t.free.length) slot = t.free.pop()!;
    else {
      if (t.used >= t.capacity) throw new Error(`VehicleInstancer capacity reached for ${type}`);
      slot = t.used++;
      for (const m of t.body.values()) m.count = t.used;
      for (const m of t.wheel.values()) m.count = t.used * t.model.wheels.length;
    }
    const c = new THREE.Color(color as any);
    for (const [key, mesh] of t.body) mesh.setColorAt(slot, key === 'car_paint' ? c : new THREE.Color(1, 1, 1));
    for (const mesh of t.body.values()) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const inst = { type, slot };
    this.update(inst, pos, heading, lean, 0, 0);
    return inst;
  }

  remove(inst: VehicleInstance) {
    const t = this.types.get(inst.type);
    if (!t) return;
    for (const m of t.body.values()) { m.setMatrixAt(inst.slot, HIDDEN); m.instanceMatrix.needsUpdate = true; }
    for (let w = 0; w < t.model.wheels.length; w++) for (const m of t.wheel.values()) { m.setMatrixAt(inst.slot * t.model.wheels.length + w, HIDDEN); m.instanceMatrix.needsUpdate = true; }
    t.free.push(inst.slot);
  }

  /** Update transform; spin = wheel roll angle (rad), steer = front wheel steer (rad). */
  update(inst: VehicleInstance, pos: THREE.Vector3, heading: number, lean: number, spin: number, steer: number, pitch = 0) {
    const t = this.types.get(inst.type)!;
    this.e.set(pitch, heading, lean, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(pos, this.q, new THREE.Vector3(1, 1, 1));
    for (const mesh of t.body.values()) { mesh.setMatrixAt(inst.slot, this.m); mesh.instanceMatrix.needsUpdate = true; }
    const ws = t.model.wheels;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const local = new THREE.Matrix4().makeTranslation(w.x, w.y, w.z);
      if (w.steer) local.multiply(new THREE.Matrix4().makeRotationY(steer));
      local.multiply(new THREE.Matrix4().makeRotationX(spin));
      if (w.x < 0) local.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      this.wm.multiplyMatrices(this.m, local);
      for (const mesh of t.wheel.values()) { mesh.setMatrixAt(inst.slot * ws.length + i, this.wm); mesh.instanceMatrix.needsUpdate = true; }
    }
  }

  model(type: string) { return this.entry(type).model; }
}
