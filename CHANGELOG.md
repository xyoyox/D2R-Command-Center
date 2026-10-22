# Changelog

All notable changes to D2R Command Center. This project is a **front-end** for
[Shupershuff's Diablo2RLoader](https://github.com/shupershuff/Diablo2RLoader);
his `D2Loader.ps1` is never modified by any release below.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is
`MAJOR.MINOR` (no patch releases — every change ships as a full zip).

---

## [2.7] — Panel order reversed, account emails hidden by default

### Changed
- **Batch Launch is back on top.** On *Launch & Presets* the panel grid now reads
  Batch Launch → Presets → Batch Load Order. This simply reverses the 2.6 swap.

### Added
- **Accounts email privacy toggle.** A **Show emails / Hide emails** button in the
  Accounts toolbar. Emails are masked by default (`j•••••••@g••••.com`),
  so a real Battle.net address can never be flashed on stream by accident. The
  toolbar button reveals/hides every row; a per-row eye button reveals a single
  address. The choice persists in `localStorage` (`d2rcc.showAcctEmails`).

### Unchanged
- `D2Loader.ps1` is still byte-for-byte Shupershuff's. No loader files touched.

---

## [2.6] — Sidebar live placement, full-width credit, uniform config cards

### Changed
- **Terror Zone & DClone live status moved under Command Log.** The two sidebar
  drop-downs now sit directly beneath the last nav button and expand downward,
  instead of being pushed to the bottom of the sidebar.
- **Full-width Rp_Casanova credit pill.** The credit moved out of the narrow
  brand text into its own sidebar-width row with a larger, scaled font; the
  socials/tip menu matches the pill width.
- **Presets first.** On Launch & Presets the panel order is now Presets →
  Batch Launch → Batch Load Order.
- **Uniform Configuration cards.** `#configGroups` now uses a balanced
  two-column masonry layout so short cards (Playtime Tracking, Terror Zones)
  no longer leave large vertical gaps beside tall cards.

### Unchanged
- `D2Loader.ps1` is still read-only and untouched.

---

## [2.5] — Batch order, reliable startup, self-healing shortcut

### Added
- **↕ Batch Load Order panel** (Launch & Presets). Pick an existing batch, drag
  its accounts into the order they should load, and save. Rewrites only that
  batch's rows in `Accounts.csv` — the loader walks the file top-to-bottom, so
  row order *is* load order. Set-equality validation and a one-time
  `Accounts.csv.bak` make it safe.
- `GET /api/batch-order` — list batches, or one batch's current order.
- `POST /api/batch-order` — reorder one batch's rows in place.
- `focusUiWindow()` in the bridge: raises an already-open UI with
  `WScript.Shell.AppActivate` instead of doing nothing.
- `bridge.log` — timestamped log of every start attempt, health check and error.
- `github/` documentation folder (this repo's write-up), excluded from the
  distribution zip.

### Fixed
- **Desktop icon needed 3–4 clicks.** Health checks now use `127.0.0.1` instead
  of `localhost` (which resolves to IPv6 `::1` first on some PCs and times out
  even when the bridge is healthy). Startup is now single-flight via a named
  mutex (`Global\D2RCommandCenterEnsure`), waits up to 40 s with one automatic
  retry, and logs each stage.
- **Silent startup failure.** `launch-command-center.vbs` now waits for the
  helper's exit code and shows a message box pointing at `bridge.log`.
- **Desktop shortcut not replaced on update.** `make-shortcut.ps1` now validates
  an existing `.lnk` (target, arguments, working directory, icon, target
  existence) and repairs it in place; `update.ps1` refreshes the shortcut as a
  mandatory step and calls `ie4uinit.exe -show` so Explorer redraws the icon.
- Batch-order dropdown stayed on "Loading batches…" until the refresh button was
  clicked; it now populates on startup and when the bridge comes online, without
  clobbering unsaved edits.

### Changed
- Updater is now six steps (`1/6 … 6/6`) with the shortcut refresh inserted
  before the restart.
- `update.ps1` header bumped to `Updater (v2.5)`.

---

## [2.4] — Launch fix, drag order, window memory, sidebar status

### Added
- **Drag & drop launch order** for manually selected accounts. The number on each
  card is the load position; `Launch Selected` fires them one at a time in that
  order.
- **Window size & position memory.** Move or resize once; it reopens the same way.
  Stored in `bridge.config.json` so it survives updates.
- **Live Status in the sidebar** as two collapsible drop-downs (Terror Zone,
  DClone) with US / EU / KR / CN region buttons always available.
- **⟳ Refresh** button on the Instances view.

### Fixed
- **Launching a game did nothing when "Run loader in background" was off.** A
  `[bool]` parameter was being passed as a string from `Start-Process`, which
  PowerShell refused to bind, so the loader window appeared and vanished. The
  parameter is now `[string]` with an explicit parse, and the helper elevates
  up-front to avoid a second flash-and-gone window.
- Live game detection now notices instances closed outside the Command Center
  without a manual refresh.

### Changed
- Accounts table: password is a collapsible lock button, the Label column is
  larger, and the "Command Line Arguments" column was removed.

---

## [2.3] — Live status and a tidier folder

### Added
- Working **Live Status**: Terror Zones and DClone, mirroring his screens, via the
  public D2Emu API (`shupertoken/aes` → `shupertoken/token` → `tz` / `dclone`).
- Terror Zones configuration panel with a US preset.
- Loader window now uses the project icon instead of the PowerShell icon.

### Changed
- Folder reorganisation: only five `.bat` files at the root
  (`Install`, `Update`, `Create-Desktop-Shortcut`, `Start`, `Stop`); everything
  else moved into `scripts\`, `app\`, `assets\`, `data\`, `docs\`.

---

## [2.2] — One loader at a time

### Added
- **Launch queue.** Launches are serialised FIFO with a settle gap, so token
  authentication finishes before the next account starts (one token per IP).
- Live game/instance detection and a manual refresh.
- Queue depth and running-job visibility in the UI; `POST /api/queue/clear`.

---

## [2.1] — Flat zip and one-click updates

### Added
- `Update-D2R-Command-Center.bat`: stops the app, replaces program files, keeps
  `bridge.config.json` and `data\`, restarts.
- Flat release zip (no wrapping folder) so it can be extracted over an existing
  install.

---

## [2.0] — Branding pass

### Changed
- Rp_Casanova credit line with Twitch / YouTube / Tip links, collapsed into a
  drop-down.
- Brand text ~20% smaller.
- Project icon replaces the shield mark, moved next to the title.

---

## [1.1] — Get Token

### Added
- **🔑 Get Token**: Playwright-driven Battle.net login that captures the `?ST=`
  redirect token and writes it to `Accounts.csv` in the loader's DPAPI format.
- Headless-first with automatic visible-window fallback for CAPTCHA / 2FA.
- Manual token paste fallback.
- `scripts/secrets.ps1` for DPAPI encrypt/decrypt over STDIN.

---

## [1.0] — First release

### Added
- Instances view with per-account realm picker and Launch/Close.
- Batch launch (2/4/6/8, batch ID), Open All, presets.
- Configuration view covering every `config.xml` option.
- Accounts table writing `Accounts.csv`.
- Command Log with the exact command line.
- Import / Export of `config.xml` and `Accounts.csv`.
- Local Node bridge on `127.0.0.1:8787`; no build step, no remote assets.
