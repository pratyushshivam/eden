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
  | "kill" | "fire" | "shelter" | "marker" | "cold" | "drought" | "snow" | "heard" | "told" | "met" | "named" | "believed"
  | "made" | "learned" | "sailed" | "landed" | "hunted"
  | "skyKin" | "skyBeast" | "skyFood" | "skyRain" | "skyCold" | "skyDry" | "stranger"
  | "sawGlow" | "spokeGlow" | "struckGlow" | "felled";

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
  kind: "danger" | "good" | "follow" | "avoid" | "lore" | "craft";
  /** Place id for danger/good, else -1. */
  place: number;
  /** Creature id for follow/avoid, else -1. */
  who: number;
  /** Which thing it is the knowledge of making, for a craft; else -1. */
  craft: number;
  /** In the creature's words, once it has any. For a craft, the name they gave the thing. */
  text: string;
  /** Whose life it first came out of, when, and on which landmass. */
  origin: number;
  t: number;
  land: number;
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
  /** 0 timid .. 1 bold. Colours how it is described, and how it first takes a stranger when no words are available. */
  bold: number;
  /** Colour shift, -1..1. */
  hue: number;
}

export interface Creature {
  id: number;
  sp: Species;
  /** 0 female, 1 male. */
  sex: 0 | 1;
  /** Where it is: a unit vector from the middle of the planet. */
  x: number;
  y: number;
  z: number;
  /** Height above the ground (fliers). */
  alt: number;
  /** Facing: a unit vector along the ground. */
  hx: number;
  hy: number;
  hz: number;
  /** Speed last step, as a share of top speed. */
  pace: number;
  energy: number;
  thirst: number;
  tired: number;
  health: number;
  /** World time of birth. */
  born: number;
  /** Where it was born or set down. */
  bx: number;
  by: number;
  bz: number;
  traits: Traits;
  brain: Float32Array;
  inp: Float32Array;
  hid: Float32Array;
  out: Float32Array;
  /** Unit vectors along the ground to the things it can head for, three numbers each. */
  tv: Float32Array;
  mother: number;
  father: number;
  mate: number;
  children: number[];
  /** Generations since a placed ancestor, and that ancestor's id. */
  gen: number;
  root: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  /** Where it last drank; `hasWater` says whether it has ever. */
  waterX: number;
  waterY: number;
  waterZ: number;
  hasWater: boolean;
  /** Where it last heard one of its kind calling. */
  callX: number;
  callY: number;
  callZ: number;
  hasCall: boolean;
  /** The way it is wandering: a unit vector along the ground. */
  wx: number;
  wy: number;
  wz: number;
  /** 0 roam, 1 eat, 2 drink, 3 rest, 4 flee, 5 hunt, 6 talk, 7 play, 8 grieve, 9 make. */
  state: number;
  /** What it is about to eat: 0 nothing, 1 grass, 2 bush, 3 pile, 4 carcass, 5 sea life. */
  foodKind: number;
  foodAt: number;
  mateCd: number;
  talkCd: number;
  markCd: number;
  tinkerCd: number;
  pause: number;
  /** Seconds left of walking round an obstacle. */
  detour: number;
  carrying: number;
  /** Individuals it keeps close to or away from. */
  follow: number;
  avoid: number;
  /** Bit flags for things that are logged once. */
  flags: number;
  /** Bit per place visited. */
  seen: number;
  /** How many times it was found at each place, out of `samples`. */
  at: Uint16Array;
  samples: number;
  /** Its nature: each 0..1. Inherited from its parents, and moved by what happens to it. */
  nature: { temper: number; trust: number; pride: number; warmth: number };
  /** Its habit of speech: an index into a small set of manners. */
  speech: number;
  /** How it regards the shining stranger, -1 (hates) .. 1 (reveres). Moved by what the stranger says and does. */
  regard: number;
  /** True for the one body the visitor is walking around in. */
  avatar: boolean;
  /** How it has decided to treat the shining stranger: 0 undecided, 1 curious, 2 wary, 3 hostile, 4 devoted. */
  stance: number;
  metAvatar: boolean;
  /** 0..1: how strongly it has come to suspect that its world is made and watched. Rises only from what happens to it and what it is told. */
  suspect: number;
  /** 0..1: how readily it looks into things and tries things. Inherited, and fed by what it finds. */
  wonder: number;
  /** Bits: which materials it has handled, and which things it knows how to make. */
  handled: number;
  knows: number;
  /** The landmass it last stood on, and the one it was born or set down on (-1 for none). */
  land: number;
  bornLand: number;
  /** Where it has been: points along its path, three numbers each, oldest first. */
  path: number[];
  name: string | null;
  log: LogEntry[];
  beliefs: Held[];
  thoughts: Thought[];
  alive: boolean;
  died: number;
  cause: string;
  kills: number;
}

export interface Fire { x: number; y: number; z: number; fuel: number; by: number }
export interface Shelter { x: number; y: number; z: number; wood: number; done: boolean; life: number; by: number; stone: boolean }
export interface Marker { x: number; y: number; z: number; by: number; t: number }
export interface Lump { x: number; y: number; z: number; energy: number }
/** A patch of weather the visitor made. */
export interface Blob { x: number; y: number; z: number; r: number; left: number; kind: "rain" | "drought" | "cold" }
/** Something new in the world that the curious may come to look at. */
export interface Novelty { x: number; y: number; z: number; t: number }

/** Something worth looking at, for the pings on the globe and the "happening now" strip. */
export interface Ping {
  id: number;
  t: number;
  kind: string;
  x: number;
  y: number;
  z: number;
  /** A creature to follow, or -1. */
  who: number;
  /** The news item that tells it in words, or -1. */
  news: number;
}

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

/** A kith trying to make something: what it could make with what it has handled. */
export interface Attempt {
  id: number;
  who: number;
  t: number;
  options: number[];
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
  /** Grown by plants and sea life. */
  grown: number;
  /** Spent on living. */
  burned: number;
  /** Lost in digestion, rot and die-back. */
  lost: number;
}

/** How a kind has been doing, one entry per day: for the chart of learning to survive. */
export interface Record {
  day: number;
  /** Alive at the end of the day. */
  alive: number;
  /** Mean age at death (days) of those that died that day, or -1 if none did. */
  lifespan: number;
  /** Highest generation alive. */
  gen: number;
  births: number;
}

export interface World {
  seed: number;
  terrain: Terrain;
  rng: Rng;
  t: number;
  tick: number;
  /** Grass per cell, 0..fert. */
  grass: Float64Array;
  /** Fruit on each bush. */
  bush: Float64Array;
  /** Sea life per cell, 0..1; -1 where there is none. */
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
  blobs: Blob[];
  novel: Novelty[];
  /** The visitor's own body in the world, if they have taken one, and what the kith have come to call it. */
  avatarId: number;
  avatarName: string | null;
  /** Where the visitor wants that body to go: a direction along the ground (zero for standing still). `down` is set if it is struck down. */
  ctl: { x: number; y: number; z: number; run: boolean; down: boolean; talkTo: number };
  /** What the visitor and the kith have said to each other, newest last. */
  chat: { who: number; me: boolean; text: string; t: number }[];
  /** Kith who have just seen the stranger for the first time and have yet to decide what to make of it. */
  sightings: { who: number; t: number }[];
  /** For each tree: how many times wood has been taken, and the time it will have grown back if it was felled. */
  cuts: Uint8Array;
  felled: Float64Array;
  /** Rain falling and ground wetness by region (6 faces of REGION x REGION). */
  rainGrid: Float32Array;
  wetGrid: Float32Array;
  /** Where the sun is: a unit vector from the planet's middle. */
  sunX: number;
  sunY: number;
  sunZ: number;
  /** Season in the north (the south is half a year away). */
  season: number;
  ideas: Idea[];
  placeNames: (string | null)[];
  placeNamedBy: number[];
  news: News[];
  pings: Ping[];
  /** Kinds of news already told, for "the first time" entries. */
  told: Set<string>;
  meetings: Meeting[];
  attempts: Attempt[];
  talks: Talk[];
  /** "auto": the engine settles meetings and makings itself. "external": it queues them for whoever writes the words. */
  talkMode: "auto" | "external";
  ledger: Ledger;
  counts: number[];
  placed: number[];
  births: number;
  deaths: number;
  /** Per kind, per day. */
  records: Record[][];
  dayStats: { births: number; deaths: number; ageSum: number }[];
  /** Spatial buckets, rebuilt every step. */
  buckets: number[][];
}
