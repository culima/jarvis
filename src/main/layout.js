// The screen's layout, for Jarvis to work out where to stand: the app windows front to back (their rectangles and
// which is in front), read from Windows itself several times a second. Titles are never read. Windows only; elsewhere
// (and if anything here fails) there is simply no layout and he keeps to his spot.
function createLayout({ ownPid = process.pid } = {}) {
  if (process.platform !== 'win32') return { read: () => null };
  let api = null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll'), dwm = koffi.load('dwmapi.dll');
    const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    api = {
      koffi,
      top: user32.func('void* __stdcall GetTopWindow(void* hWnd)'),
      next: user32.func('void* __stdcall GetWindow(void* hWnd, uint32_t cmd)'),
      front: user32.func('void* __stdcall GetForegroundWindow()'),
      visible: user32.func('bool __stdcall IsWindowVisible(void* hWnd)'),
      iconic: user32.func('bool __stdcall IsIconic(void* hWnd)'),
      rect: user32.func('bool __stdcall GetWindowRect(void* hWnd, _Out_ RECT* r)'),
      style: user32.func('long __stdcall GetWindowLongW(void* hWnd, int index)'),
      titled: user32.func('int __stdcall GetWindowTextLengthW(void* hWnd)'),
      pid: user32.func('uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* pid)'),
      attr: dwm.func('long __stdcall DwmGetWindowAttribute(void* hWnd, uint32_t attr, _Out_ int* value, uint32_t size)'),
    };
  } catch { return { read: () => null }; }
  const addr = (p) => (p ? String(api.koffi.address(p)) : '');
  return {
    /** [{ bounds: [x, y, w, h] in physical pixels, front }] front to back, or null if it couldn't be read. */
    read() {
      try {
        const front = addr(api.front()), out = [];
        let marked = false;
        for (let h = api.top(null), n = 0; h && n < 400 && out.length < 14; h = api.next(h, 2), n++) {
          if (!api.visible(h) || api.iconic(h) || !api.titled(h)) continue;
          if (api.style(h, -20) & 0x80) continue; // tool windows: palettes, tray pop-ups
          const cloaked = [0];
          api.attr(h, 14, cloaked, 4);
          if (cloaked[0]) continue; // on another virtual desktop, or a suspended store app
          const pid = [0];
          api.pid(h, pid);
          if (pid[0] === ownPid) continue; // Jarvis' own windows
          const r = {};
          if (!api.rect(h, r) || r.right - r.left < 120 || r.bottom - r.top < 80) continue;
          const isFront = !marked && addr(h) === front;
          marked ||= isFront;
          out.push({ bounds: [r.left, r.top, r.right - r.left, r.bottom - r.top], front: isFront });
        }
        return out;
      } catch { return null; }
    },
  };
}
module.exports = { createLayout };
