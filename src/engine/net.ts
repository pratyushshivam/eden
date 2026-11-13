/**
 * The brain: a small feed-forward network, one per creature. Every neuron adds
 * up its inputs, each multiplied by a weight, adds its own bias, and squashes
 * the total into -1 .. 1 with tanh. Weights are one flat Float32Array: for each
 * layer, for each neuron, its incoming weights and then its bias.
 *
 * The three tiers of mind differ in how many hidden neurons they have.
 */
import { HIDDEN, IN, MUTATION_RATE, MUTATION_SIZE, N_IN, N_OUT, OUT, SPECIES, THINKER, VEC, CLEVER, type Species } from "./config";
import type { Rng } from "./rng";

/** How many weights a network with this many hidden neurons has. */
export const genomeSize = (hidden: number): number => (N_IN + 1) * hidden + (hidden + 1) * N_OUT;
export const hiddenOf = (sp: Species): number => HIDDEN[SPECIES[sp].tier];
/** Recovers the hidden layer size from a weight array. */
export const hiddenFrom = (weights: Float32Array): number => (weights.length - N_OUT) / (N_IN + 1 + N_OUT);

const scratch = new Float32Array(32);

/**
 * Runs one creature's network: `input` (N_IN numbers) in, `out` (N_OUT numbers)
 * filled. If `hid` is given, the hidden layer's activity is copied there too.
 */
export function think(weights: Float32Array, input: Float32Array, out: Float32Array, hid?: Float32Array): void {
  const H = hiddenFrom(weights);
  let w = 0;
  for (let j = 0; j < H; j++) {
    let sum = 0;
    for (let i = 0; i < N_IN; i++) sum += input[i] * weights[w++];
    scratch[j] = Math.tanh(sum + weights[w++]);
  }
  for (let j = 0; j < N_OUT; j++) {
    let sum = 0;
    for (let i = 0; i < H; i++) sum += scratch[i] * weights[w++];
    out[j] = Math.tanh(sum + weights[w++]);
  }
  if (hid) for (let j = 0; j < H; j++) hid[j] = scratch[j];
}

/** A brain of pure noise: what a creature would be with no inheritance at all. */
export function randomBrain(sp: Species, rng: Rng): Float32Array {
  const w = new Float32Array(genomeSize(hiddenOf(sp)));
  for (let i = 0; i < w.length; i++) w[i] = rng.gauss() * 0.6;
  return w;
}

/**
 * A child's brain: each weight comes from one parent or the other, in runs
 * (so pieces that work together tend to travel together), and a few are nudged.
 */
export function inherit(a: Float32Array, b: Float32Array, rng: Rng): Float32Array {
  const n = a.length;
  const child = new Float32Array(n);
  let from = rng.next() < 0.5 ? a : b;
  for (let i = 0; i < n; i++) {
    if (rng.next() < 0.06) from = from === a ? b : a;
    child[i] = from[i];
    if (rng.next() < MUTATION_RATE) child[i] += rng.gauss() * MUTATION_SIZE;
  }
  return child;
}

/** How different two brains of the same kind are: the mean absolute difference of their weights. */
export function brainDistance(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/**
 * The instincts the first creatures of a kind arrive with: a rough, noisy
 * wiring of "hungry, so head for food" and the like, so the first minute is
 * not everyone starving. It is only a starting point. From the first birth on,
 * nothing here is consulted again; children get their parents' weights.
 *
 * The first eight hidden neurons each relay one feeling; the rest start as noise.
 */
export function founderBrain(sp: Species, rng: Rng): Float32Array {
  const def = SPECIES[sp];
  const H = hiddenOf(sp);
  const w = new Float32Array(genomeSize(H));
  for (let i = 0; i < w.length; i++) w[i] = rng.gauss() * 0.12;
  const hid = (j: number, input: number, weight: number): void => {
    w[j * (N_IN + 1) + input] += weight;
  };
  const base = H * (N_IN + 1);
  const out = (o: number, h: number, weight: number): void => {
    w[base + o * (H + 1) + h] += weight;
  };
  const bias = (o: number, b: number): void => {
    w[base + o * (H + 1) + H] += b;
  };
  const F = { hunger: 0, thirst: 1, tired: 2, fear: 3, cold: 4, night: 5, ready: 6, danger: 7 };
  hid(F.hunger, IN.hunger, 1.3);
  hid(F.thirst, IN.thirst, 1.3);
  hid(F.tired, IN.tired, 1.3);
  hid(F.fear, IN.fear, 1.6);
  hid(F.cold, IN.cold, 1.3);
  hid(F.night, IN.night, 1.1);
  hid(F.ready, IN.mateReady, 1.2);
  hid(F.danger, IN.dangerBelief, 1.4);

  // Head for food when hungry, water when thirsty.
  out(VEC.food, F.hunger, 2.8);
  bias(VEC.food, -0.25);
  out(VEC.water, F.thirst, 3.0);
  bias(VEC.water, -0.35);
  out(VEC.food, F.thirst, -0.5);
  // A pressing need crowds out everything else.
  for (const need of [F.hunger, F.thirst]) {
    out(VEC.home, need, -1.0);
    out(VEC.kin, need, -0.6);
    out(VEC.warm, need, -0.8);
    out(VEC.follow, need, -0.6);
    out(VEC.novel, need, -0.8);
    out(OUT.play, need, -1.6);
    out(OUT.tinker, need, -0.6);
  }
  // Wander when nothing presses; drift home at night.
  bias(VEC.wander, 0.45);
  out(VEC.home, F.night, 0.6);
  bias(VEC.home, 0.08);
  // Pace.
  bias(OUT.speed, -0.35);
  out(OUT.speed, F.fear, 2.2);
  out(OUT.speed, F.hunger, 1.0);
  out(OUT.speed, F.thirst, 1.1);
  // Rest when tired or when it is dark, never when afraid.
  bias(OUT.rest, -0.75);
  out(OUT.rest, F.tired, 1.9);
  out(OUT.rest, F.night, 0.75);
  out(OUT.rest, F.fear, -2.5);
  out(OUT.rest, F.hunger, -1.5);
  out(OUT.rest, F.thirst, -1.7);
  // Eat, drink, breed when it makes sense.
  bias(OUT.eat, -0.12);
  out(OUT.eat, F.hunger, 2.4);
  bias(OUT.drink, -0.2);
  out(OUT.drink, F.thirst, 2.4);
  bias(OUT.mate, -0.45);
  out(OUT.mate, F.ready, 1.6);
  out(VEC.follow, F.ready, 1.4);
  // Play a little when all is well; stop at once when afraid.
  bias(OUT.play, -0.2);
  out(OUT.play, F.fear, -2);
  out(OUT.play, F.tired, -1);

  if (def.prey.length) {
    // A hunter chases; it is wary of fire and keeps loosely to itself.
    out(VEC.threat, F.fear, -1.6);
    bias(VEC.kin, -0.05);
    out(OUT.speed, F.hunger, 1.2);
  } else if (def.air || def.sea) {
    bias(VEC.kin, 0.2);
    bias(OUT.speed, 0.15);
  } else {
    // Prey: away from what frightens, towards its own kind, tighter when afraid or cold.
    out(VEC.threat, F.fear, -2.4);
    bias(VEC.threat, -0.2);
    bias(VEC.kin, 0.22);
    out(VEC.kin, F.fear, 0.6);
    out(VEC.kin, F.cold, 0.6);
    out(VEC.food, F.fear, -1.2);
  }
  if (def.tier >= CLEVER) {
    // Clever kinds go back to where they remember food, and look into new things.
    out(VEC.goodPlace, F.hunger, 1.1);
    out(VEC.goodPlace, F.thirst, 1.1);
    bias(VEC.novel, 0.5);
    out(VEC.novel, F.fear, -1.5);
    bias(VEC.follow, 0.3);
    bias(OUT.play, 0.25);
  }
  if (def.tier === THINKER) {
    // Folk: fetch wood and make fire when cold or dark, shelter near home, keep off believed-bad ground, try things.
    out(OUT.gather, F.cold, 1.5);
    out(OUT.gather, F.night, 0.5);
    bias(OUT.gather, -0.3);
    out(OUT.fire, F.cold, 1.6);
    out(OUT.fire, F.night, 0.7);
    bias(OUT.fire, -0.2);
    bias(OUT.shelter, 0.1);
    out(OUT.shelter, F.cold, -0.8);
    bias(OUT.mark, -0.55);
    out(VEC.warm, F.cold, 1.6);
    out(VEC.warm, F.night, 0.5);
    out(VEC.dangerPlace, F.danger, -2.2);
    bias(OUT.tinker, 0.1);
    out(OUT.tinker, F.fear, -2);
  }
  return w;
}
