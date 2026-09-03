# Contributing

Thanks for considering a contribution to **My Palette for Flaticon**! This is a small, plain
HTML/CSS/JS Chrome extension — no build tooling, no dependencies.

## Getting set up

1. Clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the
   project folder.
3. Make your changes, then click the refresh icon on the extension card in `chrome://extensions`.
4. Reload any open Flaticon tab to pick up content-script changes.

There's no bundler and no test suite to run — this keeps the review surface small, which matters
for both GitHub review and Chrome Web Store review. Please keep new code dependency-free unless
there's a strong reason not to (and discuss it in an issue first).

## Where things live

- `src/shared/storage.js` — the only place that talks to `chrome.storage`. Add new
  read/write helpers here rather than calling `chrome.storage` directly from UI code.
- `src/content/content.js` — everything that runs on `flaticon.com` pages. See the big comment
  at the top of the file for the "layer 1 (floating panel) / layer 2 (editor integration)" split.
- `src/popup/`, `src/dashboard/` — UI surfaces. Each is a plain `.html` + `.js` + `.css` trio.

## Reporting a broken Flaticon integration

The "layer 2" integration (auto-detecting Flaticon's own color history, injecting a palette box
next to their "Custom palette" feature) depends on Flaticon's live page markup, which can change
without notice. If the floating panel's status line stops showing "🟢 Connected to Flaticon's
color editor" on an icon page where you'd expect it to:

1. Open an issue with the icon page URL you tested on.
2. If you can, right-click the "History" section in Flaticon's editor → **Inspect** → copy the
   relevant HTML snippet into the issue. That's the fastest way to get the selectors updated.

Because layer 2 is best-effort by design, a broken integration is a bug worth fixing, but it
should never take down layer 1 — if you find a change that lets a layer-2 failure break the
floating panel, that's a higher-priority bug.

## Style

- Vanilla JS, no frameworks. Prefer small, named functions over large inline callbacks.
- Use `textContent`, not `innerHTML`, for anything derived from page or user data.
- Wrap any code that reads Flaticon's DOM in `try/catch` — see `content.js` for the pattern.

## Submitting changes

1. Fork the repo and create a branch off `main`.
2. Keep PRs focused — one feature or fix per PR.
3. Update `CHANGELOG.md` under an "Unreleased" heading.
4. Open a pull request describing what changed and why, and how you tested it (which Chrome
   version, which Flaticon page).

## Reporting security issues

Please don't open a public issue for a security concern. Email
**me@mansoour.com** instead (see `PRIVACY_POLICY.md` for the current contact).
