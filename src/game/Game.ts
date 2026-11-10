import * as THREE from 'three';
import { App } from '@capacitor/app';
import { Capacitor, SystemBars } from '@capacitor/core';
import { LEVEL_COUNT, getLevel } from '../config/levels';
import { TOOLS, getTool } from '../config/tools';
import type { ToolDef } from '../config/tools';
import { COLORS, TUNING } from '../config/tuning';
import { UI } from '../ui/UI';
import type { UIActions, WallDownInfo } from '../ui/UI';
import { Assets } from './Assets';
import { GameAudio } from './Audio';
import { CameraRig } from './CameraRig';
import type { AlertState, Target } from './Detection';
import { Effects } from './Effects';
import { Input } from './Input';
import { Level } from './Level';
import { Player } from './Player';
import { Save } from './Save';
import { impactHeight } from './Tools';
import { SEGMENT_WIDTH } from './Wall';

/**
 * Game - owns the renderer, the current level and the game state, and wires
 * the systems together. The rules themselves live in the other modules.
 *
 * States:
 *   loading -> menu -> playing <-> paused
 *                        |-> caught -> (Spotted screen) -> playing / menu
 *                        |-> won    -> (Wall Down screen) -> next wall / menu
 */
type State = 'loading' | 'menu' | 'playing' | 'paused' | 'caught' | 'won';

const SUN_OFFSET = new THREE.Vector3(-13, 21, 16);

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig = new CameraRig();
  private sun: THREE.DirectionalLight;
  private assets = new Assets();
  private save = new Save();
  private audio = new GameAudio();
  private effects: Effects;
  private ui: UI;
  private input: Input;
  private level: Level | null = null;
  private player!: Player;

  private state: State = 'loading';
  private levelId = 1;
  /** Seconds spent on this wall, all attempts together. */
  private elapsed = 0;
  /** This attempt only (shown on the Spotted screen). */
  private attemptDamage = 0;
  private attemptCoins = 0;
  /** Damage that has not been turned into a coin yet. */
  private damageBank = 0;
  private endTimer = 0;
  private endStage = 0;
  private caughtBySearchlight = false;
  private result: WallDownInfo | null = null;
  /** Where the shop's back button leads. */
  private shopFrom: 'menu' | 'spotted' = 'menu';
  private lastWhiffHint = -10;
  /** Balancing aid: when true nobody can see the player (set from the console via __game). */
  debugInvisible = false;
  private clock = 0;

  private lastTime = 0;
  private pixelRatio: number;
  private frameAvg = 16;
  private qualityTimer = 0;
  private target: Target = { x: 0, z: 0, hidden: false, punching: false };
  private picked: number[] = [];
  private tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, fxLayer: HTMLElement) {
    // ---- renderer: one pass, no post-processing ----
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, TUNING.render.maxPixelRatio);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // soft, filtered edges

    this.scene.background = new THREE.Color(COLORS.paper);
    this.scene.fog = new THREE.Fog(COLORS.paper, 46, 120);

    // ---- lighting: hemisphere fill + ONE warm, slightly low sun with shadows ----
    this.scene.add(new THREE.HemisphereLight(0xfff6e6, 0x9a8f7c, 1.15));
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(TUNING.render.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -19;
    sc.right = 19;
    sc.top = 19;
    sc.bottom = -19;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun, this.sun.target);

    this.effects = new Effects(this.rig.camera, fxLayer);
    this.scene.add(this.effects.group);

    this.ui = new UI(uiRoot, this.makeActions());
    this.input = new Input(this.ui.elements);
    this.input.onHide = () => this.toggleHide();
    this.input.onTool = () => this.cycleTool();
    this.input.onPause = () => this.onBack();

    // Audio may only start after a touch.
    window.addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility(!document.hidden));
    this.resize();
  }

  /** Load the save and all models, then show the main menu. */
  async start(): Promise<void> {
    this.ui.show('loading');
    this.setupNative();
    await this.save.load();
    this.applySettings();

    try {
      await Promise.all([
        this.assets.loadAll((p) => this.ui.setLoading(p)),
        // The "?" / "!" markers are drawn with Anton, so wait for the font.
        document.fonts.load('96px Anton').catch(() => undefined),
      ]);
    } catch (err) {
      console.error(err);
      this.ui.setLoadingError('COULD NOT LOAD THE GAME FILES');
      return;
    }

    this.player = new Player(this.assets, getTool(this.save.data.equipped));
    this.player.onHit = (tool) => this.onHit(tool);
    this.player.onWhiff = () => this.onWhiff();
    this.scene.add(this.player.body.root);
    this.ui.setToolIcon(this.player.tool);

    this.loadLevel(this.save.data.currentLevel);
    this.rig.setMode('menu', true);
    this.showMenu();

    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  // ---- native shell ------------------------------------------------------------

  private setupNative(): void {
    if (!Capacitor.isNativePlatform()) return;
    // Full screen: hide the status and navigation bars.
    void SystemBars.hide().catch(() => undefined);
    void App.addListener('backButton', () => this.onBack());
    void App.addListener('appStateChange', ({ isActive }) => this.onVisibility(isActive));
  }

  private onVisibility(visible: boolean): void {
    if (visible) {
      this.audio.resume();
      this.lastTime = performance.now();
    } else {
      if (this.state === 'playing') this.pause();
      this.audio.suspend();
      void this.save.flush();
    }
  }

  /** Android back button / Esc. */
  private onBack(): void {
    switch (this.ui.current) {
      case 'hud':
        this.pause();
        break;
      case 'pause':
        this.resume();
        break;
      case 'shop':
      case 'walls':
      case 'settings':
        this.back();
        break;
      case 'spotted':
      case 'walldown':
        this.toMenuFresh();
        break;
      case 'menu':
        if (Capacitor.isNativePlatform()) void App.exitApp();
        break;
      default:
        break;
    }
  }

  // ---- UI actions ----------------------------------------------------------------

  private makeActions(): UIActions {
    return {
      tap: () => this.audio.click(),
      play: () => this.play(false),
      shop: () => this.openShop('menu'),
      walls: () => {
        this.ui.renderWalls(this.save.data);
        this.ui.show('walls');
      },
      settings: () => this.ui.show('settings'),
      back: () => this.back(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.play(true),
      quit: () => this.showMenu(),
      sound: () => {
        this.save.data.sound = !this.save.data.sound;
        this.applySettings();
        this.save.queue();
      },
      vibration: () => {
        this.save.data.vibration = !this.save.data.vibration;
        this.applySettings();
        this.effects.haptic('medium');
        this.save.queue();
      },
      reset: () => {
        void this.save.reset().then(() => {
          this.player.setTool(getTool(this.save.data.equipped));
          this.ui.setToolIcon(this.player.tool);
          this.loadLevel(1);
          this.showMenu();
        });
      },
      retry: () => this.play(true),
      upgrade: () => this.openShop('spotted'),
      next: () => {
        // onWallDown already moved currentLevel on to the next wall.
        if (this.result && !this.result.last) {
          this.loadLevel(this.save.data.currentLevel);
          this.play(false);
        } else {
          this.toMenuFresh();
        }
      },
      menu: () => this.toMenuFresh(),
      buyTool: (id) => this.buyTool(id),
      equipTool: (id) => this.equipTool(id),
      selectLevel: (id) => {
        if (id > this.save.data.unlockedLevel) return;
        this.save.data.currentLevel = id;
        this.save.queue();
        this.loadLevel(id);
        this.showMenu();
      },
    };
  }

  /** Leave an end screen: rebuild the current wall in its start state, then show the menu. */
  private toMenuFresh(): void {
    this.loadLevel(this.save.data.currentLevel);
    this.showMenu();
  }

  private applySettings(): void {
    const { sound, vibration } = this.save.data;
    this.audio.setMuted(!sound);
    this.effects.vibrationOn = vibration;
    this.ui.setToggles(sound, vibration);
  }

  private back(): void {
    if (this.ui.current === 'shop' && this.shopFrom === 'spotted') {
      this.ui.show('spotted');
    } else {
      this.showMenu();
    }
  }

  private openShop(from: 'menu' | 'spotted'): void {
    this.shopFrom = from;
    this.ui.renderShop(this.save.data);
    this.ui.show('shop');
  }

  private buyTool(id: number): void {
    const data = this.save.data;
    const tool = getTool(id);
    const locked = tool.unlockWall > data.unlockedLevel;
    if (data.owned.includes(id) || locked || data.coins < tool.price) {
      this.audio.deny();
      return;
    }
    data.coins -= tool.price;
    data.owned.push(id);
    this.audio.buy();
    this.effects.haptic('medium');
    this.equipTool(id);
  }

  private equipTool(id: number): void {
    const data = this.save.data;
    if (!data.owned.includes(id)) return;
    data.equipped = id;
    this.player.setTool(getTool(id));
    this.ui.setToolIcon(this.player.tool);
    void this.save.flush();
    if (this.ui.current === 'shop') this.ui.renderShop(data);
  }

  /** HUD tool button: cycle through the owned tools. */
  private cycleTool(): void {
    if (this.state !== 'playing') return;
    const owned = TOOLS.filter((t) => this.save.data.owned.includes(t.id));
    if (owned.length < 2) {
      this.ui.hint('Buy more tools in the TOOLS shop.', 2.5);
      return;
    }
    const at = owned.findIndex((t) => t.id === this.player.tool.id);
    this.audio.click();
    this.equipTool(owned[(at + 1) % owned.length].id);
  }

  private toggleHide(): void {
    if (this.state !== 'playing') return;
    if (this.player.toggleHide()) {
      this.audio.click();
    } else {
      this.audio.deny();
      this.ui.hint('HIDE only works next to a crate, sandbags or a barrel.', 2.5);
    }
  }

  // ---- level flow ------------------------------------------------------------------

  /** (Re)build the scene for a wall from its config and the saved damage. */
  private loadLevel(id: number): void {
    this.level?.dispose();
    this.effects.clear();
    const def = getLevel(id);
    const prog = this.save.level(id);
    this.levelId = def.id;

    const level = new Level(def, this.assets, prog.hp ?? def.wallHp, prog.coinsTaken);
    this.level = level;
    this.scene.add(level.group);

    const onState = (s: AlertState) => {
      if (this.state !== 'playing') return;
      if (s === 'alert') this.audio.alarm();
      else this.audio.question();
    };
    for (const g of level.guards) g.onStateChange = onState;
    if (level.searchlight) level.searchlight.onStateChange = onState;

    this.rig.setBounds(level.halfWidth, level.depth);
    this.player.spawn(def.start[0], def.start[1]);
    this.rig.snapTo(this.player.x, this.player.z);
  }

  private showMenu(): void {
    this.state = 'menu';
    this.input.setEnabled(false);
    this.audio.stopHum();
    this.ui.clearHint();
    this.rig.setMode('menu');
    const def = getLevel(this.levelId);
    const prog = this.save.level(this.levelId);
    const pct = prog.hp === null ? 0 : Math.round((1 - prog.hp / def.wallHp) * 100);
    this.ui.setMenu(def.id, def.name, pct, this.save.data.coins);
    this.ui.show('menu');
  }

  /** Start (or restart) an attempt on the current wall. */
  private play(rebuild: boolean): void {
    if (rebuild) this.loadLevel(this.levelId);
    const level = this.level!;
    const def = level.def;
    this.state = 'playing';
    this.elapsed = this.save.level(this.levelId).time;
    this.attemptDamage = 0;
    this.attemptCoins = 0;
    this.damageBank = 0;
    this.endTimer = 0;
    this.endStage = 0;
    this.player.spawn(def.start[0], def.start[1]);
    for (const g of level.guards) g.meter.reset();
    level.searchlight?.reset();
    this.rig.setMode('game');
    this.ui.show('hud');
    this.input.setEnabled(true);
    this.audio.unlock();
    this.audio.startHum();
    if (def.hint) this.ui.hint(def.hint, 7);
    else this.ui.clearHint();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.save.level(this.levelId).time = this.elapsed;
    void this.save.flush();
    this.ui.show('pause');
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.setEnabled(true);
    this.ui.show('hud');
    this.lastTime = performance.now();
  }

  // ---- gameplay events ---------------------------------------------------------------

  /** A punch just landed on the wall. */
  private onHit(tool: ToolDef): void {
    const level = this.level!;
    const wall = level.wall;
    if (wall.destroyed) return;

    const before = wall.hp;
    const hit = wall.hit(tool.damage, this.player.x, impactHeight(tool));
    const dealt = before - wall.hp;

    // Economy: +1 coin per N damage.
    this.attemptDamage += dealt;
    this.damageBank += dealt;
    const coins = Math.floor(this.damageBank / TUNING.economy.damagePerCoin);
    if (coins > 0) {
      this.damageBank -= coins * TUNING.economy.damagePerCoin;
      this.addCoins(coins);
    }
    const prog = this.save.level(this.levelId);
    prog.hp = wall.hp;
    prog.time = this.elapsed;
    this.save.queue();

    // Feedback: dust, number, shake, sound, vibration.
    const power = Math.min(1.6, tool.shake * 6);
    this.effects.hit(hit.point, power);
    this.effects.popText(`-${tool.damage}`, hit.point, 'dmg');
    this.rig.shake(tool.shake);
    this.effects.haptic(tool.haptic);
    this.audio.thud(tool.thudHz, power);
    if (hit.firstHit) this.audio.crack();
    if (hit.fallen.length > 0) {
      for (const p of hit.fallen) this.effects.crumble(p);
      this.audio.crumble();
      this.rig.shake(tool.shake * 1.5 + 0.08);
    }
    if (hit.brokeThrough && !hit.destroyed) {
      this.effects.popText('DAYLIGHT!', this.tmp.set(level.targetX, 2.6, 0), 'big');
    }

    // Noise: every guard inside the tool's radius comes to look.
    this.effects.noiseRing(this.player.x, this.player.z, tool.noise);
    for (const g of level.guards) {
      if (Math.hypot(g.x - this.player.x, g.z - this.player.z) <= tool.noise) {
        g.hearNoise(this.player.x, this.player.z);
      }
    }

    if (hit.destroyed) this.onWallDown();
  }

  /** PUNCH was pressed with nothing in reach. */
  private onWhiff(): void {
    this.audio.whiff();
    if (this.clock - this.lastWhiffHint > 4) {
      this.lastWhiffHint = this.clock;
      this.ui.hint('Stand inside the yellow box to hit the wall.', 2.5);
    }
  }

  private addCoins(n: number): void {
    this.save.data.coins += n;
    this.attemptCoins += n;
  }

  private onCaught(bySearchlight: boolean): void {
    const level = this.level!;
    this.state = 'caught';
    this.caughtBySearchlight = bySearchlight;
    this.input.setEnabled(false);
    this.player.setCaught();
    for (const g of level.guards) g.freeze(this.player.x, this.player.z);
    this.audio.caught();
    this.audio.stopHum();
    this.effects.buzz(350);
    this.rig.shake(0.3);
    this.ui.clearHint();

    // The hole stays: only the attempt ends.
    const prog = this.save.level(this.levelId);
    prog.spotted = true;
    prog.time = this.elapsed;
    prog.hp = level.wall.hp;
    void this.save.flush();
    this.endTimer = 0;
  }

  private onWallDown(): void {
    const level = this.level!;
    const def = level.def;
    this.state = 'won';
    this.input.setEnabled(false);
    this.player.startExit(level.targetX);
    for (const g of level.guards) g.freeze(level.targetX, 0);
    this.audio.win();
    this.audio.stopHum();
    this.effects.buzz(250);
    this.ui.clearHint();

    const data = this.save.data;
    const prog = this.save.level(def.id);
    const stars: [boolean, boolean, boolean] = [true, !prog.spotted, this.elapsed <= def.parTime];
    const E = TUNING.economy;
    const reward = Math.round((E.rewardBase + E.rewardPerLevel * def.id) * (prog.done ? E.replayRewardFactor : 1));
    data.coins += reward;
    this.result = {
      level: def.id,
      image: '',
      stars,
      time: this.elapsed,
      par: def.parTime,
      reward,
      last: def.id >= LEVEL_COUNT,
    };

    // The wall is down: clear its progress so a replay starts from a whole wall.
    prog.done = true;
    prog.stars = Math.max(prog.stars, stars.filter(Boolean).length);
    prog.hp = null;
    prog.time = 0;
    prog.spotted = false;
    prog.coinsTaken = 0;
    if (def.id < LEVEL_COUNT) {
      data.unlockedLevel = Math.max(data.unlockedLevel, def.id + 1);
      data.currentLevel = def.id + 1; // the menu moves on to the next wall
    }
    void this.save.flush();
    this.endTimer = 0;
    this.endStage = 0;
  }

  /** Photo of the hole for the WALL DOWN screen. */
  private takeSnapshot(): string {
    const level = this.level!;
    const w = 640;
    const h = 400;
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.3, 200);
    cam.position.set(level.targetX + 2.4, 1.7, 7.6);
    cam.lookAt(level.targetX - 0.2, 1.9, 0);

    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    for (const g of level.guards) g.cone.setVisible(false);
    level.searchlight?.cone.setVisible(false);
    this.renderer.render(this.scene, cam);
    // Reading the canvas right after render() works without preserveDrawingBuffer.
    const url = this.renderer.domElement.toDataURL('image/jpeg', 0.85);
    for (const g of level.guards) g.cone.setVisible(true);
    level.searchlight?.cone.setVisible(true);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(size.x, size.y, false);
    return url;
  }

  // ---- main loop ---------------------------------------------------------------------

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const rawMs = now - this.lastTime;
    this.lastTime = now;
    // Clamp so a hitch (or a backgrounded tab) never teleports anything.
    const dt = Math.min(0.05, Math.max(0, rawMs / 1000));

    this.update(dt);
    if (!this.ui.coversCanvas) {
      this.render();
      this.adaptQuality(rawMs, dt);
    }
  };

  private update(dt: number): void {
    const level = this.level;
    if (!level || this.state === 'loading' || this.state === 'paused') return;
    this.clock += dt;
    const player = this.player;
    const playing = this.state === 'playing';

    // ---- player ----
    this.input.poll();
    player.update(dt, playing ? this.input : IDLE_INPUT, {
      colliders: level.colliders,
      halfWidth: level.halfWidth,
      depth: level.depth,
      targetX: level.targetX,
      targetHalfWidth: SEGMENT_WIDTH / 2,
    });

    // ---- eyes: guards and searchlight ----
    const t = this.target;
    t.x = player.x;
    t.z = player.z;
    t.hidden = player.hidden;
    t.punching = player.punching;
    const seen = playing && !this.debugInvisible ? t : null;
    let detection = 0;
    let caught = false;
    let bySearchlight = false;
    for (const g of level.guards) {
      g.update(dt, seen, level.colliders);
      detection = Math.max(detection, g.meter.value);
      if (g.meter.caught) caught = true;
    }
    if (level.searchlight) {
      const s = level.searchlight;
      s.update(dt, seen, level.colliders, this.state === 'caught' || this.state === 'won');
      detection = Math.max(detection, s.meter.value);
      if (s.meter.caught && !caught) {
        caught = true;
        bySearchlight = true;
      }
    }

    // ---- world ----
    level.wall.update(dt);
    level.updateCoins(dt, player.x, player.z, playing, this.picked);
    for (const index of this.picked) {
      const prog = this.save.level(this.levelId);
      prog.coinsTaken |= 1 << index;
      this.addCoins(TUNING.economy.coinPickup);
      this.audio.coin();
      this.effects.popText(`+${TUNING.economy.coinPickup}`, level.coinPosition(index, this.tmp), 'coin');
      this.save.queue();
    }
    this.effects.update(dt);

    // ---- state specific ----
    if (playing) {
      this.elapsed += dt;
      const state: AlertState = detection >= TUNING.detection.alert ? 'alert' : detection >= TUNING.detection.suspicious ? 'suspicious' : 'calm';
      this.ui.setHud(Math.round((1 - level.wall.damage) * 100), this.save.data.coins, detection, state, this.elapsed, level.def.parTime);
      this.ui.setControls(player.inPunchRange, player.canHide, player.hidden);
      if (caught) this.onCaught(bySearchlight);
    } else if (this.state === 'caught') {
      this.endTimer += dt;
      if (this.endStage === 0 && this.endTimer > 1.1) {
        this.endStage = 1;
        this.ui.showSpotted(Math.round((this.attemptDamage / level.wall.maxHp) * 100), this.attemptCoins, this.caughtBySearchlight);
      }
    } else if (this.state === 'won') {
      this.endTimer += dt;
      if (this.endStage === 0 && this.endTimer > 0.95) {
        this.endStage = 1;
        if (this.result) this.result.image = this.takeSnapshot();
      } else if (this.endStage === 1 && this.endTimer > 2.1) {
        this.endStage = 2;
        if (this.result) this.ui.showWallDown(this.result);
      }
    }

    this.rig.update(dt, player.x, Math.max(0, player.z));
  }

  private render(): void {
    // The sun follows the camera focus so its one shadow map always covers
    // what is on screen. Snapping to whole texels stops the shadows crawling.
    const texel = 38 / TUNING.render.shadowMapSize;
    const fx = Math.round(this.rig.focus.x / texel) * texel;
    const fz = Math.round(this.rig.focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz - 1);
    this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
    this.renderer.render(this.scene, this.rig.camera);
  }

  /**
   * Adaptive resolution: if the phone cannot hold 60 fps the pixel ratio
   * drops in steps (2 -> 1.75 -> ... -> 1). It never goes back up.
   */
  private adaptQuality(frameMs: number, dt: number): void {
    if (this.state !== 'playing' || frameMs > 200) return;
    this.frameAvg += (frameMs - this.frameAvg) * 0.05;
    this.qualityTimer += dt;
    if (this.qualityTimer < 2.5) return;
    this.qualityTimer = 0;
    if (this.frameAvg > TUNING.render.slowFrameMs && this.pixelRatio > TUNING.render.minPixelRatio) {
      this.pixelRatio = Math.max(TUNING.render.minPixelRatio, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.frameAvg = 16;
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  // ---- hooks for automated tests (see README) -----------------------------------------

  /** Read-only snapshot of the game for debugging and automated tests. */
  debugState() {
    const level = this.level;
    return {
      state: this.state,
      screen: this.ui.current,
      level: this.levelId,
      player: { x: this.player?.x, z: this.player?.z, hidden: this.player?.hidden, inPunchRange: this.player?.inPunchRange, canHide: this.player?.canHide },
      wallHp: level?.wall.hp,
      wallMaxHp: level?.wall.maxHp,
      coins: this.save.data.coins,
      detection: level ? Math.max(0, ...level.guards.map((g) => g.meter.value), level.searchlight?.meter.value ?? 0) : 0,
      guards: level?.guards.map((g) => ({ x: g.x, z: g.z, yaw: g.yaw, meter: g.meter.value, investigating: g.investigating })),
      pixelRatio: this.pixelRatio,
      frameMs: this.frameAvg,
      save: this.save.data,
    };
  }
}

const IDLE_INPUT = { moveX: 0, moveY: 0, punchHeld: false };
