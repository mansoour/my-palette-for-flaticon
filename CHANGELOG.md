# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- **`Uncaught TypeError: Cannot read properties of undefined (reading 'getPalette'/'getHistory')`
  on every Flaticon page.** `storage.js` declares `const FlaticonPaletteStorage = (...)()` at the
  top level; a top-level `const`/`let` is only a global *binding* (visible as a bare identifier
  to other classic scripts sharing the same scope — how `popup.js`/`dashboard.js` already used
  it), not a `window` property the way `var`/function declarations are. `content.js` referenced
  `window.FlaticonPaletteStorage` everywhere, which was therefore always `undefined`. Fixed by
  explicitly assigning `window.FlaticonPaletteStorage = FlaticonPaletteStorage` at the end of
  `storage.js`.
- **Colors picked with Flaticon's own color tool weren't being captured.** The capture logic
  only watched for *new* `<li>` elements being added to `#last-icon-colors`, but Flaticon
  actually keeps a single node there and updates its `data-actual`/`style` attributes in place
  (hence the singular id). Added an attribute-level `MutationObserver` across the whole colors
  panel — covering swatch buttons and Pickr's palette drag-handle specifically (excluding its hue
  and opacity handles, which share the same CSS class but don't reflect the real color) — plus a
  plain `input`/`change` listener on Pickr's hex text field, which changes a live DOM property
  no attribute observer can see. Slider drags are debounced so history isn't flooded with every
  intermediate frame.
- **Adding a color from the toolbar popup silently did nothing.** The popup used a native
  `<input type="color">`; opening its OS color dialog moves focus away from the extension popup,
  which Chrome treats as the popup losing focus and closes it before a color can be picked. The
  popup's "Add a color" control is now a plain hex text field with a live swatch preview — the
  dashboard and the in-page floating panel keep their color-wheel inputs, since those aren't
  action popups and aren't affected.

## [1.0.0] — 2026-09-02

### Added

- Floating 🎨 palette panel injected on every `flaticon.com` page: add colors, browse your
  saved palette, copy any color to the clipboard, and view recent history without leaving the
  page.
- **Embedded integration with Flaticon's own icon editor.** Flaticon renders both "Select a
  color from the icon" and "History" as `<ul class="colors">` lists of
  `<li class="color"><button data-actual="#hex" style="background:#hex"></button></li>`
  elements (`#svg-icon-colors` / `#last-icon-colors`); clicking a swatch inside
  `#last-icon-colors` re-applies that color to the icon via Flaticon's own click handling. This
  extension inserts one real, matching `<li>` per saved palette color directly into
  `#last-icon-colors` (ringed to stand out), plus a dashed "+" swatch to save a new color on the
  spot — so clicking your colors there recolors the icon exactly like a native history entry,
  with no simulated events. It also mirrors every *new* color Flaticon itself adds to that list
  (from an icon-color click or its Pickr-based "Choose a new color" wheel) into this extension's
  persistent history, so it survives page reloads instead of vanishing with Flaticon's own
  in-memory, per-visit history.
- Toolbar popup for quick add / quick access, with a badge showing the number of saved colors.
- Full dashboard (options page): add/rename/reorder/delete palette colors, browse and search
  history, clear history, export/import as JSON.
- Shared `chrome.storage` wrapper (`src/shared/storage.js`) used by the popup, dashboard, and
  content script; palette synced via `chrome.storage.sync`, history kept in
  `chrome.storage.local`.
- Documentation: README, privacy policy, Chrome Web Store listing copy, contributing guide.
