import { LEVELS, LEVEL_COUNT } from '../config/levels';
import { TOOLS, toolStatLine } from '../config/tools';
import type { ToolDef } from '../config/tools';
import { UPGRADES } from '../config/upgrades';
import { SKINS } from '../config/skins';
import type { SkinDef } from '../config/skins';
import { DAILY, PRODUCTS, getProduct } from '../config/store';
import type { UpgradeId } from '../config/upgrades';
import { ASSET_BASE } from '../game/Assets';
import type { AlertState } from '../game/Detection';
import type { SaveData } from '../game/Save';
import type { CaughtBy } from '../game/Game';
import { ICONS } from './icons';
import { SCREENS_HTML } from './screens';

/**
 * UI - the HTML/CSS overlay. It owns no game rules: the Game tells it what
 * to show and it reports button presses back through `UIActions`.
 */

export type ScreenName = 'loading' | 'menu' | 'hud' | 'shop' | 'walls' | 'spotted' | 'walldown' | 'pause' | 'settings' | 'daily';

export interface UIActions {
  play(): void;
  shop(): void;
  walls(): void;
  settings(): void;
  back(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  quit(): void;
  sound(): void;
  vibration(): void;
  reset(): void;
  retry(): void;
  upgrade(): void;
  next(): void;
  menu(): void;
  buyTool(id: number): void;
  buyUpgrade(id: UpgradeId): void;
  buySkin(id: string): void;
  equipSkin(id: string): void;
  buyProduct(id: string): void;
  openDaily(): void;
  claimDaily(): void;
  closeDaily(): void;
  shopTab(tab: ShopTab): void;
  equipTool(id: number): void;
  selectLevel(id: number): void;
  skipTutorial(): void;
  replayTutorial(): void;
  /** Any button was pressed (click sound). */
  tap(): void;
}

export type ShopTab = 'tools' | 'body' | 'skins' | 'store';

/** Tiny SVG figure in a skin's colours (shop preview). */
function skinPreview(s: SkinDef): string {
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const op = s.opacity ?? 1;
  const acc = s.accent !== undefined ? hex(s.accent) : '#fff';
  const extras = (s.accessories ?? [])
    .map((a) => {
      switch (a) {
        case 'mohawk':
          return `<path d="M28 6l2 -5 2 5 2 -5 2 5 2 -5 2 5z" fill="${acc}"/>`;
        case 'crown':
          return `<path d="M26 7l2-6 4 4 4-5 4 5 4-4 2 6z" fill="${acc}"/>`;
        case 'headband':
          return `<rect x="25" y="9" width="22" height="3" fill="${acc}"/>`;
        case 'shades':
          return `<rect x="27" y="11" width="18" height="4" fill="#050505"/>`;
        case 'scarf':
          return `<rect x="25" y="25" width="22" height="5" rx="2" fill="${acc}"/><rect x="40" y="28" width="4" height="9" fill="${acc}"/>`;
      }
    })
    .join('');
  return `<svg class="skin-svg" viewBox="0 0 72 72" aria-hidden="true">
    <g opacity="${op}" stroke="#121212" stroke-width="1.5">
      <circle cx="36" cy="14" r="10" fill="${hex(s.head)}"/>
      <rect x="25" y="27" width="22" height="26" rx="11" fill="${hex(s.torso)}"/>
      <circle cx="16" cy="40" r="5" fill="${hex(s.hands)}"/>
      <circle cx="56" cy="40" r="5" fill="${hex(s.hands)}"/>
      <ellipse cx="30" cy="64" rx="6" ry="3.5" fill="${hex(s.feet)}"/>
      <ellipse cx="42" cy="64" rx="6" ry="3.5" fill="${hex(s.feet)}"/>
    </g>${extras}</svg>`;
}

const UPGRADE_ICONS: Record<UpgradeId, string> = {
  speed: ICONS.boot,
  power: ICONS.power,
  stealth: ICONS.mask,
  silence: ICONS.mute,
  detector: ICONS.mine,
  magnet: ICONS.magnet,
};

export interface WallDownInfo {
  level: number;
  image: string;
  stars: [boolean, boolean, boolean];
  time: number;
  par: number;
  reward: number;
  last: boolean;
}

/** Screens that hide the 3D view completely (the game skips rendering). */
const OPAQUE: ScreenName[] = ['loading', 'shop', 'walls', 'walldown'];

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const formatCoins = (n: number) => Math.floor(n).toLocaleString('en-US');

export class UI {
  current: ScreenName = 'loading';
  private screens = new Map<ScreenName, HTMLElement>();
  private cache = new Map<string, string>();
  private resetArmed = false;

  constructor(
    root: HTMLElement,
    private actions: UIActions,
  ) {
    root.innerHTML = SCREENS_HTML;
    root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      this.screens.set(el.dataset.screen as ScreenName, el);
    });

    // One listener handles every menu button.
    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || el.hasAttribute('disabled')) return;
      this.actions.tap();
      const act = el.dataset.act!;
      const id = Number(el.dataset.id);
      switch (act) {
        case 'buy':
          this.actions.buyTool(id);
          break;
        case 'equip':
          this.actions.equipTool(id);
          break;
        case 'buyup':
          this.actions.buyUpgrade(el.dataset.up as UpgradeId);
          break;
        case 'tab':
          this.actions.shopTab(el.dataset.tab as ShopTab);
          break;
        case 'buyskin':
          this.actions.buySkin(el.dataset.key!);
          break;
        case 'equipskin':
          this.actions.equipSkin(el.dataset.key!);
          break;
        case 'buyproduct':
          this.actions.buyProduct(el.dataset.key!);
          break;
        case 'level':
          this.actions.selectLevel(id);
          break;
        case 'reset':
          // Destructive: needs a second tap.
          if (this.resetArmed) {
            this.resetArmed = false;
            this.text('set-reset', 'RESET PROGRESS');
            this.actions.reset();
          } else {
            this.resetArmed = true;
            this.text('set-reset', 'TAP AGAIN TO ERASE');
          }
          break;
        default:
          (this.actions[act as keyof UIActions] as (() => void) | undefined)?.();
      }
    });
    // Long-press must never open the browser's context menu on a button.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** The 3D canvas is completely covered right now. */
  get coversCanvas(): boolean {
    return OPAQUE.includes(this.current);
  }

  get elements() {
    return {
      zone: this.el('joy-zone'),
      base: this.el('joy-base'),
      knob: this.el('joy-knob'),
      punch: this.el('btn-punch'),
      hide: this.el('btn-hide'),
      tool: this.el('btn-tool'),
      throwBtn: this.el('btn-throw'),
    };
  }

  show(name: ScreenName): void {
    this.current = name;
    // Modals keep the screen underneath visible (HUD under pause, menu under settings).
    const under: ScreenName | null = name === 'pause' ? 'hud' : name === 'settings' || name === 'daily' ? 'menu' : null;
    this.screens.forEach((el, key) => {
      el.classList.toggle('active', key === name || key === under);
    });
    if (name !== 'settings') {
      this.resetArmed = false;
      this.text('set-reset', 'RESET PROGRESS');
    }
  }

  // ---- loading ---------------------------------------------------------------

  setLoading(p: number): void {
    this.el('load-bar').style.width = `${Math.round(p * 100)}%`;
  }

  setLoadingError(message: string): void {
    this.text('load-label', message);
  }

  // ---- menu ------------------------------------------------------------------

  setMenu(level: number, name: string, damagePct: number, coins: number): void {
    this.text('menu-level', `WALL ${level}`);
    this.text('hud-wall-label', `WALL ${level}`);
    this.text('menu-wall', `WALL ${level} · ${damagePct}% DOWN`);
    this.text('menu-name', name);
    this.text('menu-coins', formatCoins(coins));
    this.el('menu-bar').style.width = `${damagePct}%`;
  }

  setToggles(sound: boolean, vibration: boolean): void {
    for (const prefix of ['pause', 'set']) {
      this.text(`${prefix}-sound`, `SOUND: ${sound ? 'ON' : 'OFF'}`);
      this.text(`${prefix}-vibration`, `VIBRATION: ${vibration ? 'ON' : 'OFF'}`);
    }
  }

  // ---- HUD (called every frame, so only touch the DOM when a value changes) ---

  setHud(wallPct: number, coins: number, detection: number, state: AlertState, time: number, par: number): void {
    if (this.changed('wall', String(wallPct))) {
      this.el('hud-wall-pct').textContent = `${wallPct}%`;
      this.el('hud-wall-bar').style.width = `${wallPct}%`;
    }
    if (this.changed('coins', String(coins))) this.el('hud-coins').textContent = formatCoins(coins);
    const chasing = this.el('hud-detect').classList.contains('chasing');
    const det = Math.round(detection);
    if (!chasing && this.changed('det', String(det))) this.el('hud-detect-bar').style.width = `${det}%`;
    if (!chasing && this.changed('state', state)) {
      this.el('hud-status').textContent = state === 'alert' ? 'ALERT' : state === 'suspicious' ? 'SUSPICIOUS' : 'HIDDEN';
      this.el('hud-detect').dataset.state = state;
    }
    const t = formatTime(time);
    if (this.changed('time', t)) {
      const el = this.el('hud-timer');
      el.textContent = t;
      el.classList.toggle('over', time > par);
    }
  }

  setControls(inPunchRange: boolean, canHide: boolean, hidden: boolean): void {
    if (this.changed('range', String(inPunchRange))) this.el('btn-punch').classList.toggle('ready', inPunchRange);
    const key = `${canHide}|${hidden}`;
    if (this.changed('hide', key)) {
      const btn = this.el('btn-hide');
      btn.classList.toggle('ready', canHide || hidden);
      btn.classList.toggle('on', hidden);
      this.el('hud-hide-label').textContent = hidden ? 'STAND' : 'HIDE';
    }
  }

  /**
   * Tutorial coach card. With a target it sits above that control and a ring
   * pulses around it; without one it floats above the controls.
   */
  showCoach(text: string | null, index = 0, total = 0, target: 'joy' | 'punch' | 'hide' | 'throw' | null = null): void {
    const card = this.el('coach');
    const ring = this.el('coach-ring');
    if (text === null) {
      card.classList.remove('show');
      ring.classList.remove('show');
      return;
    }
    this.text('coach-text', text);
    this.text('coach-step', total > 0 ? `${index + 1}/${total}` : '');
    (card.querySelector('.coach-skip') as HTMLElement).style.display = total > 0 ? '' : 'none';
    card.classList.remove('show');
    void card.offsetWidth; // replay the pop-in animation
    card.classList.add('show');
    const section = card.parentElement!.getBoundingClientRect();
    const ids = { joy: 'joy-base', punch: 'btn-punch', hide: 'btn-hide', throw: 'btn-throw' } as const;
    if (target) {
      const r = this.el(ids[target]).getBoundingClientRect();
      const pad = 6;
      ring.style.left = `${r.left - section.left - pad}px`;
      ring.style.top = `${r.top - section.top - pad}px`;
      ring.style.width = `${r.width + pad * 2}px`;
      ring.style.height = `${r.height + pad * 2}px`;
      ring.classList.toggle('round', target === 'joy');
      ring.classList.add('show');
      // Card above the control, clamped to the screen, arrow pointing at it.
      const cw = card.offsetWidth;
      const cx = r.left - section.left + r.width / 2;
      const left = Math.max(12, Math.min(section.width - cw - 12, cx - cw / 2));
      card.style.left = `${left}px`;
      card.style.bottom = `${section.bottom - r.top + 18}px`;
      card.style.setProperty('--arrow-x', `${cx - left}px`);
      card.classList.add('pointing');
    } else {
      ring.classList.remove('show');
      const cw = card.offsetWidth;
      card.style.left = `${(section.width - cw) / 2}px`;
      card.style.bottom = `calc(var(--sab) + 17rem)`;
      card.classList.remove('pointing');
    }
  }

  setTutorialLabel(text: string): void {
    this.text('set-tutorial', text);
  }

  /** Stone count on the THROW button. */
  setStones(count: number): void {
    if (!this.changed('stones', String(count))) return;
    this.text('hud-stones', String(count));
    this.el('btn-throw').classList.toggle('empty', count === 0);
  }

  /**
   * Chase: the detection chip turns into "RUN!" with the countdown.
   * `remaining` = seconds left before being caught, or null when nobody is
   * chasing. `seen` = a chaser can see the player right now.
   */
  setChase(remaining: number | null, max: number, seen: boolean): void {
    const on = remaining !== null;
    const chip = this.el('hud-detect');
    if (this.changed('chase', String(on))) {
      chip.classList.toggle('chasing', on);
      this.el('btn-punch').closest('section')!.classList.toggle('chased', on);
      // Force the normal status text to refresh when the chase ends.
      this.cache.delete('state');
      this.cache.delete('det');
      if (on) this.text('hud-status', 'RUN!');
    }
    if (!on) return;
    const t = remaining!.toFixed(1);
    if (this.changed('chaseT', t)) {
      this.text('hud-chase-time', t);
      this.el('hud-detect-bar').style.width = `${(remaining! / max) * 100}%`;
    }
    if (this.changed('chaseSeen', String(seen))) chip.classList.toggle('seen', seen);
  }

  setToolIcon(tool: ToolDef): void {
    (this.el('hud-tool-icon') as HTMLImageElement).src = ASSET_BASE + tool.icon;
  }

  // ---- shop --------------------------------------------------------------------

  private shopTab: ShopTab = 'tools';

  renderShop(save: SaveData, tab: ShopTab = this.shopTab): void {
    this.shopTab = tab;
    this.text('shop-coins', formatCoins(save.coins));
    for (const t of ['tools', 'body', 'skins', 'store'] as const) this.el(`tab-${t}`).classList.toggle('on', tab === t);
    if (tab === 'skins') {
      this.text('shop-sub', 'Looks only, they do not change the game. Tap an owned skin to wear it.');
      this.el('shop-list').innerHTML = SKINS.map((s) => {
        const owned = save.skins.includes(s.id);
        const worn = save.skin === s.id;
        let action: string;
        let cls = 'card skin';
        let act = '';
        if (worn) {
          cls += ' equipped';
          action = `<span class="pill ink">WEARING</span>`;
        } else if (owned) {
          cls += ' owned';
          act = `data-act="equipskin" data-key="${s.id}"`;
          action = `<span class="pill">OWNED</span>`;
        } else if (s.unlock === 'coins') {
          action = `<button class="btn btn-yellow buy${save.coins < (s.price ?? 0) ? ' poor' : ''}" data-act="buyskin" data-key="${s.id}">${ICONS.coin}${formatCoins(s.price ?? 0)}</button>`;
        } else if (s.unlock === 'premium') {
          const p = getProduct(s.productId ?? '');
          action = `<button class="btn btn-yellow buy money" data-act="buyproduct" data-key="${s.productId}">${p?.price ?? ''}</button>`;
        } else {
          cls += ' locked';
          action = `<span class="lockline">${ICONS.gift}<b>DAY 7</b></span>`;
        }
        const label = s.unlock === 'premium' ? 'PREMIUM' : s.unlock === 'daily' ? 'DAILY REWARD EXCLUSIVE' : s.unlock === 'free' ? 'DEFAULT' : 'COINS';
        return `
        <article class="${cls}" ${act}>
          <div class="up-icon skin-icon">${skinPreview(s)}</div>
          <div class="card-body"><h3>${s.name}</h3><div class="label">${label}</div></div>
          <div class="card-action">${action}</div>
        </article>`;
      }).join('');
      return;
    }
    if (tab === 'store') {
      this.text('shop-sub', 'Support the game. Test build: purchases are free and no money is charged.');
      this.el('shop-list').innerHTML = PRODUCTS.map((p) => {
        const done = p.oneTime && (save.purchases.includes(p.id) || (p.skin !== undefined && !p.coins && save.skins.includes(p.skin)));
        const icon = p.skin && !p.coins ? skinPreview(SKINS.find((s) => s.id === p.skin)!) : p.skin ? ICONS.gift : ICONS.coin;
        const action = done
          ? `<span class="pill ink">OWNED</span>`
          : `<button class="btn btn-yellow buy money" data-act="buyproduct" data-key="${p.id}">${p.price}</button>`;
        return `
        <article class="card product${p.tag ? ' tagged' : ''}">
          ${p.tag ? `<span class="product-tag">${p.tag}</span>` : ''}
          <div class="up-icon skin-icon">${icon}</div>
          <div class="card-body"><h3>${p.name}</h3><div class="label">${p.desc}</div></div>
          <div class="card-action">${action}</div>
        </article>`;
      }).join('');
      return;
    }
    if (tab === 'body') {
      this.text('shop-sub', 'Upgrade your body. Every level stays bought forever.');
      this.el('shop-list').innerHTML = UPGRADES.map((u) => {
        const level = save.upgrades[u.id] ?? 0;
        const max = u.prices.length;
        const price = u.prices[level];
        const locked = u.unlockWall > save.unlockedLevel;
        const pips = Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
        let action: string;
        if (level >= max) action = `<span class="pill ink">MAX</span>`;
        else if (locked) action = `<span class="lockline">${ICONS.lock}<b>WALL ${u.unlockWall}</b></span>`;
        else
          action = `<button class="btn btn-yellow buy${save.coins < price ? ' poor' : ''}" data-act="buyup" data-up="${u.id}">${ICONS.coin}${formatCoins(price)}</button>`;
        const now = level > 0 ? u.label(level) : 'NOT BOUGHT';
        const next = level < max ? ` → ${u.label(level + 1)}` : '';
        return `
        <article class="card upgrade${level >= max ? ' maxed' : ''}${locked ? ' locked' : ''}">
          <div class="up-icon">${UPGRADE_ICONS[u.id]}</div>
          <div class="card-body">
            <h3>${u.name}</h3>
            <div class="pips">${pips}</div>
            <div class="label">${now}${next}</div>
          </div>
          <div class="card-action">${action}</div>
        </article>`;
      }).join('');
      return;
    }
    this.text('shop-sub', 'Louder tools break the wall faster, but guards hear them from further away. Tap an owned tool to equip it.');
    const cards = TOOLS.map((t) => {
      const owned = save.owned.includes(t.id);
      const equipped = save.equipped === t.id;
      const locked = !owned && t.unlockWall > save.unlockedLevel;
      let cls = 'card';
      let act = '';
      let action: string;
      if (equipped) {
        cls += ' equipped';
        action = `<span class="pill ink">EQUIPPED</span>`;
      } else if (owned) {
        cls += ' owned';
        act = `data-act="equip" data-id="${t.id}"`;
        action = `<span class="pill">OWNED</span>`;
      } else if (locked) {
        cls += ' locked';
        action = `<span class="lockline">${ICONS.lock}<b>WALL ${t.unlockWall}</b></span>`;
      } else {
        const poor = save.coins < t.price;
        action = `<button class="btn btn-yellow buy${poor ? ' poor' : ''}" data-act="buy" data-id="${t.id}">${ICONS.coin}${formatCoins(t.price)}</button>`;
      }
      return `
        <article class="${cls}" ${act}>
          <img src="${ASSET_BASE}${t.icon}" alt="">
          <div class="card-body">
            <h3>${t.name}</h3>
            <div class="label">${toolStatLine(t)}</div>
          </div>
          <div class="card-action">${action}</div>
        </article>`;
    });
    this.el('shop-list').innerHTML = cards.join('');
  }

  // ---- walls -------------------------------------------------------------------

  renderWalls(save: SaveData): void {
    let total = 0;
    const cards = LEVELS.map((lv) => {
      const prog = save.levels[lv.id];
      const stars = prog?.stars ?? 0;
      total += stars;
      const locked = lv.id > save.unlockedLevel;
      const current = lv.id === save.currentLevel;
      const pct = prog && prog.hp !== null ? Math.round((1 - prog.hp / lv.wallHp) * 100) : 0;
      const status = locked ? `${ICONS.lock}` : prog?.done && pct === 0 ? 'DOWN' : `${pct}%`;
      const starRow = [0, 1, 2].map((i) => `<span class="${i < stars ? 'got' : ''}">${ICONS.star}</span>`).join('');
      return `
        <button class="wall-card${locked ? ' locked' : ''}${current ? ' current' : ''}" ${locked ? 'disabled' : `data-act="level" data-id="${lv.id}"`}>
          <span class="wall-num">${lv.id}</span>
          <span class="wall-info">
            <span class="label">${lv.name}</span>
            <span class="wall-stars">${starRow}</span>
          </span>
          <span class="wall-status label">${status}</span>
        </button>`;
    });
    this.el('walls-grid').innerHTML = cards.join('');
    this.text('walls-stars', `${total}/${LEVEL_COUNT * 3}`);
  }

  // ---- end screens ---------------------------------------------------------------

  showSpotted(damagePct: number, coins: number, by: CaughtBy): void {
    this.text('sp-damage', `+${damagePct}%`);
    this.text('sp-coins', `+${formatCoins(coins)}`);
    const text: Record<CaughtBy, string> = {
      guard: "The guard's flashlight caught you. Your hole stays, so come back and finish it.",
      searchlight: 'The searchlight caught you. Your hole stays, so come back and finish it.',
      dog: 'The dog sniffed you out. Your hole stays. Dogs smell you through cover, so keep your distance.',
      mine: 'You stepped on a mine. Your hole stays. Watch for the red blink next time.',
    };
    this.text('sp-text', text[by]);
    this.text('sp-stamp', by === 'mine' ? 'BOOM!' : by === 'dog' ? 'SNIFFED!' : 'SPOTTED!');
    (this.el('sp-icon') as HTMLImageElement).src = `${ASSET_BASE}ui_icons/icon_${by === 'mine' ? 'Player' : 'Guard'}.png`;
    this.el('sp-icon').closest('section')!.dataset.by = by;
    this.show('spotted');
  }

  // ---- daily reward -----------------------------------------------------------

  /** @param day index (0-6) of today's reward; `claimable` false = already claimed today. */
  renderDaily(day: number, claimable: boolean, skinOwned: boolean): void {
    this.el('daily-grid').innerHTML = DAILY.map((r, i) => {
      const state = i < day || (i === day && !claimable) ? 'done' : i === day ? 'today' : '';
      const skin = r.skin ? SKINS.find((s) => s.id === r.skin) : undefined;
      const prize = skin && !skinOwned ? `<div class="daily-skin">${skinPreview(skin)}</div><b>SKIN</b>` : `${ICONS.coin}<b>${formatCoins(r.coins)}</b>`;
      return `<div class="daily-day ${state}${i === 6 ? ' big' : ''}"><span class="label">DAY ${i + 1}</span>${prize}${state === 'done' ? `<i class="tick">${ICONS.check}</i>` : ''}</div>`;
    }).join('');
    const btn = this.el('daily-claim') as HTMLButtonElement;
    btn.textContent = claimable ? 'CLAIM' : 'COME BACK TOMORROW';
    btn.toggleAttribute('disabled', !claimable);
    btn.classList.toggle('done', !claimable);
  }

  setDailyDot(on: boolean): void {
    this.el('daily-dot').classList.toggle('on', on);
  }

  /** Simple yes/no dialog over everything. */
  confirm(title: string, text: string, ok: string): Promise<boolean> {
    const box = this.el('confirm');
    this.text('confirm-title', title);
    this.text('confirm-text', text);
    this.text('confirm-ok', ok);
    box.classList.add('show');
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        box.classList.remove('show');
        okBtn.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(v);
      };
      const okBtn = this.el('confirm-ok');
      const cancel = this.el('confirm-cancel');
      const onOk = () => done(true);
      const onCancel = () => done(false);
      okBtn.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  /** Red screen flash (tripwire). */
  flash(): void {
    const el = this.el('flash');
    el.classList.remove('on');
    void el.offsetWidth; // restart the animation
    el.classList.add('on');
  }

  showWallDown(info: WallDownInfo): void {
    (this.el('wd-image') as HTMLImageElement).src = info.image;
    info.stars.forEach((got, i) => this.el(`wd-star-${i + 1}`).classList.toggle('got', got));
    this.text('wd-level', `WALL ${info.level}`);
    this.text('wd-time', `${formatTime(info.time)} / ${formatTime(info.par)}`);
    this.text('wd-reward', `+${formatCoins(info.reward)}`);
    this.text('wd-next', info.last ? 'ALL WALLS DOWN' : 'NEXT WALL');
    this.show('walldown');
  }

  // ---- helpers -------------------------------------------------------------------

  private el(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`UI element #${id} is missing`);
    return el;
  }

  private text(id: string, value: string): void {
    this.el(id).textContent = value;
  }

  private changed(key: string, value: string): boolean {
    if (this.cache.get(key) === value) return false;
    this.cache.set(key, value);
    return true;
  }
}
