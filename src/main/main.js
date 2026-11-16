// Jarvis, the main process: one transparent window over the screen that he lives in (clicks pass through it), a
// settings window, a tray icon, and the feed that tells him how the screen is laid out.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, desktopCapturer, globalShortcut, safeStorage, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createConfig } = require('./config');
const { createLayout } = require('./layout');
const { busyness } = require('./busy');
const { createBrain } = require('./brain');

if (!app.requestSingleInstanceLock()) app.quit();

let config = null, overlay = null, settings = null, prompt = null, tray = null, overlayReady = false, shown = true;
const brain = createBrain();

// The API key: encrypted with Windows' own protection for this user, in the app's data folder. Never sent to a page.
const keyFile = () => path.join(app.getPath('userData'), 'key.bin');
const readKey = () => { try { return safeStorage.decryptString(fs.readFileSync(keyFile())); } catch { return ''; } };
const saveKey = (k) => { try { if (k) fs.writeFileSync(keyFile(), safeStorage.encryptString(k)); else fs.rmSync(keyFile(), { force: true }); return true; } catch { return false; } };

// One request at a time: he thinks until the first sentence is ready, then speaks them in order.
let turn = 0;
async function hear(text) {
  text = String(text ?? '').trim();
  if (!text) return;
  const c = config.get(), key = readKey(), id = ++turn;
  if (!shown) setShown(true);
  toOverlay({ kind: 'reply', id, begin: true });
  if (!c.model) { toOverlay({ kind: 'reply', id, text: 'I have no brain yet. Open my settings and choose a model.', end: true }); openSettings(); return; }
  try {
    await brain.ask(text, { base: c.base, key, model: c.model, name: c.name, onSentence: (s) => { if (id === turn) toOverlay({ kind: 'reply', id, text: s }); } });
    if (id === turn) toOverlay({ kind: 'reply', id, end: true });
  } catch (e) {
    if (e?.name === 'AbortError' || id !== turn) return;
    toOverlay({ kind: 'reply', id, text: `I couldn't reach my brain: ${String(e?.message ?? e).slice(0, 160)}`, end: true });
  }
}
async function heard(bytes, mime) {
  const c = config.get();
  if (!c.sttModel) { toOverlay({ kind: 'reply', id: ++turn, begin: true }); toOverlay({ kind: 'reply', id: turn, text: 'I can hear you, but I have no speech model yet. Choose one in my settings.', end: true }); return; }
  toOverlay({ kind: 'state', mode: 'think' });
  try { const text = await brain.transcribe(Buffer.from(bytes), mime, { base: c.base, key: readKey(), model: c.sttModel }); if (text) await hear(text); else toOverlay({ kind: 'state', mode: null }); }
  catch (e) { toOverlay({ kind: 'reply', id: ++turn, begin: true }); toOverlay({ kind: 'reply', id: turn, text: `I couldn't make out what you said: ${String(e?.message ?? e).slice(0, 140)}`, end: true }); }
}

// The command line: a slim bar that opens on the shortcut, takes one line, and goes away.
function openPrompt() {
  if (prompt && !prompt.isDestroyed()) { prompt.show(); prompt.focus(); return; }
  const wa = screen.getPrimaryDisplay().workArea, w = 680, h = 76;
  prompt = new BrowserWindow({
    x: Math.round(wa.x + (wa.width - w) / 2), y: Math.round(wa.y + wa.height * 0.72), width: w, height: h,
    transparent: true, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  prompt.setAlwaysOnTop(true, 'screen-saver');
  prompt.loadFile(path.join(__dirname, '..', 'prompt', 'index.html'));
  prompt.once('ready-to-show', () => { prompt.show(); prompt.focus(); });
  prompt.on('blur', () => { if (prompt && !prompt.isDestroyed()) prompt.hide(); });
}
const asset = (f) => path.join(__dirname, '..', '..', 'assets', f);
const toOverlay = (m) => { if (overlay && overlayReady && !overlay.isDestroyed()) overlay.webContents.send('msg', m); };

function openOverlay() {
  const d = screen.getPrimaryDisplay(), b = d.bounds;
  overlay = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  // He is left out of screenshots and recordings, and so out of the picture he reads the screen from.
  overlay.setContentProtection(true);
  overlay.loadFile(path.join(__dirname, '..', 'overlay', 'index.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
}

function openSettings() {
  if (settings && !settings.isDestroyed()) { settings.show(); settings.focus(); return; }
  settings = new BrowserWindow({
    width: 880, height: 620, minWidth: 720, minHeight: 520, backgroundColor: '#07080c', title: 'Jarvis', autoHideMenuBar: true, icon: asset('icon-256.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settings.setMenu(null);
  settings.loadFile(path.join(__dirname, '..', 'settings', 'index.html'));
}

function setShown(on) {
  shown = on;
  toOverlay({ kind: 'show', on });
  buildTray();
}

function buildTray() {
  if (!tray) { tray = new Tray(nativeImage.createFromPath(asset('icon-32.png'))); tray.setToolTip('Jarvis'); tray.on('click', openSettings); }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ask Jarvis…\tCtrl+Shift+Space', click: openPrompt },
    { label: 'Talk to Jarvis\tCtrl+Shift+J', click: () => toOverlay({ kind: 'listen' }) },
    { label: 'Stop', click: () => { turn++; brain.stop(); toOverlay({ kind: 'stop' }); } },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: shown ? 'Hide Jarvis' : 'Show Jarvis', click: () => setShown(!shown) },
    { type: 'separator' },
    { label: 'Quit Jarvis', click: () => app.quit() },
  ]));
}

// The layout feed: windows about seven times a second, the picture's busyness about once a second. Only changes are sent.
function startFeed() {
  const layout = createLayout();
  let lastSig = '', grid = null, busyTick = 0, reading = false;
  const local = (r) => {
    // Physical pixels to the overlay's own coordinates.
    const dip = process.platform === 'win32' ? screen.screenToDipRect(null, { x: r[0], y: r[1], width: r[2], height: r[3] }) : { x: r[0], y: r[1], width: r[2], height: r[3] };
    const o = overlay.getBounds();
    return [dip.x - o.x, dip.y - o.y, dip.width, dip.height];
  };
  const picture = async () => {
    if (reading) return;
    reading = true;
    try {
      const d = screen.getPrimaryDisplay(), w = 480, h = Math.round((480 * d.size.height) / d.size.width);
      const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } })).find((s) => String(s.display_id) === String(d.id)) ?? null;
      const img = src?.thumbnail;
      if (img && !img.isEmpty()) { const s = img.getSize(); grid = { cols: 32, rows: 18, cells: busyness(img.toBitmap(), s.width, s.height, 32, 18), bounds: [0, 0, d.bounds.width, d.bounds.height] }; }
    } catch { grid = null; } finally { reading = false; }
  };
  setInterval(() => {
    if (!overlay || overlay.isDestroyed() || !overlayReady) return;
    if (busyTick++ % 7 === 0) picture();
    const list = layout.read();
    const d = screen.getPrimaryDisplay(), wa = d.workArea, b = d.bounds;
    const windows = (list ?? []).map((w) => ({ bounds: local(w.bounds), front: w.front }));
    const safe = { l: wa.x - b.x, t: wa.y - b.y, r: b.x + b.width - (wa.x + wa.width), b: b.y + b.height - (wa.y + wa.height) };
    const p = screen.getCursorScreenPoint();
    const msg = { kind: 'layout', windows, grid, safe };
    const sig = JSON.stringify(msg);
    if (sig !== lastSig) { lastSig = sig; toOverlay(msg); }
    toOverlay({ kind: 'cursor', at: [p.x - b.x, p.y - b.y] });
  }, 150);
}

app.whenReady().then(() => {
  app.setAppUserModelId('at.culima.jarvis');
  config = createConfig(app.getPath('userData'));
  // The overlay may use the microphone (to listen when asked); nothing else may ask for anything.
  session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(permission === 'media' && !!overlay && wc === overlay.webContents));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!overlay && wc === overlay.webContents);
  openOverlay();
  buildTray();
  startFeed();
  globalShortcut.register('Control+Shift+Space', openPrompt);
  globalShortcut.register('Control+Shift+J', () => { if (!shown) setShown(true); toOverlay({ kind: 'listen' }); });
  ipcMain.on('ready', (e) => { if (overlay && e.sender === overlay.webContents) { overlayReady = true; toOverlay({ kind: 'config', ...config.get() }); } });
  ipcMain.handle('ask', async (_e, m) => {
    if (m?.kind === 'config') return { ...config.get(), version: app.getVersion(), hasKey: !!readKey() };
    if (m?.kind === 'key') { const ok = saveKey(String(m.key ?? '').trim()); return { ok, hasKey: !!readKey() }; }
    if (m?.kind === 'models') { try { return { ok: true, models: await brain.models({ base: m.base ?? config.get().base, key: readKey() }) }; } catch (e) { return { ok: false, why: String(e?.message ?? e).slice(0, 200) }; } }
    if (m?.kind === 'set') {
      const next = config.set(m.patch ?? {});
      toOverlay({ kind: 'config', ...next });
      if (process.platform === 'win32' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.openAtLogin });
      return { ...next, version: app.getVersion(), hasKey: !!readKey() };
    }
    return null;
  });
  ipcMain.on('msg', (e, m) => {
    if (m?.kind === 'preview' && typeof m.mode !== 'undefined') toOverlay({ kind: 'state', mode: m.mode });
    else if (m?.kind === 'say' && prompt && e.sender === prompt.webContents) { prompt.hide(); hear(m.text); }
    else if (m?.kind === 'close' && prompt && e.sender === prompt.webContents) prompt.hide();
    else if (m?.kind === 'audio' && overlay && e.sender === overlay.webContents) heard(m.bytes, m.mime);
    else if (m?.kind === 'test-voice') toOverlay({ kind: 'reply', id: ++turn, begin: true }), toOverlay({ kind: 'reply', id: turn, text: 'Good day. All systems are online.', end: true });
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
});
app.on('second-instance', openSettings);
// He lives in the tray: closing the settings window doesn't quit him.
app.on('window-all-closed', () => {});
