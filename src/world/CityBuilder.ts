// Assembles the whole district: roads, footpaths, buildings, landmarks, props, railway, sea and skyline.
import * as THREE from 'three';
import { BuildContext, C } from './BuildContext';
import { MaterialLib } from './materials';
import { CollisionWorld } from './Collision';
import {
  ROADS, NODES, BLOCKS, CARRIAGEWAYS, LANDMARKS, DISTRICT, BOUNDARY_Z, BUS_STOPS, RAIL,
  Rect, rect, roadRect, roadHalfWidth, nodeRect, zoneAt, isOnRoad, RoadDef, Arm, inRect,
} from './layout';
import { place, uvPlane, uvBox } from './geom';
import { genericBuilding, buildShop, shopRect, KERB_H } from './buildings';
import { buildLandmark } from './landmarks';
import { buildRailway } from './railway';
import { tree, streetLight, cablePole, cable, busShelter, hoarding, dustbin, bush } from './props';
import { SHOPS } from '../config/shops';
import { RoadGraph, ARM_VEC, LEFT_OF } from '../traffic/RoadGraph';
import { makeRng } from '../core/math';
import { FacadeStyle } from './textures';
import { Frame } from './Frame';

export const SIDEWALK: Record<RoadDef['kind'], number> = { arterial: 4, coastal: 4, street: 3.2, lane: 3 };

export interface CityBuildResult {
  group: THREE.Group;
  ctx: BuildContext;
  sea: THREE.Mesh;
}

export function buildCity(mats: MaterialLib, col: CollisionWorld, graph: RoadGraph): CityBuildResult {
  const ctx = new BuildContext(mats, col, makeRng(20240611));
  const t0 = performance.now();

  ground(ctx);
  roads(ctx, graph);
  blocks(ctx);
  // Landmarks & interactive shops first (they reserve space), then generic frontage.
  for (const l of LANDMARKS) buildLandmark(ctx, l);
  for (const s of SHOPS) {
    if (s.form === 'counter') continue;
    const r = shopRect(s);
    ctx.reserve(rect(r.x0 - 0.5, r.z0 - 0.5, r.x1 + 0.5, r.z1 + 0.5));
    buildShop(ctx, s);
  }
  streetProps(ctx);
  frontageBuildings(ctx);
  heroStreet(ctx);
  promenade(ctx);
  boundary(ctx);
  buildRailway(ctx);
  skyline(ctx);

  const group = ctx.batch.build((key, vc) => mats.get(key, vc), {
    castShadow: (k) => !k.startsWith('marking') && k !== 'asphalt' && k !== 'ballast' && k !== 'grass' && k !== 'dirt' && k !== 'paver' && k !== 'sand',
    receiveShadow: true,
  });
  group.name = 'city-static';
  group.add(ctx.dynamic);
  const sea = makeSea();
  group.add(sea);
  console.info(`[City] built in ${(performance.now() - t0).toFixed(0)} ms: ${group.children.length} meshes, ${col.colliderCount} colliders`);
  return { group, ctx, sea };
}

// ------------------------------------------------------------------------------------------
function ground(ctx: BuildContext) {
  // big base ground (beyond the district it is mostly hidden by skyline + haze)
  ctx.batch.add('concrete_dark', place(uvPlane(4060, 5200, 6), DISTRICT.minX + 2030, -0.05, -300));
}

function roads(ctx: BuildContext, graph: RoadGraph) {
  for (const r of CARRIAGEWAYS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    ctx.batch.add('asphalt', place(uvPlane(w, d, 7), (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2));
  }
  const rng = ctx.rng;
  for (const road of ROADS) {
    const rr = roadRect(road);
    const half = roadHalfWidth(road);
    const along = road.axis;
    // segments between junction boxes for markings
    const nodes = NODES.filter((n) => n.roads.includes(road.id)).sort((a, b) => (along === 'x' ? a.x - b.x : a.z - b.z));
    for (let k = 0; k + 1 < nodes.length; k++) {
      const A = nodes[k], B = nodes[k + 1];
      const a = (along === 'x' ? A.x + A.hx : A.z + A.hz), b = (along === 'x' ? B.x - B.hx : B.z - B.hz);
      const len = b - a;
      if (len <= 0) continue;
      const mid = (a + b) / 2;
      const at = (offset: number, alongPos: number): [number, number] => (along === 'x' ? [alongPos, road.c + offset] : [road.c + offset, alongPos]);
      const strip = (key: string, offset: number, w: number, l: number, pos: number) => {
        const [x, z] = at(offset, pos);
        const g = along === 'x' ? uvPlane(l, w, 1) : uvPlane(w, l, 1);
        ctx.batch.add(key, place(g, x, 0.012, z));
      };
      const dashed = (key: string, offset: number, dash = 3, gap = 4.5) => {
        for (let p = a + 2; p + dash < b - 2; p += dash + gap) strip(key, offset, 0.12, dash, p + dash / 2);
      };
      // median or centre line
      if (road.median > 0) {
        const [mx, mz] = at(0, mid);
        const g = along === 'x' ? uvBox(len - 2, 0.28, road.median, 1) : uvBox(road.median, 0.28, len - 2, 1);
        ctx.batch.add('curb', place(g, mx, 0.14, mz));
        const top = along === 'x' ? uvPlane(len - 2.2, road.median - 0.3, 2) : uvPlane(road.median - 0.3, len - 2.2, 2);
        ctx.batch.add('grass', place(top, mx, 0.285, mz));
        const [x0, z0] = at(-road.median / 2, a + 1), [x1, z1] = at(road.median / 2, b - 1);
        ctx.col.addBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), -1, 0.28, 'median');
        // shrubs and median lamp posts
        for (let p = a + 5; p < b - 5; p += 6) {
          const [sx, sz] = at(0, p);
          bush(ctx, sx, 0.28, sz, rng.range(0.8, 1.1));
        }
        for (let p = a + 12; p < b - 8; p += 32) {
          const [lx, lz] = at(0, p);
          streetLight(ctx, lx, 0.28, lz, along === 'x' ? 0 : Math.PI / 2, true);
        }
      } else if (road.lanes >= 2) {
        strip('marking_yellow', -0.12, 0.1, len - 2, mid);
        strip('marking_yellow', 0.12, 0.1, len - 2, mid);
      } else {
        dashed('marking_white', 0, 2.5, 3.5);
      }
      // lane dividers
      for (let i = 1; i < road.lanes; i++) {
        const off = road.median / 2 + road.laneW * i;
        dashed('marking_white', off);
        dashed('marking_white', -off);
      }
      // edge lines on arterials
      if (road.kind === 'arterial' || road.kind === 'coastal') {
        strip('marking_white', half - 0.3, 0.12, len - 2, mid);
        strip('marking_white', -half + 0.3, 0.12, len - 2, mid);
      }
      // ---- road surface detail: wheel-path polish, tar patches, kerb dust, oil, manholes, drains
      const decal = (key: string, cx: number, cz: number, w: number, l: number, rot = 0, y = 0.006) => {
        const g = new THREE.PlaneGeometry(along === 'x' ? l : w, along === 'x' ? w : l);
        g.rotateX(-Math.PI / 2);
        ctx.batch.add(key, place(g, cx, y, cz, rot));
      };
      const laneCentres: number[] = [];
      for (let i = 0; i < road.lanes; i++) {
        const off = road.median / 2 + road.laneW * (road.lanes - i - 0.5);
        laneCentres.push(off, -off);
      }
      for (const lc of laneCentres) {
        for (const wheel of [-0.75, 0.75]) {
          for (let p = a + 3; p < b - 3; p += rng.range(9, 16)) {
            const L = rng.range(6, 14);
            const [px, pz] = at(lc + wheel + rng.range(-0.15, 0.15), Math.min(b - 2, p + L / 2));
            decal('road_oil', px, pz, rng.range(0.35, 0.6), L, 0, 0.004);
          }
        }
        // oil drips in lane centres
        for (let p = a + 4; p < b - 4; p += rng.range(10, 30)) {
          const [px, pz] = at(lc + rng.range(-0.3, 0.3), p);
          decal('road_oil', px, pz, rng.range(0.4, 0.9), rng.range(0.5, 1.4), rng.range(0, 3), 0.005);
        }
      }
      for (let i = 0; i < Math.floor(len / 9); i++) {
        if (!rng.chance(0.55)) continue;
        const [px, pz] = at(rng.range(-half + 0.8, half - 0.8), rng.range(a + 3, b - 3));
        decal('road_patch', px, pz, rng.range(0.8, 2.6), rng.range(1.2, 4.5), 0, 0.007);
      }
      // kerb-side dust / grit accumulation and drain grates
      for (const side of [-1, 1]) {
        for (let p = a + 1; p < b - 1; p += rng.range(4, 8)) {
          const [px, pz] = at(side * (half - 0.45), p + 3);
          decal('road_dust', px, pz, rng.range(0.7, 1.3), rng.range(5, 9), 0, 0.008);
        }
        for (let p = a + 6; p < b - 6; p += 14) {
          const [gx, gz] = at(side * (half - 0.3), p);
          const g = along === 'x' ? new THREE.BoxGeometry(0.9, 0.04, 0.4) : new THREE.BoxGeometry(0.4, 0.04, 0.9);
          ctx.batch.add('grate', place(g, gx, 0.0, gz));
        }
      }
      for (let i = 0; i < Math.max(1, Math.floor(len / 45)); i++) {
        const [px, pz] = at(rng.range(-half + 1.2, half - 1.2), rng.range(a + 4, b - 4));
        const g = new THREE.CylinderGeometry(0.33, 0.33, 0.03, 20);
        ctx.batch.add('manhole', place(g, px, 0.0, pz));
        decal('road_patch', px, pz, 1.1, 1.1, 0, 0.006);
      }
      // speed breakers on the narrow market lane (painted black & yellow)
      if (road.kind === 'lane') {
        for (let p = a + 25; p < b - 20; p += 70) {
          const [px, pz] = at(0, p);
          const g = along === 'x' ? uvBox(0.9, 0.09, half * 2, 1.2, 0.2) : uvBox(half * 2, 0.09, 0.9, 1.2, 0.2);
          ctx.batch.add('curb', place(g, px, 0.03, pz));
        }
      }
    }
    void rr;
  }
  // stop lines + zebra crossings at signalised junctions
  for (const p of graph.paths) {
    if (p.kind !== 'lane' || !p.signal) continue;
    const end = p.pts[p.pts.length - 1];
    const d = ARM_VEC[p.dir];
    const w = p.width;
    const g = d.x !== 0 ? uvPlane(0.4, w - 0.1, 1) : uvPlane(w - 0.1, 0.4, 1);
    ctx.batch.add('marking_white', place(g, end.x + d.x * 0.3, 0.013, end.z + d.z * 0.3));
  }
  for (const n of NODES) {
    if (!n.signal) continue;
    for (const arm of Object.keys(n.arms) as Arm[]) {
      const road = ROADS.find((r) => r.id === n.arms[arm])!;
      const half = roadHalfWidth(road);
      const v = ARM_VEC[arm];
      const boxHalf = arm === 'E' || arm === 'W' ? n.hx : n.hz;
      const cDist = boxHalf + 2.6;
      const cx = n.x + v.x * cDist, cz = n.z + v.z * cDist;
      const stripes = Math.floor((half * 2) / 1.0);
      for (let i = 0; i < stripes; i++) {
        const off = -half + 0.5 + i * 1.0;
        const g = v.x !== 0 ? uvPlane(3.6, 0.5, 1) : uvPlane(0.5, 3.6, 1);
        ctx.batch.add('marking_white', place(g, cx + (v.x === 0 ? off : 0), 0.012, cz + (v.z === 0 ? off : 0)));
      }
    }
  }
}

function blocks(ctx: BuildContext) {
  for (const b of BLOCKS) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const zone = zoneAt(cx, cz);
    const top = zone === 'promenade' ? 'paver_warm' : 'paver';
    // kerb slab: painted kerb faces + paver top
    ctx.batch.add('curb', place(uvBox(w, KERB_H, d, 1.2, KERB_H), cx, KERB_H / 2, cz, 0, 1, 1, 1));
    ctx.batch.add(top, place(uvPlane(w, d, 1.6), cx, KERB_H + 0.002, cz));
    ctx.col.addSurface({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: KERB_H, tag: zone === 'promenade' ? 'promenade' : 'footpath' });
  }
}

/** Which road (if any) borders block rect b on side `side`; returns the road and the sidewalk width. */
function sideRoad(b: Rect, side: Arm): { road: RoadDef; sw: number } | null {
  const mid = side === 'N' ? { x: (b.x0 + b.x1) / 2, z: b.z0 - 1 } : side === 'S' ? { x: (b.x0 + b.x1) / 2, z: b.z1 + 1 } : side === 'W' ? { x: b.x0 - 1, z: (b.z0 + b.z1) / 2 } : { x: b.x1 + 1, z: (b.z0 + b.z1) / 2 };
  for (const r of ROADS) if (inRect(roadRect(r), mid.x, mid.z)) return { road: r, sw: SIDEWALK[r.kind] };
  return null;
}

function streetProps(ctx: BuildContext) {
  const rng = ctx.rng;
  for (const b of BLOCKS) {
    const zone = zoneAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    if (zone === 'promenade' || zone === 'station') continue;
    for (const side of ['N', 'S', 'E', 'W'] as Arm[]) {
      const sr = sideRoad(b, side);
      if (!sr) continue;
      const { road, sw } = sr;
      const horizontal = side === 'N' || side === 'S';
      const a0 = horizontal ? b.x0 : b.z0, a1 = horizontal ? b.x1 : b.z1;
      const edge = side === 'N' ? b.z0 : side === 'S' ? b.z1 : side === 'W' ? b.x0 : b.x1;
      const inward = side === 'N' || side === 'W' ? 1 : -1;
      const pt = (along: number, depth: number) => (horizontal ? { x: along, z: edge + inward * depth } : { x: edge + inward * depth, z: along });
      const towardRoad = side === 'N' ? Math.PI : side === 'S' ? 0 : side === 'W' ? -Math.PI / 2 : Math.PI / 2;
      // streetlights (arterials both sides, others one side)
      const lightStep = road.kind === 'lane' ? 26 : 32;
      if (road.median === 0 || road.kind !== 'coastal') {
        const sideOk = road.median > 0 ? false : road.kind === 'arterial' || side === 'N' || side === 'W';
        if (sideOk) for (let p = a0 + 8; p < a1 - 6; p += lightStep) {
          const q = pt(p, 0.45);
          if (!ctx.isReserved(rect(q.x - 0.4, q.z - 0.4, q.x + 0.4, q.z + 0.4))) streetLight(ctx, q.x, KERB_H, q.z, towardRoad);
        }
      }
      // trees on wide footpaths
      if (sw >= 3.2) {
        for (let p = a0 + 14; p < a1 - 10; p += rng.range(16, 26)) {
          const q = pt(p, 0.9);
          if (ctx.isReserved(rect(q.x - 1, q.z - 1, q.x + 1, q.z + 1)) || isNearNodeCorner(q.x, q.z)) continue;
          tree(ctx, q.x, KERB_H, q.z, rng.pick(['rain', 'gulmohar', 'neem', 'ashoka']));
        }
      }
      // cable poles and sagging wires in older streets
      if (road.kind === 'lane' || road.kind === 'street') {
        let prev: THREE.Vector3 | null = null;
        for (let p = a0 + 6; p < a1 - 4; p += 22) {
          const q = pt(p, 0.3);
          if (ctx.isReserved(rect(q.x - 0.3, q.z - 0.3, q.x + 0.3, q.z + 0.3))) { prev = null; continue; }
          cablePole(ctx, q.x, KERB_H, q.z, towardRoad);
          const top = new THREE.Vector3(q.x, KERB_H + 6.9, q.z);
          if (prev) {
            cable(ctx, prev, top, 0.9, 0.035);
            cable(ctx, prev.clone().add(new THREE.Vector3(0, -0.3, 0)), top.clone().add(new THREE.Vector3(0, -0.3, 0)), 1.2, 0.02, '#2a2a2a');
          }
          prev = top;
        }
      }
      // parked vehicles in the kerb-side parking strip (two-wheelers angled to the kerb, autos, cars)
      if (road.parking) {
        const towardKerb = towardRoad + Math.PI;
        let clusterEnd = a0 + 8 + rng.range(6, 16);
        for (let p = a0 + 8; p < a1 - 8; ) {
          if (p > clusterEnd) { p += rng.range(5, 14); clusterEnd = p + rng.range(5, 16); continue; }
          if (isNearNodeCorner(...xz(pt(p, -road.parking / 2)))) { p += 2; continue; }
          const r = rng.next();
          if (r < 0.07) { p += rng.range(3, 7); continue; } // gap
          if (r < 0.14 && road.parking >= 1.8) {
            // auto-rickshaw waiting along the kerb (parallel)
            const q = pt(p + 1.4, -road.parking / 2 - 0.1);
            parkVehicle(ctx, 'auto_rickshaw', '#151515', q.x, q.z, towardRoad + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1), 0, 2.7, 1.3);
            p += 3.4;
            continue;
          }
          if (r < 0.22 && road.parking >= 2) {
            const q = pt(p + 2.2, -road.parking / 2 - 0.05);
            const type = rng.pick(['rajhans_pixie', 'rajhans_pixie', 'padma_taxi', 'rajhans_avanti']);
            parkVehicle(ctx, type, rng.pick(['#d8d8d4', '#b51e1e', '#20406e', '#7d7f80', '#1c1c1c', '#e3dccb']), q.x, q.z, towardRoad + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1), 0, 4.4, 1.7);
            p += rng.range(4.8, 5.6);
            continue;
          }
          const type = rng.chance(0.55) ? 'kesari_raftaar' : rng.chance(0.85) ? 'chetak_scooter' : 'vayu_ezip';
          const q = pt(p, -road.parking / 2 - 0.05);
          const ang = towardKerb + (rng.chance(0.85) ? 1 : -1) * rng.range(0.45, 0.75);
          const colr = type === 'kesari_raftaar' ? rng.pick(['#141414', '#7a1414', '#1d3f73', '#4a4a4a', '#0f0f0f', '#5b0e0e']) : rng.pick(['#b8c7cf', '#e8e2cf', '#9c2a2a', '#2f5d8a', '#efefef', '#3b3b3b']);
          parkVehicle(ctx, type, colr, q.x, q.z, ang, -rng.range(0.09, 0.14), 2.0, 0.75);
          p += rng.range(0.8, 1.05);
        }
      }
      for (let p = a0 + 20; p < a1 - 20; p += 60) {
        const q = pt(p, sw - 0.5);
        if (!ctx.isReserved(rect(q.x - 0.4, q.z - 0.4, q.x + 0.4, q.z + 0.4))) dustbin(ctx, q.x, KERB_H, q.z);
      }
    }
  }
  // bus shelters
  for (const s of BUS_STOPS) {
    const yaw = s.dir === 'E' ? Math.PI : s.dir === 'W' ? 0 : s.dir === 'S' ? Math.PI / 2 : -Math.PI / 2;
    // Shelter faces the road; local +z towards the road
    const toRoad = ARM_VEC[LEFT_OF[s.dir]];
    const face = Math.atan2(-toRoad.x, -toRoad.z);
    void yaw;
    busShelter(ctx, s.x, KERB_H, s.z, face, s.name);
    ctx.reserve(rect(s.x - 3, s.z - 3, s.x + 3, s.z + 3));
    ctx.anchors.set(s.id, { x: s.x, y: KERB_H, z: s.z });
    for (let i = 0; i < 3; i++) ctx.npcSpots.push({ x: s.x + ctx.rng.range(-2, 2), y: KERB_H, z: s.z + ctx.rng.range(-1, 1), heading: face, role: 'commuter' });
  }
}

const xz = (q: { x: number; z: number }): [number, number] => [q.x, q.z];

/** Register a parked vehicle (drawn by the VehicleInstancer) with an AABB collider. */
export function parkVehicle(ctx: BuildContext, type: string, color: string, x: number, z: number, heading: number, lean: number, L: number, W: number, y = 0) {
  ctx.parkedVehicles.push({ type, color, x, y, z, heading, lean });
  const c = Math.abs(Math.cos(heading)), s = Math.abs(Math.sin(heading));
  const hx = (c * W + s * L) / 2, hz = (s * W + c * L) / 2;
  ctx.col.addBox(x - hx, z - hz, x + hx, z + hz, y - 0.5, y + (L > 3 ? 1.6 : 1.1), 'vehicle');
}

function isNearNodeCorner(x: number, z: number) {
  for (const n of NODES) {
    if (n.boundary) continue;
    const r = nodeRect(n);
    if (inRect(r, x, z, 6)) return true;
  }
  return false;
}

const ZONE_STYLE: Record<string, { styles: FacadeStyle[]; floors: [number, number]; shops: number }> = {
  market: { styles: ['apartment', 'heritage', 'apartment', 'modern'], floors: [2, 5], shops: 0.9 },
  residential: { styles: ['apartment', 'modern', 'apartment'], floors: [5, 11], shops: 0.25 },
  corporate: { styles: ['glass', 'modern', 'glass'], floors: [7, 18], shops: 0.15 },
  chawl: { styles: ['chawl', 'apartment', 'chawl'], floors: [3, 4], shops: 0.4 },
  mixed: { styles: ['apartment', 'modern', 'heritage', 'apartment'], floors: [3, 7], shops: 0.75 },
  settlement: { styles: ['settlement'], floors: [1, 2], shops: 0.2 },
  station: { styles: ['apartment'], floors: [2, 4], shops: 0.6 },
};

const TINTS: Record<string, string[]> = {
  // Mumbai street palette: faded ochre, mustard, mint, salmon, lilac, pistachio, sky blue
  market: ['#e9d3a3', '#d8c07a', '#b9d4c8', '#e6b9a1', '#c9c3e0', '#f0e2b6', '#a9c7a0', '#d4a373', '#f1c6c6', '#9fc3d9'],
  residential: ['#f0e6d2', '#e4d6bd', '#d9e4e6', '#efe0c8', '#e0d0c0', '#cfdccf'],
  corporate: ['#ffffff', '#e7eef2', '#dfe8ec'],
  chawl: ['#d9c08f', '#c4d4b8', '#e2b896', '#cfc3a8', '#b8cad8', '#e0c9a6'],
  mixed: ['#efdcb5', '#c8dbe3', '#eac3a5', '#d5e3c2', '#e9e4da', '#f0cfcf', '#d9c9e6'],
  settlement: ['#ffffff'],
  station: ['#f0e6d0', '#e9e0cc'],
};

function frontageBuildings(ctx: BuildContext) {
  const rng = ctx.rng;
  for (const b of BLOCKS) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const zone = zoneAt(cx, cz);
    if (zone === 'promenade') continue;
    const zs = ZONE_STYLE[zone] ?? ZONE_STYLE.mixed;
    const placed: Rect[] = [];
    for (const side of ['N', 'S', 'W', 'E'] as Arm[]) {
      const sr = sideRoad(b, side);
      if (!sr) continue;
      const sw = sr.sw;
      const horizontal = side === 'N' || side === 'S';
      const a0 = horizontal ? b.x0 : b.z0, a1 = horizontal ? b.x1 : b.z1;
      for (let p = a0; p < a1 - 6; ) {
        let w = rng.range(9, zone === 'corporate' ? 30 : 20);
        if (p + w > a1) w = a1 - p;
        if (w < 7) break;
        const depth = Math.min(rng.range(11, zone === 'corporate' ? 24 : 18), (horizontal ? b.z1 - b.z0 : b.x1 - b.x0) / 2 - 1);
        let r: Rect;
        if (side === 'N') r = rect(p, b.z0 + sw, p + w, b.z0 + sw + depth);
        else if (side === 'S') r = rect(p, b.z1 - sw - depth, p + w, b.z1 - sw);
        else if (side === 'W') r = rect(b.x0 + sw, p, b.x0 + sw + depth, p + w);
        else r = rect(b.x1 - sw - depth, p, b.x1 - sw, p + w);
        const blocked = ctx.isReserved(r, 0.5) || placed.some((q) => overlapsStrict(q, r, 0.8));
        if (blocked) { p += 3; continue; }
        const floors = rng.int(zs.floors[0], zs.floors[1]);
        const style = rng.pick(zs.styles);
        genericBuilding(ctx, r, {
          floors, style, tint: rng.pick(TINTS[zone] ?? TINTS.mixed), front: side,
          shops: style !== 'glass' && rng.chance(zs.shops), zone,
          billboard: (sr.road.kind === 'arterial' || sr.road.kind === 'coastal') && floors <= 6 && rng.chance(0.25),
        });
        placed.push(r);
        ctx.reserve(r);
        p += w + (rng.chance(0.18) ? rng.range(2, 4) : 0.05);
      }
    }
    // Fill block interiors with low/mid buildings (seen from towers, FOB and trains).
    if (zone !== 'settlement') {
      for (let x = b.x0 + 14; x < b.x1 - 16; x += 18) {
        for (let z = b.z0 + 14; z < b.z1 - 16; z += 18) {
          if (!rng.chance(0.75)) continue;
          const r = rect(x, z, x + rng.range(10, 16), z + rng.range(10, 16));
          if (ctx.isReserved(r, 1.5)) continue;
          genericBuilding(ctx, r, {
            floors: rng.int(zs.floors[0], zs.floors[1] + 2), style: rng.pick(zs.styles), tint: rng.pick(TINTS[zone] ?? TINTS.mixed),
            front: rng.pick(['N', 'S', 'E', 'W'] as Arm[]), shops: false, zone,
          });
          ctx.reserve(r);
        }
      }
    }
  }
}

const overlapsStrict = (a: Rect, b: Rect, pad: number) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;

/** Dense set-dressing for the hero market street (Bazaar Gali): the visual showcase of the slice. */
function heroStreet(ctx: BuildContext) {
  const rng = ctx.rng;
  const road = ROADS.find((r) => r.id === 'bazaar')!;
  const half = roadHalfWidth(road);
  const zN = road.c - half - SIDEWALK.lane, zS = road.c + half + SIDEWALK.lane; // building lines
  const x0 = road.from + 12, x1 = road.to - 8;
  // Overhead cable bundles crossing the street (different heights, heavy sag)
  for (let x = x0; x < x1; x += rng.range(7, 13)) {
    if (isNearNodeCorner(x, road.c)) continue;
    const n = rng.int(2, 5);
    for (let k = 0; k < n; k++) {
      const y = rng.range(5.2, 7.4);
      const a = new THREE.Vector3(x + rng.range(-1.5, 1.5), y, zN + 0.3);
      const b = new THREE.Vector3(x + rng.range(-2.5, 2.5), y + rng.range(-0.6, 0.6), zS - 0.3);
      cable(ctx, a, b, rng.range(0.6, 1.5), rng.range(0.012, 0.03), rng.chance(0.8) ? '#141414' : '#3a3a3a');
    }
  }
  // Festival banners and triangular bunting across the street
  const bannerText: [string, string][] = [
    ['Sagar Nagar cha Raja', 'सागर नगरचा राजा • गणेशोत्सव'], ['Bazaar Gali Mitra Mandal', 'हार्दिक शुभेच्छा'],
    ['Navratri Utsav', 'नवरात्रि उत्सव • गरबा रात्रि'], ['Swachh Sagar Nagar', 'स्वच्छता ही सेवा'],
  ];
  for (let x = x0 + 20; x < x1 - 10; x += 55) {
    if (isNearNodeCorner(x, road.c)) continue;
    const [t, sub] = rng.pick(bannerText);
    const cell = ctx.mats.signs.add(t, sub, rng.int(0, 9));
    const w = 7.5, h = 1.4, y = 5.6;
    const g = new THREE.PlaneGeometry(w, h, 8, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w + 0.5) * Math.PI) * 0.12);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
    ctx.batch.add('signs', place(g, x, y, road.c, rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2));
    cable(ctx, new THREE.Vector3(x, y + h / 2, road.c - w / 2), new THREE.Vector3(x, y + 1.5, zN + 0.3), 0.1, 0.008, '#ddd');
    cable(ctx, new THREE.Vector3(x, y + h / 2, road.c + w / 2), new THREE.Vector3(x, y + 1.5, zS - 0.3), 0.1, 0.008, '#ddd');
  }
  for (let x = x0 + 8; x < x1; x += rng.range(14, 22)) {
    if (isNearNodeCorner(x, road.c)) continue;
    const y = rng.range(4.6, 5.4);
    const a = new THREE.Vector3(x, y, zN + 0.2), b = new THREE.Vector3(x + rng.range(-3, 3), y, zS - 0.2);
    cable(ctx, a, b, 0.7, 0.006, '#cccccc');
    const cols = rng.chance(0.5) ? ['#ff9933', '#ffffff', '#138808'] : ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00'];
    for (let k = 1; k < 18; k++) {
      const t = k / 18;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * 0.7;
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.32, 0], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
      tri.computeVertexNormals();
      ctx.batch.add('fabric', place(tri, p.x, p.y, p.z, Math.PI / 2 + rng.range(-0.3, 0.3)), C(cols[k % cols.length]));
    }
  }
  // Street-level clutter on both footpaths
  const footpath = (side: number) => (side < 0 ? road.c - half - 0.6 : road.c + half + 0.6); // near kerb
  const front = (side: number) => (side < 0 ? zN + 0.7 : zS - 0.7); // near shopfronts
  for (const side of [-1, 1]) {
    for (let x = x0; x < x1; x += rng.range(5, 11)) {
      if (isNearNodeCorner(x, road.c)) continue;
      const z = front(side);
      if (ctx.isReserved(rect(x - 0.6, z - 0.6, x + 0.6, z + 0.6))) continue;
      const r = rng.next();
      const F = new Frame(ctx, x, KERB_H, z, side < 0 ? 0 : Math.PI);
      if (r < 0.18) {
        // red LPG cylinders outside a shop
        for (let k = 0; k < rng.int(2, 5); k++) {
          F.cyl('metal', -0.6 + k * 0.38, 0, 0, 0.16, 0.6, '#b3241e', 14);
          F.cyl('metal', -0.6 + k * 0.38, 0.6, 0, 0.07, 0.1, '#888', 8);
        }
      } else if (r < 0.34) {
        // stacked plastic crates / sacks
        for (let k = 0; k < rng.int(2, 5); k++) F.box('plastic', rng.range(-0.6, 0.6), Math.floor(k / 2) * 0.3, rng.range(-0.2, 0.2), 0.5, 0.3, 0.36, { color: rng.pick(['#c0392b', '#1f5fbf', '#2f855a', '#e8b21f']) });
      } else if (r < 0.48) {
        // potted plants by the shutter
        for (let k = 0; k < 3; k++) {
          F.cyl('paint', -0.5 + k * 0.5, 0, 0, 0.2, 0.4, rng.pick(['#9c4a2a', '#b5651d']), 10, 0.25);
          F.geo('foliage', new THREE.IcosahedronGeometry(0.35, 1), -0.5 + k * 0.5, 0.75, 0, 0, rng.pick(['#3f6b2a', '#4c7a31']), 1, 1.3, 1);
        }
      } else if (r < 0.6) {
        // plastic stools & a steel water drum
        F.cyl('plastic', -0.3, 0, 0, 0.18, 0.45, '#c0392b', 10);
        F.cyl('plastic', 0.2, 0, 0.1, 0.18, 0.45, '#1f5fbf', 10);
        F.cyl('metal', 0.8, 0, -0.1, 0.3, 0.8, '#9aa0a3', 16);
        ctx.benches.push({ ...F.world(-0.3, 0.45, 0), heading: F.heading(Math.PI) });
      }
      ctx.reserve(rect(x - 0.9, z - 0.6, x + 0.9, z + 0.6));
    }
    // vegetable vendor with crates under a tarp at the kerb edge
    for (let x = x0 + 30; x < x1; x += rng.range(45, 70)) {
      const z = footpath(side) + side * 0.4;
      if (isNearNodeCorner(x, road.c) || ctx.isReserved(rect(x - 1.5, z - 1, x + 1.5, z + 1))) continue;
      const F = new Frame(ctx, x, KERB_H, z, side < 0 ? Math.PI : 0);
      for (let k = 0; k < 3; k++) {
        F.box('plastic', -1 + k * 1.0, 0, 0, 0.9, 0.35, 0.6, { color: '#2f6b3a' });
        const veg = rng.pick([['#d63b2a', '#c8331f'], ['#4e8a2c', '#3f7a22'], ['#e8c54a', '#d9b23c'], ['#7a3b8f', '#5e2b70'], ['#ff8a1e', '#f07812']]);
        for (let m = 0; m < 16; m++) F.geo('plastic', new THREE.SphereGeometry(rng.range(0.05, 0.08), 6, 5), -1 + k * 1.0 + rng.range(-0.35, 0.35), 0.4 + rng.range(0, 0.06), rng.range(-0.22, 0.22), 0, rng.pick(veg));
      }
      F.box('cloth', 0, 2.1, 0, 3.4, 0.03, 2.4, { color: rng.pick(['#1f5fbf', '#e07b1a', '#2b6fd6']), rx: 0.12 });
      for (const sx of [-1.6, 1.6]) for (const sz of [-1.1, 1.1]) F.cyl('frame', sx, 0, sz, 0.035, 2.1 + sz * 0.12, '#8a7048', 6);
      ctx.npcSpots.push({ ...F.world(0, 0, -0.9), heading: F.heading(0), role: 'vendor' });
      ctx.reserve(rect(x - 1.8, z - 1.3, x + 1.8, z + 1.3));
      F.collider(-1.5, -0.4, 1.5, 0.4, 0, 0.6);
    }
  }
  // Wooden handcarts (hath-gaadi) and a sugarcane juice cart
  for (let i = 0; i < 4; i++) {
    const x = rng.range(x0 + 10, x1 - 10), side = rng.chance(0.5) ? -1 : 1;
    const z = road.c + side * (half - 0.9);
    if (isNearNodeCorner(x, road.c)) continue;
    const F = new Frame(ctx, x, 0, z, Math.PI / 2 + rng.range(-0.2, 0.2));
    F.box('frame', 0, 0.6, 0, 1.2, 0.08, 2.4, { color: '#7a5b3a' });
    for (const sz of [-0.7, 0.7]) for (const sx of [-0.62, 0.62]) F.geo('rust', new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14), sx, 0.3, sz, 0, '#3a2a1a', 1, 1, 1, 0, Math.PI / 2);
    F.box('frame', 0, 0.68, -1.5, 0.08, 0.05, 1.0, { color: '#7a5b3a' });
    if (rng.chance(0.6)) for (let k = 0; k < 5; k++) F.geo('cloth', new THREE.CylinderGeometry(0.25, 0.3, 0.65, 10), rng.range(-0.3, 0.3), 0.98, rng.range(-0.8, 0.8), 0, '#d8c9a3', 1, 1, 1, Math.PI / 2);
    F.collider(-0.7, -1.3, 0.7, 1.3, 0, 1.2);
  }
  // Electricity transformer (DP structure) at a corner — a familiar Mumbai street object
  const tx = -150, tz = road.c - half - 2.0;
  const T = new Frame(ctx, tx, KERB_H, tz, 0);
  for (const s of [-1.1, 1.1]) T.cyl('concrete', s, 0, 0, 0.14, 8, '#9a978f', 8, 0.1);
  T.box('metal', 0, 3.2, 0, 2.6, 0.12, 0.12, { color: '#555' });
  T.box('metal', 0, 3.3, 0, 1.4, 1.3, 0.9, { color: '#6d7a6e' });
  for (let k = 0; k < 6; k++) T.box('metal', -0.5 + k * 0.2, 3.3, 0.48, 0.06, 1.1, 0.06, { color: '#4b564c' });
  for (let k = 0; k < 3; k++) T.cyl('plastic', -0.4 + k * 0.4, 4.6, 0, 0.05, 0.35, '#8b4a2b', 8);
  T.box('metal', 0, 0, 0, 3.0, 1.6, 0.05, { color: '#3d4a52' });
  const dcell = ctx.mats.signs.add('DANGER 11000 VOLTS', 'धोका • खतरा', 0);
  T.sign(0, 0.9, 0.04, 0.9, 0.5, dcell);
  T.collider(-1.4, -0.5, 1.4, 0.5, 0, 3);
  // sugarcane juice cart (ganne ka ras)
  const J = new Frame(ctx, -38, KERB_H, zS - 1.6, Math.PI);
  J.box('paint', 0, 0.7, 0, 2.0, 0.9, 1.0, { color: '#2e7d32', collide: true });
  J.box('metal', -0.5, 1.6, 0, 0.6, 0.5, 0.6, { color: '#9aa0a3' });
  J.cyl('metal', -0.5, 2.1, 0, 0.25, 0.08, '#555', 12);
  for (let k = 0; k < 10; k++) J.geo('bark', new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), 0.5 + k * 0.04, 1.6, -0.3, 0, '#a8b34a', 1, 1, 1, 0, 1.3);
  const jcell = ctx.mats.signs.add('Ganne ka Ras', 'गन्ने का रस • ₹20', 3);
  J.sign(0, 1.15, 0.51, 1.8, 0.45, jcell);
  ctx.npcSpots.push({ ...J.world(0, 0, -1.0), heading: J.heading(0), role: 'vendor' });
}

function promenade(ctx: BuildContext) {
  const x = DISTRICT.minX;
  const rng = ctx.rng;
  // sea wall + railing
  ctx.batch.add('concrete', place(uvBox(1.2, 3.5, DISTRICT.maxZ - DISTRICT.minZ, 2), x - 0.6, KERB_H - 1.75, 0), C('#bdb5a3'));
  for (let z = DISTRICT.minZ + 1; z < DISTRICT.maxZ; z += 2.5) {
    ctx.batch.add('metal', place(new THREE.BoxGeometry(0.08, 1.0, 0.08), x + 0.3, KERB_H + 0.5, z), C('#4d5a60'));
  }
  ctx.batch.add('metal', place(new THREE.BoxGeometry(0.1, 0.08, DISTRICT.maxZ - DISTRICT.minZ), x + 0.3, KERB_H + 1.0, 0), C('#4d5a60'));
  ctx.batch.add('metal', place(new THREE.BoxGeometry(0.06, 0.06, DISTRICT.maxZ - DISTRICT.minZ), x + 0.3, KERB_H + 0.55, 0), C('#4d5a60'));
  ctx.col.addBox(x - 0.5, DISTRICT.minZ, x + 0.4, DISTRICT.maxZ, -5, 3);
  // tetrapods (concrete wave breakers) along the shore
  const tetra = () => {
    const g = new THREE.BufferGeometry();
    const parts: THREE.BufferGeometry[] = [];
    const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
    for (const [dx, dy, dz] of dirs) {
      const c = new THREE.CylinderGeometry(0.22, 0.42, 1.3, 7);
      c.translate(0, 0.65, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
      c.applyQuaternion(q);
      parts.push(c);
    }
    void g;
    return parts;
  };
  for (let z = DISTRICT.minZ; z < DISTRICT.maxZ; z += 1.6) {
    for (let row = 0; row < 3; row++) {
      if (rng.chance(0.25)) continue;
      const tx = x - 2 - row * 1.8 + rng.range(-0.4, 0.4), ty = -0.9 - row * 0.5;
      for (const part of tetra()) {
        place(part, tx, ty, z + rng.range(-0.3, 0.3), rng.range(0, 6.28), 1, 1, 1, rng.range(-0.4, 0.4));
        ctx.batch.add('concrete', part, C('#a8a294'));
      }
    }
  }
  // palms, benches and lamps along the promenade
  for (let z = DISTRICT.minZ + 10; z < DISTRICT.maxZ - 10; z += 18) {
    tree(ctx, x + 3, KERB_H, z, 'palm');
    if ((z | 0) % 3 === 0 || rng.chance(0.5)) {
      const B = new Frame(ctx, x + 4.5, KERB_H, z + 8, -Math.PI / 2);
      B.box('concrete', 0, 0, 0, 2.2, 0.45, 0.6, { color: '#cfc8b8', collide: true });
      ctx.benches.push({ ...B.world(-0.5, 0.45, 0), heading: -Math.PI / 2 });
      ctx.benches.push({ ...B.world(0.5, 0.45, 0), heading: -Math.PI / 2 });
    }
  }
  for (let z = DISTRICT.minZ + 4; z < DISTRICT.maxZ; z += 30) streetLight(ctx, x + 1.2, KERB_H, z, -Math.PI / 2);
  for (let i = 0; i < 24; i++) ctx.npcSpots.push({ x: x + rng.range(1.5, 3), y: KERB_H, z: rng.range(DISTRICT.minZ + 5, DISTRICT.maxZ - 5), heading: -Math.PI / 2, role: 'seaview' });
  ctx.anchors.set('promenade', { x: x + 6, y: KERB_H, z: -30, heading: -Math.PI / 2 });
}

function boundary(ctx: BuildContext) {
  // Construction hoardings across both district edges (north & south).
  for (const zSign of [-1, 1]) {
    const z = zSign * BOUNDARY_Z;
    hoarding(ctx, DISTRICT.minX + 0.5, z, RAIL.corridorX0 - 0.4, z, KERB_H);
    // cranes and half-built metro pier visible behind hoarding
    for (const px of [-120, 60]) {
      const pz = z + zSign * 14;
      ctx.batch.add('concrete', place(new THREE.BoxGeometry(2.5, 11, 2.5), px, 5.5, pz), C('#a9a397'));
      ctx.batch.add('concrete', place(new THREE.BoxGeometry(9, 1.6, 3), px, 11.5, pz), C('#a9a397'));
    }
    const kx = -40;
    ctx.batch.add('metal', place(new THREE.BoxGeometry(1.2, 32, 1.2), kx, 16, z + zSign * 22), C('#e6b422'));
    ctx.batch.add('metal', place(new THREE.BoxGeometry(28, 1.0, 1.0), kx + 8, 32, z + zSign * 22), C('#e6b422'));
  }
}

function skyline(ctx: BuildContext) {
  const rng = makeRng(99);
  const styles = ['facade_apartment', 'facade_modern', 'facade_glass', 'facade_apartment_b', 'facade_modern_b', 'facade_chawl', 'facade_glass_b'];
  const tints = ['#efe3c8', '#e6ded0', '#ffffff', '#dfe7ea', '#f2d7a8', '#e3ecf0'];
  const placeB = (x: number, z: number, w: number, d: number, h: number) => {
    const g = uvBox(w, h, d, 14, 9.3, 0, { py: false, ny: false });
    ctx.batch.add(rng.pick(styles), place(g, x, h / 2, z), C(rng.pick(tints)));
    ctx.batch.add('concrete_dark', place(new THREE.BoxGeometry(w, 0.4, d), x, h + 0.2, z));
  };
  // north & south of the district (behind hoardings): density + towers rising with distance
  for (const zSign of [-1, 1]) {
    for (let zz = 285; zz < 900; zz += rng.range(22, 34)) {
      for (let x = -250; x < 185; x += rng.range(18, 30)) {
        const dist = zz - 260;
        const tall = rng.chance(Math.min(0.5, dist / 900));
        const h = tall ? rng.range(45, 140) : rng.range(10, 30);
        placeB(x, zSign * zz, rng.range(12, 22), rng.range(12, 22), h);
      }
    }
  }
  // east beyond the railway
  for (let z = -900; z < 900; z += rng.range(24, 36)) {
    for (let x = 300; x < 700; x += rng.range(26, 40)) {
      const h = rng.chance(0.3) ? rng.range(50, 150) : rng.range(12, 35);
      placeB(x, z, rng.range(14, 24), rng.range(14, 24), h);
    }
  }
  // far coastline across the bay
  for (let z = -2600; z < 2600; z += rng.range(30, 60)) {
    const h = rng.chance(0.4) ? rng.range(60, 200) : rng.range(15, 45);
    placeB(-2400 - rng.range(0, 200), z, rng.range(25, 50), rng.range(25, 50), h);
  }
  // Cable-stayed sea bridge offshore
  const bx = -900;
  ctx.batch.add('concrete', place(new THREE.BoxGeometry(24, 1.6, 3200), bx, 14, -200), C('#bfb9ad'));
  for (let z = -1700; z < 1300; z += 60) ctx.batch.add('concrete', place(new THREE.BoxGeometry(5, 14, 4), bx, 7, z), C('#a6a092'));
  for (const pz of [-500, 100]) {
    ctx.batch.add('concrete', place(new THREE.BoxGeometry(4, 120, 6), bx - 6, 60, pz, 0, 1, 1, 1, 0, 0.05), C('#c8c2b6'));
    ctx.batch.add('concrete', place(new THREE.BoxGeometry(4, 120, 6), bx + 6, 60, pz, 0, 1, 1, 1, 0, -0.05), C('#c8c2b6'));
    for (let k = 1; k <= 12; k++) {
      for (const dir of [-1, 1]) {
        const top = new THREE.Vector3(bx, 110 - k * 3.5, pz);
        const deck = new THREE.Vector3(bx, 15, pz + dir * k * 22);
        cable(ctx, top, deck, 0.01, 0.15, '#e8e4dc');
      }
    }
  }
}

function makeSea(): THREE.Mesh {
  const S = 256;
  const rng = makeRng(77);
  // tileable wave height field -> normal map
  const hf = new Float32Array(S * S);
  for (let o = 0; o < 4; o++) {
    const f = 2 ** (o + 1), amp = 1 / (o + 1);
    const phx = rng.range(0, 6.28), phz = rng.range(0, 6.28);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      hf[y * S + x] += amp * (Math.sin(((x / S) * f + (y / S) * (f - 1)) * Math.PI * 2 + phx) + Math.sin(((y / S) * f - (x / S)) * Math.PI * 2 + phz));
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = hf[y * S + ((x + S - 1) % S)], r = hf[y * S + ((x + 1) % S)], u = hf[((y + S - 1) % S) * S + x], d = hf[((y + 1) % S) * S + x];
    let nx = (l - r) * 1.2, ny = (u - d) * 1.2, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const i = (y * S + x) * 4;
    data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const normal = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(300, 300);
  normal.generateMipmaps = true;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.magFilter = THREE.LinearFilter;
  normal.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a4c, roughness: 0.12, metalness: 0.1, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2 });
  const g = new THREE.PlaneGeometry(6000, 6000);
  g.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(g, mat);
  sea.position.set(DISTRICT.minX - 3000, -1.2, 0);
  sea.receiveShadow = true;
  sea.name = 'sea';
  return sea;
}

export function updateSea(sea: THREE.Mesh, t: number) {
  const m = sea.material as THREE.MeshStandardMaterial;
  if (m.normalMap) m.normalMap.offset.set(t * 0.004, t * 0.0025);
}

export { isOnRoad };
