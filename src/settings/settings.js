// The settings window. It asks the main process for the settings and sends back each change; without a main
// process (opened in a browser) it works on a copy, so the page can be tried by itself.
(() => {
  const $ = (id) => document.getElementById(id);
  const COLOURS = ['#a06bff', '#4fd1ff', '#3dffb0', '#ffd24a', '#ff5a6a', '#e8ecf4'];
  const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge']];
  const STATES = [[null, 'Idle'], ['listen', 'Listening'], ['think', 'Thinking'], ['talk', 'Speaking']];
  let cfg = { colour: '#a06bff', size: 'huge', openAtLogin: false, version: '0.1.0', base: 'https://api.openai.com/v1', model: '', sttModel: '', name: '', voiceName: '', voiceRate: 1, hasKey: false };
  const ask = (m) => (window.bridge ? window.bridge.ask(m) : Promise.resolve(m.kind === 'set' ? Object.assign(cfg, m.patch) : cfg));
  const set = async (patch) => { cfg = (await ask({ kind: 'set', patch })) ?? cfg; render(); };

  function render() {
    document.documentElement.style.setProperty('--c', cfg.colour);
    $('version').textContent = `v${cfg.version ?? '0.1.0'}`;
    $('hex').value = cfg.colour;
    for (const b of $('swatches').children) b.classList.toggle('on', b.dataset.c === cfg.colour);
    for (const b of $('sizes').children) b.classList.toggle('on', b.dataset.v === cfg.size);
    $('login').setAttribute('aria-checked', String(!!cfg.openAtLogin));
    if (document.activeElement !== $('name')) $('name').value = cfg.name ?? '';
    if (document.activeElement !== $('base')) $('base').value = cfg.base ?? '';
    $('key-state').textContent = cfg.hasKey ? 'Saved. Stored encrypted on this PC; paste a new one to replace it.' : 'Not set. Stored encrypted on this PC, never shown again.';
    $('rate').value = cfg.voiceRate ?? 1; $('rate-state').textContent = `${Number(cfg.voiceRate ?? 1).toFixed(2)}×`;
  }

  for (const c of COLOURS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.c = c; b.style.setProperty('--s', c); b.setAttribute('aria-label', `Colour ${c}`);
    b.onclick = () => set({ colour: c });
    $('swatches').append(b);
  }
  for (const [v, label] of SIZES) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.v = v; b.textContent = label; b.onclick = () => set({ size: v });
    $('sizes').append(b);
  }
  for (const [mode, label] of STATES) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.onclick = () => { for (const o of $('states').children) o.classList.toggle('on', o === b); window.bridge?.send({ kind: 'preview', mode }); };
    $('states').append(b);
  }
  const applyHex = () => { let v = $('hex').value.trim(); if (!v.startsWith('#')) v = `#${v}`; if (/^#[0-9a-f]{6}$/i.test(v)) set({ colour: v.toLowerCase() }); else $('hex').value = cfg.colour; };
  $('hex-set').onclick = applyHex;
  $('hex').onkeydown = (e) => { if (e.key === 'Enter') applyHex(); };
  $('login').onclick = () => set({ openAtLogin: !cfg.openAtLogin });
  for (const t of document.querySelectorAll('.tab')) {
    t.onclick = () => {
      for (const o of document.querySelectorAll('.tab')) o.classList.toggle('on', o === t);
      for (const p of document.querySelectorAll('.pane')) p.classList.toggle('on', p.id === t.dataset.pane);
    };
  }
  // Brain: text fields save when left; the key is sent once and never read back.
  const fill = (sel, list, value, empty) => {
    sel.textContent = '';
    for (const v of ['', ...new Set([...(value ? [value] : []), ...list])]) { const o = document.createElement('option'); o.value = v; o.textContent = v || empty; sel.append(o); }
    sel.value = value ?? '';
  };
  let models = [];
  const fillModels = () => { fill($('model'), models.filter((m) => !/transcri|whisper|tts|embed|image|audio|realtime|moderation/i.test(m)), cfg.model, 'choose a model'); fill($('stt'), models.filter((m) => /transcri|whisper/i.test(m)), cfg.sttModel, 'choose a speech model'); };
  for (const [id, key] of [['name', 'name'], ['base', 'base']]) $(id).onchange = () => set({ [key]: $(id).value });
  $('model').onchange = () => set({ model: $('model').value });
  $('stt').onchange = () => set({ sttModel: $('stt').value });
  $('key-set').onclick = async () => { const r = await ask({ kind: 'key', key: $('key').value }); $('key').value = ''; cfg.hasKey = !!r?.hasKey; render(); };
  $('model-load').onclick = async () => {
    $('model-state').textContent = 'Asking the service…';
    const r = await ask({ kind: 'models', base: $('base').value });
    if (r?.ok) { models = r.models; fillModels(); $('model-state').textContent = `${models.length} models found.`; } else $('model-state').textContent = `Couldn't load the list: ${r?.why ?? 'no answer'}`;
  };
  // Voice: the list comes from Windows, through this page.
  const voices = () => { const v = window.speechSynthesis?.getVoices?.() ?? []; fill($('voice-name'), v.map((x) => x.name), cfg.voiceName, 'Windows default'); };
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = voices;
  $('voice-name').onchange = () => set({ voiceName: $('voice-name').value });
  $('rate').oninput = () => { $('rate-state').textContent = `${Number($('rate').value).toFixed(2)}×`; };
  $('rate').onchange = () => set({ voiceRate: Number($('rate').value) });
  $('voice-test').onclick = () => window.bridge?.send({ kind: 'test-voice' });
  ask({ kind: 'config' }).then((c) => { cfg = c ?? cfg; render(); fillModels(); voices(); });
  render();
})();
