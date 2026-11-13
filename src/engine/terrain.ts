/**
 * The land, made from a seed: an island with a coast, plains, forest, hills,
 * a spring in the hills, a river running down through a lake and out to sea.
 */
import { ISLAND_R, N } from "./config";
import { fbm, noise2 } from "./noise";
import { Rng } from "./rng";

export const SEA = 0;
export const BEACH = 1;
export const PLAINS = 2;
export const FOREST = 3;
export const HILLS = 4;
export const LAKE = 5;
export const RIVER = 6;

export interface Tree {
  x: number;
  y: number;
  /** Size, about 0.7 to 1.4. */
  s: number;
  /** 0 broadleaf, 1 conifer. */
  type: number;
}

export interface Place {
  id: number;
  kind: "lake" | "river" | "mouth" | "peak" | "wood" | "meadow" | "shore";
  x: number;
  y: number;
  r: number;
  /** A plain description, used until someone names the place. */
  desc: string;
}

export interface Terrain {
  seed: number;
  /** Height of the ground at each cell centre. Sea level is 0. */
  height: Float32Array;
  kind: Uint8Array;
  /** How much grass a cell can carry, 0..1. */
  fert: Float32Array;
  /** Distance to the nearest fresh water, and which cell that is. */
  freshDist: Float32Array;
  freshNear: Int32Array;
  /** The same, counting only the lake (the river can run dry). */
  lakeDist: Float32Array;
  lakeNear: Int32Array;
  lake: { x: number; y: number; r: number; level: number };
  /** The river as a line of points, spring first; `h` is the water surface there. */
  river: { x: number; y: number; h: number }[];
  /** Index into `river` where it enters the lake and where it leaves. */
  riverLakeIn: number;
  riverLakeOut: number;
  trees: Tree[];
  bushes: { x: number; y: number }[];
  rocks: { x: number; y: number; s: number }[];
  places: Place[];
  /** Which place a cell belongs to, or 255. */
  placeOf: Uint8Array;
  /** Cells where fish live (shallow water). */
  fishCells: Int32Array;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const cellOf = (x: number, y: number): number => {
  const cx = x < 0 ? 0 : x >= N ? N - 1 : x | 0;
  const cy = y < 0 ? 0 : y >= N ? N - 1 : y | 0;
  return cy * N + cx;
};

/** Ground height at any point, smoothly between cell centres. */
export function heightAt(t: Terrain, x: number, y: number): number {
  const fx = Math.min(N - 1.001, Math.max(0, x - 0.5));
  const fy = Math.min(N - 1.001, Math.max(0, y - 0.5));
  const ix = fx | 0;
  const iy = fy | 0;
  const ax = fx - ix;
  const ay = fy - iy;
  const i = iy * N + ix;
  const h = t.height;
  return (h[i] * (1 - ax) + h[i + 1] * ax) * (1 - ay) + (h[i + N] * (1 - ax) + h[i + N + 1] * ax) * ay;
}

const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
/** Compass word for a direction from the middle of the island (y grows southwards). */
function compass(dx: number, dy: number): string {
  const a = Math.atan2(dy, dx);
  return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

function distanceField(sources: number[]): { dist: Float32Array; near: Int32Array } {
  const dist = new Float32Array(N * N).fill(1e9);
  const near = new Int32Array(N * N).fill(-1);
  // Two sweeps of a chamfer transform are plenty for steering by.
  for (const s of sources) {
    dist[s] = 0;
    near[s] = s;
  }
  const relax = (i: number, j: number, d: number): void => {
    if (dist[j] + d < dist[i]) {
      dist[i] = dist[j] + d;
      near[i] = near[j];
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (x > 0) relax(i, i - 1, 1);
        if (y > 0) relax(i, i - N, 1);
        if (x > 0 && y > 0) relax(i, i - N - 1, 1.414);
        if (x < N - 1 && y > 0) relax(i, i - N + 1, 1.414);
      }
    for (let y = N - 1; y >= 0; y--)
      for (let x = N - 1; x >= 0; x--) {
        const i = y * N + x;
        if (x < N - 1) relax(i, i + 1, 1);
        if (y < N - 1) relax(i, i + N, 1);
        if (x < N - 1 && y < N - 1) relax(i, i + N + 1, 1.414);
        if (x > 0 && y < N - 1) relax(i, i + N - 1, 1.414);
      }
  }
  return { dist, near };
}

export function makeTerrain(seed: number): Terrain {
  const rng = new Rng(seed ^ 0x5eed);
  const c = N / 2;
  const height = new Float32Array(N * N);
  const kind = new Uint8Array(N * N);
  const fert = new Float32Array(N * N);

  const hillA = rng.range(0, Math.PI * 2);
  const hillD = ISLAND_R * rng.range(0.34, 0.46);
  const hillX = c + Math.cos(hillA) * hillD;
  const hillY = c + Math.sin(hillA) * hillD;
  const hillH = rng.range(6, 8);

  // 1. The raw island: a dome, roughened, with a knot of hills on one side.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dx = px - c;
      const dy = py - c;
      const ang = Math.atan2(dy, dx);
      // The coast wobbles in and out.
      const coast = ISLAND_R * (0.86 + 0.2 * fbm(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 5, seed + 7, 3));
      const d = Math.hypot(dx, dy) / coast;
      const e = fbm(px * 0.045, py * 0.045, seed, 4);
      let h = (1 - smooth(0.62, 1.04, d)) * (0.75 + e * 1.5) - 0.32 + (e - 0.5) * 0.5;
      const hd = Math.hypot(px - hillX, py - hillY);
      const ridge = 1 - Math.abs(fbm(px * 0.07, py * 0.07, seed + 31, 3) * 2 - 1);
      h += hillH * Math.exp(-(hd * hd) / (2 * 11 * 11)) * (0.45 + 0.75 * ridge) * (1 - smooth(0.8, 1.02, d));
      if (d > 1.02) h = Math.min(h, -0.4 - (d - 1.02) * 5);
      height[y * N + x] = h;
    }

  // 2. The lake, across the island from the hills.
  const lakeA = hillA + Math.PI + rng.range(-0.8, 0.8);
  const lakeD = ISLAND_R * rng.range(0.16, 0.3);
  const lx = c + Math.cos(lakeA) * lakeD;
  const ly = c + Math.sin(lakeA) * lakeD;
  const lr = rng.range(6.5, 8.5);
  const level = Math.max(0.8, Math.min(1.5, height[cellOf(lx, ly)]));
  const lakeEdge = (x: number, y: number): number => {
    const a = Math.atan2(y - ly, x - lx);
    return lr * (0.78 + 0.44 * noise2(Math.cos(a) * 1.3 + 9, Math.sin(a) * 1.3 + 9, seed + 77));
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.hypot(px - lx, py - ly);
      const edge = lakeEdge(px, py);
      const i = y * N + x;
      if (d < edge + 7) {
        // Level the ground around the lake so its surface can sit flat.
        const w = 1 - smooth(edge + 1, edge + 7, d);
        height[i] += (level + 0.22 + (d - edge) * 0.05 - height[i]) * w;
      }
      if (d < edge) {
        const k = d / edge;
        height[i] = level - 0.12 - 1.5 * (1 - k * k);
        kind[i] = LAKE;
      }
    }

  // 3. The river: spring in the hills, down to the lake, out to the sea.
  let peakX = hillX;
  let peakY = hillY;
  let peakH = -1;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const h = height[y * N + x];
      if (h > peakH && Math.hypot(x + 0.5 - hillX, y + 0.5 - hillY) < 14) {
        peakH = h;
        peakX = x + 0.5;
        peakY = y + 0.5;
      }
    }
  // Start the spring a little below the top.
  const toLake = Math.atan2(ly - peakY, lx - peakX);
  const springX = peakX + Math.cos(toLake) * 5;
  const springY = peakY + Math.sin(toLake) * 5;
  const springH = Math.max(level + 1.2, heightAt({ height } as Terrain, springX, springY) - 0.2);
  // The mouth: carry on past the lake until the sea.
  const outA = Math.atan2(ly - c, lx - c) + rng.range(-0.5, 0.5);
  let mouthX = lx;
  let mouthY = ly;
  for (let s = 0; s < 90; s++) {
    mouthX += Math.cos(outA);
    mouthY += Math.sin(outA);
    if (height[cellOf(mouthX, mouthY)] < -0.25 && Math.hypot(mouthX - lx, mouthY - ly) > lr + 3) break;
  }
  const river: { x: number; y: number; h: number }[] = [];
  const leg = (ax: number, ay: number, bx: number, by: number, ha: number, hb: number, wob: number, ph: number): void => {
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const steps = Math.ceil(len / 0.7);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const taper = Math.sin(Math.PI * t);
      const off = taper * wob * (Math.sin(t * len * 0.21 + ph) + 0.6 * Math.sin(t * len * 0.47 + ph * 2.1));
      // Fall quickly at first, then gently: a stream profile.
      const fall = 1 - Math.pow(1 - t, 1.8);
      river.push({ x: ax + (bx - ax) * t + nx * off, y: ay + (by - ay) * t + ny * off, h: ha + (hb - ha) * fall });
    }
  };
  leg(springX, springY, lx, ly, springH, level, 3.2, rng.range(0, 6));
  const riverLakeIn = river.findIndex((p) => Math.hypot(p.x - lx, p.y - ly) < lakeEdge(p.x, p.y) - 0.5);
  const before = river.length;
  leg(lx, ly, mouthX, mouthY, level, -0.25, 2.6, rng.range(0, 6));
  let riverLakeOut = before;
  for (let i = before; i < river.length; i++) {
    if (Math.hypot(river[i].x - lx, river[i].y - ly) < lakeEdge(river[i].x, river[i].y) + 0.3) riverLakeOut = i;
  }
  // Water surface must never rise downstream.
  for (let i = 1; i < river.length; i++) river[i].h = Math.min(river[i].h, river[i - 1].h);
  // Carve the bed and ease the banks down to it.
  for (let k = 0; k < river.length; k++) {
    const p = river[k];
    if (k > riverLakeIn && k < riverLakeOut) continue;
    const reach = 5;
    for (let y = Math.max(0, (p.y - reach) | 0); y <= Math.min(N - 1, (p.y + reach) | 0); y++)
      for (let x = Math.max(0, (p.x - reach) | 0); x <= Math.min(N - 1, (p.x + reach) | 0); x++) {
        const i = y * N + x;
        if (kind[i] === LAKE) continue;
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
        if (d < 1.15) {
          height[i] = Math.min(height[i], p.h - 0.3);
          if (p.h > 0) kind[i] = RIVER;
        } else if (d < reach) {
          height[i] = Math.min(height[i], p.h + 0.12 + (d - 1.15) * 0.55);
        }
      }
  }

  // 4. What grows where.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (kind[i] === LAKE || kind[i] === RIVER) continue;
      const h = height[i];
      const px = x + 0.5;
      const py = y + 0.5;
      const sx = x > 0 && x < N - 1 ? height[i + 1] - height[i - 1] : 0;
      const sy = y > 0 && y < N - 1 ? height[i + N] - height[i - N] : 0;
      const slope = Math.hypot(sx, sy) * 0.5;
      const f = fbm(px * 0.06 + 40, py * 0.06 + 40, seed + 5, 3);
      if (h < 0) kind[i] = SEA;
      else if (h < 0.3) kind[i] = BEACH;
      else if (h > 3.6 || slope > 0.85) kind[i] = HILLS;
      else if (f > 0.54) kind[i] = FOREST;
      else kind[i] = PLAINS;
      const patch = 0.65 + 0.7 * fbm(px * 0.11, py * 0.11, seed + 13, 2);
      fert[i] =
        (kind[i] === PLAINS ? 1 : kind[i] === FOREST ? 0.42 : kind[i] === HILLS ? 0.22 : kind[i] === BEACH ? 0.04 : 0) *
        Math.min(1.2, patch);
    }

  // 5. Trees, berry bushes, rocks.
  const trees: Tree[] = [];
  const bushes: { x: number; y: number }[] = [];
  const rocks: { x: number; y: number; s: number }[] = [];
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const k = kind[i];
      const jx = x + rng.range(0.15, 0.85);
      const jy = y + rng.range(0.15, 0.85);
      const roll = rng.next();
      if (k === FOREST) {
        if (roll < 0.36) trees.push({ x: jx, y: jy, s: rng.range(0.75, 1.4), type: height[i] > 2.2 || rng.next() < 0.25 ? 1 : 0 });
        const edge = kind[i - 1] === PLAINS || kind[i + 1] === PLAINS || kind[i - N] === PLAINS || kind[i + N] === PLAINS;
        if (roll > 0.36 && roll < (edge ? 0.56 : 0.4)) bushes.push({ x: jx, y: jy });
      } else if (k === PLAINS) {
        if (roll < 0.012) trees.push({ x: jx, y: jy, s: rng.range(0.9, 1.5), type: 0 });
        else if (roll < 0.022) bushes.push({ x: jx, y: jy });
        else if (roll < 0.028) rocks.push({ x: jx, y: jy, s: rng.range(0.3, 0.7) });
      } else if (k === HILLS) {
        if (roll < 0.05) rocks.push({ x: jx, y: jy, s: rng.range(0.5, 1.5) });
        else if (roll < 0.075 && height[i] < 5) trees.push({ x: jx, y: jy, s: rng.range(0.6, 1), type: 1 });
      } else if (k === BEACH && roll < 0.012) rocks.push({ x: jx, y: jy, s: rng.range(0.25, 0.6) });
    }

  // 6. Where the water is.
  const fresh: number[] = [];
  const lakeCells: number[] = [];
  const fish: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (kind[i] === LAKE) {
      fresh.push(i);
      lakeCells.push(i);
      fish.push(i);
    } else if (kind[i] === RIVER) fresh.push(i);
    else if (kind[i] === SEA && height[i] > -1.6) fish.push(i);
  }
  const all = distanceField(fresh);
  const onlyLake = distanceField(lakeCells);

  // 7. Places worth a name.
  const places: Place[] = [];
  const add = (kindOf: Place["kind"], x: number, y: number, r: number, desc: string): void => {
    if (places.length < 14) places.push({ id: places.length, kind: kindOf, x, y, r, desc });
  };
  add("lake", lx, ly, lr + 4, "the lake");
  add("peak", peakX, peakY, 9, "the high rock");
  add("mouth", mouthX, mouthY, 7, "the place where the river meets the sea");
  const mid = river[Math.floor(riverLakeIn * 0.55)];
  add("river", mid.x, mid.y, 7, "the upper river");
  // Woods: flood-fill the forest into clumps and keep the big ones.
  const seen = new Uint8Array(N * N);
  const woods: { x: number; y: number; n: number }[] = [];
  for (let s = 0; s < N * N; s++) {
    if (kind[s] !== FOREST || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let sx = 0;
    let sy = 0;
    let n = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      sx += i % N;
      sy += (i / N) | 0;
      n++;
      for (const j of [i - 1, i + 1, i - N, i + N]) {
        if (j >= 0 && j < N * N && kind[j] === FOREST && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (n > 60) woods.push({ x: sx / n + 0.5, y: sy / n + 0.5, n });
  }
  woods.sort((a, b) => b.n - a.n);
  const used = new Set<string>();
  for (const w of woods.slice(0, 4)) {
    const dir = Math.hypot(w.x - c, w.y - c) < 10 ? "middle" : compass(w.x - c, w.y - c);
    if (used.has("w" + dir)) continue;
    used.add("w" + dir);
    add("wood", w.x, w.y, Math.min(16, Math.sqrt(w.n / Math.PI) * 1.25), dir === "middle" ? "the wood in the middle" : `the ${dir} wood`);
  }
  // Meadows and shores by compass quarter.
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2 + Math.PI / 4;
    let best = -1;
    let bx = 0;
    let by = 0;
    for (let t = 0; t < 40; t++) {
      const aa = a + rng.range(-0.7, 0.7);
      const rr = ISLAND_R * rng.range(0.25, 0.7);
      const x = c + Math.cos(aa) * rr;
      const y = c + Math.sin(aa) * rr;
      const i = cellOf(x, y);
      let score = kind[i] === PLAINS ? fert[i] : -1;
      for (const p of places) if (Math.hypot(p.x - x, p.y - y) < p.r + 7) score -= 2;
      if (score > best) {
        best = score;
        bx = x;
        by = y;
      }
    }
    if (best > 0) add("meadow", bx, by, 8, `the ${compass(bx - c, by - c)} meadow`);
  }
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    let x = c;
    let y = c;
    for (let s = 0; s < 80; s++) {
      x += Math.cos(a);
      y += Math.sin(a);
      if (height[cellOf(x, y)] < 0.1 && Math.hypot(x - c, y - c) > 20) break;
    }
    let clear = true;
    for (const p of places) if (Math.hypot(p.x - x, p.y - y) < p.r + 4) clear = false;
    if (clear) add("shore", x, y, 7, `the ${compass(x - c, y - c)} shore`);
  }
  const placeOf = new Uint8Array(N * N).fill(255);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let bestD = 1e9;
      for (const p of places) {
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / p.r;
        if (d < 1 && d < bestD) {
          bestD = d;
          placeOf[y * N + x] = p.id;
        }
      }
    }

  return {
    seed, height, kind, fert,
    freshDist: all.dist, freshNear: all.near, lakeDist: onlyLake.dist, lakeNear: onlyLake.near,
    lake: { x: lx, y: ly, r: lr, level },
    river, riverLakeIn, riverLakeOut,
    trees, bushes, rocks, places, placeOf,
    fishCells: Int32Array.from(fish),
  };
}

/** The place at a point, or -1 if it is nowhere in particular. */
export function placeAt(t: Terrain, x: number, y: number): number {
  const p = t.placeOf[cellOf(x, y)];
  return p === 255 ? -1 : p;
}

/** The nearest place of all, however far. */
export function nearestPlace(t: Terrain, x: number, y: number): number {
  let best = 0;
  let bd = 1e9;
  for (const p of t.places) {
    const d = Math.hypot(p.x - x, p.y - y) - p.r;
    if (d < bd) {
      bd = d;
      best = p.id;
    }
  }
  return best;
}
