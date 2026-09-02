# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/).

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
