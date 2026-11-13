// Prints what a seed's planet is made of. `npx tsx scripts/planet.ts [seeds]`
import { KIND_NAMES, makeTerrain } from "../src/engine/terrain";
import { CELLS } from "../src/engine/sphere";

for (const seed of (process.argv[2] ?? "1,2,3").split(",").map(Number)) {
  const t0 = Date.now();
  const t = makeTerrain(seed);
  const n = new Array(12).fill(0);
  for (let i = 0; i < CELLS; i++) n[t.kind[i]]++;
  console.log(`seed ${seed} (${Date.now() - t0} ms): ` + KIND_NAMES.map((k, i) => `${k} ${((n[i] / CELLS) * 100).toFixed(1)}%`).join(", "));
  console.log(`  lands ${t.lands.length} (${t.lands.filter((l) => l.cells > 40).map((l) => `${l.desc} ${l.cells}`).join("; ")})`);
  console.log(`  rivers ${t.rivers.length}, trees ${t.trees.length}, bushes ${t.bushes.length}, rocks ${t.rocks.length}, fish cells ${t.fishCells.length}, places ${t.places.length}`);
  console.log("  " + t.places.map((p) => p.desc).join(" | "));
}
