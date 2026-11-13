/**
 * The simulation. Pure TypeScript, no DOM, fixed time step, one seeded random
 * generator: the same seed and the same visitor actions give the same history.
 *
 * The whole planet is stepped all the time. Nothing is paused for being out
 * of sight.
 */
import {
  BERRY_E, BUSH_MAX, CLEVER, DAY, DT, FISH_E, GRASS_E, GRID, HIDDEN, IN, KITH, MAX_CREATURES, MAX_PER_KIND, N_IN, N_OUT, N_SPECIES, N_VEC, OUT, R,
  SEASON_DAYS, SPECIES, THINKER, THINK_EVERY, TILT, VEC, YEAR_DAYS, type Species,
} from "./config";
import { CRAFTS, C_BASKET, C_BLADE, C_CLOAK, C_COOK, C_DIGGER, C_NET, C_POT, C_RAFT, C_SOW, C_SPEAR, C_STONEHUT, C_TORCH, M } from "./craft";
import { founderBrain, inherit, think } from "./net";
import { Rng } from "./rng";
import { CELLS, cellOf, fbm3, grid } from "./sphere";
import { BEACH, FOREST, ICE, JUNGLE, LAKE, MOUNTAIN, PLAINS, RIVER, SEA, SHALLOW, makeTerrain, nearestPlace, placeAt } from "./terrain";
import type { Attempt, Creature, Held, Idea, LogKind, Meeting, Traits, World } from "./types";

/** Regions for weather: each grid face cut into REGION x REGION. */
export const REGION = 10;
const N_REGION = 6 * REGION * REGION;
const BS = 18; // bucket size, units
const RR = R + 14;
const BD = Math.ceil((2 * RR) / BS);
const WATER_SMELL = 60;
const F_HUNGRY = 1, F_PARCHED = 2, F_WADED = 4, F_GROWN = 8, F_COLD = 16, F_FLED = 32, F_DROUGHT = 64, F_SAILED = 128, F_STRUCK = 256;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const bucketOf = (x: number, y: number, z: number): number =>
  ((((z * R + RR) / BS) | 0) * BD + (((y * R + RR) / BS) | 0)) * BD + (((x * R + RR) / BS) | 0);

export const regionOf = (cell: number): number => {
  const G = GRID;
  const ix = cell % G, iy = ((cell / G) | 0) % G, f = (cell / (G * G)) | 0;
  return (f * REGION + ((iy * REGION) / G | 0)) * REGION + ((ix * REGION) / G | 0);
};

/** Static lookups for a terrain: which trees, bushes and rocks are in each bucket of space. */
interface Statics { trees: number[][]; bushes: number[][]; rocks: number[][]; regionMoist: Float32Array; regionX: Float32Array; regionY: Float32Array; regionZ: Float32Array }
const staticsFor = new WeakMap<object, Statics>();
function statics(w: World): Statics {
  let s = staticsFor.get(w.terrain);
  if (s) return s;
  const t = w.terrain;
  const mk = (): number[][] => Array.from({ length: BD * BD * BD }, () => []);
  s = { trees: mk(), bushes: mk(), rocks: mk(), regionMoist: new Float32Array(N_REGION), regionX: new Float32Array(N_REGION), regionY: new Float32Array(N_REGION), regionZ: new Float32Array(N_REGION) };
  t.trees.forEach((o, i) => (s as Statics).trees[bucketOf(o.x, o.y, o.z)].push(i));
  t.bushes.forEach((o, i) => (s as Statics).bushes[bucketOf(o.x, o.y, o.z)].push(i));
  t.rocks.forEach((o, i) => (s as Statics).rocks[bucketOf(o.x, o.y, o.z)].push(i));
  const g = grid();
  const n = new Float32Array(N_REGION);
  for (let i = 0; i < CELLS; i++) {
    const r = regionOf(i);
    s.regionMoist[r] += t.moist[i];
    s.regionX[r] += g.cx[i];
    s.regionY[r] += g.cy[i];
    s.regionZ[r] += g.cz[i];
    n[r]++;
  }
  for (let r = 0; r < N_REGION; r++) {
    s.regionMoist[r] /= n[r];
    const l = Math.hypot(s.regionX[r], s.regionY[r], s.regionZ[r]);
    s.regionX[r] /= l;
    s.regionY[r] /= l;
    s.regionZ[r] /= l;
  }
  staticsFor.set(w.terrain, s);
  return s;
}

export function createWorld(seed: number): World {
  const terrain = makeTerrain(seed);
  const grass = new Float64Array(CELLS);
  const fish = new Float64Array(CELLS).fill(-1);
  const bush = new Float64Array(terrain.bushes.length).fill(3);
  let given = 0;
  for (let i = 0; i < CELLS; i++) {
    grass[i] = terrain.fert[i] * 0.75;
    given += grass[i] * GRASS_E;
  }
  for (const i of terrain.fishCells) {
    fish[i] = 0.7;
    given += 0.7 * FISH_E;
  }
  given += bush.length * 3 * BERRY_E;
  const w: World = {
    seed, terrain, rng: new Rng(seed),
    t: DAY * 0.3, tick: 0,
    grass, bush, fish,
    creatures: [], byId: new Map(), gone: new Map(), nextId: 1,
    fires: [], shelters: [], markers: [], carcasses: [], piles: [], blobs: [], novel: [],
    avatarId: -1, avatarName: null, ctl: { x: 0, y: 0, z: 0, run: false, down: false }, sightings: [], chat: [],
    cuts: new Uint8Array(terrain.trees.length), felled: new Float64Array(terrain.trees.length),
    rainGrid: new Float32Array(N_REGION), wetGrid: new Float32Array(N_REGION),
    sunX: 1, sunY: 0, sunZ: 0, season: 0,
    ideas: [], placeNames: terrain.places.map(() => null), placeNamedBy: terrain.places.map(() => -1),
    news: [], pings: [], told: new Set(), meetings: [], attempts: [], talks: [], talkMode: "auto",
    ledger: { given, grown: 0, burned: 0, lost: 0 },
    counts: new Array(N_SPECIES).fill(0), placed: new Array(N_SPECIES).fill(0), births: 0, deaths: 0,
    records: Array.from({ length: N_SPECIES }, () => []),
    dayStats: Array.from({ length: N_SPECIES }, () => ({ births: 0, deaths: 0, ageSum: 0 })),
    buckets: Array.from({ length: BD * BD * BD }, () => []),
  };
  const st = statics(w);
  for (let r = 0; r < N_REGION; r++) w.wetGrid[r] = 0.25 + 0.55 * st.regionMoist[r];
  environment(w);
  return w;
}

/** All the energy in the world right now. With the ledger, this must balance. */
export function totalEnergy(w: World): number {
  let e = 0;
  for (let i = 0; i < CELLS; i++) e += w.grass[i] * GRASS_E;
  for (const i of w.terrain.fishCells) e += w.fish[i] * FISH_E;
  for (let i = 0; i < w.bush.length; i++) e += w.bush[i] * BERRY_E;
  for (const c of w.creatures) e += c.energy + SPECIES[c.sp].mass * c.traits.size;
  for (const l of w.carcasses) e += l.energy;
  for (const l of w.piles) e += l.energy;
  return e;
}

export const dayOf = (t: number): number => Math.floor(t / DAY);
export const ageDays = (w: World, c: Creature): number => ((c.alive ? w.t : c.died) - c.born) / DAY;
export const isAdult = (w: World, c: Creature): boolean => ageDays(w, c) >= SPECIES[c.sp].adultAt;
/** Distance over the ground between two points given as unit vectors, in units. */
export const arc = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number =>
  Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))) * R;

/** How high the sun stands at a point: 1 overhead, 0 on the horizon, negative at night. */
export const sunAt = (w: World, x: number, y: number, z: number): number => x * w.sunX + y * w.sunY + z * w.sunZ;
const yearSwing = (w: World): number => Math.sin((((w.t / DAY) % YEAR_DAYS) / YEAR_DAYS - 0.125) * Math.PI * 2);

/** Rain falling and warmth at a point, right now. */
export function weatherAt(w: World, x: number, y: number, z: number): { rain: number; temp: number; dry: boolean } {
  const cell = cellOf(x, y, z);
  let rain = w.rainGrid[regionOf(cell)];
  let temp = w.terrain.temp[cell] + 9 * y * yearSwing(w) + 5 * sunAt(w, x, y, z);
  let dry = false;
  for (const b of w.blobs) {
    const d = arc(x, y, z, b.x, b.y, b.z);
    if (d > b.r) continue;
    if (b.kind === "rain") rain = Math.max(rain, 1 - (d / b.r) ** 3);
    else if (b.kind === "cold") temp -= 14 * (1 - (d / b.r) ** 2);
    else {
      rain = 0;
      dry = true;
    }
  }
  return { rain, temp: temp - rain * 2, dry };
}

export function canStand(w: World, c: { sp: Species; knows: number }, x: number, y: number, z: number): boolean {
  const def = SPECIES[c.sp];
  if (def.air) return true;
  const k = w.terrain.kind[cellOf(x, y, z)];
  if (def.sea) return k === SEA || k === SHALLOW;
  if (k === SEA) return (c.knows & (1 << C_RAFT)) !== 0;
  return true;
}

function log(w: World, c: Creature, k: LogKind, p = -1, o = -1, n = -1): void {
  c.log.push({ t: w.t, k, p, o, n });
  if (c.log.length > 70) c.log.splice(8, 1); // keep the earliest memories, lose the middle
}

function ping(w: World, kind: string, x: number, y: number, z: number, who = -1, newsId = -1): void {
  w.pings.push({ id: (w.pings[w.pings.length - 1]?.id ?? 0) + 1, t: w.t, kind, x, y, z, who, news: newsId });
  if (w.pings.length > 60) w.pings.shift();
}

function news(w: World, kind: string, a = -1, b = -1, p = -1, n = -1, once = "", at?: { x: number; y: number; z: number }): void {
  if (once) {
    if (w.told.has(once)) return;
    w.told.add(once);
  }
  w.news.push({ id: w.news.length, t: w.t, kind, a, b, p, n });
  const c = at ?? (a >= 0 ? w.byId.get(a) ?? w.gone.get(a) : undefined);
  if (c) ping(w, kind, c.x, c.y, c.z, a, w.news.length - 1);
}

function makeTraits(rng: Rng, m?: Traits, f?: Traits): Traits {
  const mix = (a: number, b: number, lo: number, hi: number, jitter: number): number =>
    Math.min(hi, Math.max(lo, (rng.next() < 0.5 ? a : b) + rng.gauss() * jitter));
  if (m && f)
    return {
      speed: mix(m.speed, f.speed, 0.75, 1.3, 0.04),
      size: mix(m.size, f.size, 0.8, 1.25, 0.03),
      sense: mix(m.sense, f.sense, 0.7, 1.4, 0.05),
      bold: mix(m.bold, f.bold, 0, 1, 0.1),
      hue: mix(m.hue, f.hue, -1, 1, 0.12),
    };
  return {
    speed: 1 + rng.gauss() * 0.06,
    size: 1 + rng.gauss() * 0.05,
    sense: 1 + rng.gauss() * 0.07,
    bold: clamp01(0.5 + rng.gauss() * 0.22),
    hue: Math.max(-1, Math.min(1, rng.gauss() * 0.45)),
  };
}

/** A unit vector along the ground at p, in a random direction. */
function randomTangent(rng: Rng, x: number, y: number, z: number): [number, number, number] {
  for (;;) {
    let a = rng.gauss(), b = rng.gauss(), c = rng.gauss();
    const d = a * x + b * y + c * z;
    a -= d * x;
    b -= d * y;
    c -= d * z;
    const l = Math.hypot(a, b, c);
    if (l > 0.1) return [a / l, b / l, c / l];
  }
}

function blank(w: World, sp: Species, x: number, y: number, z: number, traits: Traits, brain: Float32Array): Creature {
  const [hx, hy, hz] = randomTangent(w.rng, x, y, z);
  const H = HIDDEN[SPECIES[sp].tier];
  return {
    id: w.nextId++, sp, sex: w.rng.next() < 0.5 ? 0 : 1,
    x, y, z, alt: 0, hx, hy, hz, pace: 0,
    energy: 0, thirst: 0.2, tired: 0.1, health: 1, born: w.t, bx: x, by: y, bz: z,
    traits, brain,
    inp: new Float32Array(N_IN), hid: new Float32Array(H), out: new Float32Array(N_OUT), tv: new Float32Array(N_VEC * 3),
    mother: -1, father: -1, mate: -1, children: [], gen: 0, root: -1,
    homeX: x, homeY: y, homeZ: z, waterX: 0, waterY: 0, waterZ: 0, hasWater: false, callX: 0, callY: 0, callZ: 0, hasCall: false,
    wx: hx, wy: hy, wz: hz,
    state: 0, foodKind: 0, foodAt: -1,
    mateCd: 0, talkCd: 0, markCd: 0, tinkerCd: 0, pause: 0, detour: 0, carrying: 0, follow: -1, avoid: -1,
    flags: 0, seen: 0, at: new Uint16Array(32), samples: 0, handled: 0, knows: 0, land: w.terrain.land[cellOf(x, y, z)], bornLand: w.terrain.land[cellOf(x, y, z)],
    path: [x, y, z],
    avatar: false, stance: 0, metAvatar: false, suspect: 0, wonder: clamp01(0.4 + w.rng.gauss() * 0.18),
    name: null, log: [], beliefs: [], thoughts: [],
    alive: true, died: 0, cause: "", kills: 0,
  };
}

function admit(w: World, c: Creature): void {
  w.creatures.push(c);
  w.byId.set(c.id, c);
  w.counts[c.sp]++;
  const p = placeAt(w.terrain, c.x, c.y, c.z);
  if (p >= 0) c.seen |= 1 << p;
}

/** Thinkers near something the visitor did remember it as something that came from the sky. */
function fromTheSky(w: World, x: number, y: number, z: number, kind: LogKind, n = -1, skip = -1): void {
  for (const c of w.creatures) {
    if (c.sp !== KITH || c.id === skip || arc(c.x, c.y, c.z, x, y, z) > 22) continue;
    log(w, c, kind, placeAt(w.terrain, x, y, z), -1, n);
    // Each thing that comes from nowhere makes it wonder a little more, up to a point.
    if (c.suspect < 0.5) c.suspect += 0.02;
    c.wonder = Math.min(1, c.wonder + 0.03);
  }
}

/**
 * The visitor sets a creature down. It arrives part-grown, with the founder
 * instincts of its kind. Returns null if the spot is no good for it.
 */
export function place(w: World, sp: Species, x: number, y: number, z: number, age = 0.6): Creature | null {
  const l = Math.hypot(x, y, z);
  x /= l;
  y /= l;
  z /= l;
  if (!canStand(w, { sp, knows: 0 }, x, y, z) || w.creatures.length >= MAX_CREATURES) return null;
  const def = SPECIES[sp];
  const c = blank(w, sp, x, y, z, makeTraits(w.rng), founderBrain(sp, w.rng));
  // Placed creatures alternate female and male, so a handful can always breed.
  c.sex = (w.placed[sp]++ & 1) as 0 | 1;
  c.born = w.t - def.adultAt * DAY * age * 2;
  c.energy = def.maxEnergy * 0.7;
  c.root = c.id;
  if (age >= 0.5) c.flags |= F_GROWN;
  c.mateCd = DAY * w.rng.range(0.4, 1.4);
  if (def.air) c.alt = 3;
  w.ledger.given += c.energy + def.mass * c.traits.size;
  admit(w, c);
  log(w, c, "placed", nearestPlace(w.terrain, x, y, z));
  news(w, "arrive", c.id, -1, -1, sp, "arrive" + sp);
  w.novel.push({ x, y, z, t: w.t });
  fromTheSky(w, x, y, z, sp === KITH ? "skyKin" : "skyBeast", sp, c.id);
  return c;
}

/* ---------------- the sky, the weather, the plants ---------------- */

function environment(w: World): void {
  const day = w.t / DAY;
  const yearFrac = (day % YEAR_DAYS) / YEAR_DAYS;
  w.season = Math.floor(day / SEASON_DAYS) % 4;
  // The planet turns under the sun once a day; over a year the sun swings north and south.
  const dec = TILT * Math.sin((yearFrac - 0.125) * Math.PI * 2);
  const a = -(day % 1) * Math.PI * 2;
  w.sunX = Math.cos(dec) * Math.cos(a);
  w.sunY = Math.sin(dec);
  w.sunZ = Math.cos(dec) * Math.sin(a);
}

const REGION_STRIDE = 50;
function weather(w: World): void {
  const st = statics(w);
  for (let i = w.blobs.length - 1; i >= 0; i--) {
    const b = w.blobs[i];
    b.left -= DT;
    if (b.left <= 0) {
      if (b.kind !== "rain") news(w, b.kind === "cold" ? "coldEnd" : "droughtEnd", -1, -1, -1, -1, "", b);
      w.blobs.splice(i, 1);
    }
  }
  while (w.novel.length && w.t - w.novel[0].t > DAY * 0.5) w.novel.shift();
  // A slice of the regions each step: weather drifts over the planet as slow noise.
  const dt = DT * REGION_STRIDE;
  const drift = w.t * 0.0035;
  for (let r = w.tick % REGION_STRIDE; r < N_REGION; r += REGION_STRIDE) {
    const x = st.regionX[r], y = st.regionY[r], z = st.regionZ[r];
    const n = fbm3(x * 2.3 + drift, y * 2.3 + 40, z * 2.3 - drift * 0.7, w.seed + 900, 3);
    const edge = 0.71 - 0.22 * st.regionMoist[r];
    let rain = clamp01((n - edge) / 0.1);
    let dry = 1;
    for (const b of w.blobs) {
      const d = arc(x, y, z, b.x, b.y, b.z);
      if (d > b.r + 8) continue;
      if (b.kind === "rain") rain = 1;
      else if (b.kind === "drought") {
        rain = 0;
        dry = 4;
      }
    }
    w.rainGrid[r] = rain;
    w.wetGrid[r] = clamp01(w.wetGrid[r] + (rain * 1.6 * dt) / DAY - (w.wetGrid[r] * dry * dt) / (DAY * 3.5));
  }
}

const STRIDE = 24;
function plants(w: World): void {
  const { grass, ledger } = w;
  const t = w.terrain;
  const fert = t.fert;
  const g3 = grid();
  const dt = DT * STRIDE;
  const swing = 9 * yearSwing(w);
  for (let i = w.tick % STRIDE; i < CELLS; i += STRIDE) {
    const cap = fert[i];
    if (cap <= 0) continue;
    const T = t.temp[i] + swing * g3.cy[i];
    const g = Math.min(1.2, Math.max(0.05, (T - 2) / 14)) * (0.2 + 0.8 * w.wetGrid[regionOf(i)]);
    const v = grass[i];
    let d: number;
    if (g > 0.14) d = (0.009 * g * v * (1 - v / cap) + 0.0003 * cap * g) * dt;
    else d = -0.0011 * v * dt; // winter and drought thin it out
    if (v + d > cap) d = cap - v;
    grass[i] = v + d;
    if (d > 0) ledger.grown += d * GRASS_E;
    else ledger.lost -= d * GRASS_E;
  }
  const fc = t.fishCells;
  for (let k = w.tick % STRIDE; k < fc.length; k += STRIDE) {
    const i = fc[k];
    const v = w.fish[i];
    const warm = Math.min(1, Math.max(0.25, (t.temp[i] + swing * g3.cy[i] + 4) / 18));
    const d = Math.min(1 - v, (0.0022 * v * (1 - v) + 0.00012) * warm * dt);
    w.fish[i] = v + d;
    ledger.grown += d * FISH_E;
  }
  for (let k = w.tick % STRIDE; k < w.bush.length; k += STRIDE) {
    const b = t.bushes[k];
    const T = t.temp[b.cell] + swing * b.y;
    const g = Math.min(1.2, Math.max(0.05, (T - 2) / 14)) * (0.3 + 0.7 * w.wetGrid[regionOf(b.cell)]);
    const v = w.bush[k];
    if (g > 0.14) {
      const d = Math.min(BUSH_MAX - v, (g / (DAY * 0.5)) * dt);
      w.bush[k] = v + d;
      ledger.grown += d * BERRY_E;
    } else if (v > 0) {
      const d = Math.min(v, (0.25 / DAY) * dt);
      w.bush[k] = v - d;
      ledger.lost += d * BERRY_E;
    }
  }
}

function things(w: World): void {
  for (let i = w.fires.length - 1; i >= 0; i--) {
    const f = w.fires[i];
    f.fuel -= DT * (1 + w.rainGrid[regionOf(cellOf(f.x, f.y, f.z))] * 1.5);
    if (f.fuel <= 0) w.fires.splice(i, 1);
  }
  for (let i = w.shelters.length - 1; i >= 0; i--) {
    const s = w.shelters[i];
    s.life -= DT * (s.stone ? 0.25 : 1);
    if (s.life <= 0) w.shelters.splice(i, 1);
  }
  const rot = (list: { energy: number }[], rate: number): void => {
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      const d = Math.min(l.energy, (l.energy * rate + 0.02) * DT);
      l.energy -= d;
      w.ledger.lost += d;
      if (l.energy <= 0.01) {
        w.ledger.lost += l.energy;
        list.splice(i, 1);
      }
    }
  };
  rot(w.carcasses, 1 / (DAY * 0.8));
  rot(w.piles, 1 / (DAY * 2.5));
}

/* ---------------- beliefs ---------------- */

export function findIdea(w: World, kind: Idea["kind"], place: number, who: number, text = "", craft = -1, land = -1): Idea | undefined {
  return w.ideas.find(
    (i) => i.kind === kind && i.place === place && i.who === who && i.craft === craft && (kind !== "lore" || i.text === text) && (kind !== "craft" || i.land === land),
  );
}

export function makeIdea(w: World, kind: Idea["kind"], place: number, who: number, origin: number, text = "", from = -1, craft = -1): Idea {
  const o = w.byId.get(origin);
  const land = o ? o.land : -1;
  const found = findIdea(w, kind, place, who, text, craft, land);
  if (found) return found;
  const idea: Idea = { id: w.ideas.length, kind, place, who, craft, text, origin, t: w.t, land, from, edges: [], beforeIn: 0, beforeTot: 0, afterIn: 0, afterTot: 0 };
  w.ideas.push(idea);
  return idea;
}

/** A creature comes to hold an idea (or holds it more firmly). Returns true if it is new to them. */
export function hold(w: World, c: Creature, idea: Idea, strength: number, from: number): boolean {
  const h = c.beliefs.find((b) => b.idea === idea.id);
  if (h) {
    h.s = Math.min(1, Math.max(h.s, strength) + 0.1);
    return false;
  }
  if (idea.kind === "craft") {
    if (c.knows & (1 << idea.craft)) return false; // it already knows how, under another name
    c.knows |= 1 << idea.craft;
    strength = 1;
  }
  // Believing a place is good and bad at once: the newer belief wins.
  if (idea.kind === "danger" || idea.kind === "good") {
    const other = idea.kind === "danger" ? "good" : "danger";
    c.beliefs = c.beliefs.filter((b) => !(w.ideas[b.idea].kind === other && w.ideas[b.idea].place === idea.place));
  }
  c.beliefs.push({ idea: idea.id, s: Math.min(1, strength), from, t: w.t });
  if (idea.place >= 0) {
    idea.beforeIn += c.at[idea.place];
    idea.beforeTot += c.samples;
  }
  if (c.beliefs.length > 14) {
    // Things it can make are never forgotten; the faintest other belief goes.
    let worst = -1, ws = 9;
    c.beliefs.forEach((b, i) => {
      if (w.ideas[b.idea].kind !== "craft" && b.s < ws) {
        ws = b.s;
        worst = i;
      }
    });
    if (worst >= 0) c.beliefs.splice(worst, 1);
  }
  if (idea.kind === "follow") c.follow = idea.who;
  if (idea.kind === "avoid") c.avoid = idea.who;
  if (from >= 0) {
    idea.edges.push({ a: from, b: c.id, t: w.t });
    if (holders(w, idea.id) >= 3) news(w, idea.kind === "craft" ? "craftSpread" : "spread", idea.origin, -1, idea.place, idea.id, "spread" + idea.id, c);
  }
  return true;
}

export function holders(w: World, ideaId: number): number {
  let n = 0;
  for (const c of w.creatures) if (c.beliefs.some((b) => b.idea === ideaId)) n++;
  return n;
}

/** What a creature's own life teaches it about a place. Clever animals remember; only thinkers can pass it on. */
function learn(w: World, c: Creature, kind: "danger" | "good", strength: number): void {
  if (SPECIES[c.sp].tier < CLEVER) return;
  const p = placeAt(w.terrain, c.x, c.y, c.z);
  if (p < 0) return;
  const idea = makeIdea(w, kind, p, -1, c.id);
  if (hold(w, c, idea, strength, -1) && c.sp === KITH) log(w, c, "believed", p, -1, idea.id);
}

/**
 * One tells another what it believes or knows how to make. Sometimes the
 * listener takes a belief for a different place: that is how a wrong idea
 * starts. Returns the idea the listener ended up with, or null if there was
 * nothing new to tell.
 */
export function tell(w: World, from: Creature, to: Creature, held?: Held): Idea | null {
  const pick =
    held ??
    from.beliefs
      .filter((b) => !to.beliefs.some((t) => t.idea === b.idea) && !(w.ideas[b.idea].kind === "craft" && to.knows & (1 << w.ideas[b.idea].craft)))
      .sort((a, b) => b.s - a.s)[0];
  if (!pick) return null;
  let idea = w.ideas[pick.idea];
  if ((idea.kind === "danger" || idea.kind === "good") && w.rng.next() < 0.12) {
    // Misheard: the nearest other place.
    const here = w.terrain.places[idea.place];
    let best = -1, bd = 1e9;
    for (const p of w.terrain.places) {
      if (p.id === here.id) continue;
      const d = arc(p.x, p.y, p.z, here.x, here.y, here.z) * (p.kind === here.kind ? 0.5 : 1);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    if (best >= 0) idea = makeIdea(w, idea.kind, best, -1, from.id, "", idea.id);
  }
  if (!hold(w, to, idea, Math.max(0.35, pick.s * 0.75), from.id)) return null;
  log(w, from, "told", idea.place, to.id, idea.id);
  log(w, to, idea.kind === "craft" ? "learned" : "heard", idea.place, from.id, idea.id);
  news(w, "firstTold", from.id, to.id, idea.place, idea.id, "firstTold");
  return idea;
}

/** Settles a meeting with no words: the elder tells the younger its firmest belief. */
export function settleMeeting(w: World, m: Meeting): void {
  const a = w.byId.get(m.a);
  const b = w.byId.get(m.b);
  if (!a || !b) return;
  const [elder, younger] = a.born <= b.born ? [a, b] : [b, a];
  if (!tell(w, elder, younger)) tell(w, younger, elder);
}

/* ---------------- making things ---------------- */

/** What a kith could make right now from what it has handled and already knows. */
export function craftOptions(c: Creature): number[] {
  const out: number[] = [];
  for (const k of CRAFTS) {
    if (c.knows & (1 << k.id)) continue;
    if ((c.handled & k.needs) !== k.needs || (c.knows & k.requires) !== k.requires) continue;
    out.push(k.id);
  }
  return out;
}

/** A kith makes something for the first time in its life. `name` is what it calls the thing. */
export function discover(w: World, c: Creature, craft: number, name = ""): Idea | null {
  if (c.knows & (1 << craft) || !craftOptions(c).includes(craft)) return null;
  c.wonder = Math.min(1, c.wonder + 0.05);
  const idea = makeIdea(w, "craft", -1, -1, c.id, name || CRAFTS[craft].plain, -1, craft);
  if (!hold(w, c, idea, 1, -1)) return null;
  const p = placeAt(w.terrain, c.x, c.y, c.z);
  log(w, c, "made", p, -1, idea.id);
  c.pause = 4;
  c.state = 9;
  news(w, idea.origin === c.id ? "invented" : "reinvented", c.id, -1, p, idea.id);
  return idea;
}

/** Settles an attempt with no words: one of the possible things, picked by chance, under its plain name. */
export function settleAttempt(w: World, a: Attempt): Idea | null {
  const c = w.byId.get(a.who);
  if (!c) return null;
  const options = craftOptions(c).filter((o) => a.options.includes(o));
  if (!options.length) return null;
  return discover(w, c, options[w.rng.int(options.length)]);
}

/* ---------------- one creature ---------------- */

/** Fills slot k of tv with the unit direction along the ground from the creature to a point; returns the distance in units. */
function aim(c: Creature, k: number, qx: number, qy: number, qz: number): number {
  const dot = c.x * qx + c.y * qy + c.z * qz;
  const dx = qx - c.x * dot, dy = qy - c.y * dot, dz = qz - c.z * dot;
  const l = Math.hypot(dx, dy, dz);
  const tv = c.tv;
  if (l < 1e-5) {
    tv[k * 3] = tv[k * 3 + 1] = tv[k * 3 + 2] = 0;
    return 0;
  }
  tv[k * 3] = dx / l;
  tv[k * 3 + 1] = dy / l;
  tv[k * 3 + 2] = dz / l;
  return Math.acos(Math.max(-1, Math.min(1, dot))) * R;
}

const hunts = (c: Creature, o: Creature): boolean =>
  SPECIES[c.sp].prey.includes(o.sp) || (c.sp === KITH && (c.knows & (1 << C_SPEAR)) !== 0 && (o.sp === 0 || o.sp === 3));

function die(w: World, c: Creature, cause: string, by = -1): void {
  if (!c.alive) return;
  if (c.avatar) {
    // The visitor's body is not killed: it is struck down, and the visitor is thrown out of it.
    c.health = 0.05;
    w.ctl.down = true;
    return;
  }
  c.alive = false;
  c.died = w.t;
  c.cause = cause;
  w.counts[c.sp]--;
  w.deaths++;
  const st = w.dayStats[c.sp];
  st.deaths++;
  st.ageSum += (w.t - c.born) / DAY;
  w.carcasses.push({ x: c.x, y: c.y, z: c.z, energy: c.energy + SPECIES[c.sp].mass * c.traits.size });
  c.energy = 0;
  const p = placeAt(w.terrain, c.x, c.y, c.z);
  news(w, "firstDeath", c.id, by, p, -1, "firstDeath", c);
  if (c.sp === KITH) news(w, "kithDeath", c.id, by, p, -1, "", c);
  else if (SPECIES[c.sp].tier === CLEVER || cause === "killed") ping(w, "death", c.x, c.y, c.z, -1);
  if (w.counts[c.sp] === 0) news(w, "lastOne", c.id, -1, p, c.sp, "", c);
  // Those who were close to it remember, and the cleverer ones stop for a while.
  const mourn = (id: number, k: LogKind): void => {
    const o = w.byId.get(id);
    if (!o || !o.alive) return;
    log(w, o, k, p, c.id);
    if (o.mate === c.id) o.mate = -1;
    if (SPECIES[o.sp].tier >= CLEVER && arc(o.x, o.y, o.z, c.x, c.y, c.z) < 14) {
      o.pause = 7;
      o.state = 8;
    }
  };
  if (c.mate >= 0) mourn(c.mate, "lostMate");
  if (ageDays(w, c) < SPECIES[c.sp].adultAt * 1.5) {
    mourn(c.mother, "lostChild");
    mourn(c.father, "lostChild");
  }
  for (const k of c.children) mourn(k, "lostParent");
}

function birth(w: World, m: Creature, f: Creature): void {
  const def = SPECIES[m.sp];
  const traits = makeTraits(w.rng, m.traits, f.traits);
  const cost = def.birthEnergy + def.mass * traits.size;
  const mShare = cost * 0.65;
  const fShare = cost - mShare;
  if (m.energy < mShare + 12 || f.energy < fShare + 12) return;
  m.energy -= mShare;
  f.energy -= fShare;
  const c = blank(w, m.sp, m.x, m.y, m.z, traits, inherit(m.brain, f.brain, w.rng));
  c.x += c.hx * (0.7 / R);
  c.y += c.hy * (0.7 / R);
  c.z += c.hz * (0.7 / R);
  const l = Math.hypot(c.x, c.y, c.z);
  c.x /= l;
  c.y /= l;
  c.z /= l;
  if (!canStand(w, c, c.x, c.y, c.z)) {
    c.x = m.x;
    c.y = m.y;
    c.z = m.z;
  }
  c.bx = c.x;
  c.by = c.y;
  c.bz = c.z;
  c.path = [c.x, c.y, c.z];
  c.energy = def.birthEnergy;
  c.mother = m.id;
  c.father = f.id;
  c.gen = Math.max(m.gen, f.gen) + 1;
  c.root = m.root;
  c.homeX = m.homeX;
  c.homeY = m.homeY;
  c.homeZ = m.homeZ;
  c.waterX = m.waterX;
  c.waterY = m.waterY;
  c.waterZ = m.waterZ;
  c.hasWater = m.hasWater;
  c.follow = m.id;
  c.wonder = clamp01((m.wonder + f.wonder) / 2 + w.rng.gauss() * 0.08);
  c.alt = m.alt;
  admit(w, c);
  w.births++;
  w.dayStats[m.sp].births++;
  m.children.push(c.id);
  f.children.push(c.id);
  m.mateCd = f.mateCd = def.mateEvery * DAY * w.rng.range(0.8, 1.25);
  const p = nearestPlace(w.terrain, c.x, c.y, c.z);
  log(w, c, "born", p, m.id, f.id);
  if (m.mate !== f.id) {
    m.mate = f.id;
    f.mate = m.id;
    log(w, m, "mated", p, f.id);
    log(w, f, "mated", p, m.id);
  }
  log(w, m, "child", p, c.id);
  log(w, f, "child", p, c.id);
  news(w, "firstBirth", c.id, m.id, p, m.sp, "firstBirth" + m.sp);
  if (def.tier >= CLEVER) ping(w, "birth", c.x, c.y, c.z, c.id);
  if (c.gen === 3 || c.gen === 6 || c.gen === 10 || c.gen === 15 || c.gen === 25) news(w, "generation", c.id, -1, p, c.gen, `gen${m.sp}-${c.gen}`);
}

/** Parent and child, or children of the same mother: these do not pair. */
function closeKin(a: Creature, b: Creature): boolean {
  return a.mother === b.id || a.father === b.id || b.mother === a.id || b.father === a.id || (a.mother >= 0 && a.mother === b.mother);
}

function nearFire(w: World, x: number, y: number, z: number, r: number): boolean {
  for (const f of w.fires) if (arc(f.x, f.y, f.z, x, y, z) < r) return true;
  return false;
}

/** Looks around, fills the senses, runs the network, and does the once-in-a-while things. */
function sense(w: World, c: Creature, idx: number): void {
  if (c.avatar) return;
  const t = w.terrain;
  const st = statics(w);
  const def = SPECIES[c.sp];
  const sp = c.sp;
  const inp = c.inp;
  const tv = c.tv;
  const cell = cellOf(c.x, c.y, c.z);
  const kindHere = t.kind[cell];
  const sun = sunAt(w, c.x, c.y, c.z);
  const night = clamp01((0.12 - sun) / 0.32);
  const wx = weatherAt(w, c.x, c.y, c.z);
  const torch = (c.knows & (1 << C_TORCH)) !== 0;
  const range = def.sense * c.traits.sense * (def.prey.length || torch ? 1 : 1 - 0.3 * night);
  const r2 = range * range;
  const R2 = R * R;
  tv.fill(0);
  const adult = (c.flags & F_GROWN) !== 0;
  const tier = def.tier;

  // --- others nearby
  let kinN = 0, kinX = 0, kinY = 0, kinZ = 0, kinD = 1e9;
  let threatD = 1e9, threat: Creature | null = null, tX = 0, tY = 0, tZ = 0;
  let preyD = 1e9, prey: Creature | null = null;
  let mateD = 1e9, mateC: Creature | null = null;
  let talk: Creature | null = null;
  const lo = (v: number): number => Math.max(0, ((v * R - range + RR) / BS) | 0);
  const hi = (v: number): number => Math.min(BD - 1, ((v * R + range + RR) / BS) | 0);
  const x0 = lo(c.x), x1 = hi(c.x), y0 = lo(c.y), y1 = hi(c.y), z0 = lo(c.z), z1 = hi(c.z);
  for (let bz = z0; bz <= z1; bz++)
    for (let by = y0; by <= y1; by++)
      for (let bx = x0; bx <= x1; bx++) {
        const bucket = w.buckets[(bz * BD + by) * BD + bx];
        for (let q = 0; q < bucket.length; q++) {
          const j = bucket[q];
          if (j === idx) continue;
          const o = w.creatures[j];
          if (!o.alive) continue;
          const dx = o.x - c.x, dy = o.y - c.y, dz = o.z - c.z;
          const d2 = (dx * dx + dy * dy + dz * dz) * R2;
          if (d2 > r2) continue;
          if (o.sp === sp) {
            kinX += o.x;
            kinY += o.y;
            kinZ += o.z;
            kinN++;
            if (d2 < kinD) kinD = d2;
            if (adult && o.sex !== c.sex && d2 < mateD && (o.flags & F_GROWN) !== 0 && !closeKin(c, o)) {
              mateD = d2;
              mateC = o;
            }
            if (sp === KITH && adult && d2 < 6.5 && o.talkCd <= 0 && (o.flags & F_GROWN) !== 0) talk = o;
            if (o.id === c.avoid && d2 < 36 && d2 * 4 < threatD) {
              threatD = d2 * 4; // unease, not terror
              tX = o.x;
              tY = o.y;
              tZ = o.z;
            }
          } else if (hunts(o, c)) {
            if (d2 < threatD) {
              threatD = d2;
              tX = o.x;
              tY = o.y;
              tZ = o.z;
              threat = o;
            }
          } else if (hunts(c, o)) {
            // Prey is hard to see in the trees, and folk are a second choice.
            const ko = t.kind[cellOf(o.x, o.y, o.z)];
            const ok = ko === FOREST || ko === JUNGLE ? d2 < r2 * 0.3 : true;
            const eff = o.sp === KITH ? d2 * 4 : d2;
            const lit = o.sp === KITH && (o.knows & (1 << C_TORCH)) !== 0;
            if (ok && eff < preyD && !lit && !nearFire(w, o.x, o.y, o.z, 4.5)) {
              preyD = eff;
              prey = o;
            }
          }
        }
      }

  // --- fire and shelter (warmth for folk, fright for hunters)
  let warmD = 1e9, warmX = 0, warmY = 0, warmZ = 0;
  if (sp === KITH || def.prey.length) {
    for (const f of w.fires) {
      const d = arc(f.x, f.y, f.z, c.x, c.y, c.z);
      if (d < warmD) {
        warmD = d;
        warmX = f.x;
        warmY = f.y;
        warmZ = f.z;
      }
    }
    if (sp !== KITH) {
      if (warmD < 7 && warmD * warmD < threatD) {
        threatD = warmD * warmD;
        tX = warmX;
        tY = warmY;
        tZ = warmZ;
      }
    } else {
      for (const s of w.shelters) {
        if (!s.done) continue;
        const d = arc(s.x, s.y, s.z, c.x, c.y, c.z);
        if (d < warmD) {
          warmD = d;
          warmX = s.x;
          warmY = s.y;
          warmZ = s.z;
        }
      }
    }
  }
  const warmth = sp === KITH && warmD < 4 ? 1 - warmD / 4 : 0;

  // --- food
  let foodV = 0;
  c.foodKind = 0;
  c.foodAt = -1;
  // A basis along the ground for looking around: ahead and to the side.
  const sx = c.y * c.hz - c.z * c.hy, sy = c.z * c.hx - c.x * c.hz, sz = c.x * c.hy - c.y * c.hx;
  const look = (a: number, dist: number): number => {
    const k = dist / R, ca = Math.cos(a) * k, sa = Math.sin(a) * k;
    lx = c.x + c.hx * ca + sx * sa;
    ly = c.y + c.hy * ca + sy * sa;
    lz = c.z + c.hz * ca + sz * sa;
    return cellOf(lx, ly, lz);
  };
  let lx = 0, ly = 0, lz = 0;
  const canCarrion = def.carrion || (sp === KITH && (c.knows & (1 << C_BLADE)) !== 0);
  if (canCarrion) {
    let best = r2;
    for (let k = 0; k < w.carcasses.length; k++) {
      const l = w.carcasses[k];
      const dx = l.x - c.x, dy = l.y - c.y, dz = l.z - c.z;
      const d2 = (dx * dx + dy * dy + dz * dz) * R2;
      if (d2 < best && l.energy > 2) {
        best = d2;
        aim(c, VEC.food, l.x, l.y, l.z);
        c.foodKind = 4;
        c.foodAt = k;
      }
    }
    if (c.foodKind === 4) foodV = 1 - Math.sqrt(best) / range;
  }
  if (!c.foodKind && prey) {
    aim(c, VEC.food, prey.x, prey.y, prey.z);
    foodV = 1 - Math.sqrt(Math.min(preyD, r2)) / range;
  }
  const canFish = def.fish || (sp === KITH && (c.knows & (1 << C_NET)) !== 0);
  if (!c.foodKind && canFish && !(sp === KITH && foodV > 0)) {
    let best = w.fish[cell] > 0 ? w.fish[cell] : 0;
    let bx = 0, by = 0, bz = 0, found = false;
    if (best > 0.2) {
      c.foodKind = 5;
      c.foodAt = cell;
    }
    for (let k = 0; k < 18; k++) {
      const ci = look(k * 1.047 + c.id, range * (k < 6 ? 0.3 : k < 12 ? 0.8 : 1.5));
      const v = w.fish[ci] * (k < 6 ? 1 : 0.85);
      if (v > best + 0.15) {
        best = v;
        bx = lx;
        by = ly;
        bz = lz;
        found = true;
      }
    }
    if (found) aim(c, VEC.food, bx, by, bz);
    if (best > foodV) foodV = clamp01(best) * (sp === KITH ? 0.6 : 1);
  }
  if (def.grass > 0 && c.foodKind !== 4) {
    // Grass under foot and around.
    let best = w.grass[cell];
    let bx = 0, by = 0, bz = 0, found = false;
    if (best > 0.1 && !c.foodKind) {
      c.foodKind = 1;
      c.foodAt = cell;
    }
    for (let k = 0; k < 12; k++) {
      const ci = look(k * 0.5236 + c.id, k & 1 ? 2.6 : range * 0.6);
      const v = w.grass[ci] * (k & 1 ? 1 : 0.85);
      if (v > best + 0.12) {
        best = v;
        bx = lx;
        by = ly;
        bz = lz;
        found = true;
      }
    }
    const gv = clamp01(best) * (def.grass < 0.7 ? 0.45 : 1);
    if (gv > foodV) {
      foodV = gv;
      if (found) aim(c, VEC.food, bx, by, bz);
      else tv[0] = tv[1] = tv[2] = 0;
    }
  }
  if (def.fruit && c.foodKind !== 4) {
    // Fruit is much better than grass: head for the fullest bush that is not too far.
    let bestScore = foodV;
    for (let bz = z0; bz <= z1; bz++)
      for (let by = y0; by <= y1; by++)
        for (let bx = x0; bx <= x1; bx++) {
          const g = st.bushes[(bz * BD + by) * BD + bx];
          for (let q = 0; q < g.length; q++) {
            const stock = w.bush[g[q]];
            if (stock < 0.5) continue;
            const b = t.bushes[g[q]];
            const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
            const d2 = (dx * dx + dy * dy + dz * dz) * R2;
            if (d2 > r2) continue;
            const score = (0.3 + (0.7 * stock) / BUSH_MAX) * (1 - (Math.sqrt(d2) / range) * 0.5);
            if (score > bestScore) {
              bestScore = score;
              c.foodKind = 2;
              c.foodAt = g[q];
              aim(c, VEC.food, b.x, b.y, b.z);
            }
          }
        }
    foodV = bestScore;
  }
  if ((def.grass > 0 || def.fruit) && c.foodKind !== 4) {
    for (let k = 0; k < w.piles.length; k++) {
      const l = w.piles[k];
      const dx = l.x - c.x, dy = l.y - c.y, dz = l.z - c.z;
      if ((dx * dx + dy * dy + dz * dz) * R2 < r2 && l.energy > 2) {
        c.foodKind = 3;
        c.foodAt = k;
        aim(c, VEC.food, l.x, l.y, l.z);
        foodV = 1;
        break;
      }
    }
  }

  // --- water: smelt from far off, otherwise from memory
  const g3 = grid();
  const fd = wx.dry && kindHere !== LAKE ? t.freshDist[cell] + 6 : t.freshDist[cell];
  const fn = t.freshNear[cell];
  let waterV = 0;
  if (fd < WATER_SMELL && fn >= 0) {
    if (fd > 1.4) aim(c, VEC.water, g3.cx[fn], g3.cy[fn], g3.cz[fn]);
    waterV = 1 - fd / WATER_SMELL;
  } else if (c.hasWater) {
    aim(c, VEC.water, c.waterX, c.waterY, c.waterZ);
    waterV = 0.12;
  }

  // --- the shining stranger: the visitor, walking among them
  let av: Creature | undefined;
  let avNear = 0, avD = 1e9;
  if (w.avatarId >= 0 && tier >= CLEVER) {
    av = w.byId.get(w.avatarId);
    if (av) {
      avD = arc(av.x, av.y, av.z, c.x, c.y, c.z);
      avNear = avD < range * 1.3 ? 1 - avD / (range * 1.3) : 0;
      if (sp === KITH && !c.metAvatar && avD < 12) {
        c.metAvatar = true;
        c.suspect = Math.min(1, c.suspect + 0.05);
        c.wonder = Math.min(1, c.wonder + 0.05);
        log(w, c, "sawGlow", placeAt(t, c.x, c.y, c.z));
        news(w, "firstSight", c.id, -1, placeAt(t, c.x, c.y, c.z), -1, "firstSight");
        if (w.talkMode === "auto") {
          // No words to decide with: its own boldness and chance settle how it takes the stranger.
          const roll = w.rng.next();
          c.stance = c.traits.bold > 0.66 ? (roll < 0.12 ? 3 : 1) : c.traits.bold < 0.3 ? 2 : roll < 0.6 ? 1 : roll < 0.85 ? 2 : roll < 0.95 ? 4 : 3;
        } else w.sightings.push({ who: c.id, t: w.t });
      }
      // Wary of it: it unsettles like a threat, though less than a hunter does.
      if (c.stance === 2 && avNear > 0 && avD * avD * 1.6 < threatD) {
        threatD = avD * avD * 1.6;
        tX = av.x;
        tY = av.y;
        tZ = av.z;
      }
    }
  }

  // --- kin, threat, home, wander
  if (kinN > 0) aim(c, VEC.kin, kinX, kinY, kinZ);
  const fear = threatD < r2 ? Math.pow(1 - Math.sqrt(threatD) / range, 0.6) : 0;
  if (fear > 0) aim(c, VEC.threat, tX, tY, tZ);
  const homeD = aim(c, VEC.home, c.homeX, c.homeY, c.homeZ);
  // The wandering direction turns a little at a time, and is kept along the ground.
  const turn = w.rng.gauss() * 0.45;
  const ux = c.y * c.wz - c.z * c.wy, uy = c.z * c.wx - c.x * c.wz, uz = c.x * c.wy - c.y * c.wx;
  let nx = c.wx + ux * turn, ny = c.wy + uy * turn, nz = c.wz + uz * turn;
  const nd = nx * c.x + ny * c.y + nz * c.z;
  nx -= nd * c.x;
  ny -= nd * c.y;
  nz -= nd * c.z;
  const nl = Math.hypot(nx, ny, nz) || 1;
  c.wx = tv[VEC.wander * 3] = nx / nl;
  c.wy = tv[VEC.wander * 3 + 1] = ny / nl;
  c.wz = tv[VEC.wander * 3 + 2] = nz / nl;

  // --- whom to keep near
  let followV = 0;
  const fid = c.follow >= 0 ? c.follow : c.mate;
  if (fid >= 0) {
    const o = w.byId.get(fid);
    if (o && o.alive) {
      const d = aim(c, VEC.follow, o.x, o.y, o.z);
      followV = d < 1.5 ? 0 : clamp01(1 - d / 30);
      if (d < 1.5) tv[VEC.follow * 3] = tv[VEC.follow * 3 + 1] = tv[VEC.follow * 3 + 2] = 0;
    } else if (c.follow === fid) c.follow = -1;
  } else if (mateC && adult) {
    aim(c, VEC.follow, mateC.x, mateC.y, mateC.z);
    followV = 1 - Math.sqrt(mateD) / range;
  } else if (adult && c.mateCd <= 0 && (w.tick + c.id) % (THINK_EVERY * 8) < THINK_EVERY) {
    // Nobody in sight: a call carries much further than eyes do.
    let best = 70;
    c.hasCall = false;
    for (const o of w.creatures) {
      if (o.sp !== sp || o.sex === c.sex || !(o.flags & F_GROWN) || o === c) continue;
      const d = arc(o.x, o.y, o.z, c.x, c.y, c.z);
      if (d < best) {
        best = d;
        c.callX = o.x;
        c.callY = o.y;
        c.callZ = o.z;
        c.hasCall = true;
      }
    }
  }
  if (followV === 0 && fid < 0 && !mateC && c.hasCall && adult && c.mateCd <= 0) {
    aim(c, VEC.follow, c.callX, c.callY, c.callZ);
    followV = 0.2;
  }

  // Drawn to the stranger, devoted to it, or set against it: all three close the distance.
  if (av && avNear > 0 && (c.stance === 1 || c.stance === 3 || c.stance === 4)) {
    const keep = c.stance === 1 ? 2.4 : 1.4;
    aim(c, VEC.follow, av.x, av.y, av.z);
    followV = avD < keep ? 0 : Math.max(followV, avNear);
    if (avD < keep) tv[VEC.follow * 3] = tv[VEC.follow * 3 + 1] = tv[VEC.follow * 3 + 2] = 0;
    if (c.stance === 3 && avD < 1.9 && w.rng.next() < 0.25) {
      av.health -= 0.09;
      if (!(c.flags & F_STRUCK)) {
        c.flags |= F_STRUCK;
        log(w, c, "struckGlow", placeAt(t, c.x, c.y, c.z));
      }
      ping(w, "strike", av.x, av.y, av.z, c.id);
      if (av.health <= 0) die(w, av, "killed", c.id);
    }
  }

  // --- what it believes or remembers about places (clever kinds and folk)
  let dangerV = 0, goodV = 0;
  if (tier >= CLEVER && c.beliefs.length) {
    const want = Math.max(1 - c.energy / def.maxEnergy, c.thirst);
    for (const h of c.beliefs) {
      const idea = w.ideas[h.idea];
      if (idea.place < 0) continue;
      const p = t.places[idea.place];
      const d = arc(p.x, p.y, p.z, c.x, c.y, c.z);
      if (idea.kind === "danger") {
        const v = h.s * clamp01(1.6 - d / (p.r * 1.25));
        if (v > dangerV) {
          dangerV = v;
          aim(c, VEC.dangerPlace, p.x, p.y, p.z);
        }
      } else if (idea.kind === "good") {
        const v = h.s * (0.35 + 0.65 * want) * (d < p.r * 0.5 || d > 70 ? 0 : 1);
        if (v > goodV) {
          goodV = v;
          aim(c, VEC.goodPlace, p.x, p.y, p.z);
        }
      }
    }
  }
  if (warmD < 20 && sp === KITH) aim(c, VEC.warm, warmX, warmY, warmZ);
  // --- something new the visitor put here
  let novelV = 0;
  if (av && c.stance === 0 && avNear > 0 && avD > 2.5) {
    // Not yet decided about the stranger: it is the newest thing there is.
    novelV = avNear;
    aim(c, VEC.novel, av.x, av.y, av.z);
  }
  if (tier >= CLEVER) {
    for (const nv of w.novel) {
      const d = arc(nv.x, nv.y, nv.z, c.x, c.y, c.z);
      if (d < range * 1.5 && d > 2 && 1 - d / (range * 1.5) > novelV) {
        novelV = 1 - d / (range * 1.5);
        aim(c, VEC.novel, nv.x, nv.y, nv.z);
      }
    }
  }

  // --- how it feels
  const alt = Math.max(0, t.height[cell] - 2);
  const cloak = c.knows & (1 << C_CLOAK) ? 9 : 0;
  const felt = wx.temp - alt * 0.4 + warmth * 10 + Math.min(kinN, 4) * 1.4 + (kindHere === FOREST || kindHere === JUNGLE ? 1.5 : 0) + cloak;
  const cold = clamp01((def.comfort - felt) / 14);
  const eFrac = c.energy / def.maxEnergy;
  const ready = adult && c.mateCd <= 0 && eFrac > def.mateAt && kinN < def.crowd && w.creatures.length < MAX_CREATURES && w.counts[sp] < MAX_PER_KIND ? 1 : 0;
  inp[IN.hunger] = 1 - eFrac;
  inp[IN.thirst] = c.thirst;
  inp[IN.tired] = c.tired;
  inp[IN.fear] = fear;
  inp[IN.cold] = cold;
  inp[IN.night] = night;
  inp[IN.foodNear] = foodV;
  inp[IN.waterNear] = waterV;
  inp[IN.kinNear] = kinN ? 1 - Math.sqrt(kinD) / range : 0;
  inp[IN.crowd] = Math.min(1, kinN / 6);
  inp[IN.mateReady] = ready;
  inp[IN.age] = Math.min(1, (w.t - c.born) / (def.lifespan * DAY));
  inp[IN.homeFar] = Math.min(1, homeD / 30);
  inp[IN.hurt] = 1 - c.health;
  inp[IN.dangerBelief] = dangerV;
  inp[IN.goodBelief] = goodV;
  inp[IN.warmNear] = warmth;
  inp[IN.carrying] = c.carrying;
  inp[IN.followNear] = followV;
  inp[IN.wet] = wx.rain;
  inp[IN.novel] = novelV;

  think(c.brain, inp, c.out, c.hid);
  const out = c.out;

  // ---------- things decided a few times a second ----------
  const here = placeAt(t, c.x, c.y, c.z);
  const dtT = DT * THINK_EVERY;

  // Growing up, growing old.
  const age = (w.t - c.born) / DAY;
  if (!adult && age >= def.adultAt) {
    c.flags |= F_GROWN;
    if (c.follow === c.mother) c.follow = -1;
    log(w, c, "grown", here);
    if (sp === KITH) {
      // What its mother can make, she has shown it by now.
      const m = w.byId.get(c.mother);
      if (m) c.suspect = Math.max(c.suspect, m.suspect * 0.6);
      if (m) for (const h of m.beliefs) if (w.ideas[h.idea].kind === "craft" && w.rng.next() < 0.8 && hold(w, c, w.ideas[h.idea], 1, m.id)) log(w, c, "learned", here, m.id, h.idea);
    }
  }
  if (age > def.lifespan * (0.82 + 0.3 * ((c.id * 0.6180339) % 1)) && w.rng.next() < dtT / (DAY * 0.6)) {
    die(w, c, "age");
    return;
  }

  // Feeling the cold and the dry for the first time.
  if (cold > 0.55 && !(c.flags & F_COLD)) {
    c.flags |= F_COLD;
    log(w, c, "snow", here);
  }
  if (wx.dry && c.thirst > 0.6 && !(c.flags & F_DROUGHT)) {
    c.flags |= F_DROUGHT;
    log(w, c, "drought", here);
  }

  // Near misses, and what they teach.
  if (eFrac < 0.12 && !(c.flags & F_HUNGRY)) {
    c.flags |= F_HUNGRY;
    log(w, c, "hungry", here);
  } else if (eFrac > 0.55 && c.flags & F_HUNGRY) {
    c.flags &= ~F_HUNGRY;
    log(w, c, "fed", here);
    learn(w, c, "good", 0.7);
  }
  if (c.thirst > 0.9 && !(c.flags & F_PARCHED)) {
    c.flags |= F_PARCHED;
    log(w, c, "parched", here);
  } else if (c.thirst < 0.3 && c.flags & F_PARCHED) {
    c.flags &= ~F_PARCHED;
    log(w, c, "drank", here);
    learn(w, c, "good", 0.7);
  }
  if (fear > 0.75) c.flags |= F_FLED;
  else if (fear < 0.05 && c.flags & F_FLED) {
    c.flags &= ~F_FLED;
    if (threat === null && w.rng.next() < 0.5) {
      log(w, c, "escaped", here);
      learn(w, c, "danger", 0.55);
    }
  }
  if (here >= 0 && !(c.seen & (1 << here))) {
    c.seen |= 1 << here;
    c.wonder = Math.min(1, c.wonder + 0.02);
    log(w, c, "reached", here);
  }
  if (kindHere === RIVER && !(c.flags & F_WADED) && !def.air && !def.sea) {
    c.flags |= F_WADED;
    log(w, c, "waded", here);
    if (sp === KITH) news(w, "firstWade", c.id, -1, here, -1, "firstWade");
  }
  // Crossing the sea, and coming ashore somewhere new.
  if (sp === KITH) {
    if (kindHere === SEA && !(c.flags & F_SAILED)) {
      c.flags |= F_SAILED;
      log(w, c, "sailed", nearestPlace(t, c.x, c.y, c.z));
      news(w, "firstSail", c.id, -1, -1, -1, "firstSail");
    }
    const landNow = t.land[cell];
    if (landNow >= 0 && landNow !== c.land) {
      if (c.land >= 0) {
        log(w, c, "landed", nearestPlace(t, c.x, c.y, c.z));
        news(w, "landfall", c.id, -1, nearestPlace(t, c.x, c.y, c.z), landNow, `landfall${landNow}-${c.land}`);
      }
      c.land = landNow;
    }
  } else if (t.land[cell] >= 0) c.land = t.land[cell];

  // Where it has been: a point now and then, for drawing its path.
  if ((w.tick + c.id * 7) % 240 < THINK_EVERY) {
    const n = c.path.length;
    if (n < 3 || arc(c.path[n - 3], c.path[n - 2], c.path[n - 1], c.x, c.y, c.z) > 2.5) {
      c.path.push(c.x, c.y, c.z);
      if (c.path.length > 3 * 220) c.path.splice(3, 3);
    }
  }

  // Home drifts to where life is lived.
  if (c.state === 1 || c.state === 2 || c.state === 3) {
    c.homeX += (c.x - c.homeX) * 0.025;
    c.homeY += (c.y - c.homeY) * 0.025;
    c.homeZ += (c.z - c.homeZ) * 0.025;
    const hl = Math.hypot(c.homeX, c.homeY, c.homeZ);
    c.homeX /= hl;
    c.homeY /= hl;
    c.homeZ /= hl;
  }

  // Breeding.
  if (ready && out[OUT.mate] > 0 && mateC && mateD < (def.air || def.sea ? 49 : 16)) {
    const o = mateC;
    const od = SPECIES[o.sp];
    if (o.mateCd <= 0 && o.out[OUT.mate] > 0 && o.energy / od.maxEnergy > od.mateAt) {
      const [m, f] = c.sex === 0 ? [c, o] : [o, c];
      birth(w, m, f);
      if (tier === 0 && w.rng.next() < (def.air || def.sea ? 0.4 : 0.2)) birth(w, m, f);
    }
  }

  // A hunter strikes.
  if (prey && c.foodKind !== 4 && out[OUT.eat] > 0) {
    const victim = prey;
    if (arc(victim.x, victim.y, victim.z, c.x, c.y, c.z) < (sp === KITH ? 2.6 : 1.8)) {
      let herd = 0;
      for (const j of w.buckets[bucketOf(victim.x, victim.y, victim.z)]) {
        const o = w.creatures[j];
        if (o.sp === victim.sp && o !== victim && arc(o.x, o.y, o.z, victim.x, victim.y, victim.z) < 4) herd++;
      }
      const safe = victim.sp === KITH && victim.state === 3 && w.shelters.some((s) => s.done && arc(s.x, s.y, s.z, victim.x, victim.y, victim.z) < 1.6);
      const chance = safe ? 0 : (0.5 / (1 + 0.25 * herd)) * (victim.state === 3 ? 1.5 : 1) * (isAdult(w, victim) ? 1 : 1.4);
      c.tired = Math.min(1, c.tired + 0.06);
      if (w.rng.next() < chance) {
        victim.health -= isAdult(w, victim) ? 0.55 : 1;
        if (victim.health <= 0) {
          die(w, victim, "killed", c.id);
          c.kills++;
          if (c.kills === 1) log(w, c, sp === KITH ? "hunted" : "kill", here, victim.id);
          news(w, sp === KITH ? "firstHunt" : "firstKill", c.id, victim.id, here, victim.sp, sp === KITH ? "firstHunt" : "firstKill");
          ping(w, "hunt", victim.x, victim.y, victim.z, c.id);
          // Everyone of the victim's kind close enough to see it remembers the kill.
          for (const o of w.creatures) {
            if (!o.alive || o.sp !== victim.sp || o === victim || SPECIES[o.sp].tier < CLEVER) continue;
            if (arc(o.x, o.y, o.z, victim.x, victim.y, victim.z) > 10) continue;
            if (o.sp === KITH) log(w, o, "sawKill", here, victim.id, c.id);
            const was = [o.x, o.y, o.z];
            learn(w, o, "danger", 0.9);
            void was;
          }
        } else {
          if (victim.sp === KITH) log(w, victim, "hurt", here, c.id);
          learn(w, victim, "danger", 0.8);
        }
      }
    }
  }

  // Folk things.
  if (sp === KITH) {
    // What it has had in its hands.
    if (kindHere === MOUNTAIN) c.handled |= M.stone;
    if (kindHere === BEACH) c.handled |= M.shell;
    if (t.freshDist[cell] < 2) c.handled |= M.clay;
    if (kindHere === PLAINS && w.grass[cell] > 0.5) c.handled |= M.fibre;
    if (kindHere === JUNGLE) c.handled |= M.fibre;
    if (c.carrying) c.handled |= M.wood;
    if (warmth > 0.5 && w.fires.length) c.handled |= M.fire;
    if (c.state === 1 && c.foodKind === 2) c.handled |= M.seed;
    if (!(c.handled & M.stone)) for (const ri of st.rocks[bucketOf(c.x, c.y, c.z)]) if (arc(t.rocks[ri].x, t.rocks[ri].y, t.rocks[ri].z, c.x, c.y, c.z) < 2.2) c.handled |= M.stone;
    if (!(c.handled & M.bone)) for (const l of w.carcasses) if (arc(l.x, l.y, l.z, c.x, c.y, c.z) < 2.2) c.handled |= M.bone;
    if (c.state === 1 && c.foodKind === 4) c.handled |= M.hide;

    kithActs(w, c, here, wx.rain);
    if (talk && adult && c.talkCd <= 0 && fear < 0.2 && c.pause <= 0 && c.state !== 3) {
      c.talkCd = talk.talkCd = DAY * w.rng.range(0.5, 0.9);
      c.pause = talk.pause = 5;
      c.state = talk.state = 6;
      const m: Meeting = { id: w.tick * 1000 + (c.id % 1000), a: c.id, b: talk.id, t: w.t };
      log(w, c, "met", here, talk.id);
      log(w, talk, "met", here, c.id);
      news(w, "firstMeet", c.id, talk.id, here, -1, "firstMeet");
      // What one suspects about the world, the other comes to share in part.
      const [more, less] = c.suspect >= talk.suspect ? [c, talk] : [talk, c];
      less.suspect += (more.suspect - less.suspect) * 0.25;
      if (c.bornLand !== talk.bornLand && c.root !== talk.root) {
        log(w, c, "stranger", here, talk.id);
        log(w, talk, "stranger", here, c.id);
        news(w, "groupsMet", c.id, talk.id, here, -1, `groups${Math.min(c.bornLand, talk.bornLand)}-${Math.max(c.bornLand, talk.bornLand)}`);
      }
      ping(w, "talk", c.x, c.y, c.z, c.id);
      if (w.talkMode === "auto") settleMeeting(w, m);
      else w.meetings.push(m);
    }
    if (c.suspect > 0.5) news(w, "suspects", c.id, -1, here, -1, "suspects50");
    if (c.suspect > 0.9) news(w, "knows", c.id, -1, here, -1, "suspects90");
    // Beliefs fade unless life renews them. What it can make, it keeps.
    if (c.beliefs.length && w.rng.next() < dtT / DAY) {
      for (const h of c.beliefs) if (w.ideas[h.idea].kind !== "craft") h.s -= 0.03;
      c.beliefs = c.beliefs.filter((h) => h.s > 0.12);
    }
  }
  // Sample where it is, so a belief's effect can be measured: before it was held, and since.
  if (tier >= CLEVER && (w.tick / THINK_EVERY) % 5 < 1) {
    c.samples++;
    if (here >= 0) c.at[here]++;
    for (const h of c.beliefs) {
      const idea = w.ideas[h.idea];
      if (idea.place < 0) continue;
      idea.afterTot++;
      if (here === idea.place) idea.afterIn++;
    }
  }
}

function kithActs(w: World, c: Creature, here: number, rain: number): void {
  const out = c.out;
  const t = w.terrain;
  const st = statics(w);
  if (c.tinkerCd > 0) c.tinkerCd -= DT * THINK_EVERY;
  // Trying things: turning over what it has handled until something comes of it.
  if (out[OUT.tinker] > 0.25 && c.tinkerCd <= 0 && c.state !== 3 && c.inp[IN.fear] < 0.2 && c.flags & F_GROWN) {
    c.tinkerCd = DAY * w.rng.range(1.2, 2.4) * (1.3 - 0.6 * c.wonder);
    const options = craftOptions(c);
    if (options.length && w.rng.next() < 0.04 + 0.1 * c.wonder) {
      const a: Attempt = { id: w.tick * 1000 + (c.id % 1000), who: c.id, t: w.t, options };
      c.pause = 4;
      c.state = 9;
      if (w.talkMode === "auto") settleAttempt(w, a);
      else w.attempts.push(a);
    }
  }
  if (c.markCd > 0) return;
  if (!c.carrying && out[OUT.gather] > 0.2) {
    // Pick up wood if a tree is within reach.
    for (const ti of st.trees[bucketOf(c.x, c.y, c.z)]) {
      const tr = t.trees[ti];
      if (w.felled[ti] <= w.t && arc(tr.x, tr.y, tr.z, c.x, c.y, c.z) < 1.8) {
        c.carrying = 1;
        c.markCd = 3;
        // Three loads of wood bring a tree down. It grows back in time.
        if (++w.cuts[ti] >= 3) {
          w.cuts[ti] = 0;
          w.felled[ti] = w.t + DAY * 7;
          log(w, c, "felled", here);
          news(w, "firstFell", c.id, -1, here, -1, "firstFell");
        }
        return;
      }
    }
  }
  const k = t.kind[cellOf(c.x, c.y, c.z)];
  const dry = k !== RIVER && k !== LAKE && k !== SHALLOW && k !== SEA;
  if (c.carrying && out[OUT.fire] > 0.3 && out[OUT.fire] >= out[OUT.shelter]) {
    let fed = false;
    for (const f of w.fires) {
      if (arc(f.x, f.y, f.z, c.x, c.y, c.z) < 3) {
        if (f.fuel < DAY * 0.5) {
          f.fuel += DAY * 0.45;
          fed = true;
          c.carrying = 0;
        } else return; // it burns well enough; keep the wood
        break;
      }
    }
    if (!fed && c.carrying && rain < 0.5 && w.fires.length < 60 && dry) {
      w.fires.push({ x: c.x + (c.hx * 0.6) / R, y: c.y + (c.hy * 0.6) / R, z: c.z + (c.hz * 0.6) / R, fuel: DAY * 0.5, by: c.id });
      c.carrying = 0;
      c.handled |= M.fire;
      log(w, c, "fire", here);
      news(w, "firstFire", c.id, -1, here, -1, "firstFire");
    }
    c.markCd = 4;
    return;
  }
  if (c.carrying && out[OUT.shelter] > 0.3) {
    let site = w.shelters.find((s) => arc(s.x, s.y, s.z, c.x, c.y, c.z) < 3);
    const nearHome = arc(c.homeX, c.homeY, c.homeZ, c.x, c.y, c.z) < 8;
    if (!site && nearHome && w.shelters.length < 160 && dry && k !== MOUNTAIN && !w.shelters.some((s) => arc(s.x, s.y, s.z, c.x, c.y, c.z) < 3.4)) {
      site = { x: c.x, y: c.y, z: c.z, wood: 0, done: false, life: DAY * 4, by: c.id, stone: (c.knows & (1 << C_STONEHUT)) !== 0 };
      w.shelters.push(site);
    }
    if (site) {
      site.wood++;
      site.life = Math.min(DAY * 14, site.life + DAY * 2.5);
      c.carrying = 0;
      c.markCd = 4;
      if (!site.done && site.wood >= 3) {
        site.done = true;
        log(w, c, "shelter", here);
        news(w, "firstShelter", c.id, -1, here, -1, "firstShelter");
      }
    }
    return;
  }
  if (out[OUT.mark] > 0.55 && dry && !w.markers.some((m) => arc(m.x, m.y, m.z, c.x, c.y, c.z) < 8)) {
    w.markers.push({ x: c.x, y: c.y, z: c.z, by: c.id, t: w.t });
    if (w.markers.length > 80) w.markers.shift();
    c.markCd = DAY;
    log(w, c, "marker", here);
    news(w, "firstMarker", c.id, -1, here, -1, "firstMarker");
  }
}

/** Moves, eats, drinks, rests and pays for it: every step. */
function act(w: World, c: Creature): void {
  if (c.avatar) {
    moveAvatar(w, c);
    return;
  }
  const def = SPECIES[c.sp];
  const out = c.out;
  const tv = c.tv;
  const t = w.terrain;
  const sp = c.sp;
  const size = c.traits.size;
  const inp = c.inp;
  const fear = inp[IN.fear];
  const led = w.ledger;
  if (c.mateCd > 0) c.mateCd -= DT;
  if (c.talkCd > 0) c.talkCd -= DT;
  if (c.markCd > 0) c.markCd -= DT;
  const cell = cellOf(c.x, c.y, c.z);
  const k = t.kind[cell];
  const grown = (c.flags & F_GROWN) !== 0;

  let pace = 0;
  let state = 0;
  const resting = out[OUT.rest] > 0.25 && fear < 0.35;
  if (c.pause > 0) {
    c.pause -= DT;
    state = c.state >= 6 ? c.state : 6;
  } else if (resting) {
    state = 3;
    c.tired = Math.max(0, c.tired - DT * 0.03);
  } else {
    let dx = 0, dy = 0, dz = 0;
    for (let v = 0; v < N_VEC; v++) {
      const o = out[v];
      dx += o * tv[v * 3];
      dy += o * tv[v * 3 + 1];
      dz += o * tv[v * 3 + 2];
    }
    // Play: the young of every kind, and the clever at any age, run rings round each other when nothing presses.
    const playing = out[OUT.play] > 0.3 && (!grown || def.tier >= CLEVER) && fear < 0.1 && inp[IN.hunger] < 0.5;
    if (playing) {
      const a = w.t * 2.2 + c.id;
      const sxp = c.y * c.wz - c.z * c.wy, syp = c.z * c.wx - c.x * c.wz, szp = c.x * c.wy - c.y * c.wx;
      dx = dx * 0.3 + c.wx * Math.cos(a) + sxp * Math.sin(a);
      dy = dy * 0.3 + c.wy * Math.cos(a) + syp * Math.sin(a);
      dz = dz * 0.3 + c.wz * Math.cos(a) + szp * Math.sin(a);
    }
    if (c.detour > 0) {
      // Something was in the way: walk round it for a moment before trying again.
      c.detour -= DT;
      dx = c.wx;
      dy = c.wy;
      dz = c.wz;
    }
    const mag = Math.hypot(dx, dy, dz);
    if (mag > 0.06) {
      const want = Math.min(1, Math.max(0.12, 0.5 + 0.5 * out[OUT.speed])) * Math.min(1, mag * 1.6);
      // Turn towards where it wants to go, staying along the ground.
      const turn = Math.min(1, DT * 5);
      let hx = c.hx + (dx / mag - c.hx) * turn, hy = c.hy + (dy / mag - c.hy) * turn, hz = c.hz + (dz / mag - c.hz) * turn;
      const hd = hx * c.x + hy * c.y + hz * c.z;
      hx -= hd * c.x;
      hy -= hd * c.y;
      hz -= hd * c.z;
      const hl = Math.hypot(hx, hy, hz) || 1;
      c.hx = hx /= hl;
      c.hy = hy /= hl;
      c.hz = hz /= hl;
      let v = def.speed * c.traits.speed * want;
      if (!def.air && !def.sea) v *= k === RIVER || k === SHALLOW ? 0.5 : k === LAKE || k === SEA ? 0.45 : k === MOUNTAIN ? 0.7 : k === FOREST || k === JUNGLE ? 0.9 : 1;
      if (!grown) v *= 0.85;
      if (c.tired > 0.85) v *= 0.75;
      v *= 0.55 + 0.45 * c.health;
      if (c.state === 1) v *= 0.5; // it cannot eat and hurry at once
      const s = (v * DT) / R;
      let nx = c.x + hx * s, ny = c.y + hy * s, nz = c.z + hz * s;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      if (canStand(w, c, nx, ny, nz)) {
        c.x = nx;
        c.y = ny;
        c.z = nz;
      } else {
        // Blocked: turn back the way it came, more or less, and walk that way a while.
        const side = w.rng.range(-1.2, 1.2);
        const ux = c.y * hz - c.z * hy, uy = c.z * hx - c.x * hz, uz = c.x * hy - c.y * hx;
        c.wx = -hx * Math.cos(side) + ux * Math.sin(side);
        c.wy = -hy * Math.cos(side) + uy * Math.sin(side);
        c.wz = -hz * Math.cos(side) + uz * Math.sin(side);
        c.detour = 2.5;
      }
      pace = want;
      state = fear > 0.4 ? 4 : playing ? 7 : inp[IN.foodNear] > 0 && out[VEC.food] > 0.3 && c.foodKind === 0 && (def.prey.length > 0 || (sp === KITH && c.knows & (1 << C_SPEAR))) ? 5 : 0;
      c.tired = Math.min(1, Math.max(0, c.tired + DT * (0.002 + def.tire * want * want - 0.012 * (1 - want))));
    }
  }
  c.pace = pace;

  // Eating: only when it chooses to, and only what is within reach.
  const basket = sp === KITH && c.knows & (1 << C_BASKET) ? 1.5 : 1;
  const maxE = def.maxEnergy * basket;
  if (out[OUT.eat] > 0 && (c.foodKind || def.grass > 0) && state !== 4 && state < 6 && c.energy < maxE - 1) {
    let took = 0;
    let eff = def.digest;
    const want = Math.min(def.bite * size * DT, (maxE - c.energy) / eff);
    if (c.foodKind === 2) {
      const b = t.bushes[c.foodAt];
      if (arc(b.x, b.y, b.z, c.x, c.y, c.z) < 1.5) {
        took = Math.min(want, w.bush[c.foodAt] * BERRY_E);
        w.bush[c.foodAt] -= took / BERRY_E;
        // Those who know sowing leave the ground richer where they eat.
        if (c.knows & (1 << C_SOW) && w.bush[c.foodAt] < BUSH_MAX - 0.02) {
          const add = Math.min(BUSH_MAX - w.bush[c.foodAt], took / BERRY_E * 0.35);
          w.bush[c.foodAt] += add;
          led.grown += add * BERRY_E;
        }
      }
    } else if (c.foodKind === 3 || c.foodKind === 4) {
      const l = (c.foodKind === 3 ? w.piles : w.carcasses)[c.foodAt];
      if (l && arc(l.x, l.y, l.z, c.x, c.y, c.z) < 1.5) {
        took = Math.min(want, l.energy);
        l.energy -= took;
      }
    } else if (c.foodKind === 5) {
      // Sea life: under it if it flies or swims, or within a net's throw of the water's edge.
      const i = sp === KITH ? c.foodAt : cell;
      if (w.fish[i] > 0.05 && (sp !== KITH || arc(grid().cx[i], grid().cy[i], grid().cz[i], c.x, c.y, c.z) < 3.2)) {
        took = Math.min(want, (w.fish[i] - 0.04) * FISH_E);
        w.fish[i] -= took / FISH_E;
      }
    }
    if (took <= 0 && def.grass > 0 && w.grass[cell] > 0.05) {
      // Nothing better within reach: the grass under foot.
      took = Math.min(want, (w.grass[cell] - 0.03) * GRASS_E);
      w.grass[cell] -= took / GRASS_E;
      eff = def.grass + (sp === KITH && c.knows & (1 << C_DIGGER) ? 0.25 : 0);
    }
    if (took > 0) {
      if (sp === KITH && c.knows & (1 << C_COOK) && inp[IN.warmNear] > 0.2) eff = Math.min(0.97, eff + 0.1);
      c.energy += took * eff;
      led.lost += took * (1 - eff);
      if (state !== 3) state = 1;
    }
  }

  // Drinking: at fresh water, or a little from the rain.
  if (out[OUT.drink] > 0 && t.freshDist[cell] < 1.9 && c.thirst > 0.02 && k !== ICE) {
    c.thirst = Math.max(0, c.thirst - DT * 0.22);
    c.waterX = c.x;
    c.waterY = c.y;
    c.waterZ = c.z;
    c.hasWater = true;
    if (state === 0) state = 2;
  }
  const pot = sp === KITH && c.knows & (1 << C_POT) ? 0.5 : 1;
  const hot = Math.max(0, t.temp[cell] - def.hot + 8) / 20;
  c.thirst = Math.max(0, Math.min(1, c.thirst + (DT / (def.thirstDays * DAY)) * (1 + 0.5 * pace + hot) * pot - inp[IN.wet] * DT * 0.004));

  // The cost of living.
  const cold = inp[IN.cold];
  let burn = def.burn * size * (state === 3 ? 0.6 : 1) * (1 + 1.3 * pace * pace) * (1 + 0.8 * cold) * DT;
  if (burn > c.energy) burn = c.energy;
  c.energy -= burn;
  led.burned += burn;

  // Body.
  if (c.energy <= 0.001) c.health -= DT * 0.02;
  else if (c.thirst >= 1) c.health -= DT * 0.008;
  else if (cold > 0.7) c.health -= (DT * 0.006 * (cold - 0.7)) / 0.3;
  else if (c.health < 1) c.health = Math.min(1, c.health + DT * 0.006);
  c.state = state;

  if (def.air) {
    const target = state === 3 ? 0 : state === 1 || state === 2 ? 0.25 : 3.2;
    c.alt += (target - c.alt) * Math.min(1, DT * 1.6);
  }
  if (c.health <= 0) die(w, c, c.energy <= 0.001 ? "hunger" : c.thirst >= 1 ? "thirst" : "cold");
}

/** The visitor's body: it goes where the visitor steers it. It needs nothing, and mends by itself. */
function moveAvatar(w: World, c: Creature): void {
  const k = w.ctl;
  const t = w.terrain;
  if (c.health < 1) c.health = Math.min(1, c.health + DT * 0.012);
  let dx = k.x, dy = k.y, dz = k.z;
  const d = dx * c.x + dy * c.y + dz * c.z;
  dx -= d * c.x;
  dy -= d * c.y;
  dz -= d * c.z;
  const mag = Math.hypot(dx, dy, dz);
  c.state = 0;
  if (mag < 0.01) {
    c.pace = 0;
    return;
  }
  const turn = Math.min(1, DT * 9);
  let hx = c.hx + (dx / mag - c.hx) * turn, hy = c.hy + (dy / mag - c.hy) * turn, hz = c.hz + (dz / mag - c.hz) * turn;
  const hd = hx * c.x + hy * c.y + hz * c.z;
  hx -= hd * c.x;
  hy -= hd * c.y;
  hz -= hd * c.z;
  const hl = Math.hypot(hx, hy, hz) || 1;
  c.hx = hx /= hl;
  c.hy = hy /= hl;
  c.hz = hz /= hl;
  const cell = cellOf(c.x, c.y, c.z);
  const kind = t.kind[cell];
  const wet = kind === SEA || kind === SHALLOW || kind === LAKE || kind === RIVER;
  const v = (k.run ? 4.6 : 2.7) * (wet ? 0.55 : kind === MOUNTAIN ? 0.8 : 1);
  const s = (v * DT) / R;
  const nx = c.x + hx * s, ny = c.y + hy * s, nz = c.z + hz * s;
  const nl = Math.hypot(nx, ny, nz);
  c.x = nx / nl;
  c.y = ny / nl;
  c.z = nz / nl;
  c.pace = k.run ? 1 : 0.6;
  if (t.land[cell] >= 0) c.land = t.land[cell];
  if (w.tick % 200 === 0) {
    c.path.push(c.x, c.y, c.z);
    if (c.path.length > 3 * 220) c.path.splice(3, 3);
  }
}

/**
 * The visitor takes a body of their own: one of the kith in shape, but shining,
 * born of no one. Returns it, or null if there is no room.
 */
export function takeAvatar(w: World, x: number, y: number, z: number): Creature | null {
  if (w.avatarId >= 0 || w.creatures.length >= MAX_CREATURES) return null;
  const l = Math.hypot(x, y, z);
  const c = blank(w, KITH, x / l, y / l, z / l, makeTraits(w.rng), founderBrain(KITH, w.rng));
  c.avatar = true;
  c.root = c.id;
  c.energy = SPECIES[KITH].maxEnergy * 0.8;
  c.flags |= F_GROWN;
  c.mateCd = c.talkCd = 1e12;
  c.knows = 1 << C_RAFT; // it can cross water
  c.traits.hue = 0;
  w.ledger.given += c.energy + SPECIES[KITH].mass * c.traits.size;
  admit(w, c);
  w.avatarId = c.id;
  w.ctl = { x: 0, y: 0, z: 0, run: false, down: false };
  news(w, "avatar", c.id, -1, nearestPlace(w.terrain, c.x, c.y, c.z), -1, "avatar");
  return c;
}

/** The visitor leaves that body. It is gone from the world; those who saw it remember. */
export function leaveAvatar(w: World): void {
  const c = w.byId.get(w.avatarId);
  w.avatarId = -1;
  w.sightings = [];
  if (!c) return;
  w.ledger.lost += c.energy + SPECIES[KITH].mass * c.traits.size;
  w.counts[KITH]--;
  w.byId.delete(c.id);
  w.gone.set(c.id, c);
  c.alive = false;
  c.died = w.t;
  c.cause = "left";
  const i = w.creatures.indexOf(c);
  if (i >= 0) w.creatures.splice(i, 1);
}

/* ---------------- the step ---------------- */

export function step(w: World): void {
  w.t += DT;
  w.tick++;
  environment(w);
  weather(w);
  plants(w);
  things(w);

  const cs = w.creatures;
  for (const b of w.buckets) b.length = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    w.buckets[bucketOf(c.x, c.y, c.z)].push(i);
  }
  const n = cs.length; // newborns wait for the next step
  for (let i = 0; i < n; i++) {
    const c = cs[i];
    if (!c.alive) continue;
    if ((w.tick + c.id) % THINK_EVERY === 0) sense(w, c, i);
    if (c.alive) act(w, c);
  }
  // Clear away the dead.
  let k = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.alive) cs[k++] = c;
    else {
      w.byId.delete(c.id);
      w.gone.set(c.id, c);
    }
  }
  cs.length = k;
  if (w.gone.size > 900) {
    for (const [id, c] of w.gone) {
      if (c.sp !== KITH || w.gone.size > 1800) w.gone.delete(id);
      if (w.gone.size <= 700) break;
    }
  }
  // Meetings and makings nobody wrote words for settle themselves after a while.
  while (w.meetings.length && w.t - w.meetings[0].t > DAY * 0.3) settleMeeting(w, w.meetings.shift() as Meeting);
  while (w.attempts.length && w.t - w.attempts[0].t > DAY * 0.3) settleAttempt(w, w.attempts.shift() as Attempt);
  while (w.sightings.length && w.t - w.sightings[0].t > DAY * 0.15) {
    const c = w.byId.get((w.sightings.shift() as { who: number }).who);
    if (c && c.stance === 0) c.stance = c.traits.bold > 0.5 ? 1 : 2;
  }

  // Once a day: how each kind is doing.
  const day = dayOf(w.t);
  if (dayOf(w.t - DT) !== day) {
    for (let sp = 0; sp < N_SPECIES; sp++) {
      const s = w.dayStats[sp];
      if (!w.counts[sp] && !s.deaths && !w.records[sp].length) continue;
      let gen = 0;
      for (const c of cs) if (c.sp === sp && c.gen > gen) gen = c.gen;
      w.records[sp].push({ day, alive: w.counts[sp], lifespan: s.deaths ? s.ageSum / s.deaths : -1, gen, births: s.births });
      if (w.records[sp].length > 400) w.records[sp].shift();
      s.births = s.deaths = s.ageSum = 0;
    }
    if (day % SEASON_DAYS === 0) news(w, "season", -1, -1, -1, w.season);
    for (const m of [100, 200, 400, 600]) if (cs.length >= m) news(w, "crowd", -1, -1, -1, m, "crowd" + m);
  }
}

/* ---------------- the visitor's hand ---------------- */

function blob(w: World, x: number, y: number, z: number, kind: "rain" | "drought" | "cold", r: number, days: number): void {
  w.blobs.push({ x, y, z, r, left: DAY * days, kind });
  if (w.blobs.length > 12) w.blobs.shift();
}
export function makeRain(w: World, x: number, y: number, z: number): void {
  w.blobs = w.blobs.filter((b) => !(b.kind === "drought" && arc(b.x, b.y, b.z, x, y, z) < b.r));
  blob(w, x, y, z, "rain", 30, 0.4);
  news(w, "rainSent", -1, -1, nearestPlace(w.terrain, x, y, z), -1, "", { x, y, z });
  fromTheSky(w, x, y, z, "skyRain");
}
export function makeDrought(w: World, x: number, y: number, z: number): void {
  blob(w, x, y, z, "drought", 38, 2.5);
  news(w, "drought", -1, -1, nearestPlace(w.terrain, x, y, z), -1, "", { x, y, z });
  fromTheSky(w, x, y, z, "skyDry");
}
export function makeCold(w: World, x: number, y: number, z: number): void {
  blob(w, x, y, z, "cold", 36, 1.5);
  news(w, "cold", -1, -1, nearestPlace(w.terrain, x, y, z), -1, "", { x, y, z });
  fromTheSky(w, x, y, z, "skyCold");
}
export function dropFood(w: World, x: number, y: number, z: number): boolean {
  const k = w.terrain.kind[cellOf(x, y, z)];
  if (k === SEA || k === SHALLOW || k === LAKE) return false;
  w.piles.push({ x, y, z, energy: 220 });
  w.ledger.given += 220;
  w.novel.push({ x, y, z, t: w.t });
  fromTheSky(w, x, y, z, "skyFood");
  return true;
}

/** Find someone, alive or gone. */
export function who(w: World, id: number): Creature | undefined {
  return w.byId.get(id) ?? w.gone.get(id);
}

/** A short fingerprint of the whole world, for checking that two runs match. */
export function fingerprint(w: World): string {
  let h = 2166136261;
  const mix = (v: number): void => {
    h ^= Math.round(v * 100000) | 0;
    h = Math.imul(h, 16777619);
  };
  for (const c of w.creatures) {
    mix(c.id);
    mix(c.x);
    mix(c.y);
    mix(c.energy);
  }
  for (let i = 0; i < CELLS; i += 7) mix(w.grass[i]);
  mix(w.news.length);
  return `${w.creatures.length}:${(h >>> 0).toString(16)}`;
}

export { THINKER };
