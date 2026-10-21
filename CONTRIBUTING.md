# Contributing

Thanks for wanting to help. Two ground rules, then the practical stuff.

---

## Rule 1 — Never modify Shupershuff's loader

`D2Loader.ps1` is **read-only** in this project. Pull requests that:

- edit, patch, wrap, shim, fork or reimplement `D2Loader.ps1`,
- add a "patched copy" of his script to the repo,
- change his `config.xml` schema or add custom keys,
- add columns to `Accounts.csv` his parser wouldn't understand,
- launch a second loader in parallel (one token per IP at a time),

will be closed. The whole point of this project is that his engine is untouched.
See [`docs/NON-INVASIVE-DESIGN.md`](docs/NON-INVASIVE-DESIGN.md).

## Rule 2 — No remote code, no telemetry

The UI is static files served from disk. No CDN scripts, no minified bundles, no
analytics, no phone-home. If a feature needs data from the internet, it goes
through the bridge and is documented.

---

## Getting set up

```bat
git clone https://github.com/xyoyox/D2R-Command-Center.git
cd d2r-command-center\app
npm install
node server.js
```

Open <http://127.0.0.1:8787>. There is no build step — edit and hard-refresh.

Useful for testing without touching your real files:

```bat
set PORT=8799
set BRIDGE_CONFIG=test-bridge.config.json
node server.js -nobrowser
```

---

## Code layout

| Path | What lives there |
|---|---|
| `app/server.js` | the bridge: static serving, JSON API, launch queue, token helper |
| `app/app.js` | all UI logic (no framework, plain DOM) |
| `app/index.html` | markup for every view |
| `app/styles.css` | the whole theme |
| `app/token-helper.js` | Playwright token capture |
| `scripts/*.ps1` | PowerShell helpers (start/stop, shortcut, updater, secrets) |
| `scripts/*.vbs` | silent launchers |
| `*.bat` | the five user-facing entry points |

---

## Style

**JavaScript:** two-space indent, double quotes, semicolons, `async/await` over
promises, no new dependencies without discussion. Keep `server.js` dependency-free
except for `playwright-core`.

**PowerShell:** `-NoProfile -ExecutionPolicy Bypass` everywhere, explicit
`[string]`/`[int]` casts for anything arriving from `Start-Process` (a `[bool]`
parameter cannot bind from a command-line string — this caused a real bug in
v2.4). Log to `bridge.log` with timestamps rather than failing silently.

**CSS:** existing variables only; don't introduce a second palette. Gold accent,
near-black background, red for destructive actions.

**Line endings matter:**

- `app/*` → **LF**
- `*.bat`, `*.ps1`, `*.vbs` → **CRLF**

Normalise with:

```bash
sed -i 's/\r$//' file && sed -i 's/$/\r/' file
```

---

## Before you open a PR

```bat
node --check app\server.js
node --check app\app.js
powershell -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts\bridge-ctl.ps1'),[ref]$null,[ref]$e); if($e){$e}else{'OK'}"
```

Then check by hand:

- [ ] Sidebar shows matching `UI vX` / `Bridge vX`
- [ ] Instances launch and close
- [ ] Batch launch runs accounts **one at a time**
- [ ] Batch Load Order: drag, save, reopen, order persisted; `Accounts.csv.bak`
      created once; other batches unaffected
- [ ] `D2Loader.ps1` hash unchanged (`Get-FileHash`)
- [ ] Desktop icon opens the app on the first click; a second click focuses the
      existing window
- [ ] No new network calls to anything except D2Emu / Battle.net

---

## Versioning and releases

Bump **all** of these together:

`app/server.js` (`VERSION`), `app/app.js` (`UI_VERSION`), `app/index.html`
(`#uiVersion`), `app/package.json`, `VERSION.txt`, `README.txt`,
`docs/README.md`, and `CHANGELOG.md`.

Then build a **flat** zip (no wrapping folder) and exclude
`bridge.config.json`, `app/node_modules/*`, `app/package-lock.json`, and the
`github/` documentation folder. See [`docs/INSTALL.md`](docs/INSTALL.md#part-3--building-a-release).

---

## Reporting bugs

Include:

1. Version from the sidebar (`UI vX` / `Bridge vX`).
2. Windows version.
3. The relevant lines from `bridge.log`.
4. The exact command from the **Command Log** tab, if it's a launch problem.
5. Whether `D2Loader.ps1` is stock (unmodified from his repo).

Please **do not** paste tokens or passwords. Redact anything that looks like
`US-…-…` or a long DPAPI blob.

---

## Credits

Contributors are credited in the README. The engine, and the reverse-engineering
that makes any of this possible, is
[Shupershuff](https://github.com/shupershuff/Diablo2RLoader)'s work.
