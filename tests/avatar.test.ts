import { describe, expect, it } from "vitest";
import {
  CELLS, DAY, DT, KITH, applyAnswer, applyReact, createWorld, dropFood, grid, leaveAvatar, place, step, suspectWords, takeAvatar, totalEnergy,
  type Creature, type World,
} from "../src/engine";
import { FOREST } from "../src/engine/terrain";

const run = (w: World, days: number): void => {
  for (let i = 0; i < (days * DAY) / DT; i++) step(w);
};

function wood(w: World): [number, number, number] {
  const g = grid();
  const t = w.terrain;
  for (let k = 0; k < 40000; k++) {
    const i = (Math.imul(k + 7919, 2654435761) >>> 0) % CELLS;
    if (t.kind[i] === FOREST && t.temp[i] > 13 && t.temp[i] < 26 && t.freshDist[i] < 14) return [g.cx[i], g.cy[i], g.cz[i]];
  }
  throw new Error("no wood");
}

function band(w: World, n: number, at: [number, number, number]): Creature[] {
  const out: Creature[] = [];
  for (let k = 0; k < n; k++) {
    const c = place(w, KITH, at[0] + w.rng.range(-0.02, 0.02), at[1] + w.rng.range(-0.02, 0.02), at[2] + w.rng.range(-0.02, 0.02), 0.7);
    if (c) out.push(c);
  }
  return out;
}

describe("the visitor's own body", () => {
  it("goes where it is steered, needs nothing, and leaves the energy books balanced when it goes", () => {
    const w = createWorld(3);
    const at = wood(w);
    const me = takeAvatar(w, ...at) as Creature;
    expect(me.avatar).toBe(true);
    expect(takeAvatar(w, ...at)).toBeNull(); // one body at a time
    const start = [me.x, me.y, me.z];
    w.ctl.x = me.hx;
    w.ctl.y = me.hy;
    w.ctl.z = me.hz;
    run(w, 0.1);
    const moved = Math.acos(Math.min(1, me.x * start[0] + me.y * start[1] + me.z * start[2])) * 90;
    expect(moved).toBeGreaterThan(10);
    expect(me.energy).toBeGreaterThan(50);
    leaveAvatar(w);
    expect(w.avatarId).toBe(-1);
    expect(w.creatures.includes(me)).toBe(false);
    const l = w.ledger;
    expect(Math.abs(totalEnergy(w) - (l.given + l.grown - l.burned - l.lost))).toBeLessThan(1e-3);
  });

  it("is seen: each kith nearby remembers it and decides for itself how to take it", () => {
    const w = createWorld(3);
    const at = wood(w);
    const kith = band(w, 12, at);
    takeAvatar(w, ...at);
    run(w, 0.05);
    const met = kith.filter((c) => c.metAvatar);
    expect(met.length).toBeGreaterThan(6);
    expect(met.every((c) => c.log.some((e) => e.k === "sawGlow"))).toBe(true);
    // They do not all take it the same way.
    expect(new Set(met.map((c) => c.stance)).size).toBeGreaterThan(1);
    expect(w.news.some((n) => n.kind === "firstSight")).toBe(true);
  });

  it("cannot be killed: struck down, the visitor is thrown out instead", () => {
    const w = createWorld(3);
    const at = wood(w);
    const kith = band(w, 10, at);
    const me = takeAvatar(w, ...at) as Creature;
    for (const c of kith) {
      c.metAvatar = true;
      c.stance = 3; // every one of them set against it
    }
    for (let i = 0; i < (0.4 * DAY) / DT && !w.ctl.down; i++) step(w);
    expect(w.ctl.down).toBe(true);
    expect(me.alive).toBe(true);
    expect(kith.some((c) => c.log.some((e) => e.k === "struckGlow"))).toBe(true);
  });
});

describe("talking with them", () => {
  it("what the visitor says can become a belief, and the kith answers plainly when there is no model", () => {
    const w = createWorld(3);
    const at = wood(w);
    const [k] = band(w, 1, at);
    takeAvatar(w, ...at);
    expect(applyAnswer(w, k, "hello", null).length).toBeGreaterThan(3);
    const before = k.suspect;
    const reply = applyAnswer(w, k, "the high rock is not safe", {
      says: "Then I will not climb it.", does: "follow", believes: { kind: "danger", place_id: 0, text: "The shining one says the high ground bites." }, suspect: 0.2,
    });
    expect(reply).toBe("Then I will not climb it.");
    expect(k.stance).toBe(4);
    expect(k.beliefs.some((h) => w.ideas[h.idea].place === 0 && w.ideas[h.idea].kind === "danger")).toBe(true);
    expect(k.suspect).toBeCloseTo(before + 0.2, 5);
    expect(w.chat.filter((m) => m.who === k.id).length).toBe(4);
    // Whatever the model returns, suspicion moves by a bounded amount.
    applyAnswer(w, k, "x", { says: "?", suspect: 99 });
    expect(k.suspect).toBeLessThanOrEqual(1);
  });

  it("lets the model choose how a kith takes the stranger, and what its people call it", () => {
    const w = createWorld(3);
    const at = wood(w);
    const [k] = band(w, 1, at);
    takeAvatar(w, ...at);
    expect(applyReact(w, k, { feels: "It shines and it has no mother.", does: "flee", says: "", calls_it: "Oru" })).toBe("");
    expect(k.stance).toBe(2);
    expect(w.avatarName).toBe("Oru");
    applyReact(w, k, { does: "nonsense" });
    expect([1, 2]).toContain(k.stance);
  });
});

describe("suspicion", () => {
  it("starts at nothing and rises with things that come out of the sky, up to a point", () => {
    const w = createWorld(3);
    const at = wood(w);
    const [k] = band(w, 1, at);
    expect(k.suspect).toBe(0);
    for (let i = 0; i < 40; i++) dropFood(w, at[0], at[1], at[2]);
    expect(k.suspect).toBeGreaterThan(0.3);
    expect(k.suspect).toBeLessThanOrEqual(0.52);
    expect(k.log.some((e) => e.k === "skyFood")).toBe(true);
  });

  it("is passed from those who hold more of it to those who hold less", () => {
    const w = createWorld(3);
    const at = wood(w);
    const kith = band(w, 10, at);
    kith[0].suspect = 0.9;
    run(w, 3);
    const others = w.creatures.filter((c) => c.sp === KITH && c.id !== kith[0].id);
    expect(Math.max(...others.map((c) => c.suspect))).toBeGreaterThan(0.1);
    expect(w.news.some((n) => n.kind === "suspects")).toBe(true);
  }, 60_000);

  it("has words for every level", () => {
    expect(suspectWords(0)).toMatch(/none/);
    expect(suspectWords(0.95)).toMatch(/certain/);
  });
});
