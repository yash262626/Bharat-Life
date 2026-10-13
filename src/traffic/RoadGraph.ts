// Lane-level road graph built from the district layout. Left-hand traffic (India).
// Lanes run between junction stop lines; connectors are bezier curves through junctions.
// Pure logic (no Three.js) so it can be unit-tested.

import { Arm, NodeDef, RoadDef, ROADS, NODES, roadHalfWidth } from '../world/layout';

export interface P2 { x: number; z: number }

export interface LanePath {
  id: number;
  kind: 'lane' | 'connector';
  pts: P2[];
  cum: number[];
  length: number;
  speed: number; // m/s limit
  roadId: string;
  laneIndex: number; // 0 = kerb-side lane
  lanes: number;
  dir: Arm; // travel direction (lanes); exit direction (connectors)
  fromNode: string;
  toNode: string;
  next: number[];
  /** For lanes ending at a signalised junction: which approach arm they belong to. */
  signal?: { node: string; arm: Arm };
  sink: boolean;
  source: boolean;
  turn?: 'S' | 'L' | 'R';
  /** Lane width (for two-wheeler lateral offsets). */
  width: number;
}

export const ARM_VEC: Record<Arm, P2> = { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } };
export const OPP: Record<Arm, Arm> = { N: 'S', S: 'N', E: 'W', W: 'E' };
/** Left of travel direction (y-up, x east, z south). */
export const LEFT_OF: Record<Arm, Arm> = { N: 'W', W: 'S', S: 'E', E: 'N' };
export const RIGHT_OF: Record<Arm, Arm> = { N: 'E', E: 'S', S: 'W', W: 'N' };

export const SIGNAL_TIMING = { green: 13, amber: 3, allRed: 2, ped: 9 };

export function nodeApproachOffset(n: NodeDef, travel: Arm) {
  if (n.boundary) return 0;
  const half = travel === 'E' || travel === 'W' ? n.hx : n.hz;
  return half + (n.signal ? 5.5 : 1.2);
}

export function makePath(pts: P2[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Position + tangent at distance s along a path. */
export function sampleAt(p: { pts: P2[]; cum: number[]; length: number }, s: number, out = { x: 0, z: 0, tx: 0, tz: 1 }) {
  const { pts, cum } = p;
  if (s <= 0) {
    out.x = pts[0].x; out.z = pts[0].z;
    const dx = pts[1].x - pts[0].x, dz = pts[1].z - pts[0].z, l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l; out.tz = dz / l;
    return out;
  }
  let i = 1;
  // binary search segment
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1; else hi = mid;
  }
  i = Math.min(lo, cum.length - 1);
  const a = pts[i - 1], b = pts[i];
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, (s - cum[i - 1]) / segLen);
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.tx = (b.x - a.x) / segLen;
  out.tz = (b.z - a.z) / segLen;
  return out;
}

export class RoadGraph {
  paths: LanePath[] = [];
  nodes: NodeDef[];
  roads: RoadDef[];
  private nodeById = new Map<string, NodeDef>();
  /** Signal timing offsets per node. */
  signalOffset = new Map<string, number>();
  signalArms = new Map<string, Arm[]>();

  constructor(roads: RoadDef[] = ROADS, nodes: NodeDef[] = NODES) {
    this.roads = roads;
    this.nodes = nodes;
    for (const n of nodes) this.nodeById.set(n.id, n);
    this.buildLanes();
    this.buildConnectors();
    let k = 0;
    for (const n of nodes) {
      if (!n.signal) continue;
      const arms = (['N', 'E', 'S', 'W'] as Arm[]).filter((a) => n.arms[a]);
      this.signalArms.set(n.id, arms);
      this.signalOffset.set(n.id, (k++ * 17.3) % this.cycleLength(n.id));
    }
  }

  node(id: string) { return this.nodeById.get(id)!; }

  private buildLanes() {
    for (const r of this.roads) {
      const onRoad = this.nodes
        .filter((n) => n.roads.includes(r.id))
        .sort((a, b) => (r.axis === 'x' ? a.x - b.x : a.z - b.z));
      for (let k = 0; k + 1 < onRoad.length; k++) {
        const A = onRoad[k], B = onRoad[k + 1];
        for (const forward of [true, false]) {
          const from = forward ? A : B, to = forward ? B : A;
          const dir: Arm = r.axis === 'x' ? (forward ? 'E' : 'W') : (forward ? 'S' : 'N');
          const d = ARM_VEC[dir];
          const left = ARM_VEC[LEFT_OF[dir]];
          for (let i = 0; i < r.lanes; i++) {
            const off = r.median / 2 + r.laneW * (r.lanes - i - 0.5);
            const so = nodeApproachOffset(from, dir);
            const eo = nodeApproachOffset(to, OPP[dir]);
            const sx = from.x + d.x * so + left.x * off, sz = from.z + d.z * so + left.z * off;
            const ex = to.x - d.x * eo + left.x * off, ez = to.z - d.z * eo + left.z * off;
            const geo = makePath([{ x: sx, z: sz }, { x: ex, z: ez }]);
            this.paths.push({
              id: this.paths.length, kind: 'lane', ...geo, speed: r.speed / 3.6, roadId: r.id, laneIndex: i, lanes: r.lanes,
              dir, fromNode: from.id, toNode: to.id, next: [], sink: to.boundary, source: from.boundary, width: r.laneW,
              signal: to.signal ? { node: to.id, arm: OPP[dir] } : undefined,
            });
          }
        }
      }
    }
  }

  private buildConnectors() {
    const lanes = this.paths.filter((p) => p.kind === 'lane');
    for (const inc of lanes) {
      const n = this.node(inc.toNode);
      if (n.boundary) continue;
      const approach = OPP[inc.dir];
      for (const exitArm of Object.keys(n.arms) as Arm[]) {
        if (exitArm === approach) continue; // no U-turns
        let turn: 'S' | 'L' | 'R';
        if (exitArm === inc.dir) turn = 'S';
        else if (exitArm === LEFT_OF[inc.dir]) turn = 'L';
        else turn = 'R';
        if (inc.lanes >= 2) {
          if (turn === 'L' && inc.laneIndex !== 0) continue;
          if (turn === 'R' && inc.laneIndex !== inc.lanes - 1) continue;
        }
        const outs = lanes.filter((p) => p.fromNode === n.id && p.dir === exitArm);
        if (!outs.length) continue;
        const exitLanes = outs[0].lanes;
        const targetIdx = turn === 'L' ? 0 : turn === 'R' ? exitLanes - 1 : Math.min(inc.laneIndex, exitLanes - 1);
        const out = outs.find((p) => p.laneIndex === targetIdx)!;
        const p0 = inc.pts[inc.pts.length - 1], p2 = out.pts[0];
        const d0 = ARM_VEC[inc.dir], d2 = ARM_VEC[exitArm];
        let ctrl: P2;
        if (turn === 'S') ctrl = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
        else {
          // intersection of the two tangent lines
          ctrl = d0.x !== 0 ? { x: p2.x, z: p0.z } : { x: p0.x, z: p2.z };
        }
        const pts: P2[] = [];
        const N = turn === 'S' ? 2 : 10;
        for (let i = 0; i <= N; i++) {
          const t = i / N, u = 1 - t;
          pts.push({ x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * ctrl.z + t * t * p2.z });
        }
        void d2;
        const geo = makePath(pts);
        const speed = turn === 'S' ? Math.min(inc.speed, out.speed) : Math.min(inc.speed, 18 / 3.6);
        const c: LanePath = {
          id: this.paths.length, kind: 'connector', ...geo, speed, roadId: out.roadId, laneIndex: out.laneIndex, lanes: out.lanes,
          dir: exitArm, fromNode: n.id, toNode: n.id, next: [out.id], sink: false, source: false, turn, width: out.width,
        };
        this.paths.push(c);
        inc.next.push(c.id);
      }
    }
  }

  cycleLength(nodeId: string) {
    const arms = (['N', 'E', 'S', 'W'] as Arm[]).filter((a) => this.node(nodeId).arms[a]).length;
    const t = SIGNAL_TIMING;
    return arms * (t.green + t.amber + t.allRed) + t.ped;
  }

  /** Signal aspect for an approach arm at time t (seconds). */
  signalState(nodeId: string, arm: Arm, t: number): 'G' | 'A' | 'R' {
    const arms = this.signalArms.get(nodeId);
    if (!arms) return 'G';
    const T = SIGNAL_TIMING;
    const cyc = this.cycleLength(nodeId);
    const ph = (((t + (this.signalOffset.get(nodeId) ?? 0)) % cyc) + cyc) % cyc;
    const slot = T.green + T.amber + T.allRed;
    const idx = Math.floor(ph / slot);
    if (idx >= arms.length) return 'R'; // pedestrian phase
    if (arms[idx] !== arm) return 'R';
    const within = ph - idx * slot;
    if (within < T.green) return 'G';
    if (within < T.green + T.amber) return 'A';
    return 'R';
  }

  /** True while pedestrians may cross at this junction (all-red scramble phase). */
  pedWalk(nodeId: string, t: number) {
    const arms = this.signalArms.get(nodeId);
    if (!arms) return true;
    const T = SIGNAL_TIMING;
    const cyc = this.cycleLength(nodeId);
    const ph = (((t + (this.signalOffset.get(nodeId) ?? 0)) % cyc) + cyc) % cyc;
    return ph >= arms.length * (T.green + T.amber + T.allRed) + 0.5 && ph < cyc - 1.5;
  }

  sources() { return this.paths.filter((p) => p.source); }
  lanes() { return this.paths.filter((p) => p.kind === 'lane'); }

  /** Nearest lane point to (x,z): returns path id, distance along, and lateral distance. */
  nearestLane(x: number, z: number, filter?: (p: LanePath) => boolean) {
    let best = { id: -1, s: 0, d: Infinity };
    for (const p of this.paths) {
      if (p.kind !== 'lane' || (filter && !filter(p))) continue;
      const a = p.pts[0], b = p.pts[p.pts.length - 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const L2 = abx * abx + abz * abz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / L2));
      const px = a.x + abx * t, pz = a.z + abz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { id: p.id, s: t * p.length, d };
    }
    return best;
  }

  /** Shortest route (list of path ids) from a lane position to the lane nearest a target point. */
  route(fromPath: number, toPath: number): number[] | null {
    const dist = new Map<number, number>([[fromPath, 0]]);
    const prev = new Map<number, number>();
    const open = new Set<number>([fromPath]);
    while (open.size) {
      let cur = -1, cd = Infinity;
      for (const id of open) { const d = dist.get(id)!; if (d < cd) { cd = d; cur = id; } }
      open.delete(cur);
      if (cur === toPath) break;
      for (const nx of this.paths[cur].next) {
        const nd = cd + this.paths[cur].length;
        if (nd < (dist.get(nx) ?? Infinity)) { dist.set(nx, nd); prev.set(nx, cur); open.add(nx); }
      }
    }
    if (!dist.has(toPath)) return null;
    const out = [toPath];
    while (out[0] !== fromPath) out.unshift(prev.get(out[0])!);
    return out;
  }
}

export const roadHalf = roadHalfWidth;
