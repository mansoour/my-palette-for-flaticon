# Chrome Web Store Listing — My Palette for Flaticon

Copy-paste reference for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
listing form, plus the submission checklist.

## Store title

```
My Palette for Flaticon — Free Custom Colors
```
(45 char limit — this is 44)

## Summary (132 char limit)

```
Save unlimited custom color palettes for Flaticon icons, free. Auto-tracks your color history as you browse and edit icons.
```

## Description

```
My Palette for Flaticon adds the one feature Flaticon locks behind a paid plan — a reusable
custom color palette — and makes it completely free.

WHAT IT DOES
• Save unlimited colors to your own personal palette.
• A small palette button appears on every Flaticon page, so your colors are always one click
  away while you browse or edit icons.
• Every color you use is automatically saved to your history, with a timestamp and a link back
  to the icon it came from.
• When you pick a color using Flaticon's own color tool, this extension quietly saves it to your
  history too — so you never lose a color you liked.
• A full dashboard lets you manage your whole palette: add, rename, reorder, delete, search your
  history, export/import everything as a JSON backup, and toggle the floating button on or off.
• A built-in custom color picker (hue/saturation/lightness sliders) everywhere you add a color —
  no clunky native color-picker dialogs.

WHY
Flaticon's built-in editor lets you recolor icons, but saving a named, reusable color palette is
a "Custom palette" feature reserved for paying subscribers. This extension gives you that same
convenience for free, using nothing but your own browser's storage — no account, no server, no
subscription.

PRIVACY FIRST
Everything is stored locally in your browser with Chrome's built-in storage APIs. There is no
backend, no analytics, and no tracking. Nothing you save is ever sent anywhere. Full privacy
policy: https://github.com/mansoour/my-palette-for-flaticon/blob/main/PRIVACY_POLICY.md

HOW TO USE
1. Click the extension icon to open the popup, or the palette button that appears on
   flaticon.com, and add a few colors to your palette.
2. Open any Flaticon icon page (e.g. flaticon.com/free-icon/degree_4011018) and click the same
   palette button — your palette and recent history are right there.
3. On the icon editor, your saved colors also show up in their own "My Palette" section, right
   above Flaticon's "History" — click one to apply it to the icon.
4. Open the full dashboard any time from the popup for palette management, history, and backups.

This is an independent, unofficial project and is not affiliated with, endorsed by, or connected
to Flaticon or Freepik Company.

Open source (MIT licensed) — contributions welcome:
https://github.com/mansoour/my-palette-for-flaticon
```

## Category

`Productivity` (alternatively `Tools`)

## Language

English

## Screenshots (1280×800 or 640×400, up to 5)

Captured and in place under `store/screenshots/` (also shown in [README.md](../README.md)):

1. `01-build-your-palette.png` — building a palette in the full dashboard.
2. `02-color-history.png` — the dashboard's automatic color history.
3. `03-floating-palette.png` — the floating palette panel open on a real Flaticon page.
4. `04-one-click-apply.png` — one-click apply from the "My Palette" section on the icon editor.
5. `05-toolbar-popup.png` — the toolbar popup.

## Promo tile images (optional but recommended)

- Small promo tile: 440×280 → `store/promo-tile-440x280.png`
- Marquee promo tile: 1400×560 → `store/promo-marquee-1400x560.png`

Use `store/icon-512.png` (generated in this repo) as the base mark for these.

## Store icon

`icons/icon128.png` (128×128, already included in the package).

## Privacy practices tab (Chrome Web Store "Privacy" section)

- **Single purpose description:** "Lets users save custom color palettes and view color history
  for use on Flaticon.com icon pages."
- **Permission justifications:**
  - `storage` — "Used to save the user's color palette and color history locally/synced via
    Chrome storage. No data is transmitted anywhere."
  - Host permission `https://www.flaticon.com/*` — "Needed to show the palette panel on Flaticon
    pages and detect colors picked with Flaticon's own color tool. The extension does not run on
    or access any other site."
- **Data usage disclosure:** Select "This item does not collect or use user data" if the form
  allows a single choice covering locally-stored, non-transmitted data; otherwise disclose
  "Website content" (color/text you add) as collected but **not sold, not used for advertising,
  not transferred off-device except via the user's own Chrome Sync.**
- Link to `PRIVACY_POLICY.md` (raw GitHub URL or a hosted copy) in the "Privacy policy URL" field.

## Submission checklist

- [x] GitHub repo, support email, website, privacy, and contact links are all set to their real
      values (see `src/shared/config.js`, `manifest.json`, `PRIVACY_POLICY.md`).
- [x] Bump `version` in `manifest.json` if this isn't the first submission.
- [x] Run `scripts/package.sh` (or `.ps1`) to build the upload zip.
- [x] Take real screenshots per the list above and drop them in `store/screenshots/`.
- [x] Host `PRIVACY_POLICY.md` somewhere with a stable public URL (GitHub renders it fine) and
      paste that URL into the listing's Privacy Policy field.
- [x] Fill in the Developer Dashboard's Privacy Practices tab using the justifications above.
- [x] Submit for review.

> **Status: submitted, awaiting Google's review.** Not yet published on the Chrome Web Store.
> Once it's live, the listing URL gets linked from README.md's "Install" section and from
> `src/shared/config.js`'s `homepageUrl`-adjacent links. Any change requiring a re-submission
> (a new zip) should bump `version` in `manifest.json` again and add a new `CHANGELOG.md` entry
> first.
