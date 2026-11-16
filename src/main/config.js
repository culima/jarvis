// Settings, kept as one JSON file in the app's own data folder.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = { colour: '#a06bff', size: 'huge', openAtLogin: false, base: 'https://api.openai.com/v1', model: '', sttModel: '', name: '', voiceName: '', voiceRate: 1 };
const SIZES = ['small', 'medium', 'large', 'huge'];

/** What may be saved: unknown keys are dropped, bad values fall back to what was there. */
function clean(next, was = DEFAULTS) {
  const out = { ...DEFAULTS, ...was };
  if (typeof next?.colour === 'string' && /^#[0-9a-f]{6}$/i.test(next.colour)) out.colour = next.colour.toLowerCase();
  if (SIZES.includes(next?.size)) out.size = next.size;
  if (typeof next?.openAtLogin === 'boolean') out.openAtLogin = next.openAtLogin;
  for (const k of ['base', 'model', 'sttModel', 'name', 'voiceName']) if (typeof next?.[k] === 'string' && next[k].length <= 300) out[k] = next[k].trim();
  if (Number.isFinite(next?.voiceRate)) out.voiceRate = Math.min(2, Math.max(0.5, next.voiceRate));
  return out;
}

function createConfig(dir) {
  const file = path.join(dir, 'config.json');
  let data = { ...DEFAULTS };
  try { data = clean(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* first run, or unreadable: defaults */ }
  return {
    get: () => ({ ...data }),
    set(patch) {
      data = clean({ ...data, ...patch }, data);
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { /* read-only disk: keep it for this run */ }
      return { ...data };
    },
  };
}

module.exports = { createConfig, clean, DEFAULTS, SIZES };
