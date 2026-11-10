# MAUERBRECHER

Punch through. Don't get seen.

A stealth game for Android: punch a hole through one segment of the Berlin Wall while guards
patrol with flashlights. Built with Vite, TypeScript and Three.js, and packaged with Capacitor.

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
    tools.ts               the six tools: damage, speed, noise, price, unlock, animation
    levels.ts              the ten walls: HP, guards, routes, cover, coins, searchlight
  game/
    Game.ts                renderer, game states, wiring, main loop
    Level.ts               builds a level's scene from its config
    Player.ts              movement, punching, hiding
    Guard.ts               patrol, investigate, vision cone, searchlight
    Wall.ts                breakable segment: fracture swap, chunk removal, rubble, decals
    Tools.ts               tool attachment and punch poses
    FloatingBody.ts        procedural animation for the six floating body parts
    Detection.ts           vision cones and the 0-100 detection meter
    Collision.ts           2D collision and line of sight
    Input.ts               floating joystick, PUNCH, HIDE, tool button, keyboard
    CameraRig.ts           menu camera, follow camera, shake
    Effects.ts             dust, debris, noise rings, damage numbers, haptics
    Audio.ts               Web Audio synth sounds
    Assets.ts              GLB loading and cloning
    Save.ts                Capacitor Preferences save
  ui/
    UI.ts                  screen logic
    screens.ts             screen HTML
    icons.ts               inline SVG icons
    styles.css             brutalist styling
```

## Balancing

Every number you are likely to tune is in `src/config/`, and each one has a comment.

- **Tools** (`tools.ts`): `damage`, `hitsPerSec` and `noise` control the main trade-off.
  Time to break a wall is `wallHp / (damage * hitsPerSec)`.
- **Walls** (`levels.ts`): `wallHp`, `guardSpeed`, guard `path` loops, `cover`, `parTime` and `searchlight.period`.
- **Detection** (`tuning.ts`): `fillNear`, `fillFar`, `drain` and `punchMultiplier` set how forgiving the guards are.

Open the game with `?debug` to get `__game` in the console. `__game.debugState()` shows the live
state, and `__game.debugInvisible = true` turns detection off while you test layouts.
