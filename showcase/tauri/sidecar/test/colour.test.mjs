// The colour setting: what can be saved, and that every page follows it. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanColour, colourOf, DEFAULT_COLOUR } from '../colour.mjs';

assert.deepEqual(cleanColour('#FF5A5A'), { ok: true, colour: '#ff5a5a' });
assert.deepEqual(cleanColour('0af'), { ok: true, colour: '#00aaff' }, 'three digits, no hash');
assert.deepEqual(cleanColour(' Silver '), { ok: true, colour: '#c9ced6' }, 'a name');
assert.deepEqual(cleanColour(''), { ok: true, colour: '' }, 'empty: back to the default');
assert.deepEqual(cleanColour('violet'), { ok: true, colour: '' }, 'the default by name');
for (const bad of ['#12', 'orangey', '#gggggg', 'rgb(1,2,3)']) { const r = cleanColour(bad); assert.equal(r.ok, false, `${bad} is refused`); assert.ok(r.why.length > 10, 'with a reason'); }
assert.equal(colourOf({}), DEFAULT_COLOUR);
assert.equal(colourOf({ accent: '#ff5a5a' }), '#ff5a5a');

// theme.js turns the app's teal shades toward the colour and leaves the rest alone.
const src = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
globalThis.window = { Roamie: {} };
new Function(src('../../../roamies/theme.js'))();
const T = window.Roamie.theme;
assert.equal(T.DEFAULT, DEFAULT_COLOUR, 'the pages and the app start in the same colour');
assert.equal(T.colour, DEFAULT_COLOUR);
const hue = ([r, g, b]) => { const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; return d ? Math.round(60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4)) : -1; };
const nums = (t) => t.match(/[\d.]+/g).map(Number);
assert.ok(Math.abs(hue(nums(T.css('#78ffe2'))) - 261) < 6, 'the accent turns violet');
assert.ok(Math.abs(hue(nums(T.css('rgba(120, 255, 226, 0.5)'))) - 261) < 6, 'rgba shades too');
assert.match(T.css('rgba(120, 255, 226, 0.5)'), /, 0\.5\)$/, 'keeping their transparency');
assert.equal(T.css('#ffffff'), '#ffffff', 'white stays');
assert.equal(T.css('rgba(0, 0, 0, 0.45)'), 'rgba(0, 0, 0, 0.45)', 'black stays');
assert.equal(T.css('#ff8a7a'), '#ff8a7a', 'the warning red stays');
assert.match(T.css('radial-gradient(closest-side, rgba(120, 255, 226, 0.10), transparent)'), /^radial-gradient\(closest-side, rgba\(\d+, \d+, \d+, 0\.1\), transparent\)$/, 'colours inside a longer value');
const live = T.pal([[4, 16, 18], [120, 255, 226]]);
assert.ok(Math.abs(hue(live[1]) - 261) < 6, 'a palette follows');
T.set('#ff5a5a');
assert.ok(hue(live[1]) < 8 || hue(live[1]) > 352, 'and changes in place with the colour');
T.set('silver');
assert.ok(Math.max(...live[1]) - Math.min(...live[1]) < 70, 'silver takes the colour out');
T.set('teal');
assert.deepEqual(live[1], [120, 255, 226], 'the app\'s own teal draws as written');
assert.equal(T.set('nonsense'), DEFAULT_COLOUR, 'anything else is the default');
let told = 0; T.on(() => told++); T.set('red'); assert.equal(told, 1, 'listeners hear of a change');
// Every page loads it right after core.js, and the body's palettes follow it.
for (const [page, at] of [['../../../desktop.html', 'roamies/'], ['../../../panel/index.html', '../roamies/'], ['../../../onboarding/index.html', '../roamies/']]) {
  // (Line ends differ by system: a Windows checkout has \r\n.)
  assert.ok(src(page).replace(/\r/g, '').includes(`<script src="${at}core.js"></script>\n<script src="${at}theme.js"></script>`), `${page} loads theme.js after core.js`);
}
for (const f of ['../../../roamies/12-sidekick.js', '../../../panel/panel.js', '../../../onboarding/onboarding.js']) assert.match(src(f), /Roamie\.theme\.pal\(/, `${f}: the palette follows the colour`);
assert.match(src('../../../roamies/host.js'), /m\.kind === 'accent'/, 'the overlay hears of a new colour');
console.log('colour tests: passed');
