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

  // ── Onboarding (first-launch intro) ─────────────────────
  shouldShowOnboarding: () => ipcRenderer.invoke('onboarding:shouldShow'),
  completeOnboarding:   () => ipcRenderer.invoke('onboarding:complete'),

  // ── Ad blocker ─────────────────────────────────────────
  setAdblockEnabled: (enabled) => ipcRenderer.invoke('adblock:setEnabled', enabled),

  // ── Downloads ──────────────────────────────────────────
  getDownloads:     ()         => ipcRenderer.invoke('downloads:get'),
  openDownload:     (savePath) => ipcRenderer.invoke('downloads:openFile', savePath),
  showInFolder:     (savePath) => ipcRenderer.invoke('downloads:showInFolder', savePath),
  clearDownloads:   ()         => ipcRenderer.invoke('downloads:clear'),
  removeDownload:   (id)       => ipcRenderer.invoke('downloads:remove', id),
  onDownloadsUpdate: (callback) => {
    ipcRenderer.on('downloads:update', (event, downloads) => callback(downloads));
  },

  // ── DevTools & Fullscreen ──────────────────────────────────
  openDockedDevTools: (webContentsId) => ipcRenderer.send('devtools:open', webContentsId),
  closeDockedDevTools: () => ipcRenderer.send('devtools:close'),
  onDevToolsToggle: (callback) => {
    ipcRenderer.on('devtools:toggle', () => callback());
  },
  onDevToolsClosed: (callback) => {
    ipcRenderer.on('devtools:closed', () => callback());
  },
  onFullscreenChange: (callback) => {
    ipcRenderer.on('fullscreen:change', (event, isFullscreen) => callback(isFullscreen));
  },

  // ── Picture in Picture ─────────────────────────────────────
  onPiPToggle: (callback) => {
    ipcRenderer.on('pip:toggle', () => callback());
  },

  // ── Auto-update ──────────────────────────────────────────
  downloadUpdate:  () => ipcRenderer.invoke('update:download'),
  installUpdate:   () => ipcRenderer.invoke('update:install'),
  checkForUpdates: () => ipcRenderer.invoke('update:checkNow'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update:available', (event, info) => callback(info));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update:progress', (event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update:downloaded', (event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update:error', (event, err) => callback(err));
  },

});