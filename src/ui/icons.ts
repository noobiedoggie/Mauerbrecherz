/**
 * Inline stroke icons (24x24). They inherit the text colour through
 * `currentColor`; only the coin has its own fixed colours.
 */

const svg = (body: string, extra = '') =>
  `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  play: svg('<path d="M7 4.5l12.5 7.5L7 19.5z"/>'),
  eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: svg(
    '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M4 3.5l16 17"/>',
  ),
  lock: svg('<rect x="5" y="11" width="14" height="9.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  ),
  arrowLeft: svg('<path d="M20 12H5M11 5.5L4.5 12l6.5 6.5"/>'),
  arrowRight: svg('<path d="M4 12h15M13 5.5l6.5 6.5-6.5 6.5"/>'),
  /** Coin = yellow circle with an ink star. */
  coin: svg(
    '<circle cx="12" cy="12" r="10" fill="#FFC234" stroke="#121212"/><path d="M12 6.3l1.7 3.6 3.9.5-2.9 2.7.8 3.9-3.5-2-3.5 2 .8-3.9-2.9-2.7 3.9-.5z" fill="#121212" stroke="none"/>',
    'ic-coin',
  ),
  fist: svg(
    '<path d="M6.5 11V7.2a1.6 1.6 0 0 1 3.2 0V10M9.7 9.5V6a1.6 1.6 0 0 1 3.2 0v4M12.9 9.5V6.6a1.6 1.6 0 0 1 3.2 0V10M16.1 10.5V8.4a1.6 1.6 0 0 1 3.2 0V14a6.5 6.5 0 0 1-6.5 6.5h-1.3a5 5 0 0 1-5-5V11"/><path d="M6.5 13.5h4.7a2 2 0 0 1 2 2"/>',
  ),
  star: svg('<path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3.1 1.2-6.2L3 9.6l6.3-.8z"/>', 'ic-star'),
  check: svg('<path d="M4.5 12.5l5 5L19.5 7"/>'),
  cross: svg('<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'),
  sound: svg('<path d="M4 9.5v5h3.5l5 4v-13l-5 4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
  vibrate: svg('<rect x="8" y="4" width="8" height="16"/><path d="M4 9v6M20 9v6"/>'),
  restart: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4v5h5"/>'),
  home: svg('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>'),
  wall: svg('<rect x="3" y="4.5" width="18" height="15"/><path d="M3 9.5h18M3 14.5h18M12 4.5v5M7.5 9.5v5M16.5 9.5v5M12 14.5v5"/>'),
  hammer: svg('<path d="M13.5 3.5l7 7-3 3-7-7zM12 9l-8 8 3 3 8-8"/>'),
};
