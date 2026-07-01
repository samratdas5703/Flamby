const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { loadAdBlocker, setAdBlockerEnabled } = require('./adblocker');

let win;
let splashWindow;

// ── Known-harmless rejection suppression ───────────────────
// The ad-blocker library (@ghostery/adblocker-electron) occasionally
// re-injects its cosmetic-filter script into a page that's still mid
// single-page-app navigation (e.g. YouTube), which throws a benign
// "Identifier has already been declared" / "Script failed to execute"
// rejection from inside the library's own executeJavaScript call. The
// page itself keeps working fine — this only silences that specific
// known noise so it doesn't flood the terminal; anything else still
// surfaces normally.
process.on('unhandledRejection', (reason) => {
  const message = (reason && reason.message) || String(reason || '');
  if (message.includes('Script failed to execute')) {
    return; // swallow only this known, harmless pattern
  }
  console.error('Unhandled promise rejection:', reason);
});

// ── Auto-update configuration ──────────────────────────────
// We want full control over the UX, so don't auto-download or
// auto-install — just check, tell the renderer, and wait for the
// user to click "Update" in our own in-app popup.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// ── File paths ─────────────────────────────────────────────
// IMPORTANT: this must live in Electron's per-user "userData" directory
// (e.g. %APPDATA%\Flamby on Windows, ~/.config/Flamby on Linux), NOT
// inside the app's own install folder (__dirname). The install folder
// gets overwritten by every auto-update, which used to wipe bookmarks,
// settings, downloads, permissions, and login sessions along with it.
const DATA_DIR        = path.join(app.getPath('userData'), 'data');
const BOOKMARKS_FILE   = path.join(DATA_DIR, 'bookmarks.json');
const SETTINGS_FILE    = path.join(DATA_DIR, 'settings.json');
const DOWNLOADS_FILE   = path.join(DATA_DIR, 'downloads.json');
const PERMISSIONS_FILE = path.join(DATA_DIR, 'permissions.json');
const ONBOARDING_FILE  = path.join(DATA_DIR, 'onboarding.json');

// One-time migration: older versions stored data next to the app itself
// (inside __dirname), which got destroyed on every update. If that old
// location still has data and the new location doesn't yet, copy it
// over so people don't lose everything on the update that ships this fix.
const OLD_DATA_DIR = path.join(__dirname, 'data');
function migrateOldDataIfNeeded() {
  try {
    if (!fs.existsSync(OLD_DATA_DIR) || OLD_DATA_DIR === DATA_DIR) return;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const name of ['bookmarks.json', 'settings.json', 'downloads.json', 'permissions.json', 'onboarding.json']) {
      const oldFile = path.join(OLD_DATA_DIR, name);
      const newFile = path.join(DATA_DIR, name);
      if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
        fs.copyFileSync(oldFile, newFile);
        console.log('🔁 Migrated', name, 'to userData directory');
      }
    }
  } catch (e) {
    console.error('❌ Data migration failed:', e.message);
  }
}
migrateOldDataIfNeeded();

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
  // The "glass" theme needs the OS compositor to actually see through the
  // window, which Electron only supports by setting `transparent` (and
  // vibrancy/backgroundMaterial) at BrowserWindow construction time — it
  // can't be toggled on a live window. So we check the saved theme up
  // front and build the window accordingly; switching the setting later
  // takes effect after a restart (the renderer prompts for that).
  const glassSettings = readJSON(SETTINGS_FILE, {});
  const wantsGlass = glassSettings.theme === 'glass';

  const winOptions = {
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: wantsGlass,
    backgroundColor: wantsGlass ? '#00000000' : '#0f0f1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      partition: 'persist:main'
    }
  };

  if (wantsGlass) {
    if (process.platform === 'darwin') {
      winOptions.vibrancy = 'under-window';
      winOptions.visualEffectState = 'active';
    } else if (process.platform === 'win32') {
      // Windows 11 acrylic material; harmlessly ignored on older Windows.
      winOptions.backgroundMaterial = 'acrylic';
    }
  }

  win = new BrowserWindow(winOptions);

  win.maximize();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Every <webview> guest page (browsed sites + our own newtab.html) needs
  // webview-preload.js attached so it can talk back to the host (camera
  // preference lookup, and bridging the "Add Shortcut" popup). Without this,
  // the preload file just sits there unused and ipcRenderer.sendToHost is
  // unavailable inside the guest, so nothing it tries to send ever arrives.
  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.contextIsolation = false;
  });

  // Once the main window is ready, wait for splash animation then switch
  win.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      win.show();
    }, 3000); // 3 seconds — matches the splash animation
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // F11 – toggle fullscreen
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }

    // F12 – toggle DevTools for the active webview via the renderer,
    // or fall back to the host window's own DevTools.
    if (input.key === 'F12') {
      win.webContents.send('devtools:toggle');
      event.preventDefault();
    }
  });

  // Tell the renderer when fullscreen state changes so it can hide/show
  // the titlebar and update any fullscreen-indicator UI.
  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) win.webContents.send('fullscreen:change', true);
  });
  win.on('leave-full-screen', () => {
    if (!win.isDestroyed()) win.webContents.send('fullscreen:change', false);
  });

  // Webview guest pages get their own WebContents — catch F11 there too,
  // and raise their listener cap since the adblocker library attaches one
  // tracking-detection listener per guest webContents (expected, not a leak).
  win.webContents.on('did-attach-webview', (event, contents) => {
    contents.setMaxListeners(0);
    contents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11') {
        win.setFullScreen(!win.isFullScreen());
        e.preventDefault();
      }
      if (input.key === 'F12') {
        // Route through the renderer so the docked pane logic handles it
        win.webContents.send('devtools:toggle');
        e.preventDefault();
      }
      // Alt+P — Picture in Picture
      if ((input.key === 'p' || input.key === 'P') && input.alt) {
        win.webContents.send('pip:toggle');
        e.preventDefault();
      }
    });
  });

  // YouTube ad-skipping: network-level blocking can't tell YouTube ads
  // apart from real video (both stream from googlevideo.com), so instead
  // we inject a small script into YouTube pages specifically that watches
  // the player's own ad-state markers and auto-skips/fast-forwards them.
  win.webContents.on('did-attach-webview', (event, contents) => {
    contents.on('dom-ready', () => {
      const url = contents.getURL();
      if (/^https?:\/\/(www\.)?youtube\.com\//.test(url)) {
        const script = fs.readFileSync(path.join(__dirname, 'youtube-adblock.js'), 'utf-8');
        contents.executeJavaScript(script).catch(() => {});
      }
    });
  });

  const ses = session.fromPartition('persist:main');
  await loadAdBlocker(ses);

  // Respect whatever the user last chose for the Ads toggle (defaults to on).
  const savedSettings = readJSON(SETTINGS_FILE, {});
  if (savedSettings.adblockEnabled === false) {
    setAdBlockerEnabled(false);
  }

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
ipcMain.handle('app:relaunch', () => {
  app.relaunch();
  app.exit(0);
});

// ── Docked DevTools (F12) ──────────────────────────────────
// Opens the DevTools for a specific webContents (identified by its ID)
// as a detached window, then immediately repositions and resizes it so
// it sits flush at the bottom half of the main browser window —
// giving the appearance of a docked panel without needing BrowserView.
let devToolsWindow = null;

ipcMain.on('devtools:open', (event, webContentsId) => {
  try {
    const { webContents } = require('electron');
    const targetContents = webContents.fromId(webContentsId);
    if (!targetContents || targetContents.isDestroyed()) return;

    if (devToolsWindow && !devToolsWindow.isDestroyed()) {
      devToolsWindow.close();
      devToolsWindow = null;
    }

    // Capture the list of windows before opening so we can find the new one
    const { BrowserWindow: BW } = require('electron');
    const before = new Set(BW.getAllWindows().map(w => w.id));

    targetContents.openDevTools({ mode: 'detach' });

    // After a short delay the DevTools window will exist — grab it,
    // resize + reposition it to look like a docked bottom panel.
    setTimeout(() => {
      const newWins = BW.getAllWindows().filter(w => !before.has(w.id));
      if (newWins.length === 0) return;
      devToolsWindow = newWins[0];

      const mb = win.getBounds();
      const paneH = Math.floor(mb.height * 0.45);
      devToolsWindow.setBounds({
        x: mb.x,
        y: mb.y + mb.height - paneH,
        width: mb.width,
        height: paneH
      });
      devToolsWindow.setAlwaysOnTop(false);

      // Keep it in sync if the main window moves/resizes
      const reposition = () => {
        if (!devToolsWindow || devToolsWindow.isDestroyed()) return;
        const b = win.getBounds();
        const h = devToolsWindow.getSize()[1];
        devToolsWindow.setBounds({ x: b.x, y: b.y + b.height - h, width: b.width, height: h });
      };
      win.on('move', reposition);
      win.on('resize', reposition);

      devToolsWindow.on('closed', () => {
        devToolsWindow = null;
        win.removeListener('move', reposition);
        win.removeListener('resize', reposition);
        // Tell renderer to reset its open state
        if (!win.isDestroyed()) win.webContents.send('devtools:closed');
      });
    }, 400);
  } catch (err) {
    console.error('DevTools open error:', err.message);
  }
});

ipcMain.on('devtools:close', () => {
  if (devToolsWindow && !devToolsWindow.isDestroyed()) {
    devToolsWindow.close();
    devToolsWindow = null;
  }
});

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
    showBookmarkBar: true,
    adblockEnabled: true,
    privateModeEnabled: false,
    windowControlStyle: 'dots'
  });
});

ipcMain.handle('settings:save', (event, settings) => {
  console.log('📨 IPC: settings:save called with', settings);
  return writeJSON(SETTINGS_FILE, settings);
});

// ── Onboarding (first-launch intro) ─────────────────────────
// A dedicated marker file (separate from settings.json) tracks whether
// the person has already been through the intro, so it survives even
// if settings.json gets wiped/reset by something else.
ipcMain.handle('onboarding:shouldShow', () => {
  const state = readJSON(ONBOARDING_FILE, { completed: false });
  return !state.completed;
});

ipcMain.handle('onboarding:complete', () => {
  return writeJSON(ONBOARDING_FILE, { completed: true, completedAt: Date.now() });
});

// ── Ad blocker toggle ────────────────────────────────────────
ipcMain.handle('adblock:setEnabled', (event, enabled) => {
  setAdBlockerEnabled(!!enabled);
  return true;
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
  autoUpdater.checkForUpdates();
});

// ── Auto-update: forward events to the renderer ────────────
function sendUpdateEvent(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

autoUpdater.on('update-available', (info) => {
  sendUpdateEvent('update:available', {
    version: info.version,
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    releaseDate: info.releaseDate
  });
});

autoUpdater.on('download-progress', (progress) => {
  sendUpdateEvent('update:progress', {
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond
  });
});

autoUpdater.on('update-downloaded', () => {
  sendUpdateEvent('update:downloaded', {});
});

autoUpdater.on('error', (err) => {
  console.error('Auto-update error:', err.message);
  sendUpdateEvent('update:error', { message: err.message });
});

// ── Auto-update: renderer-triggered actions ────────────────
ipcMain.handle('update:download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('update:checkNow', () => {
  autoUpdater.checkForUpdates();
});

app.on('window-all-closed', () => app.quit());