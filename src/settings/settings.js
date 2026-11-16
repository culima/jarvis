// The settings window. It asks the main process for the settings and sends back each change; without a main
// process (opened in a browser) it works on a copy, so the page can be tried by itself.
(() => {
  const $ = (id) => document.getElementById(id);
  const COLOURS = ['#a06bff', '#4fd1ff', '#3dffb0', '#ffd24a', '#ff5a6a', '#e8ecf4'];
  const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge']];
  const STATES = [[null, 'Idle'], ['listen', 'Listening'], ['think', 'Thinking'], ['talk', 'Speaking']];
  let cfg = { colour: '#a06bff', size: 'huge', openAtLogin: false, version: '0.1.0' };
  const ask = (m) => (window.bridge ? window.bridge.ask(m) : Promise.resolve(m.kind === 'set' ? Object.assign(cfg, m.patch) : cfg));
  const set = async (patch) => { cfg = (await ask({ kind: 'set', patch })) ?? cfg; render(); };

  function render() {
    document.documentElement.style.setProperty('--c', cfg.colour);
    $('version').textContent = `v${cfg.version ?? '0.1.0'}`;
    $('hex').value = cfg.colour;
    for (const b of $('swatches').children) b.classList.toggle('on', b.dataset.c === cfg.colour);
    for (const b of $('sizes').children) b.classList.toggle('on', b.dataset.v === cfg.size);
    $('login').setAttribute('aria-checked', String(!!cfg.openAtLogin));
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
  ask({ kind: 'config' }).then((c) => { cfg = c ?? cfg; render(); });
  render();
})();
