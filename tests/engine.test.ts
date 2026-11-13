import { describe, expect, it } from "vitest";
import {
  CELLS, CRAFTS, C_RAFT, DAPPLE, DAY, DT, HIDDEN, KITH, M, MAX_CREATURES, MURR, MUTATION_RATE, N_SPECIES, Rng, SPECIES, applyMeeting, brainDistance, canStand,
  cellOf, coinName, craftOptions, createWorld, discover, fingerprint, founderBrain, genomeSize, giveName, grid, hold, impression, inherit, makeIdea, makeTerrain,
  place, plainMeeting, randomBrain, step, tell, totalEnergy, type Creature, type Species, type World,
} from "../src/engine";
import { FOREST, PLAINS, SEA } from "../src/engine/terrain";
import { populate } from "../scripts/survey";

const run = (w: World, days: number): void => {
  for (let i = 0; i < (days * DAY) / DT; i++) step(w);
};

/** The first cell of a kind that is mild and near water: a fair place to set things down. */
function spot(w: World, kind: number, salt = 1): [number, number, number] {
  const g = grid();
  const t = w.terrain;
  for (let k = 0; k < 40000; k++) {
    const i = (Math.imul(k + salt * 7919, 2654435761) >>> 0) % CELLS;
    if (t.kind[i] === kind && t.temp[i] > 13 && t.temp[i] < 26 && t.freshDist[i] < 14) return [g.cx[i], g.cy[i], g.cz[i]];
  }
  throw new Error("no such place on this planet");
}

function drop(w: World, sp: Species, n: number, at: [number, number, number], spread = 0.03): Creature[] {
  const out: Creature[] = [];
  for (let k = 0; k < n; k++) {
    const c = place(w, sp, at[0] + w.rng.range(-spread, spread), at[1] + w.rng.range(-spread, spread), at[2] + w.rng.range(-spread, spread), 0.7);
    if (c) out.push(c);
  }
  return out;
}

describe("the planet", () => {
  it("is the same for the same seed and different for another", () => {
    const a = makeTerrain(7), b = makeTerrain(7), c = makeTerrain(8);
    expect(Array.from(a.height.slice(0, 2000))).toEqual(Array.from(b.height.slice(0, 2000)));
    expect(a.places.map((p) => p.desc)).toEqual(b.places.map((p) => p.desc));
    expect(Array.from(a.kind)).not.toEqual(Array.from(c.kind));
  });

  it("has land and sea, several landmasses, rivers, and every cell reachable by the grid", () => {
    const t = makeTerrain(3);
    let land = 0;
    for (let i = 0; i < CELLS; i++) if (t.height[i] > 0) land++;
    expect(land / CELLS).toBeGreaterThan(0.25);
    expect(land / CELLS).toBeLessThan(0.45);
    expect(t.lands.filter((l) => l.cells > 200).length).toBeGreaterThanOrEqual(2);
    expect(t.rivers.length).toBeGreaterThan(5);
    const g = grid();
    for (let i = 0; i < CELLS; i += 97) expect(cellOf(g.cx[i], g.cy[i], g.cz[i])).toBe(i);
  });
});

describe("the simulation", () => {
  it("gives the same history for the same seed and the same actions", () => {
    const a = createWorld(11), b = createWorld(11);
    populate(a, 1);
    populate(b, 1);
    run(a, 2);
    run(b, 2);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.news.map((n) => n.kind)).toEqual(b.news.map((n) => n.kind));
    const c = createWorld(12);
    populate(c, 1);
    run(c, 2);
    expect(fingerprint(c)).not.toBe(fingerprint(a));
  }, 60_000);

  it("keeps its energy books: everything that exists was given or grown, minus what was burned or lost", () => {
    const w = createWorld(5);
    populate(w, 1);
    run(w, 4);
    const l = w.ledger;
    const expected = l.given + l.grown - l.burned - l.lost;
    expect(Math.abs(totalEnergy(w) - expected)).toBeLessThan(expected * 1e-6);
    expect(w.births).toBeGreaterThan(0);
    expect(l.burned).toBeGreaterThan(0);
  }, 60_000);

  it("carries on unchanged from a saved copy", () => {
    const w = createWorld(21);
    populate(w, 1);
    run(w, 1);
    // What the page stores: everything but the land, with the random generator's state.
    const snap = structuredClone({ ...w, terrain: null, buckets: null, rng: w.rng.save() });
    const back = createWorld(21);
    const { terrain, rng, buckets } = back;
    Object.assign(back, snap, { terrain, rng, buckets });
    rng.restore(snap.rng);
    run(w, 1);
    run(back, 1);
    expect(fingerprint(back)).toBe(fingerprint(w));
  }, 60_000);

  it("keeps populations alive and within bounds over a long run, on more than one planet", () => {
    for (const seed of [1, 2]) {
      const w = createWorld(seed);
      populate(w);
      let peak = 0;
      for (let d = 0; d < 25; d++) {
        run(w, 1);
        peak = Math.max(peak, w.creatures.length);
      }
      expect(peak).toBeLessThanOrEqual(MAX_CREATURES);
      expect(w.creatures.length).toBeGreaterThan(60);
      // Most kinds are still there after 25 days, and several are many generations deep.
      expect(w.counts.filter((n) => n > 0).length).toBeGreaterThanOrEqual(4);
      expect(w.counts[KITH]).toBeGreaterThan(0);
      expect(Math.max(...w.creatures.map((c) => c.gen))).toBeGreaterThanOrEqual(5);
    }
  }, 300_000);
});

describe("brains", () => {
  it("come in three sizes, one per tier of mind", () => {
    for (let sp = 0; sp < N_SPECIES; sp++) expect(founderBrain(sp as Species, new Rng(1)).length).toBe(genomeSize(HIDDEN[SPECIES[sp].tier]));
    expect(genomeSize(HIDDEN[0])).toBeLessThan(genomeSize(HIDDEN[1]));
    expect(genomeSize(HIDDEN[1])).toBeLessThan(genomeSize(HIDDEN[2]));
  });

  it("are inherited: every weight of a child comes from one parent, and a few are nudged", () => {
    const rng = new Rng(4);
    const a = founderBrain(KITH, rng), b = founderBrain(KITH, rng);
    const child = inherit(a, b, rng);
    let fromA = 0, fromB = 0, nudged = 0;
    for (let i = 0; i < child.length; i++) {
      if (child[i] === a[i]) fromA++;
      else if (child[i] === b[i]) fromB++;
      else nudged++;
    }
    expect(fromA).toBeGreaterThan(child.length * 0.2);
    expect(fromB).toBeGreaterThan(child.length * 0.2);
    expect(nudged / child.length).toBeGreaterThan(MUTATION_RATE * 0.5);
    expect(nudged / child.length).toBeLessThan(MUTATION_RATE * 1.8);
    expect(brainDistance(child, a)).toBeLessThan(brainDistance(a, randomBrain(KITH, rng)));
  });

  it("in the world, a child's brain is nearer its parents' than a stranger's", () => {
    const w = createWorld(9);
    populate(w, 1);
    run(w, 5);
    const kids = w.creatures.filter((c) => c.mother >= 0 && w.byId.has(c.mother) && w.byId.has(c.father));
    expect(kids.length).toBeGreaterThan(3);
    for (const k of kids.slice(0, 8)) {
      const m = w.byId.get(k.mother) as Creature;
      const other = w.creatures.find((c) => c.sp === k.sp && c.root !== k.root && c.id !== k.id);
      if (other) expect(brainDistance(k.brain, m.brain)).toBeLessThan(brainDistance(k.brain, other.brain) + 0.02);
    }
  }, 60_000);

  it("that have been through many generations outlive brains of pure noise", () => {
    // Evolve dapples for a while, then put their descendants' brains against random ones on fresh ground.
    const w = createWorld(1);
    const meadow = spot(w, PLAINS, 3);
    drop(w, DAPPLE, 30, meadow);
    run(w, 30);
    const evolved = w.creatures.filter((c) => c.sp === DAPPLE && c.gen >= 3).map((c) => c.brain);
    expect(evolved.length).toBeGreaterThan(8);
    const trial = (brains: (i: number) => Float32Array): number => {
      const t = createWorld(1);
      const cs = drop(t, DAPPLE, 24, meadow);
      cs.forEach((c, i) => {
        c.brain = brains(i);
        c.mateCd = 1e9; // survival only: no children in the trial
      });
      const ids = new Set(cs.map((c) => c.id));
      let alive = 0;
      for (let d = 0; d < 6; d++) {
        run(t, 1);
        alive += t.creatures.filter((c) => ids.has(c.id)).length;
      }
      return alive / (6 * cs.length);
    };
    const r = new Rng(77);
    const noise = trial(() => randomBrain(DAPPLE, r));
    const bred = trial((i) => evolved[i % evolved.length]);
    expect(bred).toBeGreaterThan(noise + 0.2);
    expect(bred).toBeGreaterThan(0.6);
  }, 300_000);
});

describe("beliefs and talk", () => {
  it("pass from one kith to another and are recorded as a telling", () => {
    const w = createWorld(2);
    const [a, b] = drop(w, KITH, 2, spot(w, FOREST));
    const idea = makeIdea(w, "danger", 0, -1, a.id);
    hold(w, a, idea, 0.9, -1);
    const got = tell(w, a, b);
    expect(got).not.toBeNull();
    expect(b.beliefs.length).toBe(1);
    expect((got as { edges: unknown[] }).edges.length).toBe(1);
    expect(b.log.some((e) => e.k === "heard")).toBe(true);
  });

  it("change where the believers go: those told a place is dangerous spend less time there", () => {
    const w = createWorld(2);
    const home = spot(w, FOREST, 2);
    const p = w.terrain.places.reduce((best, q) => (q.x * home[0] + q.y * home[1] + q.z * home[2] > best.x * home[0] + best.y * home[1] + best.z * home[2] ? q : best));
    const at: [number, number, number] = [p.x, p.y, p.z];
    const kith = drop(w, KITH, 24, at, 0.05);
    const idea = makeIdea(w, "danger", p.id, -1, kith[0].id);
    const believers = new Set<number>();
    kith.forEach((c, i) => {
      c.mateCd = 1e9;
      if (i % 2 === 0) {
        hold(w, c, idea, 1, -1);
        believers.add(c.id);
      }
    });
    let inB = 0, totB = 0, inO = 0, totO = 0;
    for (let s = 0; s < (3 * DAY) / DT; s++) {
      step(w);
      if (s % 40) continue;
      for (const c of w.creatures) {
        if (c.sp !== KITH || c.mother >= 0) continue;
        const inside = Math.acos(Math.min(1, c.x * p.x + c.y * p.y + c.z * p.z)) * 90 < p.r ? 1 : 0;
        // Keep the belief from fading or spreading, so the two groups stay distinct for the test.
        if (believers.has(c.id)) {
          inB += inside;
          totB++;
          if (!c.beliefs.some((h) => h.idea === idea.id)) hold(w, c, idea, 1, -1);
          else c.beliefs[0].s = 1;
        } else {
          inO += inside;
          totO++;
          c.beliefs = c.beliefs.filter((h) => h.idea !== idea.id);
        }
        c.talkCd = 1e9;
      }
    }
    expect(totB).toBeGreaterThan(500);
    expect(inB / totB).toBeLessThan((inO / totO) * 0.75);
  }, 120_000);

  it("a mistelling makes a new, wrong idea that descends from the true one", () => {
    const w = createWorld(2);
    const [a, b] = drop(w, KITH, 2, spot(w, FOREST));
    a.seen = b.seen = 0xffff;
    const idea = makeIdea(w, "danger", 1, -1, a.id);
    hold(w, a, idea, 0.9, -1);
    const talk = applyMeeting(w, { id: 1, a: a.id, b: b.id, t: w.t }, {
      lines: [{ who: "a", text: "Keep away from there." }, { who: "b", text: "I will." }],
      told: [{ by: "a", ref: "a1", place_id: 2, text: "The other place bites." }],
    });
    expect(talk?.ideas.length).toBe(1);
    const wrong = w.ideas[talk?.ideas[0] as number];
    expect(wrong.place).toBe(2);
    expect(wrong.from).toBe(idea.id);
    expect(b.beliefs[0].idea).toBe(wrong.id);
  });

  it("settles a meeting in plain words when there is no model", () => {
    const w = createWorld(2);
    const [a, b] = drop(w, KITH, 2, spot(w, FOREST));
    hold(w, a, makeIdea(w, "good", 0, -1, a.id), 0.8, -1);
    const talk = plainMeeting(w, { id: 1, a: a.id, b: b.id, t: w.t });
    expect(talk?.by).toBe("plain");
    expect(b.beliefs.length + a.beliefs.length).toBe(2);
  });

  it("gives every name once", () => {
    const w = createWorld(2);
    const ks = drop(w, KITH, 12, spot(w, FOREST));
    for (const k of ks) expect(giveName(w, k, coinName(w, k.id))).toBe(true);
    expect(new Set(ks.map((k) => k.name)).size).toBe(12);
    expect(giveName(w, ks[0], "Other")).toBe(false);
  });

  it("puts a clever animal's feelings into plain words read from its network, with no model", () => {
    const w = createWorld(2);
    const [m] = drop(w, MURR, 1, spot(w, FOREST));
    run(w, 0.2);
    expect(impression(m).length).toBeGreaterThan(3);
    expect(impression(drop(w, DAPPLE, 1, spot(w, PLAINS))[0])).toBe("");
  });
});

describe("making things", () => {
  it("needs the right materials in hand, and nothing is known at the start", () => {
    const w = createWorld(2);
    const [k] = drop(w, KITH, 1, spot(w, FOREST));
    expect(k.knows).toBe(0);
    expect(craftOptions(k)).toEqual([]);
    k.handled = M.wood | M.fibre;
    expect(craftOptions(k).map((i) => CRAFTS[i].plain)).toEqual(["a carrying basket"]);
    expect(discover(w, k, C_RAFT)).toBeNull(); // a raft needs the basket first
  });

  it("is real: a kith that has made a raft can go where it could not", () => {
    const w = createWorld(2);
    const [k] = drop(w, KITH, 1, spot(w, FOREST));
    const g = grid();
    let sea = 0;
    while (w.terrain.kind[sea] !== SEA) sea++;
    expect(canStand(w, k, g.cx[sea], g.cy[sea], g.cz[sea])).toBe(false);
    k.handled = M.wood | M.fibre;
    expect(discover(w, k, 2, "wef")?.text).toBe("wef");
    expect(discover(w, k, C_RAFT)).not.toBeNull();
    expect(canStand(w, k, g.cx[sea], g.cy[sea], g.cz[sea])).toBe(true);
    expect(w.news.some((n) => n.kind === "invented")).toBe(true);
  });

  it("is passed on by showing, and kept under the name its maker gave it", () => {
    const w = createWorld(2);
    const [a, b] = drop(w, KITH, 2, spot(w, FOREST));
    a.handled = M.clay | M.fire;
    const idea = discover(w, a, 4, "olu");
    expect(idea).not.toBeNull();
    expect(tell(w, a, b)?.id).toBe(idea?.id);
    expect(b.knows & (1 << 4)).toBeTruthy();
    expect(b.log.some((e) => e.k === "learned")).toBe(true);
  });

  it("appears on its own over a long run", () => {
    const w = createWorld(1);
    populate(w, 1);
    run(w, 20);
    expect(w.ideas.filter((i) => i.kind === "craft").length).toBeGreaterThan(0);
  }, 120_000);
});
