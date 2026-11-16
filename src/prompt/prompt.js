// The command line: Enter sends the line to Jarvis, Escape closes it.
(() => {
  const q = document.getElementById('q');
  window.bridge?.ask({ kind: 'config' }).then((c) => { if (c?.colour) document.documentElement.style.setProperty('--c', c.colour); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q.value.trim()) { window.bridge?.send({ kind: 'say', text: q.value.trim() }); q.value = ''; }
    else if (e.key === 'Escape') { q.value = ''; window.bridge?.send({ kind: 'close' }); }
  });
  addEventListener('focus', () => q.focus());
})();
