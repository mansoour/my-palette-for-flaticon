/**
 * Content script injected on every flaticon.com page.
 *
 * Two layers, so the extension stays useful even if Flaticon changes its markup:
 *
 *  1. GUARANTEED — a floating "My Palette" button + panel that works everywhere.
 *     Lets the user browse/add/copy their saved colors and recent history without
 *     depending on any Flaticon-specific DOM structure.
 *
 *  2. EMBEDDED (best effort) — a "My Palette" section is inserted into Flaticon's icon editor,
 *     right before its own "History" label, kept deliberately separate from Flaticon's own lists
 *     (an earlier version mixed saved colors into Flaticon's `#last-icon-colors`, which read as
 *     confusing since they'd sit alongside Flaticon's own transient entries). Its swatches reuse
 *     Flaticon's `.color`/`button` markup purely so they inherit the site's own sizing for a
 *     native look, but clicking one does NOT rely on Flaticon's own click handling — testing
 *     showed Flaticon must bind its recolor logic per-button at creation time (or similarly scope
 *     it to elements it made itself), since buttons inserted from outside stay inert. Instead,
 *     applying a saved color drives Flaticon's own Pickr hex field
 *     (`#icon-edit-color-picker .pcr-result`, a https://github.com/Simonwep/pickr instance) the
 *     same way a real user typing into it would (`applyHexViaPickr`) — that field is a genuine
 *     Flaticon-bound element, confirmed to work since it's exactly what Flaticon's own "Choose a
 *     new color" picker uses. Testing also showed this only takes effect once the picker popup
 *     has actually finished opening (comparing the editor's markup before/after a real pick shows
 *     Pickr only sets `.pcr-app`'s inline position and `.color-picker-wrapper`'s `--pcr-color`
 *     once its own opening sequence has run) — an open-set-close done in one synchronous call was
 *     faster than that could complete and silently did nothing, so `applyHexViaPickr` now opens
 *     the popup, waits briefly, sets the value, waits again, verifies the icon's active color
 *     actually changed, and only then closes it back — a small real (not simulated-away) open is
 *     the trade-off for it reliably working.
 *
 *     Ownership tracking for our injected nodes uses a `WeakSet` of the actual DOM elements
 *     (`ownNodes`), not a CSS class or data attribute, since Flaticon's editor runs some generic
 *     handling over list items in its OWN lists that was observed stripping a tracking
 *     class/attribute off a clicked entry when this lived inside `#last-icon-colors`; a WeakSet
 *     survives that regardless. `syncOwnSwatches` also runs behind a small mutex so overlapping
 *     calls (several can fire in quick succession off one click) can't interleave and duplicate
 *     work.
 *
 *     Capturing colors is separate, and still watches Flaticon's own `#last-icon-colors` (not
 *     our section): Flaticon appears to keep a single "last used color" node
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

  function icon(name, opts) {
    return window.FPMIcons ? window.FPMIcons.svg(name, opts) : "";
  }

  /**
   * Force every icon inside `container` to actually render, regardless of what Flaticon's own
   * page CSS does. A previous fix relied purely on a stylesheet rule (`.fpm-icon { fill:
   * currentColor !important; ... }`), which should out-rank anything non-important by CSS rules
   * alone — but the icon still failed to show in practice, meaning something on the real page is
   * winning that fight in a way an isolated test can't reproduce. This sidesteps the cascade
   * entirely: it reads whatever color *did* actually resolve for the icon (inherited from its
   * button/label, e.g. white on the teal toggle button), then sets that as an inline style with
   * `!important` via the DOM API — inline `!important` beats any external stylesheet rule,
   * `!important` or not, so there's no cascade left to lose. Safe to call repeatedly.
   */
  function hardenIcons(container) {
    if (!container || !container.querySelectorAll) return;
    container.querySelectorAll("svg.fpm-icon").forEach((svg) => {
      let color = "";
      try {
        color = window.getComputedStyle(svg).color;
      } catch (e) {
        color = "";
      }
      if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent") color = "currentColor";
      svg.style.setProperty("display", "inline-block", "important");
      svg.style.setProperty("flex-shrink", "0", "important");
      svg.style.setProperty("vertical-align", "middle", "important");
      svg.style.setProperty("overflow", "visible", "important");
      svg.style.setProperty("fill", color, "important");
      svg.querySelectorAll("path").forEach((p) => p.style.setProperty("fill", "inherit", "important"));
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
  // The custom floating-button artwork (not an inline icon like the rest of the UI) — declared
  // web-accessible under "icons/*" in manifest.json so flaticon.com is allowed to load it.
  const toggleIconUrl = chrome.runtime.getURL("icons/my-palette-floating-button-icon-2048.png");
  toggleBtn.innerHTML = `<img src="${toggleIconUrl}" alt="" class="fpm-toggle-icon-img" />` +
    '<span class="fpm-toggle-badge" id="fpm-toggle-badge" hidden></span>';

  const panel = document.createElement("div");
  panel.id = "fpm-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="fpm-panel-head">
      <span class="fpm-panel-title">${icon("palette", { size: 16 })} My Palette</span>
      <button type="button" class="fpm-icon-btn" id="fpm-close" title="Close">${icon("x-lg", { size: 14 })}</button>
    </div>
    <div class="fpm-status" id="fpm-status">
      <span class="fpm-status-dot"></span>
      <span id="fpm-status-text">Scanning this page for Flaticon's color editor…</span>
    </div>
    <div id="fpm-add-picker"></div>
    <button type="button" class="fpm-primary-btn fpm-primary-btn-block" id="fpm-add-btn">${icon("plus-lg", { size: 14 })} Add to palette</button>
    <div class="fpm-section-label">My colors</div>
    <div class="fpm-grid" id="fpm-grid"></div>
    <p class="fpm-empty" id="fpm-grid-empty" hidden>No saved colors yet. Add one above.</p>
    <div class="fpm-section-label">Recent history</div>
    <div class="fpm-history" id="fpm-history"></div>
    <p class="fpm-empty" id="fpm-history-empty" hidden>Nothing picked yet.</p>
    <div class="fpm-panel-foot">
      <button type="button" class="fpm-link-btn" id="fpm-open-dashboard">${icon("box-arrow-up-right", { size: 13 })} Open full dashboard</button>
    </div>
    <div class="fpm-panel-footer" id="fpm-panel-footer"></div>
  `;

  root.append(toggleBtn, panel);

  // Whether the floating button + panel show up at all is a user setting (Dashboard > Settings)
  // — the "My Palette" section embedded in Flaticon's own editor is unaffected either way.
  async function shouldShowFloatingPanel() {
    const settings = await window.FlaticonPaletteStorage.getSettings();
    return settings.showFloatingPanel !== false;
  }

  async function syncMounted() {
    const show = await shouldShowFloatingPanel();
    // Mounted on <html> (documentElement), not <body>. `position: fixed` is normally relative
    // to the viewport — UNLESS an ancestor has a `transform`/`filter`/`perspective`/
    // `will-change: transform`, which creates a new containing block for fixed descendants
    // instead. That's a very common thing for real sites to put on <body> (slide-out menus,
    // modal-blur backgrounds, GPU-accelerated scroll containers), and would silently reposition
    // this button relative to body's own box instead of the screen — appending to <html>
    // sidesteps that whole class of interference from the host page.
    if (show && document.documentElement && !document.documentElement.contains(root)) {
      document.documentElement.appendChild(root);
      hardenIcons(root);
    } else if (!show && document.documentElement && document.documentElement.contains(root)) {
      root.remove();
    }
  }

  function mount() {
    if (document.documentElement) syncMounted();
    else document.addEventListener("DOMContentLoaded", syncMounted, { once: true });
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

  // Open/close driven entirely by a CSS class (not the `hidden` attribute) so it isn't at the
  // mercy of any interaction between the host page's stylesheet and ours; plus outside-click
  // and Escape support, which a floating panel like this is expected to have.
  function setPanelOpen(open) {
    panel.classList.toggle("fpm-open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      renderPanelGrid();
      renderPanelHistory();
    }
  }

  toggleBtn.addEventListener("click", () => {
    setPanelOpen(!panel.classList.contains("fpm-open"));
  });
  panel.querySelector("#fpm-close").addEventListener("click", () => setPanelOpen(false));
  panel.querySelector("#fpm-open-dashboard").addEventListener("click", () => {
    // Reloading the extension while this tab stays open invalidates its connection to the
    // background script — sendMessage would throw "Extension context invalidated" instead of
    // just failing. A real page reload is the only way to reconnect, so say that plainly rather
    // than let an uncaught error do the talking.
    if (!window.FlaticonPaletteStorage.isContextValid()) {
      showToast("Please refresh this page to reconnect the extension");
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "open-dashboard" });
    } catch (e) {
      showToast("Please refresh this page to reconnect the extension");
    }
  });

  // Capture phase runs before the toggle/panel's own listeners, so this must explicitly ignore
  // clicks that originated inside our own UI (root.contains) rather than unconditionally
  // closing on every click — otherwise it fights the toggle button (closes, then the toggle's
  // own handler immediately reopens it) and closes the panel out from under any click inside it
  // before that click's own handler runs.
  document.addEventListener(
    "click",
    (e) => {
      if (!panel.classList.contains("fpm-open")) return;
      if (root.contains(e.target)) return;
      setPanelOpen(false);
    },
    true
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("fpm-open")) setPanelOpen(false);
  });

  // Custom picker (hue/saturation/lightness sliders + hex field) rather than a native
  // <input type="color"> — kept consistent with the popup/dashboard, both of which had to move
  // off the native input for reliability reasons (see CHANGELOG.md).
  const addPicker = window.FPMColorPicker.create(panel.querySelector("#fpm-add-picker"), { initial: "#12a17d" });

  panel.querySelector("#fpm-add-btn").addEventListener("click", async () => {
    const clean = normalizeHex(addPicker.getValue());
    if (!clean) {
      showToast("Enter a valid hex color");
      return;
    }
    await window.FlaticonPaletteStorage.addColor(clean, "", "dashboard");
    renderPanelGrid();
    showToast(`Added ${clean}`);
  });

  window.FPMFooter.mount(panel.querySelector("#fpm-panel-footer"));

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
    pickrWrap: "#icon-edit-color-picker",
    pickrToggle: "#icon-edit-color-picker .color-picker-wrapper",
    pickrApp: "#icon-edit-color-picker .pcr-app",
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
   * through). Pickr/Flaticon only seem to fully wire up their change handling once the picker
   * popup has actually finished opening — comparing the editor's markup before and after a real
   * pick showed `.pcr-app` only gets its inline position (`style="left:...; top:...;"`) and
   * `.color-picker-wrapper` only gets its `--pcr-color` custom property once Pickr's own opening
   * sequence has actually run. An earlier version opened and closed the popup in one synchronous
   * call (to avoid a visible flash), which was faster than that sequence could complete, so the
   * click silently did nothing — it only ever worked afterwards because a real, slower manual
   * pick had already finished that one-time setup. So this now waits after opening (and again
   * after dispatching the change) before closing, and actually checks whether the icon's active
   * color updated before reporting success — a brief, real open/close is the trade-off for it
   * reliably working versus a silent no-op that merely looked instant.
   */
  async function applyHexViaPickr(hex) {
    const wrap = document.querySelector(FT_SEL.pickrWrap);
    const input = wrap && wrap.querySelector(".pcr-result");
    if (!input) return false;
    const toggle = wrap.querySelector(".color-picker-wrapper");
    const app = wrap.querySelector(".pcr-app");
    const wasClosed = !!(toggle && app && app.classList.contains("hidden"));
    try {
      if (wasClosed) {
        toggle.click();
        await wait(80);
      }

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(input, hex);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      await wait(80);

      const activeBtn = document.querySelector(FT_SEL.iconColorsList + " button.active");
      const confirmed = !!(activeBtn && extractHex(activeBtn) === hex);

      if (wasClosed) toggle.click(); // close it back
      return confirmed;
    } catch (e) {
      if (wasClosed && app && !app.classList.contains("hidden")) toggle.click(); // don't leave it open on error
      return false;
    }
  }

  /**
   * Our own "My Palette" section, inserted right before Flaticon's "History" label — kept
   * separate from Flaticon's own lists entirely (rather than embedded inside `#last-icon-colors`
   * the way an earlier version did) so it reads as its own clearly-labeled feature instead of
   * mixing with Flaticon's transient history. Swatches still reuse Flaticon's `.color`/`button`
   * markup purely so they inherit the site's own sizing/spacing for a native look.
   */
  function buildOwnSection() {
    const section = document.createElement("div");
    section.className = "fpm-own-section";
    ownNodes.add(section);

    const label = document.createElement("p");
    label.className = "font-sm medium text__general--heading mg-bottom-lv2 fpm-own-label";
    label.innerHTML = icon("palette", { size: 13 }) + " My Palette";
    ownNodes.add(label);

    const list = document.createElement("ul");
    list.className = "colors row mg-none-i";
    ownNodes.add(list);

    section.append(label, list);
    return { section, list };
  }

  function buildOwnSwatchLi(hex, title) {
    const li = document.createElement("li");
    li.className = "color";
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
    removeBtn.innerHTML = icon("x-lg", { size: 9 });
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
      const applied = await applyHexViaPickr(hex);
      await window.FlaticonPaletteStorage.addHistoryEntry({ hex, source: "applied-to-icon", ...getIconContext() });
      if (applied) {
        showToast(`Applied ${hex}`);
      } else {
        const copied = await copyText(hex);
        showToast(copied ? `Copied ${hex} — couldn't confirm it applied, paste it into Flaticon's picker` : hex);
      }
    });

    li.append(btn, removeBtn);
    return li;
  }

  // A previous version used a native <input type="color"> here, styled to look like a "+"
  // swatch. That turned out unreliable inside Flaticon's editor (see CHANGELOG.md) — likely some
  // interaction between the native OS color dialog and Flaticon's own page scripts/re-renders.
  // A small custom popover (built from FPMColorPicker — plain sliders, no native dialog at all)
  // sidesteps that whole class of problem.
  let addPopoverEl = null;

  function closeAddPopover() {
    if (addPopoverEl) {
      addPopoverEl.remove();
      addPopoverEl = null;
    }
  }

  function openAddPopover(anchorBtn) {
    closeAddPopover();
    const rect = anchorBtn.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "fpm-add-popover";
    ownNodes.add(pop);
    // `.fpm-add-popover` is `position: fixed` (viewport-relative), same coordinate space as
    // getBoundingClientRect() — no scroll-offset adjustment needed (and adding one would be
    // wrong here, drifting further off-anchor the more the page is scrolled).
    pop.style.top = `${rect.bottom + 8}px`;
    pop.style.left = `${Math.max(8, rect.left - 90)}px`;
    pop.innerHTML = `
      <div id="fpm-add-popover-cp"></div>
      <button type="button" class="fpm-add-popover-btn">${icon("plus-lg", { size: 12 })} Add to palette</button>
    `;
    // Appended to <html>, not <body> — see the comment on syncMounted() for why: a transform/
    // filter/will-change on <body> (common on real sites) would otherwise silently reposition
    // this fixed-position popover relative to body's box instead of the viewport.
    document.documentElement.appendChild(pop);
    hardenIcons(pop);

    const cp = window.FPMColorPicker.create(pop.querySelector("#fpm-add-popover-cp"), { initial: "#12a17d" });
    pop.querySelector(".fpm-add-popover-btn").addEventListener("click", async () => {
      const hex = normalizeHex(cp.getValue());
      if (!hex) return;
      await window.FlaticonPaletteStorage.addColor(hex, "", "dashboard");
      showToast(`Saved ${hex} to My Palette`);
      syncOwnSwatches();
      renderPanelGrid();
      closeAddPopover();
    });

    addPopoverEl = pop;
    setTimeout(() => {
      document.addEventListener(
        "click",
        function onOutsideClick(e) {
          if (addPopoverEl && addPopoverEl.contains(e.target)) return;
          closeAddPopover();
          document.removeEventListener("click", onOutsideClick, true);
          window.removeEventListener("scroll", onScrollClose, true);
        },
        true
      );
      // The popover is `position: fixed` (viewport-relative) while its anchor button scrolls
      // with the page — without this it would visually drift off the "+" swatch on scroll.
      window.addEventListener("scroll", onScrollClose, true);
    }, 0);

    function onScrollClose() {
      closeAddPopover();
      window.removeEventListener("scroll", onScrollClose, true);
    }
  }

  function buildAddControlLi() {
    const li = document.createElement("li");
    li.className = "color fpm-add-swatch";
    li.title = "Save a new color to My Palette";
    ownNodes.add(li);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fpm-add-swatch-btn";
    btn.innerHTML = icon("plus-lg", { size: 11, className: "fpm-add-swatch-plus" });
    ownNodes.add(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (addPopoverEl) closeAddPopover();
      else openAddPopover(btn);
    });

    li.append(btn);
    return li;
  }

  let ownSectionEl = null;
  let ownListEl = null;
  const ownSwatchLis = new Map(); // hex -> <li> currently believed to be in ownListEl
  let addControlLi = null;

  function findHistoryLabel() {
    return (
      document.querySelector(FT_SEL.historyLabel) ||
      Array.from(document.querySelectorAll("p,div,span")).find(
        (el) => el.children.length === 0 && el.textContent.trim().toLowerCase() === "history"
      ) ||
      null
    );
  }

  /** Make sure our "My Palette" section exists in the DOM, right before Flaticon's "History"
   *  label. Re-inserts it if Flaticon's own re-render ever removed it. */
  function ensureOwnSection() {
    if (ownSectionEl && document.contains(ownSectionEl)) return ownListEl;
    const historyLabel = findHistoryLabel();
    if (!historyLabel) return null;
    const built = buildOwnSection();
    ownSectionEl = built.section;
    ownListEl = built.list;
    ownSwatchLis.clear();
    addControlLi = null;
    historyLabel.insertAdjacentElement("beforebegin", ownSectionEl);
    hardenIcons(ownSectionEl);
    return ownListEl;
  }

  /** Add/remove our own <li> entries in our own section so it matches the saved palette.
   *  Tracked via `ownSwatchLis`/`addControlLi` (JS references), not DOM queries. Guarded by a
   *  small mutex: a single click can trigger several near-simultaneous callers (storage change,
   *  DOM mutation, ...), and without it two overlapping runs could each decide a color is
   *  "missing" before the other's insert lands, producing a duplicate. */
  let syncInFlight = false;
  let syncQueued = false;
  async function syncOwnSwatches() {
    if (syncInFlight) {
      syncQueued = true;
      return;
    }
    syncInFlight = true;
    try {
      await doSyncOwnSwatches();
    } finally {
      syncInFlight = false;
      if (syncQueued) {
        syncQueued = false;
        syncOwnSwatches();
      }
    }
  }

  async function doSyncOwnSwatches() {
    const list = ensureOwnSection();
    if (!list) return;
    const palette = await window.FlaticonPaletteStorage.getPalette();
    const paletteHexes = new Set(palette.map((c) => c.hex));

    // Drop entries no longer in the palette (deleted elsewhere, e.g. the dashboard).
    for (const [hex, li] of Array.from(ownSwatchLis)) {
      if (!paletteHexes.has(hex)) {
        if (document.contains(li)) li.remove();
        ownSwatchLis.delete(hex);
      }
    }

    // (Re)add anything missing.
    palette.forEach((c) => {
      const existing = ownSwatchLis.get(c.hex);
      if (existing && document.contains(existing)) return;
      const li = buildOwnSwatchLi(c.hex, c.name);
      ownSwatchLis.set(c.hex, li);
      list.appendChild(li);
    });

    // Make sure the "+" add control exists, is in the DOM, and stays last.
    if (!addControlLi || !document.contains(addControlLi)) {
      addControlLi = buildAddControlLi();
    }
    list.appendChild(addControlLi); // appendChild on an existing node just moves it
    hardenIcons(list);
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
    const textEl = panel.querySelector("#fpm-status-text");
    if (!textEl) return;
    textEl.textContent = connected
      ? "Your colors now appear in their own section above Flaticon's History — click one to apply it"
      : "Open an icon's color editor to see My Palette as its own section";
    panel.querySelector("#fpm-status").classList.toggle("fpm-status-on", connected);
    const badge = toggleBtn.querySelector("#fpm-toggle-badge");
    if (badge) badge.hidden = !connected;
  }

  function scanForEditor() {
    try {
      watchColorPanel(findColorsPanel());
      watchPickrResultInput();
      syncOwnSwatches(); // idempotent: re-inserts/repairs our section if Flaticon's own re-render touched it
      hardenIcons(root);
      if (ownSectionEl) hardenIcons(ownSectionEl);

      const connected = !!(ownSectionEl && document.contains(ownSectionEl));
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (panel.classList.contains("fpm-open")) {
      renderPanelGrid();
      renderPanelHistory();
    }
    syncOwnSwatches();
    if (area === "sync" && changes.fpm_settings) syncMounted();
  });
})();
