/**
 * UPGRADES - character upgrades bought in the shop (BODY tab).
 *
 * Each upgrade has several levels. `prices[i]` is the cost of going from
 * level i to level i + 1, and `value(level)` is the effect at that level
 * (level 0 = not bought). Tune the numbers here.
 */

export type UpgradeId = 'speed' | 'stealth' | 'power' | 'silence' | 'detector' | 'magnet';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** One line shown on the card. */
  desc: string;
  prices: number[];
  /** Wall that must be reached before the first level can be bought (0 = always). */
  unlockWall: number;
  /** Effect at a level (0..prices.length). */
  value: (level: number) => number;
  /** Short text for the effect at a level, e.g. "+12% SPEED". */
  label: (level: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'speed',
    name: 'Sprint Shoes',
    desc: 'Run faster between cover.',
    prices: [150, 400, 900, 1800, 3200],
    unlockWall: 0,
    // Walk speed multiplier: +6 % per level.
    value: (l) => 1 + 0.06 * l,
    label: (l) => `+${pct(0.06 * l)} SPEED`,
  },
  {
    id: 'power',
    name: 'Iron Fists',
    desc: 'Every hit does more damage.',
    prices: [300, 800, 1800, 3600, 6500],
    unlockWall: 0,
    // Damage multiplier: +12 % per level.
    value: (l) => 1 + 0.12 * l,
    label: (l) => `+${pct(0.12 * l)} DAMAGE`,
  },
  {
    id: 'stealth',
    name: 'Shadow Suit',
    desc: 'Guards need longer to notice you.',
    prices: [250, 650, 1400, 2700, 4800],
    unlockWall: 1,
    // Detection fill multiplier: -8 % per level.
    value: (l) => 1 - 0.08 * l,
    label: (l) => `-${pct(0.08 * l)} DETECTION`,
  },
  {
    id: 'silence',
    name: 'Soft Touch',
    desc: 'Your hits make less noise.',
    prices: [350, 900, 2000, 4000],
    unlockWall: 2,
    // Noise radius multiplier: -9 % per level.
    value: (l) => 1 - 0.09 * l,
    label: (l) => `-${pct(0.09 * l)} NOISE`,
  },
  {
    id: 'detector',
    name: 'Mine Sense',
    desc: 'Spot mines and tripwires from further away.',
    prices: [400, 1100, 2500],
    unlockWall: 10,
    // Reveal radius in metres.
    value: (l) => 2.4 + 1.1 * l,
    label: (l) => `${(2.4 + 1.1 * l).toFixed(1)}M RANGE`,
  },
  {
    id: 'magnet',
    name: 'Coin Magnet',
    desc: 'Pick up coins from further away.',
    prices: [120, 350, 800],
    unlockWall: 0,
    // Coin pickup radius in metres.
    value: (l) => 0.85 + 0.55 * l,
    label: (l) => `${(0.85 + 0.55 * l).toFixed(1)}M PICKUP`,
  },
];

export function getUpgrade(id: UpgradeId): UpgradeDef {
  return UPGRADES.find((u) => u.id === id)!;
}
