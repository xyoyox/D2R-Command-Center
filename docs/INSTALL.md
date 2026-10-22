# 📦 Installation

Two audiences: **end users** (just want it working) and **tinkerers** (want to run
from source).

---

## Part 1 — End users

### 1. Prerequisites

- Windows 10 or 11, 64-bit
- [Shupershuff's Diablo2RLoader](https://github.com/shupershuff/Diablo2RLoader)
  already installed and known-working
- Diablo II Resurrected installed and logged in at least once

Node.js is **not** required — the installer fetches a portable copy if it can't
find one.

### 2. Unzip

Extract the release zip somewhere permanent, for example:

```
C:\D2R-Command-Center\
    Install-D2R-Command-Center.bat
    Update-D2R-Command-Center.bat
    Start-D2R-Command-Center.bat
    Stop-D2R-Command-Center.bat
    Create-Desktop-Shortcut.bat
    app\
    scripts\
    assets\
    data\
```

Do **not** run it from inside the zip, and do not split the folders up — the
`.bat` files locate their helpers relative to themselves.

### 3. Run the installer

Double-click **`Install-D2R-Command-Center.bat`**.

It will:

1. Check for Node.js; if missing, download a portable build into `tools\node`.
2. Run `npm install --omit=dev` in `app\` (installs `playwright-core`).
3. Auto-detect your `D2Loader.ps1` (checks common paths, then asks if unsure).
4. Write `bridge.config.json` with the resolved paths.
5. Create a **D2R Command Center** shortcut on your Desktop.
6. Start the bridge and open the UI.

Approve the UAC prompt if it appears. That elevation is the same one the loader
needs to launch the game.

### 4. First launch checklist

- Sidebar footer shows **`UI v2.7`** and **`Bridge v2.7`**.
- Bridge chip is green: **Bridge online** (or **Bridge online · token ready**).
- **Instances** shows your accounts from `Accounts.csv`.
- Configuration → Loader & Bridge shows the correct `D2Loader.ps1` path.

If any of those are wrong, see [TROUBLESHOOTING](FAQ.md).

### 5. Everyday use

Double-click the desktop icon. That's it. The launcher is silent, waits for the
bridge, focuses the existing window if one is already open, and only shows a
dialog if something genuinely failed.

To shut everything down: **`Stop-D2R-Command-Center.bat`**, or close the UI and
let it idle (the bridge stays up so the icon reopens instantly).

### 6. Uninstalling

1. Run `Stop-D2R-Command-Center.bat`.
2. Delete the desktop shortcut.
3. Delete the install folder.

That's the whole footprint. Your `D2Loader.ps1`, `config.xml` and `Accounts.csv`
are untouched and remain exactly where they were.

---

## Part 2 — Running from source

```bat
git clone https://github.com/xyoyox/D2R-Command-Center.git
cd d2r-command-center\app
npm install
node server.js
```

Then open <http://127.0.0.1:8787>.

Useful flags / env vars:

| Setting | Effect |
|---|---|
| `PORT=8799 node server.js` | run on a different port (handy for testing) |
| `node server.js -nobrowser` | don't open a UI window; serve only |
| `bridge.config.json` | `scriptPath`, `accountsCsvPath`, `hideLoaderWindow`, `noBrowser`, `windowState` |

On non-Windows machines the UI and most of the API work, but launching and token
capture will not — the loader is Windows-only. This is useful for UI development.

### Developing the UI

There is no build step. Edit `app/index.html`, `app/app.js`, `app/styles.css`,
then hard-refresh the browser (`Ctrl+F5`). Keep app files **LF** and `.bat` /
`.ps1` / `.vbs` files **CRLF**.

Validate before committing:

```bat
node --check app\server.js
node --check app\app.js
powershell -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts\bridge-ctl.ps1'),[ref]$null,[ref]$e); $e"
```

---

## Part 3 — Building a release

1. Bump the version in **all** of these:
   - `app/server.js` → `const VERSION = "x.y";`
   - `app/app.js` → `UI_VERSION`
   - `app/index.html` → the `#uiVersion` badge
   - `app/package.json` → `version`
   - `VERSION.txt`, `README.txt`, `docs/README.md`
2. Update the changelog in `VERSION.txt` and `CHANGELOG.md`.
3. Zip **flat** (no wrapping folder) so it can be extracted over an existing
   install:

   ```bat
   powershell -NoProfile -Command "Compress-Archive -Path 'Install-*.bat','Update-*.bat','Start-*.bat','Stop-*.bat','Create-*.bat','README.txt','VERSION.txt','app','scripts','assets','data','docs','bridge.config.json.example' -DestinationPath '..\D2R-Command-Center-vX.Y.zip' -Force"
   ```

4. **Exclude** from the zip:
   - `bridge.config.json` (user-specific paths)
   - `app\node_modules\*`
   - `app\package-lock.json`
   - the `github\` documentation folder

5. Verify the archive has no top-level folder and that `Install-D2R-Command-Center.bat`
   sits at the root.
