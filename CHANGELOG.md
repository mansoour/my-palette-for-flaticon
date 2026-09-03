# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-09-03

### Changed

- **New custom artwork for the floating toggle button**, replacing the inline palette SVG icon —
  loaded via `chrome.runtime.getURL("icons/my-palette-floating-button-icon-2048.png")` and
  declared web-accessible under the existing `icons/*` entry. The button also picked up the
  project's newly-redesigned icon set (`icons/icon16.png`/`icon48.png`/`icon128.png`, referenced
  unchanged from `manifest.json`, so the new artwork took effect automatically once the files
  were replaced) — plus new `icon32/256/512/1024.png` for future use, and an `icons/github/`
  folder with GitHub-profile branding, excluded from the packaged zip (see Fixed, below) since
  the extension itself never references it.

### Fixed

- **A change in this same 1.1.0 batch briefly reintroduced the exact cascade bug it was
  supposed to be excluded from.** Fixing the icon-geometry bug (below) added
  `:not(svg.fpm-icon, svg.fpm-icon *)` onto the reset's selector — but unlike `:where()`,
  `:not()` is NOT specificity-free: it counts the specificity of its most specific argument,
  which put the whole selector back above a single class and silently undid the earlier
  `:where()` fix for everything else in the file (confirmed with a real render:
  `.fpm-primary-btn`'s background-color was back to browser-default gray). Fixed by wrapping the
  `:not()` clause in its own `:where(...)` too, so every part of the selector — not just the
  outer one — stays at zero specificity.
- **The packaged zip was carrying `icons/github/`'s GitHub-profile/README assets**, which the
  extension itself never references, needlessly bloating the Chrome Web Store upload.
  `scripts/package.sh`/`.ps1` now exclude that folder explicitly.

### Added

- **Bootstrap 5** (self-hosted, MIT licensed, no CDN) now powers the popup and dashboard layout —
  cards, buttons, forms, nav pills, form switches — re-tinted to the extension's teal via CSS
  custom-property overrides rather than a Sass recompile.
- **A custom color picker** (`src/shared/colorpicker.js`) — hue/saturation/lightness sliders plus
  a hex field, no native `<input type="color">` anywhere in the product. Used in the popup, the
  dashboard, the floating panel, and a new popover for the embedded "My Palette" section's "+"
  control (see Fixed, below).
- **A Settings page in the dashboard** to toggle whether the floating palette button shows up on
  Flaticon pages at all, independent of the "My Palette" section embedded in Flaticon's own icon
  editor. Stored in `chrome.storage.sync` under a new `fpm_settings` key.
- **An attribution footer** (`src/shared/footer.js`), shown in the popup, the dashboard, and the
  floating panel: copyright with a dynamic year range, "Built by Mansoour" (linking to
  mansoour.com), and Website/Privacy/Contact links. The source includes a note asking that this
  attribution be kept in redistributed copies — a request, not a technical restriction; the
  project's MIT license does still permit removing it.
- **A central config module** (`src/shared/config.js`) for the extension's real branding: website
  (mansoour.com/mypalette), privacy policy, contact page, support email, and GitHub repo — used
  everywhere those appear instead of duplicated/placeholder values.

### Fixed

- **Adding a new color from the "My Palette" section on Flaticon's icon editor was broken.** The
  "+" control used a native `<input type="color">`, which turned out unreliable there (likely
  some interaction with Flaticon's own page scripts/re-renders). Replaced with a small popover
  built from the new custom color picker — no native color dialog involved at all.
- **The floating toggle button's icon was invisible — root cause finally nailed down.** An
  `!important` fill/display rule (previous entry below) turned out not to be the real fix, since
  the actual problem was a level below fill/color entirely: `all: revert` sets *every* CSS
  property to its initial value, including one almost nobody has a reason to know about — Chrome
  supports a CSS `d` property (`d: path(...)`) alongside the identically-named SVG `d` attribute
  that actually defines a path's shape, and `d`'s initial value is `none`. Reverting it counts as
  an explicit CSS declaration, which (unlike simply not styling `d` at all) always beats the
  presentation attribute — so every icon's `<path>` silently lost its geometry. Confirmed with a
  real render: `path.getBoundingClientRect()` came back `0×0` with the reset applied to icons, and
  correct with it excluded. Fixed by excluding `svg.fpm-icon` and everything inside it from the
  reset entirely (`:not(svg.fpm-icon, svg.fpm-icon *)`) — our icons are fully self-contained
  (fill/viewBox/width/height are all already attributes), so they don't need the reset anyway.
  Also added `hardenIcons()`, which re-applies icon color as an inline `!important` style (reading
  whatever color actually resolved) after every place icons get inserted, as a second, completely
  cascade-independent line of defense.
- **The floating toggle button's icon could render broken/invisible** (superseded by the entry
  above, kept here since the `!important` hardening it introduced is still in place as a second
  line of defense). Hardened `.fpm-icon` with explicit `fill`/`display` rules (`!important`,
  deliberately, to out-rank both our own `all: revert` reset and any conflicting rule from
  Flaticon's own page styles) rather than relying on the SVG's `fill="currentColor"` presentation
  attribute, which an ordinary CSS rule — including our own reset — always wins over.
- **The floating panel and its popovers were rendering almost completely unstyled** (default
  browser buttons/sliders, no layout, no colors) — the actual root cause of the broken icon above
  and of "the styling isn't good" more generally. `#fpm-root, #fpm-root * { all: revert; ... }`
  carries the specificity of one ID (the universal selector contributes nothing), which beats
  every plain single-class rule elsewhere in the file (`.fpm-panel-title`, `.fpm-cp-slider`,
  `.fpm-primary-btn`, ...) regardless of source order — only rules that happened to also use an
  ID (`#fpm-panel`, `#fpm-toggle`) were winning their cascade tie against the reset. Verified with
  a real headless-Chrome render before and after: before the fix, a slider's computed
  `-webkit-appearance` was `auto` and a button's computed `background-color` was the browser
  default gray, despite explicit rules saying otherwise. Fixed by wrapping the reset's selector
  in `:where(...)`, which keeps the identical reset behavior at zero added specificity, so it can
  never fight the file's own styling again.

### Changed

- **Saved colors now live in their own "My Palette" section on the icon editor**, inserted right
  before Flaticon's own "History" label, instead of being mixed into Flaticon's
  `#last-icon-colors` list. Reads far more clearly as a distinct feature rather than looking like
  part of Flaticon's own (transient) history.
- **Applying a saved color now actually works on the very first click, without relying on
  Flaticon's own picker having been used first.** The previous fix opened/set/closed Flaticon's
  Pickr field in one synchronous call to avoid a visible popup flash — but that turned out to be
  *faster* than Pickr's own opening sequence (positioning, wiring its change handling) could
  complete, so it silently did nothing the first time; it only ever appeared to work afterwards
  because a real, slower manual pick had already finished that one-time setup. `applyHexViaPickr`
  now waits briefly after opening and again after dispatching the change, and verifies the icon's
  active color actually updated before reporting success — a small, real (not simulated-away)
  open/close of the popup, but the trade-off needed for it to reliably work every time.
- **All emoji and text-glyph icons (🎨 ⭐ 🟢 ⚪ 🗑 ★ ☆ ↗ ×) replaced with real inline SVG icons**
  from [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT licensed), embedded locally in a
  new `src/shared/icons.js` — no CDN, no runtime fetch, consistent with the "nothing leaves your
  browser" privacy stance.
- **Redesigned the in-page floating panel** (toggle button + popover) with a more modern look:
  refined shadows, spacing, hover/focus states, a status pill with a real dot indicator instead
  of ⚪/🟢, a small live-connection badge on the toggle button itself, and smooth open/close
  transitions.

### Fixed

- **The floating "My Palette" panel on Flaticon pages wouldn't close.** It was toggled via the
  `hidden` attribute/property, at the mercy of how our aggressive `all: revert` reset interacted
  with the host page. It's now driven by a dedicated CSS class or a real `display`/`opacity`
  toggle, plus outside-click and Escape-key handling like any modern popover — clicking the ✕,
  clicking elsewhere on the page, or pressing Escape now all close it reliably.
- **A saved color could still occasionally get duplicated in the embedded History list on
  click.** Hardened `syncOwnSwatches` with a small mutex so the several near-simultaneous callers
  a single click can trigger (a storage-change event, a DOM-mutation callback, ...) can't
  interleave, and dropped a redundant synthetic `keyup` (Enter) event dispatch that may have been
  causing Flaticon to commit the same color twice.
- **Saved palette colors didn't apply to the icon when clicked, only ones picked with
  Flaticon's own picker did.** Testing showed Flaticon must bind its recolor logic per-button
  at creation time (or otherwise scope it to elements it made itself) — a `<li><button>` we
  insert into `#last-icon-colors` from outside never gets that binding, even though it's visually
  identical. Clicking a saved color now instead drives Flaticon's own Pickr hex field
  (`#icon-edit-color-picker .pcr-result`) with the same events a real user typing into it would
  fire — a genuine Flaticon-bound element, confirmed working since it's exactly what "Choose a
  new color" uses.
- **A clicked saved color could get silently duplicated in the History list.** Ownership of our
  injected `<li>` elements was tracked via a CSS class and a `data-fpm-own` attribute — but
  Flaticon's editor turns out to run some generic handling over every list item (observed
  stripping that class/attribute off a clicked entry), which made the sync logic think a
  still-present element was gone and re-insert a duplicate. Ownership is now tracked with a
  `WeakSet` of the actual DOM elements, which attribute stripping can't affect.
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
