// Runs inside each <webview> guest page.
// Patches getUserMedia so video requests use the user's chosen default camera
// (set in Settings → Permissions → Default camera) instead of whatever the
// OS picks first. The choice lives in the host app's settings (main process),
// not this guest page's own localStorage, so we ask main for it each time.
//
// Wrapped entirely in try/catch: depending on Electron version/sandbox
// settings, require('electron') inside a <webview> preload can be blocked.
// If that happens here, we just skip the camera-preference patch rather
// than throwing and spamming "Script failed to execute" on every tab.

try {
  const { ipcRenderer } = require('electron');

  // Bridge used by index.html's injected "addShortcut" override (see
  // createWebview in renderer/index.html) so a guest page — most often our
  // own newtab.html — can ask the host to open the styled Add Shortcut
  // popup. contextIsolation is off for webviews (see will-attach-webview in
  // main.js), so this plain assignment is visible to the guest page itself.
  window.__flambySendToHost = (channel, ...args) => {
    try {
      ipcRenderer.sendToHost(channel, ...args);
    } catch (e) {
      // Guest page running somewhere ipcRenderer isn't reachable — ignore.
    }
  };

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      try {
        const savedCameraId = await ipcRenderer.invoke('permissions:getDefaultCamera');
        if (savedCameraId && constraints && constraints.video) {
          const videoConstraint = typeof constraints.video === 'object' ? constraints.video : {};
          constraints = {
            ...constraints,
            video: {
              ...videoConstraint,
              deviceId: { exact: savedCameraId }
            }
          };
        }
      } catch (e) {
        // If main isn't reachable for some reason, fall through to default behavior
      }
      return originalGetUserMedia(constraints);
    };
  }
} catch (e) {
  // require('electron') was blocked in this guest page's sandbox — that's fine,
  // the browser still works normally, it just won't auto-pick the saved camera.
}