/**
 * Content script injected on every flaticon.com page.
 *
 * Two layers, so the extension stays useful even if Flaticon changes its markup:
 *
 *  1. GUARANTEED — a floating "My Palette" button + panel that works everywhere.
 *     Lets the user browse/add/copy their saved colors and recent history without
 *     depending on any Flaticon-specific DOM structure.
 *
 *  2. EMBEDDED (best effort) — Flaticon's own icon editor renders three lists with
 *     identical markup: `#svg-icon-colors` ("Select a color from the icon"),
 *     `#last-icon-colors` ("History"), each `<li class="color"><button data-original
 *     data-actual style="background:#hex"></button></li>`. Clicking any button in
 *     `#last-icon-colors` re-applies that color to the icon — Flaticon must be using
 *     a listener bound on that list (or an ancestor) that reacts to clicks on any
 *     `.color button` inside it, since Flaticon's own JS keeps appending fresh,
 *     clickable entries there as you pick colors. So instead of reverse-engineering
 *     their recolor logic, we inject real `<li class="color">` entries — one per
 *     saved palette color — directly into that same `#last-icon-colors` list. A
 *     click on one of ours reaches Flaticon's own handler exactly like a click on a
 *     genuine history entry would, and re-applies the color the normal way.
 *
 *     The same list is also how we capture colors: every time Flaticon adds a new
 *     (non-ours) entry to `#last-icon-colors` — whether the user clicked an icon's
 *     own color or dialed one in with Flaticon's "Choose a new color" picker (a
 *     Pickr instance, `#icon-edit-color-picker`) — we mirror that hex into this
 *     extension's history, so it survives page reloads instead of vanishing with
 *     Flaticon's own in-memory, per-visit history.
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
    historyList: "#last-icon-colors",
    iconColorsList: "#svg-icon-colors",
    paletteSection: "#section-color-palette",
    historyLabel: ".detail__editor__colors p.history, .detail__editor__colors p.clear.history",
    pickrResult: "#icon-edit-color-picker .pcr-result",
  };

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

  function buildOwnSwatchLi(hex, title) {
    const li = document.createElement("li");
    li.className = "color fpm-own-swatch";
    li.dataset.fpmOwn = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-original", hex);
    btn.setAttribute("data-actual", hex);
    btn.style.background = hex;
    if (title) btn.title = title + " — from My Palette";

    const removeBtn = document.createElement("span");
    removeBtn.className = "fpm-remove-x";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove from My Palette";
    removeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const list = await window.FlaticonPaletteStorage.getPalette();
      const match = list.find((c) => c.hex === hex);
      if (match) await window.FlaticonPaletteStorage.removeColor(match.id);
      li.remove();
    });

    // Don't block Flaticon's own click handling (which applies the color to the
    // icon) — just also log this as "applied" in our own history for the record.
    btn.addEventListener(
      "click",
      () => {
        window.FlaticonPaletteStorage.addHistoryEntry({ hex, source: "applied-to-icon", ...getIconContext() });
      },
      { capture: true }
    );

    li.append(btn, removeBtn);
    return li;
  }

  function buildAddControlLi() {
    const li = document.createElement("li");
    li.className = "color fpm-add-swatch";
    li.dataset.fpmOwn = "1";
    li.dataset.fpmControl = "add";
    li.title = "Save a new color to My Palette";

    const label = document.createElement("label");
    label.className = "fpm-add-swatch-label";

    const input = document.createElement("input");
    input.type = "color";
    input.value = "#12a17d";
    input.className = "fpm-add-swatch-input";

    const plus = document.createElement("span");
    plus.className = "fpm-add-swatch-plus";
    plus.textContent = "+";

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

  /** Add/remove our own <li> entries in the history list so it matches the saved palette. */
  async function syncOwnSwatches() {
    if (!historyListEl || !document.contains(historyListEl)) return;
    const palette = await window.FlaticonPaletteStorage.getPalette();
    const paletteHexes = new Set(palette.map((c) => c.hex));

    // Remove stale own-swatches (deleted from the palette elsewhere, e.g. the dashboard).
    Array.from(historyListEl.querySelectorAll('li[data-fpm-own="1"].fpm-own-swatch')).forEach((li) => {
      const hex = extractHex(li.querySelector("button"));
      if (!paletteHexes.has(hex)) li.remove();
    });

    // Add any palette colors not yet represented.
    const present = new Set(
      Array.from(historyListEl.querySelectorAll('li[data-fpm-own="1"].fpm-own-swatch button')).map(extractHex)
    );
    palette.forEach((c) => {
      if (present.has(c.hex)) return;
      historyListEl.appendChild(buildOwnSwatchLi(c.hex, c.name));
    });

    // Make sure the "+" add control is present and last.
    let addLi = historyListEl.querySelector('li[data-fpm-control="add"]');
    if (!addLi) {
      addLi = buildAddControlLi();
      historyListEl.appendChild(addLi);
    } else {
      historyListEl.appendChild(addLi); // keep it last
    }
  }

  function watchHistoryList(ul) {
    const mo = new MutationObserver((mutations) => {
      let sawForeignAddition = false;
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.dataset && node.dataset.fpmOwn === "1") return; // ours — ignore
          const hex = extractHex(node.querySelector("button"));
          if (!hex) return;
          sawForeignAddition = true;
          window.FlaticonPaletteStorage.addHistoryEntry({
            hex,
            source: "flaticon-picker",
            ...getIconContext(),
          }).then(() => renderPanelHistory());
        });
      });
      if (sawForeignAddition) {
        // Flaticon may have re-rendered the list; make sure our own entries are still there.
        syncOwnSwatches();
      }
    });
    mo.observe(ul, { childList: true });
  }

  function watchPickrResultInput() {
    const input = document.querySelector(FT_SEL.pickrResult);
    if (!input || input.dataset.fpmWatched) return;
    input.dataset.fpmWatched = "1";
    const record = () => {
      const hex = normalizeHex(input.value);
      if (!hex) return;
      window.FlaticonPaletteStorage
        .addHistoryEntry({ hex, source: "flaticon-picker", ...getIconContext() })
        .then(() => renderPanelHistory());
    };
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
      watchPickrResultInput();

      const found = findHistoryList();
      if (found && found !== historyListEl) {
        historyListEl = found;
        watchHistoryList(historyListEl);
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
