/**
 * Every number that shapes the world lives here.
 */

/** Cells along one edge of each of the planet's six grid faces. */
export const GRID = 80;
/** Radius of the planet, in units. A creature is a little under one unit long. */
export const R = 90;
/** The fixed time step, in world seconds. */
export const DT = 1 / 20;
/** World seconds in one turn of the planet. */
export const DAY = 120;
export const SEASON_DAYS = 3;
export const YEAR_DAYS = SEASON_DAYS * 4;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
/** How far the planet leans: the sun climbs this far north and south of the middle over a year (radians). */
export const TILT = 0.36;

/** A creature thinks (runs its network) once every this many steps. */
export const THINK_EVERY = 4;
/** No more births once this many creatures are alive. */
export const MAX_CREATURES = 800;

/** Energy held by one grid cell of full grass, one fruit, one cell of full sea life. */
export const GRASS_E = 80;
export const BERRY_E = 16;
export const FISH_E = 60;
export const BUSH_MAX = 5;

export const DAPPLE = 0;
export const RUSSET = 1;
export const SKIM = 2;
export const GLIM = 3;
export const MURR = 4;
export const KEST = 5;
export const KITH = 6;
export type Species = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const N_SPECIES = 7;

/** How much mind a kind has. */
export const SIMPLE = 0;
export const CLEVER = 1;
export const THINKER = 2;
export const TIER_NAMES = ["Simple", "Clever", "Thinker"] as const;
/** Hidden neurons by tier. */
export const HIDDEN = [8, 12, 16] as const;

export interface SpeciesDef {
  key: string;
  one: string;
  many: string;
  tier: 0 | 1 | 2;
  /** One line for the picker. */
  blurb: string;
  /** Flies, or lives in the sea. */
  air: boolean;
  sea: boolean;
  /** What it eats: grass, fruit, sea life, carrion, and which kinds it hunts. */
  grass: number;
  fruit: boolean;
  fish: boolean;
  carrion: boolean;
  prey: number[];
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
  /** Degrees below which it feels cold, and above which it feels the heat. */
  comfort: number;
  hot: number;
  /** Days between litters. */
  mateEvery: number;
  /** Energy needed (as a share of the maximum) before it will breed. */
  mateAt: number;
  birthEnergy: number;
  /** How much each extra second at full speed tires it. */
  tire: number;
  /** Will not breed with this many of its own kind in sight. */
  crowd: number;
}

const base = {
  air: false, sea: false, grass: 0, fruit: false, fish: false, carrion: false, prey: [] as number[], hot: 34, crowd: 99,
};

export const SPECIES: readonly SpeciesDef[] = [
  {
    ...base, key: "dapple", one: "dapple", many: "dapples", tier: 0, blurb: "Round grazers that keep together.",
    grass: 0.8, speed: 2.3, sense: 10, lifespan: 9, adultAt: 1.6, maxEnergy: 100, mass: 40, burn: 0.42, bite: 5,
    digest: 0.8, thirstDays: 2.2, comfort: 3, mateEvery: 1.0, mateAt: 0.62, birthEnergy: 40, tire: 0.022, crowd: 14,
  },
  {
    ...base, key: "russet", one: "russet", many: "russets", tier: 0, blurb: "Lean red hunters. They need prey.",
    prey: [0, 4, 6], carrion: true, speed: 3.2, sense: 15, lifespan: 16, adultAt: 2.2, maxEnergy: 170, mass: 50, burn: 0.27, bite: 9,
    digest: 0.75, thirstDays: 2.6, comfort: 0, mateEvery: 2.0, mateAt: 0.52, birthEnergy: 50, tire: 0.022, crowd: 4,
  },
  {
    ...base, key: "skim", one: "skim", many: "skims", tier: 0, blurb: "White fliers that fish the shallows.",
    air: true, fish: true, speed: 4.2, sense: 16, lifespan: 10, adultAt: 1.4, maxEnergy: 70, mass: 20, burn: 0.3, bite: 4,
    digest: 0.8, thirstDays: 60, comfort: 5, mateEvery: 1.8, mateAt: 0.66, birthEnergy: 28, tire: 0.012, crowd: 16,
  },
  {
    ...base, key: "glim", one: "glim", many: "glims", tier: 0, blurb: "Sea drifters that glow in the dark.",
    sea: true, fish: true, speed: 1.8, sense: 10, lifespan: 12, adultAt: 1.3, maxEnergy: 60, mass: 18, burn: 0.2, bite: 3.5,
    digest: 0.8, thirstDays: 999, comfort: -20, mateEvery: 1.0, mateAt: 0.64, birthEnergy: 24, tire: 0.01, crowd: 16,
  },
  {
    ...base, key: "murr", one: "murr", many: "murrs", tier: 1, blurb: "Long-armed foragers. They remember where food was.",
    grass: 0.45, fruit: true, speed: 2.5, sense: 13, lifespan: 13, adultAt: 2.2, maxEnergy: 110, mass: 36, burn: 0.34, bite: 6,
    digest: 0.85, thirstDays: 2.3, comfort: 9, mateEvery: 1.8, mateAt: 0.58, birthEnergy: 40, tire: 0.018, crowd: 10,
  },
  {
    ...base, key: "kest", one: "kest", many: "kests", tier: 1, blurb: "Dark fliers that watch, follow and clean up the dead.",
    air: true, fruit: true, carrion: true, speed: 3.8, sense: 18, lifespan: 12, adultAt: 1.8, maxEnergy: 80, mass: 22, burn: 0.26, bite: 5,
    digest: 0.8, thirstDays: 60, comfort: 2, mateEvery: 2.2, mateAt: 0.62, birthEnergy: 30, tire: 0.012, crowd: 6,
  },
  {
    ...base, key: "kith", one: "kith", many: "kith", tier: 2, blurb: "Small upright folk. They talk, believe, and make things.",
    grass: 0.55, fruit: true, speed: 1.9, sense: 12, lifespan: 18, adultAt: 2.5, maxEnergy: 120, mass: 40, burn: 0.33, bite: 7,
    digest: 0.85, thirstDays: 2.2, comfort: 8, mateEvery: 2.6, mateAt: 0.55, birthEnergy: 45, tire: 0.02, crowd: 14,
  },
];

/* ---------------- the brain ---------------- */

/** What a creature senses. One number each, roughly 0..1. */
export const IN = {
  hunger: 0, thirst: 1, tired: 2, fear: 3, cold: 4, night: 5,
  foodNear: 6, waterNear: 7, kinNear: 8, crowd: 9, mateReady: 10, age: 11,
  homeFar: 12, hurt: 13, dangerBelief: 14, goodBelief: 15, warmNear: 16,
  carrying: 17, followNear: 18, wet: 19, novel: 20,
} as const;
export const N_IN = 21;

/** Things a creature can head towards (or away from: the weight can be negative). */
export const VEC = {
  food: 0, water: 1, kin: 2, threat: 3, home: 4, wander: 5,
  goodPlace: 6, dangerPlace: 7, follow: 8, warm: 9, novel: 10,
} as const;
export const N_VEC = 11;

/** What the network decides. The first N_VEC outputs weigh the directions above. */
export const OUT = {
  speed: 11, rest: 12, eat: 13, drink: 14, mate: 15,
  gather: 16, shelter: 17, fire: 18, mark: 19, tinker: 20, play: 21,
} as const;
export const N_OUT = 22;

/** Share of weights nudged in a child, and how hard. */
export const MUTATION_RATE = 0.08;
export const MUTATION_SIZE = 0.28;
