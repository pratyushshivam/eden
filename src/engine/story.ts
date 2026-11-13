/**
 * Turning what happened into sentences, and taking what the language model
 * wrote back into the world. Nothing here invents events: every sentence is
 * built from a creature's log, its beliefs, or the world's news.
 */
import { CLEVER, DAY, IN, KITH, OUT, SEASONS, SEASON_DAYS, SPECIES, VEC } from "./config";
import { CRAFTS, materialWords } from "./craft";
import type { Attempt, Creature, Held, Idea, LogEntry, Meeting, News, Talk, Thought, World } from "./types";
import { ageDays, arc, craftOptions, discover, hold, makeIdea, settleAttempt, settleMeeting, sunAt, weatherAt, who } from "./world";

/* ---------------- names ---------------- */

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function placeName(w: World, p: number): string {
  if (p < 0) return "the open ground";
  return w.placeNames[p] ?? w.terrain.places[p].desc;
}

/** What to call a creature in a sentence. */
export function nameOf(w: World, id: number): string {
  const c = who(w, id);
  if (!c) return "one now forgotten";
  if (c.avatar) return w.avatarName ?? "the shining stranger";
  if (c.name) return c.name;
  const def = SPECIES[c.sp];
  return c.sp === KITH ? "one without a name yet" : `a ${def.one}`;
}

export function nameTaken(w: World, name: string): boolean {
  const n = name.toLowerCase();
  for (const c of w.creatures) if (c.name?.toLowerCase() === n) return true;
  for (const c of w.gone.values()) if (c.name?.toLowerCase() === n) return true;
  return w.placeNames.some((p) => p?.toLowerCase() === n);
}

/** Tidies a coined name; returns "" if it will not do. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().replace(/[^\p{L}' -]/gu, "").replace(/\s+/g, " ").slice(0, 16).trim();
  if (s.length < 2) return "";
  return cap(s);
}

const ON = ["", "", "k", "t", "m", "n", "r", "l", "s", "h", "b", "d", "v", "y", "sh", "th"];
const VO = ["a", "e", "i", "o", "u", "a", "o", "ai", "ua", "ee"];
const CO = ["", "", "n", "r", "l", "m", "k", "s"];
/** A name made of soft syllables, the same for the same creature every time. */
export function coinName(w: World, seed: number): string {
  for (let tries = 0; tries < 20; tries++) {
    let h = Math.imul(seed + tries * 7919, 2654435761) >>> 0;
    const pick = <T>(list: T[]): T => {
      h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return list[h % list.length];
    };
    const syl = (): string => pick(ON) + pick(VO) + pick(CO);
    const name = cap(syl() + (pick([0, 1, 1]) ? syl() : ""));
    if (name.length >= 3 && name.length <= 8 && !nameTaken(w, name)) return name;
  }
  return `Kith${seed}`;
}

export function giveName(w: World, c: Creature, name: string): boolean {
  const n = cleanName(name);
  if (!n || c.name || nameTaken(w, n)) return false;
  c.name = n;
  c.log.push({ t: w.t, k: "named", p: -1, o: -1, n: -1 });
  if (!w.told.has("firstName")) {
    w.told.add("firstName");
    w.news.push({ id: w.news.length, t: w.t, kind: "firstName", a: c.id, b: -1, p: -1, n: -1 });
  }
  return true;
}

export function namePlace(w: World, p: number, name: string, by: number): boolean {
  const n = cleanName(name);
  if (!n || p < 0 || p >= w.placeNames.length || w.placeNames[p] || nameTaken(w, n)) return false;
  w.placeNames[p] = n;
  w.placeNamedBy[p] = by;
  w.news.push({ id: w.news.length, t: w.t, kind: "placeNamed", a: by, b: -1, p, n: -1 });
  return true;
}

/* ---------------- sentences ---------------- */

export function when(t: number): string {
  const day = Math.floor(t / DAY);
  return `day ${day + 1}, ${SEASONS[Math.floor(day / SEASON_DAYS) % 4]}`;
}

export function lifeStage(w: World, c: Creature): string {
  const def = SPECIES[c.sp];
  const a = ageDays(w, c);
  if (a < def.adultAt * 0.35) return "newborn";
  if (a < def.adultAt) return "young";
  if (a > def.lifespan * 0.75) return "old";
  return "grown";
}

export function traitWords(c: Creature): string[] {
  const out: string[] = [];
  const t = c.traits;
  if (t.speed > 1.07) out.push("quick");
  else if (t.speed < 0.93) out.push("slow");
  if (t.size > 1.06) out.push("big");
  else if (t.size < 0.94) out.push("small");
  if (t.sense > 1.1) out.push("sharp-eyed");
  else if (t.sense < 0.9) out.push("short-sighted");
  if (t.bold > 0.68) out.push("bold");
  else if (t.bold < 0.32) out.push("timid");
  if (!out.length) out.push("ordinary in build");
  return out;
}

const CAUSE: Record<string, string> = {
  age: "of old age", hunger: "of hunger", thirst: "of thirst", cold: "of cold", killed: "killed by a russet",
};
export const causeWords = (c: Creature): string => CAUSE[c.cause] ?? "";

export function tellIdea(w: World, idea: Idea, plain = false): string {
  if (idea.text && !plain && idea.kind !== "craft") return idea.text;
  switch (idea.kind) {
    case "danger": return `${cap(placeName(w, idea.place))} is dangerous.`;
    case "good": return `${cap(placeName(w, idea.place))} is a good place, with food and water.`;
    case "follow": return `Stay close to ${nameOf(w, idea.who)}.`;
    case "avoid": return `Keep away from ${nameOf(w, idea.who)}.`;
    case "craft": {
      const c = CRAFTS[idea.craft];
      return idea.text && idea.text !== c.plain ? `How to make ${idea.text} (${c.plain}).` : `How to make ${c.plain}.`;
    }
    default: return idea.text;
  }
}

/** One log entry as a plain sentence about the creature. */
export function tellLog(w: World, e: LogEntry): string {
  const at = e.p >= 0 ? placeName(w, e.p) : "";
  const o = e.o >= 0 ? nameOf(w, e.o) : "";
  const near = at ? ` at ${at}` : "";
  switch (e.k) {
    case "placed": return `Came down out of the sky near ${at}, part grown, with no parents and no memory of before.`;
    case "born": return `Born near ${at} to ${o} and ${nameOf(w, e.n)}.`;
    case "grown": return "Came of age.";
    case "hungry": return `Nearly starved${near}.`;
    case "fed": return `Found food${near} and recovered.`;
    case "parched": return `Nearly died of thirst${near}.`;
    case "drank": return `Found water${near} in time.`;
    case "waded": return "Waded into the river for the first time.";
    case "reached": return `Saw ${at} for the first time.`;
    case "mated": return `Paired with ${o}.`;
    case "child": return `Had a child, ${o}.`;
    case "lostMate": return `Lost its mate, ${o}${deathOf(w, e.o)}.`;
    case "lostChild": return `Lost a child, ${o}${deathOf(w, e.o)}.`;
    case "lostParent": return `Lost a parent, ${o}${deathOf(w, e.o)}.`;
    case "sawKill": return `Saw ${o} killed by a russet${near}.`;
    case "escaped": return `Was chased by a russet${near} and got away.`;
    case "hurt": return `Was bitten by a russet${near} and lived.`;
    case "kill": return `Made its first kill${near}.`;
    case "fire": return `Made a fire${near}.`;
    case "shelter": return `Finished a shelter${near}.`;
    case "marker": return `Piled stones as a marker${near}.`;
    case "cold": return "Suffered through a sudden hard cold.";
    case "snow": return "Felt deep cold for the first time.";
    case "drought": return "Went thirsty when the river failed.";
    case "heard": return `Was told by ${o}: "${tellIdea(w, w.ideas[e.n])}"`;
    case "told": return `Told ${o}: "${tellIdea(w, w.ideas[e.n])}"`;
    case "met": return `Spoke with ${o}${near}.`;
    case "named": return "Took a name.";
    case "believed": return `Came to believe: "${tellIdea(w, w.ideas[e.n])}"`;
    case "made": return `Made something no one had shown it${near}: ${craftName(w, e.n)}. ${CRAFTS[w.ideas[e.n].craft].does}`;
    case "learned": return `Was shown by ${o} how to make ${craftName(w, e.n)}.`;
    case "sailed": return `Went out onto the sea for the first time, near ${at}.`;
    case "landed": return `Came ashore on a land it had never stood on: ${at}.`;
    case "hunted": return `Killed a ${who(w, e.o) ? SPECIES[(who(w, e.o) as Creature).sp].one : "creature"} with a spear${near}: its first hunt.`;
    case "skyKin": return `Saw one of its own kind come down out of the sky${near}, full grown, with no parents.`;
    case "skyBeast": return `Saw a ${SPECIES[e.n]?.one ?? "creature"} come down out of the sky${near}.`;
    case "skyFood": return `Saw food fall out of the empty sky${near}.`;
    case "skyRain": return `Saw rain come all at once out of a clear sky${near}.`;
    case "skyCold": return `Felt a sudden cold fall${near}, from nowhere.`;
    case "skyDry": return `Felt the rains stop${near}, as if something had turned them away.`;
    case "stranger": return `Met ${o}, one of its own kind from another land, who speaks of things by other names.`;
    case "sawGlow": return `Saw a stranger${near}: shaped like its own kind, but shining with its own light, born of no one.`;
    case "spokeGlow": return `Spoke with ${nameOf(w, w.avatarId >= 0 ? w.avatarId : e.o)}, the shining one, face to face.`;
    case "struckGlow": return `Struck at the shining stranger${near}.`;
    case "felled": return `Brought down a tree for its wood${near}.`;
  }
}

/** What a group calls a thing it makes. */
export function craftName(w: World, ideaId: number): string {
  const idea = w.ideas[ideaId];
  const c = CRAFTS[idea.craft];
  return idea.text && idea.text !== c.plain ? `${idea.text} (${c.plain})` : c.plain;
}

function deathOf(w: World, id: number): string {
  const c = who(w, id);
  const how = c ? causeWords(c) : "";
  return how ? ` (${how})` : "";
}

/** One line of the world's chronicle. */
export function tellNews(w: World, n: News): string {
  const a = n.a >= 0 ? nameOf(w, n.a) : "";
  const b = n.b >= 0 ? nameOf(w, n.b) : "";
  const at = n.p >= 0 ? placeName(w, n.p) : "";
  const near = at ? ` near ${at}` : "";
  switch (n.kind) {
    case "arrive": return `The first of the ${SPECIES[n.n].many} came down onto the planet.`;
    case "firstBirth": return `The first ${SPECIES[n.n].one} was born here${near}.`;
    case "invented": return `${cap(a)} made something new${near}: ${craftName(w, n.n)}. ${CRAFTS[w.ideas[n.n].craft].does}`;
    case "reinvented": return `${cap(a)} worked out for itself how to make ${craftName(w, n.n)}.`;
    case "craftSpread": return `The making of ${craftName(w, n.n)} is spreading among the kith. It began with ${a}.`;
    case "firstSail": return `${cap(a)} was the first to go out onto the sea.`;
    case "landfall": return `${cap(a)} crossed the water and came ashore${near}: the first of its people on ${w.terrain.lands[n.n]?.desc ?? "that land"}.`;
    case "groupsMet": return `Two peoples met for the first time${near}: ${a} and ${b}.`;
    case "firstHunt": return `${cap(a)} hunted with a spear for the first time${near}.`;
    case "avatar": return `You came down among them in a body of your own${near}.`;
    case "firstSight": return `${cap(a)} was the first to see the shining stranger${near}.`;
    case "firstFell": return `${cap(a)} brought down the first tree${near}.`;
    case "suspects": return `${cap(a)} has begun to suspect that the world is made, and watched.`;
    case "knows": return `${cap(a)} is now all but sure: the world is a made thing, held inside something larger.`;
    case "firstDeath": {
      const c = who(w, n.a);
      return `The first death: ${c ? `a ${SPECIES[c.sp].one}` : "a creature"}${c?.name ? ` called ${c.name}` : ""}, ${c ? causeWords(c) : ""}${near}.`;
    }
    case "kithDeath": {
      const c = who(w, n.a);
      return `${cap(a)} died ${c ? causeWords(c) : ""}${near}${c ? `, ${Math.round(ageDays(w, c))} days old` : ""}.`;
    }
    case "firstKill": return `A hunter made the first kill: a ${SPECIES[n.n].one}${near}.`;
    case "lastOne": return `The last of the ${SPECIES[n.n].many} died${near}. There are none left.`;
    case "generation": {
      const c = who(w, n.a);
      return `A ${c ? SPECIES[c.sp].one : "creature"} of the ${ordinal(n.n)} generation was born${near}.`;
    }
    case "firstWade": return `${cap(a)} was the first of the kith to wade into the river.`;
    case "firstFire": return `${cap(a)} made the first fire${near}.`;
    case "firstShelter": return `${cap(a)} finished the first shelter${near}.`;
    case "firstMarker": return `${cap(a)} piled the first marker of stones${near}.`;
    case "firstMeet": return `Two kith spoke for the first time${near}: ${a} and ${b}.`;
    case "firstTold": return `The first belief was passed on: ${a} told ${b} "${tellIdea(w, w.ideas[n.n])}"`;
    case "spread": return `A belief took hold among the kith: "${tellIdea(w, w.ideas[n.n])}" It began with ${a}.`;
    case "firstName": return `The first name: one of the kith became ${a}.`;
    case "placeNamed": return `${cap(a)} gave ${w.terrain.places[n.p].desc} a name: ${w.placeNames[n.p] ?? ""}.`;
    case "season": return `${cap(SEASONS[n.n])} came to the north, ${SEASONS[(n.n + 2) % 4]} to the south.`;
    case "crowd": return `There were ${n.n} creatures alive at once.`;
    case "rainSent": return `Rain came out of a clear sky${near}.`;
    case "drought": return `A drought began${near}.`;
    case "droughtEnd": return "A drought ended.";
    case "cold": return `A sudden cold fell${near}.`;
    case "coldEnd": return "A hard cold lifted.";
    case "lore": return `${cap(a)} said something the others repeated: "${tellIdea(w, w.ideas[n.n])}"`;
    case "namedYou": return `${cap(a)} gave the shining stranger a name: ${w.avatarName ?? ""}.`;
    default: return n.kind;
  }
}

function ordinal(n: number): string {
  const words: Record<number, string> = { 3: "third", 6: "sixth", 10: "tenth", 15: "fifteenth" };
  return words[n] ?? `${n}th`;
}

/* ---------------- the plain voice (no language model) ---------------- */

/** A short reflection assembled from the log, used when no model is available. */
export function plainVoice(w: World, c: Creature): Thought {
  const bits: string[] = [];
  const first = c.log[0];
  if (first?.k === "born") bits.push(`I began near ${placeName(w, first.p)}.`);
  else if (first) bits.push(`I do not remember a beginning, only ${placeName(w, first.p)}.`);
  const recent = [...c.log].reverse();
  const loss = recent.find((e) => e.k === "lostMate" || e.k === "lostChild" || e.k === "lostParent");
  if (loss) bits.push(`${cap(nameOf(w, loss.o))} is gone and does not come back.`);
  const near = recent.find((e) => e.k === "hungry" || e.k === "parched" || e.k === "hurt" || e.k === "escaped");
  if (near) bits.push(near.k === "hungry" ? "I have been empty and it nearly ended me." : near.k === "parched" ? "I have been dry to the bone." : "The red hunter came for me and I am still here.");
  const strongest = [...c.beliefs].sort((x, y) => y.s - x.s)[0];
  if (strongest) bits.push(tellIdea(w, w.ideas[strongest.idea], true));
  if (bits.length < 2) bits.push(sunAt(w, c.x, c.y, c.z) < 0 ? "The bright one has gone under again." : "The bright one is up and the ground is warm.");
  return { t: w.t, text: bits.slice(0, 3).join(" "), by: "plain" };
}

/* ---------------- facts for the language model ---------------- */

function kinLine(w: World, c: Creature): string[] {
  const out: string[] = [];
  const rel = (id: number, word: string): void => {
    const o = who(w, id);
    if (o) out.push(`${word}: ${nameOf(w, id)}${o.alive ? "" : ` (dead, ${causeWords(o)})`}`);
  };
  rel(c.mother, "mother");
  rel(c.father, "father");
  rel(c.mate, "mate");
  for (const k of c.children.slice(-4)) rel(k, "child");
  return out;
}

export interface KithFacts {
  id: number;
  name: string | null;
  sex: string;
  stage: string;
  age_days: number;
  traits: string[];
  kin: string[];
  life: string[];
  beliefs: string[];
  /** Who it is: its nature, its habit of speech, and its mood just now. These decide how it talks and what it will do. */
  nature: string[];
  way_of_speaking: string;
  mood: string;
  /** How readily it looks into things, and how far it has come to suspect its world is made: words, then 0..1. */
  curiosity: string;
  suspicion: string;
  suspicion_level: number;
  /** What it knows how to make, and what it has had in its hands. */
  makes: string[];
  handled: string[];
  land: string;
  places: { id: number; what: string; name: string | null }[];
}

export function kithFacts(w: World, c: Creature, lifeLines = 14): KithFacts {
  // The first few memories and the latest ones.
  const log = c.log.length > lifeLines ? [...c.log.slice(0, 3), ...c.log.slice(-(lifeLines - 3))] : c.log;
  return {
    id: c.id,
    name: c.name,
    sex: c.sex ? "male" : "female",
    stage: lifeStage(w, c),
    age_days: Math.round(ageDays(w, c) * 10) / 10,
    traits: traitWords(c),
    kin: kinLine(w, c),
    life: log.map((e) => `${when(e.t)}: ${tellLog(w, e)}`),
    beliefs: c.beliefs.filter((h) => w.ideas[h.idea].kind !== "craft").map((h) => tellIdea(w, w.ideas[h.idea])),
    nature: natureWords(c),
    way_of_speaking: mannerOf(c),
    mood: moodOf(w, c),
    curiosity: c.wonder > 0.7 ? "restless, must look into everything" : c.wonder > 0.45 ? "curious" : "incurious, keeps to what it knows",
    suspicion: suspectWords(c.suspect),
    suspicion_level: Math.round(c.suspect * 100) / 100,
    makes: c.beliefs.filter((h) => w.ideas[h.idea].kind === "craft").map((h) => `${craftName(w, h.idea)}: ${CRAFTS[w.ideas[h.idea].craft].does}`),
    handled: materialWords(c.handled),
    land: c.land >= 0 ? w.terrain.lands[c.land].desc : "the open sea",
    places: w.terrain.places.filter((p) => c.seen & (1 << p.id)).map((p) => ({ id: p.id, what: p.desc, name: w.placeNames[p.id] })),
  };
}

const MANNERS = [
  "speaks in short blunt statements", "answers a question with a question", "talks round a thing before saying it", "jokes when uneasy",
  "speaks slowly and gravely, as if each word cost something", "boasts, and turns talk to itself", "hedges and mutters, never quite committing",
  "is tender, and calls others by what they are to it", "is sharp-tongued and mocks what it does not believe", "says little, and what it says is an order or a refusal",
];

/** A kith's nature, in plain words: who it is, apart from what has happened to it. */
export function natureWords(c: Creature): string[] {
  const n = c.nature;
  const out: string[] = [];
  out.push(n.temper > 0.7 ? "quick to anger" : n.temper < 0.3 ? "slow to anger, hard to rouse" : "even-tempered");
  out.push(n.trust > 0.7 ? "trusting, takes others at their word" : n.trust < 0.3 ? "distrustful, wants proof" : "wary but fair");
  out.push(n.pride > 0.7 ? "proud, will not be told what to do" : n.pride < 0.3 ? "meek, gives way to others" : "holds its ground without pushing");
  out.push(n.warmth > 0.7 ? "warm, cares for those near it" : n.warmth < 0.3 ? "cold, keeps to itself" : "neither warm nor cold");
  if (c.traits.bold > 0.68) out.push("bold");
  else if (c.traits.bold < 0.32) out.push("easily frightened");
  return out;
}
export const mannerOf = (c: Creature): string => MANNERS[c.speech % MANNERS.length];

/** How it is feeling just now, from the last day of its life. */
export function moodOf(w: World, c: Creature): string {
  const recent = c.log.filter((e) => w.t - e.t < DAY * 1.2).map((e) => e.k);
  if (recent.some((k) => k === "lostMate" || k === "lostChild" || k === "lostParent")) return "grieving";
  if (recent.some((k) => k === "hurt" || k === "escaped" || k === "sawKill")) return "shaken and on edge";
  if (c.energy < 30) return "weak with hunger";
  if (c.thirst > 0.7) return "parched";
  if (recent.includes("made")) return "pleased with itself";
  if (recent.includes("child")) return "glad";
  return c.nature.temper > 0.7 ? "restless" : "settled";
}

export function regardWords(r: number): string {
  return r > 0.6 ? "reveres it" : r > 0.25 ? "likes it" : r > -0.25 ? "has no settled feeling about it" : r > -0.6 ? "dislikes it" : "hates it";
}

/** What a level of suspicion means, in words the model can write from. */
export function suspectWords(s: number): string {
  if (s < 0.1) return "none: takes the world as it finds it";
  if (s < 0.3) return "faint: has noticed that some things come from nowhere, and has no account of it";
  if (s < 0.5) return "growing: thinks something unseen puts things into the world and takes an interest in it";
  if (s < 0.7) return "strong: thinks the world is watched, and that the watcher can reach into it at will";
  if (s < 0.9) return "deep: thinks the whole world may be a made thing, small, with an outside that the watcher lives in";
  return "certain: holds that this world is made and kept inside something that belongs to the watcher, and that the watcher's world is the real one";
}

export const STANCE_WORDS = ["has not decided what to make of it", "is curious about it and drawn to it", "is wary of it and keeps away", "is set against it and would drive it off", "is devoted to it and follows it"];

export function nowFacts(w: World, c: Creature): { season: string; time: string; weather: string } {
  const sun = sunAt(w, c.x, c.y, c.z);
  const wx = weatherAt(w, c.x, c.y, c.z);
  return {
    season: SEASONS[(w.season + (c.y < 0 ? 2 : 0)) % 4],
    time: sun < -0.05 ? "night" : sun < 0.25 ? "the bright one is low" : "day",
    weather: wx.dry ? "the rains have stopped and the ground is cracking" : wx.rain > 0.3 ? (wx.temp < 1.5 ? "snow" : "rain") : wx.temp < 3 ? "bitter cold" : wx.temp > 30 ? "great heat" : "fair",
  };
}

export interface VoiceResult {
  thought?: unknown;
  name?: unknown;
  place_names?: unknown;
  saying?: unknown;
}

/** Takes what the model wrote for one creature and stores what is valid. */
export function applyVoice(w: World, c: Creature, r: VoiceResult): Thought | null {
  if (typeof r.thought !== "string" || r.thought.trim().length < 8) return null;
  if (!c.name && r.name) giveName(w, c, String(r.name));
  if (Array.isArray(r.place_names)) {
    for (const pn of r.place_names.slice(0, 2)) {
      if (pn && typeof pn === "object" && Number.isInteger((pn as { id: unknown }).id)) {
        const id = (pn as { id: number }).id;
        if (c.seen & (1 << id)) namePlace(w, id, String((pn as { name: unknown }).name ?? ""), c.id);
      }
    }
  }
  if (typeof r.saying === "string" && r.saying.trim().length > 8 && r.saying.length < 120 && !c.beliefs.some((h) => w.ideas[h.idea].kind === "lore")) {
    const idea = makeIdea(w, "lore", -1, -1, c.id, r.saying.trim());
    hold(w, c, idea, 0.9, -1);
  }
  const th: Thought = { t: w.t, text: r.thought.trim().slice(0, 600), by: "model" };
  c.thoughts.push(th);
  if (c.thoughts.length > 6) c.thoughts.shift();
  return th;
}

export interface Tellable {
  ref: string;
  gist: string;
  /** The place the belief is about, if it is about one. */
  place_id?: number;
}

/** What each of the two could tell the other: the beliefs the other does not hold. */
export function tellables(w: World, from: Creature, to: Creature, tag: string): { list: Tellable[]; held: Held[] } {
  const held = from.beliefs.filter((b) => !to.beliefs.some((t) => t.idea === b.idea)).sort((x, y) => y.s - x.s).slice(0, 3);
  return { held, list: held.map((h, i) => {
      const idea = w.ideas[h.idea];
      return idea.place >= 0 ? { ref: `${tag}${i + 1}`, gist: tellIdea(w, idea), place_id: idea.place } : { ref: `${tag}${i + 1}`, gist: tellIdea(w, idea) };
    }),
  };
}

export interface TalkResult {
  lines?: unknown;
  told?: unknown;
  names?: unknown;
  place_names?: unknown;
}

function pushTalk(w: World, talk: Talk): void {
  w.talks.push(talk);
  if (w.talks.length > 60) w.talks.shift();
}

/** A meeting with no model: the engine settles it and writes the barest exchange. */
export function plainMeeting(w: World, m: Meeting): Talk | null {
  const a = w.byId.get(m.a), b = w.byId.get(m.b);
  if (!a || !b) return null;
  const before = new Set([...a.beliefs, ...b.beliefs].map((h) => `${h.idea}:${h.from}`));
  const edgesBefore = w.ideas.reduce((n, i) => n + i.edges.length, 0);
  settleMeeting(w, m);
  const lines: Talk["lines"] = [];
  const ideas: number[] = [];
  if (w.ideas.reduce((n, i) => n + i.edges.length, 0) > edgesBefore) {
    for (const c of [a, b])
      for (const h of c.beliefs)
        if (!before.has(`${h.idea}:${h.from}`) && h.from >= 0) {
          ideas.push(h.idea);
          lines.push({ who: h.from, text: tellIdea(w, w.ideas[h.idea], true) });
          lines.push({ who: c.id, text: "I will remember." });
        }
  } else {
    lines.push({ who: a.id, text: "You are still here." }, { who: b.id, text: "Still here." });
  }
  const talk: Talk = { t: w.t, a: a.id, b: b.id, lines, ideas, by: "plain" };
  pushTalk(w, talk);
  return talk;
}

/**
 * Takes the exchange the model wrote and makes it real: the lines are kept,
 * and each thing one told the other enters the listener's beliefs. If the
 * model moved a belief to a different place, that is a mistelling, and it is
 * recorded as one.
 */
export function applyMeeting(w: World, m: Meeting, r: TalkResult): Talk | null {
  const a = w.byId.get(m.a), b = w.byId.get(m.b);
  if (!a || !b || !Array.isArray(r.lines)) return null;
  const idOf = (tag: unknown): Creature | null => (tag === "a" ? a : tag === "b" ? b : null);
  const lines: Talk["lines"] = [];
  for (const l of r.lines.slice(0, 6)) {
    const sp = idOf((l as { who?: unknown })?.who);
    const text = (l as { text?: unknown })?.text;
    if (sp && typeof text === "string" && text.trim()) lines.push({ who: sp.id, text: text.trim().slice(0, 200) });
  }
  if (lines.length < 2) return null;
  const ta = tellables(w, a, b, "a"), tb = tellables(w, b, a, "b");
  const ideas: number[] = [];
  if (r.names && typeof r.names === "object") {
    const nm = r.names as { a?: unknown; b?: unknown };
    if (nm.a) giveName(w, a, String(nm.a));
    if (nm.b) giveName(w, b, String(nm.b));
  }
  if (Array.isArray(r.place_names)) {
    for (const pn of r.place_names.slice(0, 2)) {
      const id = (pn as { id?: unknown })?.id;
      if (Number.isInteger(id)) namePlace(w, id as number, String((pn as { name?: unknown }).name ?? ""), a.id);
    }
  }
  if (Array.isArray(r.told)) {
    for (const item of r.told.slice(0, 3)) {
      const it = item as { by?: unknown; ref?: unknown; kind?: unknown; place_id?: unknown; who_id?: unknown; text?: unknown };
      const from = idOf(it.by);
      if (!from) continue;
      const to = from === a ? b : a;
      const src = from === a ? ta : tb;
      const k = src.list.findIndex((x) => x.ref === it.ref);
      const text = typeof it.text === "string" ? it.text.trim().slice(0, 140) : "";
      let idea: Idea | null = null;
      if (k >= 0) {
        const orig = w.ideas[src.held[k].idea];
        const place = Number.isInteger(it.place_id) ? (it.place_id as number) : orig.place;
        if (orig.place >= 0 && place !== orig.place && place >= 0 && place < w.terrain.places.length) {
          // The telling changed the place: a new, mistaken idea descends from the old one.
          idea = makeIdea(w, orig.kind, place, -1, from.id, "", orig.id);
        } else idea = orig;
        if (text && !idea.text) idea.text = text;
        if (hold(w, to, idea, Math.max(0.4, src.held[k].s * 0.8), from.id)) {
          from.log.push({ t: w.t, k: "told", p: idea.place, o: to.id, n: idea.id });
          to.log.push({ t: w.t, k: "heard", p: idea.place, o: from.id, n: idea.id });
          ideas.push(idea.id);
        }
      } else if (it.kind === "follow" || it.kind === "avoid") {
        const target = Number.isInteger(it.who_id) ? w.byId.get(it.who_id as number) : undefined;
        if (target && target.sp === KITH && target.id !== to.id) {
          idea = makeIdea(w, it.kind, -1, target.id, from.id);
          if (text && !idea.text) idea.text = text;
          if (hold(w, to, idea, 0.6, from.id)) {
            to.log.push({ t: w.t, k: "heard", p: -1, o: from.id, n: idea.id });
            ideas.push(idea.id);
          }
        }
      } else if (it.kind === "lore" && text.length > 8) {
        const existing = from.beliefs.map((h) => w.ideas[h.idea]).find((i) => i.kind === "lore");
        idea = existing ?? makeIdea(w, "lore", -1, -1, from.id, text);
        if (!existing) hold(w, from, idea, 0.9, -1);
        if (hold(w, to, idea, 0.6, from.id)) {
          to.log.push({ t: w.t, k: "heard", p: -1, o: from.id, n: idea.id });
          ideas.push(idea.id);
          if (idea.edges.length === 2) w.news.push({ id: w.news.length, t: w.t, kind: "lore", a: idea.origin, b: -1, p: -1, n: idea.id });
        }
      }
    }
  }
  if (ideas.length && !w.told.has("firstTold")) {
    w.told.add("firstTold");
    const idea = w.ideas[ideas[0]];
    const e = idea.edges[idea.edges.length - 1];
    w.news.push({ id: w.news.length, t: w.t, kind: "firstTold", a: e.a, b: e.b, p: idea.place, n: idea.id });
  }
  const talk: Talk = { t: w.t, a: a.id, b: b.id, lines, ideas, by: "model" };
  pushTalk(w, talk);
  return talk;
}

/** Everyone, living or dead, who has held an idea, in the order it reached them. */
export function ideaPath(idea: Idea): { from: number; to: number; t: number }[] {
  return idea.edges.map((e) => ({ from: e.a, to: e.b, t: e.t }));
}


/* ---------------- making things ---------------- */

/** What a kith that is trying things has to hand, and what could come of it. */
export function attemptFacts(w: World, a: Attempt): { one: KithFacts; in_hands: string[]; could_make: { ref: string; what: string; use: string }[] } | null {
  const c = w.byId.get(a.who);
  if (!c) return null;
  const options = craftOptions(c).filter((o) => a.options.includes(o));
  if (!options.length) return null;
  return {
    one: kithFacts(w, c, 10),
    in_hands: materialWords(c.handled),
    could_make: options.map((o) => ({ ref: `m${o}`, what: CRAFTS[o].what, use: CRAFTS[o].does })),
  };
}

export interface AttemptResult {
  make?: unknown;
  name?: unknown;
  how?: unknown;
}

/** Takes what the model decided this kith makes, and makes it real. Falls back to chance if the answer is no use. */
export function applyAttempt(w: World, a: Attempt, r: AttemptResult | null): Idea | null {
  const c = w.byId.get(a.who);
  if (!c) return null;
  const ref = typeof r?.make === "string" ? Number(r.make.replace(/^m/, "")) : NaN;
  if (!r || !Number.isInteger(ref) || !a.options.includes(ref)) return settleAttempt(w, a);
  const name = cleanName(r.name).toLowerCase();
  const idea = discover(w, c, ref, name && !nameTaken(w, name) ? name : "");
  if (idea && typeof r.how === "string" && r.how.trim().length > 8) {
    c.thoughts.push({ t: w.t, text: r.how.trim().slice(0, 400), by: "model" });
    if (c.thoughts.length > 6) c.thoughts.shift();
  }
  return idea;
}

/* ---------------- wordless minds ---------------- */

const FEELS: [number, string][] = [
  [IN.fear, "afraid"], [IN.hunger, "hungry"], [IN.thirst, "thirsty"], [IN.cold, "cold"], [IN.tired, "tired"], [IN.hurt, "hurting"],
  [IN.novel, "curious"], [IN.goodBelief, "remembering food"], [IN.dangerBelief, "wary of this place"], [IN.followNear, "missing someone"],
];
const WANTS: [number, string][] = [
  [VEC.food, "food"], [VEC.water, "water"], [VEC.kin, "the others"], [VEC.home, "home"], [VEC.follow, "the one it follows"], [VEC.novel, "the new thing"],
  [VEC.goodPlace, "the place that fed it"], [OUT.rest, "sleep"], [OUT.play, "play"], [OUT.mate, "a mate"],
];
/**
 * A clever animal has no words. This puts its strongest feelings and wants,
 * read straight from its own network, into two or three plain ones. Nothing
 * is written by a language model.
 */
export function impression(c: Creature): string {
  if (SPECIES[c.sp].tier < CLEVER) return "";
  const feel = FEELS.map(([i, n]) => [c.inp[i], n] as [number, string]).filter((x) => x[0] > 0.35).sort((x, y) => y[0] - x[0]).slice(0, 2).map((x) => x[1]);
  const want = WANTS.map(([i, n]) => [c.out[i], n] as [number, string]).filter((x) => x[0] > 0.3).sort((x, y) => y[0] - x[0])[0];
  const bits = [...feel];
  if (want) bits.push(`wants ${want[1]}`);
  return bits.length ? bits.join(" · ") : "at ease";
}

/** The line of mothers back to the one the visitor set down. Nearest first. */
export function lineage(w: World, c: Creature): Creature[] {
  const out: Creature[] = [];
  let cur: Creature | undefined = c;
  for (let i = 0; i < 40 && cur && cur.mother >= 0; i++) {
    cur = who(w, cur.mother);
    if (cur) out.push(cur);
  }
  return out;
}

/* ---------------- the shining stranger ---------------- */

const DOES = ["watch", "approach", "flee", "attack", "follow", "fetch_others", "stay", "refuse", "turn_away"];
/** What the model says a kith does about the stranger, as a stance. -1 leaves it as it was. */
function stanceOf(does: unknown): number {
  switch (does) {
    case "approach": return 1;
    case "watch": return 0;
    case "flee": return 2;
    case "attack": return 3;
    case "follow": return 4;
    case "fetch_others": return 1;
    case "turn_away": return 2;
    default: return -1;
  }
}

/** What a kith is looking at when it looks at the visitor's body. */
export function strangerFacts(w: World, c: Creature): { steps_away: number; what: string; called: string | null; this_one: string; feeling_towards_it: string; said_so_far: string[] } | null {
  const av = w.byId.get(w.avatarId);
  if (!av) return null;
  return {
    steps_away: Math.round(arc(av.x, av.y, av.z, c.x, c.y, c.z)),
    what: "a stranger: shaped like one of its own kind, but shining with its own light, born of no mother, belonging to no people. It walks, it watches, and sometimes it speaks.",
    called: w.avatarName,
    this_one: STANCE_WORDS[c.stance] ?? STANCE_WORDS[0],
    feeling_towards_it: regardWords(c.regard),
    said_so_far: w.chat.filter((m) => m.who === c.id).slice(-8).map((m) => `${m.me ? "stranger" : "it"}: ${m.text}`),
  };
}

export interface ReactResult {
  feels?: unknown;
  does?: unknown;
  says?: unknown;
  calls_it?: unknown;
}

/** Takes the model's account of how this kith takes the stranger, and makes it so. Returns what it says aloud, if anything. */
export function applyReact(w: World, c: Creature, r: ReactResult | null): string {
  if (!r || !DOES.includes(String(r.does))) {
    if (c.stance === 0) c.stance = c.traits.bold > 0.5 ? 1 : 2;
    return "";
  }
  const st = stanceOf(r.does);
  if (st >= 0) c.stance = st;
  if (typeof r.feels === "string" && r.feels.trim().length > 8) {
    c.thoughts.push({ t: w.t, text: r.feels.trim().slice(0, 400), by: "model" });
    if (c.thoughts.length > 6) c.thoughts.shift();
  }
  if (!w.avatarName) {
    const n = cleanName(r.calls_it);
    if (n && !nameTaken(w, n)) {
      w.avatarName = n;
      w.news.push({ id: w.news.length, t: w.t, kind: "namedYou", a: c.id, b: -1, p: -1, n: -1 });
    }
  }
  return typeof r.says === "string" ? r.says.trim().slice(0, 200) : "";
}

export interface AnswerResult {
  says?: unknown;
  regard?: unknown;
  does?: unknown;
  believes?: unknown;
  suspect?: unknown;
  thought?: unknown;
}

/**
 * The visitor has spoken to a kith, and the model has written what it answers.
 * What the visitor said is real to it: it may come to believe it, and pass it on.
 */
export function applyAnswer(w: World, c: Creature, said: string, r: AnswerResult | null): string {
  const first = !c.log.some((e) => e.k === "spokeGlow");
  c.log.push({ t: w.t, k: "spokeGlow", p: -1, o: w.avatarId, n: -1 });
  if (first) c.suspect = Math.min(1, c.suspect + 0.06);
  w.chat.push({ who: c.id, me: true, text: said.slice(0, 240), t: w.t });
  let reply = "";
  if (r && typeof r.says === "string" && r.says.trim()) {
    reply = r.says.trim().slice(0, 300);
    const st = stanceOf(r.does);
    if (st >= 0) c.stance = st;
    else if (r.does === "refuse" && c.stance === 4) c.stance = 1;
    // How the exchange changed what it feels about the stranger; and being treated well or badly leaves a mark on its nature.
    const g = Number(r.regard);
    if (Number.isFinite(g)) {
      const d = Math.max(-0.4, Math.min(0.4, g));
      c.regard = Math.max(-1, Math.min(1, c.regard + d));
      c.nature.trust = Math.max(0, Math.min(1, c.nature.trust + d * 0.15));
      c.nature.temper = Math.max(0, Math.min(1, c.nature.temper - d * 0.1));
    }
    // How much the exchange moved it towards thinking the world is made: the model's reading, kept within bounds.
    const d = Number(r.suspect);
    if (Number.isFinite(d)) c.suspect = Math.max(0, Math.min(1, c.suspect + Math.max(-0.1, Math.min(0.3, d))));
    const b = r.believes as { kind?: unknown; place_id?: unknown; text?: unknown } | null | undefined;
    if (b && typeof b === "object" && typeof b.text === "string" && b.text.trim().length > 6) {
      const text = b.text.trim().slice(0, 140);
      const place = Number.isInteger(b.place_id) && (b.place_id as number) >= 0 && (b.place_id as number) < w.terrain.places.length ? (b.place_id as number) : -1;
      const kind = (b.kind === "danger" || b.kind === "good") && place >= 0 ? b.kind : "lore";
      const idea = makeIdea(w, kind, kind === "lore" ? -1 : place, -1, w.avatarId, kind === "lore" ? text : "");
      if (kind !== "lore" && !idea.text) idea.text = text;
      if (hold(w, c, idea, 0.9, w.avatarId)) c.log.push({ t: w.t, k: "heard", p: place, o: w.avatarId, n: idea.id });
    }
    if (typeof r.thought === "string" && r.thought.trim().length > 8) {
      c.thoughts.push({ t: w.t, text: r.thought.trim().slice(0, 400), by: "model" });
      if (c.thoughts.length > 6) c.thoughts.shift();
    }
  } else {
    // No model: it answers plainly, by how it has taken the stranger.
    const n = c.nature;
    // No model: it answers plainly, out of its own nature and how it has taken the stranger.
    reply =
      c.stance === 3 ? (n.pride > 0.6 ? "This is our ground. Go." : "Go away. Go!")
      : c.stance === 2 ? (n.trust < 0.35 ? "I do not believe a word from a thing that shines." : "Keep back. I am listening from here.")
      : c.stance === 4 ? (n.pride < 0.35 ? "Tell me what to do and I will do it." : "I will walk where you walk, for now.")
      : n.pride > 0.7 ? "You do not tell me things. You ask me."
      : n.warmth > 0.7 ? "You are far from your own. Are you hungry?"
      : n.trust < 0.3 ? "Show me. Words are easy."
      : n.temper > 0.7 ? "Say it quickly. I have no patience for shining things."
      : "You shine. Why do you shine?";
    // Asked to come along, it decides for itself: the proud and the distrustful mostly will not.
    if (/\b(follow|come with|come along|walk with)\b/i.test(said)) {
      const will = c.regard * 0.6 + n.trust * 0.5 + (1 - n.pride) * 0.5 + (c.traits.bold < 0.3 ? 0.15 : 0) - 0.55;
      if (c.stance !== 3 && will > 0.12) {
        c.stance = 4;
        reply = n.pride < 0.35 ? "Yes. I will come. Do not go fast." : "I will come a little way, and see.";
      } else {
        if (c.stance === 4) c.stance = 1;
        reply = n.pride > 0.6 ? "I follow no one. You may follow me." : n.trust < 0.4 ? "Follow you where? No. Not until I know what you are." : n.temper > 0.65 ? "No. Stop asking." : "No. My place is here.";
        c.regard = Math.max(-1, c.regard - (n.pride > 0.6 ? 0.08 : 0.02));
      }
    } else if (/\b(go away|leave me|stop following|stay here|stay)\b/i.test(said) && c.stance === 4) {
      c.stance = 1;
      reply = n.pride < 0.35 ? "As you say. I will stay." : "Then go on without me.";
    }
    if (c.stance === 0) c.stance = c.traits.bold > 0.5 ? 1 : 2;
  }
  w.chat.push({ who: c.id, me: false, text: reply, t: w.t });
  if (w.chat.length > 80) w.chat.splice(0, w.chat.length - 80);
  return reply;
}
