/**
 * The planet's surface as a grid: a cube blown up into a sphere, six faces of
 * G x G cells. Every point on the planet is a unit vector; a cell is found from
 * a vector with a few divisions, and no cell is badly stretched.
 */
import { GRID } from "./config";

const G = GRID;
export const CELLS = 6 * G * G;

/** The cell a direction falls in. The vector need not be unit length. */
export function cellOf(x: number, y: number, z: number): number {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f: number, u: number, v: number;
  if (ax >= ay && ax >= az) {
    if (x > 0) { f = 0; u = -z / ax; v = y / ax; } else { f = 1; u = z / ax; v = y / ax; }
  } else if (ay >= az) {
    if (y > 0) { f = 2; u = x / ay; v = -z / ay; } else { f = 3; u = x / ay; v = z / ay; }
  } else if (z > 0) { f = 4; u = x / az; v = y / az; } else { f = 5; u = -x / az; v = y / az; }
  let ix = ((u + 1) * 0.5 * G) | 0;
  let iy = ((v + 1) * 0.5 * G) | 0;
  if (ix >= G) ix = G - 1;
  if (iy >= G) iy = G - 1;
  return (f * G + iy) * G + ix;
}

/** A point on face f at (u, v), each -1..1 (values beyond that land on the neighbouring face). Not normalised. */
export function facePoint(f: number, u: number, v: number, out: Float64Array | number[]): void {
  switch (f) {
    case 0: out[0] = 1; out[1] = v; out[2] = -u; break;
    case 1: out[0] = -1; out[1] = v; out[2] = u; break;
    case 2: out[0] = u; out[1] = 1; out[2] = -v; break;
    case 3: out[0] = u; out[1] = -1; out[2] = v; break;
    case 4: out[0] = u; out[1] = v; out[2] = 1; break;
    default: out[0] = -u; out[1] = v; out[2] = -1;
  }
}

export interface Grid {
  /** Unit vector to the middle of each cell. */
  cx: Float32Array;
  cy: Float32Array;
  cz: Float32Array;
  /** The four cells sharing an edge with each cell. */
  nbr: Int32Array;
}

let cached: Grid | null = null;
/** Cell centres and neighbours. The same for every planet, so built once. */
export function grid(): Grid {
  if (cached) return cached;
  const cx = new Float32Array(CELLS), cy = new Float32Array(CELLS), cz = new Float32Array(CELLS);
  const nbr = new Int32Array(CELLS * 4);
  const p = [0, 0, 0];
  const step = 2 / G;
  for (let f = 0; f < 6; f++)
    for (let iy = 0; iy < G; iy++)
      for (let ix = 0; ix < G; ix++) {
        const i = (f * G + iy) * G + ix;
        const u = -1 + (ix + 0.5) * step, v = -1 + (iy + 0.5) * step;
        facePoint(f, u, v, p);
        const l = Math.hypot(p[0], p[1], p[2]);
        cx[i] = p[0] / l;
        cy[i] = p[1] / l;
        cz[i] = p[2] / l;
        const around = [[u + step, v], [u - step, v], [u, v + step], [u, v - step]];
        for (let k = 0; k < 4; k++) {
          facePoint(f, around[k][0], around[k][1], p);
          nbr[i * 4 + k] = cellOf(p[0], p[1], p[2]);
        }
      }
  cached = { cx, cy, cz, nbr };
  return cached;
}

/* ---------------- noise in three dimensions ---------------- */

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(hash3(ix, iy, iz, seed), hash3(ix + 1, iy, iz, seed), sx), l(hash3(ix, iy + 1, iz, seed), hash3(ix + 1, iy + 1, iz, seed), sx), sy),
    l(l(hash3(ix, iy, iz + 1, seed), hash3(ix + 1, iy, iz + 1, seed), sx), l(hash3(ix, iy + 1, iz + 1, seed), hash3(ix + 1, iy + 1, iz + 1, seed), sx), sy),
    sz,
  );
}

export function fbm3(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x, y, z, seed + o * 131);
    norm += amp;
    x = x * 2.03 + 3.1;
    y = y * 2.03 - 7.3;
    z = z * 2.03 + 5.7;
    amp *= 0.5;
  }
  return sum / norm;
}
