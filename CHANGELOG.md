# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-09-02

### Added

- Initial release.
- Floating 🎨 palette panel injected on every `flaticon.com` page: add colors, browse your
  saved palette, and view recent history without leaving the page.
- Toolbar popup for quick add / quick access, with a badge showing the number of saved colors.
- Full dashboard (options page): add/rename/reorder/delete palette colors, browse and search
  history, clear history, export/import as JSON.
- Automatic history capture: colors applied from the extension are logged, and colors picked
  with Flaticon's own color tool are detected (best effort) and logged too.
- Best-effort integration with Flaticon's icon color editor: mirrors Flaticon's own "History"
  swatches, listens to any native color-picker input, and injects a "⭐ My Palette (free)" box
  next to Flaticon's paid-only "Custom palette" feature.
- Shared `chrome.storage` wrapper (`src/shared/storage.js`) used by the popup, dashboard, and
  content script; palette synced via `chrome.storage.sync`, history kept in
  `chrome.storage.local`.
- Documentation: README, privacy policy, Chrome Web Store listing copy, contributing guide.
