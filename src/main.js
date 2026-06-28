const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { loadAdBlocker } = require('./adblocker');

let win;

// ── File paths ─────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'data');
const BOOKMARKS_FILE   = path.join(DATA_DIR, 'bookmarks.json');
const SETTINGS_FILE    = path.join(DATA_DIR, 'settings.json');
const DOWNLOADS_FILE   = path.join(DATA_DIR, 'downloads.json');
const PERMISSIONS_FILE = path.join(DATA_DIR, 'permissions.json');

// ── Downloads state ─────────────────────────────────────────
let downloads = []; // [{ id, filename, url, savePath, state, receivedBytes, totalBytes, startTime }]

// ── Permissions state ───────────────────────────────────────
// { "<origin>": { camera: "allow"|"block", microphone: "allow"|"block", geolocation: "allow"|"block" } }
let sitePermissions = {};

// Log paths so we can see where files are being saved
console.log('📁 Data directory:', DATA_DIR);
console.log('📄 Bookmarks file:', BOOKMARKS_FILE);

// ── Make sure data folder exists ───────────────────────────
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('✅ Created data directory');
  }
  if (!fs.existsSync(BOOKMARKS_FILE)) {
    fs.writeFileSync(BOOKMARKS_FILE, '[]', 'utf-8');
    console.log('✅ Created bookmarks.json');
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, '{}', 'utf-8');
    console.log('✅ Created settings.json');
  }
  if (!fs.existsSync(DOWNLOADS_FILE)) {
    fs.writeFileSync(DOWNLOADS_FILE, '[]', 'utf-8');
    console.log('✅ Created downloads.json');
  }
  if (!fs.existsSync(PERMISSIONS_FILE)) {
    fs.writeFileSync(PERMISSIONS_FILE, '{}', 'utf-8');
    console.log('✅ Created permissions.json');
  }
}

// ── Read JSON safely ───────────────────────────────────────
function readJSON(filePath, defaultValue) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    console.log('📖 Read from', filePath, ':', parsed);
    return parsed;
  } catch (e) {
    console.error('❌ Failed to read', filePath, e.message);
    return defaultValue;
  }
}

// ── Write JSON safely ──────────────────────────────────────
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('💾 Saved to', filePath, ':', data);
    return true;
  } catch (e) {
    console.error('❌ Failed to write', filePath, e.message);
    return false;
  }
}

// ── Create window ──────────────────────────────────────────
async function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      partition: 'persist:main'
    }
  });

  win.maximize();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  // Webview guest pages get their own WebContents — catch F11 there too
  win.webContents.on('did-attach-webview', (event, contents) => {
    contents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'F11') {
        win.setFullScreen(!win.isFullScreen());
        e.preventDefault();
      }
    });
  });

  const ses = session.fromPartition('persist:main');
  await loadAdBlocker(ses);
  setupDownloadHandler(ses);
  setupPermissionHandler(ses);
}

// ── Permissions: setup + helpers ───────────────────────────
const pendingPermissionRequests = new Map(); // requestId -> resolve callback

function originFromUrl(url) {
  try { return new URL(url).origin; } catch (e) { return url; }
}

// Map Electron's permission name to our simplified per-site keys
function permKeyFor(electronPermission) {
  if (electronPermission === 'media') return ['camera', 'microphone'];
  if (electronPermission === 'geolocation') return ['geolocation'];
  return [electronPermission];
}

function getSiteSetting(origin, key) {
  return sitePermissions[origin] && sitePermissions[origin][key];
}

function setSiteSetting(origin, key, value) {
  if (!sitePermissions[origin]) sitePermissions[origin] = {};
  sitePermissions[origin][key] = value; // "allow" | "block"
  writeJSON(PERMISSIONS_FILE, sitePermissions);
}

function setupPermissionHandler(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    // Requests from the browser's own chrome UI (e.g. the camera-list probe in
    // Settings) are internal, not from a visited site — always allow these.
    if (webContents && win && webContents.id === win.webContents.id) return callback(true);

    const origin = originFromUrl(details.requestingUrl || (webContents ? webContents.getURL() : ''));
    const keys = permKeyFor(permission);

    // If every relevant key has an explicit saved choice, honor it instantly
    const saved = keys.map(k => getSiteSetting(origin, k));
    if (saved.every(s => s === 'allow')) return callback(true);
    if (saved.some(s => s === 'block')) return callback(false);

    // No saved decision yet — ask the renderer to prompt the user
    if (!win || win.isDestroyed()) return callback(false);

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    win.webContents.send('permission:ask', { requestId, origin, permission, keys });

    pendingPermissionRequests.set(requestId, (allow) => {
      keys.forEach(k => setSiteSetting(origin, k, allow ? 'allow' : 'block'));
      callback(!!allow);
    });
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (win && webContents && webContents.id === win.webContents.id) return true;
    const keys = permKeyFor(permission);
    return keys.every(k => getSiteSetting(requestingOrigin, k) === 'allow');
  });
}

// ── Downloads: setup + helpers ─────────────────────────────
function setupDownloadHandler(ses) {
  ses.on('will-download', (event, item, webContents) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = item.getFilename();

    const record = {
      id,
      filename,
      url: item.getURL(),
      savePath: item.getSavePath() || filename,
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startTime: Date.now()
    };
    downloads.unshift(record);
    persistDownloads();
    sendDownloadsUpdate();

    item.on('updated', (event, state) => {
      record.state = state; // 'progressing' | 'interrupted'
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.savePath = item.getSavePath();
      sendDownloadsUpdate();
    });

    item.once('done', (event, state) => {
      record.state = state; // 'completed' | 'cancelled' | 'interrupted'
      record.receivedBytes = item.getReceivedBytes();
      record.savePath = item.getSavePath();
      persistDownloads();
      sendDownloadsUpdate();
    });
  });
}

function persistDownloads() {
  // Only keep finished/known metadata across restarts; cap list size.
  const trimmed = downloads.slice(0, 100);
  writeJSON(DOWNLOADS_FILE, trimmed);
}

function sendDownloadsUpdate() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('downloads:update', downloads);
  }
}

// ── Window controls ────────────────────────────────────────
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close',    () => win.close());
ipcMain.on('toggle-fullscreen', () => win.setFullScreen(!win.isFullScreen()));

// ── Bookmark handlers ──────────────────────────────────────
ipcMain.handle('bookmarks:get', () => {
  console.log('📨 IPC: bookmarks:get called');
  return readJSON(BOOKMARKS_FILE, []);
});

ipcMain.handle('bookmarks:save', (event, bookmarks) => {
  console.log('📨 IPC: bookmarks:save called with', bookmarks);
  return writeJSON(BOOKMARKS_FILE, bookmarks);
});

// ── Settings handlers ──────────────────────────────────────
ipcMain.handle('settings:get', () => {
  console.log('📨 IPC: settings:get called');
  return readJSON(SETTINGS_FILE, {
    homepage: 'https://google.com',
    searchEngine: 'google',
    theme: 'dark',
    showBookmarkBar: true
  });
});

ipcMain.handle('settings:save', (event, settings) => {
  console.log('📨 IPC: settings:save called with', settings);
  return writeJSON(SETTINGS_FILE, settings);
});

// ── Download handlers ──────────────────────────────────────
ipcMain.handle('downloads:get', () => {
  return readJSON(DOWNLOADS_FILE, downloads);
});

ipcMain.handle('downloads:openFile', (event, savePath) => {
  if (savePath && fs.existsSync(savePath)) {
    shell.openPath(savePath);
    return true;
  }
  return false;
});

ipcMain.handle('downloads:showInFolder', (event, savePath) => {
  if (savePath && fs.existsSync(savePath)) {
    shell.showItemInFolder(savePath);
    return true;
  }
  return false;
});

ipcMain.handle('downloads:clear', () => {
  downloads = downloads.filter(d => d.state === 'progressing');
  persistDownloads();
  return downloads;
});

ipcMain.handle('downloads:remove', (event, id) => {
  downloads = downloads.filter(d => d.id !== id);
  persistDownloads();
  return downloads;
});

// ── Permission manager handlers ────────────────────────────
ipcMain.handle('permissions:get', () => {
  return readJSON(PERMISSIONS_FILE, sitePermissions);
});

ipcMain.handle('permissions:set', (event, { origin, key, value }) => {
  setSiteSetting(origin, key, value);
  return sitePermissions;
});

ipcMain.handle('permissions:removeSite', (event, origin) => {
  delete sitePermissions[origin];
  writeJSON(PERMISSIONS_FILE, sitePermissions);
  return sitePermissions;
});

ipcMain.handle('permissions:answer', (event, { requestId, allow }) => {
  const resolve = pendingPermissionRequests.get(requestId);
  if (resolve) {
    resolve(allow);
    pendingPermissionRequests.delete(requestId);
  }
  return true;
});

// ── Camera device listing (for "switch camera") ────────────
ipcMain.handle('permissions:listCameras', async () => {
  try {
    if (!win || win.isDestroyed()) return [];
    return await win.webContents.executeJavaScript(`
      (async () => {
        try {
          // Device labels are blank until a permission has been granted at least once;
          // request and immediately release a throwaway stream so labels populate.
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
          tempStream.getTracks().forEach(t => t.stop());
        } catch (e) { /* user may have no camera or denied access — list will show generic labels */ }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'videoinput')
                      .map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
      })()
    `);
  } catch (e) {
    console.error('Failed to list cameras:', e.message);
    return [];
  }
});

ipcMain.handle('permissions:getDefaultCamera', () => {
  const settings = readJSON(SETTINGS_FILE, {});
  return settings.defaultCameraId || null;
});

ipcMain.handle('permissions:setDefaultCamera', (event, deviceId) => {
  const settings = readJSON(SETTINGS_FILE, {});
  settings.defaultCameraId = deviceId;
  return writeJSON(SETTINGS_FILE, settings);
});

// ── App start ──────────────────────────────────────────────
app.whenReady().then(() => {
  ensureDataDir();
  downloads = readJSON(DOWNLOADS_FILE, []);
  sitePermissions = readJSON(PERMISSIONS_FILE, {});
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();
  win.webContents.openDevTools()   // dev
});


autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});

app.on('window-all-closed', () => app.quit());