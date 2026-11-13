/**
 * Turning what happened into sentences, and taking what the language model
 * wrote back into the world. Nothing here invents events: every sentence is
 * built from a creature's log, its beliefs, or the world's news.
 */
import { DAY, KITH, SEASONS, SEASON_DAYS, SPECIES } from "./config";
import type { Creature, Held, Idea, LogEntry, Meeting, News, Talk, Thought, World } from "./types";
import { ageDays, hold, makeIdea, settleMeeting, who } from "./world";

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
  if (idea.text && !plain) return idea.text;
  switch (idea.kind) {
    case "danger": return `${cap(placeName(w, idea.place))} is dangerous.`;
    case "good": return `${cap(placeName(w, idea.place))} is a good place, with food and water.`;
    case "follow": return `Stay close to ${nameOf(w, idea.who)}.`;
    case "avoid": return `Keep away from ${nameOf(w, idea.who)}.`;
    default: return idea.text;
  }
}

/** One log entry as a plain sentence about the creature. */
export function tellLog(w: World, e: LogEntry): string {
  const at = e.p >= 0 ? placeName(w, e.p) : "";
  const o = e.o >= 0 ? nameOf(w, e.o) : "";
  const near = at ? ` at ${at}` : "";
  switch (e.k) {
    case "placed": return `Arrived on the island near ${at}, part grown, with no parents.`;
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
  }
}

function deathOf(w: World, id: number): string {
  const c = who(w, id);
  const how = c ? causeWords(c) : "";
  return how ? ` (${how})` : "";
}

const SP_FIRST = ["dapple", "russet", "skim", "kith"];
/** One line of the world's chronicle. */
export function tellNews(w: World, n: News): string {
  const a = n.a >= 0 ? nameOf(w, n.a) : "";
  const b = n.b >= 0 ? nameOf(w, n.b) : "";
  const at = n.p >= 0 ? placeName(w, n.p) : "";
  const near = at ? ` near ${at}` : "";
  switch (n.kind) {
    case "arrive": return `The first ${SPECIES[n.n].many} were set down on the island.`;
    case "firstBirth": return `The first ${SP_FIRST[n.n]} was born on the island${near}.`;
    case "firstDeath": {
      const c = who(w, n.a);
      return `The first death: ${c ? `a ${SPECIES[c.sp].one}` : "a creature"}${c?.name ? ` called ${c.name}` : ""}, ${c ? causeWords(c) : ""}${near}.`;
    }
    case "kithDeath": {
      const c = who(w, n.a);
      return `${cap(a)} died ${c ? causeWords(c) : ""}${near}${c ? `, ${Math.round(ageDays(w, c))} days old` : ""}.`;
    }
    case "firstKill": return `A russet made the first kill: a ${SPECIES[n.n].one}${near}.`;
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
    case "season": return `${cap(SEASONS[n.n])} came.`;
    case "firstWinter": return "The first winter. The grass thinned and the berries failed.";
    case "crowd": return `There were ${n.n} creatures alive at once.`;
    case "rainSent": return "Rain came out of a clear sky.";
    case "drought": return "A drought began. The river started to fail.";
    case "droughtEnd": return "The drought ended.";
    case "cold": return "A sudden cold fell over the island.";
    case "coldEnd": return "The cold lifted.";
    case "lore": return `${cap(a)} said something the others repeated: "${tellIdea(w, w.ideas[n.n])}"`;
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
  if (bits.length < 2) bits.push(w.night > 0.5 ? "The bright one has gone under again." : "The bright one is up and the ground is warm.");
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
    beliefs: c.beliefs.map((h) => tellIdea(w, w.ideas[h.idea])),
    places: w.terrain.places.filter((p) => c.seen & (1 << p.id)).map((p) => ({ id: p.id, what: p.desc, name: w.placeNames[p.id] })),
  };
}

export function nowFacts(w: World): { season: string; time: string; weather: string } {
  return {
    season: SEASONS[w.season],
    time: w.night > 0.6 ? "night" : w.sun < 0.25 ? "the sun is low" : "day",
    weather: w.coldLeft > 0 ? "a sudden bitter cold" : w.droughtLeft > 0 ? "drought, the river is failing" : w.rain > 0.3 ? (w.temp < 1.5 ? "snow" : "rain") : w.temp < 4 ? "cold" : "fair",
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

