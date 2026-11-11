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
 *   mines       buried mines (levels 11+): step on one and it is over
 *   tripwires   wires between two posts (levels 13+): touching one sets off a
 *               siren and every guard comes running
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
  /** A guard dog instead of a guard (see TUNING.dog). */
  dog?: boolean;
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
  /** Buried mines. They blink when you are within the Mine Sense range. */
  mines?: Vec2[];
  /** Tripwires, each from one post to the other. */
  tripwires?: [Vec2, Vec2][];
  /** "ACHTUNG MINEN" warning signs (set dressing). */
  signs?: Vec2[];
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

/** `n` mines from x0 to x1 at depth z, zig-zagging by `zag` metres. */
function mineRow(x0: number, x1: number, z: number, n: number, zag = 0.35): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push([+(x0 + (x1 - x0) * t).toFixed(2), +(z + (i % 2 ? zag : -zag)).toFixed(2)]);
  }
  return out;
}

/** Small cluster of mines around a point. */
function mineCluster(x: number, z: number, r = 0.9): Vec2[] {
  return [
    [x, z],
    [+(x - r).toFixed(2), +(z + r * 0.6).toFixed(2)],
    [+(x + r).toFixed(2), +(z - r * 0.5).toFixed(2)],
  ];
}

const wire = (x0: number, z0: number, x1: number, z1: number): [Vec2, Vec2] => [
  [x0, z0],
  [x1, z1],
];

// ---- the walls ------------------------------------------------------------

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'FIRST CRACK',
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
  // ---------------------------------------------------------------------------
  // WALLS 11-20: minefields and tripwires
  // ---------------------------------------------------------------------------
  {
    id: 11,
    name: 'MINENFELD',
    wallHp: 4800,
    width: 26,
    depth: 13,
    parTime: 175,
    guardSpeed: 2.3,
    guards: [
      {
        path: [
          [-11.5, 3.3],
          [11.5, 3.3],
        ],
      },
      {
        path: [
          [-6, 4.6],
          [-6, 9.8],
        ],
      },
      {
        path: [
          [11, 10.7],
          [-11, 10.7],
        ],
        start: 1,
      },
    ],
    cover: [crate(-2.6, 1.1), crate(1.75, 2.15), barrel(3.0, 0.9), sandbags(-6.4, 1.3), crate(9, 5.0), barrel(-10, 5.0), sandbags(2, 9.2)],
    hedgehogs: [
      [10.6, 12.3],
      [-1.2, 12.2],
    ],
    mines: [...mineRow(-12.2, -8.2, 7, 4), ...mineRow(-3.8, 3.2, 7, 7), ...mineRow(7.2, 12.2, 7, 5)],
    signs: [
      [-12.4, 8.6],
      [12.4, 8.6],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [5.2, 7],
      [0, 5.2],
      [8, 9.2],
      [-3, 9.4],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(9, 2.4),
    start: [-0.2, 12.4],
  },
  {
    id: 12,
    name: 'SLALOM',
    wallHp: 5400,
    width: 26,
    depth: 14,
    parTime: 185,
    guardSpeed: 2.35,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
        start: 1,
      },
      { path: rect(-11, 6.0, -6.6, 11.6) },
      { path: rect(11, 11.6, 6.6, 6.4), start: 2 },
    ],
    cover: [crate(-2.6, 1.1), crate(1.75, 2.15), sandbags(4.6, 1.2), barrel(-4.6, 1.0), crate(-1.5, 8.8), barrel(2.6, 8.8), crate(-8.8, 4.6)],
    hedgehogs: [
      [0.4, 5.3],
      [-12, 13.2],
    ],
    mines: [...mineRow(-5.2, 5.2, 7.1, 7, 0.2), ...mineRow(-4.4, 4.4, 10.6, 5, 0.2), ...mineCluster(9, 4.6, 0.8)],
    signs: [
      [-6, 13.4],
      [6, 13.4],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [0, 8.9],
      [-8.8, 8.8],
      [8.8, 8.8],
      [0, 12.4],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(9, 2.4),
    start: [-1.8, 12.8],
  },
  {
    id: 13,
    name: 'STOLPERDRAHT',
    wallHp: 6100,
    width: 26,
    depth: 13,
    parTime: 190,
    guardSpeed: 2.4,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
      },
      { path: rect(-10.8, 5.4, -3, 8.4), start: 2 },
      { path: rect(10.8, 8.4, 3, 5.4) },
      {
        path: [
          [-10, 11.2],
          [10, 11.2],
        ],
        start: 1,
      },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.6, 1.3),
      crate(-1.2, 6.9),
      crate(1.2, 6.9),
      barrel(-12, 9.6),
      barrel(12, 9.6),
    ],
    hedgehogs: [
      [-6.6, 9.8],
      [6.6, 9.8],
    ],
    tripwires: [wire(-0.65, 6.9, 0.65, 6.9), wire(-6.05, 9.8, -1.4, 9.8), wire(1.4, 9.8, 6.05, 9.8)],
    mines: [...mineCluster(-9.2, 2.0, 0.7), ...mineCluster(9.4, 1.9, 0.7)],
    signs: [[-12.4, 1.2]],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [0, 8.4],
      [-8.6, 12.3],
      [8.6, 12.3],
      [0, 4.4],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(8.8, 2.4),
    start: [7, 12.4],
  },
  {
    id: 14,
    name: 'DOUBLE FENCE',
    wallHp: 6800,
    width: 26,
    depth: 14,
    parTime: 200,
    guardSpeed: 2.45,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
        start: 1,
      },
      { path: rect(-11, 5.4, -4.2, 8.2) },
      { path: rect(11, 8.2, 4.2, 5.4), start: 1 },
      { path: rect(-3, 9.6, 3, 12.6), start: 3 },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      sandbags(4.6, 1.2),
      barrel(-4.6, 1.0),
      crate(0, 6.8),
      barrel(-8, 10.6),
      barrel(8, 10.6),
      sandbags(-11.4, 12.4, true),
    ],
    hedgehogs: [
      [-5.6, 10.6],
      [5.6, 10.6],
    ],
    tripwires: [wire(-7.7, 10.6, -6.15, 10.6), wire(6.15, 10.6, 7.7, 10.6), wire(-0.6, 6.8, -3.3, 6.8)],
    mines: [...mineRow(-12.2, -8.6, 9.5, 3, 0.2), ...mineRow(8.6, 12.2, 9.5, 3, 0.2), ...mineRow(0.9, 3.0, 7.8, 3)],
    signs: [
      [-12.4, 13.6],
      [12.4, 13.6],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-9.8, 12.4],
      [9.8, 12.4],
      [0, 8.4],
      [-7.6, 4.3],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(8.5, 2.5),
    start: [-10.6, 13.4],
  },
  {
    id: 15,
    name: 'NIEMANDSLAND',
    wallHp: 7600,
    width: 26,
    depth: 15,
    parTime: 210,
    guardSpeed: 2.5,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
      },
      { path: rect(-11, 5.6, -1.4, 9.2), start: 1 },
      { path: rect(11, 9.2, 1.4, 5.6), start: 3 },
      {
        path: [
          [11, 12.6],
          [-11, 12.6],
        ],
      },
    ],
    cover: [crate(-2.6, 1.1), crate(1.75, 2.15), barrel(3.0, 0.9), sandbags(-5.6, 1.3), barrel(-12.2, 7.4), barrel(12.2, 12.4)],
    hedgehogs: [
      [-6.4, 7.4],
      [0, 7.4],
      [6.4, 7.4],
      [-3.2, 11],
      [3.2, 11],
      [-8.8, 14.2],
    ],
    mines: [
      ...mineRow(-11.6, -7.8, 10.9, 3, 0.25),
      ...mineRow(-1.6, 1.6, 10.9, 3, 0.25),
      ...mineRow(7.8, 11.6, 10.9, 3, 0.25),
      ...mineRow(-4.2, -2.6, 4.45, 2, 0),
      ...mineRow(3.4, 5.0, 4.45, 2, 0),
    ],
    signs: [
      [-12.4, 14.6],
      [12.4, 14.6],
      [0, 14.7],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-3.2, 9],
      [3.2, 9],
      [0, 5.2],
      [9.6, 14.2],
      [-11.9, 8.6],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(8.2, 2.5),
    start: [6.2, 14.4],
  },
  {
    id: 16,
    name: 'SPIDERWEB',
    wallHp: 8400,
    width: 26,
    depth: 14,
    parTime: 220,
    guardSpeed: 2.5,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
        start: 1,
      },
      { path: rect(-11, 5.4, -3.6, 8.6), start: 2 },
      { path: rect(11, 8.6, 3.6, 5.4) },
      { path: rect(-9, 10.4, 9, 12.4), start: 1 },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      sandbags(4.6, 1.2),
      barrel(-4.6, 1.0),
      crate(-1.4, 7.1),
      crate(1.4, 7.1),
      barrel(-12.2, 10),
      barrel(12.2, 10),
    ],
    hedgehogs: [
      [-5.8, 13.4],
      [5.8, 13.4],
      [0, 4.6],
    ],
    tripwires: [
      wire(-0.85, 7.1, 0.85, 7.1),
      wire(-2.0, 7.1, -2.6, 5.6),
      wire(2.0, 7.1, 2.6, 5.6),
      wire(-0.6, 4.6, -2.2, 4.6),
      wire(0.6, 4.6, 2.2, 4.6),
      wire(-5.2, 13.4, -1.0, 13.4),
      wire(1.0, 13.4, 5.2, 13.4),
    ],
    mines: [...mineCluster(-9.4, 1.8, 0.7), ...mineCluster(9.4, 1.8, 0.7)],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [0, 9.0],
      [-8.6, 9.6],
      [8.6, 9.6],
      [0, 13.6],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(8, 2.5),
    start: [11.8, 12.8],
  },
  {
    id: 17,
    name: 'CHECKPOINT',
    wallHp: 9300,
    width: 26,
    depth: 15,
    parTime: 230,
    guardSpeed: 2.55,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
      },
      {
        path: [
          [-11.6, 6.3],
          [11.6, 6.3],
        ],
        start: 1,
      },
      { path: rect(-10.4, 8.4, -2.6, 11), start: 1 },
      { path: rect(10.4, 11, 2.6, 8.4), start: 3 },
      {
        path: [
          [0, 7.8],
          [0, 11.2],
        ],
      },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.6, 1.3),
      sandbags(5.8, 1.3),
      crate(-6.6, 4.8),
      crate(6.6, 4.8),
      barrel(-12.2, 12.4),
    ],
    hedgehogs: [
      [-1.6, 4.8],
      [1.6, 4.8],
      [12.2, 9.8],
    ],
    tripwires: [wire(-1.0, 4.8, 1.0, 4.8), wire(-6.0, 4.8, -2.2, 4.8), wire(2.2, 4.8, 6.0, 4.8)],
    mines: [...mineRow(-12.2, -8.2, 4.8, 3, 0.2), ...mineRow(8.2, 12.2, 4.8, 3, 0.2), ...mineCluster(-6.6, 13.2, 0.7)],
    signs: [[12.4, 14.6]],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-6.6, 10],
      [6.6, 10],
      [0, 13.4],
      [-4, 7.6],
      [4, 7.6],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(7.8, 2.6),
    start: [-11.4, 14.4],
  },
  {
    id: 18,
    name: 'TODESSTREIFEN',
    wallHp: 10200,
    width: 26,
    depth: 15,
    parTime: 240,
    guardSpeed: 2.6,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
        start: 1,
      },
      { path: rect(-11, 5.4, -3.8, 8) },
      { path: rect(11, 8, 3.8, 5.4), start: 2 },
      { path: rect(-8.4, 10.6, -2, 12.2), start: 1 },
      { path: rect(8.4, 12.2, 2, 10.6), start: 3 },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      sandbags(4.6, 1.2),
      barrel(-4.6, 1.0),
      crate(0, 6.7),
      barrel(-12.2, 11.2),
      crate(-10.2, 13.4),
      barrel(12.2, 11.2),
      sandbags(0, 11.4),
    ],
    hedgehogs: [
      [-6.4, 9.2],
      [6.4, 9.2],
      [0, 14.4],
    ],
    tripwires: [wire(-5.8, 9.2, -1.6, 9.2), wire(1.6, 9.2, 5.8, 9.2), wire(0.7, 6.7, 2.4, 6.7)],
    mines: [
      ...mineRow(-12.2, -7.4, 9.2, 4, 0.2),
      ...mineRow(7.4, 12.2, 9.2, 4, 0.2),
      ...mineCluster(-2, 4.6, 0.6),
      ...mineCluster(2.6, 4.6, 0.6),
    ],
    signs: [
      [-12.4, 14.6],
      [12.4, 14.6],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [0, 9.2],
      [-6.4, 11.6],
      [6.4, 11.6],
      [-12, 12.6],
      [12, 14.4],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(7.5, 2.6),
    start: [-11.6, 14.4],
  },
  {
    id: 19,
    name: 'LAST LIGHT',
    wallHp: 11200,
    width: 26,
    depth: 15,
    parTime: 250,
    guardSpeed: 2.7,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
      },
      { path: rect(-11, 5.4, -2.6, 8.25), start: 2 },
      { path: rect(11, 8.25, 2.6, 5.4) },
      { path: rect(-10, 10.4, -2.2, 13.2), start: 3 },
      { path: rect(10, 13.2, 2.2, 10.4), start: 1 },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.6, 1.3),
      sandbags(5.8, 1.3),
      crate(0, 9.3),
      barrel(-12.2, 9.4),
      barrel(12.2, 9.4),
    ],
    hedgehogs: [
      [-6.2, 9.3],
      [6.2, 9.3],
      [0, 4.6],
      [-12.2, 14.4],
    ],
    tripwires: [wire(-0.6, 9.3, -5.6, 9.3), wire(0.6, 9.3, 5.6, 9.3), wire(-0.6, 4.6, -1.6, 7.6), wire(0.6, 4.6, 1.6, 7.6)],
    mines: [...mineRow(-12.2, -7.4, 4.35, 4, 0.08), ...mineRow(7.4, 12.2, 4.35, 4, 0.08), ...mineCluster(0, 12.4, 0.8)],
    signs: [
      [-4, 14.7],
      [4, 14.7],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-3, 6.9],
      [3, 6.9],
      [0, 11],
      [-6.2, 14.4],
      [6.2, 14.4],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(7.2, 2.7),
    start: [-11.4, 13.8],
  },
  {
    id: 20,
    name: 'DIE MAUER FÄLLT',
    wallHp: 12500,
    width: 26,
    depth: 15,
    parTime: 270,
    guardSpeed: 2.8,
    guards: [
      {
        path: [
          [-11.6, 3.3],
          [11.6, 3.3],
        ],
        start: 1,
      },
      {
        path: [
          [-11.6, 6.4],
          [11.6, 6.4],
        ],
      },
      { path: rect(-10.6, 8.6, -2, 11.4), start: 2 },
      { path: rect(10.6, 11.4, 2, 8.6) },
      {
        path: [
          [0, 7.8],
          [0, 13.6],
        ],
        start: 1,
      },
    ],
    cover: [
      crate(-2.6, 1.1),
      crate(1.75, 2.15),
      barrel(3.0, 0.9),
      sandbags(-5.6, 1.3),
      sandbags(5.8, 1.3),
      crate(-6.4, 4.9),
      crate(6.4, 4.9),
      barrel(-12.2, 12.6),
      barrel(12.2, 12.6),
    ],
    hedgehogs: [
      [-1.8, 4.9],
      [1.8, 4.9],
      [-6.2, 13.4],
      [6.2, 13.4],
    ],
    tripwires: [
      wire(-1.25, 4.9, 1.25, 4.9),
      wire(-5.85, 4.9, -2.35, 4.9),
      wire(2.35, 4.9, 5.85, 4.9),
      wire(-5.6, 13.4, -1.0, 13.4),
      wire(1.0, 13.4, 5.6, 13.4),
    ],
    mines: [
      ...mineRow(-12.2, -8.2, 4.9, 3, 0.2),
      ...mineRow(8.2, 12.2, 4.9, 3, 0.2),
      ...mineCluster(-6.4, 9.9, 0.7),
      ...mineCluster(6.4, 9.9, 0.7),
    ],
    signs: [
      [-12.4, 14.6],
      [12.4, 14.6],
      [2.6, 14.8],
    ],
    coins: [
      [-11.9, 1.2],
      [11.9, 1.2],
      [-4, 8],
      [4, 8],
      [0, 14.4],
      [-9.6, 14.4],
      [9.6, 14.4],
      [-12, 8],
    ],
    lamps: [-10.8, -3.6, 3.6, 10.8],
    searchlight: beam(7, 2.8),
    start: [-11.4, 14.4],
  },
];

// ---------------------------------------------------------------------------
// WALLS 21-30: guard dogs.
// Each one remixes the layout of wall (id - 10), mirrored left/right, then
// adds dogs, more HP and faster patrols.
// ---------------------------------------------------------------------------

const mx = ([x, z]: Vec2): Vec2 => [x === 0 ? 0 : -x, z];

function remix(
  baseId: number,
  id: number,
  name: string,
  wallHp: number,
  dogs: Vec2[][],
  extra: Partial<LevelDef> = {},
): LevelDef {
  const b = LEVELS[baseId - 1];
  return {
    ...b,
    id,
    name,
    wallHp,
    parTime: b.parTime + 25,
    guardSpeed: Math.min(2.95, b.guardSpeed + 0.15),
    guards: [
      ...b.guards.map((g) => ({ ...g, path: g.path.map(mx) })),
      ...dogs.map((path) => ({ path, dog: true })),
    ],
    cover: b.cover.map((c) => ({ ...c, x: c.x === 0 ? 0 : -c.x })),
    hedgehogs: b.hedgehogs.map(mx),
    coins: b.coins.map(mx),
    mines: b.mines?.map(mx),
    tripwires: b.tripwires?.map(([p0, p1]) => [mx(p0), mx(p1)] as [Vec2, Vec2]),
    signs: b.signs?.map(mx),
    start: mx(b.start),
    ...extra,
  };
}

LEVELS.push(
  remix(11, 21, 'HUNDESTAFFEL', 13500, [
    [
      [-7.6, 5.4],
      [-1.2, 5.4],
    ],
  ]),
  remix(12, 22, 'SPÜRNASE', 14500, [
    [
      [-6.5, 5.6],
      [-2, 5.6],
    ],
  ], { start: [-0.2, 13.4] }),
  remix(13, 23, 'BELLEN', 15500, [
    [
      [-4, 4.4],
      [4, 4.4],
    ],
  ], { start: [-12.2, 11.8] }),
  remix(14, 24, 'DOPPELWACHE', 16500, [
    [
      [-3.4, 9.6],
      [3.4, 9.6],
    ],
  ]),
  remix(15, 25, 'SCHATTENLAUF', 17500, [
    [
      [-6.4, 9.2],
      [6.4, 9.2],
    ],
  ], { start: [-12.2, 13.8] }),
  remix(16, 26, 'KETTENHUND', 18500, [
    [
      [-6.4, 4.2],
      [-6.4, 8.8],
    ],
    [
      [6.4, 8.8],
      [6.4, 4.2],
    ],
  ], { start: [9.4, 13.4] }),
  remix(17, 27, 'NACHTSCHICHT', 19500, [
    [
      [-4.2, 7.6],
      [4.2, 7.6],
    ],
    [
      [-9, 12.8],
      [-4, 12.8],
    ],
  ], { start: [9.4, 14.4] }),
  remix(18, 28, 'GRENZSTREIFEN', 20500, [
    [
      [-4.6, 4.3],
      [-4.6, 7.4],
    ],
    [
      [4.6, 7.4],
      [4.6, 4.3],
    ],
  ]),
  remix(19, 29, 'LETZTER ZUG', 21500, [
    [
      [-4, 10.9],
      [4, 10.9],
    ],
    [
      [-0.2, 5.8],
      [-0.2, 8.0],
    ],
  ]),
  remix(20, 30, 'FREIHEIT', 23000, [
    [
      [-4.2, 7.9],
      [4.2, 7.9],
    ],
    [
      [-8.8, 11.6],
      [-3.2, 11.6],
    ],
  ], { start: [7.8, 14.4] }),
);

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(id: number): LevelDef {
  return LEVELS[Math.max(1, Math.min(LEVEL_COUNT, id)) - 1];
}
