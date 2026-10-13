// Pedestrians: walkers on footpath loops around each block, zebra crossings at signalised junctions
// (they wait for the pedestrian phase), stationary NPCs (vendors, shopkeepers, commuters),
// umbrellas in rain, player avoidance, and density management around the player.
import { Game } from '../game/Game';
import { HumanRenderer, HumanHandle, Pose, randomAppearance } from './HumanRenderer';
import { BLOCKS, NODES, Rect, zoneAt, nodeRect, roadHalfWidth, ROADS, Arm } from '../world/layout';
import { makeRng, wrapAngle, dist2 } from '../core/math';
import { KERB_H } from '../world/buildings';
import { ARM_VEC, LEFT_OF } from '../traffic/RoadGraph';

interface Loop { pts: { x: number; z: number }[]; cum: number[]; length: number; block: Rect; zone: string }
interface Walker {
  h: HumanHandle; loop: number; t: number; dir: 1 | -1; speed: number; off: number;
  x: number; z: number; y: number; heading: number;
  state: 'walk' | 'idle' | 'wait' | 'cross'; timer: number;
  cross?: { ax: number; az: number; bx: number; bz: number; node: string; toLoop: number; toT: number; p: number };
  umbrella: boolean; pose: number;
}
interface Static { h: HumanHandle | null; x: number; y: number; z: number; heading: number; pose: number; role: string }

export class PedestrianSystem {
  crowd: HumanRenderer;
  loops: Loop[] = [];
  walkers: Walker[] = [];
  statics: Static[] = [];
  target = 110;
  private rng = makeRng(99);
  private crossings: { node: string; ax: number; az: number; bx: number; bz: number }[] = [];
  private staticTimer = 0;

  constructor(private g: Game) {
    this.crowd = new HumanRenderer(520);
    g.scene.add(this.crowd.mesh);
    this.target = g.gr.quality === 'low' ? 50 : g.gr.quality === 'medium' ? 80 : 120;
    // footpath loops: block perimeter inset by ~1.6 m (walk line on the footpath)
    for (const b of BLOCKS) {
      const zone = zoneAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      if (zone === 'station') continue; // station precinct uses stationary commuters
      const i = 1.7;
      const pts = [{ x: b.x0 + i, z: b.z0 + i }, { x: b.x1 - i, z: b.z0 + i }, { x: b.x1 - i, z: b.z1 - i }, { x: b.x0 + i, z: b.z1 - i }, { x: b.x0 + i, z: b.z0 + i }];
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
      this.loops.push({ pts, cum, length: cum[cum.length - 1], block: b, zone });
    }
    // zebra crossings at signalised junctions: across each arm
    for (const n of NODES) {
      if (!n.signal) continue;
      for (const arm of Object.keys(n.arms) as Arm[]) {
        const road = ROADS.find((r) => r.id === n.arms[arm])!;
        const v = ARM_VEC[arm], l = ARM_VEC[LEFT_OF[arm]];
        const boxHalf = arm === 'E' || arm === 'W' ? n.hx : n.hz;
        const cx = n.x + v.x * (boxHalf + 2.6), cz = n.z + v.z * (boxHalf + 2.6);
        const half = roadHalfWidth(road) + 1.6;
        this.crossings.push({ node: n.id, ax: cx + l.x * half, az: cz + l.z * half, bx: cx - l.x * half, bz: cz - l.z * half });
      }
    }
    for (const s of g.city.ctx.npcSpots) this.statics.push({ h: null, x: s.x, y: s.y, z: s.z, heading: s.heading, pose: s.role === 'vendor' && this.rng.chance(0.35) ? Pose.Squat : s.role === 'commuter' && this.rng.chance(0.2) ? Pose.Phone : Pose.Stand, role: s.role });
  }

  private loopPos(loop: Loop, t: number, off: number) {
    t = ((t % loop.length) + loop.length) % loop.length;
    let k = 1;
    while (k < loop.cum.length - 1 && loop.cum[k] < t) k++;
    const a = loop.pts[k - 1], b = loop.pts[k];
    const seg = loop.cum[k] - loop.cum[k - 1];
    const u = (t - loop.cum[k - 1]) / seg;
    const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
    // offset towards the kerb (outward = right of the clockwise loop direction)
    return { x: a.x + (b.x - a.x) * u - tz * off, z: a.z + (b.z - a.z) * u + tx * off, tx, tz };
  }

  private spawnWalker(nearX: number, nearZ: number, minDist: number) {
    for (let tries = 0; tries < 12; tries++) {
      const li = this.rng.int(0, this.loops.length - 1);
      const loop = this.loops[li];
      const t = this.rng.range(0, loop.length);
      const p = this.loopPos(loop, t, 0);
      const d = dist2(p.x, p.z, nearX, nearZ);
      if (d < minDist || d > 150) continue;
      const busy = loop.zone === 'market' ? 1 : 0.6;
      if (!this.rng.chance(busy)) continue;
      let h: HumanHandle;
      try { h = this.crowd.add(randomAppearance(this.rng)); } catch { return; }
      const off = this.rng.range(-0.25, 1.15);
      this.walkers.push({ h, loop: li, t, dir: this.rng.chance(0.5) ? 1 : -1, speed: this.rng.range(1.0, 1.55), off, x: p.x, z: p.z, y: KERB_H, heading: 0, state: 'walk', timer: this.rng.range(5, 30), umbrella: false, pose: Pose.Stand });
      return;
    }
  }

  private findCrossing(x: number, z: number) {
    let best = null as (typeof this.crossings)[number] | null, bd = 3.2, end = 0;
    for (const c of this.crossings) {
      const da = dist2(x, z, c.ax, c.az), db = dist2(x, z, c.bx, c.bz);
      if (da < bd) { bd = da; best = c; end = 0; }
      if (db < bd) { bd = db; best = c; end = 1; }
    }
    return best ? { c: best, end } : null;
  }

  update(dt: number) {
    const g = this.g;
    const ps = g.player.s;
    const focus = g.state === 'playing' ? ps : { x: g.camera.position.x, z: g.camera.position.z };
    const hour = g.clock.hour;
    const nightMul = hour < 5.5 || hour > 23 ? 0.25 : hour < 7 || hour > 21.5 ? 0.6 : 1;
    const rain = g.env.rainAmount;
    const want = Math.round(this.target * nightMul * (1 - rain * 0.35));
    // density management
    if (this.walkers.length < want) this.spawnWalker(focus.x, focus.z, 45);
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (dist2(w.x, w.z, focus.x, focus.z) > 170 || (this.walkers.length > want + 5 && dist2(w.x, w.z, focus.x, focus.z) > 70)) {
        this.crowd.remove(w.h);
        this.walkers.splice(i, 1);
      }
    }
    const positions: { x: number; z: number }[] = [];
    for (const w of this.walkers) {
      const loop = this.loops[w.loop];
      w.timer -= dt;
      if (rain > 0.3 && !w.umbrella && this.rng.chance(0.01)) { w.umbrella = this.rng.chance(0.65); if (w.umbrella) this.crowd.setUmbrella(w.h, true); }
      if (rain < 0.1 && w.umbrella) { w.umbrella = false; this.crowd.setUmbrella(w.h, false); }
      let speed = 0;
      if (w.state === 'walk') {
        speed = w.speed * (rain > 0.5 && !w.umbrella ? 1.35 : 1);
        // avoid the player (step aside / slow down)
        const dpx = ps.x - w.x, dpz = ps.z - w.z;
        const dp = Math.hypot(dpx, dpz);
        if (dp < 1.6 && !g.vm.current) {
          const fx = Math.sin(w.heading), fz = Math.cos(w.heading);
          if (dpx * fx + dpz * fz > 0) { w.off = Math.min(1.4, w.off + dt * 1.2); speed *= 0.5; }
        }
        // jump out of the way of the player's vehicle
        const pv = g.vm.current;
        if (pv && Math.abs(pv.speed) > 2) {
          const d = dist2(pv.state.x, pv.state.z, w.x, w.z);
          if (d < 5) { w.off = w.off > 0.5 ? -0.3 : 1.4; speed = 3.5; if (this.rng.chance(0.02)) g.hud.say('Pedestrian', this.rng.pick(['Arre dhyaan se!', 'Footpath pe gaadi?!', 'Kya kar rahe ho!']), 2); }
        }
        w.t += speed * w.dir * dt;
        if (w.timer <= 0) {
          w.timer = this.rng.range(8, 40);
          const r = this.rng.next();
          if (r < 0.2) { w.state = 'idle'; w.timer = this.rng.range(3, 12); w.pose = this.rng.chance(0.3) ? Pose.Phone : Pose.Stand; }
          else if (r < 0.28) w.dir = (w.dir * -1) as 1 | -1;
        }
        // consider crossing at a zebra
        const cr = this.findCrossing(w.x, w.z);
        if (cr && this.rng.chance(0.012)) {
          const { c, end } = cr;
          const bx = end === 0 ? c.bx : c.ax, bz = end === 0 ? c.bz : c.az;
          // find the loop on the other side
          let toLoop = -1, toT = 0, bd = 4;
          this.loops.forEach((l, li) => {
            if (li === w.loop) return;
            for (let k = 0; k < l.pts.length - 1; k++) {
              const a = l.pts[k], b = l.pts[k + 1];
              const seg = Math.hypot(b.x - a.x, b.z - a.z);
              const u = Math.max(0, Math.min(1, ((bx - a.x) * (b.x - a.x) + (bz - a.z) * (b.z - a.z)) / (seg * seg)));
              const px = a.x + (b.x - a.x) * u, pz = a.z + (b.z - a.z) * u;
              const d = dist2(px, pz, bx, bz);
              if (d < bd) { bd = d; toLoop = li; toT = l.cum[k] + u * seg; }
            }
          });
          if (toLoop >= 0) { w.state = 'wait'; w.cross = { ax: w.x, az: w.z, bx, bz, node: c.node, toLoop, toT, p: 0 }; w.pose = Pose.Stand; }
        }
      } else if (w.state === 'idle') {
        if (w.timer <= 0) { w.state = 'walk'; w.timer = this.rng.range(10, 40); w.pose = Pose.Stand; }
      } else if (w.state === 'wait') {
        const c = w.cross!;
        const walk = g.graph.pedWalk(c.node, g.signalTime);
        if (walk || w.timer < -40) { w.state = 'cross'; }
        w.heading = Math.atan2(c.bx - c.ax, c.bz - c.az);
      } else if (w.state === 'cross') {
        const c = w.cross!;
        const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
        c.p += (w.speed * 1.2 * dt) / len;
        w.x = c.ax + (c.bx - c.ax) * c.p;
        w.z = c.az + (c.bz - c.az) * c.p;
        w.y = 0;
        w.heading = Math.atan2(c.bx - c.ax, c.bz - c.az);
        speed = w.speed * 1.2;
        if (c.p >= 1) { w.loop = c.toLoop; w.t = c.toT; w.state = 'walk'; w.cross = undefined; w.timer = this.rng.range(10, 30); }
      }
      if (w.state === 'walk' || w.state === 'idle') {
        const p = this.loopPos(loop, w.t, w.off);
        const nh = Math.atan2(p.tx * w.dir, p.tz * w.dir);
        w.heading = w.state === 'walk' ? w.heading + wrapAngle(nh - w.heading) * Math.min(1, dt * 6) : w.heading;
        w.x = p.x; w.z = p.z;
        w.y = g.col.groundHeight(w.x, w.z, 1, 0.5);
      }
      this.crowd.set(w.h, w.x, w.y, w.z, w.heading, speed, dt, w.state === 'idle' ? w.pose : Pose.Stand);
      if (w.state === 'cross' || dist2(w.x, w.z, focus.x, focus.z) < 60) positions.push({ x: w.x, z: w.z });
    }
    // stationary NPCs near the focus (vendors, shopkeepers, commuters on platforms)
    this.staticTimer -= dt;
    if (this.staticTimer <= 0) {
      this.staticTimer = 0.5;
      for (const s of this.statics) {
        const d = dist2(s.x, s.z, focus.x, focus.z);
        if (d < 110 && !s.h) {
          try { s.h = this.crowd.add(randomAppearance(this.rng, s.role === 'devotee' ? this.rng.chance(0.7) : undefined)); } catch { break; }
          this.crowd.set(s.h, s.x, s.y, s.z, s.heading, 0, 0, s.pose);
        } else if (d > 130 && s.h) { this.crowd.remove(s.h); s.h = null; }
      }
    }
    for (const s of this.statics) if (s.h) this.crowd.set(s.h, s.x, s.y, s.z, s.heading + Math.sin(performance.now() / 4000 + s.x) * 0.15, 0, dt, s.pose);
    (g as any).pedPositions = positions;
    this.crowd.update(dt);
    void nodeRect;
  }
}
