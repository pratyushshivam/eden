import { DAY, DT, IN, KITH, SPECIES, createWorld, seedLife, step } from "../src/engine";
const w = createWorld(Number(process.argv[2] ?? 1));
seedLife(w);

for (let d = 1; d <= 24; d++) {
  let e = 0, rdy = 0, n = 0, cold = 0, st = new Array(7).fill(0), carrying = 0;
  for (let i = 0; i < DAY / DT; i++) {
    step(w);
    if (i % 40 === 0)
      for (const c of w.creatures)
        if (c.sp === KITH) {
          n++;
          e += c.energy / 120;
          rdy += c.inp[IN.mateReady];
          cold += c.inp[IN.cold];
          st[c.state]++;
          carrying += c.carrying;
        }
  }
  const k = w.creatures.filter((c) => c.sp === KITH);
  const nb = k.filter((c) => c.gen > 0).length;
  const adults = k.filter((c) => (w.t - c.born) / DAY > SPECIES[KITH].adultAt);
  console.log(`d${d} s${w.season} n ${k.length} (f ${k.filter((c) => !c.sex).length}) adults ${adults.length} bornAlive ${nb} E ${(e / n).toFixed(2)} ready ${(rdy / n).toFixed(2)} cold ${(cold / n).toFixed(2)} carry ${(carrying / n).toFixed(2)} states ${st.map((v) => Math.round((v / n) * 100)).join("/")} fires ${w.fires.length} huts ${w.shelters.length} bushAvg ${(w.bush.reduce((a, b) => a + b, 0) / w.bush.length).toFixed(2)} deaths ${[...w.gone.values()].filter((c) => c.sp === KITH).map((c) => c.cause[0] + (c.died / DAY).toFixed(0)).join(" ")}`);
}
