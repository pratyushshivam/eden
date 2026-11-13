/**
 * The brain: a small feed-forward network, one per creature. Every neuron adds
 * up its inputs, each multiplied by a weight, adds its own bias, and squashes
 * the total into -1 .. 1 with tanh. Weights are one flat Float32Array: for each
 * layer, for each neuron, its incoming weights and then its bias.
 */
import { IN, KITH, LAYERS, MUTATION_RATE, MUTATION_SIZE, N_HIDDEN, N_IN, N_OUT, OUT, PREDATOR, BIRD, VEC, type Species } from "./config";
import type { Rng } from "./rng";

export function weightCount(layers: readonly number[]): number {
  let n = 0;
  for (let l = 1; l < layers.length; l++) n += (layers[l - 1] + 1) * layers[l];
  return n;
}

export const GENOME = weightCount(LAYERS);

const hidden = new Float32Array(N_HIDDEN);

/** Runs one creature's network: `input` (N_IN numbers) in, `out` (N_OUT numbers) filled. */
export function think(weights: Float32Array, input: Float32Array, out: Float32Array): void {
  let w = 0;
  for (let j = 0; j < N_HIDDEN; j++) {
    let sum = 0;
    for (let i = 0; i < N_IN; i++) sum += input[i] * weights[w++];
    hidden[j] = Math.tanh(sum + weights[w++]);
  }
  for (let j = 0; j < N_OUT; j++) {
    let sum = 0;
    for (let i = 0; i < N_HIDDEN; i++) sum += hidden[i] * weights[w++];
    out[j] = Math.tanh(sum + weights[w++]);
  }
}

/** A brain of pure noise: what a creature would be with no inheritance at all. */
export function randomBrain(rng: Rng): Float32Array {
  const w = new Float32Array(GENOME);
  for (let i = 0; i < GENOME; i++) w[i] = rng.gauss() * 0.6;
  return w;
}

/**
 * A child's brain: each weight comes from one parent or the other, in runs
 * (so pieces that work together tend to travel together), and a few are nudged.
 */
export function inherit(a: Float32Array, b: Float32Array, rng: Rng): Float32Array {
  const child = new Float32Array(GENOME);
  let from = rng.next() < 0.5 ? a : b;
  for (let i = 0; i < GENOME; i++) {
    if (rng.next() < 0.06) from = from === a ? b : a;
    child[i] = from[i];
    if (rng.next() < MUTATION_RATE) child[i] += rng.gauss() * MUTATION_SIZE;
  }
  return child;
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
  const w = new Float32Array(GENOME);
  for (let i = 0; i < GENOME; i++) w[i] = rng.gauss() * 0.12;
  const hid = (j: number, input: number, weight: number, bias = 0): void => {
    w[j * (N_IN + 1) + input] += weight;
    w[j * (N_IN + 1) + N_IN] += bias;
  };
  const base = N_HIDDEN * (N_IN + 1);
  const out = (o: number, h: number, weight: number): void => {
    w[base + o * (N_HIDDEN + 1) + h] += weight;
  };
  const bias = (o: number, b: number): void => {
    w[base + o * (N_HIDDEN + 1) + N_HIDDEN] += b;
  };
  const H = { hunger: 0, thirst: 1, tired: 2, fear: 3, cold: 4, night: 5, ready: 6, danger: 7 };
  hid(H.hunger, IN.hunger, 1.3);
  hid(H.thirst, IN.thirst, 1.3);
  hid(H.tired, IN.tired, 1.3);
  hid(H.fear, IN.fear, 1.6);
  hid(H.cold, IN.cold, 1.3);
  hid(H.night, IN.night, 1.1);
  hid(H.ready, IN.mateReady, 1.2);
  hid(H.danger, IN.dangerBelief, 1.4);

  // Head for food when hungry, water when thirsty.
  out(VEC.food, H.hunger, 2.8);
  bias(VEC.food, -0.25);
  out(VEC.water, H.thirst, 3.0);
  bias(VEC.water, -0.35);
  out(VEC.food, H.thirst, -0.5);
  // A pressing need crowds out everything else.
  for (const need of [H.hunger, H.thirst]) {
    out(VEC.home, need, -1.0);
    out(VEC.kin, need, -0.6);
    out(VEC.warm, need, -0.8);
    out(VEC.follow, need, -0.6);
  }
  // Wander when nothing presses; drift home at night.
  bias(VEC.wander, 0.45);
  out(VEC.home, H.night, 0.6);
  bias(VEC.home, 0.08);
  // Pace.
  bias(OUT.speed, -0.35);
  out(OUT.speed, H.fear, 2.2);
  out(OUT.speed, H.hunger, 1.0);
  out(OUT.speed, H.thirst, 1.1);
  // Rest when tired or when it is dark, never when afraid.
  bias(OUT.rest, -0.75);
  out(OUT.rest, H.tired, 1.9);
  out(OUT.rest, H.night, 0.75);
  out(OUT.rest, H.fear, -2.5);
  out(OUT.rest, H.hunger, -1.5);
  out(OUT.rest, H.thirst, -1.7);
  // Eat, drink, breed when it makes sense.
  bias(OUT.eat, -0.12);
  out(OUT.eat, H.hunger, 2.4);
  bias(OUT.drink, -0.2);
  out(OUT.drink, H.thirst, 2.4);
  bias(OUT.mate, -0.45);
  out(OUT.mate, H.ready, 1.6);
  out(VEC.follow, H.ready, 1.4);

  if (sp === PREDATOR) {
    // A russet chases; it is wary of fire and keeps loosely to itself.
    out(VEC.threat, H.fear, -1.6);
    bias(VEC.kin, -0.05);
    out(OUT.speed, H.hunger, 1.2);
  } else if (sp === BIRD) {
    bias(VEC.kin, 0.2);
    bias(OUT.speed, 0.15);
  } else {
    // Prey: away from what frightens, towards its own kind, tighter when afraid or cold.
    out(VEC.threat, H.fear, -2.4);
    bias(VEC.threat, -0.2);
    bias(VEC.kin, 0.22);
    out(VEC.kin, H.fear, 0.6);
    out(VEC.kin, H.cold, 0.6);
    out(VEC.food, H.fear, -1.2);
  }
  if (sp === KITH) {
    // Folk: fetch wood and make fire when cold or dark, shelter near home, keep off believed-bad ground.
    out(OUT.gather, H.cold, 1.5);
    out(OUT.gather, H.night, 0.5);
    bias(OUT.gather, -0.3);
    out(OUT.fire, H.cold, 1.6);
    out(OUT.fire, H.night, 0.7);
    bias(OUT.fire, -0.2);
    bias(OUT.shelter, 0.1);
    out(OUT.shelter, H.cold, -0.8);
    bias(OUT.mark, -0.55);
    out(VEC.warm, H.cold, 1.6);
    out(VEC.warm, H.night, 0.5);
    out(VEC.dangerPlace, H.danger, -2.2);
    out(VEC.goodPlace, H.hunger, 1.1);
    out(VEC.goodPlace, H.thirst, 1.1);
    bias(VEC.follow, 0.3);
  }
  return w;
}
