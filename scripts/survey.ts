// Runs several seeds headless and prints each kind's lowest, highest and final numbers.
import { DAY, DT, SPECIES, createWorld, seedLife, step } from "../src/engine";
const days = Number(process.argv[2] ?? 36);
const seeds = (process.argv[3] ?? "1,2,3").split(",").map(Number);
for (const seed of seeds) {
  const w = createWorld(seed);
  seedLife(w);
  const lo = [1e9, 1e9, 1e9, 1e9], hi = [0, 0, 0, 0];
  const series: string[] = [];
  const t0 = Date.now();
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < DAY / DT; i++) step(w);
    for (let s = 0; s < 4; s++) {
      lo[s] = Math.min(lo[s], w.counts[s]);
      hi[s] = Math.max(hi[s], w.counts[s]);
    }
    if (d % 4 === 0) series.push(w.counts.join("/"));
  }
  const causes: Record<string, number> = {};
  for (const c of w.gone.values()) causes[`${SPECIES[c.sp].key[0]}:${c.cause}`] = (causes[`${SPECIES[c.sp].key[0]}:${c.cause}`] ?? 0) + 1;
  console.log(`seed ${seed} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${series.join("  ")}\n   lo ${lo.join("/")} hi ${hi.join("/")} births ${w.births} ideas ${w.ideas.length} fires ${w.fires.length} huts ${w.shelters.length} ${JSON.stringify(causes).replace(/"/g, "")}`);
}
