# 🏗 Architecture

The Command Center is deliberately small: **one Node process**, **one static UI**,
**a handful of PowerShell helpers**, and **his loader untouched at the bottom**.

```
┌─────────────────────────────┐
│ Desktop shortcut (.lnk)     │
│  → wscript.exe              │
│  → launch-command-center.vbs│
└──────────────┬──────────────┘
               │ hidden, waits for exit code
               ▼
┌─────────────────────────────┐        ┌──────────────────────────┐
│ bridge-ctl.ps1 ensure       │───────►│ bridge.log (timestamps)  │
│  • named mutex (single      │        └──────────────────────────┘
│    flight)                  │
│  • Test-Bridge (127.0.0.1)  │
│  • Start-BridgeHidden       │
│  • Wait-Bridge (40 s, retry)│
│  • Open-Ui / Focus-Ui       │
└──────────────┬──────────────┘
               │ cscript start-bridge-hidden.vbs
               ▼
┌─────────────────────────────┐        ┌──────────────────────────┐
│ node app/server.js :8787    │◄──────►│ bridge.config.json       │
│  • static UI                │        │  loader path, csv path,  │
│  • JSON API                 │        │  window state, flags     │
│  • launch queue             │        └──────────────────────────┘
│  • token helper             │
└──────────┬──────────────────┘
           │ spawn powershell
           ▼
┌─────────────────────────────┐        ┌──────────────────────────┐
│ scripts/launch-loader.ps1   │───────►│ D2Loader.ps1 (READ-ONLY) │
│  argument builder only      │        │  Shupershuff's engine    │
└─────────────────────────────┘        └──────────────────────────┘
```

---

## 1. Process model

| Process | Lifetime | Purpose |
|---|---|---|
| `wscript.exe` → `launch-command-center.vbs` | seconds | Silent launcher; waits for the helper and shows a message box on failure |
| `powershell -File bridge-ctl.ps1 ensure` | up to ~70 s | Single-flight start: mutex, health check, start, wait, focus/open UI |
| `node app/server.js` | until stopped | The bridge: serves the UI and the API |
| Chromium window | until closed | The UI itself (optional — `-nobrowser` skips it) |
| `powershell -File launch-loader.ps1 …` | per launch | Builds args and invokes `D2Loader.ps1` |
| `D2Loader.ps1` | per launch | His engine. Elevates itself, starts the game. |

Nothing is installed as a service. Closing the UI window does not kill the
bridge; `Stop-D2R-Command-Center.bat` does.

---

## 2. Why a local HTTP bridge at all?

The UI is HTML/JS. Browsers cannot spawn processes, read `config.xml`, or write
`Accounts.csv` without a native file picker. A tiny loopback HTTP server gives us
a stable, debuggable boundary:

- you can `curl` every endpoint,
- you can open the UI in any browser,
- the UI has no build step (no webpack, no bundler, no transpiler),
- and the whole thing is auditable in two files (`server.js`, `app.js`).

It binds to **127.0.0.1 only**. There is no auth layer because there is no
network surface: reaching the port already implies local code execution.

---

## 3. API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ping` | health + resolved paths + version + capabilities |
| `GET` | `/api/config` | read `config.xml` as JSON |
| `POST` | `/api/config` | set one or more keys, write back in his schema |
| `GET` | `/api/accounts-csv` | parsed `Accounts.csv` |
| `POST` | `/api/accounts-csv` | write `Accounts.csv` (same columns/quoting) |
| `GET` | `/api/batch-order` | list batches, or one batch's current order |
| `POST` | `/api/batch-order` | reorder one batch's rows in place |
| `POST` | `/api/launch` | enqueue a launch (single, batch, all, manual, close) |
| `GET` | `/api/queue` | queue depth, running job, recent history |
| `POST` | `/api/queue/clear` | cancel everything still waiting |
| `GET` | `/api/instances` | live process/game detection |
| `GET` | `/api/live-status` | Terror Zone + DClone via D2Emu |
| `POST` | `/api/browse` | native file picker (PowerShell `OpenFileDialog`) |
| `POST` | `/api/verify-loader` | sanity-check a `D2Loader.ps1` path |
| `POST` | `/api/get-token` | start Playwright token capture |
| `GET` | `/api/token-status` | poll capture progress / result |
| `POST` | `/api/secure-token` | DPAPI-encrypt a secret via `secrets.ps1` |
| `POST` | `/api/unsecure-secret` | DPAPI-decrypt (for reveal) |
| `GET`/`POST` | `/api/window-state` | persist UI window geometry |
| `POST` | `/api/open-ui` | open the UI window, or focus it if already open |
| `POST` | `/api/ui-heartbeat` | UI liveness (bridge can exit if orphaned) |

All responses are `{ok:true, …}` or `{ok:false, error:"human readable"}`. Errors
are written for humans, not stack traces.

---

## 4. The launch queue (why batches don't collide)

Battle.net allows **one token per IP at a time**. Two simultaneous loader
processes will fight over the token and both fail. His engine already launches
batch members sequentially for this reason.

The bridge enforces the same rule globally:

```
POST /api/launch → enqueueJob() → launchQueue.push()
                                 setImmediate(pumpQueue)
pumpQueue():
  if (runningJob || !launchQueue.length) return
  job = launchQueue.shift()
  spawn launch-loader.ps1 … (awaited)
  setTimeout(pumpQueue, JOB_GAP_MS)
```

Properties:

- **FIFO.** Clicking Launch on five cards queues five jobs; they run in order.
- **One at a time.** `runningJob` is a hard gate.
- **Gap between jobs.** A short settle delay lets the previous loader release
  its token before the next one asks for one.
- **Cancellable.** `/api/queue/clear` drops everything not yet started.
- **Visible.** The UI shows queue depth and the running job's command line.

The queue is in-memory only. Restarting the bridge empties it — by design, since
a queued launch whose loader never started should not silently fire later.

---

## 5. Single-flight startup

The "click the icon 3–4 times" bug had three contributing causes, all fixed in
v2.5:

1. **`localhost` vs `127.0.0.1`.** On some Windows PCs, `localhost` resolves to
   IPv6 `::1` first. Node listening on IPv4 `127.0.0.1` is then unreachable for
   `Invoke-WebRequest` until it falls back — which can exceed a short timeout.
   The health check reported "down" while the bridge was actually up, so the
   helper started a second one (which failed on the busy port) and returned an
   error. **All helpers now use `http://127.0.0.1:8787` explicitly.**

2. **No single-flight.** Rapid clicks ran several helpers concurrently. A
   **named mutex** now serialises them:

   ```powershell
   $mutex = New-Object System.Threading.Mutex($false, 'Global\D2RCommandCenterEnsure')
   $haveMutex = $mutex.WaitOne(45000)
   ```

   Second and third clicks wait for the first to finish, then observe a healthy
   bridge and simply focus the window.

3. **Silent failure.** If the bridge genuinely couldn't start, the VBS exited
   with no feedback. It now waits for the helper's exit code and shows a message
   box pointing at `bridge.log`, where every stage is timestamped.

Additionally, `/api/open-ui` returns `{opened:false, focused:true}` when a UI
window already exists, and the bridge raises it with
`WScript.Shell.AppActivate('D2R Command Center')` — so a click on an already
running app brings it forward instead of doing nothing.

---

## 6. Window geometry

The UI posts `{x,y,width,height,maximized}` to `/api/window-state` on
move/resize (debounced) and on close. The bridge stores it in
`bridge.config.json` under `windowState`. On startup the UI reads it back and
restores. Because it lives in the bridge config, it survives updates — the
updater preserves `bridge.config.json`.

---

## 7. Instance detection

`/api/instances` combines two signals:

- **Loader-side:** account IDs the bridge has launched and not yet seen exit.
- **OS-side:** whether a `D2R.exe` process is running, and its window title where
  available.

The UI polls on a heartbeat, so closing a game outside the Command Center
updates the card within a few seconds. There is also a manual **⟳ Refresh**.

---

## 8. Token capture

`app/token-helper.js` drives Edge/Chrome through `playwright-core`:

1. Navigate to `https://<region>.account.battle.net/login/en/?app=osi`.
2. Fill email → submit → fill password → submit.
3. Intercept the redirect to `http://localhost:0/?ST=…`. Port 0 is deliberately
   unreachable (`ERR_UNSAFE_PORT`), so the browser can't load it — but the URL is
   observable in the response `Location` header, the request URL, and via route
   interception.
4. Extract `ST=US-…-…`, hand it to `scripts/secrets.ps1` over **STDIN** (never
   argv, so it never shows in the process list), and write the DPAPI blob into
   the right `Accounts.csv` row.
5. If a CAPTCHA or 2FA prompt appears, the headless pass detects it and reopens a
   **visible** window with a ~3 minute budget.

`playwright-core` uses the Edge/Chrome you already have — no 300 MB browser
download.

---

## 9. Live status

Mirrors his own screens against the public D2Emu API:

```
GET https://d2emu.com/api/v1/shupertoken/aes    → {key, iv}
GET https://d2emu.com/api/v1/shupertoken/token  → AES-128-CBC token
GET https://d2emu.com/api/v1/tz      (x-emu-token) → current / next TZ
GET https://d2emu.com/api/v1/dclone  (x-emu-token) → per-region status
```

Results are cached briefly in the bridge and pushed to the sidebar drop-downs and
the Launch screen panels. If D2Emu is unreachable, the UI says so and keeps
working — nothing else depends on it.

---

## 10. File formats

**`config.xml`** — his schema, untouched. Writes are read-modify-write of a
single key, preserving unknown nodes so a future loader version's settings are
not destroyed by an older UI.

**`Accounts.csv`** — header:
`ID,Acct,AccountLabel,Batches,TimeActive,CustomLaunchArguments,AuthenticationMethod,PW,Token`
plus the window geometry columns the loader appends after a launch. Our
serialiser preserves header order and quotes only when needed, matching his
parser's expectations.

**`bridge.config.json`** — ours, not his:
`{ scriptPath, accountsCsvPath, hideLoaderWindow, noBrowser, windowState }`.

---

## 11. Security posture

- Loopback-only listener, no remote surface.
- Secrets encrypted with DPAPI (CurrentUser), same as his loader.
- Secrets passed over STDIN, never argv.
- No telemetry, no analytics, no phone-home, no remote code loading.
- The UI is static files served from disk; there is no CDN and no remote script.
- The updater refuses to write outside its own install directory and never
  touches `D2Loader.ps1`.

See [`../SECURITY.md`](../SECURITY.md) for the reporting process.
