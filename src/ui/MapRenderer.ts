// Pre-rendered district map used by the minimap and the full-screen map.
import { BLOCKS, CARRIAGEWAYS, LANDMARKS, DISTRICT, RAIL, ROADS, STATIONS, roadHalfWidth } from '../world/layout';
import { SHOPS } from '../config/shops';

export const MAP_SCALE = 2; // pixels per metre
export const MAP_BOUNDS = { minX: DISTRICT.minX - 40, maxX: RAIL.corridorX1 + 30, minZ: DISTRICT.minZ - 20, maxZ: DISTRICT.maxZ + 20 };

export interface Poi { x: number; z: number; icon: string; label: string }

export const POIS: Poi[] = [
  ...SHOPS.map((s) => ({ x: s.x, z: s.z, icon: iconFor(s.kind), label: s.name })),
  { x: 175, z: 0, icon: '🚉', label: 'Sagar Nagar Station' },
];

function iconFor(kind: string) {
  return ({ tea: '☕', street_food: '🍔', kirana: '🛒', restaurant: '🍛', cafe: '☕', clothing: '👕', electronics: '📱', pharmacy: '💊', bank: '🏧', barber: '💈', gym: '🏋', fuel: '⛽', garage: '🔧', showroom: '🚗', tickets: '🎫', fruit: '🍌', realestate: '🏠', hospital: '🏥', mall: '🛍' } as Record<string, string>)[kind] ?? '•';
}

export function renderDistrictMap(): HTMLCanvasElement {
  const W = Math.ceil((MAP_BOUNDS.maxX - MAP_BOUNDS.minX) * MAP_SCALE);
  const H = Math.ceil((MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) * MAP_SCALE);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const X = (x: number) => (x - MAP_BOUNDS.minX) * MAP_SCALE;
  const Z = (z: number) => (z - MAP_BOUNDS.minZ) * MAP_SCALE;
  g.fillStyle = '#1e2a33'; // sea
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a2d31';
  g.fillRect(X(DISTRICT.minX), 0, W, H);
  // blocks
  for (const b of BLOCKS) {
    g.fillStyle = '#3a3e44';
    g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * MAP_SCALE, (b.z1 - b.z0) * MAP_SCALE);
  }
  for (const l of LANDMARKS) {
    g.fillStyle = l.kind === 'park' || l.kind === 'maidan' ? '#3f5a3a' : l.kind === 'station' ? '#5a4a3a' : '#474c54';
    g.fillRect(X(l.r.x0), Z(l.r.z0), (l.r.x1 - l.r.x0) * MAP_SCALE, (l.r.z1 - l.r.z0) * MAP_SCALE);
  }
  // roads
  for (const r of CARRIAGEWAYS) {
    g.fillStyle = '#c9c4b8';
    g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * MAP_SCALE, (r.z1 - r.z0) * MAP_SCALE);
  }
  // rail
  g.fillStyle = '#6d5a48';
  g.fillRect(X(RAIL.corridorX0), 0, (RAIL.corridorX1 - RAIL.corridorX0) * MAP_SCALE, H);
  g.strokeStyle = '#2b2b2b';
  g.lineWidth = 2;
  for (const tx of [RAIL.westTrackX, RAIL.eastTrackX]) { g.beginPath(); g.moveTo(X(tx), 0); g.lineTo(X(tx), H); g.stroke(); }
  for (const s of STATIONS) {
    g.fillStyle = '#d8cfbf';
    g.fillRect(X(RAIL.p1.x0), Z(s.z - RAIL.platformHalfLen), (RAIL.p1.x1 - RAIL.p1.x0) * MAP_SCALE, RAIL.platformHalfLen * 2 * MAP_SCALE);
    g.fillRect(X(RAIL.p2.x0), Z(s.z - RAIL.platformHalfLen), (RAIL.p2.x1 - RAIL.p2.x0) * MAP_SCALE, RAIL.platformHalfLen * 2 * MAP_SCALE);
  }
  // road names
  g.fillStyle = '#2b2b2b';
  g.font = `bold ${10 * MAP_SCALE}px Inter, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of ROADS) {
    const mid = (r.from + r.to) / 2 + 30;
    g.save();
    if (r.axis === 'x') { g.translate(X(mid), Z(r.c)); }
    else { g.translate(X(r.c), Z(mid)); g.rotate(-Math.PI / 2); }
    if (roadHalfWidth(r) > 3) g.fillText(r.name.toUpperCase(), 0, 0);
    g.restore();
  }
  return c;
}

export function worldToMap(x: number, z: number) {
  return { u: (x - MAP_BOUNDS.minX) * MAP_SCALE, v: (z - MAP_BOUNDS.minZ) * MAP_SCALE };
}
