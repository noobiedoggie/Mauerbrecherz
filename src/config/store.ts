/**
 * STORE - things sold for real money, and the daily reward calendar.
 *
 * Product ids must match the in-app products you create in the Google Play
 * Console (Monetize > Products > In-app products). Prices shown here are
 * only labels: on a real device the price comes from Google Play.
 */

export interface ProductDef {
  id: string;
  name: string;
  desc: string;
  /** Price label shown until Google Play provides the localised price. */
  price: string;
  /** What the purchase gives. */
  coins?: number;
  skin?: string;
  tool?: number;
  /** Can only be bought once. */
  oneTime?: boolean;
  /** Highlight on the store page. */
  tag?: string;
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'starter_pack',
    name: 'Starter Pack',
    desc: 'Hammer + 5,000 coins + Neon skin',
    price: '€2.99',
    coins: 5000,
    tool: 3,
    skin: 'neon',
    oneTime: true,
    tag: 'ONE TIME',
  },
  { id: 'coins_small', name: 'Pouch of Coins', desc: '5,000 coins', price: '€0.99', coins: 5000 },
  { id: 'coins_medium', name: 'Bag of Coins', desc: '30,000 coins', price: '€4.99', coins: 30000, tag: 'POPULAR' },
  { id: 'coins_large', name: 'Crate of Coins', desc: '100,000 coins', price: '€9.99', coins: 100000, tag: 'BEST VALUE' },
  { id: 'skin_neon', name: 'Neon Skin', desc: 'Glowing cyan and pink', price: '€1.99', skin: 'neon', oneTime: true },
  { id: 'skin_gold', name: 'Gold Skin', desc: 'Solid gold, head to toe', price: '€2.99', skin: 'gold', oneTime: true },
  { id: 'skin_royal', name: 'Royal Skin', desc: 'Purple robe and a crown', price: '€4.99', skin: 'royal', oneTime: true },
];

export function getProduct(id: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/**
 * DAILY REWARDS - one claim per calendar day. Missing a day restarts the
 * streak at day 1. Day 7 gives the exclusive skin (or coins if you already
 * have it), then the cycle starts again.
 */
export interface DailyReward {
  coins: number;
  skin?: string;
}

export const DAILY: DailyReward[] = [
  { coins: 100 },
  { coins: 200 },
  { coins: 300 },
  { coins: 500 },
  { coins: 750 },
  { coins: 1000 },
  { coins: 1500, skin: 'ostberlin' },
];

/** Coins given instead of the day-7 skin when it is already owned. */
export const DAILY_SKIN_DUPLICATE_COINS = 2500;
