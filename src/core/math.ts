// Small math helpers shared by gameplay systems. Pure functions only (unit-testable).

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Wrap angle to (-PI, PI]. */
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

export const dist2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a: number, b: number) => a + (b - a) * next(),
    int: (a: number, b: number) => Math.floor(a + (b - a + 1) * next()),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof makeRng>;

/** FNV-1a 32-bit hash, used for save checksums and seeding. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Closest point on segment AB to P, returns t in [0,1]. */
export function segmentT(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-9) return 0;
  return clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1);
}
