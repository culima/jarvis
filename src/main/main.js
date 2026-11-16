// Jarvis, the main process: one transparent window over the screen that he lives in (clicks pass through it), a
// settings window, a tray icon, and the feed that tells him how the screen is laid out.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, desktopCapturer } = require('electron');
const path = require('node:path');
const { createConfig } = require('./config');
const { createLayout } = require('./layout');
const { busyness } = require('./busy');

if (!app.requestSingleInstanceLock()) app.quit();

let config = null, overlay = null, settings = null, tray = null, overlayReady = false, shown = true;
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
  openOverlay();
  buildTray();
  startFeed();
  ipcMain.on('ready', (e) => { if (overlay && e.sender === overlay.webContents) { overlayReady = true; toOverlay({ kind: 'config', ...config.get() }); } });
  ipcMain.handle('ask', (_e, m) => {
    if (m?.kind === 'config') return { ...config.get(), version: app.getVersion() };
    if (m?.kind === 'set') {
      const next = config.set(m.patch ?? {});
      toOverlay({ kind: 'config', ...next });
      if (process.platform === 'win32' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.openAtLogin });
      return { ...next, version: app.getVersion() };
    }
    return null;
  });
  ipcMain.on('msg', (_e, m) => { if (m?.kind === 'preview' && typeof m.mode !== 'undefined') toOverlay({ kind: 'state', mode: m.mode }); });
});
app.on('second-instance', openSettings);
// He lives in the tray: closing the settings window doesn't quit him.
app.on('window-all-closed', () => {});
