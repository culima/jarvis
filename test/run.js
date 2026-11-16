// Checks that run anywhere: settings, picture analysis, placement. Run: npm test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfig, clean, DEFAULTS } = require('../src/main/config');
const { busyness } = require('../src/main/busy');

// Settings: bad values never get saved; they survive a restart.
assert.equal(clean({ colour: 'red' }).colour, DEFAULTS.colour);
assert.equal(clean({ colour: '#FF8800', size: 'giant', extra: 1 }).colour, '#ff8800');
assert.equal(clean({ size: 'giant' }).size, DEFAULTS.size);
assert.equal('extra' in clean({ extra: 1 }), false);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-'));
createConfig(dir).set({ size: 'small', openAtLogin: true });
assert.deepEqual(createConfig(dir).get(), { ...DEFAULTS, size: 'small', openAtLogin: true });
assert.equal(clean({ voiceRate: 9 }).voiceRate, 2);
fs.writeFileSync(path.join(dir, 'config.json'), '{broken');
assert.deepEqual(createConfig(dir).get(), DEFAULTS, 'an unreadable file falls back to the defaults');

// Picture analysis: flat is calm, text is busy where it is, and a tiny picture doesn't crash.
const W = 120, H = 60, px = Buffer.alloc(W * H * 4, 20);
assert.equal(busyness(px, W, H, 4, 2), '00000000');
for (let line = 0; line < 6; line++) for (let y = 2 + line * 5; y < 4 + line * 5; y++) for (let x = 2 + (line % 2); x < 28; x++) px.fill(230, (y * W + x) * 4, (y * W + x) * 4 + 3);
const b = busyness(px, W, H, 4, 2);
assert.ok(Number(b[0]) >= 5 && [...b.slice(1)].every((d) => Number(d) <= 1), `text is busy where it is (${b})`);
assert.equal(busyness(Buffer.alloc(16), 2, 2, 4, 2), '00000000');

// Placement: beside a window, in the calm part of a full one, never on the cursor or off screen.
const win = { Jarvis: {} };
new Function('window', 'performance', fs.readFileSync(path.join(__dirname, '../src/overlay/place.js'), 'utf8'))(win, { now: () => 0 });
const P = win.Jarvis.place, screen = { l: 0, t: 0, r: 1920, b: 1040 }, rad = 150;
let r = P.best({ screen, windows: [{ rect: [0, 0, 1100, 1040], front: true }], rad, here: [500, 500] });
assert.ok(r.x > 1100 + rad * 0.8 && r.score < r.here - 0.12, 'beside the window, and clearly better than on it');
const full = [{ rect: [0, 0, 1920, 1040], front: true }], cells = [];
for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) cells.push(x >= 4 && x < 13 && y >= 2 && y < 9 ? 0 : 7);
r = P.best({ screen, windows: full, rad, grid: { cols: 32, rows: 18, cells, rect: [0, 0, 1920, 1040] } });
assert.ok(r.x > 240 && r.x < 780 && r.y > 114 && r.y < 522, `in the calm part of a full window (${Math.round(r.x)}, ${Math.round(r.y)})`);
assert.ok(P.score(700, 500, { screen, rad, cursor: [700, 500] }).score > P.score(700, 500, { screen, rad }).score + 0.5);
assert.ok(P.score(20, 20, { screen, rad }).score > 50);

// The body draws at every size and opens with the voice.
const page = { Jarvis: {} };
new Function('window', fs.readFileSync(path.join(__dirname, '../src/overlay/globe.js'), 'utf8'))(page);
const wide = (voice) => {
  const st = { t: 1, dt: 1 / 60, mode: 'talk', voice, act: null, open: 1, look: [0, 0], sq: 0, wide: 0, dizzy: 0, happy: 0, sleepy: 0 };
  let far = 0, n = 0;
  for (let i = 0; i < 40; i++) { st.t += 1 / 60; far = 0; n = 0; page.Jarvis.body.draw({ put: (x, y, l) => { n++; if (l >= 2) far = Math.max(far, Math.hypot(x - 100, y - 100)); }, L: 4, th: () => 0.5 }, 100, 100, 40, st); }
  return [far, n];
};
assert.ok(wide(0.5)[1] > 400, 'hundreds of parts');
assert.ok(wide(0.5)[0] > wide(0)[0] * 1.2, 'it opens with the voice');
// The brain: replies are cut into sentences as they stream, and a refused key is reported in plain words.
const { sentences, createBrain } = require('../src/main/brain');
assert.deepEqual(sentences('Hello there. How are you? I am'), [['Hello there.', 'How are you?'], 'I am']);
assert.deepEqual(sentences('It is 3. 14 and so on. Next'), [['It is 3. 14 and so on.'], 'Next']);
(async () => {
  const enc = new TextEncoder();
  const body = (async function* () { for (const d of ['Good ', 'evening. ', 'All systems ', 'are fine.']) yield enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`); yield enc.encode('data: [DONE]\n\n'); })();
  const said = [];
  const brain = createBrain({ fetch: async () => ({ ok: true, body }) });
  assert.equal(await brain.ask('status?', { model: 'm', onSentence: (x) => said.push(x) }), 'Good evening. All systems are fine.');
  assert.deepEqual(said, ['Good evening.', 'All systems are fine.']);
  await assert.rejects(() => createBrain({ fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Bad key' } }) }) }).ask('x', { model: 'm' }), /Bad key/);
  console.log('all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
