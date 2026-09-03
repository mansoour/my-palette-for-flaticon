# My Palette for Flaticon 🎨

A free, open-source Chrome extension that gives [Flaticon](https://www.flaticon.com/) users
**unlimited custom color palettes** and **automatic color history** — the "Custom palette"
feature Flaticon otherwise locks behind a paid subscription.

> Not affiliated with, endorsed by, or connected to Flaticon / Freepik Company in any way.
> This is an independent, unofficial browser extension.

## Why

Flaticon's built-in icon editor lets you recolor an icon from the colors already in it, or pick
one new color with a color wheel — but **saving a reusable custom palette is a paid feature**
(you'll see a 👑 next to "Custom palette" in the editor). This extension adds that missing piece
for free, entirely client-side, using your own browser storage.

Example icon page this was built against:
https://www.flaticon.com/free-icon/degree_4011018?related_id=4011018

## Features

- **Unlimited saved colors** — add any hex color to your personal palette from the popup, the
  full dashboard, or directly on a Flaticon icon page.
- **One click on any icon page** — a small floating 🎨 button appears on every flaticon.com page.
  Open it to see your saved palette and recent history without leaving the page.
- **Automatic history** — every color you apply from your palette, and every color you pick with
  Flaticon's *own* color tool, is logged automatically with a timestamp and a link back to the
  icon page it came from.
- **Full dashboard** — a dedicated page (opens from the toolbar icon or the floating panel) to
  manage your whole palette: add, rename, reorder (drag & drop), delete, and browse/search your
  full history.
- **Import / export** — back up or move your palette and history as a single JSON file.
- **Private by design** — everything is stored with the standard `chrome.storage` API
  (`sync` for your palette, `local` for history). Nothing ever leaves your browser; there is no
  backend server. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).
- **Free & open source**, MIT licensed, no ads, no account required.

## How it works

The extension has two layers, so it stays useful even as Flaticon's website evolves:

1. **Guaranteed layer — the floating panel.** A small 🎨 button is injected on every
   `flaticon.com` page. It works completely independently of Flaticon's own markup: add colors,
   browse your palette, copy any color to the clipboard, and see your recent history.
2. **Embedded layer — directly inside Flaticon's own "History" list.** Flaticon's icon editor
   renders the icon's colors, and its "History" of applied colors, as plain lists of
   `<li class="color"><button data-actual="#hex" style="background:#hex"></button></li>`
   elements (`#svg-icon-colors` and `#last-icon-colors`). Clicking a swatch in `#last-icon-colors`
   re-applies that color to the icon — and since Flaticon keeps appending new, clickable entries
   there as you pick colors, that click handling must live on the list itself (or an ancestor),
   not on each individual button. So rather than reverse-engineering Flaticon's recolor logic,
   this extension inserts one real `<li class="color">` per saved palette color directly into
   `#last-icon-colors`, marked with a small teal ring, plus a dashed "+" swatch to save a new
   color on the spot. Clicking one of your colors there reaches Flaticon's own click handling
   exactly like a genuine history entry would, and recolors the icon the normal way — no
   simulated events, no guessing at Flaticon's internals.

   The same list is also how colors are captured: whenever Flaticon adds a *new, non-ours* entry
   to `#last-icon-colors` — whether you clicked one of the icon's own colors or dialed one in
   with Flaticon's "Choose a new color" wheel (a [Pickr](https://github.com/Simonwep/pickr)
   instance) — this extension mirrors that hex into its own history (tagged `Flaticon picker`),
   so it survives page reloads instead of vanishing with Flaticon's own in-memory, per-visit
   history.

Because layer 2 depends on Flaticon's live HTML (selectors captured from flaticon.com in
September 2026) and Flaticon can change that at any time without notice, it is written
defensively (feature-detected, wrapped in `try/catch`, re-scanned on DOM changes, with a text-based
fallback if the `#last-icon-colors` id ever changes) and is allowed to silently do nothing if it
can't find what it's looking for — layer 1 always keeps working. If you notice the panel's status
never switches to "Embedded in Flaticon's History" on an icon page, please open an issue with a
screenshot of the editor's "History" section; selectors may just need an update (see
[CONTRIBUTING.md](CONTRIBUTING.md)).

## Install

### From source (recommended for now)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave, etc.).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
5. Visit any Flaticon icon page and click the 🎨 button in the bottom-right corner.

### From the Chrome Web Store

Once published, the store listing will be linked here. See
[store/STORE_LISTING.md](store/STORE_LISTING.md) for the listing copy and submission checklist.

## Project structure

```
manifest.json                Chrome Manifest V3 config
src/
  background/background.js   Service worker (badge count, opens dashboard)
  content/content.js          Injected on flaticon.com — floating panel + editor integration
  content/content.css
  popup/                      Toolbar popup (quick add / quick access)
  dashboard/                  Full-page palette & history manager (options page)
  shared/storage.js           chrome.storage wrapper shared by all three surfaces
  shared/theme.css            Shared design tokens
icons/                        Extension icons (16/48/128 px)
store/                        Chrome Web Store listing copy, promo assets, screenshots
scripts/                      Packaging helpers for the Web Store zip
```

## Development

No build step — it's plain HTML/CSS/JS, loaded straight into Chrome. To iterate:

1. Make your changes.
2. Go to `chrome://extensions`, find the extension, click the refresh icon.
3. Reload any open Flaticon tab to pick up content-script changes.

To package a zip for the Chrome Web Store:

```sh
bash scripts/package.sh        # or scripts/package.ps1 on Windows PowerShell
```

This produces `dist/my-palette-for-flaticon-<version>.zip`, ready to upload in the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Known limitations

- The embedded History integration targets Flaticon's current `#last-icon-colors` /
  `#svg-icon-colors` / `#icon-edit-color-picker` structure, with a text-based fallback if the ids
  change. It is not guaranteed to work if Flaticon redesigns their editor — the floating panel
  (add / copy / manage colors) always works regardless.
- `chrome.storage.sync` has a small quota, so the palette is capped at 500 colors; history (kept
  in `chrome.storage.local`) is capped at the most recent 200 entries. Use Export to keep a full
  backup.

## Contributing

Bug reports, selector fixes, and feature suggestions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
