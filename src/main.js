const { app, BrowserWindow, session, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { loadAdBlocker } = require('./adblocker');

let win;

// ── File paths ─────────────────────────────────────────────
const DATA_DIR       = path.join(__dirname, 'data');
const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');
const SETTINGS_FILE  = path.join(DATA_DIR, 'settings.json');

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
  await loadAdBlocker(session.fromPartition('persist:main'));
}

// ── Window controls ────────────────────────────────────────
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close',    () => win.close());

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

// ── App start ──────────────────────────────────────────────
app.whenReady().then(() => {
  ensureDataDir();
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});

app.on('window-all-closed', () => app.quit());