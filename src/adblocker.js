const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

let blocker;
let blockedSession;

async function loadAdBlocker(session) {
    if (!blocker) {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    }

    blockedSession = session;
    blocker.enableBlockingInSession(session);

    console.log("✅ Ghostery AdBlock Enabled");
}

// Toggle blocking on/off in the already-loaded session without having to
// re-download the filter lists. Used by the Ads badge / Privacy settings.
function setAdBlockerEnabled(enabled) {
    if (!blocker || !blockedSession) return;
    if (enabled) {
        blocker.enableBlockingInSession(blockedSession);
        console.log("✅ Ghostery AdBlock Enabled");
    } else {
        blocker.disableBlockingInSession(blockedSession);
        console.log("⛔ Ghostery AdBlock Disabled");
    }
}

module.exports = { loadAdBlocker, setAdBlockerEnabled };