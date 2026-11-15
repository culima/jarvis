// One colour for everything. The app is drawn in shades of one teal: the LED palette of the body, the bubbles, cards
// and marks on the canvas, and the panel's and setup guide's CSS. This turns every one of those shades toward the
// colour the user picked (Settings, Appearance, Colour), keeping each shade's lightness, so the whole app changes
// with one input and nothing has to be drawn in a second palette. Greys, whites, blacks and the warning reds stay.
//   Roamie.theme.set('#a06bff')   a hex colour or a name ('violet', 'silver', …); '' goes back to the default
//   Roamie.theme.pal([[r,g,b],…]) a live copy of a palette that follows the colour
//   Roamie.theme.css(text)        the colours in a CSS value or canvas colour, turned
//   Roamie.theme.on(fn)           called after the colour changes
// Loaded right after core.js, before anything draws. ?accent=<colour> on a page's address previews one.
(() => {
  const R = window.Roamie;
  // The hue the app is drawn in (its accent, #78ffe2), and the colour this build starts in.
  const BASE_H = 167, DEFAULT = '#a06bff';
  const NAMES = {
    violet: '#a06bff', purple: '#a06bff', lila: '#a06bff', lilac: '#b79bff', pink: '#ff7ad1', magenta: '#ff5ce0', red: '#ff5a5a', green: '#5dff8f',
    emerald: '#3fe39b', lime: '#b6ff5c', teal: '#78ffe2', cyan: '#6fe8ff', blue: '#6aa8ff', white: '#f2f4f8', silver: '#c9ced6', grey: '#b9bdc4', gray: '#b9bdc4',
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let target = null, chosen = DEFAULT; // target: { h, s } to turn toward, or null to draw as written
  const listeners = new Set(), pals = [], cache = new Map();

  const toHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d < 1e-6) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, Math.min(1, s), l];
  };
  const toRgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };
  // "#abc", "#aabbcc", "#aabbccdd", "rgb(1, 2, 3)", "rgba(1,2,3,.5)", "rgb(1 2 3 / 50%)" -> [r, g, b, a] or null.
  const parse = (text) => {
    const t = String(text).trim().toLowerCase();
    if (t[0] === '#') {
      const x = t.slice(1);
      if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(x)) return null;
      const full = x.length < 6 ? [...x].map((c) => c + c).join('') : x;
      const n = (i) => parseInt(full.slice(i, i + 2), 16);
      return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
    }
    if (!t.startsWith('rgb')) return null;
    const v = t.slice(t.indexOf('(') + 1).match(/[\d.]+%?/g);
    if (!v || v.length < 3) return null;
    const a = v[3] == null ? 1 : v[3].endsWith('%') ? parseFloat(v[3]) / 100 : parseFloat(v[3]);
    return [parseFloat(v[0]), parseFloat(v[1]), parseFloat(v[2]), a];
  };
  // A shade from the app's teal family (greens to cyans with any colour in them) turns; everything else stays.
  const rgb = (r, g, b) => {
    if (!target) return [r, g, b];
    const [h, s, l] = toHsl(r, g, b);
    if (s < 0.08 || h < 120 || h > 200) return [r, g, b];
    return toRgb(target.h, Math.min(1, s * target.s), l);
  };
  const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, HAS = /#[0-9a-f]{3,8}\b|rgba?\(/i;
  const css = (text) => {
    if (!target || typeof text !== 'string' || !HAS.test(text)) return text;
    let out = cache.get(text);
    if (out === undefined) {
      out = text.replace(COLOUR, (m) => {
        const c = parse(m);
        if (!c) return m;
        const [r, g, b] = rgb(c[0], c[1], c[2]);
        if (r === c[0] && g === c[1] && b === c[2]) return m; // not one of the app's shades: as written
        return c[3] < 1 ? `rgba(${r}, ${g}, ${b}, ${+c[3].toFixed(3)})` : `rgb(${r}, ${g}, ${b})`;
      });
      if (cache.size > 4000) cache.clear();
      cache.set(text, out);
    }
    return out;
  };

  // ---------- the canvas: every colour set on a 2D context passes through here ----------
  const patch = (proto) => {
    if (!proto) return;
    for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d?.set) continue;
      Object.defineProperty(proto, prop, { ...d, set(v) { d.set.call(this, target && typeof v === 'string' ? css(v) : v); } });
    }
  };
  if (typeof CanvasRenderingContext2D !== 'undefined') patch(CanvasRenderingContext2D.prototype);
  if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') patch(OffscreenCanvasRenderingContext2D.prototype);
  if (typeof CanvasGradient !== 'undefined') {
    const add = CanvasGradient.prototype.addColorStop;
    CanvasGradient.prototype.addColorStop = function (at, colour) { return add.call(this, at, target && typeof colour === 'string' ? css(colour) : colour); };
  }

  // ---------- CSS: the stylesheets' rules and the styles set on elements ----------
  // What each declaration said before it was turned, so a colour is turned once from what was written, however
  // often this runs, and a new colour starts again from the original.
  const written = new WeakMap();
  const SHORTHANDS = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-block', 'border-inline', 'border-color', 'outline', 'column-rule', 'text-decoration'];
  const restyle = (style) => {
    if (!style) return;
    let seen = written.get(style);
    if (!seen) written.set(style, (seen = new Map()));
    const one = (prop, now) => {
      const had = seen.get(prop), original = had && had[1] === now ? had[0] : now;
      if (!HAS.test(original)) return;
      const want = css(original);
      if (want !== now) style.setProperty(prop, want, style.getPropertyPriority(prop));
      seen.set(prop, [original, style.getPropertyValue(prop)]);
    };
    for (let i = 0; i < style.length; i++) one(style[i], style.getPropertyValue(style[i]));
    // A shorthand written with a var() in it ("background: radial-gradient(…), var(--bg)") has no values for its
    // parts until it's used: only the shorthand itself can be read and set.
    for (const prop of SHORTHANDS) { const now = style.getPropertyValue(prop); if (now && now.includes('var(')) one(prop, now); }
  };
  const walk = (rules) => {
    for (const rule of rules ?? []) {
      if (rule.style) restyle(rule.style);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  const restyleAll = () => {
    if (typeof document === 'undefined') return;
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* a sheet from elsewhere can't be read: it keeps its colours */ }
    }
    for (const el of document.querySelectorAll('[style]')) restyle(el.style);
  };
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    let queued = false;
    const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; restyleAll(); }); };
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes') { restyle(m.target.style); continue; }
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'STYLE' || n.tagName === 'LINK') { later(); n.addEventListener?.('load', later); continue; }
          if (n.hasAttribute('style')) restyle(n.style);
          for (const el of n.querySelectorAll?.('[style]') ?? []) restyle(el.style);
          if (n.querySelector?.('style')) later();
        }
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', restyleAll);
    window.addEventListener('load', restyleAll);
  }

  const paint = () => {
    for (const [base, live] of pals) base.forEach((c, i) => { const t = rgb(c[0], c[1], c[2]); live[i][0] = t[0]; live[i][1] = t[1]; live[i][2] = t[2]; });
  };

  R.theme = {
    DEFAULT,
    /** The colour as a hex code, or null when it isn't one (or a known name). */
    clean(colour) {
      const t = String(colour ?? '').trim().toLowerCase();
      const hex = NAMES[t] ?? (t[0] === '#' ? t : /^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(t) ? `#${t}` : null);
      const c = hex && /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex) ? parse(hex) : null;
      return c ? `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}` : null;
    },
    get colour() { return chosen; },
    set(colour) {
      chosen = this.clean(colour) ?? DEFAULT;
      const [r, g, b] = parse(chosen), [h, s] = toHsl(r, g, b);
      // The app's own teal: draw as written. A grey or white: every shade loses its colour.
      target = s > 0.08 && Math.abs(h - BASE_H) < 2 && s > 0.95 ? null : { h, s: s < 0.08 ? 0 : clamp(s, 0.25, 1) };
      cache.clear();
      paint();
      restyleAll();
      for (const fn of listeners) fn(chosen);
      return chosen;
    },
    pal(base) {
      const live = base.map((c) => c.slice());
      pals.push([base.map((c) => c.slice()), live]);
      paint();
      return live;
    },
    rgb, css,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const asked = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('accent') : null;
  R.theme.set(asked ?? DEFAULT);
})();
