/**
 * TUNING - every global balance / feel number lives here.
 *
 * World layout used everywhere in the code:
 *   - metres, +Y up
 *   - the wall runs along X; its flat face (the side you punch) is at z = 0
 *   - the play area is z > 0 (towards the camera), x = 0 is the breakable segment
 */

export const COLORS = {
  ink: '#121212',
  paper: '#F1EDE4',
  yellow: '#FFC234',
  red: '#E8462E',
  muted: '#4A4740',
};

export const TUNING = {
  player: {
    /** Walk speed in m/s. */
    speed: 3.5,
    /** Collision radius in metres. */
    radius: 0.35,
    /** Punching only works this close to the wall face (m). */
    punchRange: 1.6,
    /** Extra sideways tolerance around the breakable segment (m). */
    punchSideMargin: 0.25,
    /** HIDE is available when the gap to a cover prop is below this (m). */
    hideRange: 0.7,
    /** How fast the body turns to its target heading (higher = snappier). */
    turnRate: 14,
    /** Joystick dead zone, 0..1. */
    deadZone: 0.18,
  },

  camera: {
    /** Pitch below the horizon in degrees (60-65 looks best). */
    pitchDeg: 62,
    /** Distance from the camera to the point it looks at (m). */
    distance: 28,
    /** Horizontal field of view in degrees; the vertical one is derived from the screen shape. */
    horizontalFovDeg: 22.5,
    /** Follow smoothing (higher = tighter follow). */
    followRate: 4.5,
    /**
     * The look-at point never gets closer to the wall than this. It is what
     * keeps the wall in the top third of the screen.
     */
    minTargetZ: 5.6,
    /** ...and never further back than depth - this. */
    backMargin: 5.8,
    /** Sideways margin kept between the look-at point and the level edge. */
    sideMargin: 4.5,
    /** How quickly a shake dies out (1/s). */
    shakeDecay: 9,
    /** Main menu camera: low, looking up at the wall. */
    menuPos: [2.8, 1.4, 12.8] as [number, number, number],
    menuLook: [-0.3, 2.6, 0] as [number, number, number],
    menuFovDeg: 72,
  },

  detection: {
    /** Vision cone length (m) and half angle (degrees). */
    coneLength: 6.5,
    coneHalfAngleDeg: 26,
    /** Meter fill per second at the far end of the cone ... */
    fillFar: 34,
    /** ... and right in front of the flashlight. */
    fillNear: 115,
    /** Multiplier while the player is punching. */
    punchMultiplier: 2,
    /** Meter drain per second while the player is not seen. */
    drain: 12,
    /** "?" appears above this meter value. */
    suspicious: 30,
    /** "!" appears above this meter value. */
    alert: 70,
    /** A hidden player is still seen when a guard is closer than this (m). */
    hiddenRevealDist: 1.5,
    /** Cone colour while calm / alerted. */
    coneColor: 0xffc234,
    coneAlertColor: 0xe8462e,
    coneOpacity: 0.26,
  },

  guard: {
    radius: 0.4,
    /** Turn speed in radians per second. */
    turnRate: 3.2,
    /** Pause at each waypoint: random between min and max seconds. */
    pauseMin: 1.0,
    pauseMax: 2.0,
    /** Head-turn sweep while paused, in degrees each side. */
    lookAngleDeg: 55,
    /** After a noise, guards investigate for this long (s). */
    investigateTime: 4,
    /** Speed multiplier while walking to a noise. */
    investigateSpeed: 1.25,
    /** They stop this far from the noise and look around (m). */
    investigateStopDist: 2.6,
    /** Speed multiplier while closing in on a spotted player ("!"). */
    alertSpeed: 0.75,
    /** They stop this far from where they last saw the player (m). */
    alertStopDist: 2.0,
  },

  /** Chase: what happens when a detection meter reaches 100. */
  chase: {
    /** Seconds a chaser must keep you in sight before you are caught. */
    escapeTime: 3,
    /** How fast the countdown refills while no chaser sees you (x real time). */
    refillRate: 0.5,
    /** A chaser gives up after losing sight of you for this long (s). */
    giveUpTime: 3.2,
    /** Chaser speed = min(maxSpeed, patrol speed * speedMul + speedAdd). The player runs 3.5 m/s. */
    speedMul: 1.4,
    speedAdd: 0.7,
    maxSpeed: 3.25,
    /** Caught instantly when a chaser that sees you gets this close (m). */
    catchDistance: 0.95,
    /** Other guards within this radius come to help (investigate the spot). */
    callRadius: 10,
    /** Detection meter left after a chaser gives up (still suspicious). */
    meterAfter: 55,
  },

  /** Throwable stones (distractions). */
  stones: {
    /** Stones at the start of every attempt, and the most you can carry. */
    start: 3,
    max: 5,
    /** Throw distance range (m): quick tap throws `tapRange` straight ahead. */
    minRange: 2,
    maxRange: 9.5,
    tapRange: 6,
    /** Guards inside this radius of the landing spot go and look (m). */
    noise: 7.5,
    /** How long they look around there (s). */
    investigateTime: 5,
    /** One fallen wall chunk in N leaves a stone you can pick up. */
    chunkStoneEvery: 3,
    /** Pick-up distance (m). */
    pickup: 0.75,
  },

  wall: {
    /** Chunks whose centre is below this height belong to the hole (m). */
    holeMaxHeight: 3.6,
    /** Fraction of hole chunks that must be gone before the hole is "through". */
    holeThroughFraction: 0.7,
    /** Maximum crack decals kept on the wall. */
    maxDecals: 9,
    /** Height range of the impact point on the wall face (m). */
    impactMinY: 0.75,
    impactMaxY: 1.55,
  },

  economy: {
    /** +1 coin for every N points of damage. */
    damagePerCoin: 5,
    /** Value of one coin pickup. */
    coinPickup: 25,
    /** Level-complete bonus = base + perLevel * level. */
    rewardBase: 300,
    rewardPerLevel: 150,
    /** Bonus factor when re-playing a wall that is already down. */
    replayRewardFactor: 0.5,
  },

  /** Evening light. Colours are hex, intensities in three.js units. */
  evening: {
    /** Sky dome, bottom (horizon) to top. */
    skyHorizon: 0xffb36b,
    skyMiddle: 0xd47f86,
    skyTop: 0x3a4278,
    /** Fog fades far things into the dusk haze. */
    fogColor: 0xd99a86,
    fogNear: 55,
    fogFar: 150,
    /** Hemisphere light: cool blue sky fill, warm ground bounce (cool shadows, warm light). */
    hemiSky: 0xa9b8f0,
    hemiGround: 0x5a4636,
    hemiIntensity: 1.25,
    /** Low golden sun (long shadows). Offset = direction the light comes from. */
    sunColor: 0xffc58a,
    sunIntensity: 2.7,
    sunOffset: [-19, 11, 11] as [number, number, number],
    /** Overall brightness after tone mapping. */
    exposure: 1.18,
  },

  render: {
    /** Never render above this device pixel ratio. */
    maxPixelRatio: 2,
    /** Lowest pixel ratio the adaptive quality may fall back to. */
    minPixelRatio: 1,
    /** If the average frame takes longer than this (ms), resolution drops one step. */
    slowFrameMs: 19.5,
    shadowMapSize: 1024,
  },
};

export const DEG = Math.PI / 180;
