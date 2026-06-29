// Injected only into youtube.com pages (see main.js did-attach-webview / dom-ready hook).
// YouTube serves ads through the same googlevideo.com CDN as real video, so
// network-level blocking can't tell them apart without breaking playback.
// Instead, this watches the page's own ad-state markers and skips past ads
// automatically — the same technique browser extensions use for YouTube.

(function () {
  const SKIP_INTERVAL_MS = 300;

  function tick() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;

    const isAd = player.classList.contains('ad-showing') ||
                 player.classList.contains('ad-interrupting');

    if (isAd) {
      // Click "Skip Ad" the moment it's available
      const skipBtn = document.querySelector(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button'
      );
      if (skipBtn) {
        skipBtn.click();
        return;
      }

      // No skip button yet (pre-skippable window) — fast-forward the ad
      // video element itself to its end so it finishes immediately.
      const video = player.querySelector('video');
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.muted = true;
        video.currentTime = video.duration;
      }

      // Also dismiss banner/overlay ad units that aren't tied to video playback
      document.querySelectorAll('.ytp-ad-overlay-close-button').forEach(btn => btn.click());
    }
  }

  setInterval(tick, SKIP_INTERVAL_MS);
})();