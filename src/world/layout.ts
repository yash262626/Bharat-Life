// District plan for "Sagar Nagar", a fictional Mumbai-inspired neighbourhood.
// Pure data + geometry helpers (no Three.js) shared by the renderer, traffic AI, pedestrians,
// collision and minimap. Coordinates are metres: +x = east, +z = south, north = -z.

export interface RoadDef {
  id: string;
  name: string;
  nameHi: string;
  axis: 'x' | 'z'; // direction the road runs along
  c: number; // fixed coordinate across the road
  from: number;
  to: number;
  lanes: number; // lanes per direction
  laneW: number;
  median: number;
  speed: number; // km/h
  /** Kerb-side parking strip width on each side (two-wheelers / cars), outside the traffic lanes. */
  parking?: number;
  kind: 'arterial' | 'street' | 'lane' | 'coastal';
}

export const DISTRICT = { minX: -262, maxX: 194, minZ: -260, maxZ: 260 };
/** Construction hoardings close the district roads here (diegetic boundary: "Metro work in progress"). */
export const BOUNDARY_Z = 255;

export const ROADS: RoadDef[] = [
  { id: 'coastal', name: 'Sagar Setu Marg', nameHi: 'सागर सेतु मार्ग', axis: 'z', c: -232, from: -252, to: 252, lanes: 2, laneW: 3.5, median: 2, speed: 60, kind: 'coastal' },
  { id: 'tilak', name: 'Tilak Marg', nameHi: 'तिलक मार्ग', axis: 'x', c: 0, from: -232, to: 150, lanes: 2, laneW: 3.4, median: 1.2, speed: 50, kind: 'arterial' },
  { id: 'nehru', name: 'Nehru Road', nameHi: 'नेहरू रोड', axis: 'z', c: 0, from: -252, to: 252, lanes: 2, laneW: 3.3, median: 0, speed: 40, kind: 'arterial' },
  { id: 'bazaar', name: 'Bazaar Gali', nameHi: 'बाज़ार गली', axis: 'x', c: -100, from: -232, to: 150, lanes: 1, laneW: 3.1, median: 0, speed: 20, parking: 1.8, kind: 'lane' },
  { id: 'gokhale', name: 'Gokhale Road', nameHi: 'गोखले रोड', axis: 'x', c: 110, from: -232, to: 150, lanes: 1, laneW: 3.4, median: 0, speed: 30, parking: 2.0, kind: 'street' },
  { id: 'station', name: 'Station Road', nameHi: 'स्टेशन रोड', axis: 'z', c: 150, from: -100, to: 110, lanes: 1, laneW: 3.5, median: 0, speed: 25, kind: 'street' },
];

export const roadHalfWidth = (r: RoadDef) => (r.lanes * 2 * r.laneW + r.median) / 2 + (r.parking ?? 0);

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1),
});
export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
export const rectsOverlap = (a: Rect, b: Rect, pad = 0) =>
  a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
export const rectCenter = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

export function roadRect(r: RoadDef): Rect {
  const h = roadHalfWidth(r);
  return r.axis === 'x' ? rect(r.from, r.c - h, r.to, r.c + h) : rect(r.c - h, r.from, r.c + h, r.to);
}

export type Arm = 'N' | 'S' | 'E' | 'W';
export interface NodeDef {
  id: string;
  x: number;
  z: number;
  roads: string[];
  arms: Partial<Record<Arm, string>>; // arm -> road id
  hx: number; // half extents of the junction box
  hz: number;
  boundary: boolean; // road end at the district edge (traffic source/sink)
  signal: boolean;
}

const EPS = 0.01;

/** Junctions where roads meet, plus boundary end points. */
export function computeNodes(roads: RoadDef[] = ROADS): NodeDef[] {
  const nodes: NodeDef[] = [];
  const find = (x: number, z: number) => nodes.find((n) => Math.abs(n.x - x) < EPS && Math.abs(n.z - z) < EPS);
  const xs = roads.filter((r) => r.axis === 'x');
  const zs = roads.filter((r) => r.axis === 'z');
  for (const a of xs) {
    for (const b of zs) {
      const x = b.c, z = a.c;
      if (x < a.from - EPS || x > a.to + EPS || z < b.from - EPS || z > b.to + EPS) continue;
      const arms: Partial<Record<Arm, string>> = {};
      if (x > a.from + EPS) arms.W = a.id;
      if (x < a.to - EPS) arms.E = a.id;
      if (z > b.from + EPS) arms.N = b.id;
      if (z < b.to - EPS) arms.S = b.id;
      const n: NodeDef = {
        id: `${a.id}_${b.id}`, x, z, roads: [a.id, b.id], arms,
        hx: roadHalfWidth(b), hz: roadHalfWidth(a), boundary: false,
        signal: Object.keys(arms).length >= 3,
      };
      nodes.push(n);
    }
  }
  // Boundary end points (road ends that are not junctions).
  for (const r of roads) {
    for (const end of [r.from, r.to]) {
      const x = r.axis === 'x' ? end : r.c;
      const z = r.axis === 'x' ? r.c : end;
      if (find(x, z)) continue;
      const arms: Partial<Record<Arm, string>> = {};
      if (r.axis === 'z') arms[end === r.from ? 'S' : 'N'] = r.id;
      else arms[end === r.from ? 'E' : 'W'] = r.id;
      nodes.push({ id: `${r.id}_end_${end}`, x, z, roads: [r.id], arms, hx: 0, hz: 0, boundary: true, signal: false });
    }
  }
  return nodes;
}

export function nodeRect(n: NodeDef): Rect {
  return rect(n.x - n.hx, n.z - n.hz, n.x + n.hx, n.z + n.hz);
}

/** Every carriageway rectangle (roads + junction boxes). */
export function carriageways(roads: RoadDef[] = ROADS): Rect[] {
  const out = roads.map(roadRect);
  for (const n of computeNodes(roads)) if (!n.boundary) out.push(nodeRect(n));
  return out;
}

export function isOnRoad(x: number, z: number, pad = 0, cw: Rect[] = CARRIAGEWAYS) {
  for (const r of cw) if (inRect(r, x, z, pad)) return true;
  return false;
}

/**
 * City blocks: the complement of carriageways inside the district, merged into rectangles.
 * Blocks are raised 15 cm (kerb height); their margins act as footpaths.
 */
export function computeBlocks(roads: RoadDef[] = ROADS): Rect[] {
  const cw = carriageways(roads);
  const xsSet = new Set<number>([DISTRICT.minX, DISTRICT.maxX]);
  const zsSet = new Set<number>([DISTRICT.minZ, DISTRICT.maxZ]);
  for (const r of cw) {
    if (r.x0 > DISTRICT.minX && r.x0 < DISTRICT.maxX) xsSet.add(round(r.x0));
    if (r.x1 > DISTRICT.minX && r.x1 < DISTRICT.maxX) xsSet.add(round(r.x1));
    if (r.z0 > DISTRICT.minZ && r.z0 < DISTRICT.maxZ) zsSet.add(round(r.z0));
    if (r.z1 > DISTRICT.minZ && r.z1 < DISTRICT.maxZ) zsSet.add(round(r.z1));
  }
  const xs = [...xsSet].sort((a, b) => a - b);
  const zs = [...zsSet].sort((a, b) => a - b);
  const nx = xs.length - 1, nz = zs.length - 1;
  const isBlock: boolean[][] = [];
  for (let j = 0; j < nz; j++) {
    isBlock[j] = [];
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      isBlock[j][i] = !cw.some((r) => inRect(r, cx, cz));
    }
  }
  const used: boolean[][] = isBlock.map((row) => row.map(() => false));
  const blocks: Rect[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!isBlock[j][i] || used[j][i]) continue;
      let i1 = i;
      while (i1 + 1 < nx && isBlock[j][i1 + 1] && !used[j][i1 + 1]) i1++;
      let j1 = j;
      outer: while (j1 + 1 < nz) {
        for (let k = i; k <= i1; k++) if (!isBlock[j1 + 1][k] || used[j1 + 1][k]) break outer;
        j1++;
      }
      for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj][k] = true;
      blocks.push(rect(xs[i], zs[j], xs[i1 + 1], zs[j1 + 1]));
    }
  }
  return blocks;
}

const round = (v: number) => Math.round(v * 100) / 100;

export const NODES = computeNodes();
export const CARRIAGEWAYS = carriageways();
export const BLOCKS = computeBlocks();

// ---------------------------------------------------------------------------------------------
// Railway (Western-line inspired suburban corridor running north-south).
export const RAIL = {
  westTrackX: 203,
  eastTrackX: 209,
  gauge: 1.676,
  platformH: 0.9,
  p1: { x0: 194, x1: 201.3 },
  p2: { x0: 210.9, x1: 217.6 },
  corridorX0: 194,
  corridorX1: 224,
  northEnd: -1480,
  southEnd: 780,
  platformHalfLen: 78,
};

export interface StationDef { id: string; name: string; nameHi: string; nameMr: string; z: number; home: boolean }
export const STATIONS: StationDef[] = [
  { id: 'chandni', name: 'Chandni Bandar', nameHi: 'चांदनी बंदर', nameMr: 'चांदणी बंदर', z: -1400, home: false },
  { id: 'navrang', name: 'Navrang Road', nameHi: 'नवरंग रोड', nameMr: 'नवरंग रोड', z: -700, home: false },
  { id: 'sagar', name: 'Sagar Nagar', nameHi: 'सागर नगर', nameMr: 'सागर नगर', z: 0, home: true },
  { id: 'sahyadri', name: 'Sahyadri Park', nameHi: 'सह्याद्री पार्क', nameMr: 'सह्याद्री पार्क', z: 700, home: false },
];

// ---------------------------------------------------------------------------------------------
// Landmarks: hand-placed buildings and gameplay locations. Generic buildings avoid these rects.
export type LandmarkKind =
  | 'station' | 'petrol' | 'garage' | 'showroom' | 'office' | 'chawl' | 'temple' | 'park'
  | 'maidan' | 'hospital' | 'police' | 'bank' | 'mall' | 'cinema' | 'school' | 'apartments' | 'settlement' | 'busdepot';

export interface Landmark { id: string; kind: LandmarkKind; name: string; nameHi: string; r: Rect; floors?: number }

export const LANDMARKS: Landmark[] = [
  { id: 'station_bldg', kind: 'station', name: 'Sagar Nagar Station', nameHi: 'सागर नगर स्टेशन', r: rect(156, -24, 194, 24) },
  { id: 'petrol', kind: 'petrol', name: 'Sagar Fuels', nameHi: 'सागर फ़्यूल्स', r: rect(-222, 9.5, -186, 46) },
  { id: 'garage', kind: 'garage', name: 'Sharma Auto Works', nameHi: 'शर्मा ऑटो वर्क्स', r: rect(-150, 70, -118, 101) },
  { id: 'showroom', kind: 'showroom', name: 'Rajhans Motors', nameHi: 'राजहंस मोटर्स', r: rect(60, -40, 100, -9.5) },
  { id: 'office', kind: 'office', name: 'Infinity Tower', nameHi: 'इन्फ़िनिटी टावर', r: rect(10.5, -182, 52, -140), floors: 24 },
  { id: 'chawl', kind: 'chawl', name: 'Shanti Niwas Chawl', nameHi: 'शांति निवास चाल', r: rect(-110, 118.8, -50, 136), floors: 4 },
  { id: 'temple', kind: 'temple', name: 'Shree Ganesh Mandir', nameHi: 'श्री गणेश मंदिर', r: rect(-40, -134, -12, -108.2) },
  { id: 'park', kind: 'park', name: 'Nana-Nani Park', nameHi: 'नाना-नानी पार्क', r: rect(-150, -200, -70, -140) },
  { id: 'maidan', kind: 'maidan', name: 'Shivaji Maidan', nameHi: 'शिवाजी मैदान', r: rect(-205, 150, -90, 245) },
  { id: 'hospital', kind: 'hospital', name: 'Lifeline Hospital', nameHi: 'लाइफ़लाइन अस्पताल', r: rect(95, 40, 140, 80), floors: 6 },
  { id: 'police', kind: 'police', name: 'Sagar Nagar Police Chowki', nameHi: 'पुलिस चौकी', r: rect(10, 9.5, 28, 24) },
  { id: 'mall', kind: 'mall', name: 'Sagar Central Mall', nameHi: 'सागर सेंट्रल मॉल', r: rect(95, -230, 185, -150), floors: 5 },
  { id: 'school', kind: 'school', name: 'Vidya Mandir School', nameHi: 'विद्या मंदिर स्कूल', r: rect(-70, 150, -12, 200), floors: 3 },
  { id: 'settlement', kind: 'settlement', name: 'Ambedkar Nagar', nameHi: 'आंबेडकर नगर', r: rect(110, 122, 190, 250) },
  { id: 'busdepot', kind: 'busdepot', name: 'MBT Bus Depot', nameHi: 'बस डिपो', r: rect(156, 40, 192, 104) },
  { id: 'towers', kind: 'apartments', name: 'Sea Breeze Towers', nameHi: 'सी ब्रीज़ टावर्स', r: rect(-215, -235, -165, -190), floors: 16 },
];

export const landmark = (id: string) => {
  const l = LANDMARKS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown landmark ${id}`);
  return l;
};

/** Character of each block: drives generic building style, density and crowds. */
export type Zone = 'market' | 'residential' | 'chawl' | 'corporate' | 'station' | 'promenade' | 'mixed' | 'settlement';
export function zoneAt(x: number, z: number): Zone {
  if (x < -240) return 'promenade';
  if (x > 153) return 'station';
  if (z > -103 && z < -90) return 'market';
  if (z < -103) return x > 0 ? 'corporate' : 'residential';
  if (z > 113) return x > 100 ? 'settlement' : 'chawl';
  if (z < 0) return 'market';
  return 'mixed';
}

export interface BusStop { id: string; name: string; road: string; x: number; z: number; dir: Arm }
/** Bus stops placed on the left kerb (left-hand traffic). dir = travel direction of the served lane. */
export const BUS_STOPS: BusStop[] = [
  { id: 'bs_tilak_e', name: 'Tilak Marg (Station-bound)', road: 'tilak', x: 60, z: -9.5, dir: 'E' },
  { id: 'bs_tilak_w', name: 'Tilak Marg (Sea-bound)', road: 'tilak', x: -60, z: 9.5, dir: 'W' },
  { id: 'bs_coastal_s', name: 'Sea Face', road: 'coastal', x: -219.5, z: -50, dir: 'S' },
  { id: 'bs_gokhale', name: 'Gokhale Road', road: 'gokhale', x: -40, z: 117.6, dir: 'W' },
];

export const PLAYER_SPAWN = { x: 197.5, z: 10, heading: -Math.PI / 2 };
