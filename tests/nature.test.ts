import { describe, expect, it } from "vitest";
import {
  CELLS, DT, KITH, applyAnswer, createWorld, grid, kithFacts, mannerOf, natureWords, place, step, takeAvatar,
  type Creature, type World,
} from "../src/engine";
import { FOREST } from "../src/engine/terrain";

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

describe("each kith's own nature", () => {
  it("differs from one to the next, and is told to the model with its way of speaking and its mood", () => {
    const w = createWorld(3);
    const ks = band(w, 12, wood(w));
    const told = new Set(ks.map((k) => natureWords(k).join("|") + mannerOf(k)));
    expect(told.size).toBeGreaterThan(6);
    const f = kithFacts(w, ks[0]);
    expect(f.nature.length).toBeGreaterThanOrEqual(4);
    expect(f.way_of_speaking.length).toBeGreaterThan(8);
    expect(f.mood.length).toBeGreaterThan(3);
  });

  it("decides for itself whether to follow when asked, with no model to decide for it", () => {
    const w = createWorld(3);
    const at = wood(w);
    const [proud, meek] = band(w, 2, at);
    takeAvatar(w, ...at);
    proud.nature = { temper: 0.5, trust: 0.2, pride: 0.9, warmth: 0.5 };
    meek.nature = { temper: 0.3, trust: 0.8, pride: 0.1, warmth: 0.6 };
    proud.stance = meek.stance = 1;
    const no = applyAnswer(w, proud, "follow me", null);
    const yes = applyAnswer(w, meek, "follow me", null);
    expect(proud.stance).not.toBe(4);
    expect(meek.stance).toBe(4);
    expect(no).not.toBe(yes);
    // Told to stay, the one that came stops following.
    applyAnswer(w, meek, "stay here", null);
    expect(meek.stance).toBe(1);
  });

  it("is moved by how the stranger treats it, within bounds, and a refusal ends its following", () => {
    const w = createWorld(3);
    const at = wood(w);
    const [k] = band(w, 1, at);
    takeAvatar(w, ...at);
    const trust = k.nature.trust;
    applyAnswer(w, k, "here is food for you", { says: "You give and ask nothing?", does: "follow", regard: 0.3 });
    expect(k.regard).toBeCloseTo(0.3, 5);
    expect(k.nature.trust).toBeGreaterThan(trust);
    expect(k.stance).toBe(4);
    applyAnswer(w, k, "kneel", { says: "I kneel to nothing.", does: "refuse", regard: -99 });
    expect(k.regard).toBeCloseTo(-0.1, 5);
    expect(k.stance).toBe(1);
  });

  it("stops and faces the visitor while being spoken to", () => {
    const w = createWorld(3);
    const at = wood(w);
    const [k] = band(w, 1, at);
    const me = takeAvatar(w, ...at) as Creature;
    w.ctl.talkTo = k.id;
    for (let i = 0; i < 2 / DT; i++) step(w);
    const d = me.x * k.x + me.y * k.y + me.z * k.z;
    const fx = me.x - k.x * d, fy = me.y - k.y * d, fz = me.z - k.z * d;
    const fl = Math.hypot(fx, fy, fz);
    if (fl > 1e-4) expect((k.hx * fx + k.hy * fy + k.hz * fz) / fl).toBeGreaterThan(0.9);
    expect(k.pace).toBe(0);
  });
});
