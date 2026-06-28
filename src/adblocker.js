const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

let blocker;

async function loadAdBlocker(session) {
    if (!blocker) {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    }

    blocker.enableBlockingInSession(session);

    console.log("✅ Ghostery AdBlock Enabled");
}

module.exports = { loadAdBlocker };