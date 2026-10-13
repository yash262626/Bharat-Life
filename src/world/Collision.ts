// Lightweight collision world: axis-aligned box colliders with height ranges and layered
// walkable surfaces (kerbs, platforms, stairs, bridges). Pure logic, unit-testable.

export interface Collider { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; tag?: string }

export interface Surface {
  x0: number; z0: number; x1: number; z1: number;
  /** Constant height, or a ramp along an axis from h0 (at min coord) to h1 (at max coord). */
  h: number;
  ramp?: { axis: 'x' | 'z'; h0: number; h1: number };
  tag?: string;
}

const CELL = 16;
const key = (cx: number, cz: number) => cx * 73856093 ^ cz * 19349663;

class Grid<T extends { x0: number; z0: number; x1: number; z1: number }> {
  cells = new Map<number, T[]>();
  all: T[] = [];
  add(item: T) {
    this.all.push(item);
    const cx0 = Math.floor(item.x0 / CELL), cx1 = Math.floor(item.x1 / CELL);
    const cz0 = Math.floor(item.z0 / CELL), cz1 = Math.floor(item.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = key(cx, cz);
      let l = this.cells.get(k);
      if (!l) this.cells.set(k, (l = []));
      l.push(item);
    }
  }
  query(x: number, z: number, r: number, out: Set<T>) {
    out.clear();
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const l = this.cells.get(key(cx, cz));
      if (l) for (const it of l) out.add(it);
    }
    return out;
  }
}

export class CollisionWorld {
  private colliders = new Grid<Collider>();
  private surfaces = new Grid<Surface>();
  private tmpC = new Set<Collider>();
  private tmpS = new Set<Surface>();
  /** Default ground height when no surface is found. */
  baseHeight = 0;

  addBox(x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 100, tag?: string) {
    this.colliders.add({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, tag });
  }

  /** Thin wall segment along an axis-aligned line, thickness t. */
  addWall(ax: number, az: number, bx: number, bz: number, t = 0.3, y0 = 0, y1 = 3, tag?: string) {
    this.addBox(Math.min(ax, bx) - t / 2, Math.min(az, bz) - t / 2, Math.max(ax, bx) + t / 2, Math.max(az, bz) + t / 2, y0, y1, tag);
  }

  addSurface(s: Surface) { this.surfaces.add({ ...s, x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) }); }

  get colliderCount() { return this.colliders.all.length; }

  surfaceHeight(s: Surface, x: number, z: number) {
    if (!s.ramp) return s.h;
    const t = s.ramp.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
    return s.ramp.h0 + (s.ramp.h1 - s.ramp.h0) * Math.min(1, Math.max(0, t));
  }

  /**
   * Height of the walkable surface under (x,z) for an agent currently at height y:
   * the highest surface not more than `step` above y.
   */
  groundHeight(x: number, z: number, y: number, step = 0.45): number {
    let best = this.baseHeight;
    for (const s of this.surfaces.query(x, z, 0, this.tmpS)) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const h = this.surfaceHeight(s, x, z);
      if (h <= y + step && h > best) best = h;
    }
    return best;
  }

  /** Surface tag at a point (used for footstep audio / pedestrians). */
  surfaceTag(x: number, z: number, y: number): string | undefined {
    let best = -Infinity, tag: string | undefined;
    for (const s of this.surfaces.query(x, z, 0, this.tmpS)) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const h = this.surfaceHeight(s, x, z);
      if (h <= y + 0.45 && h > best) { best = h; tag = s.tag; }
    }
    return tag;
  }

  /**
   * Resolve a circle (agent footprint) against colliders overlapping vertical span [y, y+height].
   * Returns the corrected position and whether any contact happened, plus the contact normal.
   */
  resolveCircle(x: number, z: number, r: number, y: number, height: number, out = { x: 0, z: 0, hit: false, nx: 0, nz: 0, tag: '' as string | undefined }, ignoreTag?: string) {
    out.x = x; out.z = z; out.hit = false; out.nx = 0; out.nz = 0; out.tag = undefined;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.colliders.query(out.x, out.z, r + 0.5, this.tmpC)) {
        if (y + height <= c.y0 || y >= c.y1 - 0.05) continue;
        if (ignoreTag && c.tag === ignoreTag) continue;
        const cx = Math.max(c.x0, Math.min(out.x, c.x1));
        const cz = Math.max(c.z0, Math.min(out.z, c.z1));
        let dx = out.x - cx, dz = out.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          // center inside box: push out along the shortest axis
          const pl = out.x - c.x0, pr = c.x1 - out.x, pt = out.z - c.z0, pb = c.z1 - out.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) { dx = -1; dz = 0; d = pl; out.x = c.x0 - r; }
          else if (m === pr) { dx = 1; dz = 0; d = pr; out.x = c.x1 + r; }
          else if (m === pt) { dx = 0; dz = -1; d = pt; out.z = c.z0 - r; }
          else { dx = 0; dz = 1; d = pb; out.z = c.z1 + r; }
          out.nx = dx; out.nz = dz;
        } else {
          const push = r - d;
          out.x += (dx / d) * push;
          out.z += (dz / d) * push;
          out.nx = dx / d; out.nz = dz / d;
        }
        out.hit = true;
        out.tag = c.tag;
        moved = true;
      }
      if (!moved) break;
    }
    return out;
  }

  /** Ray-march test used by the camera to avoid clipping into buildings. Returns hit distance or Infinity. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number): number {
    const steps = Math.ceil(maxD / 0.25);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxD;
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      for (const c of this.colliders.query(x, z, 0, this.tmpC)) {
        if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y > c.y0 && y < c.y1) return t;
      }
    }
    return Infinity;
  }

  /** True if a point is inside any collider (used to validate spawn points). */
  blocked(x: number, z: number, y = 0.2, r = 0.3) {
    return this.resolveCircle(x, z, r, y, 1.6).hit;
  }
}
