// Renders icon.svg into every Android icon / splash size. Run: node render.cjs <outRes>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const art = svg.slice(svg.indexOf('<defs>'), svg.lastIndexOf('</svg>'));
const YELLOW = '#FFC234', NIGHT = '#16161d';
// mode: fg = transparent foreground (adaptive), square = legacy, round = legacy round
const page = (size, mode, scale = 1) => {
  const bg = mode === 'fg' ? '' : mode === 'round'
    ? `<circle cx="54" cy="54" r="54" fill="${YELLOW}"/>`
    : `<rect width="108" height="108" rx="0" fill="${YELLOW}"/>`;
  // Legacy icons have no safe-zone crop: zoom the art in a little.
  const k = mode === 'fg' ? 1 : 1.32;
  const t = `translate(54 54) scale(${k * scale}) translate(-54 -56)`;
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="${size}" height="${size}" style="display:block">
      ${bg}<g transform="${t}">${art}</g></svg></body></html>`;
};
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.42;
  return `<!doctype html><html><body style="margin:0;background:${NIGHT};width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="${s}" height="${s}">
      <rect x="4" y="4" width="100" height="100" rx="22" fill="${YELLOW}"/>
      <g transform="translate(54 54) scale(1.18) translate(-54 -56)">${art}</g></svg></body></html>`;
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (html, w, h, file, transparent) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  };
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, m] of Object.entries(dens)) {
    await shot(page(48 * m, 'square'), 48 * m, 48 * m, `${out}/mipmap-${d}/ic_launcher.png`, true);
    await shot(page(48 * m, 'round'), 48 * m, 48 * m, `${out}/mipmap-${d}/ic_launcher_round.png`, true);
    await shot(page(108 * m, 'fg'), 108 * m, 108 * m, `${out}/mipmap-${d}/ic_launcher_foreground.png`, true);
  }
  const splashes = { 'drawable': [480, 320], 'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280] };
  for (const [d, [w, h]] of Object.entries(splashes)) await shot(splash(w, h), w, h, `${out}/${d}/splash.png`, false);
  // Store / web sizes.
  await shot(page(512, 'square'), 512, 512, `${out}/../icon-512.png`, false);
  await b.close();
})();
