# BERLIRUNNER

Punch through. Don't get seen.

A stealth game for Android, set at dusk: punch a hole through one segment of the Berlin Wall
while guards patrol with flashlights. Built with Vite, TypeScript and Three.js, and packaged with Capacitor.

- 20 walls. From wall 11 there are buried mines (step on one and the attempt is over) and
  tripwires (a siren calls every guard).
- 6 tools and 6 body upgrades (speed, damage, stealth, quieter hits, mine sense, coin magnet).
- Raked-sand ground texture and a cinematic sunset main menu.
- Bouncy procedural animation: characters hop, squash and stretch, and their parts wobble on springs.
- All sounds are synthesised at runtime: concrete impacts per tool, footsteps in the sand,
  evening wind and crickets, guard whistles, a heartbeat when you are being spotted.

## Build a debug APK

Requirements: Node 22+, JDK 21, and the Android SDK (platform 36, build-tools 35 or newer), with
`ANDROID_HOME` pointing at it.

```bash
npm install
npm run build
npx cap add android        # first time only
npx cap sync android       # also runs scripts/configure-android.mjs (portrait, full screen, vibration)
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Install it with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

To sign local builds with the same key as the GitHub builds (so they update each other),
copy `android-keys/debug.keystore` to `~/.android/debug.keystore` first.

## Updating the game on a phone

Every push to GitHub builds a new APK (see **Build on GitHub** below). Each build has a higher
version number and is signed with the shared debug key in `android-keys/`, so a new APK installs
over the old one as an update and the save is kept. APKs built before that key was added were
signed with a random key: uninstall that version once before installing a newer one.

## Play in a browser

`npm run dev`, then open the URL it prints. Use the phone layout in devtools (390 x 844).
Keyboard: WASD or the arrow keys to move, Space to punch, H to hide, T to change tool, Esc to pause.

## Project layout

```
index.html                 canvas + UI root
capacitor.config.ts        app id, name, system bars
scripts/configure-android.mjs  patches the generated Android project after every `cap sync`
public/assets/             the original GLB models, PNG icons and crack decal (unchanged)
src/
  main.ts                  entry point, fonts
  config/
    tuning.ts              all global balance and feel numbers (speeds, detection, camera, economy)
    tools.ts               the six tools: damage, speed, noise, price, unlock, animation, sound
    upgrades.ts            the six body upgrades: prices and effect per level
    levels.ts              the twenty walls: HP, guards, routes, cover, coins, searchlight, mines, tripwires
  game/
    Game.ts                renderer, game states, wiring, main loop
    Level.ts               builds a level's scene from its config
    Player.ts              movement, punching, hiding
    Guard.ts               patrol, investigate, vision cone, searchlight
    Wall.ts                breakable segment: fracture swap, chunk removal, rubble, decals
    Hazards.ts             mines, tripwires and warning signs
    Tools.ts               tool attachment and punch poses
    FloatingBody.ts        bouncy procedural animation (hops, squash/stretch, spring-lagged parts)
    Detection.ts           vision cones and the 0-100 detection meter
    Collision.ts           2D collision and line of sight
    Input.ts               floating joystick, PUNCH, HIDE, tool button, keyboard
    CameraRig.ts           menu camera (slow orbit), follow camera, shake
    MenuScene.ts           sunset, sun glow and dust behind the main menu
    Effects.ts             dust, debris, noise rings, damage numbers, haptics
    Audio.ts               Web Audio synth sounds
    Assets.ts              GLB loading and cloning
    Save.ts                Capacitor Preferences save
  ui/
    UI.ts                  screen logic
    screens.ts             screen HTML
    icons.ts               inline SVG icons
    styles.css             "Dusk Ops" styling (dark panels, cut corners, hazard stripes)
```

## Balancing

Every number you are likely to tune is in `src/config/`, and each one has a comment.

- **Tools** (`tools.ts`): `damage`, `hitsPerSec` and `noise` control the main trade-off.
  Time to break a wall is `wallHp / (damage * hitsPerSec)`.
- **Walls** (`levels.ts`): `wallHp`, `guardSpeed`, guard `path` loops, `cover`, `parTime` and `searchlight.period`.
- **Detection** (`tuning.ts`): `fillNear`, `fillFar`, `drain` and `punchMultiplier` set how forgiving the guards are.
- **Evening light** (`tuning.ts` → `evening`): sky colours, sun colour/angle, fog and exposure.
- **Upgrades** (`upgrades.ts`): prices and the effect of each level.
- **Animation feel** (`game/FloatingBody.ts` → `PLAYER_STYLE`, `GUARD_STYLE`): hop height, squash, spring stiffness.

Open the game with `?debug` to get `__game` in the console. `__game.debugState()` shows the live
state, and `__game.debugInvisible = true` turns detection off while you test layouts.

## Build on GitHub

Every push runs `.github/workflows/android-apk.yml`, which builds the debug APK on GitHub.
Download it from the **Releases** page (`Mauerbrecher-debug.apk`), or from the run's
artifacts in the **Actions** tab. You can also start it by hand with "Run workflow".
