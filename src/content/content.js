/**
 * Content script injected on every flaticon.com page.
 *
 * Two layers, so the extension stays useful even if Flaticon changes its markup:
 *
 *  1. GUARANTEED — a floating "My Palette" button + panel that works everywhere.
 *     Lets the user browse/add/copy their saved colors and recent history without
 *     depending on any Flaticon-specific DOM structure.
 *
 *  2. EMBEDDED (best effort) — Flaticon's own icon editor renders its swatch lists
 *     (`#svg-icon-colors` "Select a color from the icon", `#last-icon-colors` "History") as
 *     `<li class="color"><button data-original data-actual style="background:#hex"></button>
 *     </li>`. Saved palette colors are inserted into `#last-icon-colors` with the same markup,
 *     so they sit right there visually — but clicking one does NOT reach Flaticon's own recolor
 *     logic: testing showed Flaticon must bind that per-button at creation time (or similarly
 *     scope it to elements it made itself), since buttons inserted from outside stay inert, even
 *     though something in Flaticon's code *does* still touch them generically (observed
 *     stripping our tracking class/attribute off a clicked entry — see `ownNodes` below). So
 *     applying a saved color instead drives Flaticon's own Pickr hex field
 *     (`#icon-edit-color-picker .pcr-result`, a https://github.com/Simonwep/pickr instance) the
 *     same way a real user typing into it would (`applyHexViaPickr`) — that field is a genuine
 *     Flaticon-bound element, and it's confirmed to work since it's exactly what Flaticon's own
 *     "Choose a new color" picker uses.
 *
 *     Ownership tracking for our injected nodes uses a `WeakSet` of the actual DOM elements
 *     (`ownNodes`), not a CSS class or data attribute — those get stripped by whatever generic
 *     handling Flaticon runs over list items, which previously caused a stripped node to be
 *     mistaken for "not ours" and re-injected as a duplicate.
 *
 *     Capturing colors is separate: Flaticon appears to keep a single "last used color" node
 *     and update its `data-actual` / `style` attributes *in place* rather than only appending
 *     new `<li>`s (hence the id being singular — "last-icon-colors" — not "history"). So on top
 *     of watching for new list entries, a MutationObserver also watches for *attribute* changes
 *     on swatch buttons and on Pickr's palette drag-handle across the whole colors panel,
 *     debounced so a slider drag doesn't flood history with every intermediate frame. Typing a
 *     hex directly into Pickr's text field is covered separately (`input`/`change`), since that
 *     only changes a live DOM property, not an HTML attribute a MutationObserver can see.
 *
 *     All of this is wrapped in try/catch and re-scanned on DOM mutations, since it
 *     depends on Flaticon's live markup (last verified against flaticon.com in
 *     September 2026). If Flaticon changes their editor's structure, layer 1 keeps
 *     working regardless — see README.md "How it works" / "Known limitations".
 */
(function () {
  "use strict";

  function normalizeHex(v) {
    return window.FlaticonPaletteStorage ? window.FlaticonPaletteStorage.normalizeHex(v) : null;
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
      btn.title = (c.name ? c.name + " — " : "") + c.hex + " (click to copy)";
      btn.addEventListener("click", async () => {
        const ok = await copyText(c.hex);
        showToast(ok ? `Copied ${c.hex}` : c.hex);
      });
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
      dot.title = "Copy " + h.hex;
      dot.addEventListener("click", async () => {
        const ok = await copyText(h.hex);
        showToast(ok ? `Copied ${h.hex}` : h.hex);
      });

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
  // Layer 2: embed directly into Flaticon's editor
  // ---------------------------------------------------------------------

  // Flaticon's editor markup, keyed so a future redesign only needs updates here.
  const FT_SEL = {
    colorsPanel: ".detail__editor__colors",
    historyList: "#last-icon-colors",
    iconColorsList: "#svg-icon-colors",
    paletteSection: "#section-color-palette",
    historyLabel: ".detail__editor__colors p.history, .detail__editor__colors p.clear.history",
    pickrResult: "#icon-edit-color-picker .pcr-result",
    // The three Pickr sliders (palette / hue / opacity) all reuse the ".pcr-picker" class for
    // their drag handles. Only the palette one's inline `background` reflects the actual color
    // being chosen — the hue handle only ever shows a fully-saturated hue, and the opacity one
    // shows a black/transparent gradient, so both must stay excluded or we'd log the wrong hex.
    pickrPaletteHandle: ".pcr-color-palette .pcr-picker",
  };

  function findColorsPanel() {
    return document.querySelector(FT_SEL.colorsPanel) || findHistoryList()?.parentElement || null;
  }

  function findHistoryList() {
    return (
      document.querySelector(FT_SEL.historyList) ||
      (() => {
        // Fallback if Flaticon renames the #id: look for the <ul class="colors ..."> that
        // immediately follows a label whose text is exactly "History".
        const label = Array.from(document.querySelectorAll("p,div,span")).find(
          (el) => el.children.length === 0 && el.textContent.trim().toLowerCase() === "history"
        );
        if (!label) return null;
        let sib = label.nextElementSibling;
        while (sib && !(sib.tagName === "UL" && /\bcolors\b/.test(sib.className))) {
          sib = sib.nextElementSibling;
        }
        return sib || null;
      })()
    );
  }

  function extractHex(button) {
    if (!button) return null;
    return (
      normalizeHex(button.getAttribute("data-actual")) ||
      normalizeHex(button.getAttribute("data-original")) ||
      normalizeHex(button.style.backgroundColor)
    );
  }

  // Identify "ours" by object reference, not by class/data-attribute. Flaticon's editor turns
  // out to run some generic handling over every <li> in these lists (observed stripping our
  // `fpm-own-swatch` class and `data-fpm-own` attribute off a clicked entry) — attributes it
  // touches are the wrong thing to rely on for ownership. A WeakSet of the actual DOM nodes we
  // created survives that; ownNodes covers every element we build (li/button/span/label/input)
  // so a plain ancestor walk (isOwnNode) recognizes a click anywhere inside one of them.
  const ownNodes = new WeakSet();
  function isOwnNode(el) {
    for (let node = el; node; node = node.parentElement) {
      if (ownNodes.has(node)) return true;
    }
    return false;
  }

  /**
   * Set Flaticon's own Pickr hex field and fire the same events a real user typing into it
   * would — this is the one confirmed-working path (it's what a genuine picker pick goes
   * through), unlike clicking a swatch we inserted ourselves, which Flaticon's per-element
   * click binding never learns about since it didn't create that button.
   */
  function applyHexViaPickr(hex) {
    const input = document.querySelector(FT_SEL.pickrResult);
    if (!input) return false;
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(input, hex);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildOwnSwatchLi(hex, title) {
    const li = document.createElement("li");
    li.className = "color fpm-own-swatch";
    li.dataset.fpmOwn = "1"; // best-effort visual/debug marker; ownNodes is the real source of truth
    ownNodes.add(li);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-original", hex);
    btn.setAttribute("data-actual", hex);
    btn.style.background = hex;
    if (title) btn.title = title + " — from My Palette";
    ownNodes.add(btn);

    const removeBtn = document.createElement("span");
    removeBtn.className = "fpm-remove-x";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove from My Palette";
    ownNodes.add(removeBtn);
    removeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const list = await window.FlaticonPaletteStorage.getPalette();
      const match = list.find((c) => c.hex === hex);
      if (match) await window.FlaticonPaletteStorage.removeColor(match.id);
      ownSwatchLis.delete(hex);
      li.remove();
    });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const applied = applyHexViaPickr(hex);
      await window.FlaticonPaletteStorage.addHistoryEntry({ hex, source: "applied-to-icon", ...getIconContext() });
      if (!applied) {
        const copied = await copyText(hex);
        showToast(copied ? `Copied ${hex} — Flaticon's color picker wasn't found here` : hex);
      }
    });

    li.append(btn, removeBtn);
    return li;
  }

  function buildAddControlLi() {
    const li = document.createElement("li");
    li.className = "color fpm-add-swatch";
    li.dataset.fpmOwn = "1";
    li.dataset.fpmControl = "add";
    li.title = "Save a new color to My Palette";
    ownNodes.add(li);

    const label = document.createElement("label");
    label.className = "fpm-add-swatch-label";
    ownNodes.add(label);

    const input = document.createElement("input");
    input.type = "color";
    input.value = "#12a17d";
    input.className = "fpm-add-swatch-input";
    ownNodes.add(input);

    const plus = document.createElement("span");
    plus.className = "fpm-add-swatch-plus";
    plus.textContent = "+";
    ownNodes.add(plus);

    input.addEventListener("change", async () => {
      const hex = normalizeHex(input.value);
      if (!hex) return;
      await window.FlaticonPaletteStorage.addColor(hex, "", "dashboard");
      showToast(`Saved ${hex} to My Palette`);
      syncOwnSwatches();
      renderPanelGrid();
    });

    label.append(input, plus);
    li.append(label);
    return li;
  }

  let historyListEl = null;
  const ownSwatchLis = new Map(); // hex -> <li> currently believed to be in historyListEl
  let addControlLi = null;

  /** Add/remove our own <li> entries in the history list so it matches the saved palette.
   *  Tracked entirely via `ownSwatchLis`/`addControlLi` (JS references), not DOM queries —
   *  see the ownNodes comment above for why. */
  async function syncOwnSwatches() {
    if (!historyListEl || !document.contains(historyListEl)) return;
    const palette = await window.FlaticonPaletteStorage.getPalette();
    const paletteHexes = new Set(palette.map((c) => c.hex));

    // Drop entries no longer in the palette (deleted elsewhere, e.g. the dashboard).
    for (const [hex, li] of Array.from(ownSwatchLis)) {
      if (!paletteHexes.has(hex)) {
        if (document.contains(li)) li.remove();
        ownSwatchLis.delete(hex);
      }
    }

    // (Re)add anything missing — covers both "never added" and "Flaticon's own re-render
    // dropped it from the DOM" (we still hold the reference, but document.contains says no).
    palette.forEach((c) => {
      const existing = ownSwatchLis.get(c.hex);
      if (existing && document.contains(existing)) return;
      const li = buildOwnSwatchLi(c.hex, c.name);
      ownSwatchLis.set(c.hex, li);
      historyListEl.appendChild(li);
    });

    // Make sure the "+" add control exists, is in the DOM, and stays last.
    if (!addControlLi || !document.contains(addControlLi)) {
      addControlLi = buildAddControlLi();
    }
    historyListEl.appendChild(addControlLi); // appendChild on an existing node just moves it
  }

  /**
   * A hex color was just applied on the page — commit it to history (debounced, see below).
   * Shared by every capture path so they all behave the same way.
   */
  function recordPick(hex) {
    if (!hex) return;
    window.FlaticonPaletteStorage
      .addHistoryEntry({ hex, source: "flaticon-picker", ...getIconContext() })
      .then(() => renderPanelHistory());
  }

  // Dragging Pickr's palette handle can fire dozens of mutations a second; only commit the
  // color once the user has settled on one, instead of flooding history with every drag frame.
  const debouncedRecordPick = debounce(recordPick, 450);

  /**
   * Pull a hex color out of a mutation, if this particular mutation represents a real color
   * pick rather than incidental DOM churn (hover states, unrelated layout, etc).
   */
  function hexFromMutationTarget(target) {
    if (!(target instanceof Element)) return null;
    if (isOwnNode(target)) return null; // one of our own nodes — ignore

    // A swatch button in #svg-icon-colors or #last-icon-colors: read its *current* color,
    // regardless of whether it was the "style" or "data-actual" attribute that just changed.
    if (target.tagName === "BUTTON" && target.hasAttribute("data-actual")) {
      return extractHex(target);
    }

    // Pickr's palette drag-handle reflects the live color as the user drags (not yet
    // necessarily "applied" to the icon, but this is the only place a color choice made by
    // dragging — rather than typing a hex or clicking a swatch — shows up at all).
    if (target.matches && target.matches(FT_SEL.pickrPaletteHandle)) {
      return normalizeHex(target.style.backgroundColor || target.style.background);
    }

    return null;
  }

  const observedPanels = new WeakSet();

  /**
   * One MutationObserver over Flaticon's whole colors panel, watching both for genuinely new
   * list entries (in case Flaticon ever appends rather than mutates in place) *and* attribute
   * changes on existing swatch buttons / the Pickr palette handle (what Flaticon's editor
   * actually seems to do: it appears to keep a single "last used color" node and update its
   * `data-actual` / `style` attributes in place, which a childList-only observer would miss).
   */
  function watchColorPanel(panelRoot) {
    if (!panelRoot || observedPanels.has(panelRoot)) return;
    observedPanels.add(panelRoot);

    const mo = new MutationObserver((mutations) => {
      let sawForeignListAddition = false;

      mutations.forEach((m) => {
        if (m.type === "attributes") {
          const hex = hexFromMutationTarget(m.target);
          if (hex) debouncedRecordPick(hex);
          return;
        }
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (isOwnNode(node)) return; // ours — ignore
          const btn = node.matches("button") ? node : node.querySelector("button");
          const hex = extractHex(btn);
          if (!hex) return;
          sawForeignListAddition = true;
          debouncedRecordPick(hex);
        });
      });

      if (sawForeignListAddition) {
        // Flaticon may have re-rendered a list; make sure our own entries are still there.
        syncOwnSwatches();
      }
    });

    mo.observe(panelRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "data-actual", "data-original"],
    });
  }

  /** Typing (or pasting) a hex code directly into Pickr's text field doesn't touch any HTML
   *  attribute — `.value` is a live DOM property — so the attribute observer above can't see
   *  it. Cover that path with a plain event listener instead. */
  function watchPickrResultInput() {
    const input = document.querySelector(FT_SEL.pickrResult);
    if (!input || input.dataset.fpmWatched) return;
    input.dataset.fpmWatched = "1";
    const record = () => recordPick(normalizeHex(input.value));
    input.addEventListener("change", record);
    input.addEventListener("blur", record);
  }

  let editorConnected = false;
  function setStatus(connected) {
    editorConnected = connected;
    const el = panel.querySelector("#fpm-status");
    if (!el) return;
    el.textContent = connected
      ? "🟢 Embedded in Flaticon's History — click any of your colors there to apply it"
      : "⚪ Open an icon's color editor to see My Palette inside Flaticon's History section";
    el.classList.toggle("fpm-status-on", connected);
  }

  function scanForEditor() {
    try {
      watchColorPanel(findColorsPanel());
      watchPickrResultInput();

      const found = findHistoryList();
      if (found && found !== historyListEl) {
        historyListEl = found;
        syncOwnSwatches();
      }

      const connected = !!(historyListEl && document.contains(historyListEl));
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
    syncOwnSwatches();
  });
})();
