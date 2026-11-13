import { DT, createWorld, seedLife, step } from "./engine";
import { Stage } from "./render/stage";

const stage = new Stage(document.getElementById("stage") as HTMLCanvasElement);
const world = createWorld(Number(new URLSearchParams(location.search).get("seed") ?? 1));
seedLife(world);
let speed = Number(new URLSearchParams(location.search).get("speed") ?? 1);
let last = performance.now();
let acc = 0;
Object.assign(window, { __eden: { world, stage, set speed(v: number) { speed = v; } } });
window.addEventListener("resize", () => stage.resize());
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * speed;
  let n = 0;
  while (acc >= DT && n++ < 80) {
    step(world);
    acc -= DT;
  }
  if (acc > DT) acc = 0;
  stage.frame(world, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
