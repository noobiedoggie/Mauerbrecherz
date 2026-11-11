import { ASSET_BASE } from '../game/Assets';
import { ICONS } from './icons';

/**
 * Static HTML for every overlay screen ("Dusk Ops" style). UI.ts fills in
 * the numbers. One <section data-screen="..."> per screen; only one is
 * visible at a time (pause and settings are modals drawn above another one).
 */

/** Ten-segment gauge. The fill element gets the given id. */
const seg = (id: string, extra = '') => `<div class="seg ${extra}"><i id="${id}"></i></div>`;

const loading = /* html */ `
<section class="screen loading" data-screen="loading">
  <div class="stripes"></div>
  <h1 class="title">MAUER<br><span class="hl">BRECHER</span></h1>
  ${seg('load-bar', 'big')}
  <div class="label" id="load-label">LOADING</div>
</section>`;

const menu = /* html */ `
<section class="screen menu" data-screen="menu">
  <header class="row">
    <div class="tag" id="menu-level">WALL 1</div>
    <div class="grow"></div>
    <div class="chip coin-chip">${ICONS.coin}<b id="menu-coins">0</b></div>
  </header>
  <div class="grow"></div>
  <div class="menu-title">
    <h1 class="title">MAUER<br><span class="hl">BRECHER</span></h1>
    <p>Punch through. Don't get seen.</p>
  </div>
  <div class="panel">
    <div class="stripes thin"></div>
    <div class="panel-body">
      <div class="panel-head">
        <span class="label" id="menu-wall">WALL 1 · 0% DOWN</span>
        <span class="label dim" id="menu-name"></span>
      </div>
      ${seg('menu-bar')}
      <button class="btn btn-play" data-act="play">PLAY ${ICONS.arrowRight}</button>
      <div class="row">
        <button class="btn btn-dark grow" data-act="shop">${ICONS.hammer}SHOP</button>
        <button class="btn btn-dark grow" data-act="walls">${ICONS.wall}WALLS</button>
        <button class="btn btn-dark btn-icon" data-act="settings" aria-label="Settings">${ICONS.settings}</button>
      </div>
    </div>
  </div>
</section>`;

const hud = /* html */ `
<section class="screen hud" data-screen="hud">
  <header class="row">
    <button class="btn btn-dark btn-icon" data-act="pause" aria-label="Pause">${ICONS.pause}</button>
    <div class="chip wall-chip grow">
      <span class="label" id="hud-wall-label">WALL</span>
      ${seg('hud-wall-bar', 'grow')}
      <b id="hud-wall-pct">100%</b>
    </div>
    <div class="chip coin-chip">${ICONS.coin}<b id="hud-coins">0</b></div>
  </header>
  <div class="row hud-second">
    <div class="chip detect" id="hud-detect">
      ${ICONS.eye}
      <span class="label" id="hud-status">HIDDEN</span>
      ${seg('hud-detect-bar', 'small')}
    </div>
    <div class="grow"></div>
    <div class="chip timer" id="hud-timer">0:00</div>
  </div>
  <div class="hint" id="hud-hint"></div>

  <div class="joy-zone" id="joy-zone">
    <div class="joy-base" id="joy-base"><div class="joy-knob" id="joy-knob"></div></div>
  </div>

  <button class="btn btn-dark tool-btn" id="btn-tool" aria-label="Next tool"><img id="hud-tool-icon" alt=""></button>
  <button class="btn btn-dark hide-btn" id="btn-hide">${ICONS.eyeOff}<span id="hud-hide-label">HIDE</span></button>
  <button class="punch-btn" id="btn-punch"><span class="punch-inner">${ICONS.fist}<span>PUNCH</span></span></button>
</section>`;

const shop = /* html */ `
<section class="screen night shop" data-screen="shop">
  <header class="row">
    <button class="btn btn-dark btn-icon" data-act="back" aria-label="Back">${ICONS.arrowLeft}</button>
    <h2 class="heading grow">SHOP</h2>
    <div class="chip coin-chip">${ICONS.coin}<b id="shop-coins">0</b></div>
  </header>
  <div class="tabs">
    <button class="tab" data-act="tab" data-tab="tools" id="tab-tools">${ICONS.hammer}TOOLS</button>
    <button class="tab" data-act="tab" data-tab="body" id="tab-body">${ICONS.user}BODY</button>
  </div>
  <p class="sub" id="shop-sub"></p>
  <div class="list" id="shop-list"></div>
</section>`;

const walls = /* html */ `
<section class="screen night walls" data-screen="walls">
  <header class="row">
    <button class="btn btn-dark btn-icon" data-act="back" aria-label="Back">${ICONS.arrowLeft}</button>
    <h2 class="heading grow">WALLS</h2>
    <div class="chip"><span class="ic-star-wrap">${ICONS.star}</span><b id="walls-stars">0/60</b></div>
  </header>
  <p class="sub">Three stars each: break through, never get spotted, beat the par time. Mines start at wall 11.</p>
  <div class="grid" id="walls-grid"></div>
</section>`;

const spotted = /* html */ `
<section class="screen spotted" data-screen="spotted">
  <div class="grow"></div>
  <img class="guard-icon" id="sp-icon" src="${ASSET_BASE}ui_icons/icon_Guard.png" alt="">
  <div class="stamp" id="sp-stamp">SPOTTED!</div>
  <p id="sp-text">The guard's flashlight caught you. Your hole stays, so come back and finish it.</p>
  <div class="row stats">
    <div class="stat grow"><span class="label">WALL DAMAGE</span><b id="sp-damage">+0%</b></div>
    <div class="stat grow"><span class="label">COINS</span><b id="sp-coins">+0</b></div>
  </div>
  <div class="grow"></div>
  <button class="btn btn-play" data-act="retry">TRY AGAIN ${ICONS.restart}</button>
  <button class="btn btn-dark" data-act="upgrade">${ICONS.hammer}UPGRADE</button>
  <button class="btn-text" data-act="menu">MENU</button>
</section>`;

const wallDown = /* html */ `
<section class="screen yellow walldown" data-screen="walldown">
  <div class="stripes"></div>
  <h1 class="title">WALL<br>DOWN.</h1>
  <div class="frame"><img id="wd-image" alt="The hole in the wall"></div>
  <ul class="stars">
    <li id="wd-star-1">${ICONS.star}<span>BROKE THROUGH</span><em id="wd-level"></em></li>
    <li id="wd-star-2">${ICONS.star}<span>NEVER SPOTTED</span><em></em></li>
    <li id="wd-star-3">${ICONS.star}<span>UNDER PAR</span><em id="wd-time"></em></li>
  </ul>
  <div class="reward">
    <span class="label">REWARD</span>
    <span class="reward-value">${ICONS.coin}<b id="wd-reward">+0</b></span>
  </div>
  <div class="grow"></div>
  <button class="btn btn-ink btn-big" data-act="next"><span id="wd-next">NEXT WALL</span>${ICONS.arrowRight}</button>
  <button class="btn-text" data-act="menu">MENU</button>
</section>`;

const toggles = (prefix: string) => /* html */ `
  <button class="btn btn-dark" data-act="sound">${ICONS.sound}<span id="${prefix}-sound">SOUND: ON</span></button>
  <button class="btn btn-dark" data-act="vibration">${ICONS.vibrate}<span id="${prefix}-vibration">VIBRATION: ON</span></button>`;

const pause = /* html */ `
<section class="screen modal" data-screen="pause">
  <div class="sheet">
    <div class="stripes thin"></div>
    <div class="sheet-body">
      <h2 class="heading">PAUSED</h2>
      <button class="btn btn-play" data-act="resume">RESUME ${ICONS.play}</button>
      <button class="btn btn-dark" data-act="restart">${ICONS.restart}RESTART</button>
      ${toggles('pause')}
      <button class="btn btn-dark" data-act="quit">${ICONS.home}QUIT</button>
    </div>
  </div>
</section>`;

const settings = /* html */ `
<section class="screen modal" data-screen="settings">
  <div class="sheet">
    <div class="stripes thin"></div>
    <div class="sheet-body">
      <h2 class="heading">SETTINGS</h2>
      ${toggles('set')}
      <button class="btn btn-dark btn-danger" data-act="reset"><span id="set-reset">RESET PROGRESS</span></button>
      <button class="btn btn-play" data-act="back">DONE</button>
    </div>
  </div>
</section>`;

export const SCREENS_HTML = [loading, menu, hud, shop, walls, spotted, wallDown, pause, settings].join('\n') + '<div id="flash"></div>';
