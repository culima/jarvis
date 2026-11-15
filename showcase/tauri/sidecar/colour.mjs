// The one colour everything is drawn in (Settings, Appearance, Colour): what can be saved, and why not. The pages
// turn every shade toward it (roamies/theme.js, which knows the same names).
export const DEFAULT_COLOUR = '#a06bff';
const NAMES = {
  violet: '#a06bff', purple: '#a06bff', lila: '#a06bff', lilac: '#b79bff', pink: '#ff7ad1', magenta: '#ff5ce0', red: '#ff5a5a', green: '#5dff8f',
  emerald: '#3fe39b', lime: '#b6ff5c', teal: '#78ffe2', cyan: '#6fe8ff', blue: '#6aa8ff', white: '#f2f4f8', silver: '#c9ced6', grey: '#b9bdc4', gray: '#b9bdc4',
};

/** Typed text → { ok: true, colour } (a hex code; '' means back to the default) or { ok: false, why }. */
export function cleanColour(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t || t === 'default') return { ok: true, colour: '' };
  const hex = NAMES[t] ?? (t.startsWith('#') ? t : `#${t}`);
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return { ok: false, why: `I need a hex code like ${DEFAULT_COLOUR}, or one of: ${Object.keys(NAMES).join(', ')}.` };
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  return { ok: true, colour: full === DEFAULT_COLOUR ? '' : full };
}

export const colourOf = (config) => config?.accent || DEFAULT_COLOUR;
