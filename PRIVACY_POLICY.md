# Privacy Policy — My Palette for Flaticon

_Last updated: 2026-09-02_

**My Palette for Flaticon** ("the extension") is a free, independent browser extension. It is
**not affiliated with Flaticon or Freepik Company**.

## Summary

- We do not collect, transmit, sell, or share any of your data.
- There is no backend server. The extension never makes a network request of its own.
- Everything you save (your color palette and color history) is stored only in your browser,
  using the standard Chrome `storage` API.

## What data the extension stores, and where

| Data | What it contains | Where it's stored | Purpose |
|---|---|---|---|
| Palette | The hex colors you save, an optional name, and when you added them | `chrome.storage.sync` (syncs across your own signed-in Chrome browsers, via your Google account — this is standard Chrome behavior, not something the extension itself transmits) | Show your saved colors in the popup, dashboard, and on Flaticon pages |
| History | Colors you applied or that were detected from Flaticon's own color picker, the Flaticon page URL/title they came from, and a timestamp | `chrome.storage.local` (this device only) | Let you look back at and re-save recently used colors |
| First-run flag | A boolean marking whether you've seen the welcome screen | `chrome.storage.local` | Show the welcome banner only once |

None of this data is visible to us (the developers), to Flaticon, or to any third party. It never
leaves your browser except through Chrome's own built-in sync mechanism, which is controlled by
your Google account settings, not by this extension.

## Permissions we request, and why

- **`storage`** — to save your palette and history as described above.
- **Host permission for `https://www.flaticon.com/*`** — so the content script can show the
  floating palette panel and (best-effort) detect colors picked with Flaticon's own color tool.
  The extension does not run on, or request access to, any other website.

The extension does **not** request access to your browsing history, cookies, tabs on other
sites, or any personally identifiable information.

## Data retention and deletion

- You can delete individual colors or history entries, or clear your entire history, at any time
  from the dashboard.
- Uninstalling the extension removes all of its locally stored data from your device. Data that
  was synced via `chrome.storage.sync` follows Chrome's own sync data lifecycle and Google
  Account settings.

## Third parties

This extension does not integrate any analytics, advertising, or tracking SDKs, and does not
communicate with any server operated by us or anyone else.

## Changes to this policy

If this policy changes, the updated version will be posted in this file in the extension's
GitHub repository, with a new "Last updated" date.

## Contact

Questions about this policy or the extension's data handling can be sent to:
**your-support-email@example.com** (replace with the contact address you want public), or opened
as an issue on the
[GitHub repository](https://github.com/your-github-username/flaticon-custom-color-palette-managment).
