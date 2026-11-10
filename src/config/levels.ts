/**
 * LEVELS - the 10 walls.
 *
 * Every layout is plain data; Level.ts builds the 3D scene from it.
 *
 * Coordinates (metres):
 *   x = sideways, 0 is the centre of the breakable wall segment
 *   z = distance from the wall face (0 = touching the wall, `depth` = back fence)
 *
 * Balancing cheatsheet:
 *   wallHp      how long the wall takes (HP / (tool damage * hits per second))
 *   guardSpeed  patrol speed in m/s (the player runs 3.5 m/s)
 *   guards      one entry per guard; `path` is a waypoint loop
 *   cover       props the player can HIDE next to (they also block flashlights)
 *   searchlight the watchtower beam (levels 5+)
 *   parTime     seconds for the third star (time adds up over retries)
 */

export type Vec2 = [number, number];
export type CoverType = 'crate' | 'sandbags' | 'barrel';

export interface CoverDef {
  type: CoverType;
  x: number;
  z: number;
  /** Sandbags only: true = the row runs along Z instead of X. */
  turned?: boolean;
}

export interface GuardDef {
  /** Waypoint loop. Two points make the guard walk back and forth. */
  path: Vec2[];
  /** Index of the waypoint the guard starts at (default 0). */
  start?: number;
  /** Per-guard speed multiplier (default 1). */
  speedMul?: number;
}

export interface SearchlightDef {
  /** The beam swings between these headings (degrees, 0 = +Z, clockwise seen from above is negative). */
  fromDeg: number;
  toDeg: number;
  /** Seconds for a full there-and-back sweep. Lower = harder. */
  period: number;
  /** Beam length (m) and half angle (degrees). */
  length: number;
  halfAngleDeg: number;
  /** The beam fills the detection meter this much faster than a flashlight. */
  fillMul: number;
}

export interface LevelDef {
  id: number;
  /** Short name shown on the WALLS screen. */
  name: string;
  /** One-line tip shown when the level starts. */
  hint?: string;
  wallHp: number;
  /** Play area size in metres. */
  width: number;
  depth: number;
  /** Seconds allowed for the "under par" star. */
  parTime: number;
  /** Guard patrol speed (m/s). */
  guardSpeed: number;
  guards: GuardDef[];
  cover: CoverDef[];
  /** Czech hedgehogs: block movement and sight, but you cannot hide at them. */
  hedgehogs: Vec2[];
  coins: Vec2[];
  /** X positions of street lamps along the wall. */
  lamps: number[];
  searchlight?: SearchlightDef;
  /** Where the player starts. */
  start: Vec2;
}

// ---- small helpers to keep the layouts readable ---------------------------

/** Rectangular patrol loop, walked in the order the corners are given. */
function rect(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

const crate = (x: number, z: number): CoverDef => ({ type: 'crate', x, z });
const barrel = (x: number, z: number): CoverDef => ({ type: 'barrel', x, z });
const sandbags = (x: number, z: number, turned = false): CoverDef => ({ type: 'sandbags', x, z, turned });

/** Searchlight preset; the tower always stands at the back right corner. */
function beam(period: number, fillMul = 2.2): SearchlightDef {
  return { fromDeg: -103, toDeg: -160, period, length: 22, halfAngleDeg: 6.5, fillMul };
}

// ---- the walls ------------------------------------------------------------

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'FIRST CRACK',
    hint: 'Walk to the marked wall and hold PUNCH. Tap HIDE next to the crate when the flashlight comes close.',
    wallHp: 300,
    width: 20,
    depth: 13,
    parTime: 70,
    guardSpeed: 1.4,
    guards: [{ path: rect(-7, 2.9, 7, 8.2) }],
    cover: [crate(-2.4, 1.2), barrel(2.4, 1.0)],
    hedgehogs: [
      [-6.4, 11],
      [4.4, 5.6],
    ],
    coins: [
      [-8.6, 1.4],
      [8.6, 1.4],
      [0, 5.6],
      [-4, 10.6],
      [5.4, 11.2],
    ],
    lamps: [-6, 6],
    start: [0, 11.4],
  },
  {
    id: 2,
    name: 'TWO SHADOWS',
    hint: 'Punches make noise. Guards inside the noise ring walk over to look.',
    wallHp: 480,
    width: 20,
    depth: 13,
    parTime: 80,
    guardSpeed: 1.55,
    guards: [
      {
        path: [
          [-8, 3.0],
          [8, 3.0],
        ],
      },
      { path: rect(6, 6.2, -6, 10.6), start: 2 },
    ],
    cover: [crate(2.5, 1.2), sandbags(-3.2, 1.3), crate(0.4, 8.3), barrel(-8.4, 5.2)],
    hedgehogs: [
      [7.8, 12],
      [-8.4, 11.6],
    ],
    coins: [
      [-8.8, 1.2],
      [8.8, 1.2],
      [-3, 8.3],
      [4, 8.3],
      [0, 12.2],
    ],
    lamps: [-6, 6],
    start: [-5.5, 12.3],
  },
  {
    id: 3,
    name: 'CROSSFIRE',
    hint: 'A guard who stops near you looks left and right. Stay down until he moves on.',
    wallHp: 700,
    width: 22,
    depth: 13,
    parTime: 90,
    guardSpeed: 1.7,
    guards: [
      { path: rect(-9, 3.0, -1.2, 6.6) },
      {
        path: [
          [4.2, 2.8],
          [4.2, 11],
        ],
        start: 1,
      },
    ],
    cover: [crate(-2.6, 1.1), crate(2.4, 1.3), barrel(1.7, 4.9), sandbags(-5, 9), barrel(8.2, 7)],
    hedgehogs: [
      [-7.6, 10.8],
      [7.6, 2.2],
      [0.2, 10.2],
    ],
    coins: [
      [-9.6, 1.3],
      [9.6, 1.3],
      [-5, 5],
      [7.4, 9.8],
      [-2, 11.6],
    ],
    lamps: [-8.4, 8.4],
    start: [-6.5, 12.3],
  },
  {
    id: 4,
    name: 'THREE WATCHMEN',
    wallHp: 950,
    width: 22,
    depth: 13,
    parTime: 100,
    guardSpeed: 1.8,
    guards: [
      {
        path: [
          [-9.4, 3.0],
          [9.4, 3.0],
        ],
      },
      { path: rect(-8.2, 5.6, -1.6, 10.6) },
      { path: rect(8.2, 10.6, 1.6, 5.6) },
    ],
    cover: [crate(-2.5, 1.1), sandbags(3.3, 1.2), crate(0, 8.1), barrel(-9.8, 7.4), barrel(9.8, 7.4)],
    hedgehogs: [
      [-5, 12],
      [5, 12],
      [-4.9, 8.1],
    ],
    coins: [
      [-9.8, 1.2],
      [9.8, 1.2],
      [-4.9, 4.3],
      [4.9, 8.1],
      [0, 12.2],
      [0, 4.6],
    ],
    lamps: [-8.4, 8.4],
    start: [6.5, 12.3],
  },
  {
    id: 5,
    name: 'SEARCHLIGHT',
    hint: 'The watchtower beam sweeps the ground. Props cast a safe shadow, so punch from behind them.',
    wallHp: 1250,
    width: 24,
    depth: 13,
    parTime: 115,
    guardSpeed: 1.9,
    guards: [
      { path: rect(-10, 3.0, -1.4, 7), start: 3 },
      { path: rect(10, 9, 3.6, 3.2) },
      {
        path: [
          [-9, 10.8],
          [7, 10.8],
        ],
      },
    ],
    cover: [crate(1.5, 2.3), crate(-2.6, 1.1), barrel(3.1, 1.0), sandbags(-5.6, 8.9), crate(6.8, 6.1), barrel(-10.6, 9)],
    hedgehogs: [
      [-5.6, 5],
      [0.5, 7.4],
      [9.8, 11.6],
    ],
    coins: [
      [-10.8, 1.2],
      [10.8, 1.2],
      [-5.6, 11.9],
      [6.8, 7.9],
      [0.5, 5.4],
      [-8, 5],
    ],
    lamps: [-8.4, 8.4],
    searchlight: beam(12),
    start: [-8.5, 12.3],
  },
  {
    id: 6,
    name: 'TIGHT ROUNDS',
    wallHp: 1600,
    width: 24,
    depth: 13,
    parTime: 125,
    guardSpeed: 2.0,
    guards: [
      {
        path: [
          [-10.4, 3.35],
          [10.4, 3.35],
        ],
        start: 1,
      },
      { path: rect(-9, 5.6, -2, 9.4) },
      { path: rect(9, 11.2, 2, 6.2) },
    ],
    cover: [
      crate(-2.5, 1.1),
      crate(1.75, 2.15),
      sandbags(4.2, 1.2),
      barrel(-4.4, 1.0),
      crate(-5.5, 7.5),
      barrel(5.5, 8.7),
      barrel(0, 11.6),
    ],
    hedgehogs: [
      [-10.6, 11.4],
      [10.6, 4.9],
      [0, 6.6],
    ],
    coins: [
      [-10.8, 1.2],
      [10.8, 1.2],
      [-5.5, 11.2],
      [5.5, 4.6],
      [0, 8.6],
      [-10.6, 7.5],
    ],
    lamps: [-8.4, -3.6, 3.6, 8.4],
    searchlight: beam(11),
    start: [7.5, 12.3],
  },
  {
    id: 7,
    name: 'FOUR CORNERS',
    wallHp: 2000,
    width: 24,
    depth: 13,
    parTime: 135,
    guardSpeed: 2.1,
    guards: [
      { path: rect(-10.4, 3.3, -1.6, 6.4) },
      { path: rect(10.4, 6.4, 1.6, 3.3), start: 1 },
      { path: rect(-9.4, 7.8, -1.4, 10.4), start: 2 },
      { path: rect(9.4, 10.4, 1.4, 7.8), start: 3 },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.2, 1.3),
      crate(0, 7.4),
      sandbags(6, 4.7),
      barrel(-6, 4.7),
      barrel(11, 9.6),
    ],
    hedgehogs: [
      [-5, 9.1],
      [5, 9.1],
      [0, 4.6],
    ],
    coins: [
      [-10.9, 1.2],
      [10.9, 1.2],
      [-6, 7.4],
      [6, 7.4],
      [0, 12.3],
      [-10.9, 12],
      [3.4, 4.7],
    ],
    lamps: [-8.4, -3.6, 3.6, 8.4],
    searchlight: beam(10.5),
    start: [-6, 12.3],
  },
  {
    id: 8,
    name: 'NO QUIET HOUR',
    wallHp: 2500,
    width: 26,
    depth: 13,
    parTime: 145,
    guardSpeed: 2.2,
    guards: [
      {
        path: [
          [-11.4, 3.3],
          [11.4, 3.3],
        ],
      },
      { path: rect(-10.4, 5.4, -2.4, 9), start: 1 },
      { path: rect(10.4, 9, 2.4, 5.4), start: 3 },
      {
        path: [
          [10.4, 11.4],
          [-10.4, 11.4],
        ],
      },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      sandbags(4.4, 1.2),
      barrel(-4.6, 1.0),
      crate(-6.4, 7.2),
      crate(6.4, 7.2),
      barrel(0, 7.2),
      sandbags(0, 10.1),
    ],
    hedgehogs: [
      [-11.6, 9.8],
      [11.6, 6],
      [-4.4, 4.35],
      [4.4, 12.4],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-6.4, 4.2],
      [6.4, 10.2],
      [0, 4.3],
      [-11.9, 12.2],
      [8.6, 4.2],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(9.5, 2.4),
    start: [3.3, 12.4],
  },
  {
    id: 9,
    name: 'FULL HOUSE',
    wallHp: 3100,
    width: 26,
    depth: 13,
    parTime: 155,
    guardSpeed: 2.3,
    guards: [
      { path: rect(-11.4, 3.3, -1.6, 6) },
      { path: rect(11.4, 6, 1.6, 3.3), start: 2 },
      { path: rect(-10.4, 7.8, -4.4, 10.4), start: 1 },
      { path: rect(10.4, 10.4, 4.4, 7.8), start: 3 },
      {
        path: [
          [0, 4.4],
          [0, 10.2],
        ],
        start: 1,
      },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.4, 1.3),
      barrel(5.6, 1.1),
      crate(-2.3, 7.2),
      crate(2.3, 9.8),
      barrel(-7.4, 6.9),
      sandbags(7.4, 7),
    ],
    hedgehogs: [
      [-7.4, 9.1],
      [7.4, 9.1],
      [-9.3, 12.0],
      [11.8, 1.6],
    ],
    coins: [
      [-11.9, 1.2],
      [9.4, 1.2],
      [-7.4, 4.5],
      [7.4, 4.5],
      [-2.3, 12.2],
      [2.3, 6.9],
      [11.9, 12.2],
      [-11.9, 7],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(9, 2.4),
    start: [-11, 12.4],
  },
  {
    id: 10,
    name: 'DER LETZTE SCHLAG',
    hint: 'Last wall. Loud tools bring everyone running, so pick your moment.',
    wallHp: 4200,
    width: 26,
    depth: 13,
    parTime: 170,
    guardSpeed: 2.45,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
        start: 1,
      },
      { path: rect(-10.6, 5.2, -2.2, 8.2), start: 2 },
      { path: rect(10.6, 8.2, 2.2, 5.2) },
      { path: rect(-9.6, 10, -0.8, 12), start: 1 },
      { path: rect(9.6, 12, 0.8, 10), start: 3 },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.4, 1.3),
      sandbags(5.8, 1.3),
      crate(-6.4, 6.7),
      crate(6.4, 6.7),
      barrel(0, 6.7),
      barrel(-11.8, 9.2),
      barrel(11.8, 9.2),
    ],
    hedgehogs: [
      [-4.4, 4.25],
      [4.4, 4.25],
      [0, 9.1],
      [-11.9, 4.6],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-6.4, 4.2],
      [6.4, 9.1],
      [0, 4.3],
      [-5, 11],
      [5, 11],
      [11.9, 12.3],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(8, 2.6),
    start: [11, 12.3],
  },
];

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(id: number): LevelDef {
  return LEVELS[Math.max(1, Math.min(LEVEL_COUNT, id)) - 1];
}
