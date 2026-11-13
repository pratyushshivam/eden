import type { Species } from "./config";
import type { Rng } from "./rng";
import type { Terrain } from "./terrain";

/** One thing that really happened to a creature. */
export interface LogEntry {
  /** World time, seconds. */
  t: number;
  k: LogKind;
  /** Place id, or -1. */
  p: number;
  /** Another creature's id, or -1. */
  o: number;
  /** An idea id or a number, when the kind needs one. */
  n: number;
}

export type LogKind =
  | "placed" | "born" | "grown" | "hungry" | "fed" | "parched" | "drank" | "waded" | "reached"
  | "mated" | "child" | "lostMate" | "lostChild" | "lostParent" | "sawKill" | "escaped" | "hurt"
  | "kill" | "fire" | "shelter" | "marker" | "cold" | "drought" | "snow" | "heard" | "told" | "met" | "named" | "believed";

/** A belief a creature holds. The idea itself lives in the world, shared. */
export interface Held {
  idea: number;
  /** 0..1; fades slowly, renewed by experience. */
  s: number;
  /** Who it came from, or -1 if it came from the creature's own life. */
  from: number;
  t: number;
}

export interface Idea {
  id: number;
  kind: "danger" | "good" | "follow" | "avoid" | "lore";
  /** Place id for danger/good, else -1. */
  place: number;
  /** Creature id for follow/avoid, else -1. */
  who: number;
  /** In the creature's words, once it has any. */
  text: string;
  /** Whose life it first came out of, and when. */
  origin: number;
  t: number;
  /** If it is a changed retelling of another idea, which. */
  from: number;
  /** Every passing-on: who told whom, when. */
  edges: { a: number; b: number; t: number }[];
  /** How often its holders were found at the place before they held it, and since (sampled). */
  beforeIn: number;
  beforeTot: number;
  afterIn: number;
  afterTot: number;
}

export interface Thought {
  t: number;
  text: string;
  /** Written by the language model, or by the plain built-in voice. */
  by: "model" | "plain";
}

export interface Traits {
  speed: number;
  size: number;
  sense: number;
  /** 0 timid .. 1 bold; only described, never read by the rules. */
  bold: number;
  /** Colour shift, -1..1. */
  hue: number;
}

export interface Creature {
  id: number;
  sp: Species;
  /** 0 female, 1 male. */
  sex: 0 | 1;
  x: number;
  y: number;
  /** Height above the ground (birds). */
  z: number;
  /** Facing, a unit vector. */
  hx: number;
  hy: number;
  /** Speed last step, as a share of top speed. */
  pace: number;
  energy: number;
  thirst: number;
  tired: number;
  health: number;
  /** World time of birth. */
  born: number;
  traits: Traits;
  brain: Float32Array;
  inp: Float32Array;
  out: Float32Array;
  /** Unit vectors to the things it can head for, two numbers each. */
  tv: Float32Array;
  mother: number;
  father: number;
  mate: number;
  children: number[];
  /** Generations since a placed ancestor. */
  gen: number;
  homeX: number;
  homeY: number;
  /** Where it last drank, or -1. */
  waterX: number;
  waterY: number;
  /** Where it last heard one of its kind calling, or -1. */
  callX: number;
  callY: number;
  wander: number;
  /** 0 roam, 1 eat, 2 drink, 3 rest, 4 flee, 5 hunt, 6 talk. */
  state: number;
  /** What it is about to eat: 0 nothing, 1 grass, 2 bush, 3 pile, 4 carcass, 5 fish. */
  foodKind: number;
  foodAt: number;
  mateCd: number;
  talkCd: number;
  markCd: number;
  pause: number;
  /** Seconds left of walking round an obstacle. */
  detour: number;
  carrying: number;
  /** Individuals it keeps close to or away from (kith). */
  follow: number;
  avoid: number;
  /** Bit flags for things that are logged once. */
  flags: number;
  /** Bit per place visited. */
  seen: number;
  /** How many times it was found at each place, out of `samples`. */
  at: Uint16Array;
  samples: number;
  name: string | null;
  log: LogEntry[];
  beliefs: Held[];
  thoughts: Thought[];
  alive: boolean;
  died: number;
  cause: string;
  kills: number;
}

export interface Fire { x: number; y: number; fuel: number; by: number }
export interface Shelter { x: number; y: number; wood: number; done: boolean; life: number; by: number }
export interface Marker { x: number; y: number; by: number; t: number }
export interface Lump { x: number; y: number; energy: number }

export interface News {
  id: number;
  t: number;
  kind: string;
  /** Creature ids, place id, idea id or count, as the kind needs. */
  a: number;
  b: number;
  p: number;
  n: number;
}

export interface Meeting {
  id: number;
  a: number;
  b: number;
  t: number;
}

/** A conversation between two kith. */
export interface Talk {
  t: number;
  a: number;
  b: number;
  lines: { who: number; text: string }[];
  /** Ideas that changed hands. */
  ideas: number[];
  by: "model" | "plain";
}

export interface Ledger {
  /** Energy present at the start plus everything the visitor has put in. */
  given: number;
  /** Grown by plants and fish. */
  grown: number;
  /** Spent on living. */
  burned: number;
  /** Lost in digestion, rot and die-back. */
  lost: number;
}

export interface World {
  seed: number;
  terrain: Terrain;
  rng: Rng;
  t: number;
  tick: number;
  /** Grass per cell, 0..fert. */
  grass: Float64Array;
  /** Berries on each bush. */
  bush: Float64Array;
  /** Fish per cell, 0..1; -1 where there is none. */
  fish: Float64Array;
  creatures: Creature[];
  byId: Map<number, Creature>;
  /** The dead, kept for family trees and stories. */
  gone: Map<number, Creature>;
  nextId: number;
  fires: Fire[];
  shelters: Shelter[];
  markers: Marker[];
  carcasses: Lump[];
  piles: Lump[];
  /** Weather. */
  rain: number;
  wet: number;
  rainLeft: number;
  droughtLeft: number;
  coldLeft: number;
  nextWeather: number;
  /** Derived each step. */
  temp: number;
  sun: number;
  night: number;
  season: number;
  growth: number;
  riverRuns: boolean;
  ideas: Idea[];
  placeNames: (string | null)[];
  placeNamedBy: number[];
  news: News[];
  /** Kinds of news already told, for "the first time" entries. */
  told: Set<string>;
  meetings: Meeting[];
  talks: Talk[];
  /** "auto": the engine settles meetings itself. "external": it queues them for whoever writes the words. */
  talkMode: "auto" | "external";
  ledger: Ledger;
  counts: number[];
  placed: number[];
  births: number;
  deaths: number;
  /** Spatial buckets, rebuilt every step. */
  buckets: number[][];
}
