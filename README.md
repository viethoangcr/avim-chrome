# AVIM Vietnamese IME

A Vietnamese input method editor (IME) extension for Google Chrome
(Manifest V3). It supports the Telex, VNI, VIQR and VIQR* input methods,
selectable from the popup, with an optional spell check and old-accent
handling. Typing is processed locally in page inputs; the extension
collects no user data and declares only the static `storage` permission
plus HTTP(S) content-script matches.

This is a modified, independently maintained fork of the avim-chrome
extension by Nguyen Kim Kha, which is based on the AVIM engine by
Hieu Tran Dang. The upstream authors do not maintain and do not endorse
this release.

## Install

- Chrome Web Store listing: **AVIM Vietnamese IME** (version 0.1.0).
  The new listing has a new Store extension ID; preferences from the old
  extension cannot and do not migrate.
- For development: open `chrome://extensions`, enable Developer mode,
  and "Load unpacked" the `build/` directory produced by the build
  below.

## Build and test

Requires Node.js 22 and npm 10.

    npm ci
    npm run lint
    npm test
    npm run build

The build writes the unpacked extension to `build/` and a single Store
ZIP to `dist/avim-vietnamese-ime-0.1.0.zip` containing the manifest,
locales, icons, popup, worker, `LICENSE` and `NOTICE`.

## Source and license

- Repository and corresponding source:
  https://github.com/viethoangcr/avim-chrome
- Issues and support:
  https://github.com/viethoangcr/avim-chrome/issues

Licensed under GPLv3 — see `LICENSE`. Fork and attribution details are
in `NOTICE`.

## Limits

- Works on HTTP(S) pages only, via static content scripts; protected
  browser pages and `file:` pages without a user grant are not
  supported.
- The popup demo input is a local demonstration of the engine only.
