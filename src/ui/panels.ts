/**
 * The side panel: a creature's card, the chronicle, the beliefs, and about.
 * Everything shown is read straight from the world.
 */
import {
  IN, KITH, N_HIDDEN, N_IN, N_OUT, OUT, SPECIES, VEC, ageDays, causeWords, holders, lifeStage, nameOf, placeName, tellIdea, tellLog, tellNews,
  traitWords, when, who, placeAt, type Creature, type Idea, type World,
} from "../engine";
import { cloakColor } from "../render/critters";
import type { Mind } from "./mind";

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const HONEST =
  "How each one moves, eats, flees and breeds is decided by its own small neural network, inherited from its parents. The words are written by a language model, from what that one has really lived through.";

const FEEL: [number, string][] = [
  [IN.hunger, "hunger"], [IN.thirst, "thirst"], [IN.tired, "tiredness"], [IN.fear, "fear"], [IN.cold, "cold"], [IN.night, "the dark"],
  [IN.foodNear, "food in sight"], [IN.waterNear, "water near"], [IN.kinNear, "its own kind near"], [IN.crowd, "a crowd"], [IN.mateReady, "ready to breed"],
  [IN.homeFar, "far from home"], [IN.hurt, "pain"], [IN.dangerBelief, "a place it believes is dangerous"], [IN.goodBelief, "a place it believes is good"],
  [IN.warmNear, "warmth"], [IN.followNear, "someone it follows"], [IN.wet, "rain"],
];
const WANT: [number, string][] = [
  [VEC.food, "to reach food"], [VEC.water, "to reach water"], [VEC.kin, "to be with its kind"], [VEC.home, "to go home"], [VEC.wander, "to wander"],
  [VEC.goodPlace, "to go where it believes is good"], [VEC.follow, "to stay with another"], [VEC.warm, "to reach warmth"],
  [OUT.rest, "to rest"], [OUT.eat, "to eat"], [OUT.drink, "to drink"], [OUT.mate, "to breed"], [OUT.gather, "to fetch wood"], [OUT.fire, "to make fire"],
  [OUT.shelter, "to build"],
];

const DOING = ["walking", "eating", "drinking", "resting", "fleeing", "hunting", "talking"];

function doing(w: World, c: Creature): string {
  if (!c.alive) return `Died ${causeWords(c)} on ${when(c.died)}, ${Math.round(ageDays(w, c) * 10) / 10} days old.`;
  let s = DOING[c.state] ?? "walking";
  if (c.state === 3 && w.night > 0.5) s = "asleep";
  if (c.state === 0 && c.carrying) s = "carrying wood";
  if (c.sp === 2 && c.state === 0) s = c.z > 0.6 ? "flying" : "on the ground";
  if (c.state === 1 && c.sp === 2) s = "fishing";
  return cap(s) + ".";
}

function person(w: World, id: number): string {
  const c = who(w, id);
  if (!c) return '<span class="gone">unknown</span>';
  const label = esc(nameOf(w, id));
  return c.alive ? `<button class="link" data-who="${id}">${label}</button>` : `<span class="gone">${label}, dead</span>`;
}

export class Panels {
  /** Which view is open: "", "card", "chronicle", "beliefs", "about". */
  view = "";
  creature = -1;
  idea = -1;
  private tab = "world";
  private cache = new Map<string, string>();
  private skeleton = "";
  private el = document.getElementById("panel") as HTMLElement;
  private body = document.getElementById("panel-body") as HTMLElement;
  onWho: (id: number) => void = () => {};
  onIdea: (idea: Idea | null) => void = () => {};
  onClose: () => void = () => {};
  onAsk: (id: number) => void = () => {};
  onNewWorld: () => void = () => {};

  constructor(private w: World, private mind: Mind) {
    (document.getElementById("panel-close") as HTMLElement).addEventListener("click", () => this.close());
    this.body.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-who],[data-idea],[data-tab],[data-act],[data-goto]");
      if (!t) return;
      if (t.dataset.who) this.onWho(Number(t.dataset.who));
      else if (t.dataset.goto) {
        this.idea = Number(t.dataset.goto);
        this.open("beliefs");
        this.onIdea(this.w.ideas[this.idea] ?? null);
      } else if (t.dataset.idea) {
        const id = Number(t.dataset.idea);
        this.idea = this.idea === id ? -1 : id;
        this.onIdea(this.idea >= 0 ? this.w.ideas[this.idea] : null);
        this.refresh(true);
      } else if (t.dataset.tab) {
        this.tab = t.dataset.tab;
        this.refresh(true);
      } else if (t.dataset.act === "ask") this.onAsk(this.creature);
      else if (t.dataset.act === "new") this.onNewWorld();
      else if (t.dataset.act === "copy") {
        void navigator.clipboard?.writeText(location.href.split("?")[0] + `?seed=${this.w.seed}`);
        t.textContent = "Copied";
      }
    });
  }

  open(view: string, creature = -1): void {
    this.view = view;
    if (view === "card") this.creature = creature;
    if (view !== "beliefs" && this.idea >= 0) {
      this.idea = -1;
      this.onIdea(null);
    }
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
    this.frame(
      `card${c.id}`,
      `<p class="kicker" id="c-kicker"></p><h2 class="name" id="c-name"></h2><p class="doing" id="c-doing"></p>
       ${kith ? '<div class="section"><h3>In its own words</h3><div id="c-voice"></div></div>' : ""}
       <div class="section"><h3>Needs</h3><div class="needs" id="c-needs"></div></div>
       <div class="section"><h3>Family</h3><dl class="kin" id="c-kin"></dl></div>
       ${kith ? '<div class="section"><h3>Believes</h3><ul class="beliefs" id="c-beliefs"></ul></div>' : ""}
       <div class="section"><h3>Its brain, now</h3><canvas class="brain" id="c-brain"></canvas><p class="brain-note" id="c-brainnote"></p></div>
       <div class="section"><h3>Life so far</h3><ul class="life" id="c-life"></ul></div>
       <p class="honest">${HONEST}</p>`,
    );
    const sex = c.sex ? "male" : "female";
    this.part("c-kicker", `${cap(def.one)} · ${sex} · ${lifeStage(w, c)} · ${Math.round(ageDays(w, c) * 10) / 10} days · ${ordinalGen(c.gen)}`);
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
        const by = th.by === "model" ? `Written by a language model from this life, ${when(th.t)}.` : esc(this.mind.note || "The plain built-in voice.");
        html = `<p class="voice">${esc(th.text)}</p><p class="voice-note"><span>${by}</span>${c.alive ? `<button class="link" data-act="ask">${waiting ? "Thinking…" : "Ask again"}</button>` : ""}</p>`;
      } else html = `<p class="voice waiting">${waiting ? "Gathering its thoughts…" : c.alive ? "It has not put anything into words yet." : "It never put anything into words."}</p>`;
      this.part("c-voice", html);
      const bl = c.beliefs
        .slice()
        .sort((a, b) => b.s - a.s)
        .map((h) => {
          const idea = w.ideas[h.idea];
          const from = h.from >= 0 ? `Heard from ${esc(nameOf(w, h.from))}, ${when(h.t)}` : `From its own life, ${when(h.t)}`;
          return `<li><button class="link" data-goto="${idea.id}">${esc(tellIdea(w, idea))}</button><small>${from}</small></li>`;
        })
        .join("");
      this.part("c-beliefs", bl || '<li class="gone">Nothing yet. Beliefs come from what happens to it and from what others tell it.</li>');
    }

    const bar = (label: string, v: number): string => `<span>${label}</span><div class="bar${v < 0.25 ? " low" : ""}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
    this.part(
      "c-needs",
      c.alive
        ? bar("Food", c.energy / def.maxEnergy) + bar("Water", 1 - c.thirst) + bar("Rest", 1 - c.tired) + bar("Warmth", 1 - c.inp[IN.cold]) + bar("Health", c.health)
        : '<span class="gone">None now.</span>',
    );
    const kin: string[] = [];
    if (c.mother >= 0) kin.push(`<dt>Mother</dt><dd>${person(w, c.mother)}</dd>`);
    if (c.father >= 0) kin.push(`<dt>Father</dt><dd>${person(w, c.father)}</dd>`);
    if (c.mother < 0) kin.push("<dt>Parents</dt><dd>None. It was set down here.</dd>");
    if (c.mate >= 0) kin.push(`<dt>Mate</dt><dd>${person(w, c.mate)}</dd>`);
    if (c.children.length) kin.push(`<dt>Children</dt><dd>${c.children.slice(-8).map((k) => person(w, k)).join(", ")}${c.children.length > 8 ? ` and ${c.children.length - 8} more` : ""}</dd>`);
    const home = placeName(w, placeAt(w.terrain, c.homeX, c.homeY));
    kin.push(`<dt>Home range</dt><dd>${esc(cap(home))}</dd>`);
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, Hh = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(Hh * dpr);
    }
    const g = cv.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, Hh);
    // Recompute the hidden layer from the same weights the engine uses.
    const hid = new Float32Array(N_HIDDEN);
    let k = 0;
    for (let j = 0; j < N_HIDDEN; j++) {
      let s = 0;
      for (let i = 0; i < N_IN; i++) s += c.inp[i] * c.brain[k++];
      hid[j] = Math.tanh(s + c.brain[k++]);
    }
    const cols = [8, W / 2, W - 8];
    const yOf = (i: number, n: number): number => 6 + (i / (n - 1)) * (Hh - 12);
    // The strongest signals flowing right now.
    const lines: { x1: number; y1: number; x2: number; y2: number; v: number }[] = [];
    k = 0;
    for (let j = 0; j < N_HIDDEN; j++) {
      for (let i = 0; i < N_IN; i++) lines.push({ x1: cols[0], y1: yOf(i, N_IN), x2: cols[1], y2: yOf(j, N_HIDDEN), v: c.inp[i] * c.brain[k++] });
      k++;
    }
    for (let j = 0; j < N_OUT; j++) {
      for (let i = 0; i < N_HIDDEN; i++) lines.push({ x1: cols[1], y1: yOf(i, N_HIDDEN), x2: cols[2], y2: yOf(j, N_OUT), v: hid[i] * c.brain[k++] });
      k++;
    }
    lines.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    for (const l of lines.slice(0, 70)) {
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
    for (let i = 0; i < N_HIDDEN; i++) dot(cols[1], yOf(i, N_HIDDEN), hid[i]);
    for (let i = 0; i < N_OUT; i++) dot(cols[2], yOf(i, N_OUT), c.out[i]);
    const feels = FEEL.map(([i, n]) => [c.inp[i], n] as [number, string]).filter((x) => x[0] > 0.3).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    const wants = WANT.map(([i, n]) => [c.out[i], n] as [number, string]).filter((x) => x[0] > 0.25).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    this.part(
      "c-brainnote",
      c.alive
        ? `Left, what it senses (${feels.length ? feels.join(", ") : "nothing pressing"}). Right, what its network decides (${wants.length ? wants.join(", ") : "nothing much"}). ${c.brain.length} weights, ${c.gen === 0 ? "the instincts it arrived with" : "mixed from its parents and nudged"}.`
        : "Its network as it was at the end.",
    );
  }

  /* ---------------- the chronicle ---------------- */

  private chronicle(): void {
    const w = this.w;
    this.frame(
      "chronicle",
      `<h2 class="title">Chronicle</h2><p class="lede">What has happened here, written from the events themselves.</p>
       <div class="tabs"><button data-tab="world" id="t-world">The world</button><button data-tab="talk" id="t-talk">Conversations</button></div><div id="ch-list"></div>`,
    );
    document.getElementById("t-world")?.setAttribute("aria-pressed", String(this.tab === "world"));
    document.getElementById("t-talk")?.setAttribute("aria-pressed", String(this.tab === "talk"));
    if (this.tab === "world") {
      const items = w.news.slice(-80).reverse().map((n) => `<div class="entry"><small>${when(n.t)}</small>${esc(tellNews(w, n))}</div>`);
      this.part("ch-list", items.join("") || '<p class="empty">Nothing has happened yet.</p>');
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

  /* ---------------- beliefs ---------------- */

  private beliefs(): void {
    const w = this.w;
    this.frame(
      "beliefs",
      `<h2 class="title">Beliefs</h2><p class="lede">What the kith hold to be true, where each idea began, and how it travelled. A belief pulls on the one who holds it: tap one to see it on the land.</p><div id="b-list"></div>`,
    );
    const kith = w.counts[KITH];
    const rows = w.ideas
      .map((idea) => ({ idea, n: holders(w, idea.id) }))
      .filter((r) => r.n > 0 || r.idea.edges.length > 0)
      .sort((a, b) => b.n - a.n || b.idea.edges.length - a.idea.edges.length)
      .slice(0, 40);
    const html = rows.map(({ idea, n }) => {
      const open = idea.id === this.idea;
      const origin = `Began with ${esc(nameOf(w, idea.origin))}, ${when(idea.t)}`;
      const src = idea.from >= 0 ? `, as a mistelling of “${esc(tellIdea(w, w.ideas[idea.from]))}”` : idea.kind === "lore" ? ", in its own words" : ", from its own life";
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
      }
      return `<div class="idea" data-idea="${idea.id}" aria-current="${open}"><h4>${esc(tellIdea(w, idea))}</h4><p>Held by ${n} of ${kith} kith. ${origin}${src}. Passed on ${idea.edges.length} ${idea.edges.length === 1 ? "time" : "times"}.</p>${more}</div>`;
    });
    this.part("b-list", html.join("") || '<p class="empty">No beliefs yet. They begin when something happens to one of the kith (a narrow escape, a place that fed it when it was starving) and spread when two of them talk.</p>');
  }

  /* ---------------- about ---------------- */

  private about(): void {
    const w = this.w;
    this.frame(
      "about",
      `<div class="about"><h2 class="title">Eden</h2>
      <p class="lede">A small island, alive on its own. Nothing on it follows a script.</p>
      <p>${HONEST}</p>
      <h3>The four kinds</h3>
      <p><b>Dapples</b> graze and keep together. <b>Russets</b> hunt them. <b>Skims</b> fish the lake and the shallows. The <b>kith</b> are the thinking ones: they carry wood, make fire and shelter, pile stones to mark places, and talk.</p>
      <h3>How they learn</h3>
      <p>Every creature has its own network of ${N_IN} senses, ${N_HIDDEN} hidden neurons and ${N_OUT} decisions. The first of each kind arrive with rough instincts. From then on a child's weights are a mix of its parents', with a few nudged at random. Those that find food and water and avoid the hunters leave more children; that is the only teacher.</p>
      <h3>How words become behaviour</h3>
      <p>When something happens to one of the kith, it may come to believe something about a place. When two meet, they talk, and a belief can pass from one to the other, sometimes wrongly. A belief is an input to the holder's own network, so what is said changes where they go. Open <button class="link" data-goto="-1">Beliefs</button> to follow an idea across the island.</p>
      <h3>Your hand</h3>
      <p>Drag to turn the island, pinch or scroll to zoom, two fingers or right-drag to slide. Tap a creature to follow it. Choose a kind and tap the land to set one down. Send rain, drought or cold, or drop food.</p>
      <h3>This world</h3>
      <p>World number <span class="seed">${w.seed}</span>, ${when(w.t)}. ${w.births} born, ${w.deaths} died so far. The same number always grows the same island.</p>
      <div class="actions"><button class="btn" data-act="new">New world</button><button class="link" data-act="copy">Copy a link to this one</button></div></div>`,
    );
  }
}

function ordinalGen(gen: number): string {
  if (gen === 0) return "set down here";
  return `generation ${gen + 1}`;
}

