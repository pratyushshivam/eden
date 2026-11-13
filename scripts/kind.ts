// Day-by-day look at one kind on a populated planet. `npx tsx scripts/kind.ts <kind 0-6> [days] [seed]`
import { DAY, DT, IN, OUT, SPECIES, createWorld, step, type Species } from "../src/engine";
import { populate } from "./survey";

const sp = Number(process.argv[2] ?? 3) as Species;
const days = Number(process.argv[3] ?? 16);
const w = createWorld(Number(process.argv[4] ?? 1));
populate(w);
const def = SPECIES[sp];
for (let d = 1; d <= days; d++) {
  let e = 0, ready = 0, willing = 0, n = 0, near = 0, food = 0;
  const st = new Array(10).fill(0);
  for (let i = 0; i < DAY / DT; i++) {
    step(w);
    if (i % 60 === 0)
      for (const c of w.creatures)
        if (c.sp === sp) {
          n++;
          e += c.energy / def.maxEnergy;
          ready += c.inp[IN.mateReady];
          willing += c.out[OUT.mate] > 0 ? 1 : 0;
          near += c.inp[IN.kinNear] > 0 ? 1 : 0;
          food += c.inp[IN.foodNear];
          st[c.state]++;
        }
  }
  const cs = w.creatures.filter((c) => c.sp === sp);
  const adults = cs.filter((c) => (w.t - c.born) / DAY > def.adultAt).length;
  const f = (v: number): string => (v / Math.max(1, n)).toFixed(2);
  console.log(
    `d${d} n ${cs.length} adults ${adults} f ${cs.filter((c) => !c.sex).length} gen ${Math.max(0, ...cs.map((c) => c.gen))} E ${f(e)} food ${f(food)} ready ${f(ready)} willing ${f(willing)} kinInSight ${f(near)} states ${st.map((v) => Math.round((v / Math.max(1, n)) * 100)).join("/")} cd ${(cs.reduce((a, c) => a + Math.max(0, c.mateCd), 0) / Math.max(1, cs.length) / DAY).toFixed(2)}`,
  );
}
