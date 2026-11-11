/**
 * SKINS - cosmetic looks for the player. They change colours and add small
 * accessories; they never change how the game plays.
 *
 * How each skin is unlocked:
 *   - `coins`   bought with coins in the shop
 *   - `premium` bought with real money (product id in config/store.ts)
 *   - `daily`   only from the 7-day daily reward
 *   - `free`    owned from the start
 */

export type Accessory = 'mohawk' | 'crown' | 'scarf' | 'headband' | 'shades';

export interface SkinDef {
  id: string;
  name: string;
  /** Hex colours per part. */
  head: number;
  torso: number;
  hands: number;
  feet: number;
  /** 0 = matte .. 1 = metal. */
  metalness?: number;
  roughness?: number;
  /** Glow colour applied to every part (ghost). */
  emissive?: number;
  /** Parts that glow in their own colour (neon). */
  glow?: ('head' | 'torso' | 'hands' | 'feet')[];
  emissiveIntensity?: number;
  /** Translucent (ghost). */
  opacity?: number;
  accessories?: Accessory[];
  /** Accent colour for the accessories. */
  accent?: number;
  unlock: 'free' | 'coins' | 'premium' | 'daily';
  /** Coin price for `coins` skins. */
  price?: number;
  /** Store product id for `premium` skins. */
  productId?: string;
}

export const SKINS: SkinDef[] = [
  { id: 'classic', name: 'Classic', head: 0xd6d0c2, torso: 0xd6d0c2, hands: 0xd6d0c2, feet: 0xd6d0c2, unlock: 'free' },
  { id: 'concrete', name: 'Concrete', head: 0x9a9a96, torso: 0x7d7d79, hands: 0x9a9a96, feet: 0x5c5c58, roughness: 1, unlock: 'coins', price: 1500 },
  { id: 'nightops', name: 'Night Ops', head: 0x2a2a30, torso: 0x1b1b20, hands: 0xe8462e, feet: 0x1b1b20, accessories: ['shades'], accent: 0x111111, unlock: 'coins', price: 2500 },
  { id: 'graffiti', name: 'Graffiti', head: 0xf1ede4, torso: 0xffc234, hands: 0xff4fa3, feet: 0x2ec4d6, accessories: ['headband'], accent: 0xff4fa3, unlock: 'coins', price: 4000 },
  { id: 'punk', name: 'Punk', head: 0xe9d9c8, torso: 0x161616, hands: 0xe9d9c8, feet: 0x8a1c1c, accessories: ['mohawk'], accent: 0xe8462e, unlock: 'coins', price: 6000 },
  { id: 'ghost', name: 'Ghost', head: 0xffffff, torso: 0xffffff, hands: 0xffffff, feet: 0xffffff, opacity: 0.55, emissive: 0x99c8ff, emissiveIntensity: 0.25, unlock: 'coins', price: 9000 },
  { id: 'ostberlin', name: "Ostberlin '89", head: 0xe2d6c4, torso: 0x3d5a8a, hands: 0xe2d6c4, feet: 0x2b2b2b, accessories: ['scarf'], accent: 0xc62828, unlock: 'daily' },
  { id: 'neon', name: 'Neon', head: 0x24242c, torso: 0x1c1c22, hands: 0x00e5ff, feet: 0xff2bd6, glow: ['hands', 'feet'], emissiveIntensity: 1.4, accessories: ['headband'], accent: 0x00e5ff, unlock: 'premium', productId: 'skin_neon' },
  // Without reflections a fully metal material renders black, so gold stays half-metal.
  { id: 'gold', name: 'Gold', head: 0xffcf4a, torso: 0xf0b225, hands: 0xffdd70, feet: 0xd99a1c, metalness: 0.55, roughness: 0.3, emissive: 0x3a2400, emissiveIntensity: 1, unlock: 'premium', productId: 'skin_gold' },
  { id: 'royal', name: 'Royal', head: 0xe7dccb, torso: 0x5b2a86, hands: 0xe7dccb, feet: 0x3a1a57, accessories: ['crown', 'scarf'], accent: 0xffc234, unlock: 'premium', productId: 'skin_royal' },
];

export function getSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
