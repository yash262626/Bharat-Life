// Geometry helpers: world-space UV boxes, batching of static geometry per material into merged meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Box with UVs in world metres divided by `tile` (so textures tile consistently regardless of size).
 * Side faces: u = horizontal metres / tileU, v = (y + vOffset) / tileV. Top/bottom: x/z metres / tileU.
 */
export function uvBox(w: number, h: number, d: number, tileU = 1, tileV = tileU, vOffset = 0, faces: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', boolean>> = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    let u = 0, v = 0;
    if (Math.abs(ny) > 0.5) { u = (x + w / 2) / tileU; v = (z + d / 2) / tileU; }
    else if (Math.abs(nx) > 0.5) { u = (nx > 0 ? (d / 2 - z) : (z + d / 2)) / tileU; v = (y + h / 2 + vOffset) / tileV; }
    else { u = (nz > 0 ? (x + w / 2) : (w / 2 - x)) / tileU; v = (y + h / 2 + vOffset) / tileV; }
    uv.setXY(i, u, v);
  }
  // Optionally remove faces (BoxGeometry groups order: px, nx, py, ny, pz, nz)
  const keys = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
  if (Object.keys(faces).length) {
    const idx = g.index!;
    const keep: number[] = [];
    keys.forEach((k, fi) => {
      if (faces[k] === false) return;
      for (let j = 0; j < 6; j++) keep.push(idx.getX(fi * 6 + j));
    });
    g.setIndex(keep);
  }
  g.clearGroups();
  return g;
}

/** Horizontal quad on XZ with world-space UVs. */
export function uvPlane(w: number, d: number, tile = 1) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / tile, (pos.getZ(i) + d / 2) / tile);
  return g;
}

/** Vertical quad facing +z with custom UV rect (used for signs). */
export function signQuad(w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  return g;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  tmpE.set(rx, ry, rz);
  tmpQ.setFromEuler(tmpE);
  tmpS.set(sx, sy, sz);
  tmpP.set(x, y, z);
  tmpM.compose(tmpP, tmpQ, tmpS);
  g.applyMatrix4(tmpM);
  return g;
}

/** Ensure geometry has the attribute set needed for merging (position, normal, uv), non-indexed. */
function normalize(g: THREE.BufferGeometry) {
  let out = g.index ? g.toNonIndexed() : g;
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) {
    const n = out.attributes.position.count;
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') out.deleteAttribute(k);
  if (out.morphAttributes) out.morphAttributes = {};
  return out;
}

/**
 * Collects static geometry per material key and merges into as few meshes as possible.
 * Large batches are chunked spatially so frustum culling still works.
 */
export class GeoBatch {
  private buckets = new Map<string, { geos: THREE.BufferGeometry[]; colored: boolean }[]>();
  constructor(private chunkSize = 120) {}

  add(key: string, g: THREE.BufferGeometry, color?: THREE.Color) {
    const geo = normalize(g);
    const colored = !!color || !!geo.attributes.color;
    if (color) {
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    geo.computeBoundingBox();
    const c = geo.boundingBox!.getCenter(new THREE.Vector3());
    const ck = `${key}|${Math.floor(c.x / this.chunkSize)},${Math.floor(c.z / this.chunkSize)}|${colored ? 1 : 0}`;
    let list = this.buckets.get(ck);
    if (!list) this.buckets.set(ck, (list = [{ geos: [], colored }]));
    list[0].geos.push(geo);
  }

  build(materials: (key: string, vertexColors: boolean) => THREE.Material, opts: { castShadow?: (key: string) => boolean; receiveShadow?: boolean } = {}) {
    const group = new THREE.Group();
    for (const [ck, list] of this.buckets) {
      const key = ck.split('|')[0];
      for (const b of list) {
        if (!b.geos.length) continue;
        // ensure color attr consistency
        if (b.colored) {
          for (const g of b.geos) {
            if (!g.attributes.color) {
              const n = g.attributes.position.count;
              g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
            }
          }
        }
        const merged = mergeGeometries(b.geos, false);
        if (!merged) { console.warn('merge failed for', ck); continue; }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, materials(key, b.colored));
        mesh.castShadow = opts.castShadow ? opts.castShadow(key) : true;
        mesh.receiveShadow = opts.receiveShadow ?? true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.name = key;
        group.add(mesh);
        for (const g of b.geos) g.dispose();
      }
    }
    this.buckets.clear();
    return group;
  }
}
