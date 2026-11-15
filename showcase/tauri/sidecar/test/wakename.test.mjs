// The wake word's name: what can be saved, and why not. Run: npm test
import assert from 'node:assert/strict';
import { cleanWakeName, hasWakeWord, wakeGreeting, wakeName, wakesOnName } from '../wakename.mjs';

assert.deepEqual(cleanWakeName('Jarvis'), { ok: true, name: 'Jarvis' });
assert.deepEqual(cleanWakeName('  jarvis '), { ok: true, name: 'Jarvis' });
assert.deepEqual(cleanWakeName('Hey Jarvis'), { ok: true, name: 'Jarvis' }, 'the greeting is dropped');
assert.deepEqual(cleanWakeName('hi, NOVA'), { ok: true, name: 'Nova' });
assert.equal(cleanWakeName('Zoë').ok, false, 'under 4 letters');
assert.deepEqual(cleanWakeName('Chloë'), { ok: true, name: 'Chloë' }, 'letters beyond English');
assert.deepEqual(cleanWakeName(''), { ok: true, name: '' }, 'empty: back to Roamies');
assert.deepEqual(cleanWakeName('Roamies'), { ok: true, name: '' });
assert.deepEqual(cleanWakeName('roamie'), { ok: true, name: '' });
for (const bad of ['Bob', 'Mr Jarvis', 'R2D2', 'Jar-vis', 'okay', 'Alexa', 'x'.repeat(21)]) {
  const r = cleanWakeName(bad);
  assert.equal(r.ok, false, `${bad} is refused`);
  assert.ok(r.why.length > 5, 'with a reason');
}
assert.equal(wakeName({}), 'Jarvis');
assert.deepEqual(cleanWakeName('Alright, Friday'), { ok: true, name: 'Friday' }, 'this greeting is dropped too');
assert.deepEqual(cleanWakeName('all right Friday'), { ok: true, name: 'Friday' });
assert.equal(wakeGreeting('win32'), 'Alright');
assert.equal(wakeGreeting('darwin'), 'Hey');
assert.ok(hasWakeWord('win32') && hasWakeWord('darwin') && !hasWakeWord('linux'), 'the wake word: macOS and Windows');
assert.equal(wakeName({ wakeName: 'Jarvis' }), 'Jarvis');
assert.ok(wakesOnName('win32') && !wakesOnName('darwin'), 'the name alone wakes it on Windows');
console.log('wake name tests: passed');
