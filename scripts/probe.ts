// Diagnostics: what the creatures of each kind are doing and feeling, day by day.
import { DAY, DT, IN, OUT, SPECIES, createWorld, seedLife, step } from "../src/engine";
const w = createWorld(Number(process.argv[2] ?? 1));
seedLife(w);
console.log("trees", w.terrain.trees.length, "bushes", w.terrain.bushes.length, "fishcells", w.terrain.fishCells.length, "places", w.terrain.places.map((p) => p.desc).join(", "));
const days = Number(process.argv[3] ?? 4);
const per = Math.round(DAY / DT);
for (let d = 0; d < days * 4; d++) {
  const st = [0, 1, 2, 3].map(() => new Array(7).fill(0));
  for (let i = 0; i < per / 4; i++) {
    step(w);
    if (i % 10 === 0) for (const c of w.creatures) st[c.sp][c.state]++;
  }
  for (let sp = 0; sp < 4; sp++) {
    const cs = w.creatures.filter((c) => c.sp === sp);
    if (!cs.length) continue;
    const avg = (f: (c: (typeof cs)[0]) => number): string => (cs.reduce((a, c) => a + f(c), 0) / cs.length).toFixed(2);
    const tot = st[sp].reduce((a: number, b: number) => a + b, 0) || 1;
    console.log(
      `d${(d / 4).toFixed(2)} ${SPECIES[sp].key.padEnd(6)} n${String(cs.length).padStart(3)} E ${avg((c) => c.energy / SPECIES[sp].maxEnergy)} thirst ${avg((c) => c.thirst)} tired ${avg((c) => c.tired)} hp ${avg((c) => c.health)} food ${avg((c) => c.inp[IN.foodNear])} water ${avg((c) => c.inp[IN.waterNear])} cold ${avg((c) => c.inp[IN.cold])} oEat ${avg((c) => c.out[OUT.eat])} oDrink ${avg((c) => c.out[OUT.drink])} oRest ${avg((c) => c.out[OUT.rest])} oMate ${avg((c) => c.out[OUT.mate])} | roam/eat/drink/rest/flee/hunt/talk ${st[sp].map((v: number) => Math.round((v / tot) * 100)).join(" ")}`,
    );
  }
}
