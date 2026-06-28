// Runs inside each <webview> guest page.
// Patches getUserMedia so video requests use the user's chosen default camera
// (set in Settings → Permissions → Default camera) instead of whatever the
// OS picks first. The choice lives in the host app's settings (main process),
// not this guest page's own localStorage, so we ask main for it each time.

const { ipcRenderer } = require('electron');

(function () {
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
})();