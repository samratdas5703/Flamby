<div align="center">

<img src="Flamby.png" alt="Flamby" width="96" />

# Flamby

**A fast, privacy-focused desktop browser built with Electron.**

</div>

---

## About

Flamby is a custom Chromium-based browser built on Electron, focused on speed, privacy, and a UI that's entirely yours. It ships with a built-in ad blocker, vertical/split tab layouts, a fully themeable interface (including a real see-through **Glass** theme), and all the everyday browser essentials — bookmarks, downloads, shortcuts, and per-site permissions — without any of the bloat.

## ✨ Features

- **Ad Blocker** — built-in cosmetic + network filtering (Ghostery adblocker engine), with an in-app YouTube ad skipper
- **Vertical & Horizontal Tabs** — switch layouts, collapse the tab rail when you want more room
- **Split View** — browse two pages side by side in one tab
- **Picture-in-Picture (PiP)** — pop video out into a floating window
- **Full Screen Mode** — distraction-free browsing
- **Docked DevTools** — inspect and debug pages without leaving the window
- **Bookmarks & Shortcuts** — a bookmark bar plus a customizable New Tab page with quick-access shortcuts
- **Download Manager** — track, open, and manage downloads from a dedicated panel
- **Private Tabs** — browse without saving history or cookies for that tab
- **Site Permissions** — per-origin control over camera, microphone, and location access
- **Themes** — 11 built-in color themes, a fully custom color picker, and a **Glass** theme with a real transparent, blurred window (Windows/macOS)
- **Custom Window Controls** — pick how minimize/maximize/close look in your title bar
- **Guided Onboarding** — a short first-run setup to pick your search engine, theme, and features
- **Auto-Update** — checks for new releases and updates in place via GitHub Releases

## 📦 Installation

### Download a release
Grab the latest installer for your platform from the [Releases](https://github.com/samratdas5703/Flamby/releases) page:
- **Windows** — `.exe` (NSIS installer)
- **Linux** — `.deb` or `.rpm`

### Build from source
```bash
git clone https://github.com/samratdas5703/Flamby.git
cd Flamby
npm install
npm start
```

## 🛠️ Building installers

Flamby uses [electron-builder](https://www.electron.build/) to package installers.

```bash
npm run build
```

Output installers are placed in the `dist/` folder. Build targets are configured per-platform in `package.json`:

| Platform | Target(s) |
|---|---|
| Windows | NSIS installer (`.exe`) |
| Linux | `.deb`, `.rpm` (x64) |

## 🗂️ Project Structure

```
Flamby/
├─ src/
│  ├─ main.js               # Electron main process (windows, IPC, updater, downloads)
│  ├─ preload.js             # Secure bridge between main and renderer
│  ├─ webview-preload.js     # Preload injected into every browsed page
│  ├─ adblocker.js           # Ad-blocking engine setup
│  ├─ youtube-adblock.js     # In-page YouTube ad skipper
│  ├─ data/                  # Default/example data files (bookmarks, settings, etc.)
│  └─ renderer/
│     ├─ index.html          # Main browser UI (tabs, toolbar, settings, downloads)
│     ├─ newtab.html         # New Tab page with shortcuts
│     ├─ css/main.css        # Core styling
│     └─ js/                 # Renderer-side scripts
├─ package.json
└─ README.md
```

> **Note:** User data (bookmarks, settings, downloads history, permissions) is stored in Electron's per-user `userData` directory, **not** inside the app's install folder — this keeps your data safe across updates.

## 🔒 Privacy

Flamby doesn't collect or transmit any browsing data. Bookmarks, history, settings, and permissions are stored locally on your machine. The built-in ad blocker runs entirely on-device.

## 🤝 Contributing

Issues and pull requests are welcome. If you run into a bug, please include your OS, Flamby version, and steps to reproduce.

## 📄 License

This project's license has not been specified yet.

---

<div align="center">
Made with <3 by <a href="https://github.com/samratdas5703">samratdas5703 & shantocode</a>
</div>
