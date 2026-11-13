// Headless run: prints the population every few days. `npx tsx scripts/run.ts [seed] [days]`
import { DAY, DT, createWorld, seedLife, step, totalEnergy, SPECIES } from "../src/engine";

const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 40);
const w = createWorld(seed);
seedLife(w);
const t0 = Date.now();
const per = Math.round(DAY / DT);
for (let d = 1; d <= days; d++) {
  for (let i = 0; i < per; i++) step(w);
  if (d % 2 === 0 || d === days) {
    const gens = [0, 1, 2, 3].map((sp) => Math.max(0, ...w.creatures.filter((c) => c.sp === sp).map((c) => c.gen)));
    let g = 0;
    for (const v of w.grass) g += v;
    const l = w.ledger;
    const drift = totalEnergy(w) - (l.given + l.grown - l.burned - l.lost);
    console.log(
      `day ${String(d).padStart(3)} s${w.season} ${SPECIES.map((s, i) => `${s.key} ${String(w.counts[i]).padStart(3)} g${gens[i]}`).join("  ")}  grass ${g.toFixed(0)} wet ${w.wet.toFixed(2)} T ${w.temp.toFixed(0)} fires ${w.fires.length} huts ${w.shelters.filter((s) => s.done).length} ideas ${w.ideas.length} drift ${drift.toFixed(3)}`,
    );
  }
}
const causes: Record<string, number> = {};
for (const c of w.gone.values()) causes[`${SPECIES[c.sp].key}:${c.cause}`] = (causes[`${SPECIES[c.sp].key}:${c.cause}`] ?? 0) + 1;
console.log(causes);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s, births ${w.births}, deaths ${w.deaths}, news ${w.news.length}`);
