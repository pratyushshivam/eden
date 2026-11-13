/**
 * The side panel: a creature's card, the chronicle, the beliefs and inventions,
 * how the minds work, and about. Everything shown is read straight from the world.
 */
import {
  CLEVER, CRAFTS, DAY, HIDDEN, IN, KITH, N_IN, N_OUT, OUT, R, SPECIES, THINKER, TIER_NAMES, VEC, ageDays, arc, brainDistance, causeWords, craftName,
  genomeSize, holders, impression, lifeStage, lineage, materialWords, nameOf, placeAt, placeName, tellIdea, tellLog, tellNews, traitWords, when, who,
  type Creature, type Idea, type World,
} from "../engine";
import { cloakColor } from "../render/critters";
import type { Mind } from "./mind";

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const HONEST =
  "How each one moves, eats, flees, breeds and tries things is decided by its own small neural network, inherited from its parents and never trained by anyone. The words of the thinking ones are written by a language model, from what that one has really lived through.";

const FEEL: [number, string][] = [
  [IN.hunger, "hunger"], [IN.thirst, "thirst"], [IN.tired, "tiredness"], [IN.fear, "fear"], [IN.cold, "cold"], [IN.night, "the dark"],
  [IN.foodNear, "food in sight"], [IN.waterNear, "water near"], [IN.kinNear, "its own kind near"], [IN.crowd, "a crowd"], [IN.mateReady, "ready to breed"],
  [IN.homeFar, "far from home"], [IN.hurt, "pain"], [IN.dangerBelief, "a place it believes is dangerous"], [IN.goodBelief, "a place it remembers as good"],
  [IN.warmNear, "warmth"], [IN.followNear, "someone it follows"], [IN.wet, "rain"], [IN.novel, "something new"],
];
const WANT: [number, string][] = [
  [VEC.food, "to reach food"], [VEC.water, "to reach water"], [VEC.kin, "to be with its kind"], [VEC.home, "to go home"], [VEC.wander, "to wander"],
  [VEC.goodPlace, "to go where it was fed"], [VEC.follow, "to stay with another"], [VEC.warm, "to reach warmth"], [VEC.novel, "to look at the new thing"],
  [OUT.rest, "to rest"], [OUT.eat, "to eat"], [OUT.drink, "to drink"], [OUT.mate, "to breed"], [OUT.gather, "to fetch wood"], [OUT.fire, "to make fire"],
  [OUT.shelter, "to build"], [OUT.tinker, "to try things"], [OUT.play, "to play"],
];
const DOING = ["walking", "eating", "drinking", "resting", "fleeing", "hunting", "talking", "playing", "grieving", "making something"];
/** A line colour for each kind, for charts. */
export const KIND_COLOR = ["#8a7a52", "#b9552b", "#7d9db8", "#3fa89c", "#55657c", "#2b2b33", "#d4491a"];

function doing(w: World, c: Creature): string {
  if (!c.alive) return `Died ${causeWords(c)} on ${when(c.died)}, ${Math.round(ageDays(w, c) * 10) / 10} days old.`;
  const def = SPECIES[c.sp];
  let s = DOING[c.state] ?? "walking";
  if (c.state === 3 && c.inp[IN.night] > 0.5) s = "asleep";
  if (c.state === 0 && c.carrying) s = "carrying wood";
  if (def.air && c.state === 0) s = c.alt > 0.6 ? "flying" : "on the ground";
  if (def.sea && c.state === 0) s = "drifting";
  if (c.state === 1 && (def.air || def.sea)) s = "feeding";
  return cap(s) + ".";
}

function person(w: World, id: number): string {
  const c = who(w, id);
  if (!c) return '<span class="gone">one now forgotten</span>';
  const label = esc(nameOf(w, id));
  return c.alive ? `<button class="link" data-who="${id}">${label}</button>` : `<button class="link gone" data-who="${id}">${label}, dead</button>`;
}

export class Panels {
  /** Which view is open: "", "card", "chronicle", "beliefs", "minds", "about". */
  view = "";
  creature = -1;
  idea = -1;
  /** Measured by the page, shown in the Minds view. */
  stats = { stepsPerSec: 0, fps: 0, stepMs: 0 };
  private tab = "world";
  private btab = "beliefs";
  private cache = new Map<string, string>();
  private skeleton = "";
  private el = document.getElementById("panel") as HTMLElement;
  private body = document.getElementById("panel-body") as HTMLElement;
  onWho: (id: number) => void = () => {};
  onIdea: (idea: Idea | null) => void = () => {};
  onClose: () => void = () => {};
  onAsk: (id: number) => void = () => {};
  onNewWorld: () => void = () => {};
  onGoto: (x: number, y: number, z: number) => void = () => {};

  constructor(private w: World, private mind: Mind) {
    (document.getElementById("panel-close") as HTMLElement).addEventListener("click", () => this.close());
    this.body.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-who],[data-idea],[data-tab],[data-btab],[data-act],[data-goto]");
      if (!t) return;
      if (t.dataset.who) this.onWho(Number(t.dataset.who));
      else if (t.dataset.goto) {
        this.idea = Number(t.dataset.goto);
        const idea = this.w.ideas[this.idea];
        this.btab = idea?.kind === "craft" ? "made" : "beliefs";
        this.open("beliefs");
        this.onIdea(idea ?? null);
      } else if (t.dataset.idea) {
        const id = Number(t.dataset.idea);
        this.idea = this.idea === id ? -1 : id;
        this.onIdea(this.idea >= 0 ? this.w.ideas[this.idea] : null);
        this.refresh(true);
      } else if (t.dataset.tab) {
        this.tab = t.dataset.tab;
        this.refresh(true);
      } else if (t.dataset.btab) {
        this.btab = t.dataset.btab;
        this.refresh(true);
      } else if (t.dataset.act === "ask") this.onAsk(this.creature);
      else if (t.dataset.act === "new") this.onNewWorld();
      else if (t.dataset.act === "birth") {
        const c = who(this.w, this.creature);
        if (c) this.onGoto(c.bx, c.by, c.bz);
      } else if (t.dataset.act === "copy") {
        void navigator.clipboard?.writeText(location.href.split("?")[0] + `?seed=${this.w.seed}`);
        t.textContent = "Copied";
      }
    });
  }

  open(view: string, creature = -1): void {
    const keepIdea = view === "beliefs" ? this.idea : -1;
    this.view = view;
    if (view === "card") this.creature = creature;
    if (view !== "beliefs" && this.idea >= 0) this.onIdea(null);
    this.idea = keepIdea;
    document.body.dataset.panel = view;
    this.el.hidden = false;
    this.skeleton = "";
    this.cache.clear();
    this.refresh(true);
    this.body.scrollTop = 0;
    for (const b of document.querySelectorAll<HTMLElement>(".menu [data-open]")) b.setAttribute("aria-current", String(b.dataset.open === view));
  }

  close(): void {
    if (!this.view) return;
    this.view = "";
    document.body.dataset.panel = "";
    this.el.hidden = true;
    if (this.idea >= 0) {
      this.idea = -1;
      this.onIdea(null);
    }
    for (const b of document.querySelectorAll<HTMLElement>(".menu [data-open]")) b.setAttribute("aria-current", "false");
    this.onClose();
  }

  /** Sets one part of the panel, touching the page only if it changed. */
  private part(id: string, html: string): void {
    if (this.cache.get(id) === html) return;
    this.cache.set(id, html);
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  private frame(key: string, html: string): void {
    if (this.skeleton === key) return;
    this.skeleton = key;
    this.cache.clear();
    this.body.innerHTML = html;
  }

  refresh(force = false): void {
    if (!this.view) return;
    if (force) this.cache.clear();
    if (this.view === "card") this.card();
    else if (this.view === "chronicle") this.chronicle();
    else if (this.view === "beliefs") this.beliefs();
    else if (this.view === "minds") this.minds();
    else this.about();
  }

  /* ---------------- a creature ---------------- */

  private card(): void {
    const w = this.w;
    const c = who(w, this.creature);
    if (!c) {
      this.close();
      return;
    }
    const def = SPECIES[c.sp];
    const kith = c.sp === KITH;
    const clever = def.tier === CLEVER;
    this.frame(
      `card${c.id}`,
      `<p class="kicker" id="c-kicker"></p><h2 class="name" id="c-name"></h2><p class="doing" id="c-doing"></p>
       ${kith ? '<div class="section"><h3>In its own words</h3><div id="c-voice"></div></div>' : ""}
       ${clever ? '<div class="section"><h3>What it feels, with no words</h3><p class="impress" id="c-impress"></p><p class="voice-note">Read straight from its own network as it runs. No language model is involved.</p></div>' : ""}
       <div class="section"><h3>Needs</h3><div class="needs" id="c-needs"></div></div>
       <div class="section"><h3>Its brain, now</h3><canvas class="brain" id="c-brain"></canvas><p class="brain-note" id="c-brainnote"></p><div class="diff" id="c-diff"></div></div>
       <div class="section"><h3>Origin</h3><ul class="origin" id="c-origin"></ul></div>
       <div class="section"><h3>Family</h3><dl class="kin" id="c-kin"></dl></div>
       ${kith ? '<div class="section"><h3>Has learned to make</h3><ul class="makes" id="c-makes"></ul><p class="voice-note" id="c-handled"></p></div>' : ""}
       ${def.tier >= CLEVER ? `<div class="section"><h3>${kith ? "Believes" : "Remembers"}</h3><ul class="beliefs" id="c-beliefs"></ul></div>` : ""}
       <div class="section"><h3>Life so far</h3><ul class="life" id="c-life"></ul></div>
       <p class="honest">${HONEST}</p>`,
    );
    const sex = c.sex ? "male" : "female";
    this.part("c-kicker", `${cap(def.one)} · ${TIER_NAMES[def.tier].toLowerCase()} mind · ${sex} · ${lifeStage(w, c)} · ${Math.round(ageDays(w, c) * 10) / 10} days`);
    const sw = kith ? `<i class="swatch" style="background:#${cloakColor(c.traits.hue).getHexString()}"></i>` : "";
    const nameEl = document.getElementById("c-name");
    if (nameEl) nameEl.classList.toggle("unnamed", !c.name);
    this.part("c-name", c.name ? `${esc(c.name)}${sw}` : kith ? `Not yet named${sw}` : `${cap(traitWords(c)[0])} ${def.one}`);
    this.part("c-doing", `${esc(doing(w, c))} ${cap(traitWords(c).join(", "))}.`);

    if (kith) {
      const th = c.thoughts[c.thoughts.length - 1];
      const waiting = this.mind.waiting.has(c.id);
      let html: string;
      if (th) {
        const old = (w.t - th.t) / DAY;
        const age = old < 0.15 ? "just now" : old < 1 ? "earlier today" : `${Math.round(old)} ${Math.round(old) === 1 ? "day" : "days"} ago`;
        const by = th.by === "model" ? `Written by a language model from this life, ${age} (${when(th.t)}).` : esc(this.mind.note || "The plain built-in voice.");
        html = `<p class="voice">${esc(th.text)}</p><p class="voice-note"><span>${by}</span>${c.alive ? `<button class="link" data-act="ask">${waiting ? "Thinking…" : "Ask again"}</button>` : ""}</p>`;
      } else html = `<p class="voice waiting">${waiting ? "Gathering its thoughts…" : c.alive ? "It has not put anything into words yet." : "It never put anything into words."}</p>`;
      this.part("c-voice", html);
      const makes = c.beliefs
        .filter((h) => w.ideas[h.idea].kind === "craft")
        .map((h) => {
          const idea = w.ideas[h.idea];
          const from = h.from >= 0 ? `Shown by ${esc(nameOf(w, h.from))}, ${when(h.t)}` : `Worked it out alone, ${when(h.t)}`;
          return `<li><button class="link" data-goto="${idea.id}">${esc(cap(craftName(w, idea.id)))}</button><small>${esc(CRAFTS[idea.craft].does)} ${from}.</small></li>`;
        })
        .join("");
      this.part("c-makes", makes || '<li class="gone">Nothing yet. Nobody is given any tools: a kith that has handled the right things may make something of them, and then show others.</li>');
      const mats = materialWords(c.handled);
      this.part("c-handled", mats.length ? `Has had in its hands: ${esc(mats.join(", "))}.` : "Has not yet handled anything worth making into something.");
    }
    if (clever) this.part("c-impress", c.alive ? esc(cap(impression(c))) + "." : "Nothing now.");
    if (def.tier >= CLEVER) {
      const bl = c.beliefs
        .filter((h) => w.ideas[h.idea].kind !== "craft")
        .sort((a, b) => b.s - a.s)
        .map((h) => {
          const idea = w.ideas[h.idea];
          const from = h.from >= 0 ? `Heard from ${esc(nameOf(w, h.from))}, ${when(h.t)}` : `From its own life, ${when(h.t)}`;
          return `<li>${kith ? `<button class="link" data-goto="${idea.id}">${esc(tellIdea(w, idea))}</button>` : esc(tellIdea(w, idea))}<small>${from}</small></li>`;
        })
        .join("");
      this.part(
        "c-beliefs",
        bl || `<li class="gone">${kith ? "Nothing yet. Beliefs come from what happens to it and from what others tell it." : "Nothing yet. It remembers places that fed it and places that hurt it. It cannot tell anyone."}</li>`,
      );
    }

    const bar = (label: string, v: number): string => `<span>${label}</span><div class="bar${v < 0.25 ? " low" : ""}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
    this.part(
      "c-needs",
      c.alive
        ? bar("Food", c.energy / def.maxEnergy) + bar("Water", 1 - c.thirst) + bar("Rest", 1 - c.tired) + bar("Warmth", 1 - c.inp[IN.cold]) + bar("Health", c.health)
        : '<span class="gone">None now.</span>',
    );

    // Origin: where and how it began, the line back to the one set down, how far it has come.
    const origin: string[] = [];
    const first = c.log[0];
    const born = first ? placeName(w, first.p) : "";
    if (c.mother < 0) origin.push(`<li>Set down by you near ${esc(born)}, ${when(c.born < 0 ? 0 : first?.t ?? c.born)}. It has no parents.</li>`);
    else origin.push(`<li>Born near ${esc(born)}, ${when(c.born)}, to ${person(w, c.mother)} and ${person(w, c.father)}.</li>`);
    const line = lineage(w, c);
    if (line.length) {
      const names = line.slice(0, 6).map((a) => person(w, a.id)).join(" ← ");
      const root = who(w, c.root);
      origin.push(`<li>Its mother's line: ${names}${line.length > 6 ? " ← …" : ""}. ${c.gen} ${c.gen === 1 ? "generation" : "generations"} from ${root ? person(w, root.id) : "one"} you set down.</li>`);
    }
    const far = arc(c.x, c.y, c.z, c.bx, c.by, c.bz);
    const lands = c.land >= 0 ? w.terrain.lands[c.land].desc : "the open sea";
    origin.push(`<li>Now ${Math.round(far)} units from where it began, on ${esc(lands)}. Its path is drawn on the ground. <button class="link" data-act="birth">Go to where it began</button></li>`);
    this.part("c-origin", origin.join(""));

    const kin: string[] = [];
    if (c.mate >= 0) kin.push(`<dt>Mate</dt><dd>${person(w, c.mate)}</dd>`);
    if (c.children.length) kin.push(`<dt>Children</dt><dd>${c.children.slice(-8).map((k) => person(w, k)).join(", ")}${c.children.length > 8 ? ` and ${c.children.length - 8} more` : ""}</dd>`);
    if (c.follow >= 0 && c.follow !== c.mother) kin.push(`<dt>Follows</dt><dd>${person(w, c.follow)}</dd>`);
    kin.push(`<dt>Home range</dt><dd>${esc(cap(placeName(w, placeAt(w.terrain, c.homeX, c.homeY, c.homeZ))))}</dd>`);
    this.part("c-kin", kin.join(""));
    this.part(
      "c-life",
      c.log
        .slice()
        .reverse()
        .slice(0, 40)
        .map((e) => `<li><small>${when(e.t)}</small><span>${esc(tellLog(w, e))}</span></li>`)
        .join(""),
    );
    this.brain(c);
  }

  /** Draws the creature's network as it is this moment: what it senses, the hidden layer, what it decides. */
  private brain(c: Creature): void {
    const cv = document.getElementById("c-brain") as HTMLCanvasElement | null;
    if (!cv) return;
    const w = this.w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, Hh = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(Hh * dpr);
    }
    const g = cv.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, Hh);
    const H = c.hid.length;
    const cols = [8, W / 2, W - 8];
    const yOf = (i: number, n: number): number => 6 + (i / (n - 1)) * (Hh - 12);
    // The strongest signals flowing right now.
    const lines: { x1: number; y1: number; x2: number; y2: number; v: number }[] = [];
    let k = 0;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < N_IN; i++) lines.push({ x1: cols[0], y1: yOf(i, N_IN), x2: cols[1], y2: yOf(j, H), v: c.inp[i] * c.brain[k++] });
      k++;
    }
    for (let j = 0; j < N_OUT; j++) {
      for (let i = 0; i < H; i++) lines.push({ x1: cols[1], y1: yOf(i, H), x2: cols[2], y2: yOf(j, N_OUT), v: c.hid[i] * c.brain[k++] });
      k++;
    }
    lines.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    for (const l of lines.slice(0, 80)) {
      g.strokeStyle = l.v > 0 ? `rgba(212,73,26,${Math.min(0.75, Math.abs(l.v) * 0.6)})` : `rgba(21,20,15,${Math.min(0.5, Math.abs(l.v) * 0.4)})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(l.x1, l.y1);
      g.lineTo(l.x2, l.y2);
      g.stroke();
    }
    const dot = (x: number, y: number, v: number): void => {
      g.fillStyle = "#f2eee5";
      g.beginPath();
      g.arc(x, y, 3.2, 0, 7);
      g.fill();
      g.fillStyle = v >= 0 ? `rgba(212,73,26,${0.15 + Math.min(1, v) * 0.85})` : `rgba(21,20,15,${0.15 + Math.min(1, -v) * 0.85})`;
      g.beginPath();
      g.arc(x, y, 3.2, 0, 7);
      g.fill();
    };
    for (let i = 0; i < N_IN; i++) dot(cols[0], yOf(i, N_IN), c.inp[i]);
    for (let i = 0; i < H; i++) dot(cols[1], yOf(i, H), c.hid[i]);
    for (let i = 0; i < N_OUT; i++) dot(cols[2], yOf(i, N_OUT), c.out[i]);
    const feels = FEEL.map(([i, n]) => [c.inp[i], n] as [number, string]).filter((x) => x[0] > 0.3).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    const wants = WANT.map(([i, n]) => [c.out[i], n] as [number, string]).filter((x) => x[0] > 0.25).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    this.part(
      "c-brainnote",
      c.alive
        ? `Live. Left, ${N_IN} senses (strongest now: ${feels.length ? feels.join(", ") : "nothing pressing"}). Middle, ${H} hidden neurons. Right, ${N_OUT} decisions (strongest: ${wants.length ? wants.join(", ") : "nothing much"}). ${c.brain.length} weights in all.`
        : "Its network as it was at the end.",
    );
    // How its brain differs from each parent's: the mark of inheritance and mutation.
    let mean = 0;
    for (let i = 0; i < c.brain.length; i++) mean += Math.abs(c.brain[i]);
    mean /= c.brain.length;
    const rows: string[] = [];
    for (const [id, label] of [[c.mother, "From its mother"], [c.father, "From its father"]] as [number, string][]) {
      const p = who(w, id);
      if (!p || p.brain.length !== c.brain.length) continue;
      const pct = (brainDistance(c.brain, p.brain) / mean) * 100;
      rows.push(`<span>${label}</span><div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div><span>${pct.toFixed(0)}% different</span>`);
    }
    this.part("c-diff", rows.length ? rows.join("") : c.mother < 0 ? "<span>It arrived with the rough instincts of its kind. Its children's brains will be mixed from two parents and nudged.</span>" : "");
  }

  /* ---------------- the chronicle ---------------- */

  private chronicle(): void {
    const w = this.w;
    this.frame(
      "chronicle",
      `<h2 class="title">Chronicle</h2><p class="lede">What has happened on this planet, written from the events themselves.</p>
       <div class="tabs"><button data-tab="world" id="t-world">The world</button><button data-tab="talk" id="t-talk">Conversations</button></div><div id="ch-list"></div>`,
    );
    document.getElementById("t-world")?.setAttribute("aria-pressed", String(this.tab === "world"));
    document.getElementById("t-talk")?.setAttribute("aria-pressed", String(this.tab === "talk"));
    if (this.tab === "world") {
      const items = w.news.slice(-90).reverse().map((n) => `<div class="entry"><small>${when(n.t)}</small>${esc(tellNews(w, n))}</div>`);
      this.part("ch-list", items.join("") || '<p class="empty">Nothing has happened yet. The planet is waiting for you to set something down.</p>');
    } else {
      const items = w.talks.slice(-30).reverse().map((t) => {
        const lines = t.lines.map((l) => `<p><b>${esc(nameOf(w, l.who))}</b>: ${esc(l.text)}</p>`).join("");
        const passed = t.ideas.map((id) => `<p class="passed">Passed on: <button class="link" data-goto="${id}">${esc(tellIdea(w, w.ideas[id]))}</button></p>`).join("");
        const by = t.by === "model" ? "words by the language model" : "plain voice";
        return `<div class="entry talk"><small>${when(t.t)} · ${by}</small>${lines}${passed}</div>`;
      });
      this.part("ch-list", items.join("") || '<p class="empty">No two of the kith have spoken yet. They talk when two grown ones meet.</p>');
    }
  }

  /* ---------------- beliefs and made things ---------------- */

  private beliefs(): void {
    const w = this.w;
    this.frame(
      "beliefs",
      `<h2 class="title">Ideas</h2><p class="lede">What the kith hold to be true and what they have learned to make: where each idea began and how it travelled. Tap one to see it on the land.</p>
       <div class="tabs"><button data-btab="beliefs" id="bt-b">Beliefs</button><button data-btab="made" id="bt-m">Made things</button></div><div id="b-list"></div>`,
    );
    const made = this.btab === "made";
    document.getElementById("bt-b")?.setAttribute("aria-pressed", String(!made));
    document.getElementById("bt-m")?.setAttribute("aria-pressed", String(made));
    const kith = w.counts[KITH];
    const rows = w.ideas
      .filter((i) => (i.kind === "craft") === made)
      .map((idea) => ({ idea, n: holders(w, idea.id) }))
      .filter((r) => r.n > 0 || r.idea.edges.length > 0)
      .sort((a, b) => b.n - a.n || b.idea.edges.length - a.idea.edges.length)
      .slice(0, 40);
    const html = rows.map(({ idea, n }) => {
      const open = idea.id === this.idea;
      const where = idea.land >= 0 ? ` on ${esc(w.terrain.lands[idea.land].desc)}` : "";
      const origin = `Began with ${esc(nameOf(w, idea.origin))}${where}, ${when(idea.t)}`;
      const src = made ? ", from what it had handled" : idea.from >= 0 ? `, as a mistelling of “${esc(tellIdea(w, w.ideas[idea.from]))}”` : idea.kind === "lore" ? ", in its own words" : ", from its own life";
      let more = "";
      if (open) {
        const path = idea.edges.slice(-14).map((e) => `${esc(nameOf(w, e.a))} → ${esc(nameOf(w, e.b))} <span class="gone">(${when(e.t)})</span>`).join("<br>");
        more += `<p class="path">${path || "It has not been passed on yet."}</p>`;
        if (idea.place >= 0 && idea.beforeTot > 40 && idea.afterTot > 40) {
          const pb = (idea.beforeIn / idea.beforeTot) * 100, pa = (idea.afterIn / idea.afterTot) * 100;
          const fmt = (v: number): string => (v < 10 ? v.toFixed(1) : v.toFixed(0));
          const scale = 100 / Math.max(8, pb, pa);
          more += `<p class="effect">Before they held it, its believers were found at ${esc(placeName(w, idea.place))} ${fmt(pb)}% of the time. Since, ${fmt(pa)}%.</p>
            <div class="meter"><span>Before</span><div class="bar"><i style="width:${Math.min(100, pb * scale)}%"></i></div><span>${fmt(pb)}%</span><span>Since</span><div class="bar low"><i style="width:${Math.min(100, pa * scale)}%"></i></div><span>${fmt(pa)}%</span></div>`;
        } else if (idea.place >= 0) more += '<p class="effect gone">Too early to say whether it changes where they go.</p>';
        if (made) more += `<p class="effect">${esc(CRAFTS[idea.craft].does)}</p>`;
      }
      const title = made ? cap(craftName(w, idea.id)) : tellIdea(w, idea);
      return `<div class="idea" data-idea="${idea.id}" aria-current="${open}"><h4>${esc(title)}</h4><p>Held by ${n} of ${kith} kith. ${origin}${src}. Passed on ${idea.edges.length} ${idea.edges.length === 1 ? "time" : "times"}.</p>${more}</div>`;
    });
    const empty = made
      ? "Nothing has been made yet. Nobody is given tools. A kith that has handled stone and bone, or clay and fire, may one day make something of them; what it makes and what it calls it is its own."
      : "No beliefs yet. They begin when something happens to one of the kith (a narrow escape, a place that fed it when it was starving) and spread when two of them talk.";
    this.part("b-list", html.join("") || `<p class="empty">${empty}</p>`);
  }

  /* ---------------- how the minds work ---------------- */

  private minds(): void {
    const w = this.w;
    const net = (h: number): string => {
      const col = (x: number, n: number, r: number): string => Array.from({ length: n }, (_, i) => `<circle cx="${x}" cy="${4 + (i * 52) / (n - 1)}" r="${r}" />`).join("");
      return `<svg viewBox="0 0 220 60" aria-hidden="true"><g stroke="rgba(21,20,15,0.18)" stroke-width="0.5">${Array.from({ length: 14 }, (_, i) => `<path d="M20 ${6 + i * 3.7}L110 ${4 + ((i * 5) % h) * (52 / (h - 1))}L200 ${6 + ((i * 7) % 14) * 3.7}" fill="none"/>`).join("")}</g><g fill="#15140f">${col(20, 12, 1.6)}${col(200, 12, 1.6)}</g><g fill="#d4491a">${col(110, h, 2)}</g></svg>`;
    };
    this.frame(
      "minds",
      `<div class="minds"><h2 class="title">How the minds work</h2>
      <p class="lede">Nothing on this planet follows a script. ${HONEST}</p>
      <h3>Three tiers of mind</h3>
      <p><b>Simple</b> (dapples, russets, skims, glims): ${N_IN} senses, ${HIDDEN[0]} hidden neurons, ${N_OUT} decisions, ${genomeSize(HIDDEN[0])} weights. No memory beyond where it last drank.</p>${net(HIDDEN[0])}
      <p><b>Clever</b> (murrs, kests): ${HIDDEN[1]} hidden neurons, ${genomeSize(HIDDEN[1])} weights. They remember places that fed or hurt them, come to look at new things, play, and grieve. Their feelings are shown in a few plain words read from the network itself.</p>${net(HIDDEN[1])}
      <p><b>Thinkers</b> (kith): ${HIDDEN[2]} hidden neurons, ${genomeSize(HIDDEN[2])} weights, the same kind of network. On top of it they hold beliefs, talk, and make things. Only their words come from a language model.</p>${net(HIDDEN[2])}
      <h3>How a brain is inherited</h3>
      <p>The first of each kind you set down arrive with rough instincts. After that, a child's weights are copied in runs from its mother and its father, and about one in twelve is nudged at random. Nothing trains them. The ones that find food and water and keep away from hunters have more children. Open any creature to see how far its brain has drifted from each parent's.</p>
      <h3>Are they getting better at it?</h3>
      <canvas class="chart" id="m-chart"></canvas><div class="legend" id="m-legend"></div>
      <p class="cap">Mean age at death, in days, for each kind, day by day. A rising line is a kind learning to survive here.</p>
      <h3>From an event to a word to a belief to a changed life</h3>
      <div class="loop" id="m-loop"></div>
      <h3>Making things</h3>
      <p>No kith is given a tool. Each handles what its life puts in its hands: stone in the mountains, clay by water, bone at a carcass. When its network chooses to try things, and what it has handled could really become something, the language model decides which thing this one makes and what its people will call it. From then on the thing is real: it changes what that kith can do, and the knowing passes on only by being shown. <span id="m-made"></span></p>
      <h3>Measured, on this device, right now</h3>
      <dl class="figures" id="m-figures"></dl></div>`,
    );
    this.chart();
    // One real idea, traced end to end.
    const idea = w.ideas.filter((i) => i.place >= 0 && i.edges.length > 0).sort((a, b) => b.edges.length - a.edges.length)[0];
    let loop: string;
    if (idea) {
      const origin = who(w, idea.origin);
      const at = origin?.log.findIndex((e) => e.k === "believed" && e.n === idea.id) ?? -1;
      const cause = origin && at > 0 ? tellLog(w, origin.log[at - 1]) : "Something happened to it there.";
      const heard = [...new Set(idea.edges.map((e) => nameOf(w, e.b)))];
      const effect =
        idea.beforeTot > 40 && idea.afterTot > 40
          ? `Before they held it, its believers were at ${placeName(w, idea.place)} ${((idea.beforeIn / idea.beforeTot) * 100).toFixed(1)}% of the time. Since, ${((idea.afterIn / idea.afterTot) * 100).toFixed(1)}%.`
          : "Not enough time has passed to measure it yet.";
      loop = `<i>1</i><div><b>It happened.</b> ${esc(nameOf(w, idea.origin))}, ${when(idea.t)}: <span class="live">${esc(cause)}</span></div>
        <i>2</i><div><b>It became a belief.</b> <button class="link live" data-goto="${idea.id}">${esc(tellIdea(w, idea))}</button> The belief is an input to its own network from then on.</div>
        <i>3</i><div><b>It was told.</b> ${idea.edges.length} ${idea.edges.length === 1 ? "telling" : "tellings"}, reaching <span class="live">${esc(heard.slice(0, 6).join(", "))}</span>${heard.length > 6 ? " and others" : ""}. A listener sometimes takes it for a different place; then a wrong idea is born and travels too.</div>
        <i>4</i><div><b>It changed what they do.</b> <span class="live">${esc(effect)}</span></div>`;
    } else
      loop = `<i>1</i><div><b>Something happens</b> to one of the kith: a narrow escape, a place that fed it when it was starving.</div><i>2</i><div><b>It becomes a belief</b>, and an input to that kith's own network.</div><i>3</i><div><b>It is told</b> when two meet, sometimes wrongly.</div><i>4</i><div><b>It changes where the hearers go.</b> When it has happened here, this panel will show the real case with its numbers.</div>`;
    this.part("m-loop", loop);
    const made = w.ideas.filter((i) => i.kind === "craft");
    this.part("m-made", made.length ? `So far on this planet: ${made.slice(0, 8).map((i) => `<button class="link" data-goto="${i.id}">${esc(craftName(w, i.id))}</button>`).join(", ")}.` : "Nothing has been made on this planet yet.");
    const s = this.mind.spend;
    const per = s && s.calls ? `$${(s.session / s.calls).toFixed(5)}` : "none written yet";
    const weights = w.creatures.reduce((n, c) => n + c.brain.length, 0);
    this.part(
      "m-figures",
      `<dt>Creatures alive, each running its own network</dt><dd>${w.creatures.length}</dd>
       <dt>Weights across all living brains</dt><dd>${weights.toLocaleString("en")}</dd>
       <dt>World steps per second</dt><dd>${Math.round(this.stats.stepsPerSec)}</dd>
       <dt>Time to step the whole planet once</dt><dd>${this.stats.stepMs.toFixed(2)} ms</dd>
       <dt>Frames per second</dt><dd>${Math.round(this.stats.fps)}</dd>
       <dt>Born / died so far</dt><dd>${w.births} / ${w.deaths}</dd>
       <dt>Ideas alive / things made</dt><dd>${w.ideas.filter((i) => i.kind !== "craft").length} / ${made.length}</dd>
       <dt>Cost of one thought from the language model</dt><dd>${per}</dd>`,
    );
  }

  private chart(): void {
    const cv = document.getElementById("m-chart") as HTMLCanvasElement | null;
    if (!cv) return;
    const w = this.w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // Smooth each kind's lifespans over a few days so the trend shows.
    const series: { sp: number; pts: [number, number][] }[] = [];
    let maxDay = 1, maxLife = 4;
    w.records.forEach((rec, sp) => {
      const pts: [number, number][] = [];
      let avg = -1;
      for (const r of rec) {
        if (r.lifespan < 0) continue;
        avg = avg < 0 ? r.lifespan : avg * 0.7 + r.lifespan * 0.3;
        pts.push([r.day, avg]);
        maxDay = Math.max(maxDay, r.day);
        maxLife = Math.max(maxLife, avg);
      }
      if (pts.length > 1) series.push({ sp, pts });
    });
    g.strokeStyle = "rgba(21,20,15,0.16)";
    g.lineWidth = 1;
    g.font = "10px Geist, sans-serif";
    g.fillStyle = "rgba(21,20,15,0.42)";
    for (let k = 0; k <= 2; k++) {
      const y = H - 14 - (k / 2) * (H - 24);
      g.beginPath();
      g.moveTo(22, y);
      g.lineTo(W, y);
      g.stroke();
      g.fillText(String(Math.round((maxLife * k) / 2)), 0, y + 3);
    }
    g.fillText(`day ${maxDay}`, W - 40, H - 2);
    for (const s of series) {
      g.strokeStyle = KIND_COLOR[s.sp];
      g.lineWidth = s.sp === KITH ? 1.8 : 1.2;
      g.beginPath();
      s.pts.forEach(([d, v], i) => {
        const x = 22 + (d / maxDay) * (W - 24), y = H - 14 - (v / maxLife) * (H - 24);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
    }
    if (!series.length) g.fillText("No deaths yet to measure.", 30, H / 2);
    this.part("m-legend", series.map((s) => `<span><i style="background:${KIND_COLOR[s.sp]}"></i>${SPECIES[s.sp].many}</span>`).join(""));
  }

  /* ---------------- about ---------------- */

  private about(): void {
    const w = this.w;
    const t = w.terrain;
    const big = t.lands.filter((l) => l.cells > 220).length;
    this.frame(
      "about",
      `<div class="about"><h2 class="title">Eden</h2>
      <p class="lede">A whole small planet, alive on its own. It starts with plants and water and nothing else. Everything that walks, swims or flies here, you set down.</p>
      <p>${HONEST}</p>
      <h3>The kinds</h3>
      <p>${SPECIES.map((s) => `<b>${cap(s.many)}</b> (${TIER_NAMES[s.tier].toLowerCase()}): ${s.blurb.charAt(0).toLowerCase() + s.blurb.slice(1)}`).join(" ")}</p>
      <h3>Your hand</h3>
      <p>Drag to spin the planet. Pinch or scroll to go from orbit down to the ground. Right-drag, or turn two fingers, to look around. Choose a kind and tap anywhere to set one down. Rain, drought, cold and food fall where you tap. Tap any creature to follow it and open its mind. The kith remember what comes out of the sky.</p>
      <h3>This planet</h3>
      <p>World number <span class="seed">${w.seed}</span>, ${when(w.t)}. ${big} large lands and ${t.lands.length - big} islands, ${t.rivers.length} rivers. ${w.births} born, ${w.deaths} died so far. The same number always grows the same planet.</p>
      <p>It is saved on this device as you go, so it will still be here when you come back. Nothing is sent anywhere.</p>
      <div class="actions"><button class="btn" data-act="new">New planet</button><button class="link" data-act="copy">Copy a link to this one</button></div></div>`,
    );
  }
}

export { R, THINKER };
