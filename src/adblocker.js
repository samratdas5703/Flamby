const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

let blocker;
let blockedSession;

// googlevideo.com serves YouTube's actual video/audio segments (both for
// real content AND for stitched-in ads), under hostnames like
// rr5---sn-xxxxx.googlevideo.com. The generic EasyList/EasyPrivacy rules
// sometimes match these and strip/alter the request, which is what causes
// real playback to 403. We let every googlevideo.com request through at the
// network layer untouched — YouTube ads get handled separately via a
// page-level skip script instead of network blocking (see youtube-adblock.js).
function isYouTubeVideoSegment(url) {
  return /^https?:\/\/([^/]*\.)?googlevideo\.com\//i.test(url);
}

async function loadAdBlocker(session) {
    if (!blocker) {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    }

    blockedSession = session;
    blocker.enableBlockingInSession(session);

    // Re-allow googlevideo.com segment requests that the blocklists would
    // otherwise interfere with — this listener is scoped only to that one
    // domain, so it doesn't affect blocking anywhere else.
    session.webRequest.onBeforeRequest(
        { urls: ["*://*.googlevideo.com/*"] },
        (details, callback) => callback({ cancel: false })
    );

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