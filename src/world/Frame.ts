// Local coordinate frame (position + 90-degree-multiple yaw) for authoring oriented structures.
// Local +z points "out" of the structure's front towards the street.
import * as THREE from 'three';
import { BuildContext } from './BuildContext';
import { uvBox, place, signQuad } from './geom';
import { Arm } from './layout';

export const facingAngle = (f: Arm) => (f === 'S' ? 0 : f === 'N' ? Math.PI : f === 'E' ? Math.PI / 2 : -Math.PI / 2);

export interface BoxOpts {
  color?: THREE.Color | string | number;
  tile?: number;
  tileV?: number;
  vOffset?: number;
  collide?: boolean;
  ry?: number;
  rx?: number;
  rz?: number;
  faces?: Parameters<typeof uvBox>[6];
}

export class Frame {
  readonly cos: number;
  readonly sin: number;
  constructor(public ctx: BuildContext, public x: number, public y: number, public z: number, public a: number) {
    this.cos = Math.round(Math.cos(a) * 1e6) / 1e6;
    this.sin = Math.round(Math.sin(a) * 1e6) / 1e6;
  }

  static facing(ctx: BuildContext, x: number, y: number, z: number, f: Arm) { return new Frame(ctx, x, y, z, facingAngle(f)); }

  p(lx: number, lz: number): [number, number] {
    return [this.x + lx * this.cos + lz * this.sin, this.z - lx * this.sin + lz * this.cos];
  }

  /** Box with bottom at local y=ly (relative to frame y), centred at (lx, lz). */
  box(key: string, lx: number, ly: number, lz: number, w: number, h: number, d: number, o: BoxOpts = {}) {
    const g = uvBox(w, h, d, o.tile ?? 1, o.tileV ?? o.tile ?? 1, o.vOffset ?? 0, o.faces ?? {});
    const [wx, wz] = this.p(lx, lz);
    place(g, wx, this.y + ly + h / 2, wz, this.a + (o.ry ?? 0), 1, 1, 1, o.rx ?? 0, o.rz ?? 0);
    this.ctx.batch.add(key, g, o.color !== undefined ? new THREE.Color(o.color as any) : undefined);
    if (o.collide) this.collider(lx - w / 2, lz - d / 2, lx + w / 2, lz + d / 2, ly, ly + h);
  }

  geo(key: string, g: THREE.BufferGeometry, lx: number, ly: number, lz: number, ry = 0, color?: THREE.Color | string | number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    const [wx, wz] = this.p(lx, lz);
    place(g, wx, this.y + ly, wz, this.a + ry, sx, sy, sz, rx, rz);
    this.ctx.batch.add(key, g, color !== undefined ? new THREE.Color(color as any) : undefined);
  }

  cyl(key: string, lx: number, ly: number, lz: number, r: number, h: number, color?: THREE.Color | string | number, seg = 12, rTop = r) {
    this.geo(key, new THREE.CylinderGeometry(rTop, r, h, seg), lx, ly + h / 2, lz, 0, color);
  }

  sign(lx: number, ly: number, lz: number, w: number, h: number, cell: { u0: number; v0: number; u1: number; v1: number }, ry = 0) {
    this.geo('signs', signQuad(w, h, cell.u0, cell.v0, cell.u1, cell.v1), lx, ly + h / 2, lz, ry);
  }

  /** Retail product box mapped to a random packaging-atlas cell. */
  product(lx: number, ly: number, lz: number, w: number, h: number, d: number, cell: number) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const n = 8, cx = cell % n, cy = Math.floor(cell / n) % n;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + 0.04 + uv.getX(i) * 0.92) / n, (cy + 0.04 + uv.getY(i) * 0.92) / n);
    const [wx, wz] = this.p(lx, lz);
    place(g, wx, this.y + ly + h / 2, wz, this.a);
    this.ctx.batch.add('goods', g);
  }

  /** Axis-aligned collider from a local rect (valid because yaw is a multiple of 90 degrees). */
  collider(lx0: number, lz0: number, lx1: number, lz1: number, y0: number, y1: number, tag?: string) {
    const [ax, az] = this.p(lx0, lz0);
    const [bx, bz] = this.p(lx1, lz1);
    this.ctx.col.addBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this.y + y0, this.y + y1, tag);
  }

  surface(lx0: number, lz0: number, lx1: number, lz1: number, h: number, tag?: string) {
    const [ax, az] = this.p(lx0, lz0);
    const [bx, bz] = this.p(lx1, lz1);
    this.ctx.col.addSurface({ x0: ax, z0: az, x1: bx, z1: bz, h: this.y + h, tag });
  }

  world(lx: number, ly: number, lz: number) {
    const [x, z] = this.p(lx, lz);
    return { x, y: this.y + ly, z };
  }

  /** World heading (yaw) for something facing local direction angle `la` (0 = local +z). */
  heading(la = 0) { return this.a + la; }
}
