// Where Jarvis stands on the screen (roamies/place.js), and the layout it's given. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { layoutOf } from '../colour.mjs';

const src = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\r/g, '');
const win = { Roamie: {} };
new Function('window', 'performance', src('../../../roamies/place.js'))(win, { now: () => 0 });
const P = win.Roamie.place;
const screen = { l: 0, t: 0, r: 1920, b: 1040 }, rad = 150;
const over = (rect, p) => p.x > rect[0] && p.x < rect[0] + rect[2] && p.y > rect[1] && p.y < rect[1] + rect[3];

// A window on the left half: it stands on the bare desktop to the right, whole on screen.
let left = [{ rect: [0, 0, 1100, 1040], front: true }];
let r = P.best({ screen, windows: left, rad, here: [500, 500] });
assert.ok(r.x > 1100 + rad * 0.8, `beside the window, not on it (${Math.round(r.x)}, ${Math.round(r.y)})`);
assert.ok(r.x <= 1920 - rad && r.y >= rad && r.y <= 1040 - rad, 'and all of it on screen');
assert.ok(r.score < r.here - 0.12, 'clearly better than the middle of the window, so it moves');

// A window filling the screen: off the middle, at its quiet right edge or a lower corner.
const full = [{ rect: [0, 0, 1920, 1040], front: true }];
r = P.best({ screen, windows: full, rad });
assert.ok(Math.hypot(r.x - 960, r.y - 480) > 500, `out of the middle of a full-screen window (${Math.round(r.x)}, ${Math.round(r.y)})`);
assert.ok(P.score(960, 450, { screen, windows: full, rad }).score > r.score + 0.4, 'the middle is much worse');

// Two windows with a gap: in the gap, not on either.
const two = [{ rect: [0, 0, 800, 1040], front: true }, { rect: [1200, 0, 720, 1040], front: false }];
r = P.best({ screen, windows: two, rad });
assert.ok(!over(two[0].rect, r) && !over(two[1].rect, r), `in the gap between two windows (${Math.round(r.x)})`);

// A window behind matters less than the front one: with no free space it stands on the one behind.
const split = [{ rect: [0, 0, 960, 1040], front: true }, { rect: [960, 0, 960, 1040], front: false }];
r = P.best({ screen, windows: split, rad });
assert.ok(r.x > 960, 'on the window behind, not the front one');

// It stays put unless somewhere is clearly better, and doesn't flit between equals.
r = P.best({ screen, windows: [], rad, here: [1500, 800] });
assert.ok(Math.hypot(r.x - 1500, r.y - 800) < rad, 'an empty desktop: it stays where it is');

// Never on its own cards or drawings, never on the cursor, never on what it's talking about (but beside it).
r = P.best({ screen, windows: [], rad, here: [1500, 800], avoid: [[1300, 600, 500, 400]] });
assert.ok(!over([1300 - rad, 600 - rad, 500 + rad * 2, 400 + rad * 2], r), 'clear of a card');
assert.ok(P.score(700, 500, { screen, rad, cursor: [700, 500] }).score > P.score(700, 500, { screen, rad }).score + 0.5, 'not on the cursor');
assert.equal(P.score(700, 500, { screen, rad, cursor: [100, 100] }).parts.cursor, 0, 'a cursor elsewhere changes nothing: it neither follows nor runs');
const target = [300, 300, 200, 60];
r = P.best({ screen, windows: full, rad, target, here: [1700, 850] });
const gap = Math.hypot(r.x - Math.min(Math.max(r.x, 300), 500), r.y - Math.min(Math.max(r.y, 300), 360));
assert.ok(gap > rad * 1.2 && gap < rad * 4, `beside what it's talking about (gap ${Math.round(gap)})`);

// Off-screen spots are refused, and a screen too small for it still gets an answer.
assert.ok(P.score(20, 20, { screen, rad }).score > 50);
assert.ok(Number.isFinite(P.best({ screen: { l: 0, t: 0, r: 200, b: 200 }, rad }).x));

// The feed: only real rectangles, mapped into the overlay, and a change is noticed once.
P.feed([{ bounds: [0, 0, 800, 600], front: true }, { bounds: [1, 2, 10, 10] }, { bounds: 'x' }], (b) => b.map((v) => v + 5));
assert.deepEqual(P.windows, [{ rect: [5, 5, 805, 605], front: true }]);
const rev = P.rev;
P.feed([{ bounds: [0, 0, 800, 600], front: true }], (b) => b.map((v) => v + 5));
assert.equal(P.rev, rev, 'the same layout again is no change');

// What leaves the sidecar: rectangles and the front flag only; no titles, no app names, none of Jarvis' own windows.
const sent = layoutOf([{ app: 'roamies', title: 'x', bounds: [0, 0, 1920, 1080], frontApp: true }, { app: 'Chrome', title: 'Bank', bounds: [0.4, 0, 900, 700], frontApp: true }, { app: 'Chrome', title: 'Other', bounds: [5, 5, 300, 300], frontApp: true }, { app: 'Notes', bounds: [1, 2] }]);
assert.deepEqual(sent, [{ bounds: [0, 0, 900, 700], front: true }, { bounds: [5, 5, 300, 300], front: false }]);

// The overlay moves by dash or phase, never a glide, and doesn't react to the cursor when free.
const agent = src('../../../roamies/agent.js');
assert.match(agent, /m\.drive = hopDrive/);
assert.match(agent, /!station\.byCursor && !free\(\)\) \{/, 'free: it does not flee the cursor');
assert.match(src('../../../roamies/host.js'), /m\.kind === 'layout'/);
assert.match(src('../../../desktop.html'), /roamies\/place\.js/);
console.log('place tests: passed');
