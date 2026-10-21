# ⚔ D2R Command Center

A beautiful, **button-driven companion UI** for [Shupershuff's Diablo2RLoader](https://github.com/shupershuff/Diablo2RLoader).

> **His engine, untouched.** This is a front-end only. It reads and writes his
> `config.xml` and `Accounts.csv`, and drives his `D2Loader.ps1` using the exact
> launch parameters his script already supports. Not a single line of his
> PowerShell is modified, forked, or replaced.

---

## Why

The original loader is a PowerShell **text menu**. This gives it a dark, gothic
Diablo-themed face with **buttons, toggles, presets, batch launching** — and now
a one-click **🔑 Get Token** button — while his script still does all the real work.

---

## Features

| Area | What it does |
|------|--------------|
| **Instances** | Every account as a card — label, email, batch tags, auth method, playtime. One-click **Launch** / **Close**. Search + filter (All / Open / Available). |
| **Batch Launch** | Quick-launch **2 / 4 / 6 / 8** instances, launch a specific **batch ID**, or hand-pick accounts. |
| **Open All** | One button for the loader's `-all` parameter. |
| **Presets** | Save a **default realm + account set + batch**, reuse it forever. |
| **Configuration** | *Every* `config.xml` option as a toggle/dropdown — no XML editing. |
| **Loader & Bridge** | Set the path to your `D2Loader.ps1` right in the UI (with a native **Browse…** button) and see live status. |
| **Accounts** | Add/edit/remove accounts in a table — writes `Accounts.csv`. |
| **🔑 Get Token** | Signs in to Battle.net for you and captures the auth token automatically. See below. |
| **Command Log** | Shows the exact command sent to `D2Loader.ps1`, with copy button. |
| **Import / Export** | Pull in your real `config.xml` + `Accounts.csv`, export updated ones. |
| **Live Status** | Terror Zone & DClone panels (mirroring his screens). |
| **Batch Load Order** | Pick an existing batch and drag its accounts into the order they should load. Rewrites only that batch's rows in `Accounts.csv` (a one-time `.bak` is made first). `D2Loader.ps1` untouched. |

---

## 🔑 The Get Token feature (new in v1.1)

Battle.net tokens expire, and the old workflow was painful: open a browser, log
in, watch the page fail to load `http://localhost:0/...`, then dig the `?ST=`
value out of the address bar and paste it into `Accounts.csv`. **Get Token** does
all of that for you.

### How to use it

1. Start the bridge (see *Two ways to run it* below) so the sidebar shows
   **“Bridge online · token ready”**.
2. Go to **Accounts** and click **🔑 Get Token** in the toolbar (or the 🔑 button
   on any account row / instance card).
3. Pick the **account**, confirm the **Battle.net email**, and type the
   **password** (or tick *Use the password already stored in Accounts.csv*).
4. Choose the **realm** (Americas / Europe / Asia) and the **mode**.
5. Click **Get Token**. Watch the live log; the token lands in `Accounts.csv`
   automatically.

### What it actually does

1. Launches a real browser (Edge/Chrome via Playwright) pointed at
   `https://<region>.account.battle.net/login/en/?app=osi`.
2. Fills your email → submits → fills your password → submits.
3. Battle.net redirects to `http://localhost:0/?ST=US-…-…&flowTrackingId=…`.
   That port is deliberately unreachable (`ERR_UNSAFE_PORT`), so the browser
   can't load it — **but the URL is captured** by intercepting the redirect
   (response `Location` header, request URL, and route interception).
4. The `US-…-…` token is extracted and written into the correct row of
   `Accounts.csv`.

### Headless vs. visible

- **Headless (recommended)** — no window pops up. Works for most logins.
- **Show browser window** — if Battle.net throws a **CAPTCHA** or a
  **2-factor / one-time-code** prompt, the headless attempt detects it and
  automatically re-opens a **visible** window so you can finish it by hand
  (you have up to ~3 minutes). The token is still captured for you.

### Encryption (matches the loader exactly)

The loader stores secrets with Windows **DPAPI** (`ConvertFrom-SecureString`),
CurrentUser scope. **Get Token** writes tokens in that *same* format via a tiny
helper, `bridge/secrets.ps1`, so his engine can read them without any changes:

| Secret | How it's stored | Looks like |
|--------|-----------------|------------|
| **Token** | `ConvertTo-SecureString … \| ConvertFrom-SecureString` | long encrypted blob (≥ 200 chars) |
| **Password** | same DPAPI method | long encrypted blob (≥ 300 chars) |

> The helper receives your secret over **STDIN**, never as a command-line
> argument, so it never appears in the process list.

If the bridge can't find PowerShell, it will still write the token but warn you
that it's **plain text** — the UI marks those with a `⚠ plain` badge so you know
the loader won't accept them until they're encrypted on Windows.

### Manual fallback

No bridge, or you'd rather do it yourself? Open **Get Token → “Or paste the
token / redirect URL manually”** and paste either the whole
`http://localhost:0/?ST=…` URL **or** just the `US-…-…` token. The UI extracts
the token and (with the bridge) encrypts + writes it for you.

---

## Updating to a new version

**v2.1 makes this a one-click job.** The zip is now **flat** (no wrapping
`d2r-command-center/` folder), so you can extract it straight into your existing
folder and overwrite — *or* use the new updater, which does a clean replace for
you.

**Option A — one-click updater (recommended):**

1. Unzip the new `D2R-Command-Center-vX.Y.zip` into a **new, empty folder**.
2. Double-click **`Update-D2R-Command-Center.bat`** in that new folder.
3. It finds your existing install, **stops** it, **removes the old files**,
   **copies the new ones in**, keeps your `bridge.config.json` + `data\`, and
   **restarts** the app. It never touches `D2Loader.ps1`.
4. Confirm: the **sidebar footer** shows **`UI v2.6`** and **`Bridge v2.6`**.

**Option B — flat overwrite:**

1. Close the app (run `Stop-D2R-Command-Center.bat`).
2. Extract the flat zip **directly into your existing folder** and choose
   **Replace files in the destination**.
3. Run `Start-D2R-Command-Center.bat`.

> **Why the old way failed:** previous zips wrapped everything in a
> `d2r-command-center/` folder, so extracting *into* your install created a
> nested `d2r-command-center/d2r-command-center/` and you kept running the old
> files. The flat zip + updater fixes that for good.

> The bridge sends **no-cache** headers, so a normal refresh (F5) is enough — but
> if the browser still shows the old look, press **Ctrl+F5** once.

---

## Two ways to run it

### 0. One-click setup (easiest — recommended)
Double-click **`Install-D2R-Command-Center.bat`** and you're done. It:
1. makes sure **Node.js** is installed (uses `winget`, or downloads the
   official installer if you don't have it),
2. installs the bridge's one dependency (`playwright-core`),
3. **finds your `D2Loader.ps1` automatically** (Desktop, Downloads, Documents,
   `C:\`) and saves the path for you,
4. drops a **“D2R Command Center”** icon on your Desktop, and
5. opens the app.

That's the whole setup — no typing, no hunting for paths. From then on just
double-click the Desktop icon. (Prefer to do it by hand? Sections 1 and 2 below.)

> **End users:** there's a plain-language **`README.txt`** in this folder with
> the same quick-start, written without any of the developer detail.

### 1. Just open it (no install)
Open `index.html` in any modern browser.
- Everything works: browsing, editing config, editing accounts, presets, exports.
- **Launch buttons copy the exact command** to your clipboard — paste it into
  PowerShell to run. (Browsers can't spawn processes on their own — that's a
  security feature, not a bug.)
- *Get Token* needs the bridge (it has to drive a real browser and touch the CSV).

### 2. With the local bridge (one-click launching **and** Get Token)
Requires [Node.js](https://nodejs.org).

1. Double-click **`Start-D2R-Command-Center.bat`**. On first run it
   **installs the bridge's one dependency for you** (`playwright-core`, via
   `npm install`) — no separate step needed. (Need to re-install or repair?
   Double-click **`install-deps.bat`**.)
2. That same launcher then:
   - opens the UI in its **own browser window** (not a new tab), and
   - drops a **“D2R Command Center” shortcut on your Desktop** the first
     time you run it (with the bundled ⚔ icon).
3. In the UI, open **Configuration → 🔌 Loader & Bridge** and click **📁 Browse**
   to point it at your `D2Loader.ps1`. Hit **💾 Save paths** — the status chips
   turn green when the loader and `Accounts.csv` are found. (Advanced: you can
   also set the `D2LOADER_PATH` env var or edit `bridge.config.json`.)
4. Now **Launch** buttons actually start the game, and **🔑 Get Token** works. 🎮

The sidebar shows a green **“Launcher bridge online · token ready”** dot when
connected.

> **One window, no clutter (v1.9).** The launcher keeps exactly **one** bridge
> and **one** UI window. The bridge starts **hidden** (no console in the
> taskbar), and clicking the Desktop icon again just re-focuses the window you
> already have. Prefer it fully out of the way? Run **`Start-Background.bat`**
> to start the bridge with **no window and no browser**, then open the UI from
> the Desktop icon whenever you want. **`Stop-D2R-Command-Center.bat`** shuts it
> down.

> **Desktop icon.** Want to (re)create the shortcut any time? Double-click
> **`Create-Desktop-Shortcut.bat`**. It points at the launcher and uses
> `assets/d2r.ico`.

#### Browser for Get Token
`playwright-core` uses a browser you already have — no big download. It tries,
in order: the `D2R_BROWSER_PATH` env var → **Microsoft Edge** → **Google
Chrome** → common install paths. If you use a portable browser, set
`D2R_BROWSER_PATH` to its `.exe`.

---

## How it maps to the loader

Every action builds a command in the exact shape his script expects:

```
Launch account 2 on NA  →  powershell -ExecutionPolicy Bypass -File "D2Loader.ps1" -AccountUsername 2 -Region na
Launch batch 1 on EU    →  powershell -ExecutionPolicy Bypass -File "D2Loader.ps1" -Batch 1 -Region eu
Open all on KR          →  powershell -ExecutionPolicy Bypass -File "D2Loader.ps1" -All True -Region kr
Close account 3         →  powershell -ExecutionPolicy Bypass -File "D2Loader.ps1" -Close 3
Force close all         →  powershell -ExecutionPolicy Bypass -File "D2Loader.ps1" -Close all
```

`-AccountUsername` accepts either the account's **ID** or its **Acct/email**,
exactly as his script expects. When the *Run loader in background* option is on,
the bridge wraps the call so the loader window never flashes on screen:

```
Start-Process powershell.exe -ArgumentList '<the line above>' -WorkingDirectory <loader dir> -WindowStyle Hidden -Verb RunAs
```

Regions map exactly as the loader expects: **NA = 1**, **EU = 2**, **KR/Asia = 3**.

---

## Files

As of **v2.6** the main folder is kept tidy: you only see the handful of `.bat`
files you actually need, and everything else lives in sub-folders.

```
d2r-command-center/
├─ README.txt                    ← START HERE — simple end-user quick-start
├─ VERSION.txt                   ← the installed version (2.6)
├─ Install-D2R-Command-Center.bat  ← ONE-CLICK setup (Node + deps + loader + icon + launch)
├─ Update-D2R-Command-Center.bat ← ONE-CLICK update of an existing install (removes old files)
├─ Create-Desktop-Shortcut.bat   ← (re)create the Desktop shortcut
├─ Start-D2R-Command-Center.bat  ← everyday launcher (one window, silent bridge)
├─ Stop-D2R-Command-Center.bat   ← stop the background bridge
├─ bridge.config.json.example    ← point it at your D2Loader.ps1
│
├─ app/                          ← the actual program
│  ├─ index.html                 ← the UI
│  ├─ styles.css                 ← gothic theme
│  ├─ app.js                     ← parsing, rendering, command builder, token UI
│  ├─ server.js                  ← local launcher bridge + token + config + live-status API
│  ├─ token-helper.js            ← Playwright login automation + token capture
│  ├─ package.json               ← dependency: playwright-core
│  └─ package-lock.json
│
├─ scripts/                      ← helper scripts the .bat files call
│  ├─ update.ps1                 ← updater logic (find → stop → replace → keep settings → restart)
│  ├─ bridge-ctl.ps1             ← keeps ONE bridge + ONE UI window (ensure/open-ui/stop/status)
│  ├─ launch-loader.ps1          ← runs the loader HIDDEN + sets the window icon (loader untouched)
│  ├─ launch-command-center.vbs  ← silent launcher used by the Desktop icon
│  ├─ start-bridge-hidden.vbs    ← starts the bridge with no console window
│  ├─ Start-Background.bat       ← start the bridge only (no window, no browser)
│  ├─ Run-Bridge.bat             ← minimal fallback launcher (just runs the bridge)
│  ├─ install-deps.bat           ← (re)install bridge deps (npm install)
│  ├─ make-shortcut.ps1          ← shortcut helper (silent .vbs target + icon)
│  ├─ ensure-node.ps1            ← installs Node.js if it's missing (winget / MSI)
│  ├─ auto-detect-loader.ps1     ← finds D2Loader.ps1 and writes bridge.config.json
│  └─ secrets.ps1                ← DPAPI secure/unsecure (loader-compatible)
│
├─ docs/
│  └─ README.md                  ← this file (technical notes)
│
├─ assets/
│  ├─ d2r.ico                    ← multi-size app/desktop icon
│  └─ d2r.png                    ← icon preview (256px+)
│
└─ data/
   ├─ config.xml                 ← bundled default (from his repo)
   ├─ Accounts.csv               ← bundled default (from his repo)
   └─ levels.txt                 ← TZ level IDs reference
```

---

## Notes

- **Nothing leaves your machine.** Imported files are parsed in-browser; presets
  and edits are stored in `localStorage`. The only network traffic Get Token
  makes is *you* logging in to *Battle.net*.
- **Your password is only sent to Battle.net.** It is never written to disk by
  the UI; if you tick *use stored password*, it is decrypted locally just long
  enough to submit the form.
- **Passwords stay encrypted.** The Accounts editor never decrypts; it just
  round-trips the loader's own encrypted strings.
- **Run the loader as admin** as usual — the bridge launches it the same way the
  script is normally run.
- **Backups.** The first time Get Token edits `Accounts.csv`, it saves a
  `Accounts.csv.bak` next to it.
- **Its own browser profile.** The UI opens in a dedicated, minimal browser
  profile (under `%LocalAppData%\D2RCommandCenter\browser-profile`) in `--app`
  mode, so it stays light on RAM and never interferes with your normal
  Edge/Chrome. To open it in your regular browser instead, just visit
  `http://localhost:8787`.

---

## If it still won't start

Double-clicking the launcher now **always** leaves a window open (it pauses at
the end), and it writes a **`bridge.log`** in the same folder. If something is
wrong, that log will say so — the most common causes are:

- **Node.js isn't installed** — the launcher will say so and tell you to grab it
  from <https://nodejs.org>. Without Node you can still open `index.html`
  directly; the Launch buttons just copy the command instead of running it.
- **The port is already in use** — you already have a bridge running; the
  launcher will just open its UI.
- **`npm install` failed** (no internet / proxy) — harmless: the bridge still
  runs, only *Get Token* needs that dependency. Re-run `install-deps.bat` later.

---

*Engine & credit: [Shupershuff](https://github.com/shupershuff/Diablo2RLoader) — please
[buy him a beer](https://www.buymeacoffee.com/shupershuff) 🍺. This UI is just a nicer face on his work.*


---

## Changelog

### v2.6
- **Sidebar live status moved under Command Log.** The Terror Zone and DClone
  drop-downs now sit directly beneath the last nav button instead of being
  pushed to the bottom of the sidebar. `.nav` no longer absorbs all the free
  height (`flex: 0 0 auto`) and the footer takes the slack (`margin-top: auto`),
  so the live block opens downward instead of appearing to pop up.
- **Full-width credit pill.** The "Rp_Casanova - YOYO Crescendo" credit moved
  out of the narrow brand text and became a sidebar-width pill with a larger,
  scaled font; its socials/tip menu now matches the pill width.
- **Presets first.** On Launch & Presets the panel order is now Presets,
  Batch Launch, Batch Load Order.
- **Uniform Configuration cards.** The config groups have very different
  heights, so the old grid left large vertical gaps under the short cards
  (Playtime Tracking next to DClone Alerts, etc.). `#configGroups` now uses a
  balanced two-column masonry layout with `break-inside: avoid`, so every card
  packs tightly and placement is uniform.

### v2.5
- **Desktop icon now opens on the first click.** Three causes, all fixed.
  (1) The startup health check used `localhost`, which on some Windows PCs
  resolves to IPv6 `::1` first and times out even though the bridge is healthy -
  so the helper believed it was down and tried to start a second copy, which
  failed on the busy port. All helpers now use `http://127.0.0.1:8787`
  explicitly. (2) Rapid clicks ran several helpers at once; a **named mutex**
  (`Global\D2RCommandCenterEnsure`, 45 s wait) now serialises them. (3) Failure
  was silent; `launch-command-center.vbs` now waits for the helper's exit code
  and shows a message box pointing at `bridge.log`, which records every stage
  with a timestamp. `Ensure-Bridge` also retries once (40 s, then 25 s) and
  `/api/open-ui` returns `{opened:false, focused:true}` for an existing window,
  which the bridge raises with `WScript.Shell.AppActivate`.
- **Updating now replaces the desktop shortcut.** `make-shortcut.ps1` used to
  exit early with "already exists - leaving it alone", so an update could leave
  a `.lnk` pointing at a moved target. It now validates target path, arguments
  (trailing-space normalised), working directory, icon and target existence,
  repairs the shortcut in place, and calls `ie4uinit.exe -show` so Explorer
  redraws the icon. `update.ps1` gained a mandatory
  **[5/6] Refreshing the desktop shortcut** step before the restart.
- **Batch Load Order (new panel).** Shupershuff's loader collects a batch by
  walking `Accounts.csv` top-to-bottom, so **row order is load order**. The new
  **Launch & Presets -> Batch Load Order** panel lets you pick an existing
  batch, drag its accounts into the order you want, and save. The bridge
  (`POST /api/batch-order`) rewrites **only the rows belonging to that batch**,
  leaving every other row at its exact index, validates that the requested IDs
  are exactly the current set (no adds, no drops), and writes a one-time
  `Accounts.csv.bak` before the first change. `D2Loader.ps1` is untouched.
- **Batch drop-down populates on load.** It previously waited for the refresh
  button; `loadBatchList()` now runs from `init()` and again when the bridge
  comes online, without clobbering unsaved edits.

### v2.4
- **🐛 Launch bug fixed.** With "Run loader in background" turned **off**, the
  loader window used to appear and instantly vanish. Root cause: the launch
  helper declared its `-Hide` option as a `[bool]`, but `Start-Process` hands
  command-line values over as **strings**, so PowerShell threw
  *"Cannot convert value System.String to type System.Boolean"* and the helper
  died before it ever ran the loader. `-Hide` is now a `[string]` parsed
  explicitly, and the helper **self-elevates up-front** (with an `-Elevated`
  guard so it only does it once) so the loader sees it is already admin and
  stays in a single console instead of spawning a second window and exiting.
  Verified by forwarding account / batch / all / close invocations to a mock
  loader.
- **↕ Drag & drop launch order.** In **Launch & Presets → "Or pick accounts
  manually"**, the account cards are now `draggable`. Drag them into any order;
  each card shows its **load position** (1, 2, 3 …) and a grip handle. The order
  lives in `state.manualOrder` (kept in sync as accounts are added/removed), and
  **Launch Selected** queues them **one at a time in that order** through the
  existing FIFO launch queue, so token auth finishes before the next starts.
  Drop targets use midpoint detection (insert above/below) with live
  `drop-above` / `drop-below` indicators.
- **🪟 Remember window size & position.** The UI reports
  `window.screenX/screenY/outerWidth/outerHeight` (debounced) to
  `POST /api/window-state`; the bridge clamps and persists it in
  `bridge.config.json` (`windowState`). On the next launch `openUiWindow()`
  passes `--window-size=W,H` and `--window-position=X,Y` to the browser app
  window, so it reopens exactly where you left it.
- **🌍 Live Status moved to the sidebar.** The Terror Zone and DClone status
  are now two **collapsible drop-downs** on the left sidebar (always visible),
  each with a summary value and an expandable body. US / EU / KR / CN region
  buttons sit right under them so you can switch realms without leaving the
  page. The old bottom-of-page panel stays too.
- **🧾 Accounts table cleanup.** The **Password** column is now a compact 🔒
  button that reveals the field on click (collapsible), the **Label** column is
  wider with a larger, bolder input, and the **Command Line Arguments** column
  was removed entirely (the data field is retained internally for compatibility
  but no longer shown).

### v2.3
- **🌍 Live Status actually works now.** The Live Status panel (Launch &
  Presets screen) shows the **real, current Terror Zone and DClone status**,
  pulled straight from **D2Emu.com** — the same source Shupershuff's loader
  uses. The bridge fetches the shared token (`/api/v1/shupertoken/aes` →
  `/api/v1/shupertoken/token`), decrypts it (**AES-128-CBC**, utf8 key/iv,
  base64 ciphertext), then calls `/api/v1/tz` and `/api/v1/dclone` with the
  `x-emu-username` / `x-emu-token` headers. You get: the zones terrorized
  **now** and **next** (with boss-pack counts, superuniques and immunities),
  the **next rotation time**, and the **DClone walk progress (x/6)** for every
  game mode. It polls about once a minute, with a manual ⟳ refresh.
- **🔥 Terror Zones panel works too.** The Terror Zones card in **Configuration**
  now renders the same live **Now / Next** data inline (next to the Alert Areas
  field) and adds a **"Use current TZ as Alert Areas"** button that fills the
  field with the current zone IDs in one click.
- **Preset to America / US / English.** The Live Status region toggle defaults
  to **US (Americas)** and remembers your choice (`US / EU / KR / CN`).
- **Tidy main folder.** The program files moved into **`app/`**, the helper
  scripts into **`scripts/`**, and the technical docs into **`docs/`**, so the
  main folder shows only the five essential `.bat` files plus `README.txt`,
  `VERSION.txt` and the `assets/` + `data/` folders. Every path reference (the
  `.bat` launchers, the PowerShell/VBS helpers, `server.js`, and the
  install/update logic) was updated to match.
- **The account/loader window shows OUR icon.** `launch-loader.ps1` now sets the
  console window icon from `assets\d2r.ico` (`LoadImage` + `WM_SETICON` +
  `SetClassLongPtr` for both the small and big icon) so the loader window no
  longer wears the default PowerShell icon. The loader's own file is still
  never touched.

### v2.2
- **Accounts now launch ONE AT A TIME (fixes the batch token failure).** If you
  started several accounts from the UI, the app used to fire a separate
  `D2Loader.ps1` for each one at once — two loaders racing, two tokens requested
  from the same IP, and the logins failed. Now every launch goes through a
  **FIFO queue**: the app starts **one** loader, **waits for it to finish** (the
  account reaches character select and the token is written), waits a short
  gap, and only then starts the next. This mirrors exactly what his `-batch`
  mode does internally, but it also serializes *any* mix of buttons — **Launch
  Selected**, the quick **2 / 4 / 6 / 8** buttons, presets, **Open All**, or
  clicking **Launch** on several cards. A **queue bar** appears above the grid
  ("Launching: *Account 2* · 1 waiting") with a **Cancel waiting** button, and
  each card shows **◔ Launching** or **⏳ Queued** while it waits.
- **It knows when you close a game outside the app.** The bridge now reads the
  window titles of the running `D2R` processes (the same
  `"<id> - <name> (<region>) - Diablo II: Resurrected"` title his loader uses)
  and the UI polls it every few seconds. Close a game from the game itself and
  its card flips back to **○ Available** and the **Open** counter drops —
  **no refresh needed**. A small **● Live** chip in the toolbar shows the state.
- **New ⟳ Refresh button** on the main screen. It re-reads your `Accounts.csv`
  (merging in anything added outside the app), re-checks which games are open,
  and re-syncs the queue — handy right after you edit a file by hand.

### v2.1
- **The updater actually replaces your files now.** The v2.0 zip wrapped
  everything in a top-level `d2r-command-center/` folder, so extracting it into
  your existing install created a *nested* sub-folder and the running files
  never changed — which is why it looked like nothing happened. The zip is now
  **flat** (files sit at the top level), and there's a new one-click updater.
- **`Update-D2R-Command-Center.bat` + `update.ps1`.** Double-click the updater
  and it finds your install (saved target → Desktop shortcut → common folders),
  **stops the running app, removes the old files, copies the new ones in,
  preserves your `bridge.config.json` and settings, and restarts it.** Supports
  `-DryRun` and `-Target <path>` if you keep it somewhere unusual.
- **`VERSION.txt`.** A plain little file that records the installed version, so
  you can always tell what you're running.

### v2.0
- **The app icon now sits in the top-left** instead of the drawn shield glyph.
  The sidebar brand shows the real **D2R Command Center** icon (the same
  `assets/d2r.png` used for the Desktop shortcut), aligned to the **top** of the
  header next to the title.
- **"Rp_Casanova" is now a drop-down.** The credit line reads *"made with ❤ by
  Rp_Casanova "YOYO Crescendo""*, and clicking the name opens a small menu with
  the **Twitch**, **YouTube** and **Tip** links. It closes on an outside click
  or the **Esc** key.
- **Brand text is ~20% smaller.** The title, subtitle and credit line were scaled
  down so the logo and the app name read as a tidier, more compact header.

### v1.9
- **The loader no longer shows its own window on every launch.** Previously,
  clicking **Launch** opened the loader's black console window (it had to run
  elevated, and Windows ignores `-WindowStyle Hidden` when a process is
  elevated with `-Verb RunAs`, so the window always appeared). Now the bridge
  runs the loader through a tiny wrapper, **`launch-loader.ps1`**, which hides
  its *own* console from the inside (`ShowWindow(GetConsoleWindow(), SW_HIDE)`)
  and then runs the loader **in-process** with the exact same parameters. The
  loader still sees it is already elevated, so it never re-launches itself.
  **Shupershuff's script is not modified in any way.** (Want the window back?
  Turn off *Run loader in background* in Configuration.)
- **Runs in the background \u2014 no console window at all.** The bridge is now
  started **hidden** (via `start-bridge-hidden.vbs`), so there is no stray
  console sitting in the taskbar. New **`Start-Background.bat`** starts the
  bridge with **no browser and no window** (`--no-browser`), and new
  **`Stop-D2R-Command-Center.bat`** shuts it down cleanly.
- **Exactly ONE Command Center \u2014 never a second window.** The UI now pings the
  bridge (`/api/ui-heartbeat`) every few seconds, and the launcher only opens a
  window when it hasn't heard from one recently (`/api/open-ui`). If the bridge
  is already running, a second start exits **quietly** (`EADDRINUSE`) instead of
  spawning a duplicate. Click the Desktop icon as many times as you like \u2014 you
  get one window.
- **Silent Desktop icon.** The Desktop shortcut now launches through
  **`launch-command-center.vbs`** (via `wscript.exe`), so opening the app never
  flashes a console. `make-shortcut.ps1` writes the new target automatically.
- **Elevation-aware launching.** If the bridge happens to be running **as
  admin**, it skips `-Verb RunAs` entirely \u2014 so there is **no UAC prompt and no
  flash at all** when launching an account.

### v1.8
- **Instance tiles are ~30% smaller.** The account cards were scaled down as a
  whole — the grid column width, card padding, the ID badge, the status pill,
  the label/email text, the meta tags, the region dropdown and the action
  buttons — so more accounts fit on screen at once. The action row was tuned so
  the region picker, **▶ Launch** and the two icon buttons still sit neatly on a
  single line at the smaller size.
- **Fixed the “Browse” button doing nothing on Windows 10.** The native file
  dialog was being started by the background bridge with **no owner window**, so
  Windows would open it *behind* the browser — it looked like the button was
  dead. The picker now creates a tiny invisible **TopMost owner form** and shows
  the dialog *owned* by it, which forces the dialog to the front. It also opens
  in the folder your loader lives in and validates the file exists.
- **Much less browser RAM.** The app used to open in your everyday Edge/Chrome,
  dragging in all your extensions, sync and background services (easily
  500–1000 MB). It now launches in its **own isolated, lightweight profile** in
  **`--app` mode** with extensions, sync, component-update and background
  networking disabled — a clean chromeless window that uses a fraction of the
  memory and never touches your normal browser. The **Get Token** browser gets
  the same memory-saving flags.
- **Credit.** The sidebar now shows **“made with ❤ by Rp_Casanova “YOYO
  Crescendo””** with quick links to **Twitch**, **YouTube** and **Tip**.

### v1.7
- **One-click installer.** New **`Install-D2R-Command-Center.bat`** does the
  whole setup: installs **Node.js** if it's missing (`winget`, falling back to
  the official `.msi`), runs `npm install`, **auto-detects your `D2Loader.ps1`**
  and saves it, creates the Desktop icon, and launches the app. Previously you
  had to install the dependencies yourself — now it's a single double-click.
- **Simple end-user README.** Added **`README.txt`** — a plain-language,
  step-by-step quick-start for people who just want to play (this file,
  `README.md`, keeps the technical detail).
- **Configuration page tidied up.** The settings used to have their controls
  scattered — each field a different width, toggles floating, long paths
  overflowing. Every setting is now a clean two-column row with a **consistent
  control column**, so all the inputs, dropdowns and toggles line up on one
  edge. Toggles sit flush right, wide fields (paths, comma lists) stack neatly,
  and the groups lay out in two comfortable columns instead of three cramped
  ones.
- **`auto-detect-loader.ps1`** searches Desktop, Downloads, Documents and
  `C:\` for `D2Loader.ps1`, so most users never have to type a path at all.

### v1.6.1
- **Fixed the launcher closing instantly (“window disappears, nothing happens”).**
  A `.bat` only vanishes like that if `cmd.exe` aborts on a parse error or the
  script ends without a `pause`. The old launcher used parenthesised
  `if (...)` blocks whose bodies contained the browser path — and on most PCs
  that path contains `(x86)`, whose `)` can close the block early and kill the
  whole script. The launcher is now written **goto-style with no parenthesised
  blocks at all**, so nothing can be mis-parsed, and **every exit path ends in
  `pause`** so the window can never disappear silently again.
- **It now writes `bridge.log`.** Every run is tee'd to `bridge.log` next to the
  launcher. If anything ever goes wrong, that file says exactly what happened —
  just open it and read the last few lines.
- **The bridge opens the UI itself.** Browser launching moved out of the `.bat`
  and into `server.js` (it finds Edge/Chrome and opens a **new window**), so the
  batch file no longer has to juggle `(x86)` paths — the whole class of bug is
  gone.
- **No more scary crash if the port is busy.** If you double-click the launcher
  while a bridge is already running, it no longer dumps a Node stack trace — it
  just opens the UI that's already running.
- **Added `Run-Bridge.bat`.** A four-line fallback that does nothing but
  `node server.js` + `pause`, in case you ever want the absolute minimum.

### v1.6
- **Launch button no longer gets shoved off the card.** A global
  `select { width: 100% }` rule was stretching the per-tile region dropdown to
  the full row width, which pushed the **▶ Launch** button out of view. The
  region selector is now a fixed, compact width, so the dropdown *and* the
  Launch button sit side-by-side and are fully visible.
- **Stylish sidebar icons.** The nav icons were redrawn in the same
  gothic-gold style as the desktop icon — a crossed-swords shield (brand), a
  double-outlined shield (Instances), a hexagon play badge (Launch), an
  eight-tooth cog (Configuration), a plumed helm (Accounts), and a wax-sealed
  scroll (Command Log). All share the gold gradient stroke.
- **The loader window no longer flashes open and closed.** Shupershuff's
  loader is a console app that (with launch parameters) opens, does its job,
  and exits — so you saw a window blink on every launch. There's now a
  **Run loader in background** switch under *Configuration → Loader & Bridge*
  (on by default) that starts it with `-WindowStyle Hidden`, so it runs
  invisibly. Prefer to watch it? Flip the switch off and the console window
  stays visible as before. (This is a launch-time flag only — his script is
  untouched.)
- **One folder, one click.** The bridge files moved out of `bridge/` and into
  the main folder next to the start script, and
  **`Start-D2R-Command-Center.bat` now installs its own dependencies** on first
  run — so there's no separate "install deps" step and no subfolder to hunt
  through.

### v1.5
- **Launch actually launches now.** The bridge used to spawn `powershell.exe`
  with Node's `detached:true`, which sets the Windows `DETACHED_PROCESS` flag.
  That gave the loader *no console at all*, so it died on its very first console
  call (`$host.ui.RawUI.WindowTitle`) **before** it could elevate itself — which
  is why nothing ever happened. The bridge now launches the loader through
  PowerShell's `Start-Process` with `-Verb RunAs`, which hands it a real console
  window and elevates it up-front. A declined UAC prompt (or any error) is now
  reported in the Command Log instead of failing silently.
- **Per-account region dropdown.** Every instance tile has a small NA/EU/KR
  selector. Pick a region and hit Launch to send that account to that realm; the
  choice is remembered per account.
