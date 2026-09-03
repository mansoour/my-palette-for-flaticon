(async function () {
  const els = {
    welcomeBanner: document.getElementById("welcomeBanner"),
    dismissWelcome: document.getElementById("dismissWelcome"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    addColorPicker: document.getElementById("addColorPicker"),
    addColorBtn: document.getElementById("addColorBtn"),
    addNameInput: document.getElementById("addNameInput"),
    addError: document.getElementById("addError"),
    paletteGrid: document.getElementById("paletteGrid"),
    paletteCount: document.getElementById("paletteCount"),
    paletteEmpty: document.getElementById("paletteEmpty"),
    historyTable: document.getElementById("historyTable"),
    historyCount: document.getElementById("historyCount"),
    historyEmpty: document.getElementById("historyEmpty"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    toast: document.getElementById("toast"),
    footer: document.getElementById("fpmFooter"),
    tabs: document.getElementById("fpmTabs"),
    settingShowPanel: document.getElementById("settingShowPanel"),
    githubLink: document.getElementById("githubLink"),
    privacyLinkSettings: document.getElementById("privacyLinkSettings"),
    contactLinkSettings: document.getElementById("contactLinkSettings"),
  };

  FPMFooter.mount(els.footer);
  els.githubLink.href = FPM_CONFIG.githubUrl;
  els.privacyLinkSettings.href = FPM_CONFIG.privacyUrl;
  els.contactLinkSettings.href = FPM_CONFIG.contactUrl;

  const params = new URLSearchParams(location.search);
  if (params.get("welcome") === "1") {
    els.welcomeBanner.hidden = false;
  }
  els.dismissWelcome.addEventListener("click", () => (els.welcomeBanner.hidden = true));

  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 1800);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  const SOURCE_LABEL = {
    "flaticon-picker": "Flaticon picker",
    dashboard: "Added manually",
    "applied-to-icon": "Applied to icon",
    unknown: "Unknown",
  };

  // ---------- Tabs ----------

  els.tabs.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.tabs.querySelectorAll(".nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".fpm-tab-pane").forEach((pane) => {
        pane.hidden = pane.id !== `tab-${btn.dataset.tab}`;
      });
    });
  });

  // ---------- Settings ----------

  async function loadSettings() {
    const settings = await FlaticonPaletteStorage.getSettings();
    els.settingShowPanel.checked = settings.showFloatingPanel !== false;
  }

  els.settingShowPanel.addEventListener("change", async () => {
    await FlaticonPaletteStorage.updateSettings({ showFloatingPanel: els.settingShowPanel.checked });
    showToast(els.settingShowPanel.checked ? "Floating panel enabled" : "Floating panel disabled");
  });

  loadSettings();

  // ---------- Palette ----------

  let dragSrcId = null;

  async function renderPalette() {
    const list = await FlaticonPaletteStorage.getPalette();
    els.paletteCount.textContent = `${list.length} color${list.length === 1 ? "" : "s"}`;
    els.paletteEmpty.hidden = list.length > 0;
    els.paletteGrid.innerHTML = "";

    list.forEach((c) => {
      const item = document.createElement("div");
      item.className = "fpm-palette-item";
      item.draggable = true;
      item.dataset.id = c.id;

      item.addEventListener("dragstart", () => {
        dragSrcId = c.id;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", async (e) => {
        e.preventDefault();
        if (!dragSrcId || dragSrcId === c.id) return;
        const ids = Array.from(els.paletteGrid.children).map((n) => n.dataset.id);
        const from = ids.indexOf(dragSrcId);
        const to = ids.indexOf(c.id);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await FlaticonPaletteStorage.reorderPalette(ids);
        renderPalette();
      });

      const swatch = document.createElement("button");
      swatch.className = "swatch";
      swatch.style.background = c.hex;
      swatch.title = "Click to copy " + c.hex;
      swatch.addEventListener("click", async () => {
        const ok = await copyToClipboard(c.hex);
        showToast(ok ? `Copied ${c.hex}` : c.hex);
      });

      const removeX = document.createElement("span");
      removeX.className = "remove-x";
      removeX.appendChild(FPMIcons.create("x-lg", { size: 10 }));
      removeX.title = "Remove";
      removeX.addEventListener("click", async () => {
        await FlaticonPaletteStorage.removeColor(c.id);
        renderPalette();
      });
      swatch.appendChild(removeX);

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = c.name || c.hex;
      label.title = "Click to rename";
      label.addEventListener("click", async () => {
        const next = prompt("Name for " + c.hex, c.name || "");
        if (next === null) return;
        await FlaticonPaletteStorage.updateColor(c.id, { name: next.trim() });
        renderPalette();
      });

      item.append(swatch, label);
      els.paletteGrid.appendChild(item);
    });
  }

  const picker = FPMColorPicker.create(els.addColorPicker, { initial: "#12a17d" });

  els.addColorBtn.addEventListener("click", async () => {
    els.addError.hidden = true;
    const clean = FlaticonPaletteStorage.normalizeHex(picker.getValue());
    if (!clean) {
      els.addError.textContent = "Enter a valid hex color, e.g. #12A17D";
      els.addError.hidden = false;
      return;
    }
    const { isNew } = await FlaticonPaletteStorage.addColor(clean, els.addNameInput.value.trim(), "dashboard");
    els.addNameInput.value = "";
    await renderPalette();
    showToast(isNew ? `Added ${clean} to your palette` : `${clean} is already in your palette`);
  });

  // ---------- History ----------

  async function renderHistory() {
    const list = await FlaticonPaletteStorage.getHistory();
    els.historyCount.textContent = `${list.length} entr${list.length === 1 ? "y" : "ies"}`;
    els.historyEmpty.hidden = list.length > 0;
    els.historyTable.innerHTML = "";
    const palette = await FlaticonPaletteStorage.getPalette();
    const paletteHexes = new Set(palette.map((c) => c.hex));

    list.forEach((h) => {
      const row = document.createElement("div");
      row.className = "fpm-history-row";

      const dot = document.createElement("span");
      dot.className = "swatch-dot";
      dot.style.background = h.hex;
      dot.title = "Copy " + h.hex;
      dot.addEventListener("click", async () => {
        const ok = await copyToClipboard(h.hex);
        showToast(ok ? `Copied ${h.hex}` : h.hex);
      });

      const hex = document.createElement("span");
      hex.className = "hex";
      hex.textContent = h.hex;

      let pageCell;
      if (h.pageUrl) {
        pageCell = document.createElement("a");
        pageCell.className = "page-link";
        pageCell.href = h.pageUrl;
        pageCell.target = "_blank";
        pageCell.rel = "noopener";
        pageCell.textContent = h.pageTitle || h.pageUrl;
      } else {
        pageCell = document.createElement("span");
        pageCell.className = "page-link";
        pageCell.textContent = "—";
      }

      const tag = document.createElement("span");
      tag.className = "source-tag";
      tag.textContent = SOURCE_LABEL[h.source] || h.source || "";

      const time = document.createElement("span");
      time.className = "time";
      time.textContent = timeAgo(h.timestamp);

      const actions = document.createElement("div");
      actions.className = "row-actions";

      const saveBtn = document.createElement("button");
      const alreadySaved = paletteHexes.has(h.hex);
      saveBtn.appendChild(FPMIcons.create(alreadySaved ? "star-fill" : "star", { size: 14 }));
      saveBtn.title = alreadySaved ? "Already in your palette" : "Save to palette";
      saveBtn.disabled = alreadySaved;
      saveBtn.addEventListener("click", async () => {
        await FlaticonPaletteStorage.addColor(h.hex, "", "silent");
        renderPalette();
        renderHistory();
        showToast(`Saved ${h.hex}`);
      });

      const delBtn = document.createElement("button");
      delBtn.appendChild(FPMIcons.create("trash3", { size: 14 }));
      delBtn.title = "Delete entry";
      delBtn.addEventListener("click", async () => {
        await FlaticonPaletteStorage.removeHistoryEntry(h.id);
        renderHistory();
      });

      actions.append(saveBtn, delBtn);
      row.append(dot, hex, pageCell, tag, time, actions);
      els.historyTable.appendChild(row);
    });
  }

  els.clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("Clear all color history? This can't be undone.")) return;
    await FlaticonPaletteStorage.clearHistory();
    renderHistory();
  });

  // ---------- Import / Export ----------

  els.exportBtn.addEventListener("click", async () => {
    const data = await FlaticonPaletteStorage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-palette-for-flaticon-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  els.importInput.addEventListener("change", async () => {
    const file = els.importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await FlaticonPaletteStorage.importAll(data, { merge: true });
      await renderPalette();
      await renderHistory();
      showToast("Import complete");
    } catch (err) {
      alert("Could not import file: " + err.message);
    } finally {
      els.importInput.value = "";
    }
  });

  chrome.storage.onChanged.addListener(() => {
    renderPalette();
    renderHistory();
  });

  renderPalette();
  renderHistory();
})();
