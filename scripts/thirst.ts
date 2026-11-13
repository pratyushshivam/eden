import { DAY, DT, IN, OUT, VEC, createWorld, seedLife, step, cellOf, SPECIES } from "../src/engine";
const w = createWorld(1);
seedLife(w);
let shown = 0;
const ready = [0, 0, 0, 0], want = [0, 0, 0, 0], tot = [0, 0, 0, 0];
for (let i = 0; i < (DAY / DT) * 8 && shown < 14; i++) {
  step(w);
  if (i % 100 === 0)
    for (const c of w.creatures) {
      tot[c.sp]++;
      if (c.inp[IN.mateReady] > 0) ready[c.sp]++;
      if (c.inp[IN.mateReady] > 0 && c.out[OUT.mate] > 0) want[c.sp]++;
      if (c.thirst >= 1 && c.health < 0.3 && shown < 14 && i % 400 === 0) {
        shown++;
        const cell = cellOf(c.x, c.y);
        console.log(
          `d${(w.t / DAY).toFixed(1)} ${SPECIES[c.sp].key} id${c.id} g${c.gen} x ${c.x.toFixed(0)} y ${c.y.toFixed(0)} kind ${w.terrain.kind[cell]} E ${c.energy.toFixed(0)} fd ${w.terrain.freshDist[cell].toFixed(1)} runs ${w.riverRuns} lakeD ${w.terrain.lakeDist[cell].toFixed(0)} st ${c.state} pace ${c.pace.toFixed(2)} det ${c.detour.toFixed(1)} fear ${c.inp[IN.fear].toFixed(2)} wV ${c.inp[IN.waterNear].toFixed(2)} | wF ${c.out[VEC.food].toFixed(2)} wW ${c.out[VEC.water].toFixed(2)} wK ${c.out[VEC.kin].toFixed(2)} wT ${c.out[VEC.threat].toFixed(2)} wH ${c.out[VEC.home].toFixed(2)} wWa ${c.out[VEC.wander].toFixed(2)} drink ${c.out[OUT.drink].toFixed(2)} rest ${c.out[OUT.rest].toFixed(2)} tvW ${c.tv[2].toFixed(2)},${c.tv[3].toFixed(2)} tvF ${c.tv[0].toFixed(2)},${c.tv[1].toFixed(2)}`,
        );
      }
    }
}
console.log("ready share", ready.map((r, i) => (r / tot[i]).toFixed(2)), "of which willing", want.map((r, i) => (r / (ready[i] || 1)).toFixed(2)));
