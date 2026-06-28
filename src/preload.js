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

  // ── Downloads ──────────────────────────────────────────
  getDownloads:     ()         => ipcRenderer.invoke('downloads:get'),
  openDownload:     (savePath) => ipcRenderer.invoke('downloads:openFile', savePath),
  showInFolder:     (savePath) => ipcRenderer.invoke('downloads:showInFolder', savePath),
  clearDownloads:   ()         => ipcRenderer.invoke('downloads:clear'),
  removeDownload:   (id)       => ipcRenderer.invoke('downloads:remove', id),
  onDownloadsUpdate: (callback) => {
    ipcRenderer.on('downloads:update', (event, downloads) => callback(downloads));
  },

});