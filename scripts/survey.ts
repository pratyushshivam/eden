// Runs planets headless and prints how each kind does. `npx tsx scripts/survey.ts [days] [seeds]`
// Creatures are set down the way a visitor might: a few groups of each kind on suitable ground.
import { CELLS, DAY, DT, KITH, N_SPECIES, SPECIES, createWorld, grid, place, step, totalEnergy, type Species, type World } from "../src/engine";
import { FOREST, JUNGLE, PLAINS, SHALLOW } from "../src/engine/terrain";

/** Sets down groups of every kind near the first good spot found for each. */
export function populate(w: World, groups = 2): void {
  const g = grid();
  const t = w.terrain;
  const pick = (ok: (i: number) => boolean, salt: number): number => {
    for (let tries = 0; tries < 20000; tries++) {
      const i = (Math.imul(tries + salt * 7919, 2654435761) >>> 0) % CELLS;
      if (ok(i)) return i;
    }
    return -1;
  };
  const drop = (sp: Species, n: number, cell: number): void => {
    if (cell < 0) return;
    for (let k = 0; k < n; k++) {
      const j = 0.035;
      place(w, sp, g.cx[cell] + w.rng.range(-j, j), g.cy[cell] + w.rng.range(-j, j), g.cz[cell] + w.rng.range(-j, j), w.rng.range(0.45, 0.9));
    }
  };
  const mild = (i: number): boolean => t.temp[i] > 12 && t.temp[i] < 27 && t.freshDist[i] < 25;
  for (let q = 0; q < groups; q++) {
    const meadow = pick((i) => t.kind[i] === PLAINS && mild(i) && t.fert[i] > 0.6, q + 1);
    drop(0, 24, meadow);
    drop(1, 4, pick((i) => t.kind[i] === PLAINS && meadow >= 0 && g.cx[i] * g.cx[meadow] + g.cy[i] * g.cy[meadow] + g.cz[i] * g.cz[meadow] > 0.985 && i !== meadow, q + 11));
    drop(2, 8, pick((i) => t.kind[i] === SHALLOW && t.temp[i] > 8, q + 21));
    drop(3, 10, pick((i) => t.kind[i] === SHALLOW && t.temp[i] > 8, q + 31));
    drop(4, 8, pick((i) => (t.kind[i] === FOREST || t.kind[i] === JUNGLE) && mild(i), q + 41));
    drop(5, 6, pick((i) => t.kind[i] === PLAINS && mild(i), q + 51));
    drop(KITH, 10, pick((i) => t.kind[i] === FOREST && mild(i) && t.freshDist[i] < 10, q + 61));
  }
}

if (process.argv[1]?.includes("survey")) {
  const days = Number(process.argv[2] ?? 30);
  for (const seed of (process.argv[3] ?? "1,2").split(",").map(Number)) {
    const w = createWorld(seed);
    populate(w);
    const t0 = Date.now();
    const series: string[] = [];
    for (let d = 1; d <= days; d++) {
      for (let i = 0; i < DAY / DT; i++) step(w);
      if (d % 5 === 0 || d === days) series.push(`d${d} ${w.counts.join("/")}`);
    }
    const causes: { [k: string]: number } = {};
    for (const c of w.gone.values()) causes[`${SPECIES[c.sp].key.slice(0, 2)}:${c.cause}`] = (causes[`${SPECIES[c.sp].key.slice(0, 2)}:${c.cause}`] ?? 0) + 1;
    const l = w.ledger;
    const secs = (Date.now() - t0) / 1000;
    console.log(`seed ${seed}: ${SPECIES.map((s) => s.key).join("/")}  ${secs.toFixed(0)}s (${Math.round((days * DAY) / DT / secs)} steps/s)`);
    console.log("  " + series.join("  "));
    console.log(`  births ${w.births} deaths ${w.deaths} ideas ${w.ideas.length} crafts ${w.ideas.filter((i) => i.kind === "craft").map((i) => i.text).join(", ") || "none"} fires ${w.fires.length} huts ${w.shelters.length} drift ${(totalEnergy(w) - (l.given + l.grown - l.burned - l.lost)).toFixed(2)}`);
    console.log("  " + JSON.stringify(causes).replace(/"/g, ""));
    void N_SPECIES;
  }
}
