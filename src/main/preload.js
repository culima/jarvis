// The only doors between a page and the main process.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bridge', {
  onMessage: (fn) => ipcRenderer.on('msg', (_e, m) => fn(m)),
  ready: () => ipcRenderer.send('ready'),
  send: (m) => ipcRenderer.send('msg', m),
  ask: (m) => ipcRenderer.invoke('ask', m),
});
