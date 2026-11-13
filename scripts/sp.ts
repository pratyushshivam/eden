import { DAY, DT, IN, OUT, VEC, SPECIES, createWorld, seedLife, step } from "../src/engine";
const sp = Number(process.argv[2] ?? 1);
const w = createWorld(Number(process.argv[4] ?? 1));
seedLife(w);
for (let d = 0; d < Number(process.argv[3] ?? 6) * 2; d++) {
  for (let i = 0; i < DAY / DT / 2; i++) step(w);
  console.log(`d${(w.t / DAY).toFixed(1)} T${w.temp.toFixed(0)} ` + w.creatures.filter((c) => c.sp === sp).map((c) => `[${c.sex ? "m" : "f"} ${c.x.toFixed(0)},${c.y.toFixed(0)} E${(c.energy / SPECIES[sp].maxEnergy).toFixed(2)} th${c.thirst.toFixed(1)} ti${c.tired.toFixed(1)} cd${(c.mateCd / DAY).toFixed(1)} rdy${c.inp[IN.mateReady]} oM${c.out[OUT.mate].toFixed(1)} wFo${c.out[VEC.follow].toFixed(1)} wF${c.out[VEC.food].toFixed(1)} fV${c.inp[IN.foodNear].toFixed(1)} cold${c.inp[IN.cold].toFixed(1)} s${c.state} k${c.kills}]`).join(" "));
}
