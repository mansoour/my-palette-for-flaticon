/**
 * Content script injected on every flaticon.com page.
 *
 * Two layers, so the extension stays useful even if Flaticon changes its markup:
 *
 *  1. GUARANTEED — a floating "My Palette" button + panel that works everywhere.
 *     Lets the user browse/add/copy their saved colors and recent history without
 *     depending on any Flaticon-specific DOM structure.
 *
 *  2. ENHANCED (best effort) — when Flaticon's own icon color-editor is open on the
 *     page (the panel with "Select a color from the icon" / "Choose a new color" /
 *     "History"), the script tries to:
 *       a. Mirror any color that appears in Flaticon's own "History" swatch list
 *          into our extension's history (source: "flaticon-picker").
 *       b. Listen to any native <input type="color"> Flaticon uses for its color
 *          wheel picker and record changes the same way.
 *       c. Render our saved palette as an extra section inside their panel, next
 *          to the (paid-only) "Custom palette" feature, so the user can click a
 *          saved color to copy it and try to auto-apply it to the selected part
 *          of the icon via that same native color input.
 *
 *     All of layer 2 is wrapped in try/catch and re-scanned on DOM mutations, since
 *     it depends on Flaticon's live markup (last verified against flaticon.com in
 *     September 2026). If Flaticon changes their editor's structure, layer 1 keeps
 *     working regardless — see README.md "How it works" / "Known limitations".
 */
(function () {
  "use strict";

  const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

  function normalizeHex(v) {
    return window.FlaticonPaletteStorage ? window.FlaticonPaletteStorage.normalizeHex(v) : null;
  }

  function rgbToHex(str) {
    return normalizeHex(str);
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function getIconContext() {
    const m = location.pathname.match(/[_-](\d{4,})(?:\.htm)?\/?$/);
    return {
      pageUrl: location.href,
      pageTitle: document.title.replace(/\s*\|\s*Flaticon.*$/i, "").trim(),
      iconId: m ? m[1] : "",
    };
  }

  function readSwatchColor(el) {
    if (!el) return null;
    const inline = el.style && el.style.backgroundColor;
    if (inline) {
      const hex = rgbToHex(inline);
      if (hex) return hex;
    }
    const computed = window.getComputedStyle(el).backgroundColor;
    return rgbToHex(computed);
  }

  // ---------------------------------------------------------------------
  // Layer 1: floating button + panel (always available)
  // ---------------------------------------------------------------------

  const root = document.createElement("div");
  root.id = "fpm-root";
  root.className = "fpm-reset";

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "fpm-toggle";
  toggleBtn.type = "button";
  toggleBtn.title = "My Palette for Flaticon";
  toggleBtn.textContent = "🎨";

  const panel = document.createElement("div");
  panel.id = "fpm-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="fpm-panel-head">
      <span class="fpm-panel-title">🎨 My Palette</span>
      <button type="button" class="fpm-icon-btn" id="fpm-close" title="Close">×</button>
    </div>
    <div class="fpm-status" id="fpm-status">⚪ Scanning this page for Flaticon's color editor…</div>
    <form class="fpm-add-row" id="fpm-add-form">
      <input type="color" id="fpm-add-color" value="#12a17d" />
      <input type="text" id="fpm-add-hex" placeholder="#12A17D" maxlength="7" />
      <button type="submit" class="fpm-primary-btn">Add</button>
    </form>
    <div class="fpm-section-label">My colors</div>
    <div class="fpm-grid" id="fpm-grid"></div>
    <p class="fpm-empty" id="fpm-grid-empty" hidden>No saved colors yet. Add one above.</p>
    <div class="fpm-section-label">Recent history</div>
    <div class="fpm-history" id="fpm-history"></div>
    <p class="fpm-empty" id="fpm-history-empty" hidden>Nothing picked yet.</p>
    <div class="fpm-panel-foot">
      <button type="button" class="fpm-link-btn" id="fpm-open-dashboard">Open full dashboard ↗</button>
    </div>
  `;

  root.append(toggleBtn, panel);

  function mount() {
    if (document.body) document.body.appendChild(root);
    else document.addEventListener("DOMContentLoaded", () => document.body.appendChild(root));
  }
  mount();

  const toast = document.createElement("div");
  toast.id = "fpm-toast";
  toast.hidden = true;
  document.documentElement.appendChild(toast);
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add("fpm-toast-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("fpm-toast-visible");
      setTimeout(() => (toast.hidden = true), 200);
    }, 1700);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  toggleBtn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      renderPanelGrid();
      renderPanelHistory();
    }
  });
  panel.querySelector("#fpm-close").addEventListener("click", () => (panel.hidden = true));
  panel.querySelector("#fpm-open-dashboard").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "open-dashboard" });
  });

  const addColorInput = panel.querySelector("#fpm-add-color");
  const addHexInput = panel.querySelector("#fpm-add-hex");
  addColorInput.addEventListener("input", () => (addHexInput.value = addColorInput.value));

  panel.querySelector("#fpm-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const clean = normalizeHex(addHexInput.value || addColorInput.value);
    if (!clean) {
      showToast("Enter a valid hex color");
      return;
    }
    await window.FlaticonPaletteStorage.addColor(clean, "", "dashboard");
    addHexInput.value = "";
    renderPanelGrid();
    showToast(`Added ${clean}`);
  });

  async function renderPanelGrid() {
    const list = await window.FlaticonPaletteStorage.getPalette();
    const grid = panel.querySelector("#fpm-grid");
    panel.querySelector("#fpm-grid-empty").hidden = list.length > 0;
    grid.innerHTML = "";
    list.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fpm-swatch";
      btn.style.background = c.hex;
      btn.title = (c.name ? c.name + " — " : "") + c.hex + " (click to apply / copy)";
      btn.addEventListener("click", () => applyOrCopyColor(c.hex));
      grid.appendChild(btn);
    });
  }

  const SOURCE_LABEL = {
    "flaticon-picker": "Flaticon",
    dashboard: "Added",
    "applied-to-icon": "Applied",
  };

  async function renderPanelHistory() {
    const list = (await window.FlaticonPaletteStorage.getHistory()).slice(0, 8);
    const wrap = panel.querySelector("#fpm-history");
    panel.querySelector("#fpm-history-empty").hidden = list.length > 0;
    wrap.innerHTML = "";
    list.forEach((h) => {
      const row = document.createElement("div");
      row.className = "fpm-history-row";

      const dot = document.createElement("span");
      dot.className = "fpm-swatch-dot";
      dot.style.background = h.hex;
      dot.addEventListener("click", () => applyOrCopyColor(h.hex));

      const hex = document.createElement("span");
      hex.className = "fpm-hex";
      hex.textContent = h.hex;

      const tag = document.createElement("span");
      tag.className = "fpm-source-tag";
      tag.textContent = SOURCE_LABEL[h.source] || "";

      row.append(dot, hex, tag);
      wrap.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------
  // Layer 2: best-effort integration with Flaticon's own editor
  // ---------------------------------------------------------------------

  let nativeColorInput = null; // last-seen <input type="color"> inside the editor, if any
  let editorConnected = false;

  function setStatus(connected) {
    editorConnected = connected;
    const el = panel.querySelector("#fpm-status");
    if (!el) return;
    el.textContent = connected
      ? "🟢 Connected to Flaticon's color editor — click a color to apply it"
      : "⚪ Open an icon's color editor (click an icon, then Edit) to enable one-click apply";
    el.classList.toggle("fpm-status-on", connected);
  }

  /** Try to programmatically set Flaticon's own color input so its app logic recolors the icon. */
  function tryApplyToNativeInput(hex) {
    const input =
      (nativeColorInput && document.contains(nativeColorInput) && nativeColorInput) ||
      document.querySelector('input[type="color"]');
    if (!input) return false;
    try {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, hex);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      nativeColorInput = input;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function applyOrCopyColor(hex) {
    const applied = tryApplyToNativeInput(hex);
    const copied = await copyText(hex);
    await window.FlaticonPaletteStorage.addHistoryEntry({
      hex,
      source: "applied-to-icon",
      ...getIconContext(),
    });
    renderPanelHistory();
    if (applied) {
      showToast(`Applied ${hex} — also copied`);
    } else if (copied) {
      showToast(`Copied ${hex} — paste it into Flaticon's color picker`);
    } else {
      showToast(hex);
    }
  }

  /** Find a heading-ish element whose trimmed text matches `text` (case-insensitive, exact). */
  function findHeadingByText(text) {
    const candidates = document.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,p,label");
    const wanted = text.toLowerCase();
    for (const el of candidates) {
      if (el.children.length > 0) continue; // want leaf nodes only
      const t = (el.textContent || "").trim().toLowerCase();
      if (t === wanted) return el;
    }
    return null;
  }

  /** Given the "History" label, find the sibling/child container that holds its color swatches. */
  function findSwatchContainerNear(labelEl) {
    if (!labelEl) return null;
    let container = labelEl.parentElement;
    for (let depth = 0; depth < 4 && container; depth++) {
      const swatchLike = Array.from(container.querySelectorAll("*")).filter((el) => {
        if (el === labelEl || el.contains(labelEl)) return false;
        if (el.children.length > 0) return false;
        const bg = window.getComputedStyle(el).backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.width < 60 && rect.height > 0 && rect.height < 60;
      });
      if (swatchLike.length > 0) {
        return swatchLike[0].parentElement;
      }
      container = container.parentElement;
    }
    return null;
  }

  const observedSwatchContainers = new WeakSet();
  const observedNativeInputs = new WeakSet();

  function watchHistorySwatches(swatchContainer) {
    if (!swatchContainer || observedSwatchContainers.has(swatchContainer)) return;
    observedSwatchContainers.add(swatchContainer);

    const mirrorChild = (node) => {
      if (!(node instanceof Element)) return;
      const hex = readSwatchColor(node);
      if (!hex) return;
      window.FlaticonPaletteStorage.addHistoryEntry({
        hex,
        source: "flaticon-picker",
        ...getIconContext(),
      }).then(() => renderPanelHistory());
    };

    Array.from(swatchContainer.children).forEach(mirrorChild);

    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => m.addedNodes.forEach(mirrorChild));
    });
    mo.observe(swatchContainer, { childList: true });
  }

  function watchNativeColorInputs() {
    document.querySelectorAll('input[type="color"]').forEach((input) => {
      if (observedNativeInputs.has(input)) return;
      observedNativeInputs.add(input);
      nativeColorInput = input;
      const record = () => {
        window.FlaticonPaletteStorage.addHistoryEntry({
          hex: input.value,
          source: "flaticon-picker",
          ...getIconContext(),
        }).then(() => renderPanelHistory());
      };
      input.addEventListener("input", record);
      input.addEventListener("change", record);
    });
  }

  /** Inject a "My Palette (free)" mini section next to Flaticon's own "Custom palette" label. */
  function injectPaletteIntoEditor() {
    const customPaletteLabel = Array.from(document.querySelectorAll("div,span,p,button,a")).find(
      (el) =>
        el.children.length === 0 && /custom palette/i.test((el.textContent || "").trim()) && (el.textContent || "").trim().length < 40
    );
    if (!customPaletteLabel) return false;

    const anchor = customPaletteLabel.closest("div") || customPaletteLabel.parentElement;
    if (!anchor || anchor.dataset.fpmInjected) return true;
    anchor.dataset.fpmInjected = "1";

    const box = document.createElement("div");
    box.id = "fpm-inline-box";
    box.innerHTML = `<div class="fpm-inline-title">⭐ My Palette (free)</div><div class="fpm-inline-grid"></div>`;
    anchor.insertAdjacentElement("afterend", box);

    window.FlaticonPaletteStorage.getPalette().then((list) => {
      const grid = box.querySelector(".fpm-inline-grid");
      list.forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fpm-swatch fpm-swatch-sm";
        btn.style.background = c.hex;
        btn.title = c.hex + " (click to apply)";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          applyOrCopyColor(c.hex);
        });
        grid.appendChild(btn);
      });
    });
    return true;
  }

  function scanForEditor() {
    try {
      watchNativeColorInputs();

      const historyLabel = findHeadingByText("History");
      const swatchContainer = findSwatchContainerNear(historyLabel);
      if (swatchContainer) watchHistorySwatches(swatchContainer);

      const injected = injectPaletteIntoEditor();

      const connected = !!(document.querySelector('input[type="color"]') || swatchContainer || injected);
      if (connected !== editorConnected) setStatus(connected);
    } catch (e) {
      // Defensive: Flaticon's markup may have changed. Layer 1 (floating panel) still works.
      console.debug("[My Palette for Flaticon] editor scan skipped:", e);
    }
  }

  const debouncedScan = debounce(scanForEditor, 400);
  const bodyObserver = new MutationObserver(debouncedScan);
  function startObserving() {
    if (document.body) {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
      scanForEditor();
    } else {
      document.addEventListener("DOMContentLoaded", startObserving, { once: true });
    }
  }
  startObserving();

  chrome.storage.onChanged.addListener(() => {
    if (!panel.hidden) {
      renderPanelGrid();
      renderPanelHistory();
    }
  });
})();
