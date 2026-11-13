/**
 * The planet, made from a seed: continents and islands, oceans, ice at the
 * poles, deserts, forests, jungle, mountains, rivers and lakes. Every point is
 * a unit vector; height and everything else is kept per grid cell.
 */
import { GRID, R } from "./config";
import { Rng } from "./rng";
import { CELLS, cellOf, fbm3, grid } from "./sphere";

export const SEA = 0;
export const SHALLOW = 1;
export const BEACH = 2;
export const PLAINS = 3;
export const FOREST = 4;
export const JUNGLE = 5;
export const DESERT = 6;
export const TUNDRA = 7;
export const ICE = 8;
export const MOUNTAIN = 9;
export const LAKE = 10;
export const RIVER = 11;
export const KIND_NAMES = ["sea", "shallows", "shore", "grassland", "forest", "jungle", "desert", "cold steppe", "ice", "mountains", "lake", "river"];

/** One cell is about this many units across. */
export const CELL_SIZE = (Math.PI * R) / 2 / GRID;

export interface Tree {
  /** Unit vector to where it stands. */
  x: number; y: number; z: number;
  cell: number;
  /** Size, about 0.7 to 1.4. */
  s: number;
  /** 0 broadleaf, 1 conifer, 2 jungle palm, 3 desert spire. */
  type: number;
}

export interface Spot { x: number; y: number; z: number; cell: number; s: number }

export interface Place {
  id: number;
  kind: string;
  x: number; y: number; z: number;
  /** Radius in units. */
  r: number;
  /** A plain description, used until someone names the place. */
  desc: string;
  land: number;
}

export interface Land {
  id: number;
  cells: number;
  x: number; y: number; z: number;
  desc: string;
}

export interface Terrain {
  seed: number;
  /** Height of the ground in each cell. Sea level is 0. */
  height: Float32Array;
  kind: Uint8Array;
  /** How much grass a cell can carry, 0..1. */
  fert: Float32Array;
  /** How wet the climate is, 0..1, and the yearly mean temperature. */
  moist: Float32Array;
  temp: Float32Array;
  /** Distance (units) to the nearest fresh water, and which cell that is. */
  freshDist: Float32Array;
  freshNear: Int32Array;
  /** Which landmass a cell belongs to, or -1 for open water. */
  land: Int16Array;
  lands: Land[];
  rivers: number[][];
  trees: Tree[];
  bushes: Spot[];
  rocks: Spot[];
  places: Place[];
  /** Which place a cell belongs to, or 255. */
  placeOf: Uint8Array;
  /** Cells where sea life grows (shallow water and lakes). */
  fishCells: Int32Array;
}

const FERT = [0, 0, 0.04, 1, 0.45, 0.55, 0.05, 0.3, 0, 0.12, 0, 0];

function compassWord(dx: number, dy: number): string {
  // dx east, dy north, already scaled alike.
  if (Math.hypot(dx, dy) < 0.12) return "middle";
  const a = Math.atan2(dy, dx);
  return ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

export function makeTerrain(seed: number): Terrain {
  const rng = new Rng(seed ^ 0x51a7e);
  const { cx, cy, cz, nbr } = grid();
  const height = new Float32Array(CELLS);
  const kind = new Uint8Array(CELLS);
  const fert = new Float32Array(CELLS);
  const moist = new Float32Array(CELLS);
  const temp = new Float32Array(CELLS);

  // 1. Where the land is: slow noise, bent a little so coasts are not blobs.
  const raw = new Float32Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const x = cx[i], y = cy[i], z = cz[i];
    const wx = x + 0.28 * (fbm3(x * 1.9, y * 1.9, z * 1.9, seed + 11, 3) - 0.5);
    const wy = y + 0.28 * (fbm3(x * 1.9 + 9, y * 1.9, z * 1.9, seed + 12, 3) - 0.5);
    const wz = z + 0.28 * (fbm3(x * 1.9, y * 1.9 + 9, z * 1.9, seed + 13, 3) - 0.5);
    raw[i] = fbm3(wx * 1.75 + 4, wy * 1.75 + 4, wz * 1.75 + 4, seed, 5) + 0.09 * (fbm3(x * 5.5, y * 5.5, z * 5.5, seed + 3, 3) - 0.5);
  }
  // Put the shoreline where a third of the planet is land, whatever the seed.
  const sorted = Float32Array.from(raw).sort();
  const shore = sorted[Math.floor(CELLS * 0.66)];
  for (let i = 0; i < CELLS; i++) {
    const x = cx[i], y = cy[i], z = cz[i];
    const e = (raw[i] - shore) * 22;
    if (e > 0) {
      const ridge = 1 - Math.abs(fbm3(x * 3.4 + 2, y * 3.4, z * 3.4, seed + 31, 4) * 2 - 1);
      const inland = Math.min(1, e / 1.6);
      height[i] = Math.min(10, 0.12 + e * 0.75 + inland * ridge * ridge * ridge * 9 * (0.35 + fbm3(x * 1.2, y * 1.2, z * 1.2, seed + 41, 2)));
    } else height[i] = Math.max(-5, e * 1.5);
    const lat = Math.abs(y);
    moist[i] = Math.min(1, Math.max(0, fbm3(x * 2.4 + 7, y * 2.4, z * 2.4, seed + 51, 4) * 1.15 - 0.1 + 0.18 * (1 - lat) - 0.3 * Math.exp(-(((lat - 0.36) / 0.13) ** 2))));
    temp[i] = 30 - 39 * y * y - Math.max(0, height[i]) * 2.1;
  }

  // 2. Rivers: from wet high ground, always downhill, to the sea or to a hollow that becomes a lake.
  const rivers: number[][] = [];
  const isRiver = new Uint8Array(CELLS);
  const isLake = new Uint8Array(CELLS);
  const sources: number[] = [];
  for (let tries = 0; tries < 6000 && sources.length < 46; tries++) {
    const i = rng.int(CELLS);
    if (height[i] < 3.2 || moist[i] < 0.32 || temp[i] < -6) continue;
    if (sources.some((s) => cx[s] * cx[i] + cy[s] * cy[i] + cz[s] * cz[i] > 0.985)) continue;
    sources.push(i);
  }
  for (const s of sources) {
    const path = [s];
    let c = s;
    for (let step = 0; step < 260; step++) {
      let best = -1, bh = height[c];
      for (let k = 0; k < 4; k++) {
        const j = nbr[c * 4 + k];
        if (height[j] < bh) {
          bh = height[j];
          best = j;
        }
      }
      if (best < 0) {
        // A hollow: it fills.
        isLake[c] = 1;
        for (let k = 0; k < 4; k++) {
          const j = nbr[c * 4 + k];
          if (height[j] > 0 && height[j] < height[c] + 0.6) {
            isLake[j] = 1;
            height[j] = height[c];
          }
        }
        break;
      }
      c = best;
      path.push(c);
      if (height[c] <= 0 || isRiver[c] || isLake[c]) break;
    }
    if (path.length < 5) continue;
    for (const i of path) if (height[i] > 0) isRiver[i] = 1;
    rivers.push(path);
  }
  // A few more lakes in wet lowlands.
  for (let i = 0; i < CELLS; i++) {
    if (height[i] > 0.4 && height[i] < 2.4 && moist[i] > 0.5 && fbm3(cx[i] * 7, cy[i] * 7, cz[i] * 7, seed + 71, 2) > 0.74) isLake[i] = 1;
  }

  // 3. What each cell is.
  for (let i = 0; i < CELLS; i++) {
    const h = height[i], t = temp[i], m = moist[i], lat = Math.abs(cy[i]);
    let k: number;
    if (h <= 0) k = lat > 0.9 + 0.04 * (m - 0.5) ? ICE : h > -0.9 ? SHALLOW : SEA;
    else if (isLake[i]) k = t < -8 ? ICE : LAKE;
    else if (isRiver[i]) k = t < -8 ? ICE : RIVER;
    else if (t < -7) k = ICE;
    else if (h > 5.2) k = MOUNTAIN;
    else if (h < 0.3) k = BEACH;
    else if (t < 4) k = TUNDRA;
    else if (t > 19 && m < 0.33) k = DESERT;
    else if (t > 21 && m > 0.55) k = JUNGLE;
    else if (m > 0.47) k = FOREST;
    else k = PLAINS;
    kind[i] = k;
    if (k === ICE && h <= 0) height[i] = 0.12;
    const patch = 0.7 + 0.6 * fbm3(cx[i] * 9, cy[i] * 9, cz[i] * 9, seed + 81, 2);
    fert[i] = FERT[k] * Math.min(1.15, patch) * (k === PLAINS ? 0.55 + 0.6 * m : 1);
  }

  // 4. Trees, fruit bushes, rocks: placed inside their cell.
  const trees: Tree[] = [];
  const bushes: Spot[] = [];
  const rocks: Spot[] = [];
  const spot = (i: number, s: number): Spot => {
    const j = 0.75 / GRID;
    const x = cx[i] + rng.range(-j, j), y = cy[i] + rng.range(-j, j), z = cz[i] + rng.range(-j, j);
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l, cell: i, s };
  };
  for (let i = 0; i < CELLS; i++) {
    const k = kind[i];
    const roll = rng.next();
    let edge = false;
    for (let q = 0; q < 4; q++) if (kind[nbr[i * 4 + q]] === PLAINS) edge = true;
    if (k === FOREST) {
      const n = roll < 0.45 ? 2 : 1;
      for (let q = 0; q < n; q++) trees.push({ ...spot(i, rng.range(0.75, 1.4)), type: temp[i] < 9 || rng.next() < 0.18 ? 1 : 0 });
      if (rng.next() < (edge ? 0.55 : 0.16)) bushes.push(spot(i, rng.range(0.9, 1.3)));
    } else if (k === JUNGLE) {
      const n = roll < 0.6 ? 2 : 1;
      for (let q = 0; q < n; q++) trees.push({ ...spot(i, rng.range(0.9, 1.6)), type: rng.next() < 0.7 ? 2 : 0 });
      if (rng.next() < 0.4) bushes.push(spot(i, rng.range(1, 1.4)));
    } else if (k === PLAINS) {
      if (roll < 0.02) trees.push({ ...spot(i, rng.range(0.9, 1.5)), type: temp[i] < 9 ? 1 : 0 });
      else if (roll < 0.09) bushes.push(spot(i, rng.range(0.8, 1.2)));
      else if (roll < 0.1) rocks.push(spot(i, rng.range(0.3, 0.7)));
    } else if (k === TUNDRA) {
      if (roll < 0.06) trees.push({ ...spot(i, rng.range(0.6, 1)), type: 1 });
      else if (roll < 0.1) rocks.push(spot(i, rng.range(0.4, 0.9)));
    } else if (k === DESERT) {
      if (roll < 0.035) trees.push({ ...spot(i, rng.range(0.7, 1.3)), type: 3 });
      else if (roll < 0.08) rocks.push(spot(i, rng.range(0.4, 1.2)));
    } else if (k === MOUNTAIN) {
      if (roll < 0.16) rocks.push(spot(i, rng.range(0.6, 1.8)));
    } else if (k === BEACH && roll < 0.03) rocks.push(spot(i, rng.range(0.25, 0.6)));
  }

  // 5. How far to fresh water, cell by cell (a flood outwards from every lake and river).
  const freshDist = new Float32Array(CELLS).fill(1e9);
  const freshNear = new Int32Array(CELLS).fill(-1);
  let frontier: number[] = [];
  const fish: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (kind[i] === LAKE || kind[i] === RIVER) {
      freshDist[i] = 0;
      freshNear[i] = i;
      frontier.push(i);
    }
    if (kind[i] === LAKE || kind[i] === SHALLOW) fish.push(i);
  }
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier)
      for (let q = 0; q < 4; q++) {
        const j = nbr[i * 4 + q];
        if (freshDist[i] + CELL_SIZE < freshDist[j] - 0.01 && freshDist[i] < 110) {
          freshDist[j] = freshDist[i] + CELL_SIZE;
          freshNear[j] = freshNear[i];
          next.push(j);
        }
      }
    frontier = next;
  }

  // 6. Landmasses.
  const land = new Int16Array(CELLS).fill(-1);
  const lands: Land[] = [];
  const isLand = (i: number): boolean => kind[i] >= BEACH;
  for (let s = 0; s < CELLS; s++) {
    if (!isLand(s) || land[s] >= 0) continue;
    const id = lands.length;
    const stack = [s];
    land[s] = id;
    let n = 0, sx = 0, sy = 0, sz = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      n++;
      sx += cx[i];
      sy += cy[i];
      sz += cz[i];
      for (let q = 0; q < 4; q++) {
        const j = nbr[i * 4 + q];
        if (isLand(j) && land[j] < 0) {
          land[j] = id;
          stack.push(j);
        }
      }
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    lands.push({ id, cells: n, x: sx / l, y: sy / l, z: sz / l, desc: "" });
  }
  const bySize = [...lands].sort((a, b) => b.cells - a.cells);
  const band = (y: number): string => (y > 0.55 ? "far northern" : y > 0.2 ? "northern" : y < -0.55 ? "far southern" : y < -0.2 ? "southern" : "middle");
  const usedDesc = new Set<string>();
  const nth = ["", "", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  bySize.forEach((l, rank) => {
    const size = l.cells > 2600 ? "continent" : l.cells > 900 ? "wide land" : l.cells > 220 ? "island" : l.cells > 40 ? "small island" : "islet";
    let d = rank === 0 ? "the great land" : `the ${band(l.y)} ${size}`;
    for (let n = 2; usedDesc.has(d); n++) d = `the ${nth[Math.min(n, 8)]} ${band(l.y)} ${size}${n > 8 ? ` ${n}` : ""}`;
    usedDesc.add(d);
    l.desc = d;
  });

  // 7. Places worth a name: spread over each landmass, described by what grows there.
  const places: Place[] = [];
  const cellsOf: number[][] = lands.map(() => []);
  for (let i = 0; i < CELLS; i++) if (land[i] >= 0 && kind[i] !== ICE) cellsOf[land[i]].push(i);
  for (const l of bySize) {
    if (places.length >= 30 || l.cells < 10) break;
    const cells = cellsOf[l.id];
    if (!cells.length) continue;
    const want = Math.max(1, Math.min(6, Math.round(l.cells / 700)));
    const chosen: number[] = [];
    for (let k = 0; k < want && places.length < 30; k++) {
      // The cell furthest from those already chosen (the first: nearest the middle of the land).
      let best = -1, bd = -1;
      for (let q = 0; q < cells.length; q += 3) {
        const i = cells[q];
        let d = 2;
        if (!chosen.length) d = cx[i] * l.x + cy[i] * l.y + cz[i] * l.z;
        else for (const c of chosen) d = Math.min(d, 1 - (cx[i] * cx[c] + cy[i] * cy[c] + cz[i] * cz[c]));
        if (d > bd) {
          bd = d;
          best = i;
        }
      }
      if (best < 0) break;
      chosen.push(best);
      const what = KIND_NAMES[kind[best]];
      // East is the direction of increasing angle around the axis.
      const east = Math.atan2(cz[best], cx[best]) - Math.atan2(l.z, l.x);
      const dir = compassWord(Math.atan2(Math.sin(east), Math.cos(east)) * 2, (cy[best] - l.y) * 2.2);
      const desc = want === 1 ? l.desc : dir === "middle" ? `the ${what} in the middle of ${l.desc}` : `the ${what} in the ${dir} of ${l.desc}`;
      places.push({ id: places.length, kind: what, x: cx[best], y: cy[best], z: cz[best], r: l.cells < 60 ? 7 : 11, desc, land: l.id });
    }
  }
  const placeOf = new Uint8Array(CELLS).fill(255);
  for (let i = 0; i < CELLS; i++) {
    if (land[i] < 0) continue;
    let bd = 1e9;
    for (const p of places) {
      if (p.land !== land[i]) continue;
      const d = (Math.acos(Math.min(1, cx[i] * p.x + cy[i] * p.y + cz[i] * p.z)) * R) / p.r;
      if (d < 1 && d < bd) {
        bd = d;
        placeOf[i] = p.id;
      }
    }
  }

  return {
    seed, height, kind, fert, moist, temp, freshDist, freshNear, land, lands, rivers, trees, bushes, rocks, places, placeOf,
    fishCells: Int32Array.from(fish),
  };
}

/** Ground height at a point on the planet. */
export function heightAt(t: Terrain, x: number, y: number, z: number): number {
  return t.height[cellOf(x, y, z)];
}

/** The place at a point, or -1 if it is nowhere in particular. */
export function placeAt(t: Terrain, x: number, y: number, z: number): number {
  const p = t.placeOf[cellOf(x, y, z)];
  return p === 255 ? -1 : p;
}

/** The nearest place of all, however far. */
export function nearestPlace(t: Terrain, x: number, y: number, z: number): number {
  let best = 0, bd = -2;
  for (const p of t.places) {
    const d = p.x * x + p.y * y + p.z * z;
    if (d > bd) {
      bd = d;
      best = p.id;
    }
  }
  return best;
}

export { cellOf };
