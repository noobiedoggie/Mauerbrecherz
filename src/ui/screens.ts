import { ASSET_BASE } from '../game/Assets';
import { ICONS } from './icons';

/**
 * Static HTML for every overlay screen. UI.ts fills in the numbers.
 * One <section data-screen="..."> per screen; only one is visible at a time
 * (pause and settings are modals drawn above the current one).
 */

const loading = /* html */ `
<section class="screen loading" data-screen="loading">
  <h1 class="title">MAUER<br>BRECHER</h1>
  <div class="bar"><i id="load-bar"></i></div>
  <div class="label" id="load-label">LOADING</div>
</section>`;

const menu = /* html */ `
<section class="screen menu" data-screen="menu">
  <header class="row">
    <div class="tag" id="menu-level">LEVEL 1</div>
    <div class="grow"></div>
    <div class="chip coin-chip">${ICONS.coin}<b id="menu-coins">0</b></div>
  </header>
  <div class="menu-title">
    <h1 class="title">MAUER<br>BRECHER</h1>
    <p>Punch through. Don't get seen.</p>
  </div>
  <div class="grow"></div>
  <div class="panel">
    <div class="panel-head">
      <span class="label" id="menu-wall">WALL 1 · 0% DOWN</span>
      <span class="label dim" id="menu-name"></span>
    </div>
    <div class="bar on-ink"><i id="menu-bar"></i></div>
    <button class="btn btn-play" data-act="play">PLAY</button>
    <div class="row">
      <button class="btn grow" data-act="shop">${ICONS.hammer}TOOLS</button>
      <button class="btn grow" data-act="walls">${ICONS.wall}WALLS</button>
      <button class="btn btn-icon" data-act="settings" aria-label="Settings">${ICONS.settings}</button>
    </div>
  </div>
</section>`;

const hud = /* html */ `
<section class="screen hud" data-screen="hud">
  <header class="row">
    <button class="btn btn-icon" data-act="pause" aria-label="Pause">${ICONS.pause}</button>
    <div class="chip wall-chip grow">
      <span class="label">WALL</span>
      <div class="bar grow"><i id="hud-wall-bar"></i></div>
      <b id="hud-wall-pct">100%</b>
    </div>
    <div class="chip coin-chip">${ICONS.coin}<b id="hud-coins">0</b></div>
  </header>
  <div class="row hud-second">
    <div class="chip ink detect" id="hud-detect">
      ${ICONS.eye}
      <span class="label" id="hud-status">HIDDEN</span>
      <div class="bar on-ink"><i id="hud-detect-bar"></i></div>
    </div>
    <div class="grow"></div>
    <div class="chip timer" id="hud-timer">0:00</div>
  </div>
  <div class="hint" id="hud-hint"></div>

  <div class="joy-zone" id="joy-zone">
    <div class="joy-base" id="joy-base"><div class="joy-knob" id="joy-knob"></div></div>
  </div>

  <button class="btn tool-btn" id="btn-tool" aria-label="Next tool"><img id="hud-tool-icon" alt=""></button>
  <button class="btn hide-btn" id="btn-hide">${ICONS.eyeOff}<span id="hud-hide-label">HIDE</span></button>
  <button class="punch-btn" id="btn-punch">${ICONS.fist}<span>PUNCH</span></button>
</section>`;

const shop = /* html */ `
<section class="screen paper shop" data-screen="shop">
  <header class="row">
    <button class="btn btn-icon" data-act="back" aria-label="Back">${ICONS.arrowLeft}</button>
    <h2 class="heading grow">TOOLS</h2>
    <div class="chip coin-chip">${ICONS.coin}<b id="shop-coins">0</b></div>
  </header>
  <p class="sub">Louder tools break the wall faster, but guards hear them from further away. Tap an owned tool to equip it.</p>
  <div class="list" id="shop-list"></div>
</section>`;

const walls = /* html */ `
<section class="screen paper walls" data-screen="walls">
  <header class="row">
    <button class="btn btn-icon" data-act="back" aria-label="Back">${ICONS.arrowLeft}</button>
    <h2 class="heading grow">WALLS</h2>
    <div class="chip"><span class="ic-star-wrap">${ICONS.star}</span><b id="walls-stars">0/30</b></div>
  </header>
  <p class="sub">Ten walls. Three stars each: break through, never get spotted, beat the par time.</p>
  <div class="grid" id="walls-grid"></div>
</section>`;

const spotted = /* html */ `
<section class="screen dark spotted" data-screen="spotted">
  <div class="grow"></div>
  <img class="guard-icon" src="${ASSET_BASE}ui_icons/icon_Guard.png" alt="">
  <div class="stamp">SPOTTED!</div>
  <p id="sp-text">The guard's flashlight caught you. Your hole stays, so come back and finish it.</p>
  <div class="row stats">
    <div class="stat grow"><span class="label">WALL DAMAGE</span><b id="sp-damage">+0%</b></div>
    <div class="stat grow"><span class="label">COINS</span><b id="sp-coins">+0</b></div>
  </div>
  <div class="grow"></div>
  <button class="btn btn-yellow btn-big" data-act="retry">TRY AGAIN</button>
  <button class="btn btn-ghost" data-act="upgrade">UPGRADE TOOLS</button>
  <button class="btn-text on-dark" data-act="menu">MENU</button>
</section>`;

const wallDown = /* html */ `
<section class="screen yellow walldown" data-screen="walldown">
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
  <button class="btn" data-act="sound">${ICONS.sound}<span id="${prefix}-sound">SOUND: ON</span></button>
  <button class="btn" data-act="vibration">${ICONS.vibrate}<span id="${prefix}-vibration">VIBRATION: ON</span></button>`;

const pause = /* html */ `
<section class="screen dark modal" data-screen="pause">
  <div class="sheet">
    <h2 class="heading">PAUSED</h2>
    <button class="btn btn-yellow" data-act="resume">${ICONS.play}RESUME</button>
    <button class="btn" data-act="restart">${ICONS.restart}RESTART</button>
    ${toggles('pause')}
    <button class="btn" data-act="quit">${ICONS.home}QUIT</button>
  </div>
</section>`;

const settings = /* html */ `
<section class="screen dark modal" data-screen="settings">
  <div class="sheet">
    <h2 class="heading">SETTINGS</h2>
    ${toggles('set')}
    <button class="btn btn-danger" data-act="reset"><span id="set-reset">RESET PROGRESS</span></button>
    <button class="btn btn-yellow" data-act="back">DONE</button>
  </div>
</section>`;

export const SCREENS_HTML = [loading, menu, hud, shop, walls, spotted, wallDown, pause, settings].join('\n');
