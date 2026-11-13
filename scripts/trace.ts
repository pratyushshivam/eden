import { DAY, DT, IN, OUT, VEC, createWorld, seedLife, step, cellOf, SPECIES } from "../src/engine";
const w = createWorld(1);
seedLife(w);
const sp = Number(process.argv[2] ?? 0);
const lines: string[] = [];
for (let i = 0; i < (DAY / DT) * Number(process.argv[3] ?? 1.2); i++) step(w);
const c = w.creatures.filter((c) => c.sp === sp && c.health > 0.5).sort((a, b) => a.energy - b.energy)[0];
for (let i = 0; i < 400 && lines.length < 20; i++) {
  step(w);
  if (i % 20 === 0) {
    const cell = cellOf(c.x, c.y);
    const b = c.foodKind === 2 ? w.terrain.bushes[c.foodAt] : null;
    lines.push(
      `x ${c.x.toFixed(1)} y ${c.y.toFixed(1)} kind ${w.terrain.kind[cell]} g ${w.grass[cell].toFixed(2)} E ${c.energy.toFixed(0)}/${SPECIES[sp].maxEnergy} st ${c.state} pace ${c.pace.toFixed(2)} det ${c.detour.toFixed(1)} pause ${c.pause.toFixed(1)} carry ${c.carrying} food ${c.foodKind}@${c.foodAt} ${b ? `bush ${b.x.toFixed(1)},${b.y.toFixed(1)} stock ${w.bush[c.foodAt].toFixed(2)}` : ""} fear ${c.inp[IN.fear].toFixed(2)} | wF ${c.out[VEC.food].toFixed(2)} wK ${c.out[VEC.kin].toFixed(2)} wT ${c.out[VEC.threat].toFixed(2)} wFo ${c.out[VEC.follow].toFixed(2)} wWarm ${c.out[VEC.warm].toFixed(2)} wG ${c.out[VEC.goodPlace].toFixed(2)} wD ${c.out[VEC.dangerPlace].toFixed(2)} eat ${c.out[OUT.eat].toFixed(2)} gather ${c.out[OUT.gather].toFixed(2)} h ${c.hx.toFixed(2)},${c.hy.toFixed(2)} tvF ${c.tv[0].toFixed(2)},${c.tv[1].toFixed(2)}`,
    );
  }
}
console.log(lines.join("\n"));
