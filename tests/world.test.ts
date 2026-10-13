import { describe, it, expect } from 'vitest';
import { computeNodes, computeBlocks, carriageways, inRect, LANDMARKS, rectsOverlap, ROADS, roadHalfWidth } from '../src/world/layout';
import { RoadGraph, SIGNAL_TIMING } from '../src/traffic/RoadGraph';
import { GameClock } from '../src/core/GameClock';
import { CollisionWorld } from '../src/world/Collision';
import { SHOPS } from '../src/config/shops';

describe('District layout', () => {
  const blocks = computeBlocks();
  const cw = carriageways();
  it('blocks never overlap carriageways', () => {
    for (const b of blocks) for (const r of cw) {
      const ix = Math.min(b.x1, r.x1) - Math.max(b.x0, r.x0), iz = Math.min(b.z1, r.z1) - Math.max(b.z0, r.z0);
      expect(ix > 0.01 && iz > 0.01).toBe(false);
    }
  });
  it('landmarks sit on blocks, not on roads', () => {
    for (const l of LANDMARKS) for (const r of cw) expect(rectsOverlap(l.r, r, -0.01)).toBe(false);
  });
  it('shops face a footpath next to a road', () => {
    for (const s of SHOPS) for (const r of cw) expect(inRect(r, s.x, s.z, -0.05)).toBe(false);
  });
  it('junctions with 3+ arms are signalised', () => {
    const nodes = computeNodes();
    for (const n of nodes) if (!n.boundary) expect(n.signal).toBe(Object.keys(n.arms).length >= 3);
  });
});

describe('Road graph (left-hand traffic)', () => {
  const g = new RoadGraph();
  it('eastbound lanes are on the north side (drive on the left)', () => {
    const lane = g.paths.find((p) => p.kind === 'lane' && p.roadId === 'tilak' && p.dir === 'E')!;
    expect(lane.pts[0].z).toBeLessThan(0);
    const wb = g.paths.find((p) => p.kind === 'lane' && p.roadId === 'tilak' && p.dir === 'W')!;
    expect(wb.pts[0].z).toBeGreaterThan(0);
  });
  it('every non-sink lane connects onward', () => {
    for (const p of g.paths) if (p.kind === 'lane' && !p.sink) expect(p.next.length).toBeGreaterThan(0);
    for (const p of g.paths) for (const n of p.next) expect(g.paths[n]).toBeDefined();
  });
  it('lanes stay inside their road', () => {
    for (const p of g.paths) {
      if (p.kind !== 'lane') continue;
      const r = ROADS.find((x) => x.id === p.roadId)!;
      const half = roadHalfWidth(r);
      for (const pt of p.pts) expect(Math.abs((r.axis === 'x' ? pt.z : pt.x) - r.c)).toBeLessThan(half);
    }
  });
  it('split-phase signals never give green to two approaches at once', () => {
    for (const n of g.nodes.filter((x) => x.signal)) {
      const arms = Object.keys(n.arms) as any[];
      for (let t = 0; t < g.cycleLength(n.id); t += 0.5) {
        const greens = arms.filter((a) => g.signalState(n.id, a, t) !== 'R');
        expect(greens.length).toBeLessThanOrEqual(1);
        if (g.pedWalk(n.id, t)) expect(greens.length).toBe(0);
      }
    }
    expect(SIGNAL_TIMING.green).toBeGreaterThan(5);
  });
  it('can route between lanes', () => {
    const a = g.lanes()[0], b = g.lanes()[g.lanes().length - 1];
    const r = g.route(a.id, b.id);
    expect(r === null || r[0] === a.id).toBe(true);
  });
});

describe('Game clock', () => {
  it('advances days and fires callbacks', () => {
    const c = new GameClock(1, 23 * 60 + 50, 1);
    const days: number[] = [];
    c.newDay((d) => days.push(d));
    c.advance(20);
    expect(c.day).toBe(2);
    expect(days).toEqual([2]);
    expect(c.format()).toBe('12:10 AM');
    expect(c.skipTo(7)).toBeGreaterThan(0);
    expect(c.hour).toBeCloseTo(7);
  });
  it('handles shop hours across midnight', () => {
    const c = new GameClock(1, 23 * 60 + 30);
    expect(c.isOpen(16, 24)).toBe(true);
    expect(c.isOpen(22, 2)).toBe(true);
    expect(c.isOpen(7, 22)).toBe(false);
  });
});

describe('Collision world', () => {
  it('pushes circles out of boxes and supports layered surfaces', () => {
    const w = new CollisionWorld();
    w.addBox(0, 0, 10, 10, 0, 5);
    const r = w.resolveCircle(-0.2, 5, 0.5, 0, 1.8);
    expect(r.hit).toBe(true);
    expect(r.x).toBeLessThanOrEqual(-0.5 + 1e-6);
    w.addSurface({ x0: 20, z0: 0, x1: 30, z1: 10, h: 0.15 });
    w.addSurface({ x0: 20, z0: 0, x1: 30, z1: 10, h: 7.4 });
    expect(w.groundHeight(25, 5, 0)).toBeCloseTo(0.15); // can step on kerb, not jump to the bridge
    expect(w.groundHeight(25, 5, 7.5)).toBeCloseTo(7.4); // walking on the bridge deck
    w.addSurface({ x0: 40, z0: 0, x1: 42, z1: 10, h: 0, ramp: { axis: 'z', h0: 1, h1: 3 } });
    expect(w.groundHeight(41, 5, 2.5)).toBeCloseTo(2);
  });
});
