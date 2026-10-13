// Player-usable vehicles: spawning, enter/exit, physics stepping, world collisions, lights.
import * as THREE from 'three';
import { VEHICLES, VehicleSpec } from '../config/vehicles';
import { VehicleInstancer, VehicleInstance } from './VehicleInstancer';
import { newVehicleState, stepVehicle, collideStatic, forwardSpeed, VehicleState, VehicleControls } from './VehiclePhysics';
import { CollisionWorld } from '../world/Collision';
import { Input } from '../core/Input';
import { clamp } from '../core/math';

let nextId = 1;

export interface DrivableData {
  id: string; type: string; color: string; plate: string; owned: boolean;
  x: number; z: number; heading: number; fuel: number; damage: number;
}

export class DrivableVehicle {
  id: string;
  spec: VehicleSpec;
  state: VehicleState;
  inst: VehicleInstance;
  lightsOn = false;
  indicator: -1 | 0 | 1 = 0;
  horn = false;
  controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  pitch = 0;
  lastImpact = 0;
  constructor(public type: string, public color: string, public plate: string, public owned: boolean, inst: VehicleInstance, state: VehicleState, id?: string) {
    this.id = id ?? `veh_${nextId++}`;
    this.spec = VEHICLES[type];
    this.inst = inst;
    this.state = state;
  }
  get speed() { return forwardSpeed(this.state); }
  get kmh() { return Math.abs(this.speed) * 3.6; }
  get twoWheeler() { return this.spec.category === 'two_wheeler'; }
  serialize(): DrivableData {
    return { id: this.id, type: this.type, color: this.color, plate: this.plate, owned: this.owned, x: this.state.x, z: this.state.z, heading: this.state.heading, fuel: this.state.fuel, damage: this.state.damage };
  }
}

export function randomPlate(rng: () => number, commercial = false) {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const pick = () => L[Math.floor(rng() * L.length)];
  const num = String(1000 + Math.floor(rng() * 8999));
  const rto = ['01', '02', '03', '04', '47', '43'][Math.floor(rng() * 6)];
  return `MH ${rto} ${commercial ? 'T' : pick()}${pick()} ${num}`;
}

export class VehicleManager {
  vehicles: DrivableVehicle[] = [];
  current: DrivableVehicle | null = null;
  headlight: THREE.SpotLight;
  wetness = 0;
  onImpact: (v: DrivableVehicle, speed: number) => void = () => {};
  private tmp = new THREE.Vector3();

  constructor(private instancer: VehicleInstancer, private col: CollisionWorld, scene: THREE.Scene) {
    this.headlight = new THREE.SpotLight(0xfff1dc, 0, 55, 0.55, 0.45, 1.4);
    this.headlight.castShadow = false;
    scene.add(this.headlight, this.headlight.target);
  }

  spawn(type: string, color: string, x: number, z: number, heading: number, owned: boolean, plate?: string, fuelFrac = 0.6, id?: string, damage = 0) {
    const spec = VEHICLES[type];
    const st = newVehicleState(spec, x, z, heading);
    st.y = this.col.groundHeight(x, z, 0.5, 0.35);
    st.fuel = spec.tankLitres * fuelFrac;
    st.damage = damage;
    const inst = this.instancer.add(type, color, new THREE.Vector3(x, st.y, z), heading, spec.category === 'two_wheeler' ? -0.12 : 0);
    const v = new DrivableVehicle(type, color, plate ?? randomPlate(Math.random, spec.plate === 'commercial'), owned, inst, st, id);
    this.vehicles.push(v);
    return v;
  }

  despawn(v: DrivableVehicle) {
    this.instancer.remove(v.inst);
    this.vehicles = this.vehicles.filter((o) => o !== v);
    if (this.current === v) this.current = null;
  }

  nearestEnterable(x: number, z: number, maxDist = 3.2) {
    let best: DrivableVehicle | null = null, bd = maxDist;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.state.x - x, v.state.z - z) - v.spec.length * 0.35;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  enter(v: DrivableVehicle) {
    this.current = v;
    v.state.engineOn = v.state.fuel > 0 && v.state.damage < 100;
  }

  /** Leave the vehicle; returns a free spot next to it (driver side first). */
  exit(): { x: number; z: number; heading: number } {
    const v = this.current!;
    this.current = null;
    v.controls = { throttle: 0, brake: 1, steer: 0, handbrake: true };
    v.state.engineOn = false;
    const h = v.state.heading;
    const rx = -Math.cos(h), rz = Math.sin(h);
    const off = v.spec.width / 2 + (v.twoWheeler ? 0.45 : 0.65);
    for (const side of [1, -1]) {
      const x = v.state.x + rx * off * side, z = v.state.z + rz * off * side;
      if (!this.col.blocked(x, z, v.state.y + 0.2)) return { x, z, heading: h };
    }
    return { x: v.state.x - Math.sin(h) * (v.spec.length / 2 + 0.8), z: v.state.z - Math.cos(h) * (v.spec.length / 2 + 0.8), heading: h };
  }

  readControls(input: Input) {
    const v = this.current;
    if (!v) return;
    const c = v.controls;
    const up = input.held('forward'), down = input.held('back');
    c.throttle = up ? 1 : 0;
    c.brake = down ? 1 : 0;
    const steerIn = input.axis('right', 'left');
    // keyboard steering smoothing (analogue feel)
    c.steer += clamp(steerIn - c.steer, -4 * (1 / 60), 4 * (1 / 60)) * 3;
    c.steer = clamp(c.steer, -1, 1);
    if (!steerIn) c.steer *= 0.85;
    c.handbrake = input.held('handbrake');
    v.horn = input.held('horn');
    if (input.just('lights')) v.lightsOn = !v.lightsOn;
    if (input.just('indicatorL')) v.indicator = v.indicator === -1 ? 0 : -1;
    if (input.just('indicatorR')) v.indicator = v.indicator === 1 ? 0 : 1;
  }

  /** Fixed-step physics for all vehicles that are moving or driven. */
  step(dt: number) {
    for (const v of this.vehicles) {
      const driven = v === this.current;
      const st = v.state;
      const moving = Math.abs(st.vx) + Math.abs(st.vz) > 0.01;
      if (!driven && !moving) continue;
      if (!driven) v.controls = { throttle: 0, brake: 1, steer: 0, handbrake: true };
      const ground = this.col.surfaceTag(st.x, st.z, st.y);
      stepVehicle(v.spec, st, v.controls, dt, { wetness: this.wetness, offroad: ground === 'grass' });
      this.collide(v);
      // ground following (kerbs, ramps) with pitch from front/rear samples
      const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
      const hl = v.spec.wheelbase / 2;
      const yf = this.col.groundHeight(st.x + fx * hl, st.z + fz * hl, st.y, 0.32);
      const yr = this.col.groundHeight(st.x - fx * hl, st.z - fz * hl, st.y, 0.32);
      const target = (yf + yr) / 2;
      st.y += (target - st.y) * Math.min(1, dt * 14);
      v.pitch = -Math.atan2(yf - yr, v.spec.wheelbase);
    }
  }

  private collide(v: DrivableVehicle) {
    const st = v.state, spec = v.spec;
    const r = Math.max(0.32, spec.width / 2);
    const n = Math.max(2, Math.ceil(spec.length / (r * 1.6)));
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    let px = 0, pz = 0, hits = 0, nx = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * (spec.length - r * 1.4);
      const cx = st.x + fx * t, cz = st.z + fz * t;
      const res = this.col.resolveCircle(cx, cz, r, st.y + 0.1, 1.2);
      if (res.hit) {
        px += res.x - cx; pz += res.z - cz;
        nx += res.nx; nz += res.nz;
        hits++;
      }
    }
    if (!hits) return;
    st.x += px / hits;
    st.z += pz / hits;
    const l = Math.hypot(nx, nz) || 1;
    const impact = collideStatic(spec, st, nx / l, nz / l);
    if (impact > 1.5) { v.lastImpact = impact; this.onImpact(v, impact); }
  }

  /** Push render transforms + headlight. */
  sync(night: number) {
    for (const v of this.vehicles) {
      const st = v.state;
      const lean = v.twoWheeler ? (Math.abs(forwardSpeed(st)) < 0.3 && v !== this.current ? -0.12 : st.lean) : 0;
      this.instancer.update(v.inst, this.tmp.set(st.x, st.y, st.z), st.heading, lean, st.wheelSpin, st.steer, v.pitch);
    }
    const v = this.current;
    if (v && (v.lightsOn || night > 0.5)) {
      const st = v.state;
      const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
      this.headlight.position.set(st.x + fx * v.spec.length * 0.45, st.y + 0.9, st.z + fz * v.spec.length * 0.45);
      this.headlight.target.position.set(st.x + fx * 25, st.y - 1.5, st.z + fz * 25);
      this.headlight.target.updateMatrixWorld();
      this.headlight.intensity = 260;
    } else this.headlight.intensity = 0;
  }

  /** World-space seat position for the rider/driver. */
  seatWorld(v: DrivableVehicle, out = new THREE.Vector3()) {
    const m = this.instancer.model(v.type);
    const s = m.driverSeat;
    const h = v.state.heading;
    const c = Math.cos(h), sn = Math.sin(h);
    out.set(v.state.x + s.x * c + s.z * sn, v.state.y + s.y, v.state.z - s.x * sn + s.z * c);
    return out;
  }
}
