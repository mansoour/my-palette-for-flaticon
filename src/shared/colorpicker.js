/**
 * A small, fully self-contained color picker: a hue slider, a saturation slider, a lightness
 * slider, a hex text field, and a live preview swatch. No native `<input type="color">` anywhere.
 *
 * Why not the native color input: it opens a native OS/browser dialog, which (a) closes an
 * extension action-popup immediately, since that dialog stealing focus counts as the popup
 * losing focus, and (b) turned out unreliable when embedded inside Flaticon's own editor page —
 * likely some interaction between that dialog and Flaticon's own page scripts/mutation-driven
 * re-renders. Plain `<input type="range">` sliders have neither problem: no native popup, no
 * focus-loss, nothing for a host page to interfere with.
 */
const FPMColorPicker = (function () {
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function normalizeHex(v) {
    return window.FlaticonPaletteStorage ? window.FlaticonPaletteStorage.normalizeHex(v) : null;
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) =>
      Math.round(clamp(x, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r:
          h = ((g - b) / d) % 6;
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  /**
   * Build the picker inside `container`. Options:
   *   initial  - starting hex color
   *   onChange - called with the current hex value on every change
   * Returns { getValue(), setValue(hex), focusHex() }.
   */
  function create(container, opts = {}) {
    const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
    let value = normalizeHex(opts.initial) || "#12a17d";

    container.classList.add("fpm-cp");
    container.innerHTML = `
      <div class="fpm-cp-top">
        <span class="fpm-cp-preview"></span>
        <input type="text" class="fpm-cp-hex" maxlength="7" spellcheck="false" aria-label="Hex value" />
      </div>
      <label class="fpm-cp-label">Hue</label>
      <input type="range" class="fpm-cp-slider fpm-cp-hue" min="0" max="360" step="1" aria-label="Hue" />
      <label class="fpm-cp-label">Saturation</label>
      <input type="range" class="fpm-cp-slider fpm-cp-sat" min="0" max="100" step="1" aria-label="Saturation" />
      <label class="fpm-cp-label">Lightness</label>
      <input type="range" class="fpm-cp-slider fpm-cp-light" min="0" max="100" step="1" aria-label="Lightness" />
    `;

    const els = {
      preview: container.querySelector(".fpm-cp-preview"),
      hex: container.querySelector(".fpm-cp-hex"),
      h: container.querySelector(".fpm-cp-hue"),
      s: container.querySelector(".fpm-cp-sat"),
      l: container.querySelector(".fpm-cp-light"),
    };

    function paintTracks(h, s) {
      els.s.style.setProperty("--fpm-cp-h", h);
      els.l.style.setProperty("--fpm-cp-h", h);
      els.l.style.setProperty("--fpm-cp-s", s + "%");
    }

    function applyHex(hex, { fromSliders = false } = {}) {
      value = hex;
      els.preview.style.background = hex;
      els.hex.value = hex;
      if (!fromSliders) {
        const [h, s, l] = hexToHsl(hex);
        els.h.value = h;
        els.s.value = s;
        els.l.value = l;
      }
      paintTracks(els.h.value, els.s.value);
      onChange(value);
    }

    function fromSliders() {
      const hex = hslToHex(Number(els.h.value), Number(els.s.value), Number(els.l.value));
      applyHex(hex, { fromSliders: true });
    }

    els.h.addEventListener("input", fromSliders);
    els.s.addEventListener("input", fromSliders);
    els.l.addEventListener("input", fromSliders);
    els.hex.addEventListener("input", () => {
      const clean = normalizeHex(els.hex.value);
      if (clean) applyHex(clean);
    });
    els.hex.addEventListener("blur", () => (els.hex.value = value));

    applyHex(value);

    return {
      getValue: () => value,
      setValue: (hex) => {
        const clean = normalizeHex(hex);
        if (clean) applyHex(clean);
      },
      focusHex: () => els.hex.focus(),
    };
  }

  return { create, hslToHex, hexToHsl };
})();

if (typeof window !== "undefined") {
  window.FPMColorPicker = FPMColorPicker;
}
if (typeof module !== "undefined") {
  module.exports = FPMColorPicker;
}
