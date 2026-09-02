(async function () {
  const els = {
    addForm: document.getElementById("addForm"),
    addPreview: document.getElementById("addPreview"),
    addHexInput: document.getElementById("addHexInput"),
    addError: document.getElementById("addError"),
    openDashboardInline: document.getElementById("openDashboardInline"),
    paletteGrid: document.getElementById("paletteGrid"),
    paletteCount: document.getElementById("paletteCount"),
    paletteEmpty: document.getElementById("paletteEmpty"),
    historyList: document.getElementById("historyList"),
    historyEmpty: document.getElementById("historyEmpty"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    openDashboard: document.getElementById("openDashboard"),
    toast: document.getElementById("toast"),
  };

  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 1600);
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
    "flaticon-picker": "Flaticon",
    "dashboard": "Added",
    "applied-to-icon": "Applied",
    unknown: "",
  };

  async function renderPalette() {
    const list = await FlaticonPaletteStorage.getPalette();
    els.paletteCount.textContent = String(list.length);
    els.paletteEmpty.hidden = list.length > 0;
    els.paletteGrid.innerHTML = "";
    list.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "swatch";
      btn.style.background = c.hex;
      btn.title = c.name ? `${c.name} — ${c.hex} (click to copy)` : `${c.hex} (click to copy)`;
      btn.addEventListener("click", async () => {
        const ok = await copyToClipboard(c.hex);
        showToast(ok ? `Copied ${c.hex}` : c.hex);
      });

      const removeX = document.createElement("span");
      removeX.className = "remove-x";
      removeX.textContent = "×";
      removeX.title = "Remove from palette";
      removeX.addEventListener("click", async (e) => {
        e.stopPropagation();
        await FlaticonPaletteStorage.removeColor(c.id);
        renderPalette();
      });
      btn.appendChild(removeX);

      els.paletteGrid.appendChild(btn);
    });
  }

  async function renderHistory() {
    const list = (await FlaticonPaletteStorage.getHistory()).slice(0, 10);
    els.historyEmpty.hidden = list.length > 0;
    els.historyList.innerHTML = "";
    const palette = await FlaticonPaletteStorage.getPalette();
    const paletteHexes = new Set(palette.map((c) => c.hex));

    list.forEach((h) => {
      const row = document.createElement("div");
      row.className = "history-row";

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

      const tag = document.createElement("span");
      tag.className = "source-tag";
      tag.textContent = SOURCE_LABEL[h.source] || "";
      tag.title = timeAgo(h.timestamp) + (h.pageTitle ? " · " + h.pageTitle : "");

      const saveBtn = document.createElement("button");
      saveBtn.className = "save-btn";
      const alreadySaved = paletteHexes.has(h.hex);
      saveBtn.textContent = alreadySaved ? "★" : "☆";
      saveBtn.title = alreadySaved ? "Already in your palette" : "Save to palette";
      saveBtn.disabled = alreadySaved;
      saveBtn.addEventListener("click", async () => {
        await FlaticonPaletteStorage.addColor(h.hex, "", "silent");
        renderPalette();
        renderHistory();
        showToast(`Saved ${h.hex}`);
      });

      row.append(dot, hex, tag, saveBtn);
      els.historyList.appendChild(row);
    });
  }

  // Note: deliberately a plain text field, not <input type="color"> — opening that native
  // color-picker dialog steals focus from this popup, which Chrome treats as a blur and closes
  // the popup before a color can be picked. See CHANGELOG.md.
  els.addHexInput.addEventListener("input", () => {
    const clean = FlaticonPaletteStorage.normalizeHex(els.addHexInput.value);
    els.addPreview.style.background = clean || "transparent";
  });

  els.addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.addError.hidden = true;
    const clean = FlaticonPaletteStorage.normalizeHex(els.addHexInput.value);
    if (!clean) {
      els.addError.textContent = "Enter a valid hex color, e.g. #12A17D";
      els.addError.hidden = false;
      return;
    }
    const { isNew } = await FlaticonPaletteStorage.addColor(clean, "", "dashboard");
    els.addHexInput.value = "";
    els.addPreview.style.background = "transparent";
    await renderPalette();
    await renderHistory();
    showToast(isNew ? `Added ${clean}` : `${clean} already saved`);
  });

  els.openDashboardInline.addEventListener("click", () => chrome.runtime.openOptionsPage());

  els.clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("Clear all color history? This can't be undone.")) return;
    await FlaticonPaletteStorage.clearHistory();
    renderHistory();
  });

  els.openDashboard.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener(() => {
    renderPalette();
    renderHistory();
  });

  renderPalette();
  renderHistory();
})();
