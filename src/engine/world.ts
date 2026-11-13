/**
 * The simulation. Pure TypeScript, no DOM, fixed time step, one seeded random
 * generator: the same seed and the same visitor actions give the same history.
 */
import {
  BERRY_E, BIRD, BUSH_MAX, DAY, DT, FISH_E, GRASS_E, GRAZER, IN, ISLAND_R, KITH, MAX_CREATURES, N, N_IN, N_OUT, N_VEC,
  OUT, PREDATOR, SEASON_DAYS, SPECIES, THINK_EVERY, VEC, YEAR_DAYS, type Species,
} from "./config";
import { founderBrain, inherit, think } from "./net";
import { Rng } from "./rng";
import { FOREST, HILLS, LAKE, RIVER, SEA, cellOf, makeTerrain, nearestPlace, placeAt } from "./terrain";
import type { Creature, Held, Idea, LogKind, Meeting, Traits, World } from "./types";

const B = 8; // bucket size
const NB = Math.ceil(N / B);
const WATER_SMELL = 64;
const F_HUNGRY = 1;
const F_PARCHED = 2;
const F_WADED = 4;
const F_GROWN = 8;
const F_COLD = 16;
const F_FLED = 32;
const F_DROUGHT = 64;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createWorld(seed: number): World {
  const terrain = makeTerrain(seed);
  const rng = new Rng(seed);
  const grass = new Float64Array(N * N);
  const fish = new Float64Array(N * N).fill(-1);
  const bush = new Float64Array(terrain.bushes.length).fill(2);
  let given = 0;
  for (let i = 0; i < N * N; i++) {
    grass[i] = terrain.fert[i] * 0.75;
    given += grass[i] * GRASS_E;
  }
  for (const i of terrain.fishCells) {
    fish[i] = 0.7;
    given += 0.7 * FISH_E;
  }
  given += bush.length * 2 * BERRY_E;
  const w: World = {
    seed, terrain, rng,
    t: DAY * 0.3, tick: 0,
    grass, bush, fish,
    creatures: [], byId: new Map(), gone: new Map(), nextId: 1,
    fires: [], shelters: [], markers: [], carcasses: [], piles: [],
    rain: 0, wet: 0.6, rainLeft: 0, droughtLeft: 0, coldLeft: 0, nextWeather: DAY * 0.9,
    temp: 12, sun: 0, night: 0, season: 0, growth: 1, riverRuns: true,
    ideas: [], placeNames: terrain.places.map(() => null), placeNamedBy: terrain.places.map(() => -1),
    news: [], told: new Set(), meetings: [], talks: [], talkMode: "auto",
    ledger: { given, grown: 0, burned: 0, lost: 0 },
    counts: [0, 0, 0, 0], placed: [0, 0, 0, 0], births: 0, deaths: 0,
    buckets: Array.from({ length: NB * NB }, () => []),
  };
  // Lookup grids for trees and bushes.
  treeGrid = Array.from({ length: NB * NB }, () => []);
  bushGrid = Array.from({ length: NB * NB }, () => []);
  terrain.trees.forEach((t, i) => treeGrid[((t.y / B) | 0) * NB + ((t.x / B) | 0)].push(i));
  terrain.bushes.forEach((t, i) => bushGrid[((t.y / B) | 0) * NB + ((t.x / B) | 0)].push(i));
  gridFor = terrain;
  environment(w);
  return w;
}

// Static lookups for the terrain in use (rebuilt if a different world steps).
let treeGrid: number[][] = [];
let bushGrid: number[][] = [];
let gridFor: unknown = null;
function ensureGrids(w: World): void {
  if (gridFor === w.terrain) return;
  treeGrid = Array.from({ length: NB * NB }, () => []);
  bushGrid = Array.from({ length: NB * NB }, () => []);
  w.terrain.trees.forEach((t, i) => treeGrid[((t.y / B) | 0) * NB + ((t.x / B) | 0)].push(i));
  w.terrain.bushes.forEach((t, i) => bushGrid[((t.y / B) | 0) * NB + ((t.x / B) | 0)].push(i));
  gridFor = w.terrain;
}

/** All the energy in the world right now. With the ledger, this must balance. */
export function totalEnergy(w: World): number {
  let e = 0;
  for (let i = 0; i < N * N; i++) e += w.grass[i] * GRASS_E;
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

export function canStand(w: World, sp: Species, x: number, y: number): boolean {
  if (Math.hypot(x - N / 2, y - N / 2) > N / 2 - 3) return false;
  if (sp === BIRD) return true;
  const i = cellOf(x, y);
  const k = w.terrain.kind[i];
  if (k === SEA) return w.terrain.height[i] > -0.22;
  return true;
}

function log(w: World, c: Creature, k: LogKind, p = -1, o = -1, n = -1): void {
  c.log.push({ t: w.t, k, p, o, n });
  if (c.log.length > 60) c.log.splice(8, 1); // keep the earliest memories, lose the middle
}

function news(w: World, kind: string, a = -1, b = -1, p = -1, n = -1, once = ""): void {
  if (once) {
    if (w.told.has(once)) return;
    w.told.add(once);
  }
  w.news.push({ id: w.news.length, t: w.t, kind, a, b, p, n });
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

function blank(w: World, sp: Species, x: number, y: number, traits: Traits, brain: Float32Array): Creature {
  const a = w.rng.range(0, Math.PI * 2);
  return {
    id: w.nextId++, sp, sex: w.rng.next() < 0.5 ? 0 : 1,
    x, y, z: 0, hx: Math.cos(a), hy: Math.sin(a), pace: 0,
    energy: 0, thirst: 0.2, tired: 0.1, health: 1, born: w.t,
    traits, brain,
    inp: new Float32Array(N_IN), out: new Float32Array(N_OUT), tv: new Float32Array(N_VEC * 2),
    mother: -1, father: -1, mate: -1, children: [], gen: 0,
    homeX: x, homeY: y, waterX: -1, waterY: -1, callX: -1, callY: -1, wander: a,
    state: 0, foodKind: 0, foodAt: -1,
    mateCd: 0, talkCd: 0, markCd: 0, pause: 0, detour: 0, carrying: 0, follow: -1, avoid: -1,
    flags: 0, seen: 0, at: new Uint16Array(16), samples: 0, name: null, log: [], beliefs: [], thoughts: [],
    alive: true, died: 0, cause: "", kills: 0,
  };
}

function admit(w: World, c: Creature): void {
  w.creatures.push(c);
  w.byId.set(c.id, c);
  w.counts[c.sp]++;
  const p = placeAt(w.terrain, c.x, c.y);
  if (p >= 0) c.seen |= 1 << p;
}

/**
 * The visitor sets a creature down. It arrives part-grown, with the founder
 * instincts of its kind. Returns null if the spot is no good.
 */
export function place(w: World, sp: Species, x: number, y: number, age = 0.5): Creature | null {
  if (!canStand(w, sp, x, y) || w.creatures.length >= MAX_CREATURES) return null;
  const def = SPECIES[sp];
  const c = blank(w, sp, x, y, makeTraits(w.rng), founderBrain(sp, w.rng));
  // Placed creatures alternate female and male, so a handful can always breed.
  c.sex = (w.placed[sp]++ & 1) as 0 | 1;
  c.born = w.t - def.adultAt * DAY * age * 2;
  c.energy = def.maxEnergy * 0.7;
  if (age >= 0.5) c.flags |= F_GROWN;
  c.mateCd = DAY * w.rng.range(0.4, 1.4);
  w.ledger.given += c.energy + def.mass * c.traits.size;
  admit(w, c);
  log(w, c, "placed", nearestPlace(w.terrain, x, y));
  news(w, "arrive", c.id, -1, -1, sp, "arrive" + sp);
  return c;
}

/** Sets down the first few of each kind, so a new world is not empty. */
export function seedLife(w: World): void {
  const t = w.terrain;
  const r = w.rng;
  const scatter = (sp: Species, n: number, cx: number, cy: number, spread: number): void => {
    let made = 0;
    for (let tries = 0; tries < n * 30 && made < n; tries++) {
      const x = cx + r.gauss() * spread;
      const y = cy + r.gauss() * spread;
      const k = t.kind[cellOf(x, y)];
      if (sp !== BIRD && (k === RIVER || k === SEA || k === LAKE)) continue;
      if (place(w, sp, x, y, r.range(0.4, 0.9))) made++;
    }
  };
  const meadows = t.places.filter((p) => p.kind === "meadow");
  const woods = t.places.filter((p) => p.kind === "wood");
  const m0 = meadows[0] ?? t.places[0];
  const m1 = meadows[1] ?? m0;
  scatter(GRAZER, 16, m0.x, m0.y, 5);
  scatter(GRAZER, 14, m1.x, m1.y, 5);
  const far = meadows[meadows.length - 1] ?? t.places[1];
  scatter(PREDATOR, 5, far.x + 5, far.y + 5, 4);
  scatter(BIRD, 10, t.lake.x, t.lake.y, 7);
  const wd = woods[0] ?? m0;
  // The folk begin between the lake and a wood.
  scatter(KITH, 12, (t.lake.x * 2 + wd.x) / 3, (t.lake.y * 2 + wd.y) / 3, 4);
}

/* ---------------- the sky, the weather, the plants ---------------- */

function environment(w: World): void {
  const dayFrac = (w.t / DAY) % 1;
  w.sun = -Math.cos(dayFrac * Math.PI * 2);
  w.night = clamp01((0.12 - w.sun) / 0.32);
  const day = w.t / DAY;
  w.season = Math.floor(day / SEASON_DAYS) % 4;
  const yearFrac = (day % YEAR_DAYS) / YEAR_DAYS;
  const seasonal = 12 + 11 * Math.cos((yearFrac - 0.375) * Math.PI * 2);
  w.temp = seasonal + 5 * w.sun - (w.coldLeft > 0 ? 13 : 0) - w.rain * 2;
  w.growth = Math.min(1.2, Math.max(0.06, (seasonal - 2.5) / 13)) * (0.2 + 0.8 * w.wet);
  w.riverRuns = w.wet > 0.1;
}

function weather(w: World): void {
  if (w.coldLeft > 0) {
    w.coldLeft -= DT;
    if (w.coldLeft <= 0) news(w, "coldEnd");
  }
  if (w.droughtLeft > 0) {
    w.droughtLeft -= DT;
    w.rainLeft = 0;
    if (w.droughtLeft <= 0) news(w, "droughtEnd");
  } else if (w.t >= w.nextWeather) {
    // Rain comes more in spring and autumn.
    const chance = [0.5, 0.26, 0.55, 0.42][w.season];
    if (w.rng.next() < chance) w.rainLeft = DAY * w.rng.range(0.12, 0.4);
    w.nextWeather = w.t + DAY * w.rng.range(0.35, 0.8);
  }
  const target = w.rainLeft > 0 ? 1 : 0;
  if (w.rainLeft > 0) w.rainLeft -= DT;
  w.rain += (target - w.rain) * DT * 0.12;
  if (w.rain < 0.002) w.rain = 0;
  const dry = (w.droughtLeft > 0 ? 3.6 : 1) * (w.season === 1 ? 1.4 : 1) / (DAY * 3.2);
  w.wet = clamp01(w.wet + (w.rain * 1.0) / DAY * DT - w.wet * dry * DT);
}

const STRIDE = 24;
function plants(w: World): void {
  const { grass, ledger } = w;
  const fert = w.terrain.fert;
  const dt = DT * STRIDE;
  const g = w.growth;
  for (let i = w.tick % STRIDE; i < N * N; i += STRIDE) {
    const cap = fert[i];
    if (cap <= 0) continue;
    const v = grass[i];
    let d: number;
    if (g > 0.14) d = (0.009 * g * v * (1 - v / cap) + 0.0003 * cap * g) * dt;
    else d = -0.0011 * v * dt; // winter and drought thin it out
    if (v + d > cap) d = cap - v;
    grass[i] = v + d;
    if (d > 0) ledger.grown += d * GRASS_E;
    else ledger.lost -= d * GRASS_E;
  }
  // Fish and berries, a slice at a time.
  const fc = w.terrain.fishCells;
  for (let k = w.tick % STRIDE; k < fc.length; k += STRIDE) {
    const i = fc[k];
    const v = w.fish[i];
    const d = Math.min(1 - v, (0.003 * v * (1 - v) + 0.0002) * (0.35 + 0.65 * Math.min(1, g * 1.4)) * dt);
    w.fish[i] = v + d;
    ledger.grown += d * FISH_E;
  }
  for (let k = w.tick % STRIDE; k < w.bush.length; k += STRIDE) {
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
    f.fuel -= DT * (1 + w.rain * 1.5);
    if (f.fuel <= 0) w.fires.splice(i, 1);
  }
  for (let i = w.shelters.length - 1; i >= 0; i--) {
    const s = w.shelters[i];
    s.life -= DT;
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

export function findIdea(w: World, kind: Idea["kind"], place: number, who: number, text = ""): Idea | undefined {
  return w.ideas.find((i) => i.kind === kind && i.place === place && i.who === who && (kind !== "lore" || i.text === text));
}

export function makeIdea(w: World, kind: Idea["kind"], place: number, who: number, origin: number, text = "", from = -1): Idea {
  const found = findIdea(w, kind, place, who, text);
  if (found) return found;
  const idea: Idea = { id: w.ideas.length, kind, place, who, text, origin, t: w.t, from, edges: [], beforeIn: 0, beforeTot: 0, afterIn: 0, afterTot: 0 };
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
  if (c.beliefs.length > 8) {
    c.beliefs.sort((a, b) => b.s - a.s);
    c.beliefs.length = 8;
  }
  if (idea.kind === "follow") c.follow = idea.who;
  if (idea.kind === "avoid") c.avoid = idea.who;
  if (from >= 0) {
    idea.edges.push({ a: from, b: c.id, t: w.t });
    const n = holders(w, idea.id);
    if (n >= 3) news(w, "spread", idea.origin, -1, idea.place, idea.id, "spread" + idea.id);
  }
  return true;
}

export function holders(w: World, ideaId: number): number {
  let n = 0;
  for (const c of w.creatures) if (c.sp === KITH && c.beliefs.some((b) => b.idea === ideaId)) n++;
  return n;
}

function learn(w: World, c: Creature, kind: "danger" | "good", x: number, y: number, strength: number): void {
  if (c.sp !== KITH) return;
  const p = placeAt(w.terrain, x, y);
  if (p < 0) return;
  const idea = makeIdea(w, kind, p, -1, c.id);
  if (hold(w, c, idea, strength, -1)) log(w, c, "believed", p, -1, idea.id);
}

/**
 * One tells another what it believes. Sometimes the listener takes it for a
 * different place: that is how a wrong idea starts. Returns the idea the
 * listener ended up with, or null if there was nothing new to tell.
 */
export function tell(w: World, from: Creature, to: Creature, held?: Held): Idea | null {
  const pick = held ?? from.beliefs.filter((b) => !to.beliefs.some((t) => t.idea === b.idea)).sort((a, b) => b.s - a.s)[0];
  if (!pick) return null;
  let idea = w.ideas[pick.idea];
  if ((idea.kind === "danger" || idea.kind === "good") && w.rng.next() < 0.12) {
    // Misheard: the nearest other place of the same sort of ground.
    const here = w.terrain.places[idea.place];
    let best = -1;
    let bd = 1e9;
    for (const p of w.terrain.places) {
      if (p.id === here.id) continue;
      const d = Math.hypot(p.x - here.x, p.y - here.y) * (p.kind === here.kind ? 0.5 : 1);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    if (best >= 0) idea = makeIdea(w, idea.kind, best, -1, from.id, "", idea.id);
  }
  if (!hold(w, to, idea, Math.max(0.35, pick.s * 0.75), from.id)) return null;
  log(w, from, "told", idea.place, to.id, idea.id);
  log(w, to, "heard", idea.place, from.id, idea.id);
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

/* ---------------- one creature ---------------- */

const set = (tv: Float32Array, k: number, dx: number, dy: number): number => {
  const d = Math.hypot(dx, dy);
  if (d < 1e-4) {
    tv[k * 2] = 0;
    tv[k * 2 + 1] = 0;
    return 0;
  }
  tv[k * 2] = dx / d;
  tv[k * 2 + 1] = dy / d;
  return d;
};

function die(w: World, c: Creature, cause: string, by = -1): void {
  if (!c.alive) return;
  c.alive = false;
  c.died = w.t;
  c.cause = cause;
  w.counts[c.sp]--;
  w.deaths++;
  w.carcasses.push({ x: c.x, y: c.y, energy: c.energy + SPECIES[c.sp].mass * c.traits.size });
  c.energy = 0;
  const p = placeAt(w.terrain, c.x, c.y);
  news(w, "firstDeath", c.id, by, p, -1, "firstDeath");
  if (c.sp === KITH) news(w, "kithDeath", c.id, by, p, -1, c.name ? "" : "kithDeath");
  if (w.counts[c.sp] === 0) news(w, "lastOne", c.id, -1, p, c.sp);
  // Those who were close to it remember.
  const tellKin = (id: number, k: LogKind): void => {
    const o = w.byId.get(id);
    if (o && o.alive) {
      log(w, o, k, p, c.id);
      if (o.mate === c.id) o.mate = -1;
    }
  };
  if (c.mate >= 0) tellKin(c.mate, "lostMate");
  if (ageDays(w, c) < SPECIES[c.sp].adultAt * 1.5) {
    tellKin(c.mother, "lostChild");
    tellKin(c.father, "lostChild");
  }
  for (const k of c.children) {
    const o = w.byId.get(k);
    if (o && o.alive && o.sp === KITH) log(w, o, "lostParent", p, c.id);
  }
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
  const a = w.rng.range(0, Math.PI * 2);
  let x = m.x + Math.cos(a) * 0.7;
  let y = m.y + Math.sin(a) * 0.7;
  if (!canStand(w, m.sp, x, y)) {
    x = m.x;
    y = m.y;
  }
  const c = blank(w, m.sp, x, y, traits, inherit(m.brain, f.brain, w.rng));
  c.energy = def.birthEnergy;
  c.mother = m.id;
  c.father = f.id;
  c.gen = Math.max(m.gen, f.gen) + 1;
  c.homeX = m.homeX;
  c.homeY = m.homeY;
  c.waterX = m.waterX;
  c.waterY = m.waterY;
  c.follow = m.id;
  c.z = m.z;
  admit(w, c);
  w.births++;
  m.children.push(c.id);
  f.children.push(c.id);
  m.mateCd = f.mateCd = def.mateEvery * DAY * w.rng.range(0.8, 1.25);
  const p = nearestPlace(w.terrain, x, y);
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
  if (c.gen === 3 || c.gen === 6 || c.gen === 10 || c.gen === 15) news(w, "generation", c.id, -1, p, c.gen, `gen${m.sp}-${c.gen}`);
}

/** Parent and child, or children of the same mother: these do not pair. */
function closeKin(a: Creature, b: Creature): boolean {
  return a.mother === b.id || a.father === b.id || b.mother === a.id || b.father === a.id || (a.mother >= 0 && a.mother === b.mother);
}

/** Looks around, fills the senses, runs the network, and does the once-in-a-while things. */
function sense(w: World, c: Creature, idx: number): void {
  const t = w.terrain;
  const def = SPECIES[c.sp];
  const sp = c.sp;
  const inp = c.inp;
  const tv = c.tv;
  const cell = cellOf(c.x, c.y);
  const kindHere = t.kind[cell];
  const range = def.sense * c.traits.sense * (sp === PREDATOR ? 1 : 1 - 0.3 * w.night);
  const r2 = range * range;
  tv.fill(0);

  // --- others nearby
  let kinN = 0, kinX = 0, kinY = 0, kinD = 1e9;
  let threatD = 1e9, threatX = 0, threatY = 0, threat: Creature | null = null;
  let preyD = 1e9, prey: Creature | null = null;
  let mateD = 1e9, mateC: Creature | null = null;
  let talk: Creature | null = null;
  const bx0 = Math.max(0, ((c.x - range) / B) | 0), bx1 = Math.min(NB - 1, ((c.x + range) / B) | 0);
  const by0 = Math.max(0, ((c.y - range) / B) | 0), by1 = Math.min(NB - 1, ((c.y + range) / B) | 0);
  const adult = (c.flags & F_GROWN) !== 0;
  for (let by = by0; by <= by1; by++)
    for (let bx = bx0; bx <= bx1; bx++) {
      const bucket = w.buckets[by * NB + bx];
      for (let q = 0; q < bucket.length; q++) {
        const j = bucket[q];
        if (j === idx) continue;
        const o = w.creatures[j];
        if (!o.alive) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        if (o.sp === sp) {
          kinX += dx;
          kinY += dy;
          kinN++;
          if (d2 < kinD) kinD = d2;
          if (adult && o.sex !== c.sex && d2 < mateD && (o.flags & F_GROWN) !== 0 && !closeKin(c, o)) {
            mateD = d2;
            mateC = o;
          }
          if (sp === KITH && adult && d2 < 6.5 && o.talkCd <= 0 && (o.flags & F_GROWN) !== 0) talk = o;
          if (sp === KITH && o.id === c.avoid && d2 < 36 && d2 < threatD) {
            threatD = d2 * 4; // unease, not terror
            threatX = dx;
            threatY = dy;
          }
        } else if (o.sp === PREDATOR && (sp === GRAZER || sp === KITH)) {
          if (d2 < threatD) {
            threatD = d2;
            threatX = dx;
            threatY = dy;
            threat = o;
          }
        } else if (sp === PREDATOR && (o.sp === GRAZER || o.sp === KITH)) {
          // Prey is hard to see in the trees, and folk are a second choice.
          const ok = t.kind[cellOf(o.x, o.y)] === FOREST ? d2 < r2 * 0.3 : true;
          const eff = o.sp === KITH ? d2 * 4 : d2;
          if (ok && eff < preyD && !nearFire(w, o.x, o.y, 4.5)) {
            preyD = eff;
            prey = o;
          }
        }
      }
    }

  // --- fire and shelter (warmth for folk, fright for russets)
  let warmD = 1e9, warmX = 0, warmY = 0;
  if (sp === KITH || sp === PREDATOR) {
    for (const f of w.fires) {
      const dx = f.x - c.x, dy = f.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < warmD) {
        warmD = d2;
        warmX = dx;
        warmY = dy;
      }
    }
    if (sp === PREDATOR) {
      if (warmD < 49 && warmD < threatD) {
        threatD = warmD;
        threatX = warmX;
        threatY = warmY;
      }
    } else {
      for (const s of w.shelters) {
        if (!s.done) continue;
        const dx = s.x - c.x, dy = s.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < warmD) {
          warmD = d2;
          warmX = dx;
          warmY = dy;
        }
      }
    }
  }
  const warmth = sp === KITH && warmD < 16 ? 1 - Math.sqrt(warmD) / 4 : 0;

  // --- food
  let foodV = 0;
  c.foodKind = 0;
  c.foodAt = -1;
  if (sp === PREDATOR) {
    let best = 1e9;
    for (let k = 0; k < w.carcasses.length; k++) {
      const l = w.carcasses[k];
      const dx = l.x - c.x, dy = l.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 < best && l.energy > 2) {
        best = d2;
        set(tv, VEC.food, dx, dy);
        c.foodKind = 4;
        c.foodAt = k;
      }
    }
    if (best < 1e9) foodV = 1 - Math.sqrt(best) / range;
    else if (prey) {
      set(tv, VEC.food, prey.x - c.x, prey.y - c.y);
      foodV = 1 - Math.sqrt(Math.min(preyD, r2)) / range;
    }
  } else if (sp === BIRD) {
    let best = w.fish[cell] > 0 ? w.fish[cell] : 0;
    let bx = 0, by = 0;
    if (best > 0.2) {
      c.foodKind = 5;
      c.foodAt = cell;
    }
    for (let k = 0; k < 18; k++) {
      const a = c.wander + k * 1.047;
      const rr = range * (k < 6 ? 0.3 : k < 12 ? 0.8 : 1.5);
      const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
      const v = w.fish[cellOf(x, y)] * (k < 6 ? 1 : 0.85);
      if (v > best + 0.15) {
        best = v;
        bx = x - c.x;
        by = y - c.y;
      }
    }
    if (bx !== 0 || by !== 0) set(tv, VEC.food, bx, by);
    foodV = clamp01(best);
  } else {
    // Grass under foot and around.
    let best = w.grass[cell];
    let bx = 0, by = 0;
    if (best > 0.1) {
      c.foodKind = 1;
      c.foodAt = cell;
    }
    for (let k = 0; k < 12; k++) {
      const a = c.wander + k * 0.5236;
      const rr = k & 1 ? 2.2 : range * 0.6;
      const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
      const v = w.grass[cellOf(x, y)] * (k & 1 ? 1 : 0.85);
      if (v > best + 0.12) {
        best = v;
        bx = x - c.x;
        by = y - c.y;
      }
    }
    foodV = clamp01(best) * (sp === KITH ? 0.45 : 1);
    if (bx !== 0 || by !== 0) set(tv, VEC.food, bx, by);
    if (sp === KITH) {
      // Berries are much better than grass: head for the fullest bush that is not too far.
      let bestScore = foodV;
      for (let gy = by0; gy <= by1; gy++)
        for (let gx = bx0; gx <= bx1; gx++) {
          const g = bushGrid[gy * NB + gx];
          for (let q = 0; q < g.length; q++) {
            const stock = w.bush[g[q]];
            if (stock < 0.5) continue;
            const b = t.bushes[g[q]];
            const dx = b.x - c.x, dy = b.y - c.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            const score = (0.3 + (0.7 * stock) / BUSH_MAX) * (1 - (Math.sqrt(d2) / range) * 0.5);
            if (score > bestScore) {
              bestScore = score;
              c.foodKind = 2;
              c.foodAt = g[q];
              set(tv, VEC.food, dx, dy);
            }
          }
        }
      foodV = bestScore;
    }
    for (let k = 0; k < w.piles.length; k++) {
      const l = w.piles[k];
      const dx = l.x - c.x, dy = l.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && l.energy > 2) {
        c.foodKind = 3;
        c.foodAt = k;
        set(tv, VEC.food, dx, dy);
        foodV = 1;
        break;
      }
    }
  }

  // --- water: by sight within range, otherwise from memory
  const fd = w.riverRuns ? t.freshDist[cell] : t.lakeDist[cell];
  const fn = w.riverRuns ? t.freshNear[cell] : t.lakeNear[cell];
  let waterV = 0;
  // Water can be smelt from much further off than anything can be seen.
  if (fd < WATER_SMELL && fn >= 0) {
    if (fd > 1.2) set(tv, VEC.water, (fn % N) + 0.5 - c.x, ((fn / N) | 0) + 0.5 - c.y);
    waterV = 1 - fd / WATER_SMELL;
  } else if (c.waterX >= 0) {
    set(tv, VEC.water, c.waterX - c.x, c.waterY - c.y);
    waterV = 0.12;
  }

  // --- kin, threat, home, wander
  if (kinN > 0) set(tv, VEC.kin, kinX / kinN, kinY / kinN);
  const fear = threatD < r2 ? Math.pow(1 - Math.sqrt(threatD) / range, 0.6) : 0;
  if (fear > 0) set(tv, VEC.threat, threatX, threatY);
  const homeD = set(tv, VEC.home, c.homeX - c.x, c.homeY - c.y);
  c.wander += w.rng.gauss() * 0.45;
  // Keep the wandering inland when near the edge of the world.
  const cx = c.x - N / 2, cy = c.y - N / 2;
  if (cx * cx + cy * cy > (ISLAND_R - 6) * (ISLAND_R - 6) && sp !== BIRD) c.wander = Math.atan2(-cy, -cx) + w.rng.gauss() * 0.6;
  tv[VEC.wander * 2] = Math.cos(c.wander);
  tv[VEC.wander * 2 + 1] = Math.sin(c.wander);

  // --- whom to keep near
  let followV = 0;
  const fid = c.follow >= 0 ? c.follow : c.mate;
  if (fid >= 0) {
    const o = w.byId.get(fid);
    if (o && o.alive) {
      const d = set(tv, VEC.follow, o.x - c.x, o.y - c.y);
      followV = d < 1.5 ? 0 : clamp01(1 - d / 30);
      if (d < 1.5) tv[VEC.follow * 2] = tv[VEC.follow * 2 + 1] = 0;
    } else if (c.follow === fid) c.follow = -1;
  } else if (mateC && adult) {
    set(tv, VEC.follow, mateC.x - c.x, mateC.y - c.y);
    followV = 1 - Math.sqrt(mateD) / range;
  } else if (adult && c.mateCd <= 0 && (w.tick + c.id) % (THINK_EVERY * 8) < THINK_EVERY) {
    // Nobody in sight: a call carries much further than eyes do.
    let best = 70 * 70;
    for (const o of w.creatures) {
      if (o.sp !== sp || o.sex === c.sex || !(o.flags & F_GROWN)) continue;
      const d2 = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
      if (d2 < best) {
        best = d2;
        c.callX = o.x;
        c.callY = o.y;
      }
    }
    if (best === 70 * 70) c.callX = -1;
  }
  if (followV === 0 && fid < 0 && !mateC && c.callX >= 0 && adult && c.mateCd <= 0) {
    set(tv, VEC.follow, c.callX - c.x, c.callY - c.y);
    followV = 0.2;
  }

  // --- beliefs about places (folk only)
  let dangerV = 0, goodV = 0;
  if (sp === KITH && c.beliefs.length) {
    const want = Math.max(1 - c.energy / def.maxEnergy, c.thirst);
    for (const h of c.beliefs) {
      const idea = w.ideas[h.idea];
      if (idea.place < 0) continue;
      const p = t.places[idea.place];
      const dx = p.x - c.x, dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      if (idea.kind === "danger") {
        const v = h.s * clamp01(1.6 - d / (p.r * 1.25));
        if (v > dangerV) {
          dangerV = v;
          set(tv, VEC.dangerPlace, dx, dy);
        }
      } else if (idea.kind === "good") {
        const v = h.s * (0.35 + 0.65 * want) * (d < p.r * 0.5 ? 0 : 1);
        if (v > goodV) {
          goodV = v;
          set(tv, VEC.goodPlace, dx, dy);
        }
      }
    }
  }
  if (warmD < 400 && sp === KITH) set(tv, VEC.warm, warmX, warmY);

  // --- how it feels
  const alt = Math.max(0, t.height[cell] - 2);
  const felt = w.temp - alt * 1.1 + warmth * 10 + Math.min(kinN, 4) * 1.4 + (kindHere === FOREST ? 1.5 : 0);
  const cold = clamp01((def.comfort - felt) / 14);
  const eFrac = c.energy / def.maxEnergy;
  // Russets keep territories: one with too many of its own kind around will not breed.
  const crowded = sp === PREDATOR && kinN >= 4;
  const ready = adult && c.mateCd <= 0 && eFrac > def.mateAt && !crowded && w.creatures.length < MAX_CREATURES ? 1 : 0;
  inp[IN.hunger] = 1 - eFrac;
  inp[IN.thirst] = c.thirst;
  inp[IN.tired] = c.tired;
  inp[IN.fear] = fear;
  inp[IN.cold] = cold;
  inp[IN.night] = w.night;
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
  inp[IN.wet] = w.rain;

  think(c.brain, inp, c.out);
  const out = c.out;

  // ---------- things decided a few times a second ----------
  const here = placeAt(t, c.x, c.y);
  const dtT = DT * THINK_EVERY;

  // Growing up, growing old.
  const age = (w.t - c.born) / DAY;
  if (!adult && age >= def.adultAt) {
    c.flags |= F_GROWN;
    if (c.follow === c.mother) c.follow = -1;
    log(w, c, "grown", here);
  }
  if (age > def.lifespan * (0.82 + 0.3 * ((c.id * 0.6180339) % 1)) && w.rng.next() < dtT / (DAY * 0.6)) {
    die(w, c, "age");
    return;
  }

  // Feeling the cold, the dry and the snow for the first time.
  if (cold > 0.55 && !(c.flags & F_COLD)) {
    c.flags |= F_COLD;
    log(w, c, w.coldLeft > 0 ? "cold" : "snow", here);
  }
  if (w.droughtLeft > 0 && c.thirst > 0.6 && !(c.flags & F_DROUGHT)) {
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
    learn(w, c, "good", c.x, c.y, 0.7);
  }
  if (c.thirst > 0.9 && !(c.flags & F_PARCHED)) {
    c.flags |= F_PARCHED;
    log(w, c, "parched", here);
  } else if (c.thirst < 0.3 && c.flags & F_PARCHED) {
    c.flags &= ~F_PARCHED;
    log(w, c, "drank", here);
    learn(w, c, "good", c.x, c.y, 0.7);
  }
  if (fear > 0.75) c.flags |= F_FLED;
  else if (fear < 0.05 && c.flags & F_FLED) {
    c.flags &= ~F_FLED;
    if (threat === null && sp !== PREDATOR && w.rng.next() < 0.5) {
      log(w, c, "escaped", here);
      learn(w, c, "danger", c.x, c.y, 0.55);
    }
  }
  if (here >= 0 && !(c.seen & (1 << here))) {
    c.seen |= 1 << here;
    log(w, c, "reached", here);
  }
  if (kindHere === RIVER && !(c.flags & F_WADED) && sp !== BIRD && w.riverRuns) {
    c.flags |= F_WADED;
    log(w, c, "waded", here);
    if (sp === KITH) news(w, "firstWade", c.id, -1, here, -1, "firstWade");
  }

  // Home drifts to where life is lived.
  if (c.state === 1 || c.state === 2 || c.state === 3) {
    c.homeX += (c.x - c.homeX) * 0.025;
    c.homeY += (c.y - c.homeY) * 0.025;
  }

  // Breeding.
  if (ready && out[OUT.mate] > 0 && mateC && mateD < (sp === BIRD ? 36 : 16)) {
    const o = mateC;
    const od = SPECIES[o.sp];
    if (o.mateCd <= 0 && o.out[OUT.mate] > 0 && o.energy / od.maxEnergy > od.mateAt) {
      const [m, f] = c.sex === 0 ? [c, o] : [o, c];
      birth(w, m, f);
      if (sp === BIRD && w.rng.next() < 0.4) birth(w, m, f);
      if (sp === GRAZER && w.rng.next() < 0.2) birth(w, m, f);
    }
  }

  // A russet strikes.
  if (sp === PREDATOR && prey && c.foodKind !== 4 && out[OUT.eat] > 0) {
    const dx = prey.x - c.x, dy = prey.y - c.y;
    if (dx * dx + dy * dy < 2) {
      let herd = 0;
      const pb = w.buckets[((prey.y / B) | 0) * NB + ((prey.x / B) | 0)];
      for (const j of pb) {
        const o = w.creatures[j];
        if (o.sp === prey.sp && o !== prey && (o.x - prey.x) ** 2 + (o.y - prey.y) ** 2 < 16) herd++;
      }
      const safe = prey.sp === KITH && prey.state === 3 && w.shelters.some((s) => s.done && (s.x - prey.x) ** 2 + (s.y - prey.y) ** 2 < 2.5);
      const chance = safe ? 0 : (0.55 / (1 + 0.25 * herd)) * (prey.state === 3 ? 1.5 : 1) * (isAdult(w, prey) ? 1 : 1.4);
      c.tired = Math.min(1, c.tired + 0.06);
      if (w.rng.next() < chance) {
        prey.health -= isAdult(w, prey) ? 0.55 : 1;
        if (prey.health <= 0) {
          const victim = prey;
          die(w, victim, "killed", c.id);
          c.kills++;
          if (c.kills === 1) log(w, c, "kill", here, victim.id);
          news(w, "firstKill", c.id, victim.id, here, victim.sp, "firstKill");
          witness(w, victim, c);
        } else {
          log(w, prey, "hurt", here, c.id);
          learn(w, prey, "danger", prey.x, prey.y, 0.8);
        }
      }
    }
  }

  // Folk things.
  if (sp === KITH) {
    kithActs(w, c, here);
    if (talk && adult && c.talkCd <= 0 && fear < 0.2 && c.pause <= 0 && c.state !== 3) {
      c.talkCd = talk.talkCd = DAY * w.rng.range(0.5, 0.9);
      c.pause = talk.pause = 5;
      const m: Meeting = { id: w.tick * 1000 + (c.id % 1000), a: c.id, b: talk.id, t: w.t };
      log(w, c, "met", here, talk.id);
      log(w, talk, "met", here, c.id);
      news(w, "firstMeet", c.id, talk.id, here, -1, "firstMeet");
      if (w.talkMode === "auto") settleMeeting(w, m);
      else w.meetings.push(m);
    }
    // Beliefs fade unless life renews them.
    if (c.beliefs.length && w.rng.next() < dtT / DAY) {
      for (const h of c.beliefs) h.s -= 0.03;
      c.beliefs = c.beliefs.filter((h) => h.s > 0.12);
    }
    // Sample where it is, so a belief's effect can be measured: before it was held, and since.
    if ((w.tick / THINK_EVERY) % 5 < 1) {
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
}

function nearFire(w: World, x: number, y: number, r: number): boolean {
  for (const f of w.fires) if ((f.x - x) ** 2 + (f.y - y) ** 2 < r * r) return true;
  return false;
}

/** Everyone of the victim's kind close enough to see it remembers the kill. */
function witness(w: World, victim: Creature, killer: Creature): void {
  const p = placeAt(w.terrain, victim.x, victim.y);
  for (const o of w.creatures) {
    if (!o.alive || o.sp !== victim.sp || o === victim) continue;
    if ((o.x - victim.x) ** 2 + (o.y - victim.y) ** 2 > 100) continue;
    if (o.sp === KITH) {
      log(w, o, "sawKill", p, victim.id, killer.id);
      learn(w, o, "danger", victim.x, victim.y, 0.9);
    }
  }
}

function kithActs(w: World, c: Creature, here: number): void {
  const out = c.out;
  const t = w.terrain;
  if (c.markCd > 0) return;
  if (!c.carrying && out[OUT.gather] > 0.2) {
    // Pick up wood if a tree is within reach.
    const g = treeGrid[((c.y / B) | 0) * NB + ((c.x / B) | 0)];
    for (let q = 0; q < g.length; q++) {
      const tr = t.trees[g[q]];
      if ((tr.x - c.x) ** 2 + (tr.y - c.y) ** 2 < 2.6) {
        c.carrying = 1;
        c.markCd = 3;
        return;
      }
    }
  }
  if (c.carrying && out[OUT.fire] > 0.3 && out[OUT.fire] >= out[OUT.shelter]) {
    let fed = false;
    for (const f of w.fires) {
      if ((f.x - c.x) ** 2 + (f.y - c.y) ** 2 < 9) {
        if (f.fuel < DAY * 0.5) {
          f.fuel += DAY * 0.45;
          fed = true;
          c.carrying = 0;
        } else return; // it burns well enough; keep the wood
        break;
      }
    }
    if (!fed && c.carrying && w.rain < 0.5 && w.fires.length < 24 && t.kind[cellOf(c.x, c.y)] !== RIVER) {
      w.fires.push({ x: c.x + c.hx * 0.6, y: c.y + c.hy * 0.6, fuel: DAY * 0.5, by: c.id });
      c.carrying = 0;
      log(w, c, "fire", here);
      news(w, "firstFire", c.id, -1, here, -1, "firstFire");
    }
    c.markCd = 4;
    return;
  }
  if (c.carrying && out[OUT.shelter] > 0.3) {
    let site = w.shelters.find((s) => (s.x - c.x) ** 2 + (s.y - c.y) ** 2 < 9);
    const nearHome = (c.homeX - c.x) ** 2 + (c.homeY - c.y) ** 2 < 64;
    if (!site && nearHome && w.shelters.length < 30 && !w.shelters.some((s) => (s.x - c.x) ** 2 + (s.y - c.y) ** 2 < 100)) {
      const k = t.kind[cellOf(c.x, c.y)];
      if (k !== RIVER && k !== HILLS) {
        site = { x: c.x, y: c.y, wood: 0, done: false, life: DAY * 4, by: c.id };
        w.shelters.push(site);
      }
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
  if (out[OUT.mark] > 0.55 && !w.markers.some((m) => (m.x - c.x) ** 2 + (m.y - c.y) ** 2 < 64)) {
    w.markers.push({ x: c.x, y: c.y, by: c.id, t: w.t });
    if (w.markers.length > 40) w.markers.shift();
    c.markCd = DAY;
    log(w, c, "marker", here);
    news(w, "firstMarker", c.id, -1, here, -1, "firstMarker");
  }
}

/** Moves, eats, drinks, rests and pays for it: every step. */
function act(w: World, c: Creature): void {
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

  let pace = 0;
  let state = 0;
  const resting = out[OUT.rest] > 0.25 && fear < 0.35;
  if (c.pause > 0) {
    c.pause -= DT;
    state = 6;
  } else if (resting) {
    state = 3;
    c.tired = Math.max(0, c.tired - DT * 0.03);
  } else {
    let dx = 0, dy = 0;
    for (let k = 0; k < N_VEC; k++) {
      dx += out[k] * tv[k * 2];
      dy += out[k] * tv[k * 2 + 1];
    }
    if (sp === KITH && !c.carrying && out[OUT.gather] > 0.2) {
      // Wanting wood means walking to a tree.
      const g = treeGrid[((c.y / B) | 0) * NB + ((c.x / B) | 0)];
      if (g.length) {
        const tr = t.trees[g[c.id % g.length]];
        const d = Math.hypot(tr.x - c.x, tr.y - c.y) || 1;
        dx += (out[OUT.gather] * (tr.x - c.x)) / d;
        dy += (out[OUT.gather] * (tr.y - c.y)) / d;
      }
    }
    if (c.detour > 0) {
      // Something was in the way: walk round it for a moment before trying again.
      c.detour -= DT;
      dx = Math.cos(c.wander);
      dy = Math.sin(c.wander);
    }
    const mag = Math.hypot(dx, dy);
    if (mag > 0.06) {
      const want = Math.min(1, Math.max(0.12, 0.5 + 0.5 * out[OUT.speed])) * Math.min(1, mag * 1.6);
      // Turn towards where it wants to go.
      const turn = Math.min(1, DT * 5);
      let hx = c.hx + (dx / mag - c.hx) * turn;
      let hy = c.hy + (dy / mag - c.hy) * turn;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl;
      hy /= hl;
      c.hx = hx;
      c.hy = hy;
      const cell = cellOf(c.x, c.y);
      const k = t.kind[cell];
      let v = def.speed * c.traits.speed * want;
      if (sp !== BIRD) v *= k === RIVER ? 0.5 : k === LAKE ? 0.45 : k === HILLS ? 0.8 : k === FOREST ? 0.9 : 1;
      if (!(c.flags & F_GROWN)) v *= 0.85;
      if (c.tired > 0.85) v *= 0.75;
      v *= 0.55 + 0.45 * c.health;
      if (c.state === 1) v *= 0.5; // it cannot eat and hurry at once
      const nx = c.x + hx * v * DT, ny = c.y + hy * v * DT;
      if (canStand(w, sp, nx, ny)) {
        c.x = nx;
        c.y = ny;
      } else if (canStand(w, sp, nx, c.y)) c.x = nx;
      else if (canStand(w, sp, c.x, ny)) c.y = ny;
      else {
        c.wander = Math.atan2(N / 2 - c.y, N / 2 - c.x) + w.rng.range(-1.2, 1.2);
        c.detour = 2;
      }
      pace = want;
      state = fear > 0.4 ? 4 : sp === PREDATOR && out[VEC.food] > 0.3 && c.foodKind !== 4 && inp[IN.foodNear] > 0 ? 5 : 0;
      c.tired = Math.min(1, Math.max(0, c.tired + DT * (0.002 + def.tire * want * want - 0.012 * (1 - want))));
    }
  }
  c.pace = pace;

  // Eating: only when it chooses to, and only what is within reach.
  if (out[OUT.eat] > 0 && (c.foodKind || sp === GRAZER || sp === KITH) && state !== 4 && c.energy < def.maxEnergy - 1) {
    let took = 0;
    const want = Math.min(def.bite * size * DT, (def.maxEnergy - c.energy) / def.digest);
    let eff = def.digest;
    if (c.foodKind === 2) {
      const b = t.bushes[c.foodAt];
      if ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 < 1.7) {
        took = Math.min(want, w.bush[c.foodAt] * BERRY_E);
        w.bush[c.foodAt] -= took / BERRY_E;
      }
    } else if (c.foodKind === 3 || c.foodKind === 4) {
      const l = (c.foodKind === 3 ? w.piles : w.carcasses)[c.foodAt];
      if (l && (l.x - c.x) ** 2 + (l.y - c.y) ** 2 < 1.7) {
        took = Math.min(want, l.energy);
        l.energy -= took;
      }
    } else if (c.foodKind === 5) {
      const i = cellOf(c.x, c.y);
      if (w.fish[i] > 0.05) {
        took = Math.min(want, (w.fish[i] - 0.04) * FISH_E);
        w.fish[i] -= took / FISH_E;
      }
    }
    if (took <= 0 && (sp === GRAZER || sp === KITH)) {
      // Nothing better within reach: the grass under foot.
      const i = cellOf(c.x, c.y);
      if (w.grass[i] > 0.05) {
        took = Math.min(want, (w.grass[i] - 0.03) * GRASS_E);
        w.grass[i] -= took / GRASS_E;
        if (sp === KITH) eff = 0.55;
      }
    }
    if (took > 0) {
      c.energy += took * eff;
      led.lost += took * (1 - eff);
      if (state !== 3) state = 1;
    }
  }

  // Drinking: at fresh water, or a little from the rain.
  const cell = cellOf(c.x, c.y);
  const fd = w.riverRuns ? t.freshDist[cell] : t.lakeDist[cell];
  if (out[OUT.drink] > 0 && fd < 1.6 && c.thirst > 0.02) {
    c.thirst = Math.max(0, c.thirst - DT * 0.22);
    c.waterX = c.x;
    c.waterY = c.y;
    if (state === 0) state = 2;
  }
  c.thirst = Math.min(1, c.thirst + DT / (def.thirstDays * DAY) * (1 + 0.5 * pace) - w.rain * DT * 0.004);
  if (c.thirst < 0) c.thirst = 0;

  // The cost of living.
  const cold = inp[IN.cold];
  let burn = def.burn * size * (state === 3 ? 0.6 : 1) * (1 + 1.3 * pace * pace) * (1 + 0.8 * cold) * DT;
  if (burn > c.energy) burn = c.energy;
  c.energy -= burn;
  led.burned += burn;

  // Body.
  if (c.energy <= 0.001) c.health -= DT * 0.02;
  else if (c.thirst >= 1) c.health -= DT * 0.008;
  else if (cold > 0.7) c.health -= DT * 0.006 * (cold - 0.7) / 0.3;
  else if (c.health < 1) c.health = Math.min(1, c.health + DT * 0.006);
  c.state = state;

  if (sp === BIRD) {
    const target = state === 3 ? 0 : state === 1 || state === 2 ? 0.25 : 3.2;
    c.z += (target - c.z) * Math.min(1, DT * 1.6);
  }
  if (c.health <= 0) die(w, c, c.energy <= 0.001 ? "hunger" : c.thirst >= 1 ? "thirst" : "cold");
}

/* ---------------- the step ---------------- */

export function step(w: World): void {
  ensureGrids(w);
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
    w.buckets[((c.y / B) | 0) * NB + ((c.x / B) | 0)].push(i);
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
  if (w.gone.size > 700) {
    for (const [id, c] of w.gone) {
      if (c.sp !== KITH || w.gone.size > 1400) w.gone.delete(id);
      if (w.gone.size <= 500) break;
    }
  }
  // Meetings nobody wrote words for settle themselves after a while.
  while (w.meetings.length && w.t - w.meetings[0].t > DAY * 0.3) settleMeeting(w, w.meetings.shift() as Meeting);

  // The chronicle's slower beats.
  if (w.tick % 200 === 0) {
    const day = dayOf(w.t);
    if (day > 0 && day % SEASON_DAYS === 0) news(w, "season", -1, -1, -1, w.season, "season" + day);
    if (w.season === 3) news(w, "firstWinter", -1, -1, -1, -1, "firstWinter");
    const pop = cs.length;
    for (const m of [100, 200, 300, 400]) if (pop >= m) news(w, "crowd", -1, -1, -1, m, "crowd" + m);
  }
}

/* ---------------- the visitor's hand ---------------- */

export function makeRain(w: World): void {
  w.droughtLeft = 0;
  w.rainLeft = DAY * 0.4;
  news(w, "rainSent");
}
export function makeDrought(w: World): void {
  w.droughtLeft = DAY * 2.5;
  w.rainLeft = 0;
  news(w, "drought");
}
export function makeCold(w: World): void {
  w.coldLeft = DAY * 1.5;
  news(w, "cold");
}
export function dropFood(w: World, x: number, y: number): boolean {
  if (!canStand(w, GRAZER, x, y)) return false;
  w.piles.push({ x, y, energy: 160 });
  w.ledger.given += 160;
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
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  };
  for (const c of w.creatures) {
    mix(c.id);
    mix(c.x);
    mix(c.y);
    mix(c.energy);
  }
  for (let i = 0; i < N * N; i += 7) mix(w.grass[i]);
  mix(w.wet);
  mix(w.news.length);
  return `${w.creatures.length}:${(h >>> 0).toString(16)}`;
}
