const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Window controls ────────────────────────────────────
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close:    () => ipcRenderer.send('close'),

  // ── Bookmarks ──────────────────────────────────────────
  getBookmarks:  ()            => ipcRenderer.invoke('bookmarks:get'),
  saveBookmarks: (bookmarks)   => ipcRenderer.invoke('bookmarks:save', bookmarks),

  // ── Settings ───────────────────────────────────────────
  getSettings:  ()       => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

});
