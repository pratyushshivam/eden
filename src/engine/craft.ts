/**
 * What the thinking folk can come to make. Nobody is given any of this. A kith
 * handles materials as it lives (stone in the mountains, clay by a river, bone
 * at a carcass), and when it turns them over in its hands something may come
 * of it. Which thing, and what it is called, is decided at that moment: by the
 * language model when there is one, by chance when there is not. What the
 * thing then does is real: it changes what that kith's body can do in the
 * world, and the knowledge passes on only by being shown or told.
 */

/** Materials, as bits. */
export const M = { stone: 1, wood: 2, fibre: 4, bone: 8, clay: 16, fire: 32, shell: 64, hide: 128, seed: 256 } as const;
export const MATERIAL_NAMES: [number, string][] = [
  [M.stone, "stone"], [M.wood, "wood"], [M.fibre, "long grass and vine"], [M.bone, "bone"], [M.clay, "wet clay"], [M.fire, "fire"],
  [M.shell, "shell"], [M.hide, "hide"], [M.seed, "fruit stones"],
];

export const C_BLADE = 0;
export const C_DIGGER = 1;
export const C_BASKET = 2;
export const C_SPEAR = 3;
export const C_POT = 4;
export const C_CLOAK = 5;
export const C_NET = 6;
export const C_RAFT = 7;
export const C_SOW = 8;
export const C_COOK = 9;
export const C_STONEHUT = 10;
export const C_TORCH = 11;

export interface Craft {
  id: number;
  /** A plain name, used until its maker names it. */
  plain: string;
  /** Materials it must have handled (bits of M). */
  needs: number;
  /** Things it must already know how to make (bits of 1 << id). */
  requires: number;
  /** What it is, for the one who writes the words. */
  what: string;
  /** What it changes, told plainly. */
  does: string;
}

export const CRAFTS: readonly Craft[] = [
  { id: C_BLADE, plain: "a sharp stone", needs: M.stone | M.bone, requires: 0, what: "a stone struck until it has an edge", does: "It can cut meat from the dead, and so eat it." },
  { id: C_DIGGER, plain: "a digging stick", needs: M.wood | M.stone, requires: 0, what: "a stick with a hardened point for turning the ground", does: "It gets at the roots, and more food from the same ground." },
  { id: C_BASKET, plain: "a carrying basket", needs: M.fibre | M.wood, requires: 0, what: "woven grass on a bent wood frame, for carrying", does: "It carries food with it, and can go half as long again without eating." },
  { id: C_SPEAR, plain: "a spear", needs: M.wood | M.stone | M.bone, requires: 1 << C_BLADE, what: "a sharp stone bound to a long stick", does: "It can hunt dapples and glims." },
  { id: C_POT, plain: "a fired pot", needs: M.clay | M.fire, requires: 0, what: "clay shaped by hand and hardened in a fire, to hold water", does: "It keeps water by it, and thirsts half as fast." },
  { id: C_CLOAK, plain: "a hide cloak", needs: M.hide | M.bone, requires: 1 << C_BLADE, what: "a hide scraped clean and pinned with bone", does: "The cold bites much less." },
  { id: C_NET, plain: "a net", needs: M.fibre | M.shell, requires: 0, what: "knotted vine weighted with shells, thrown into the water", does: "It can take food from the shallows and the lakes." },
  { id: C_RAFT, plain: "a raft", needs: M.wood | M.fibre, requires: 1 << C_BASKET, what: "logs lashed together with vine", does: "It can cross the sea." },
  { id: C_SOW, plain: "sowing", needs: M.seed | M.wood, requires: 1 << C_DIGGER, what: "pushing fruit stones into turned ground and coming back later", does: "The bushes it eats from bear more." },
  { id: C_COOK, plain: "cooking", needs: M.fire | M.seed, requires: 0, what: "putting food in the fire before eating it", does: "Food eaten by a fire feeds it better." },
  { id: C_STONEHUT, plain: "a stone wall", needs: M.stone | M.clay, requires: 0, what: "stones set in clay to make a wall", does: "Its shelters stand four times as long." },
  { id: C_TORCH, plain: "a carried fire", needs: M.fire | M.wood | M.fibre, requires: 0, what: "a burning branch wrapped in dry grass, carried", does: "It sees at night, and the hunters keep away from it." },
];

/** The materials a set of bits stands for, in words. */
export function materialWords(bits: number): string[] {
  return MATERIAL_NAMES.filter(([b]) => bits & b).map(([, n]) => n);
}
