import { DAY, DT, IN, OUT, VEC, createWorld, seedLife, step, cellOf } from "../src/engine";
const w = createWorld(1);
seedLife(w);
const id = Number(process.argv[2]);
const from = Number(process.argv[3]);
const out: string[] = [];
for (let i = 0; i < (DAY / DT) * (from + 0.25); i++) {
  step(w);
  const c = w.byId.get(id);
  if (c && w.t / DAY > from && i % 30 === 0) {
    const cell = cellOf(c.x, c.y);
    out.push(`t ${(w.t / DAY).toFixed(3)} x ${c.x.toFixed(1)} y ${c.y.toFixed(1)} h ${c.hx.toFixed(2)},${c.hy.toFixed(2)} k ${w.terrain.kind[cell]} E ${c.energy.toFixed(0)} th ${c.thirst.toFixed(2)} tired ${c.tired.toFixed(2)} hp ${c.health.toFixed(2)} fd ${w.terrain.freshDist[cell].toFixed(1)} st ${c.state} pace ${c.pace.toFixed(2)} det ${c.detour.toFixed(1)} spd ${c.out[OUT.speed].toFixed(2)} rest ${c.out[OUT.rest].toFixed(2)} wW ${c.out[VEC.water].toFixed(2)} wF ${c.out[VEC.food].toFixed(2)} tvW ${c.tv[2].toFixed(2)},${c.tv[3].toFixed(2)} night ${c.inp[IN.night].toFixed(1)}`);
  }
}
console.log(out.slice(0, 40).join("\n"));
