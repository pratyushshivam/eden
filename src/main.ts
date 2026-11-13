import {
  CELLS, CLEVER, DAY, DT, HIDDEN, KITH, N_IN, N_OUT, SEASONS, SPECIES, TIER_NAMES, cellOf, createWorld, dropFood, genomeSize, grid, impression,
  leaveAvatar, makeCold, makeDrought, makeRain, nameOf, place, plainVoice, step, sunAt, takeAvatar, tellNews, weatherAt, who, craftName,
  type Creature, type Idea, type Ping, type Species, type Talk, type World,
} from "./engine";
import { FOREST, JUNGLE, LAKE, PLAINS, RIVER, SEA, SHALLOW } from "./engine/terrain";
import { Stage } from "./render/stage";
import { Sound } from "./ui/audio";
import { Mind } from "./ui/mind";
import { Panels } from "./ui/panels";
import { forgetWorld, lastSeed, loadWorld, saveWorld } from "./ui/store";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const debug = params.has("debug");

const GLYPH = [
  '<svg viewBox="0 0 24 24"><ellipse cx="11" cy="13" rx="7" ry="5" fill="currentColor"/><circle cx="18.5" cy="10" r="3" fill="currentColor"/><path d="M7 17v3M10 17.5v2.5M13 17.5v2.5M16 17v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M3 9c2 1 3 2 4 4h8l2-3 1-4 1.5 3.5L22 12l-2 2.5h-3L16 16H7c-1.5 0-2.5-1-2.5-2.5C4.5 12 4 10.5 3 9z" fill="currentColor"/><path d="M8 16v3.5M15 16v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 9c4-2 7-1 10 3 3-4 6-5 10-3-3 1-5 3-6 6h-8c-1-3-3-5-6-6z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 11a7 6 0 0 1 14 0v1H5z" fill="currentColor"/><path d="M7 13v6M10 13v8M14 13v8M17 13v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>',
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="3.2" fill="currentColor"/><path d="M7 10h10l1 6-3 1v4h-2v-4h-2v4H9v-4l-3-1z" fill="currentColor"/><path d="M6.500 11 3 18M17.500 11 21 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M1 8c5-3 8-1 11 4 3-5 6-7 11-4-4 1-6 4-7 8l-4 3-4-3c-1-4-3-7-7-8z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M12 2.500c3 1 4.500 3.200 4.500 5.500 0 1.500-.6 2.700-1.500 3.500l3 9.500H6l3-9.500C8.100 10.700 7.500 9.500 7.500 8c0-2.300 1.500-4.500 4.500-5.500z" fill="currentColor"/></svg>',
];

type Armed = { sp: Species } | { tool: "rain" | "drought" | "cold" | "food" } | null;

async function boot(): Promise<void> {
  /* ---------------- the world: saved, or new ---------------- */
  let seed = Number(params.get("seed"));
  if (!Number.isInteger(seed) || seed <= 0) seed = (await lastSeed()) ?? 1 + Math.floor(Math.random() * 99998);
  history.replaceState(null, "", `?seed=${seed}${debug ? "&debug" : ""}`);
  const saved = params.has("fresh") ? null : await loadWorld(seed);
  const world: World = saved ?? createWorld(seed);
  if (world.avatarId >= 0) leaveAvatar(world); // a body left standing when the page was closed
  const stage = new Stage($<HTMLCanvasElement>("stage"));
  const sound = new Sound();
  const mind = new Mind(world);
  const panels = new Panels(world, mind);
  let speed = 1;
  let armed: Armed = null;
  let chosen: Species = KITH;
  let photo = false;
  let touring = false;

  /* ---------------- choosing what to set down ---------------- */

  const pickBtn = $<HTMLButtonElement>("pick");
  const picker = $("picker");
  const netSvg = (h: number): string => {
    const col = (x: number, n: number, r: number): string => Array.from({ length: n }, (_, i) => `<circle cx="${x}" cy="${3 + (i * 28) / (n - 1)}" r="${r}"/>`).join("");
    return `<svg class="net" viewBox="0 0 200 34" aria-hidden="true"><g stroke="rgba(21,20,15,0.2)" stroke-width="0.5">${Array.from({ length: 10 }, (_, i) => `<path d="M14 ${4 + i * 2.9}L100 ${3 + ((i * 5) % h) * (28 / (h - 1))}L186 ${4 + ((i * 7) % 10) * 2.9}" fill="none"/>`).join("")}</g><g fill="#15140f">${col(14, 9, 1.3)}${col(186, 9, 1.3)}</g><g fill="#d4491a">${col(100, h, 1.6)}</g></svg>`;
  };
  const TIER_TEXT = [
    "A small reflex network. It learns to survive across generations, and has no memory and no words.",
    "A larger network with memory. It remembers places, plays, grieves, and looks into new things. No words: its feelings are read from the network.",
    "The largest network, plus beliefs, talk and invention. Its words are written by a language model from its own life.",
  ];
  function drawPicker(): void {
    picker.innerHTML = [0, 1, 2]
      .map((tier) => {
        const rows = SPECIES.map((s, sp) => ({ s, sp }))
          .filter((x) => x.s.tier === tier)
          .map(
            ({ s, sp }) =>
              `<button type="button" class="kind-row" data-sp="${sp}" aria-pressed="${armed !== null && "sp" in armed && armed.sp === sp}">${GLYPH[sp]}<b>${s.one.charAt(0).toUpperCase() + s.one.slice(1)}</b><small>${world.counts[sp]} alive</small><span>${s.blurb}${s.sea ? " Set down in water." : ""}</span></button>`,
          )
          .join("");
        return `<section class="tier"><h3>${TIER_NAMES[tier]} mind</h3>${netSvg(HIDDEN[tier])}<p>${TIER_TEXT[tier]} ${N_IN} senses, ${HIDDEN[tier]} hidden neurons, ${N_OUT} decisions: ${genomeSize(HIDDEN[tier])} weights each.</p>${rows}</section>`;
      })
      .join("");
  }
  function showPicker(on: boolean): void {
    picker.hidden = !on;
    pickBtn.setAttribute("aria-expanded", String(on));
    if (on) drawPicker();
  }
  function arm(what: Armed): void {
    armed = what;
    if (what && "sp" in what) chosen = what.sp;
    const s = SPECIES[chosen];
    pickBtn.innerHTML = `${GLYPH[chosen]}<span>${s.one.charAt(0).toUpperCase() + s.one.slice(1)}</span><small>${TIER_NAMES[s.tier].toLowerCase()}</small>`;
    pickBtn.setAttribute("aria-pressed", String(armed !== null && "sp" in armed));
    for (const b of document.querySelectorAll<HTMLButtonElement>("#tools [data-tool]")) b.setAttribute("aria-pressed", String(armed !== null && "tool" in armed && armed.tool === b.dataset.tool));
    if (armed === null) delete document.body.dataset.armed;
    else document.body.dataset.armed = "1";
  }
  pickBtn.addEventListener("click", () => {
    if (!picker.hidden) showPicker(false);
    else if (armed && "sp" in armed) arm(null);
    else showPicker(true);
  });
  picker.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-sp]");
    if (!row) return;
    const sp = Number(row.dataset.sp) as Species;
    arm({ sp });
    showPicker(false);
    toast(`Tap anywhere ${SPECIES[sp].sea ? "on the sea" : SPECIES[sp].air ? "" : "on land"} to set down a ${SPECIES[sp].one}. Tap again for more.`.replace("  ", " "), 4200);
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>("#tools [data-tool]")) {
    b.addEventListener("click", () => {
      const tool = b.dataset.tool as "rain" | "drought" | "cold" | "food";
      showPicker(false);
      if (armed && "tool" in armed && armed.tool === tool) arm(null);
      else {
        arm({ tool });
        toast(tool === "food" ? "Tap the land where food should fall." : `Tap the place where the ${tool} should come.`);
      }
    });
  }

  let toastTimer = 0;
  function toast(text: string, ms = 2800): void {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (el.hidden = true), ms);
  }

  for (const b of document.querySelectorAll<HTMLButtonElement>("#speeds [data-speed]")) b.addEventListener("click", () => setSpeed(Number(b.dataset.speed)));
  function setSpeed(v: number): void {
    speed = v;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#speeds [data-speed]")) b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === v));
  }

  /* ---------------- choosing and following ---------------- */

  function select(id: number, zoom = true): void {
    const c = who(world, id);
    if (!c) return;
    stage.selected = c.alive ? id : -1;
    panels.open("card", id);
    if (c.alive) {
      if (c.sp === KITH) mind.voice(c);
      stage.cam.drift = false;
      if (zoom && !stage.cam.close) stage.cam.flyTo(c.x, c.y, c.z, 34);
    }
  }
  function deselect(): void {
    stage.selected = -1;
    $("tag").hidden = true;
  }

  stage.cam.onTap = (x, y) => {
    sound.start();
    if (embodied) {
      // In a body, a click on the world takes hold of the mouse for looking around.
      if (chatWith < 0) void canvas.requestPointerLock?.();
      return;
    }
    if (touring) {
      endTour();
      return;
    }
    if (photo) return;
    showPicker(false);
    if (armed !== null) {
      const g = stage.pickGround(x, y);
      if (!g) {
        toast("That is empty space.");
        return;
      }
      if ("tool" in armed) {
        if (armed.tool === "food") toast(dropFood(world, g.x, g.y, g.z) ? "Food falls out of the sky." : "It would sink there.");
        else if (armed.tool === "rain") {
          makeRain(world, g.x, g.y, g.z);
          toast("Clouds gather there.");
        } else if (armed.tool === "drought") {
          makeDrought(world, g.x, g.y, g.z);
          toast("The rain will stay away from there for a while.");
        } else {
          makeCold(world, g.x, g.y, g.z);
          toast("A hard cold falls there.");
        }
        arm(null);
        return;
      }
      const c = place(world, armed.sp, g.x, g.y, g.z);
      if (!c) toast(SPECIES[armed.sp].sea ? "A glim needs the sea." : "It cannot live there.");
      else if (world.counts[armed.sp] === 1) toast(`The first ${SPECIES[armed.sp].one} on the planet. It will need others of its kind to breed.`, 4200);
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
  panels.onGoto = (x, y, z) => {
    deselect();
    stage.cam.flyTo(x, y, z, 40);
  };
  panels.onKey = (key) => mind.connect(key);
  panels.onNewWorld = () => {
    void forgetWorld(world.seed).then(() => {
      location.href = `?seed=${1 + Math.floor(Math.random() * 99998)}${debug ? "&debug" : ""}`;
    });
  };
  let shownIdea: Idea | null = null;
  panels.onIdea = (idea) => {
    shownIdea = idea;
    stage.setPlace(idea && idea.place >= 0 ? idea.place : -1, idea?.kind === "good" ? 0x2f7d5b : 0xd4491a);
    if (idea && idea.place >= 0) {
      const p = world.terrain.places[idea.place];
      deselect();
      stage.cam.flyTo(p.x, p.y, p.z, 85);
    } else if (idea) {
      const holder = world.creatures.find((c) => c.beliefs.some((b) => b.idea === idea.id));
      if (holder) {
        deselect();
        stage.cam.flyTo(holder.x, holder.y, holder.z, 70);
      }
    }
    if (!idea) stage.setLinks([]);
  };
  mind.onChange = () => panels.refresh();
  mind.onMade = (id, idea) => {
    const c = world.byId.get(id);
    if (c) toast(`${nameOf(world, id)} has made something new: ${craftName(world, idea.id)}.`, 5200);
  };

  /* ---------------- being one of them ---------------- */

  const canvas = $<HTMLCanvasElement>("stage");
  const avatarBtn = $("avatar");
  const held = new Set<string>();
  let embodied = false;
  let chatWith = -1;
  let slow = false;
  let nearKith = -1;
  let closeView = false;

  function embody(on: boolean): void {
    if (on === embodied) return;
    if (on) {
      const at = stage.cam.tgt;
      const me = takeAvatar(world, at.x, at.y, at.z);
      if (!me) {
        toast("There is no room for another body right now.");
        return;
      }
      arm(null);
      showPicker(false);
      panels.close();
      deselect();
      toast("You are among them now, in a body that shines. What they make of you is up to each of them.", 6000);
    } else {
      closeChat();
      leaveAvatar(world);
      document.exitPointerLock?.();
      held.clear();
    }
    embodied = on;
    document.body.classList.toggle("embodied", on);
    avatarBtn.textContent = on ? "Leave avatar" : "Take avatar";
    avatarBtn.setAttribute("aria-pressed", String(on));
    $("keys").hidden = !on;
    $("interact").hidden = true;
  }
  avatarBtn.addEventListener("click", () => embody(!embodied));
  canvas.addEventListener("mousemove", (e) => {
    if (embodied && document.pointerLockElement === canvas) stage.cam.mouse(e.movementX, e.movementY);
  });
  window.addEventListener("keydown", (e) => {
    if (!embodied || e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
      held.add(k);
      e.preventDefault();
    } else if (k === " ") {
      stage.critters.jumpAt = stage.clock;
      e.preventDefault();
    } else if (k === "e" && nearKith >= 0) {
      e.preventDefault();
      openChat(nearKith);
    } else if (k === "v") {
      closeView = !closeView;
      stage.cam.reach(closeView ? 1.7 : 7);
    }
  });
  window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());

  /** Turns the keys held into a direction for the body, in the frame of the view. */
  function steer(): void {
    const k = world.ctl;
    let f = 0, r = 0;
    if (chatWith < 0) {
      if (held.has("w") || held.has("arrowup")) f += 1;
      if (held.has("s") || held.has("arrowdown")) f -= 1;
      if (held.has("d") || held.has("arrowright")) r += 1;
      if (held.has("a") || held.has("arrowleft")) r -= 1;
    }
    const c = stage.cam;
    k.x = c.fwd.x * f + c.right.x * r;
    k.y = c.fwd.y * f + c.right.y * r;
    k.z = c.fwd.z * f + c.right.z * r;
    k.run = held.has("shift");
  }

  function drawChat(waiting = false): void {
    const log = $("chat-log");
    log.innerHTML = "";
    for (const m of world.chat.filter((x) => x.who === chatWith).slice(-8)) {
      const p = document.createElement("p");
      if (m.me) p.className = "me";
      const b = document.createElement("b");
      b.textContent = m.me ? "You: " : `${nameOf(world, m.who)}: `;
      p.append(b, document.createTextNode(m.text));
      log.appendChild(p);
    }
    if (waiting) {
      const p = document.createElement("p");
      p.className = "wait";
      p.textContent = "It is working out what to say…";
      log.appendChild(p);
    }
    log.scrollTop = log.scrollHeight;
  }
  function openChat(id: number): void {
    if (!world.byId.has(id)) return;
    chatWith = id;
    slow = true;
    document.body.classList.add("slow");
    document.exitPointerLock?.();
    held.clear();
    $("chat").hidden = false;
    $("interact").hidden = true;
    ($("chat-input") as HTMLInputElement).placeholder = `Say something to ${nameOf(world, id)}`;
    drawChat();
    ($("chat-input") as HTMLInputElement).focus();
  }
  function closeChat(): void {
    chatWith = -1;
    slow = false;
    document.body.classList.remove("slow");
    $("chat").hidden = true;
  }
  $("chat").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("chat-input") as HTMLInputElement;
    const text = input.value.trim();
    const c = world.byId.get(chatWith);
    if (!text || !c) return;
    input.value = "";
    const id = c.id;
    say(world.avatarId, "You", text, "", 4200);
    // Shown at once; the answer is added when it comes.
    const p = document.createElement("p");
    p.className = "me";
    const b = document.createElement("b");
    b.textContent = "You: ";
    p.append(b, document.createTextNode(text));
    $("chat-log").appendChild(p);
    const wait = document.createElement("p");
    wait.className = "wait";
    wait.textContent = "It is working out what to say…";
    $("chat-log").appendChild(wait);
    $("chat-log").scrollTop = $("chat-log").scrollHeight;
    void mind.answer(c, text).then((reply) => {
      if (reply) say(id, nameOf(world, id), reply, "", 2600 + reply.length * 50);
      if (chatWith === id) drawChat();
    });
  });
  $("chat-input").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") closeChat();
  });
  $("interact").addEventListener("click", () => {
    if (nearKith >= 0) openChat(nearKith);
  });
  mind.onSpoken = (id, text) => {
    say(id, nameOf(world, id), text, "", 3000 + text.length * 50);
    if (embodied && chatWith < 0) toast(`${nameOf(world, id)} spoke to you. Go close and press E to answer.`, 4200);
  };

  /* ---------------- the menu ---------------- */

  for (const b of document.querySelectorAll<HTMLButtonElement>(".menu [data-open]")) {
    b.addEventListener("click", () => {
      const v = b.dataset.open as string;
      showPicker(false);
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
    stage.home(world);
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
    if (on) {
      arm(null);
      showPicker(false);
    }
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
    if (embodied && e.key !== "Escape") return;
    if (e.key === " ") {
      e.preventDefault();
      setSpeed(speed === 0 ? 1 : 0);
    } else if (e.key === "1") setSpeed(1);
    else if (e.key === "2") setSpeed(8);
    else if (e.key === "3") setSpeed(32);
    else if (e.key === "Escape") {
      if (touring) endTour();
      else if (photo) setPhoto(false);
      else if (!picker.hidden) showPicker(false);
      else if (armed !== null) arm(null);
      else panels.close();
    }
  });
  window.addEventListener("resize", () => stage.resize());

  /* ---------------- saving ---------------- */

  let lastSave = performance.now();
  const save = (): void => {
    lastSave = performance.now();
    void saveWorld(world);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
  window.addEventListener("pagehide", save);

  /* ---------------- the guided first minute ---------------- */

  interface Beat { at: number; run: () => void }
  let beats: Beat[] = [];
  let tourStart = 0;
  let tourKith: Creature | null = null;
  function line(a: string, b = ""): void {
    const l = $("intro-line"), s = $("intro-sub");
    l.textContent = a;
    s.textContent = b;
    // Restart the rise.
    for (const el of [l, s]) {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }
  }
  function startTour(): void {
    touring = true;
    document.body.classList.add("touring");
    $("intro").hidden = false;
    tourStart = performance.now();
    const g = grid();
    const t = world.terrain;
    // A mild, green place near water where it is morning: in daylight now, and still in daylight when we arrive.
    const turn = -Math.PI * 2 * (22 / DAY);
    const fx = world.sunX * Math.cos(turn) - world.sunZ * Math.sin(turn), fz = world.sunX * Math.sin(turn) + world.sunZ * Math.cos(turn);
    let best = 0, bs = -9;
    for (let k = 0; k < 12000; k++) {
      const i = (Math.imul(k + 17, 2654435761) >>> 0) % CELLS;
      const kind = t.kind[i];
      if ((kind !== FOREST && kind !== PLAINS && kind !== JUNGLE) || t.temp[i] < 11 || t.temp[i] > 27 || t.freshDist[i] > 12) continue;
      const later = g.cx[i] * fx + g.cy[i] * world.sunY + g.cz[i] * fz;
      const s = Math.min(sunAt(world, g.cx[i], g.cy[i], g.cz[i]), later) + (kind === FOREST ? 0.15 : 0) - Math.abs(g.cy[i]) * 0.2;
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    const hx = g.cx[best], hy = g.cy[best], hz = g.cz[best];
    beats = [
      { at: 0, run: () => line("A whole small planet.", "Seas, forests, deserts, ice. Nothing lives here yet.") },
      {
        at: 5200,
        run: () => {
          line("Everything that walks here, you set down.", "These are the first of the kith.");
          stage.cam.flyTo(hx, hy, hz, 70);
        },
      },
      {
        at: 8600,
        run: () => {
          for (let k = 0; k < 8; k++) {
            const c = place(world, KITH, hx + world.rng.range(-0.02, 0.02), hy + world.rng.range(-0.02, 0.02), hz + world.rng.range(-0.02, 0.02));
            if (c && !tourKith) tourKith = c;
          }
        },
      },
      {
        at: 10500,
        run: () => {
          line("Each one has its own brain.", "A small neural network, inherited by its children. Nobody tells it what to do.");
          if (tourKith) {
            stage.selected = tourKith.id;
            stage.cam.flyTo(tourKith.x, tourKith.y, tourKith.z, 24);
            mind.voice(tourKith, true);
          }
        },
      },
      {
        at: 16500,
        run: () => {
          line("And they think.", "");
          if (tourKith && tourKith.alive) {
            const th = tourKith.thoughts[tourKith.thoughts.length - 1] ?? plainVoice(world, tourKith);
            // The first two sentences are enough to read in the time there is.
            say(tourKith.id, nameOf(world, tourKith.id), th.text.split(/(?<=[.!?])\s/).slice(0, 2).join(" "), "thought", 8000);
          }
        },
      },
      {
        at: 25500,
        run: () => {
          line("Now it is yours.", "Choose any kind and tap anywhere. Open any creature to see its mind.");
          deselect();
          stage.home(world);
        },
      },
      { at: 31000, run: endTour },
    ];
  }
  function endTour(): void {
    if (!touring) return;
    touring = false;
    beats = [];
    document.body.classList.remove("touring");
    $("intro").hidden = true;
    try {
      localStorage.setItem("eden.seen", "1");
    } catch {
      // Fine.
    }
    if (world.creatures.length === 0) showPicker(true);
  }
  $("intro-skip").addEventListener("click", endTour);

  /* ---------------- words on the land ---------------- */

  interface Bubble { id: number; el: HTMLElement; until: number; lift: number }
  const bubbles: Bubble[] = [];
  function say(id: number, name: string, text: string, cls: string, ms: number): void {
    const host = $("bubbles");
    for (let i = bubbles.length - 1; i >= 0; i--)
      if (bubbles[i].id === id) {
        bubbles[i].el.remove();
        bubbles.splice(i, 1);
      }
    const el = document.createElement("div");
    el.className = `bubble ${cls}`;
    const b = document.createElement("b");
    b.textContent = name;
    el.append(b, document.createTextNode(text));
    host.appendChild(el);
    bubbles.push({ id, el, until: performance.now() + ms, lift: 2.3 });
    if (bubbles.length > 4) (bubbles.shift() as Bubble).el.remove();
  }
  // Conversations play out line by line above the speakers.
  let talking: { talk: Talk; line: number; next: number } | null = null;
  const pendingTalks: Talk[] = [];
  mind.onTalk = (t) => {
    if (pendingTalks.length < 3) pendingTalks.push(t);
    panels.refresh();
  };
  let nextMurmur = 0;
  function words(now: number): void {
    if (!talking && pendingTalks.length) talking = { talk: pendingTalks.shift() as Talk, line: -1, next: 0 };
    if (talking && now > talking.next) {
      talking.line++;
      const l = talking.talk.lines[talking.line];
      if (!l) talking = null;
      else {
        const ms = 2000 + l.text.length * 45;
        talking.next = now + ms;
        if (stage.cam.dist < 120) say(l.who, nameOf(world, l.who), l.text, "", ms);
      }
    }
    // Close in, the nearby minds surface now and then: a thought from a kith, a feeling from a clever animal.
    if (now > nextMurmur && stage.cam.dist < 70 && !touring && !photo && speed <= 8) {
      nextMurmur = now + 5200;
      const near = world.creatures
        .filter((c) => SPECIES[c.sp].tier >= CLEVER && !c.avatar && c.id !== stage.selected && !bubbles.some((b) => b.id === c.id))
        .map((c) => ({ c, d: (c.x - stage.cam.tgt.x) ** 2 + (c.y - stage.cam.tgt.y) ** 2 + (c.z - stage.cam.tgt.z) ** 2 }))
        .filter((x) => x.d < 0.09 && stage.creatureOnScreen(x.c.id))
        .sort((a, b) => a.d - b.d)
        .slice(0, 6);
      const pickOne = near[Math.floor(Math.random() * near.length)]?.c;
      if (pickOne) {
        if (pickOne.sp === KITH) {
          const th = pickOne.thoughts[pickOne.thoughts.length - 1];
          if (th) say(pickOne.id, nameOf(world, pickOne.id), th.text.split(/(?<=[.!?])\s/)[0], "thought", 4800);
          else mind.voice(pickOne, false, 2);
        } else say(pickOne.id, SPECIES[pickOne.sp].one, impression(pickOne), "feel", 3600);
      }
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (now > b.until || !world.byId.has(b.id)) {
        b.el.remove();
        bubbles.splice(i, 1);
        continue;
      }
      const p = stage.creatureOnScreen(b.id, b.lift);
      if (p && !photo) {
        b.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
        b.el.style.visibility = "visible";
      } else b.el.style.visibility = "hidden";
    }
  }

  /* ---------------- happening now ---------------- */

  const seenPing = new Map<number, number>();
  const rings = new Map<number, HTMLElement>();
  const PING_TEXT: { [k: string]: string } = { birth: "A birth", death: "A death", hunt: "A hunt", talk: "Two kith are talking" };
  function pingText(p: Ping): string {
    if (p.news >= 0 && world.news[p.news]) return tellNews(world, world.news[p.news]);
    const c = p.who >= 0 ? who(world, p.who) : undefined;
    if (p.kind === "birth" && c) return `A ${SPECIES[c.sp].one} was born.`;
    if (p.kind === "talk" && c) return `${nameOf(world, c.id)} is talking with another.`;
    if (p.kind === "hunt" && c) return `A ${SPECIES[c.sp].one} made a kill.`;
    return (PING_TEXT[p.kind] ?? "Something happened") + ".";
  }
  function happening(now: number): void {
    const host = $("happening");
    for (const p of world.pings) if (!seenPing.has(p.id)) seenPing.set(p.id, now);
    const fresh = world.pings.filter((p) => now - (seenPing.get(p.id) ?? 0) < 45_000 && p.kind !== "arrive").slice(-4).reverse();
    const key = fresh.map((p) => p.id).join(",");
    if (host.dataset.key !== key) {
      host.dataset.key = key;
      host.innerHTML = "";
      for (const p of fresh) {
        const b = document.createElement("button");
        b.type = "button";
        const small = document.createElement("small");
        small.innerHTML = "<i></i>Happening now";
        b.append(small, document.createTextNode(pingText(p)));
        b.addEventListener("click", () => {
          const c = p.who >= 0 ? world.byId.get(p.who) : undefined;
          if (c) select(c.id);
          else {
            deselect();
            stage.cam.flyTo(p.x, p.y, p.z, 42);
          }
        });
        host.appendChild(b);
      }
    }
    // Rings on the globe for the last few seconds of events: only the newest few, and only from far enough to need them.
    const rhost = $("pings");
    const live = new Set<number>();
    if (!photo && !touring && stage.cam.dist >= 60) {
      for (const p of world.pings.slice(-8)) {
        if (now - (seenPing.get(p.id) ?? 0) > 9000) continue;
        const s = stage.toScreen(p.x, p.y, p.z, 1);
        if (!s) continue;
        live.add(p.id);
        let el = rings.get(p.id);
        if (!el) {
          el = document.createElement("div");
          el.className = `ping${p.kind === "hunt" || p.kind === "death" || p.kind === "kithDeath" || p.kind === "firstKill" ? " warm" : ""}`;
          rhost.appendChild(el);
          rings.set(p.id, el);
        }
        el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
      }
    }
    for (const [id, el] of rings)
      if (!live.has(id)) {
        el.remove();
        rings.delete(id);
      }
    if (seenPing.size > 400) for (const id of seenPing.keys()) if (!world.pings.some((p) => p.id === id)) seenPing.delete(id);
  }

  /* ---------------- the loop ---------------- */

  const TIMES = ["night", "dawn", "morning", "midday", "afternoon", "dusk", "evening", "night"];
  let last = performance.now();
  let acc = 0;
  let slowTick = 0;
  let stepCount = 0, stepTime = 0, statAt = performance.now();

  function hud(now: number): void {
    const day = Math.floor(world.t / DAY);
    const cam = stage.cam;
    let here = "";
    if (cam.dist < 140) {
      const wx = weatherAt(world, cam.tgt.x, cam.tgt.y, cam.tgt.z);
      const sun = sunAt(world, cam.tgt.x, cam.tgt.y, cam.tgt.z);
      // Local time of day from the sun's height and whether it is rising or setting here.
      const east = world.sunX * cam.right.x + world.sunY * cam.right.y + world.sunZ * cam.right.z;
      const rising = east * Math.cos(cam.az) > 0;
      const tod = sun < -0.15 ? "night" : sun < 0.12 ? (rising ? "dawn" : "dusk") : sun < 0.6 ? (rising ? "morning" : "afternoon") : "midday";
      const sky = wx.dry ? ", drought" : wx.rain > 0.25 ? (wx.temp < 1.5 ? ", snow" : ", rain") : "";
      here = ` · here: ${tod}, ${Math.round(wx.temp)}°${sky}`;
      void TIMES;
    }
    $("now").textContent = `Day ${day + 1} · ${SEASONS[world.season]} in the north${here} · ${world.creatures.length} alive`;
    if (!picker.hidden) for (const row of picker.querySelectorAll<HTMLElement>("[data-sp]")) (row.querySelector("small") as HTMLElement).textContent = `${world.counts[Number(row.dataset.sp)]} alive`;
    if (now - statAt > 1000) {
      panels.stats = { stepsPerSec: (stepCount * 1000) / (now - statAt), fps: stage.fps, stepMs: stepCount ? stepTime / stepCount : 0 };
      stepCount = 0;
      stepTime = 0;
      statAt = now;
    }
    const el = $("spend");
    if (params.has("clean")) el.hidden = true;
    else if (import.meta.env.DEV && mind.spend) {
      const s = mind.spend;
      el.hidden = false;
      el.textContent = `words: $${s.session.toFixed(4)} this session (limit $${s.sessionLimit.toFixed(2)}) · $${s.total.toFixed(4)} of $${s.totalLimit.toFixed(2)} in all · ${s.calls} calls · ${mind.ready ? "ready" : s.state === "ready" ? "limit reached" : s.state.replace("_", " ")}${debug ? ` · ${Math.round(stage.fps)} fps · ${Math.round(panels.stats.stepsPerSec)} steps/s` : ""}`;
    } else if (debug) {
      el.hidden = false;
      el.textContent = `${Math.round(stage.fps)} fps · ${Math.round(panels.stats.stepsPerSec)} steps/s`;
    }
  }

  function loop(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (touring) {
      while (beats.length && now - tourStart >= beats[0].at) (beats.shift() as Beat).run();
    }
    if (embodied) {
      steer();
      if (world.ctl.down) {
        embody(false);
        toast("You were struck down, and thrown out of that body.", 5200);
      }
    }
    // While you are typing to one of them, the world all but stands still.
    acc += dt * speed * (slow ? 0.06 : 1);
    // Step the world, but never spend more than a slice of the frame on it.
    const t0 = performance.now();
    const stop = t0 + 8;
    let n = 0;
    while (acc >= DT) {
      step(world);
      acc -= DT;
      n++;
      if (performance.now() > stop) {
        acc = 0;
        break;
      }
    }
    stepCount += n;
    stepTime += performance.now() - t0;
    mind.pump(now);
    if (shownIdea) stage.setLinks(shownIdea.edges.slice(-24).map((e) => [e.a, e.b] as [number, number]));
    stage.frame(world, dt);

    // A name above whoever is followed.
    const tag = $("tag");
    const sel = stage.selected >= 0 ? world.byId.get(stage.selected) : undefined;
    if (stage.selected >= 0 && !sel) stage.selected = -1;
    const sp = sel ? stage.creatureOnScreen(sel.id, SPECIES[sel.sp].air ? 1.2 : 1.9) : null;
    if (sel && sp && !photo && !bubbles.some((b) => b.id === sel.id)) {
      tag.hidden = false;
      tag.textContent = sel.name ?? SPECIES[sel.sp].one;
      tag.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y)}px) translate(-50%, -100%)`;
    } else tag.hidden = true;

    words(now);
    if (now - slowTick > 160) {
      slowTick = now;
      if (embodied) {
        // Who is near enough to talk to.
        const me = world.byId.get(world.avatarId);
        nearKith = -1;
        let best = 4.6 / 90;
        if (me)
          for (const c of world.creatures) {
            if (c.sp !== KITH || c.avatar) continue;
            const d = Math.hypot(c.x - me.x, c.y - me.y, c.z - me.z);
            if (d < best) {
              best = d;
              nearKith = c.id;
            }
          }
        const btn = $("interact");
        btn.hidden = nearKith < 0 || chatWith >= 0;
        if (nearKith >= 0) btn.innerHTML = `<b>E</b>Talk to ${nameOf(world, nearKith).replace(/[<>&]/g, "")}`;
        if (chatWith >= 0 && !world.byId.has(chatWith)) closeChat();
      }
      hud(now);
      happening(now);
      panels.refresh();
      const cam = stage.cam;
      const k = world.terrain.kind[cellOf(cam.tgt.x, cam.tgt.y, cam.tgt.z)];
      const wet = k === SEA || k === SHALLOW || k === LAKE || k === RIVER ? 1 : Math.max(0, 1 - world.terrain.freshDist[cellOf(cam.tgt.x, cam.tgt.y, cam.tgt.z)] / 14);
      const wx = weatherAt(world, cam.tgt.x, cam.tgt.y, cam.tgt.z);
      const night = Math.max(0, Math.min(1, (0.12 - sunAt(world, cam.tgt.x, cam.tgt.y, cam.tgt.z)) / 0.32));
      sound.update(cam.inAir > 0.3 ? night : 0, wx.rain * cam.inAir, wet, cam.inAir, wx.temp < 2);
      if (now - lastSave > 20_000) save();
    }
    requestAnimationFrame(loop);
  }

  arm(null);
  void mind.init();
  if (debug) Object.assign(window, { __eden: { world, stage, mind, panels, select, setSpeed, arm, place, save, endTour } });
  let seen = false;
  try {
    seen = !!localStorage.getItem("eden.seen");
  } catch {
    seen = false;
  }
  if (saved) toast(`Welcome back. Your planet is as you left it: day ${Math.floor(world.t / DAY) + 1}, ${world.creatures.length} alive.`, 4600);
  if (params.has("tour") || (!saved && !seen && !params.has("notour"))) startTour();
  else if (world.creatures.length === 0 && !params.has("notour")) showPicker(true);
  requestAnimationFrame(loop);
}

void boot();
