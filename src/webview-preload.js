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