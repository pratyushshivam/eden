import {
  BIRD, DAY, DT, GRAZER, KITH, PREDATOR, SEASONS, SPECIES, createWorld, dropFood, makeCold, makeDrought, makeRain, nameOf, place, seedLife, step,
  tellNews, who, type Idea, type Species, type Talk,
} from "./engine";
import { Stage } from "./render/stage";
import { Sound } from "./ui/audio";
import { Mind } from "./ui/mind";
import { Panels } from "./ui/panels";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const debug = params.has("debug");

/* ---------------- the world ---------------- */

let seed = Number(params.get("seed"));
if (!Number.isInteger(seed) || seed <= 0) {
  seed = 1 + Math.floor(Math.random() * 99998);
  history.replaceState(null, "", `?seed=${seed}${debug ? "&debug" : ""}`);
}
const world = createWorld(seed);
seedLife(world);
const stage = new Stage($<HTMLCanvasElement>("stage"));
const sound = new Sound();
const mind = new Mind(world);
const panels = new Panels(world, mind);
let speed = 1;
let armed: Species | "food" | null = null;
let photo = false;

/* ---------------- the dock ---------------- */

const GLYPH = [
  '<svg viewBox="0 0 24 24"><ellipse cx="11" cy="13" rx="7" ry="5" fill="currentColor"/><circle cx="18.5" cy="10" r="3" fill="currentColor"/><path d="M7 17v3M10 17.5v2.5M13 17.5v2.5M16 17v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M3 9c2 1 3 2 4 4h8l2-3 1-4 1.5 3.5L22 12l-2 2.5h-3L16 16H7c-1.5 0-2.5-1-2.5-2.5C4.5 12 4 10.5 3 9z" fill="currentColor"/><path d="M8 16v3.5M15 16v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 9c4-2 7-1 10 3 3-4 6-5 10-3-3 1-5 3-6 6h-8c-1-3-3-5-6-6z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M12 2.5c3 1 4.5 3.2 4.5 5.5 0 1.500-.6 2.700-1.500 3.500l3 9.500H6l3-9.500C8.100 10.700 7.500 9.500 7.500 8c0-2.300 1.500-4.500 4.500-5.500z" fill="currentColor"/></svg>',
];
const kinds = $("kinds");
const order: Species[] = [KITH, GRAZER, PREDATOR, BIRD];
const kindBtn = new Map<Species, { btn: HTMLButtonElement; count: HTMLElement }>();
for (const sp of order) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "kind";
  b.setAttribute("aria-pressed", "false");
  const one = SPECIES[sp].one;
  b.innerHTML = `${GLYPH[sp]}<span>${one.charAt(0).toUpperCase() + one.slice(1)}</span><small>0</small>`;
  b.addEventListener("click", () => arm(armed === sp ? null : sp));
  kinds.appendChild(b);
  kindBtn.set(sp, { btn: b, count: b.querySelector("small") as HTMLElement });
}

function arm(what: Species | "food" | null): void {
  armed = what;
  for (const [sp, k] of kindBtn) k.btn.setAttribute("aria-pressed", String(armed === sp));
  $("food").setAttribute("aria-pressed", String(armed === "food"));
  if (armed === null) delete document.body.dataset.armed;
  else document.body.dataset.armed = "1";
  if (armed !== null && armed !== "food") toast(`Tap the land to set down a ${SPECIES[armed].one}. Tap the button again to stop.`);
  if (armed === "food") toast("Tap the land to drop food.");
}

let toastTimer = 0;
function toast(text: string, ms = 2600): void {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

for (const b of document.querySelectorAll<HTMLButtonElement>("#speeds [data-speed]")) {
  b.addEventListener("click", () => setSpeed(Number(b.dataset.speed)));
}
function setSpeed(v: number): void {
  speed = v;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#speeds [data-speed]")) b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === v));
}
$("rain").addEventListener("click", () => {
  makeRain(world);
  toast("Clouds gather.");
});
$("drought").addEventListener("click", () => {
  makeDrought(world);
  toast("The rain stops. The river will fail.");
});
$("cold").addEventListener("click", () => {
  makeCold(world);
  toast("A hard cold falls.");
});
$("food").addEventListener("click", () => arm(armed === "food" ? null : "food"));

/* ---------------- choosing and following ---------------- */

function select(id: number, zoom = true): void {
  const c = who(world, id);
  if (!c) return;
  stage.selected = c.alive ? id : -1;
  panels.open("card", id);
  if (c.alive) {
    if (c.sp === KITH) mind.voice(c);
    if (zoom && !stage.cam.zoomedIn) stage.cam.goTo(c.x - 60, c.y - 60, 30, 1.0);
    stage.cam.drift = false;
  }
}

function deselect(): void {
  stage.selected = -1;
  $("tag").hidden = true;
}

stage.cam.onTap = (x, y) => {
  sound.start();
  endIntro();
  if (photo) return;
  if (armed !== null) {
    const g = stage.pickGround(x, y);
    if (!g) {
      toast("That is not land.");
      return;
    }
    if (armed === "food") {
      toast(dropFood(world, g.x, g.y) ? "Food falls." : "It would sink there.");
      return;
    }
    const c = place(world, armed, g.x, g.y, 0.6);
    if (!c) {
      toast(armed === BIRD ? "Not there." : "It cannot stand there.");
      return;
    }
    if (firstTap) {
      // The very first tap: put the visitor straight beside what they made.
      firstTap = false;
      arm(null);
      select(c.id);
      toast("One of the kith. Watch it for a while, or tap any creature to follow it.", 5200);
    }
    return;
  }
  const id = stage.pickCreature(world, x, y);
  if (id >= 0) select(id);
  else if (panels.view === "card") panels.close();
};
stage.cam.onMove = (panned) => {
  sound.start();
  if (panned && stage.selected >= 0) deselect();
};

panels.onWho = (id) => select(id, false);
panels.onClose = () => {
  deselect();
  stage.setPlace(-1);
  stage.setLinks([]);
};
panels.onAsk = (id) => {
  const c = world.byId.get(id);
  if (c) mind.voice(c, true);
};
panels.onNewWorld = () => {
  location.href = `?seed=${1 + Math.floor(Math.random() * 99998)}${debug ? "&debug" : ""}`;
};
let shownIdea: Idea | null = null;
panels.onIdea = (idea) => {
  shownIdea = idea;
  stage.setPlace(idea && idea.place >= 0 ? idea.place : -1, idea?.kind === "good" ? 0x2f7d5b : 0xd4491a);
  if (idea && idea.place >= 0) {
    const p = world.terrain.places[idea.place];
    deselect();
    stage.cam.goTo(p.x - 60, p.y - 60, 78, 0.85);
  }
  if (!idea) stage.setLinks([]);
};
mind.onChange = () => panels.refresh();

/* ---------------- the menu ---------------- */

for (const b of document.querySelectorAll<HTMLButtonElement>(".menu [data-open]")) {
  b.addEventListener("click", () => {
    const v = b.dataset.open as string;
    if (panels.view === v) panels.close();
    else {
      deselect();
      panels.open(v);
    }
  });
}
$("home").addEventListener("click", () => {
  panels.close();
  deselect();
  stage.cam.home();
});
const muteBtn = $("mute");
muteBtn.setAttribute("aria-pressed", String(sound.muted));
muteBtn.addEventListener("click", () => {
  sound.start();
  muteBtn.setAttribute("aria-pressed", String(sound.toggle()));
});

function setPhoto(on: boolean): void {
  photo = on;
  document.body.classList.toggle("photo", on);
  $("photo-bar").hidden = !on;
  if (on) arm(null);
}
$("photo").addEventListener("click", () => setPhoto(true));
$("photo-done").addEventListener("click", () => setPhoto(false));
$("photo-save").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = stage.photo(3840);
  a.download = `eden-${world.seed}-day-${Math.floor(world.t / DAY) + 1}.jpg`;
  a.click();
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === " ") {
    e.preventDefault();
    setSpeed(speed === 0 ? 1 : 0);
  } else if (e.key === "1") setSpeed(1);
  else if (e.key === "2") setSpeed(8);
  else if (e.key === "3") setSpeed(32);
  else if (e.key === "Escape") {
    if (photo) setPhoto(false);
    else if (armed !== null) arm(null);
    else panels.close();
  }
});
window.addEventListener("resize", () => stage.resize());

/* ---------------- first visit ---------------- */

let firstTap = false;
let intro = false;
try {
  intro = !localStorage.getItem("eden.seen") || params.has("intro");
} catch {
  intro = true;
}
if (intro) {
  $("intro").hidden = false;
  $("ghost").hidden = false;
  firstTap = true;
  armed = KITH;
  document.body.dataset.armed = "1";
}
function endIntro(): void {
  if (!intro) return;
  intro = false;
  $("intro").hidden = true;
  $("ghost").hidden = true;
  try {
    localStorage.setItem("eden.seen", "1");
  } catch {
    // Fine.
  }
}

/* ---------------- conversations on the land ---------------- */

interface Showing {
  talk: Talk;
  line: number;
  until: number;
  el: HTMLElement;
}
let showing: Showing | null = null;
const pendingTalks: Talk[] = [];
mind.onTalk = (t) => {
  if (pendingTalks.length < 3) pendingTalks.push(t);
  panels.refresh();
};

function bubbles(now: number): void {
  const host = $("bubbles");
  if (!showing && pendingTalks.length) {
    const talk = pendingTalks.shift() as Talk;
    const el = document.createElement("div");
    el.className = "bubble";
    host.appendChild(el);
    showing = { talk, line: -1, until: 0, el };
  }
  if (!showing) return;
  if (now > showing.until) {
    showing.line++;
    const l = showing.talk.lines[showing.line];
    if (!l) {
      showing.el.remove();
      showing = null;
      return;
    }
    showing.until = now + 1800 + l.text.length * 45;
    showing.el.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = nameOf(world, l.who);
    showing.el.append(b, document.createTextNode(l.text));
  }
  const l = showing.talk.lines[showing.line];
  const p = l ? stage.creatureOnScreen(l.who, 2.2) : null;
  if (p && speed <= 8) {
    showing.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    showing.el.style.visibility = "visible";
  } else showing.el.style.visibility = "hidden";
}

/* ---------------- the loop ---------------- */

const TIMES = ["night", "dawn", "morning", "midday", "afternoon", "dusk", "evening", "night"];
let last = performance.now();
let acc = 0;
let slowTick = 0;
let newsSeen = 0;
let lastNewsToast = 0;

function hud(now: number): void {
  const day = Math.floor(world.t / DAY);
  const frac = (world.t / DAY) % 1;
  const tod = TIMES[Math.min(7, Math.floor(((frac + 0.0625) % 1) * 8))];
  const sky = world.coldLeft > 0 ? " · bitter cold" : world.droughtLeft > 0 ? " · drought" : world.rain > 0.25 ? (world.temp < 1.5 ? " · snow" : " · rain") : "";
  $("now").textContent = `Day ${day + 1} · ${SEASONS[world.season]} · ${tod} · ${Math.round(world.temp)}°${sky} · ${world.creatures.length} alive`;
  for (const [sp, k] of kindBtn) k.count.textContent = String(world.counts[sp]);
  $("rain").classList.toggle("busy", world.rainLeft > 0);
  $("drought").classList.toggle("busy", world.droughtLeft > 0);
  $("cold").classList.toggle("busy", world.coldLeft > 0);
  // Tell the visitor when something worth knowing happens.
  if (world.news.length > newsSeen) {
    if (now - lastNewsToast > 5000 && !intro && !photo) {
      const n = world.news[world.news.length - 1];
      if (n.kind !== "arrive" && n.kind !== "rainSent" && n.kind !== "drought" && n.kind !== "cold") {
        toast(tellNews(world, n), 4200);
        lastNewsToast = now;
      }
    }
    newsSeen = world.news.length;
  }
  if (import.meta.env.DEV && mind.spend) {
    const s = mind.spend;
    const el = $("spend");
    el.hidden = false;
    el.textContent = `words: $${s.session.toFixed(4)} this session (limit $${s.sessionLimit.toFixed(2)}) · $${s.total.toFixed(4)} of $${s.totalLimit.toFixed(2)} in all · ${s.calls} calls · ${mind.ready ? "ready" : s.state === "ready" ? "limit reached" : s.state.replace("_", " ")}${debug ? ` · ${Math.round(stage.fps)} fps` : ""}`;
  } else if (debug) {
    $("spend").hidden = false;
    $("spend").textContent = `${Math.round(stage.fps)} fps`;
  }
}

function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * speed;
  // Step the world, but never spend more than a slice of the frame on it.
  const stop = performance.now() + 11;
  while (acc >= DT) {
    step(world);
    acc -= DT;
    if (performance.now() > stop) {
      acc = 0;
      break;
    }
  }
  mind.pump(now);
  if (shownIdea) {
    const pairs: [number, number][] = shownIdea.edges.slice(-24).map((e) => [e.a, e.b]);
    stage.setLinks(pairs);
  }
  stage.frame(world, dt);

  // A name above whoever is followed.
  const tag = $("tag");
  const sel = stage.selected >= 0 ? world.byId.get(stage.selected) : undefined;
  if (stage.selected >= 0 && !sel) stage.selected = -1;
  const sp = sel ? stage.creatureOnScreen(sel.id, sel.sp === BIRD ? 1.4 : 2.1) : null;
  if (sel && sp && !photo) {
    tag.hidden = false;
    tag.textContent = sel.name ?? SPECIES[sel.sp].one;
    tag.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y)}px) translate(-50%, -100%)`;
  } else tag.hidden = true;

  if (intro) {
    const m = world.terrain.places.find((p) => p.kind === "meadow") ?? world.terrain.places[0];
    const g = stage.toScreen(m.x, m.y, 0.3);
    if (g) $("ghost").style.transform = `translate(${Math.round(g.x)}px, ${Math.round(g.y)}px)`;
  }
  bubbles(now);
  if (now - slowTick > 160) {
    slowTick = now;
    hud(now);
    panels.refresh();
    const cam = stage.cam;
    const lake = world.terrain.lake;
    const toLake = Math.hypot(cam.target.x - (lake.x - 60), cam.target.z - (lake.y - 60));
    const toSea = Math.abs(Math.hypot(cam.target.x, cam.target.z) - 50);
    const nearWater = Math.max(0, 1 - Math.min(toLake - lake.r, toSea) / 22);
    sound.update(world.night, world.rain, nearWater, Math.max(0, Math.min(1, 1 - (cam.dist - 20) / 120)), world.temp < 2);
  }
  requestAnimationFrame(loop);
}

void mind.init();
if (debug) Object.assign(window, { __eden: { world, stage, mind, panels, select, setSpeed, arm } });
requestAnimationFrame(loop);
