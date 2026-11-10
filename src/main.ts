/**
 * MAUERBRECHER - entry point.
 *
 * Fonts are bundled (the Google Fonts files via @fontsource) so the APK works
 * offline: Anton for titles and buttons, Space Grotesk for numbers and
 * labels, Inter for body text.
 */
import '@fontsource/anton/latin-400.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import './ui/styles.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const fx = document.getElementById('fx') as HTMLElement;

const game = new Game(canvas, ui, fx);
void game.start();

// Handy while balancing: open the page with ?debug and type __game.debugState() in the console.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __game: Game }).__game = game;
}
