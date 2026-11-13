/**
 * Every number that shapes the world lives here.
 */

/** Cells along one side of the world grid; one cell is one unit of length. */
export const N = 120;
/** Radius of the island, in units. */
export const ISLAND_R = 52;
/** The fixed time step, in world seconds. */
export const DT = 1 / 20;
/** World seconds in one day. */
export const DAY = 96;
export const SEASON_DAYS = 3;
export const YEAR_DAYS = SEASON_DAYS * 4;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

/** A creature thinks (runs its network) once every this many steps. */
export const THINK_EVERY = 4;
/** No more births once this many creatures are alive. */
export const MAX_CREATURES = 520;

/** Energy held by one grid cell of full grass, one berry, one cell of full fish. */
export const GRASS_E = 30;
export const BERRY_E = 14;
export const FISH_E = 24;
export const BUSH_MAX = 4;

export const GRAZER = 0;
export const PREDATOR = 1;
export const BIRD = 2;
export const KITH = 3;
export type Species = 0 | 1 | 2 | 3;

export interface SpeciesDef {
  key: string;
  /** What one of them is called, and several. */
  one: string;
  many: string;
  speed: number;
  sense: number;
  /** Days. */
  lifespan: number;
  adultAt: number;
  maxEnergy: number;
  /** Energy locked in the body; comes from the parents and is left behind as a carcass. */
  mass: number;
  /** Energy per second at rest. */
  burn: number;
  /** Energy per second taken in while eating. */
  bite: number;
  /** Share of eaten energy that is kept. */
  digest: number;
  /** Days for thirst to go from none to desperate. */
  thirstDays: number;
  /** Degrees below which it feels cold. */
  comfort: number;
  /** Days between litters. */
  mateEvery: number;
  /** Energy needed (as a share of the maximum) before it will breed. */
  mateAt: number;
  /** Energy a newborn starts with. */
  birthEnergy: number;
  /** How much each extra second at full speed tires it. */
  tire: number;
}

export const SPECIES: readonly SpeciesDef[] = [
  {
    key: "dapple", one: "dapple", many: "dapples",
    speed: 2.3, sense: 10, lifespan: 9, adultAt: 1.6,
    maxEnergy: 100, mass: 40, burn: 0.42, bite: 5, digest: 0.8,
    thirstDays: 2.2, comfort: 3, mateEvery: 1.0, mateAt: 0.62, birthEnergy: 40, tire: 0.022,
  },
  {
    key: "russet", one: "russet", many: "russets",
    speed: 3.2, sense: 15, lifespan: 16, adultAt: 2.2,
    maxEnergy: 170, mass: 50, burn: 0.27, bite: 9, digest: 0.75,
    thirstDays: 2.6, comfort: 0, mateEvery: 2.0, mateAt: 0.52, birthEnergy: 50, tire: 0.022,
  },
  {
    key: "skim", one: "skim", many: "skims",
    speed: 4.2, sense: 16, lifespan: 8, adultAt: 1.4,
    maxEnergy: 70, mass: 20, burn: 0.3, bite: 4, digest: 0.8,
    thirstDays: 60, comfort: 5, mateEvery: 1.8, mateAt: 0.66, birthEnergy: 28, tire: 0.012,
  },
  {
    key: "kith", one: "kith", many: "kith",
    speed: 1.9, sense: 12, lifespan: 16, adultAt: 2.5,
    maxEnergy: 120, mass: 40, burn: 0.33, bite: 7, digest: 0.85,
    thirstDays: 2.2, comfort: 8, mateEvery: 1.6, mateAt: 0.5, birthEnergy: 45, tire: 0.02,
  },
];

/* ---- the brain ---- */

/** What a creature senses. One number each, roughly 0..1. */
export const IN = {
  hunger: 0, thirst: 1, tired: 2, fear: 3, cold: 4, night: 5,
  foodNear: 6, waterNear: 7, kinNear: 8, crowd: 9, mateReady: 10, age: 11,
  homeFar: 12, hurt: 13, dangerBelief: 14, goodBelief: 15, warmNear: 16,
  carrying: 17, followNear: 18, wet: 19,
} as const;
export const N_IN = 20;

/** Things a creature can head towards (or away from: the weight can be negative). */
export const VEC = {
  food: 0, water: 1, kin: 2, threat: 3, home: 4, wander: 5,
  goodPlace: 6, dangerPlace: 7, follow: 8, warm: 9,
} as const;
export const N_VEC = 10;

/** What the network decides. The first N_VEC outputs weigh the directions above. */
export const OUT = {
  speed: 10, rest: 11, eat: 12, drink: 13, mate: 14,
  gather: 15, shelter: 16, fire: 17, mark: 18,
} as const;
export const N_OUT = 19;
export const N_HIDDEN = 12;
export const LAYERS: readonly number[] = [N_IN, N_HIDDEN, N_OUT];

/** Share of weights nudged in a child, and how hard. */
export const MUTATION_RATE = 0.08;
export const MUTATION_SIZE = 0.28;
