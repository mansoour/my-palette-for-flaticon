/**
 * Shared storage layer for "My Palette for Flaticon".
 *
 * Loaded as a plain (non-module) script from:
 *   - the content script (injected into flaticon.com pages)
 *   - the popup
 *   - the dashboard (options page)
 *
 * Data model:
 *   palette:  [{ id, hex, name, createdAt }]       -> chrome.storage.sync (small, syncs across devices)
 *   history:  [{ id, hex, source, pageUrl, pageTitle, iconId, timestamp }] -> chrome.storage.local (larger, capped)
 *   settings: { showFloatingPanel }                -> chrome.storage.sync (small, syncs across devices)
 *
 * `source` values used across the extension:
 *   "dashboard"        - added manually from the dashboard/popup
 *   "flaticon-picker"  - detected from Flaticon's own color picker / history panel
 *   "applied-to-icon"  - the user clicked one of their saved colors to apply it on an icon page
 */
const FlaticonPaletteStorage = (function () {
  const PALETTE_KEY = "fpm_palette";
  const HISTORY_KEY = "fpm_history";
  const SETTINGS_KEY = "fpm_settings";
  const MAX_HISTORY = 200;
  const MAX_PALETTE = 500;
  const DEFAULT_SETTINGS = {
    showFloatingPanel: true, // the floating palette button + panel injected on flaticon.com
  };

  function uid() {
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Accepts #fff, fff, #ffffff, ffffff, rgb(...) / rgba(...) and returns "#rrggbb" or null. */
  function normalizeHex(input) {
    if (!input) return null;
    let h = String(input).trim().toLowerCase();

    const rgbMatch = h.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/);
    if (rgbMatch) {
      const [r, g, b] = rgbMatch.slice(1, 4).map((n) => Math.max(0, Math.min(255, parseInt(n, 10))));
      h = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    }

    if (!h.startsWith("#")) h = "#" + h;
    if (/^#([0-9a-f]{3})$/.test(h)) {
      h = "#" + h.slice(1).split("").map((c) => c + c).join("");
    }
    if (!/^#([0-9a-f]{6})$/.test(h)) return null;
    return h;
  }

  function getPalette() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([PALETTE_KEY], (res) => resolve(res[PALETTE_KEY] || []));
    });
  }

  function savePalette(list) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [PALETTE_KEY]: list.slice(0, MAX_PALETTE) }, resolve);
    });
  }

  async function addColor(hex, name, source) {
    const clean = normalizeHex(hex);
    if (!clean) throw new Error("Invalid hex color: " + hex);
    const list = await getPalette();
    const existing = list.find((c) => c.hex === clean);
    if (existing) return { list, entry: existing, isNew: false };
    const entry = { id: uid(), hex: clean, name: name || "", createdAt: Date.now() };
    const next = [entry, ...list];
    await savePalette(next);
    if (source !== "silent") {
      await addHistoryEntry({ hex: clean, source: source || "dashboard" });
    }
    return { list: next, entry, isNew: true };
  }

  async function updateColor(id, patch) {
    const list = await getPalette();
    const next = list.map((c) => (c.id === id ? { ...c, ...patch } : c));
    await savePalette(next);
    return next;
  }

  async function removeColor(id) {
    const list = await getPalette();
    const next = list.filter((c) => c.id !== id);
    await savePalette(next);
    return next;
  }

  async function reorderPalette(orderedIds) {
    const list = await getPalette();
    const map = new Map(list.map((c) => [c.id, c]));
    const next = orderedIds.map((id) => map.get(id)).filter(Boolean);
    // Keep any colors that were missing from orderedIds (defensive) at the end.
    list.forEach((c) => {
      if (!next.includes(c)) next.push(c);
    });
    await savePalette(next);
    return next;
  }

  function getHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get([HISTORY_KEY], (res) => resolve(res[HISTORY_KEY] || []));
    });
  }

  function saveHistory(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, MAX_HISTORY) }, resolve);
    });
  }

  async function addHistoryEntry({ hex, source, pageUrl, pageTitle, iconId }) {
    const clean = normalizeHex(hex);
    if (!clean) return null;
    const list = await getHistory();
    // Debounce rapid duplicate fires (e.g. a picker firing "input" on every drag frame).
    if (list.length && list[0].hex === clean && Date.now() - list[0].timestamp < 1200) {
      return list;
    }
    const entry = {
      id: uid(),
      hex: clean,
      source: source || "unknown",
      pageUrl: pageUrl || "",
      pageTitle: pageTitle || "",
      iconId: iconId || "",
      timestamp: Date.now(),
    };
    const next = [entry, ...list].slice(0, MAX_HISTORY);
    await saveHistory(next);
    return next;
  }

  async function removeHistoryEntry(id) {
    const list = await getHistory();
    const next = list.filter((h) => h.id !== id);
    await saveHistory(next);
    return next;
  }

  async function clearHistory() {
    await saveHistory([]);
    return [];
  }

  async function exportAll() {
    const [palette, history] = await Promise.all([getPalette(), getHistory()]);
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      extension: "my-palette-for-flaticon",
      palette,
      history,
    };
  }

  async function importAll(data, { merge = true } = {}) {
    if (!data || typeof data !== "object") throw new Error("Invalid import file");
    const incomingPalette = Array.isArray(data.palette) ? data.palette : [];
    const incomingHistory = Array.isArray(data.history) ? data.history : [];

    if (merge) {
      const existing = await getPalette();
      const seen = new Set(existing.map((c) => c.hex));
      const merged = existing.slice();
      incomingPalette.forEach((c) => {
        const hex = normalizeHex(c.hex);
        if (hex && !seen.has(hex)) {
          seen.add(hex);
          merged.push({ id: uid(), hex, name: c.name || "", createdAt: c.createdAt || Date.now() });
        }
      });
      await savePalette(merged);

      const existingHistory = await getHistory();
      const combined = [...incomingHistory.map((h) => ({ ...h, id: uid() })), ...existingHistory].slice(
        0,
        MAX_HISTORY
      );
      await saveHistory(combined);
    } else {
      await savePalette(
        incomingPalette.map((c) => ({
          id: uid(),
          hex: normalizeHex(c.hex),
          name: c.name || "",
          createdAt: c.createdAt || Date.now(),
        }))
      );
      await saveHistory(incomingHistory.map((h) => ({ ...h, id: uid() })).slice(0, MAX_HISTORY));
    }
    return exportAll();
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([SETTINGS_KEY], (res) => resolve({ ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) }));
    });
  }

  async function updateSettings(patch) {
    const current = await getSettings();
    const next = { ...current, ...patch };
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [SETTINGS_KEY]: next }, () => resolve(next));
    });
  }

  return {
    normalizeHex,
    getPalette,
    addColor,
    updateColor,
    removeColor,
    reorderPalette,
    getHistory,
    addHistoryEntry,
    removeHistoryEntry,
    clearHistory,
    exportAll,
    importAll,
    getSettings,
    updateSettings,
  };
})();

// A top-level `const` doesn't attach to `window` the way `var`/function declarations do —
// it's only a global *binding*, accessible as a bare identifier to other classic scripts
// sharing the same top-level scope (which is how popup.js/dashboard.js use it). content.js
// also loaded that way, but it's cheap insurance to expose it as an ordinary window property
// as well, so `FlaticonPaletteStorage` and `window.FlaticonPaletteStorage` are equivalent
// everywhere this file is loaded.
if (typeof window !== "undefined") {
  window.FlaticonPaletteStorage = FlaticonPaletteStorage;
}

if (typeof module !== "undefined") {
  module.exports = FlaticonPaletteStorage;
}
