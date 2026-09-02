/**
 * Background service worker.
 * - Sets a welcome flag on install and opens the dashboard once so new users see it.
 * - Keeps the toolbar badge in sync with the number of saved palette colors.
 */
const PALETTE_KEY = "fpm_palette";

function refreshBadge() {
  chrome.storage.sync.get([PALETTE_KEY], (res) => {
    const count = Array.isArray(res[PALETTE_KEY]) ? res[PALETTE_KEY].length : 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#12a17d" });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  refreshBadge();
  if (details.reason === "install") {
    chrome.storage.local.set({ fpm_first_run: true });
    chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html?welcome=1") });
  }
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[PALETTE_KEY]) {
    refreshBadge();
  }
});

// Content scripts can't call chrome.runtime.openOptionsPage() directly, so they ask us to.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "open-dashboard") {
    chrome.runtime.openOptionsPage();
  }
});
