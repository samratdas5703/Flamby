// ── Bookmarks Module ───────────────────────────────────────
// Handles loading, saving, and rendering bookmarks

let bookmarks = [];

// ── Load bookmarks from disk ───────────────────────────────
async function loadBookmarks() {
  try {
    bookmarks = await window.electronAPI.getBookmarks();
    if (!Array.isArray(bookmarks)) bookmarks = [];
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
    bookmarks = [];
  }
}

// ── Save bookmarks to disk ─────────────────────────────────
async function saveBookmarks() {
  try {
    await window.electronAPI.saveBookmarks(bookmarks);
  } catch (e) {
    console.error('Failed to save bookmarks:', e);
  }
}

// ── Add a bookmark ─────────────────────────────────────────
async function addBookmark(url, name) {
  if (!url || url === 'about:blank') return;
  const exists = bookmarks.find(b => b.url === url);
  if (exists) return;
  bookmarks.push({
    name: name || url,
    url: url,
    dateAdded: new Date().toISOString()
  });
  await saveBookmarks();
  renderBookmarkBar();
  renderBookmarkList();
}

// ── Remove a bookmark ──────────────────────────────────────
async function removeBookmark(index) {
  bookmarks.splice(index, 1);
  await saveBookmarks();
  renderBookmarkBar();
  renderBookmarkList();
}

// ── Check if URL is bookmarked ─────────────────────────────
function isBookmarked(url) {
  return bookmarks.some(b => b.url === url);
}

// ── Update star button ─────────────────────────────────────
function updateBookmarkStar(url) {
  const btn = document.getElementById('bookmarkBtn');
  if (!btn) return;
  const bookmarked = isBookmarked(url);
  btn.textContent = bookmarked ? '★' : '☆';
  btn.style.color = bookmarked ? '#f5a623' : 'rgba(255,255,255,0.5)';
  btn.title = bookmarked ? 'Remove bookmark' : 'Add bookmark';
}

// ── Get domain from URL ────────────────────────────────────
function getDomain(url) {
  try { return new URL(url).hostname; }
  catch (e) { return ''; }
}

// ── Escape HTML to prevent XSS ────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Render bookmark bar ────────────────────────────────────
function renderBookmarkBar() {
  const bar = document.getElementById('bookmarkBar');
  if (!bar) return;

  if (bookmarks.length === 0) {
    bar.innerHTML = `
      <span style="color:rgba(255,255,255,0.2);font-size:12px;padding:0 8px">
        No bookmarks yet — click ☆ to add one
      </span>`;
    return;
  }

  bar.innerHTML = bookmarks.map((b, i) => `
    <span class="bookmark-item" onclick="loadUrl('${escapeHtml(b.url)}')">
      <img
        src="https://www.google.com/s2/favicons?domain=${getDomain(b.url)}&sz=16"
        width="14" height="14"
        style="border-radius:2px;flex-shrink:0"
        onerror="this.style.display='none'"
      />
      <span class="bookmark-label">${escapeHtml(b.name)}</span>
      <button
        class="bm-remove"
        onclick="event.stopPropagation();removeBookmark(${i})"
        title="Remove">✕</button>
    </span>
  `).join('');
}

// ── Render bookmark list in settings ──────────────────────
function renderBookmarkList() {
  const el = document.getElementById('bookmarkList');
  if (!el) return;

  if (bookmarks.length === 0) {
    el.innerHTML = `
      <p style="color:rgba(255,255,255,0.4);font-size:13px">
        No bookmarks yet
      </p>`;
    return;
  }

  el.innerHTML = bookmarks.map((b, i) => `
    <div class="bm-list-item">
      <img
        src="https://www.google.com/s2/favicons?domain=${getDomain(b.url)}&sz=16"
        width="14" height="14"
        style="border-radius:2px;flex-shrink:0"
        onerror="this.style.display='none'"
      />
      <span onclick="loadUrl('${escapeHtml(b.url)}');toggleSettings()">
        ${escapeHtml(b.name)}
      </span>
      <button onclick="removeBookmark(${i})">✕</button>
    </div>
  `).join('');
}
