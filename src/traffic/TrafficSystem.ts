// AI traffic on the lane graph: IDM car-following, split-phase signals, junction-box discipline,
// two-wheeler lane filtering, honking, bus stops, riders, and interaction with the player.
import * as THREE from 'three';
import { Game } from '../game/Game';
import { LanePath, sampleAt } from './RoadGraph';
import { VEHICLES, TRAFFIC_MIX, VehicleSpec } from '../config/vehicles';
import { VehicleInstance } from '../vehicles/VehicleInstancer';
import { HumanRenderer, HumanHandle, Pose, randomAppearance } from '../npc/HumanRenderer';
import { makeRng, clamp, wrapAngle } from '../core/math';
import { BUS_STOPS, RAIL } from '../world/layout';

export interface TrafficVehicle {
  id: number;
  type: string;
  spec: VehicleSpec;
  path: number;
  s: number;
  v: number;
  v0: number; // desired speed factor
  lat: number; // lateral offset within lane (two-wheelers filter)
  next: number; // planned next path id (-1 = none)
  inst: VehicleInstance;
  x: number; z: number; heading: number;
  spin: number;
  stuck: number;
  honkCd: number;
  busStopCd: number;
  dwell: number;
  riders: HumanHandle[];
  hitTimer: number;
  color: string;
}

const PAINTS = ['#d8d8d4', '#b51e1e', '#20406e', '#7d7f80', '#1c1c1c', '#e3dccb', '#f0f0ee', '#3b3f44', '#5a1a1a', '#16365e', '#a8a9a6'];
const SAFE_GAP = 1.6;

export class TrafficSystem {
  vehicles: TrafficVehicle[] = [];
  riders: HumanRenderer;
  honks: { x: number; z: number; type: string }[] = [];
  target = 45;
  enabled = true;
  private rng = makeRng(77);
  private occupancy = new Map<number, TrafficVehicle[]>();
  private nextId = 1;
  private time = 0;
  private grid = new Map<number, TrafficVehicle[]>();
  private camFwd = new THREE.Vector3();
  private busStops: { path: number; s: number }[] = [];
  private initialised = false;

  constructor(private g: Game) {
    this.riders = new HumanRenderer(260);
    g.scene.add(this.riders.mesh);
    // map bus stops onto their kerb-side lanes
    for (const b of BUS_STOPS) {
      const near = g.graph.nearestLane(b.x, b.z, (p) => p.dir === b.dir && p.laneIndex === 0);
      if (near.id >= 0) this.busStops.push({ path: near.id, s: near.s });
    }
  }

  private densityForHour(h: number) {
    const rush = Math.exp(-((h - 9.5) ** 2) / 3) + Math.exp(-((h - 19) ** 2) / 4);
    const night = h < 5 || h > 23.5 ? 0.35 : 1;
    const q = this.g.gr.quality === 'low' ? 0.5 : this.g.gr.quality === 'medium' ? 0.75 : 1;
    return Math.round((28 + 30 * rush) * night * q);
  }

  private pickType() {
    const total = TRAFFIC_MIX.reduce((s, [, w]) => s + w, 0) + 3;
    let r = this.rng.next() * total;
    for (const [t, w] of TRAFFIC_MIX) { r -= w; if (r <= 0) return t; }
    return 'mbt_bus';
  }

  private visible(x: number, z: number) {
    const cam = this.g.camera.position;
    const dx = x - cam.x, dz = z - cam.z;
    const d = Math.hypot(dx, dz);
    if (d > 140) return false;
    this.g.camera.getWorldDirection(this.camFwd);
    return (dx * this.camFwd.x + dz * this.camFwd.z) / (d || 1) > 0.25 || d < 30;
  }

  spawn(path: LanePath, s: number, type = this.pickType()): TrafficVehicle | null {
    const spec = VEHICLES[type];
    const list = this.occupancy.get(path.id) ?? [];
    if (list.some((o) => Math.abs(o.s - s) < spec.length + 4)) return null;
    const color = type === 'auto_rickshaw' ? '#151515' : type === 'padma_taxi' ? '#111111' : type === 'mbt_bus' ? '#b3201b' : this.rng.pick(spec.colors.length > 1 ? spec.colors : PAINTS);
    const p = sampleAt(path, s);
    const inst = this.g.instancer.add(type, color, new THREE.Vector3(p.x, 0, p.z), Math.atan2(p.tx, p.tz));
    const two = spec.category === 'two_wheeler';
    const tv: TrafficVehicle = {
      id: this.nextId++, type, spec, path: path.id, s, v: path.speed * 0.6, v0: this.rng.range(0.8, 1.12) * (two ? 1.1 : type === 'auto_rickshaw' ? 0.85 : 1),
      lat: two ? this.rng.range(-path.width * 0.32, path.width * 0.32) : this.rng.range(-0.15, 0.15), next: -1, inst,
      x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz), spin: 0, stuck: 0, honkCd: this.rng.range(2, 8), busStopCd: 0, dwell: 0, riders: [], hitTimer: 0, color,
    };
    // riders / drivers
    const nRiders = two ? (this.rng.chance(0.3) ? 2 : 1) : 1;
    for (let i = 0; i < nRiders; i++) {
      try { tv.riders.push(this.riders.add(randomAppearance(this.rng, i === 1 ? this.rng.chance(0.6) : this.rng.chance(two ? 0.12 : 0.08)))); } catch { /* full */ }
    }
    tv.next = this.chooseNext(path);
    this.vehicles.push(tv);
    list.push(tv);
    this.occupancy.set(path.id, list);
    return tv;
  }

  private chooseNext(path: LanePath): number {
    if (!path.next.length) return -1;
    const opts = path.next.map((id) => this.g.graph.paths[id]);
    const weights = opts.map((o) => (o.turn === 'S' ? 3 : 1));
    let r = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) return opts[i].id; }
    return opts[0].id;
  }

  private remove(tv: TrafficVehicle) {
    this.g.instancer.remove(tv.inst);
    for (const r of tv.riders) this.riders.remove(r);
    this.vehicles = this.vehicles.filter((o) => o !== tv);
  }

  private populate() {
    const lanes = this.g.graph.lanes();
    let tries = 0;
    while (this.vehicles.length < this.target && tries++ < 400) {
      const p = this.rng.pick(lanes);
      if (p.length < 20) continue;
      this.spawn(p, this.rng.range(5, p.length - 5));
      this.rebuildOccupancy();
    }
  }

  private rebuildOccupancy() {
    this.occupancy.clear();
    for (const v of this.vehicles) {
      let l = this.occupancy.get(v.path);
      if (!l) this.occupancy.set(v.path, (l = []));
      l.push(v);
    }
    for (const l of this.occupancy.values()) l.sort((a, b) => a.s - b.s);
    this.grid.clear();
    for (const v of this.vehicles) {
      const k = gkey(v.x, v.z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(v);
    }
  }

  /** Distance to the nearest obstacle ahead along the vehicle's planned route, and its speed. */
  private leader(tv: TrafficVehicle): { gap: number; v: number; reason: string } {
    const graph = this.g.graph;
    const path = graph.paths[tv.path];
    let best = { gap: 200, v: 0, reason: '' };
    const consider = (gap: number, v: number, reason: string) => { if (gap < best.gap) best = { gap, v, reason }; };
    const list = this.occupancy.get(tv.path) ?? [];
    for (const o of list) if (o !== tv && o.s > tv.s) { consider(o.s - tv.s - (o.spec.length + tv.spec.length) / 2, o.v, 'car'); break; }
    const remain = path.length - tv.s;
    // signal at the end of this lane
    if (path.signal && remain < 60) {
      const st = graph.signalState(path.signal.node, path.signal.arm, this.time);
      const nextPath = tv.next >= 0 ? graph.paths[tv.next] : null;
      // junction-box discipline: don't enter unless the exit lane has room
      let exitBlocked = false;
      if (nextPath) {
        const exit = graph.paths[nextPath.next[0]];
        const occ = exit ? this.occupancy.get(exit.id) ?? [] : [];
        if (occ.length && occ[0].s < tv.spec.length + 3) exitBlocked = true;
        const conn = this.occupancy.get(nextPath.id) ?? [];
        if (conn.length && conn[0].s < 2) exitBlocked = true;
      }
      const stopDist = (tv.v * tv.v) / (2 * 4.5);
      if (st === 'R' || exitBlocked || (st === 'A' && remain > stopDist + 1)) consider(remain - tv.spec.length / 2 - 0.5, 0, 'signal');
    }
    if (best.gap > remain && tv.next >= 0) {
      const nl = this.occupancy.get(tv.next) ?? [];
      if (nl.length) consider(remain + nl[0].s - (nl[0].spec.length + tv.spec.length) / 2, nl[0].v, 'car');
      else {
        const np = graph.paths[tv.next];
        if (np.next.length === 1) {
          const nn = this.occupancy.get(np.next[0]) ?? [];
          if (nn.length) consider(remain + np.length + nn[0].s - (nn[0].spec.length + tv.spec.length) / 2, nn[0].v, 'car');
        }
      }
    }
    // sink (district edge): wait if the player is looking
    if (path.sink && remain < 6 && this.visible(tv.x, tv.z)) consider(remain - 2, 0, 'sink');
    // generic proximity check (merging, crossing, player, pedestrians)
    const fx = Math.sin(tv.heading), fz = Math.cos(tv.heading);
    const look = 6 + tv.v * 1.6;
    const check = (x: number, z: number, r: number, v: number, reason: string) => {
      const dx = x - tv.x, dz = z - tv.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > look) return;
      const side = Math.abs(dx * fz - dz * fx);
      if (side < tv.spec.width / 2 + r + 0.25) consider(along - tv.spec.length / 2 - r, v, reason);
    };
    for (const o of this.near(tv.x, tv.z)) {
      if (o === tv || o.path === tv.path) continue;
      // ignore vehicles heading towards us in the opposite lane (they're beside us, not ahead)
      if (Math.abs(wrapAngle(o.heading - tv.heading)) > 2.4) continue;
      check(o.x, o.z, Math.max(o.spec.width, o.spec.length * 0.45) / 2, o.v, 'car');
    }
    const pl = this.g.player.s;
    const pv = this.g.vm.current;
    if (pv) check(pv.state.x, pv.state.z, Math.max(pv.spec.width, pv.spec.length * 0.5) / 2, Math.abs(pv.speed), 'player');
    else check(pl.x, pl.z, 0.45, 0, 'player');
    for (const v of this.g.vm.vehicles) if (v !== pv) check(v.state.x, v.state.z, Math.max(v.spec.width, v.spec.length * 0.5) / 2, 0, 'car');
    const peds = (this.g as any).pedPositions as { x: number; z: number }[] | undefined;
    if (peds) for (const p of peds) if (Math.abs(p.x - tv.x) < look + 2 && Math.abs(p.z - tv.z) < look + 2) check(p.x, p.z, 0.4, 0, 'ped');
    return best;
  }

  private *near(x: number, z: number) {
    const cx = Math.floor(x / 12), cz = Math.floor(z / 12);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.grid.get(((cx + i) * 73856093) ^ ((cz + j) * 19349663));
      if (l) yield* l;
    }
  }

  fixed(dt: number) {
    if (!this.enabled || this.g.state === 'loading') return;
    this.time += dt;
    this.g.signalTime = this.time;
    if (!this.initialised) { this.initialised = true; this.target = this.densityForHour(this.g.clock.hour); this.populate(); }
    this.rebuildOccupancy();
    const graph = this.g.graph;
    const wet = this.g.env.wetness;
    const rainSlow = 1 - this.g.env.rainAmount * 0.25;
    for (const tv of [...this.vehicles]) {
      const path = graph.paths[tv.path];
      tv.honkCd -= dt;
      tv.busStopCd -= dt;
      tv.hitTimer -= dt;
      // bus stop dwell
      if (tv.dwell > 0) { tv.dwell -= dt; tv.v = 0; this.place(tv, path); continue; }
      if (tv.type === 'mbt_bus' && tv.busStopCd <= 0) {
        for (const b of this.busStops) if (b.path === tv.path && Math.abs(b.s - tv.s) < 1.5 && tv.v < 6) { tv.dwell = 7; tv.busStopCd = 30; }
      }
      const lead = tv.hitTimer > 0 ? { gap: 0, v: 0, reason: 'hit' } : this.leader(tv);
      // IDM
      const v0 = path.speed * tv.v0 * rainSlow * (tv.spec.category === 'bus' ? 0.85 : 1);
      const a = Math.min(tv.spec.accel * 1.1, 2.6), b = 3.5 * (1 - wet * 0.2);
      const sStar = SAFE_GAP + tv.v * 1.1 + (tv.v * (tv.v - lead.v)) / (2 * Math.sqrt(a * b));
      const gap = Math.max(0.1, lead.gap);
      let acc = a * (1 - Math.pow(tv.v / Math.max(0.5, v0), 4) - Math.pow(Math.max(0, sStar) / gap, 2));
      acc = clamp(acc, -9, a);
      tv.v = Math.max(0, tv.v + acc * dt);
      if (lead.gap < 0.3) tv.v = 0;
      // stuck & honk logic (very Indian: honk when blocked, at green, at the player)
      if (tv.v < 0.3 && lead.reason !== 'signal' && lead.reason !== 'sink') tv.stuck += dt; else tv.stuck = 0;
      if (tv.honkCd <= 0 && ((tv.stuck > 1.5 && this.rng.chance(0.5)) || (lead.reason === 'player' && lead.gap < 8) || (tv.v > 4 && this.rng.chance(0.002)))) {
        this.honks.push({ x: tv.x, z: tv.z, type: tv.spec.horn });
        tv.honkCd = this.rng.range(2.5, 7);
      }
      tv.s += tv.v * dt;
      // move to next path
      let guard = 0;
      while (tv.s > graph.paths[tv.path].length && guard++ < 3) {
        const cur = graph.paths[tv.path];
        if (cur.sink || tv.next < 0) {
          if (!this.visible(tv.x, tv.z)) { this.remove(tv); break; }
          tv.s = cur.length; tv.v = 0; break;
        }
        tv.s -= cur.length;
        tv.path = tv.next;
        tv.next = this.chooseNext(graph.paths[tv.path]);
      }
      if (!this.vehicles.includes(tv)) continue;
      // stuck forever (deadlock safety): respawn elsewhere when out of sight
      if (tv.stuck > 40 && !this.visible(tv.x, tv.z)) { this.remove(tv); continue; }
      this.place(tv, graph.paths[tv.path]);
    }
    this.interactWithPlayer(dt);
    // keep density: spawn at sources or random lanes out of view
    this.target = this.densityForHour(this.g.clock.hour);
    if (this.vehicles.length < this.target) {
      const lanes = this.rng.chance(0.5) ? graph.sources() : graph.lanes();
      const p = this.rng.pick(lanes);
      const s = p.source ? 1 : this.rng.range(5, Math.max(6, p.length - 5));
      const pt = sampleAt(p, s);
      if (!this.visible(pt.x, pt.z) && p.length > 12) this.spawn(p, s);
    } else if (this.vehicles.length > this.target + 6) {
      const far = this.vehicles.find((v) => !this.visible(v.x, v.z));
      if (far) this.remove(far);
    }
  }

  private place(tv: TrafficVehicle, path: LanePath) {
    const p = sampleAt(path, tv.s);
    const lat = path.kind === 'lane' ? tv.lat : tv.lat * 0.4;
    const x = p.x + p.tz * lat, z = p.z - p.tx * lat;
    const target = Math.atan2(p.tx, p.tz);
    const prev = tv.heading;
    tv.heading = prev + wrapAngle(target - prev) * 0.35;
    const yawRate = wrapAngle(tv.heading - prev) * 60;
    tv.x = x; tv.z = z;
    tv.spin += (tv.v / tv.spec.wheelRadius) / 60;
    const two = tv.spec.category === 'two_wheeler';
    const lean = two ? clamp(-Math.atan((tv.v * yawRate) / 9.81), -0.5, 0.5) : 0;
    const y = this.g.col.groundHeight(x, z, 0.2, 0.2);
    this.g.instancer.update(tv.inst, new THREE.Vector3(x, y, z), tv.heading, lean, tv.spin, clamp(yawRate * 0.15, -0.5, 0.5));
    // riders
    const model = this.g.instancer.model(tv.type);
    const c = Math.cos(tv.heading), sn = Math.sin(tv.heading);
    tv.riders.forEach((h, i) => {
      const seat = i === 0 ? model.driverSeat : model.passengerSeats[Math.min(i - 1, model.passengerSeats.length - 1)];
      if (!seat) return;
      // lean the rider with the bike around the ground contact
      const sx = seat.x + Math.sin(lean) * -seat.y * 0;
      const wx = x + sx * c + seat.z * sn, wz = z - sx * sn + seat.z * c;
      const pose = two ? (i === 0 ? Pose.Ride : Pose.Pillion) : tv.type === 'auto_rickshaw' ? (i === 0 ? Pose.Ride : Pose.Sit) : Pose.Drive;
      this.riders.set(h, wx, y + seat.y - 0.48, wz, tv.heading, 0, 1 / 60, pose);
    });
  }

  private interactWithPlayer(dt: number) {
    const pv = this.g.vm.current;
    const ps = this.g.player.s;
    for (const tv of this.vehicles) {
      if (pv) {
        const dx = pv.state.x - tv.x, dz = pv.state.z - tv.z;
        const minD = (Math.min(pv.spec.length, pv.spec.width * 1.6) + Math.min(tv.spec.length, tv.spec.width * 1.6)) / 2;
        const d = Math.hypot(dx, dz);
        if (d < minD && d > 0.01) {
          const nx = dx / d, nz = dz / d;
          const push = minD - d;
          tv.hitTimer = Math.max(tv.hitTimer, 1.5); // the AI always stops after contact
          if (Math.abs(pv.speed) < 1) {
            // the player is (nearly) stationary: the AI vehicle backs off instead of bulldozing
            tv.s = Math.max(0, tv.s - push);
            tv.v = 0;
            continue;
          }
          pv.state.x += nx * push;
          pv.state.z += nz * push;
          const vn = pv.state.vx * nx + pv.state.vz * nz;
          if (vn < 0) {
            const impact = -vn;
            pv.state.vx -= 1.3 * vn * nx;
            pv.state.vz -= 1.3 * vn * nz;
            if (impact > 2) {
              pv.state.damage = Math.min(100, pv.state.damage + impact * 2.5);
              tv.hitTimer = 4;
              this.honks.push({ x: tv.x, z: tv.z, type: tv.spec.horn });
              this.g.events.emit('notify', { title: 'Accident!', body: `You hit a ${tv.spec.name}. ${impact > 6 ? 'The driver is furious.' : 'Minor scrape.'}`, kind: 'warn' });
              this.g.hud.say(tv.type === 'auto_rickshaw' ? 'Auto driver' : 'Driver', this.rng.pick(['Arre! Andha hai kya?', 'Dekh ke chala bhai!', 'Oye! Gaadi ka dent kaun bharega?', 'Kya kar raha hai yaar!']), 2.5);
            }
          }
        }
      } else if (tv.v > 3) {
        const dx = ps.x - tv.x, dz = ps.z - tv.z;
        const fx = Math.sin(tv.heading), fz = Math.cos(tv.heading);
        const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
        if (Math.abs(along) < tv.spec.length / 2 + 0.3 && Math.abs(side) < tv.spec.width / 2 + 0.3 && ps.y < 1.2) {
          this.g.player.knock(side > 0 ? fz : -fz, side > 0 ? -fx : fx, Math.min(8, tv.v));
          tv.hitTimer = 3;
          this.g.events.emit('notify', { title: 'Hit by a vehicle!', body: 'Watch out for traffic — use zebra crossings.', kind: 'warn' });
        }
      }
    }
    void dt; void RAIL;
  }

  update(dt: number) {
    this.riders.update(dt);
  }
}

const gkey = (x: number, z: number) => (Math.floor(x / 12) * 73856093) ^ (Math.floor(z / 12) * 19349663);
