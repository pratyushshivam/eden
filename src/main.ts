import { DT, createWorld, place, step, grid, CELLS, type Species } from "./engine";
import { PLAINS, FOREST, SHALLOW } from "./engine/terrain";
import { Stage } from "./render/stage";

const params = new URLSearchParams(location.search);
const world = createWorld(Number(params.get("seed") ?? 1));
const stage = new Stage(document.getElementById("stage") as HTMLCanvasElement);
// A few of each kind, for looking at.
const g = grid();
const t = world.terrain;
const pick = (ok: (i: number) => boolean, salt: number): number => {
  for (let k = 0; k < 20000; k++) {
    const i = (Math.imul(k + salt * 7919, 2654435761) >>> 0) % CELLS;
    if (ok(i)) return i;
  }
  return 0;
};
const drop = (sp: Species, n: number, cell: number): void => {
  for (let k = 0; k < n; k++) place(world, sp, g.cx[cell] + world.rng.range(-0.03, 0.03), g.cy[cell] + world.rng.range(-0.03, 0.03), g.cz[cell] + world.rng.range(-0.03, 0.03), 0.7);
};
const mild = (i: number): boolean => t.temp[i] > 12 && t.temp[i] < 27 && t.freshDist[i] < 20;
const home = pick((i) => t.kind[i] === FOREST && mild(i), 61);
drop(6, 12, home);
drop(0, 16, pick((i) => t.kind[i] === PLAINS && mild(i), 1));
drop(4, 8, pick((i) => t.kind[i] === FOREST && mild(i), 41));
drop(2, 8, pick((i) => t.kind[i] === SHALLOW && t.temp[i] > 8, 21));
drop(3, 10, pick((i) => t.kind[i] === SHALLOW && t.temp[i] > 8, 31));
drop(5, 6, pick((i) => t.kind[i] === PLAINS && mild(i), 51));
let speed = Number(params.get("speed") ?? 1);
let last = performance.now();
let acc = 0;
Object.assign(window, { __eden: { world, stage, home: [g.cx[home], g.cy[home], g.cz[home]], set speed(v: number) { speed = v; } } });
window.addEventListener("resize", () => stage.resize());
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * speed;
  const stop = performance.now() + 11;
  while (acc >= DT) {
    step(world);
    acc -= DT;
    if (performance.now() > stop) { acc = 0; break; }
  }
  stage.frame(world, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
