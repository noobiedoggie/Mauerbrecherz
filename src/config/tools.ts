/**
 * TOOLS - the upgrade table.
 *
 * Louder tools break the wall faster but pull guards in. That trade-off is
 * the core of the game, so `damage`, `hitsPerSec` and `noise` are the three
 * numbers to balance first.
 */

import type { ImpactKind } from '../game/Audio';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'continuous';

/** How the punch is animated. */
export type PunchStyle =
  | 'jab' // straight punch: Hand_R lunges at the wall
  | 'swing' // short one-handed hammer swing
  | 'overhead' // big overhead arc (sledgehammer, pickaxe)
  | 'jackhammer'; // two hands, no lunge, rapid vibration

export interface ToolDef {
  id: number;
  name: string;
  /** GLB path inside public/assets. */
  model: string;
  /** PNG path inside public/assets (shop + HUD button). */
  icon: string;

  // ---- balance ----------------------------------------------------------
  /** Wall HP removed per hit. */
  damage: number;
  /** Hits per second while PUNCH is held. */
  hitsPerSec: number;
  /** Noise radius in metres. Guards inside it walk over to investigate. */
  noise: number;
  /** Shop price in coins (0 = owned from the start). */
  price: number;
  /** The tool can be bought once this wall number is reached (0 = always). */
  unlockWall: number;

  // ---- feel -------------------------------------------------------------
  haptic: HapticKind;
  /** Camera shake per hit, in metres. Heavier tools shake more. */
  shake: number;
  /** Which impact sound the tool makes (recipes in game/Audio.ts). */
  sound: ImpactKind;
  style: PunchStyle;
  /** Punch timeline in seconds. windup + strike + recover must be <= 1 / hitsPerSec. */
  windup: number;
  strike: number;
  recover: number;
  /**
   * Preferred distance (m) between the player and the wall face while
   * punching. The player is nudged back to this distance so long tools do
   * not poke through the concrete.
   */
  reach: number;

  // ---- how the model sits in Hand_R (grip is at the tool's origin) --------
  holdPos: [number, number, number];
  /** Euler XYZ in radians. */
  holdRot: [number, number, number];
  /** Both hands move to the grips (jackhammer). */
  twoHanded: boolean;
}

const HALF_PI = Math.PI / 2;

export const TOOLS: ToolDef[] = [
  {
    id: 1,
    name: 'Hand Wraps',
    model: 'tools/Tool_1_HandWraps.glb',
    icon: 'ui_icons/icon_Tool_1_HandWraps.png',
    damage: 4,
    hitsPerSec: 3.0,
    noise: 2,
    price: 0,
    unlockWall: 0,
    haptic: 'light',
    shake: 0.05,
    sound: 'wraps',
    style: 'jab',
    windup: 0,
    strike: 0.08,
    recover: 0.15,
    reach: 0.62,
    holdPos: [0, 0, 0],
    holdRot: [0, 0, 0],
    twoHanded: false,
  },
  {
    id: 2,
    name: 'Brass Knuckles',
    model: 'tools/Tool_2_BrassKnuckles.glb',
    icon: 'ui_icons/icon_Tool_2_BrassKnuckles.png',
    damage: 8,
    hitsPerSec: 3.0,
    noise: 3,
    price: 300,
    unlockWall: 1,
    haptic: 'light',
    shake: 0.07,
    sound: 'brass',
    style: 'jab',
    windup: 0,
    strike: 0.08,
    recover: 0.15,
    reach: 0.68,
    holdPos: [0, 0, 0],
    holdRot: [0, 0, 0],
    twoHanded: false,
  },
  {
    id: 3,
    name: 'Hammer',
    model: 'tools/Tool_3_Hammer.glb',
    icon: 'ui_icons/icon_Tool_3_Hammer.png',
    damage: 15,
    hitsPerSec: 2.0,
    noise: 5,
    price: 900,
    unlockWall: 2,
    haptic: 'medium',
    shake: 0.11,
    sound: 'hammer',
    style: 'swing',
    windup: 0.14,
    strike: 0.09,
    recover: 0.2,
    reach: 0.75,
    holdPos: [0, 0, 0],
    // The hammer face points +X in the file; turn it to face forward (+Z).
    holdRot: [0, -HALF_PI, 0],
    twoHanded: false,
  },
  {
    id: 4,
    name: 'Sledgehammer',
    model: 'tools/Tool_4_Sledgehammer.glb',
    icon: 'ui_icons/icon_Tool_4_Sledgehammer.png',
    damage: 32,
    hitsPerSec: 1.0,
    noise: 8,
    price: 2400,
    unlockWall: 4,
    haptic: 'heavy',
    shake: 0.24,
    sound: 'sledge',
    style: 'overhead',
    windup: 0.34,
    strike: 0.12,
    recover: 0.38,
    reach: 1.15,
    holdPos: [0, 0, 0],
    holdRot: [0, -HALF_PI, 0],
    twoHanded: false,
  },
  {
    id: 5,
    name: 'Pickaxe',
    model: 'tools/Tool_5_Pickaxe.glb',
    icon: 'ui_icons/icon_Tool_5_Pickaxe.png',
    damage: 55,
    hitsPerSec: 0.9,
    noise: 9,
    price: 6800,
    unlockWall: 6,
    haptic: 'medium',
    shake: 0.2,
    sound: 'pick',
    style: 'overhead',
    windup: 0.4,
    strike: 0.12,
    recover: 0.42,
    reach: 1.3,
    holdPos: [0, 0, 0],
    holdRot: [0, -HALF_PI, 0],
    twoHanded: false,
  },
  {
    id: 6,
    name: 'Jackhammer',
    model: 'tools/Tool_6_Jackhammer.glb',
    icon: 'ui_icons/icon_Tool_6_Jackhammer.png',
    damage: 120,
    hitsPerSec: 6.0,
    noise: 14,
    price: 15000,
    unlockWall: 9,
    haptic: 'continuous',
    shake: 0.13,
    sound: 'jack',
    style: 'jackhammer',
    windup: 0,
    strike: 0,
    recover: 0,
    reach: 1.2,
    // Grip centre sits between both hands; the chisel (-Y in the file) is
    // tipped forward so it bites into the wall.
    holdPos: [0.21, 0, 0],
    holdRot: [-1.25, 0, 0],
    twoHanded: true,
  },
];

export function getTool(id: number): ToolDef {
  return TOOLS.find((t) => t.id === id) ?? TOOLS[0];
}

/** "dmg · speed · noise" line used on the shop cards. */
export function toolStatLine(t: ToolDef): string {
  return `DMG ${t.damage} · ${t.hitsPerSec.toFixed(1)}/S · NOISE ${t.noise}M`;
}
