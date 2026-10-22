/* ============================================================
   D2R Command Center — Local Launcher Bridge
   ------------------------------------------------------------
   Optional. Serves the UI and lets the "Launch" buttons actually
   run Shupershuff's D2Loader.ps1 on Windows.

   Run:   node server.js
   Then open:  http://localhost:8787

   The bridge ONLY executes commands that call D2Loader.ps1 with
   the loader's own parameters. It never runs arbitrary shell.

   v1.1 adds automated token acquisition:
     POST /api/get-token      -> starts a login job (headless browser)
     GET  /api/token-status   -> poll job progress / result
     POST /api/secure-token   -> extract+secure a pasted URL/token into the CSV
     POST /api/unsecure-secret-> decrypt a stored secret (diagnostics)

   v1.2 adds UI-managed configuration:
     GET  /api/config         -> current loader/CSV paths + status
     POST /api/config         -> save loader/CSV paths (writes bridge.config.json)
     POST /api/browse         -> native Windows file picker (returns a path)
   ============================================================ */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, ".");          // app/  (web files live here)
const BASE = path.resolve(__dirname, "..");         // install root (assets/, data/, scripts/)
const PORT = process.env.PORT || 8787;
const CONFIG_FILE = path.join(BASE, "bridge.config.json");
const VERSION = "2.7";

/* ---- background / headless mode ----
   --no-browser (or D2R_NO_BROWSER=1) => never open a browser window.
   Used when the Command Center is started "in the background". */
const NO_BROWSER = process.env.D2R_NO_BROWSER === "1"
  || process.argv.includes("--no-browser")
  || process.argv.includes("--hidden");

/* ---- single-UI tracking ----
   The page pings /api/ui-heartbeat every few seconds; we remember the
   last time we heard from a UI so we never open a SECOND window. */
let lastUiSeen = 0;

/* ---- saved Command Center window geometry (v2.4) ----
   The UI reports its own window position/size and we persist it in
   bridge.config.json, then pass it back to the browser with
   --window-position / --window-size so the window opens exactly where
   the user last left it. */
let WINDOW_STATE = null;

/* ---- are we running elevated (as admin)? ----
   If the bridge is already elevated it can launch the loader WITHOUT a
   fresh UAC prompt and WITHOUT the -Verb RunAs console flash. */
let ELEVATED = false;
function detectElevation() {
  if (process.platform !== "win32") { ELEVATED = false; return; }
  try {
    const r = spawnSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    ], { windowsHide: true, timeout: 8000 });
    ELEVATED = String(r.stdout || "").trim().toLowerCase() === "true";
  } catch (e) { ELEVATED = false; }
}

/* ---- locate the loader script ----
   Set D2LOADER_PATH env var, or drop a bridge.config.json next to
   this file:  { "scriptPath": "C:/path/to/Diablo2RLoader/D2Loader.ps1" }
   You can ALSO set it from the UI (Configuration -> Loader & Bridge),
   which writes bridge.config.json for you. */
let SCRIPT_PATH = process.env.D2LOADER_PATH || "";
let HIDE_LOADER_WINDOW = true;   // run the loader with a hidden window (no flash)
let ACCOUNTS_CSV = process.env.D2R_ACCOUNTS_CSV || "";

function loadBridgeConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    if (cfg.scriptPath) SCRIPT_PATH = cfg.scriptPath;
    if (cfg.accountsCsvPath) ACCOUNTS_CSV = cfg.accountsCsvPath;
    if (typeof cfg.hideLoaderWindow === "boolean") HIDE_LOADER_WINDOW = cfg.hideLoaderWindow;
    if (cfg.windowState && typeof cfg.windowState === "object") WINDOW_STATE = cfg.windowState;
  } catch (e) { /* no config file — fine */ }
}
loadBridgeConfig();

/* Persist loader/CSV paths so they survive a restart. */
function saveBridgeConfig({ scriptPath, accountsCsvPath, hideLoaderWindow, windowState }) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (e) {}
  if (scriptPath != null) cfg.scriptPath = scriptPath;
  if (accountsCsvPath != null) cfg.accountsCsvPath = accountsCsvPath;
  if (typeof hideLoaderWindow === "boolean") cfg.hideLoaderWindow = hideLoaderWindow;
  if (windowState && typeof windowState === "object") cfg.windowState = windowState;
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8"); } catch (e) {}
  return cfg;
}

function fileExists(p) { try { return !!(p && fs.existsSync(p)); } catch (e) { return false; } }

/* Resolve where Accounts.csv lives (the real one, if we can find it). */
function resolveCsvPath() {
  if (ACCOUNTS_CSV && fs.existsSync(ACCOUNTS_CSV)) return ACCOUNTS_CSV;
  if (SCRIPT_PATH) {
    const guess = path.join(path.dirname(SCRIPT_PATH), "Accounts.csv");
    if (fs.existsSync(guess)) return guess;
  }
  const bundled = path.join(BASE, "data", "Accounts.csv");
  return bundled;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/* ============================================================
   Small CSV helpers (RFC-4180-ish, quote aware)
   ============================================================ */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && !(r.length === 1 && r[0] === ""));
}

function csvEscape(v) {
  v = v == null ? "" : String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function serializeCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

/* Read Accounts.csv into a table with the column indexes we care about. */
function readCsvTable() {
  const p = resolveCsvPath();
  if (!fileExists(p)) throw new Error("Accounts.csv not found at " + p);
  const rows = parseCsv(fs.readFileSync(p, "utf8"));
  if (!rows.length) throw new Error("Accounts.csv is empty.");
  const headers = rows[0].map((h) => h.trim());
  const idx = (n) => headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  return {
    p, rows, headers,
    iId: idx("ID"),
    iAcct: idx("Acct"),
    iLabel: idx("AccountLabel"),
    iBatches: idx("Batches"),
  };
}

/* Update the Token (and optionally AuthenticationMethod) for one account row. */
function writeTokenToCsv(csvPath, { accountId, email, token, setAuthMethod }) {
  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Accounts.csv is empty.");
  const headers = rows[0].map((h) => h.trim());
  const idx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iId = idx("ID"), iAcct = idx("Acct"), iTok = idx("Token"), iAuth = idx("AuthenticationMethod");
  if (iTok < 0) throw new Error("Accounts.csv has no 'Token' column.");

  let hit = -1;
  for (let r = 1; r < rows.length; r++) {
    const rid = (rows[r][iId] || "").trim();
    const racct = (rows[r][iAcct] || "").trim();
    if (accountId != null && String(accountId) !== "" && rid === String(accountId)) { hit = r; break; }
    if (hit < 0 && email && racct && racct.toLowerCase() === String(email).toLowerCase()) hit = r;
  }
  if (hit < 0) throw new Error("Could not find the account row to update (id=" + accountId + ", email=" + email + ").");

  rows[hit][iTok] = token;
  if (setAuthMethod && iAuth >= 0) rows[hit][iAuth] = "Token";

  // keep a timestamped backup once per session
  const bak = csvPath + ".bak";
  try { if (!fs.existsSync(bak)) fs.copyFileSync(csvPath, bak); } catch (e) {}
  fs.writeFileSync(csvPath, serializeCsv(rows), "utf8");
  return { row: hit, id: rows[hit][iId], label: (rows[hit][idx("AccountLabel")] || "").trim() };
}

/* Read a stored (possibly encrypted) password for an account. */
function readStoredPassword(csvPath, { accountId, email }) {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const headers = rows[0].map((h) => h.trim());
  const idx = (n) => headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const iId = idx("ID"), iAcct = idx("Acct"), iPw = idx("PW");
  if (iPw < 0) return "";
  for (let r = 1; r < rows.length; r++) {
    const rid = (rows[r][iId] || "").trim();
    const racct = (rows[r][iAcct] || "").trim();
    if ((accountId != null && String(accountId) !== "" && rid === String(accountId)) ||
        (email && racct && racct.toLowerCase() === String(email).toLowerCase())) {
      return (rows[r][iPw] || "").trim();
    }
  }
  return "";
}

/* ============================================================
   DPAPI secret helpers (shell out to secrets.ps1 on Windows)
   ============================================================ */
function runSecrets(mode, value) {
  return new Promise((resolve, reject) => {
    const script = path.join(BASE, "scripts", "secrets.ps1");
    const isWin = process.platform === "win32";
    const bin = isWin ? "powershell.exe" : "pwsh";
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", mode];
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (e) { return reject(e); }
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error("Could not run PowerShell: " + e.message)));
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || ("secrets.ps1 exited " + code)));
    });
    child.stdin.write(value == null ? "" : String(value));
    child.stdin.end();
  });
}

/* ============================================================
   Token job manager (long-running login, polled by the UI)
   ============================================================ */
const jobs = new Map();
const JOB_TTL = 10 * 60 * 1000;

function newJob() {
  const id = crypto.randomBytes(8).toString("hex");
  const job = { id, status: "running", events: [], result: null, createdAt: Date.now() };
  jobs.set(id, job);
  // GC old jobs
  for (const [k, v] of jobs) if (Date.now() - v.createdAt > JOB_TTL) jobs.delete(k);
  return job;
}

async function runTokenJob(job, opts) {
  const push = (e) => { job.events.push({ t: Date.now(), ...e }); };
  try {
    const helper = require("./token-helper.js");

    let password = opts.password;
    if (!password && opts.useSavedPassword) {
      const stored = readStoredPassword(resolveCsvPath(), opts);
      if (!stored) throw new Error("No saved password found for this account — enter it manually.");
      push({ stage: "decrypt-password", message: "Decrypting saved password…" });
      password = await runSecrets("unsecure", stored);
      if (!password) throw new Error("Could not decrypt the saved password.");
    }
    if (!password) throw new Error("A password is required.");

    push({ stage: "login", message: opts.headless ? "Signing in to Battle.net (headless)…" : "Opening a visible Battle.net window…" });
    const res = await helper.getToken({
      email: opts.email,
      password,
      region: opts.region,
      headless: opts.headless !== false,
      visibleFallback: opts.visibleFallback !== false,
      onEvent: (e) => push(e),
    });

    if (!res.ok) {
      job.status = "error";
      job.result = { ok: false, error: res.error || "Login failed.", challenge: res.challenge || null };
      push({ stage: "error", message: job.result.error });
      return;
    }

    push({ stage: "token", message: "Token captured: " + maskToken(res.token) });

    let encrypted = false;
    let stored = res.token;
    if (opts.encrypt !== false) {
      try {
        stored = await runSecrets("secure", res.token);
        encrypted = stored.length >= 200;
        push({ stage: "encrypt", message: "Token secured with Windows DPAPI (matches loader format)." });
      } catch (e) {
        push({ stage: "warn", message: "Could not encrypt token (" + e.message + "); writing plain text." });
        stored = res.token;
      }
    }

    let csvInfo = null;
    if (opts.writeCsv !== false && opts.accountId != null) {
      try {
        csvInfo = writeTokenToCsv(resolveCsvPath(), {
          accountId: opts.accountId, email: opts.email, token: stored, setAuthMethod: opts.setAuthMethod,
        });
        push({ stage: "csv", message: "Wrote token to Accounts.csv (account " + csvInfo.id + ")." });
      } catch (e) {
        push({ stage: "warn", message: "Could not write Accounts.csv: " + e.message });
      }
    }

    job.status = "done";
    job.result = {
      ok: true,
      token: res.token,
      masked: maskToken(res.token),
      storedToken: stored,
      encrypted,
      csvUpdated: !!csvInfo,
      csvPath: resolveCsvPath(),
      usedVisibleFallback: !!res.usedVisibleFallback,
    };
  } catch (e) {
    job.status = "error";
    job.result = { ok: false, error: e.message || String(e), code: e.code || null };
    job.events.push({ t: Date.now(), stage: "error", message: job.result.error });
  }
}

function maskToken(t) {
  if (!t) return "";
  if (t.length <= 14) return t;
  return t.slice(0, 8) + "…" + t.slice(-6);
}

/* ============================================================
   HTTP plumbing
   ============================================================ */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 2e5) reject(new Error("too large")); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/* ---- build a SAFE PowerShell invocation for the loader ----
   We deliberately NEVER nest `powershell -Command "powershell -File ..."`.
   Windows mangles the inner quotes, so the loader silently never starts.
   Instead we spawn powershell.exe directly with -File and a discrete argument
   array, which Windows passes through verbatim.

   The loader's real parameter is -AccountUsername (it matches either the
   account's ID or its Acct/email), so we pass the ID. */
function buildLoaderInvocation(body) {
  if (!SCRIPT_PATH) {
    return { error: "Loader path is not set. Open Configuration \u2192 Loader & Bridge and point it at D2Loader.ps1." };
  }
  if (!fileExists(SCRIPT_PATH)) {
    return { error: "D2Loader.ps1 was not found at: " + SCRIPT_PATH };
  }

  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_PATH];
  const mode = String(body.mode || "");

  if (mode === "all") {
    args.push("-All", "True");
  } else if (mode === "batch") {
    if (body.batch == null || String(body.batch) === "") return { error: "No batch was specified." };
    args.push("-Batch", String(body.batch));
  } else if (mode === "account") {
    if (body.account == null || String(body.account) === "") return { error: "No account was specified." };
    args.push("-AccountUsername", String(body.account));
  } else if (mode === "close") {
    args.push("-Close", body.all ? "all" : String(body.account || "all"));
  } else {
    return { error: "Unknown launch mode: " + (mode || "(none)") };
  }

  if (body.region != null && String(body.region) !== "") {
    args.push("-Region", String(body.region));
  }

  return { args };
}

/* ---- build the PowerShell that launches the loader in its OWN window ----
   The loader is an interactive CONSOLE app that must run elevated. Spawning
   powershell.exe ourselves with detached+stdio:"ignore" gave it a broken
   console, so the loader's own self-elevation (Start-Process -Verb RunAs)
   silently did nothing and the game never started. Instead we ask PowerShell
   to Start-Process the loader for us: that hands it a brand-new console
   window AND elevates it up-front (-Verb RunAs), so the loader never has to
   relaunch itself. */
function buildStartProcessCmd(inv, scriptDir) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const quote = (a) => (/[\s"]/.test(String(a)) ? '"' + String(a).replace(/"/g, '\\"') + '"' : String(a));

  // inv.args = [-NoProfile, -ExecutionPolicy, Bypass, -File, <loader>, ...loaderParams]
  const loaderParams = inv.args.slice(5);

  // Always run the loader through our wrapper. The wrapper can (a) hide the
  // console window and (b) give that window OUR icon - the loader's own
  // console would otherwise show the generic PowerShell icon. -Hide controls
  // whether the console is hidden (the user's "hide loader window" setting).
  const wrapperPath = path.join(BASE, "scripts", "launch-loader.ps1");
  const fileArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", wrapperPath,
                    "-LoaderPath", SCRIPT_PATH, "-Hide", (HIDE_LOADER_WINDOW ? "1" : "0")]
    .concat(loaderParams);
  const windowStyle = HIDE_LOADER_WINDOW ? "Hidden" : "Normal";

  let cmd =
    "Start-Process -FilePath 'powershell.exe'" +
    " -ArgumentList " + q(fileArgs.map(quote).join(" ")) +
    " -WorkingDirectory " + q(scriptDir) +
    " -WindowStyle " + windowStyle;
  // If we're already elevated we skip -Verb RunAs: the wrapper inherits admin,
  // -WindowStyle Hidden actually works, and there is no UAC prompt or flash.
  if (!ELEVATED) cmd += " -Verb RunAs";
  return cmd;
}

/* ============================================================
   LAUNCH QUEUE  (v2.2)
   ------------------------------------------------------------
   Battle.net only allows ONE token login per IP at a time. The
   loader's own batch mode respects that: it opens one account,
   waits until it reaches character select, then opens the next.

   So the bridge never runs two loaders at once. Every launch or
   close request joins a first-in-first-out queue, and the next
   job only starts once the previous loader process has EXITED
   (the loader exits after the account reaches character select).
   ============================================================ */
const JOB_TIMEOUT_MS = 5 * 60 * 1000;   // per account: give up waiting on a loader after 5 min
const JOB_GAP_MS = 2500;                // small breather between loaders
const FAKE_LAUNCH_MS = +process.env.D2R_FAKE_LAUNCH_MS || 0; // test hook (non-Windows)
const launchQueue = [];
let runningJob = null;
let jobSeq = 0;
const jobHistory = [];

function jobView(j) {
  return {
    id: j.id, label: j.label, mode: j.mode, ids: j.ids, status: j.status,
    createdAt: j.createdAt, startedAt: j.startedAt || null, finishedAt: j.finishedAt || null,
    error: j.error || null,
  };
}

function enqueueJob(body, inv) {
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((s) => /^[\w.@+-]{1,64}$/.test(s)).slice(0, 50) : [];
  const job = {
    id: ++jobSeq,
    mode: String(body.mode),
    label: typeof body.label === "string" ? body.label.slice(0, 80) : String(body.mode),
    ids,
    inv,
    status: "queued",
    createdAt: Date.now(),
  };
  launchQueue.push(job);
  setImmediate(pumpQueue);
  return job;
}

async function pumpQueue() {
  if (runningJob || !launchQueue.length) return;
  const job = launchQueue.shift();
  runningJob = job;
  job.status = "running";
  job.startedAt = Date.now();
  console.log("[" + new Date().toLocaleTimeString() + "] QUEUE start #" + job.id + " (" + job.label + ")  waiting: " + launchQueue.length);
  try {
    const r = await runLoaderJob(job);
    job.status = r.status;
    if (r.error) job.error = r.error;
  } catch (e) {
    job.status = "failed";
    job.error = e.message;
  }
  job.finishedAt = Date.now();
  console.log("[" + new Date().toLocaleTimeString() + "] QUEUE done  #" + job.id + " -> " + job.status + (job.error ? " (" + job.error + ")" : ""));
  jobHistory.unshift(job);
  if (jobHistory.length > 20) jobHistory.length = 20;
  runningJob = null;
  setTimeout(pumpQueue, JOB_GAP_MS);
}

/* Start ONE loader and resolve only when that loader process exits. */
async function runLoaderJob(job) {
  if (FAKE_LAUNCH_MS) {
    await new Promise((r) => setTimeout(r, FAKE_LAUNCH_MS));
    return { status: "done" };
  }
  const scriptDir = path.dirname(SCRIPT_PATH);
  const startCmd = buildStartProcessCmd(job.inv, scriptDir);
  // -PassThru + WaitForExit waits for the LOADER only. (Start-Process -Wait
  // would also wait for its child D2R.exe, i.e. until the game is closed.)
  const psCmd =
    "$ErrorActionPreference='Stop'; " +
    "$p = " + startCmd + " -PassThru; " +
    "if ($p) { try { $p.WaitForExit() } catch { while (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 800 } } }";
  console.log("[" + new Date().toLocaleTimeString() + "] LAUNCH:", startCmd);
  // Batch / all jobs open several accounts in one loader, so allow more time.
  const n = Math.max(1, job.ids.length);
  const timeout = JOB_TIMEOUT_MS * n;
  const r = await runCapture("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCmd], timeout);
  if (r.timedOut) return { status: "timeout", error: "The loader was still running after " + Math.round(timeout / 60000) + " minutes - moved on to the next launch." };
  const errOut = (r.err || "").trim();
  if (errOut) return { status: "failed", error: errOut.slice(0, 400) };
  return { status: "done" };
}

function queueInfo() {
  return {
    running: runningJob ? jobView(runningJob) : null,
    queued: launchQueue.map(jobView),
    recent: jobHistory.slice(0, 8).map(jobView),
  };
}

/* ============================================================
   LIVE INSTANCE DETECTION  (v2.2)
   ------------------------------------------------------------
   The loader renames every game window to
       "<ID> - <Label> (<region>) - Diablo II: Resurrected"
   so we can tell which accounts are open just by reading the
   D2R window titles. This also notices games you closed some
   other way (X button, Task Manager, crash...).
   ============================================================ */
let instCache = { at: 0, data: null };
let instPending = null;
const TITLE_RE = /^\s*(\d+)\s+-\s+.*-\s*Diablo II: Resurrected\s*$/i;

function parseInstanceLines(text) {
  const open = new Set();
  let total = 0, untitled = 0;
  String(text || "").split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line) return;
    total++;
    const title = line.slice(line.indexOf("|") + 1);
    const m = title.match(TITLE_RE);
    if (m) open.add(String(+m[1])); else untitled++;
  });
  return { open: Array.from(open), total, untitled };
}

async function getInstances(force) {
  const fake = process.env.D2R_FAKE_INSTANCES_FILE;
  if (fake) {
    let text = "";
    try { text = fs.readFileSync(fake, "utf8"); } catch (e) {}
    return Object.assign({ ok: true, supported: true, checkedAt: Date.now() }, parseInstanceLines(text));
  }
  if (process.platform !== "win32") return { ok: true, supported: false, open: [], total: 0, untitled: 0 };
  if (!force && instCache.data && Date.now() - instCache.at < 2000) return instCache.data;
  if (instPending) return instPending;
  instPending = (async () => {
    const ps = "Get-Process -Name D2R -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.Id + '|' + $_.MainWindowTitle }";
    const r = await runCapture("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], 10000);
    const data = Object.assign({ ok: true, supported: true, checkedAt: Date.now() }, parseInstanceLines(r.out));
    instCache = { at: Date.now(), data };
    return data;
  })();
  try { return await instPending; } finally { instPending = null; }
}

/* ---- run a command and capture stdout/stderr with a timeout ---- */
function runCapture(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, code: -1, out: "", err: e.message });
    }
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} finish({ ok: false, code: -1, out, err, timedOut: true }); }, timeoutMs || 15000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => { clearTimeout(timer); finish({ ok: false, code: -1, out, err: e.message }); });
    child.on("close", (code) => { clearTimeout(timer); finish({ ok: code === 0, code, out, err }); });
  });
}

/* ============================================================
   Live Status  (v2.3)  —  Terror Zones + DClone via D2Emu.com
   ------------------------------------------------------------
   Mirrors what Shupershuff's loader shows on its TZ / DClone
   screens, using the same public D2Emu API his script uses:
     1. GET https://d2emu.com/api/v1/shupertoken/aes   -> {key,iv}
     2. GET https://d2emu.com/api/v1/shupertoken/token -> {token} (AES-128-CBC)
     3. GET https://d2emu.com/api/v1/tz      (x-emu-token) -> current/next TZ
     4. GET https://d2emu.com/api/v1/dclone  (x-emu-token) -> per-region status
   The token is only held in memory for a short while; nothing is stored.
   ============================================================ */
const EMU_UA = "Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.19041.1";
const EMU_USER = "shupershuff";
const EMU_TOKEN_TTL_MS = 30 * 60 * 1000;
const LIVE_CACHE_MS = 60 * 1000;
let emuToken = null;                 // { value, at }
let liveCache = { at: 0, data: null };
let livePending = null;

function httpsGetJson(urlStr, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(e); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: "GET",
      headers: Object.assign({ "Accept": "application/json" }, headers || {}),
      timeout: timeoutMs || 8000,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error("D2Emu HTTP " + res.statusCode));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("D2Emu returned unexpected data.")); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("D2Emu request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

function decryptEmuToken(encB64, key, iv) {
  const d = crypto.createDecipheriv("aes-128-cbc", Buffer.from(String(key), "utf8"), Buffer.from(String(iv), "utf8"));
  d.setAutoPadding(true);
  return Buffer.concat([d.update(Buffer.from(encB64, "base64")), d.final()]).toString("utf8");
}

async function getEmuToken(force) {
  const now = Date.now();
  if (!force && emuToken && now - emuToken.at < EMU_TOKEN_TTL_MS) return emuToken.value;
  const hdr = { "User-Agent": EMU_UA, "x-emu-username": EMU_USER };
  const aes = await httpsGetJson("https://d2emu.com/api/v1/shupertoken/aes", hdr, 8000);
  const tok = await httpsGetJson("https://d2emu.com/api/v1/shupertoken/token", hdr, 8000);
  if (!aes || !aes.key || !aes.iv || !tok || !tok.token) throw new Error("D2Emu did not return a token (the API may be down).");
  const value = decryptEmuToken(tok.token, aes.key, aes.iv);
  emuToken = { value, at: now };
  return value;
}

/* level id -> name, parsed once from data/levels.txt */
let levelNames = null;
function getLevelNames() {
  if (levelNames) return levelNames;
  levelNames = {};
  try {
    const txt = fs.readFileSync(path.join(BASE, "data", "levels.txt"), "utf8");
    txt.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*(\d+)\s*-\s*(.+?)\s*$/);
      if (m) levelNames[m[1]] = m[2];
    });
  } catch (e) {}
  return levelNames;
}
function levelList(ids) {
  const map = getLevelNames();
  return (Array.isArray(ids) ? ids : []).map((id) => map[String(id)] || ("Level " + id));
}

const IMMUNITY = { c: "Cold", f: "Fire", l: "Lightning", m: "Magic", p: "Poison", ph: "Physical" };
function immunityList(arr) {
  return (Array.isArray(arr) ? arr : []).map((k) => IMMUNITY[String(k).toLowerCase()] || String(k));
}

function buildDclone(raw) {
  const out = { us: [], eu: [], kr: [], cn: [] };
  Object.keys(raw || {}).forEach((key) => {
    const v = raw[key];
    if (!v || typeof v !== "object") return;
    const status = Number(v.status);
    if (!isFinite(status)) return;
    const progress = status + 1; // 1..6 (6 = walked)
    const k = key.toLowerCase();
    let region = null;
    if (k.startsWith("us")) region = "us";
    else if (k.startsWith("eu")) region = "eu";
    else if (k.startsWith("kr")) region = "kr";
    else if (k.startsWith("cn")) region = "cn";
    if (!region) return;
    const hc = /hardcore/.test(k);
    const nl = /nonladder/.test(k);
    const rotw = /rotw/.test(k);
    const base = (hc ? "HC" : "SC") + (nl ? "" : "L");
    const tag = base + "-" + region.toUpperCase() + (rotw ? "-ROTW" : "");
    const name = (hc ? "Hardcore " : "Softcore ") + (nl ? "Non-Ladder" : "Ladder") + (rotw ? " (ROTW)" : "");
    out[region].push({ tag, name, progress, updatedAt: v.updated_at || null });
  });
  Object.keys(out).forEach((r) => out[r].sort((a, b) => (b.progress - a.progress) || a.name.localeCompare(b.name)));
  return out;
}

async function getLiveStatus(force) {
  if (!force && liveCache.data && Date.now() - liveCache.at < LIVE_CACHE_MS) return liveCache.data;
  if (livePending) return livePending;
  livePending = (async () => {
    let token = await getEmuToken(false);
    const hdr = { "User-Agent": EMU_UA, "x-emu-username": EMU_USER, "x-emu-token": token };
    let tz = null, dc = null;
    try { tz = await httpsGetJson("https://d2emu.com/api/v1/tz", hdr, 8000); } catch (e) {}
    try { dc = await httpsGetJson("https://d2emu.com/api/v1/dclone", hdr, 8000); } catch (e) {}
    // If the token was stale, refresh once and retry.
    if ((!tz || tz.status === "ERROR") && (!dc || dc.status === "ERROR")) {
      token = await getEmuToken(true);
      const hdr2 = { "User-Agent": EMU_UA, "x-emu-username": EMU_USER, "x-emu-token": token };
      try { tz = await httpsGetJson("https://d2emu.com/api/v1/tz", hdr2, 8000); } catch (e) {}
      try { dc = await httpsGetJson("https://d2emu.com/api/v1/dclone", hdr2, 8000); } catch (e) {}
    }
    const now = Math.floor(Date.now() / 1000);
    const data = {
      ok: true, source: "D2Emu.com", fetchedAt: Date.now(),
      tz: (tz && tz.current) ? {
        current: levelList(tz.current), currentIds: (tz.current || []).map(String),
        currentSuperuniques: tz.current_superuniques || [],
        currentBossPacks: tz.current_num_boss_packs || null,
        currentImmunities: immunityList(tz.current_immunities),
        currentStartUtc: tz.current_terror_time_utc || null,
        next: levelList(tz.next), nextIds: (tz.next || []).map(String),
        nextSuperuniques: tz.next_superuniques || [],
        nextBossPacks: tz.next_num_boss_packs || null,
        nextImmunities: immunityList(tz.next_immunities),
        nextStartUtc: tz.next_terror_time_utc || null,
        nextAvailableUtc: tz.next_available_time_utc || null,
        nextAvailable: !tz.next_available_time_utc || tz.next_available_time_utc <= now,
      } : null,
      dclone: dc ? buildDclone(dc) : null,
    };
    liveCache = { at: Date.now(), data };
    return data;
  })();
  try { return await livePending; } finally { livePending = null; }
}

/* ---- guard: only allow the loader's own command shape ---- */
function isAllowed(command) {
  if (typeof command !== "string") return false;
  if (command.length > 600) return false;
  if (!/^powershell\b/i.test(command.trim())) return false;
  if (!/D2Loader\.ps1/i.test(command)) return false;
  if (/[;&|`$><\n\r]/.test(command.replace(/-ExecutionPolicy Bypass/, ""))) return false;
  return true;
}

/* ---- can we actually automate a browser? ---- */
function tokenHelperAvailable() {
  try { require("./token-helper.js").loadPlaywright(); return true; }
  catch (e) { return false; }
}

/* ---- current bridge configuration, for the UI ---- */
function configInfo() {
  const csv = resolveCsvPath();
  return {
    ok: true,
    scriptPath: SCRIPT_PATH || null,
    scriptExists: fileExists(SCRIPT_PATH),
    accountsCsvPath: ACCOUNTS_CSV || null,
    csvPath: csv,
    csvExists: fileExists(csv),
    configFile: CONFIG_FILE,
    configFileExists: fileExists(CONFIG_FILE),
    platform: process.platform,
    tokenHelper: tokenHelperAvailable(),
    hideLoaderWindow: HIDE_LOADER_WINDOW,
    elevated: ELEVATED,
    noBrowser: NO_BROWSER,
    version: VERSION,
  };
}

/* ---- native "Browse…" file picker (Windows only) ----
   Opens the real Windows file dialog via PowerShell/WinForms and
   returns the chosen path. Falls back gracefully (the UI lets you
   type the path) on any other platform. */
function pickFile(kind) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") return reject(new Error("File picker is only available on Windows."));
    const isCsv = kind === "csv";
    const title = isCsv ? "Select Accounts.csv" : "Select D2Loader.ps1";
    const filter = isCsv
      ? "CSV files (*.csv)|*.csv|All files (*.*)|*.*"
      : "D2Loader.ps1|D2Loader.ps1|PowerShell scripts (*.ps1)|*.ps1|All files (*.*)|*.*";
    const initial = (SCRIPT_PATH && SCRIPT_PATH.replace(/[\\/][^\\/]*$/, "")) || "";
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

    /* The TopMost *owner* form is the key to making the dialog reliably appear
       IN FRONT on Windows 10/11 when the picker is started by a background
       process (our Node bridge). Without an owner window the dialog can open
       BEHIND the browser and look like "nothing happened" - which is exactly
       the bug being fixed here. */
    const lines = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.OpenFileDialog",
      "$d.Title = " + q(title),
      "$d.Filter = " + q(filter),
      "$d.Multiselect = $false",
      "$d.RestoreDirectory = $true",
      "$d.CheckFileExists = $true",
    ];
    if (initial) lines.push("$d.InitialDirectory = " + q(initial));
    lines.push(
      "$owner = New-Object System.Windows.Forms.Form",
      "$owner.TopMost = $true",
      "$owner.ShowInTaskbar = $false",
      "$owner.FormBorderStyle = 'None'",
      "$owner.StartPosition = 'CenterScreen'",
      "$owner.Width = 1; $owner.Height = 1; $owner.Opacity = 0",
      "$owner.Show()",
      "$owner.Activate()",
      "$r = $d.ShowDialog($owner)",
      "$owner.Close()",
      "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }"
    );
    const ps = lines.join("\r\n");

    let child;
    try {
      child = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true });
    } catch (e) { return reject(e); }
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error((err || "").trim() || ("file picker exited " + code)));
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  /* ---- API: ping ---- */
  if (url.pathname === "/api/ping") {
    return json(res, 200, configInfo());
  }

  /* ---- API: read the current bridge config ---- */
  if (url.pathname === "/api/config" && req.method === "GET") {
    return json(res, 200, configInfo());
  }

  /* ---- API: save the loader / CSV paths (from the UI) ---- */
  if (url.pathname === "/api/config" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const scriptPath = typeof body.scriptPath === "string" ? body.scriptPath.trim() : undefined;
      const accountsCsvPath = typeof body.accountsCsvPath === "string" ? body.accountsCsvPath.trim() : undefined;
      const hideLoaderWindow = typeof body.hideLoaderWindow === "boolean" ? body.hideLoaderWindow : undefined;
      if (scriptPath !== undefined) SCRIPT_PATH = scriptPath;
      if (accountsCsvPath !== undefined) ACCOUNTS_CSV = accountsCsvPath;
      if (hideLoaderWindow !== undefined) HIDE_LOADER_WINDOW = hideLoaderWindow;
      saveBridgeConfig({ scriptPath, accountsCsvPath, hideLoaderWindow });
      console.log("[" + new Date().toLocaleTimeString() + "] CONFIG saved: loader=" + (SCRIPT_PATH || "(none)") + "  csv=" + (ACCOUNTS_CSV || "(auto)"));
      return json(res, 200, configInfo());
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  /* ---- API: native Browse… file picker (Windows) ---- */
  /* ---- API: UI heartbeat (lets the bridge know a UI window is open) ---- */
  if (url.pathname === "/api/ui-heartbeat") {
    lastUiSeen = Date.now();
    return json(res, 200, { ok: true });
  }

  /* ---- API: save the Command Center window size + position (v2.4) ---- */
  if (url.pathname === "/api/window-state" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const x = clampInt(body.x, -10000, 10000);
      const y = clampInt(body.y, -10000, 10000);
      const w = clampInt(body.w, 640, 6000);
      const h = clampInt(body.h, 480, 4000);
      if (x == null || y == null || w == null || h == null) {
        return json(res, 200, { ok: false, error: "invalid window bounds" });
      }
      WINDOW_STATE = { x, y, w, h };
      saveBridgeConfig({ windowState: WINDOW_STATE });
      return json(res, 200, { ok: true, windowState: WINDOW_STATE });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  if (url.pathname === "/api/window-state" && req.method === "GET") {
    return json(res, 200, { ok: true, windowState: WINDOW_STATE });
  }

  /* ---- API: open the UI window (no-op if one is already open) ---- */
  if (url.pathname === "/api/open-ui" && req.method === "POST") {
    const fresh = (Date.now() - lastUiSeen) < 12000;
    if (fresh) {
      const focused = focusUiWindow();
      return json(res, 200, { ok: true, opened: false, focused, note: "UI already open" });
    }
    openUiWindow();
    return json(res, 200, { ok: true, opened: true });
  }

  if (url.pathname === "/api/browse" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const picked = await pickFile(body.kind === "csv" ? "csv" : "loader");
      return json(res, 200, { ok: true, path: picked || null, cancelled: !picked });
    } catch (e) {
      // Non-fatal: the UI simply keeps the text box editable.
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  /* ---- API: launch ---- */
  if (url.pathname === "/api/launch" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const isWin = process.platform === "win32";

      /* New, robust path: the UI sends a structured intent and we build the
         powershell argument array ourselves (no nested quoting). */
      if (body.mode) {
        const inv = buildLoaderInvocation(body);
        if (inv.error) return json(res, 200, { ok: false, error: inv.error });

        const pretty = "powershell " + inv.args.map((a) => (/\s/.test(a) ? '"' + a + '"' : a)).join(" ");
        if (body.dryRun) return json(res, 200, { ok: true, dryRun: true, args: inv.args, command: pretty, startProcess: buildStartProcessCmd(inv, path.dirname(SCRIPT_PATH)) });

        if (!isWin && !FAKE_LAUNCH_MS) {
          return json(res, 200, { ok: false, error: "Launching the loader is only supported on Windows (this host is " + process.platform + ")." });
        }

        /* v2.2: never start a loader while another one is still running.
           Join the queue; the queue starts the next loader only after the
           previous one has exited (= its account reached character select). */
        const job = enqueueJob(body, inv);
        const position = launchQueue.indexOf(job) + 1; // 0 = starting now
        const ahead = (runningJob && runningJob !== job ? 1 : 0) + Math.max(0, position - 1);
        return json(res, 200, {
          ok: true, queued: true, jobId: job.id, ahead, command: pretty,
          note: ahead ? ("Queued - " + ahead + " launch" + (ahead > 1 ? "es" : "") + " ahead of it. They run one at a time.") : "Starting now.",
        });
      }

      /* Legacy path: a raw command string (kept for compatibility). */
      const command = body.command || "";
      if (!isAllowed(command)) {
        return json(res, 400, { ok: false, error: "Command rejected by safety guard." });
      }
      let finalCmd = command;
      if (SCRIPT_PATH) finalCmd = command.replace(/D2Loader\.ps1/i, SCRIPT_PATH.replace(/\\/g, "/"));

      const child = isWin
        ? spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-Command", finalCmd], { detached: true, stdio: "ignore" })
        : spawn("sh", ["-c", finalCmd], { detached: true, stdio: "ignore" });
      child.unref();
      console.log("[" + new Date().toLocaleTimeString() + "] LAUNCH:", finalCmd);
      return json(res, 200, { ok: true, command: finalCmd });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  /* ---- API: launch queue status (v2.2) ---- */
  if (url.pathname === "/api/queue" && req.method === "GET") {
    return json(res, 200, Object.assign({ ok: true }, queueInfo()));
  }

  /* ---- API: cancel everything still waiting in the queue (v2.2) ---- */
  if (url.pathname === "/api/queue/clear" && req.method === "POST") {
    const n = launchQueue.length;
    launchQueue.splice(0).forEach((j) => { j.status = "cancelled"; j.finishedAt = Date.now(); jobHistory.unshift(j); });
    return json(res, 200, Object.assign({ ok: true, cancelled: n }, queueInfo()));
  }

  /* ---- API: read the real Accounts.csv (read-only, used by Refresh) ---- */
  if (url.pathname === "/api/accounts-csv" && req.method === "GET") {
    // Contains (encrypted) passwords/tokens: only answer requests from this PC.
    const ra = String((req.socket && req.socket.remoteAddress) || "");
    if (!/^(127\.|::1$|::ffff:127\.)/.test(ra)) return json(res, 403, { ok: false, error: "local only" });
    try {
      const p = resolveCsvPath();
      if (!fileExists(p)) return json(res, 200, { ok: false, error: "Accounts.csv not found" });
      return json(res, 200, { ok: true, path: p, text: fs.readFileSync(p, "utf8") });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  /* ---- API: batch load order (v2.5) ------------------------------------
     Shupershuff's loader walks Accounts.csv top-to-bottom and collects the
     accounts of the requested batch in that order, so the CSV ROW ORDER is
     the batch load order. These endpoints read that order and let the UI
     rewrite it later - without touching the loader itself. */
  if (url.pathname === "/api/batch-order" && req.method === "GET") {
    try {
      const t = readCsvTable();
      if (t.iBatches < 0) return json(res, 200, { ok: false, error: "Accounts.csv has no 'Batches' column." });
      const wanted = (url.searchParams.get("batch") || "").trim();
      const all = [];
      for (let r = 1; r < t.rows.length; r++) {
        const row = t.rows[r];
        const batches = String(row[t.iBatches] || "").split(",").map((s) => s.trim()).filter(Boolean);
        all.push({
          id: String(row[t.iId] || "").trim(),
          acct: String(row[t.iAcct] || "").trim(),
          label: t.iLabel >= 0 ? String(row[t.iLabel] || "").trim() : "",
          batches,
          row: r,
        });
      }
      if (!wanted) {
        const map = new Map();
        all.forEach((a) => a.batches.forEach((b) => {
          if (!map.has(b)) map.set(b, []);
          map.get(b).push(a.id);
        }));
        const batches = [...map.entries()]
          .sort((a, b) => (Number(a[0]) - Number(b[0])) || a[0].localeCompare(b[0]))
          .map(([id, ids]) => ({ id, count: ids.length, ids }));
        return json(res, 200, { ok: true, path: t.p, batches });
      }
      const rows = all.filter((a) => a.batches.includes(wanted));
      return json(res, 200, { ok: true, path: t.p, batch: wanted, rows });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  if (url.pathname === "/api/batch-order" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const batch = String(body.batch == null ? "" : body.batch).trim();
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v).trim()).filter(Boolean) : null;
      if (!batch) return json(res, 200, { ok: false, error: "No batch id given." });
      if (!ids || !ids.length) return json(res, 200, { ok: false, error: "No account order given." });

      const t = readCsvTable();
      if (t.iBatches < 0) return json(res, 200, { ok: false, error: "Accounts.csv has no 'Batches' column." });

      // Rows that belong to this batch, in their current CSV order.
      const slots = [];
      for (let r = 1; r < t.rows.length; r++) {
        const batches = String(t.rows[r][t.iBatches] || "").split(",").map((s) => s.trim());
        if (batches.includes(batch)) slots.push(r);
      }
      if (!slots.length) return json(res, 200, { ok: false, error: "Batch " + batch + " has no accounts in Accounts.csv." });

      const currentIds = slots.map((r) => String(t.rows[r][t.iId] || "").trim());
      const sameSet = ids.length === currentIds.length &&
        ids.every((id) => currentIds.includes(id)) &&
        currentIds.every((id) => ids.includes(id));
      if (!sameSet) {
        return json(res, 200, {
          ok: false,
          error: "The order must contain exactly the accounts in batch " + batch + " (got " + ids.length + ", expected " + currentIds.length + ").",
        });
      }

      const byId = new Map();
      slots.forEach((r) => byId.set(String(t.rows[r][t.iId] || "").trim(), t.rows[r]));

      // Put the rows back into the SAME slots, but in the new order. Every
      // other row keeps its exact position, so nothing else changes.
      const next = t.rows.slice();
      slots.forEach((rowIdx, k) => { next[rowIdx] = byId.get(ids[k]); });

      const bak = t.p + ".bak";
      try { if (!fs.existsSync(bak)) fs.copyFileSync(t.p, bak); } catch (e) {}
      fs.writeFileSync(t.p, serializeCsv(next), "utf8");

      return json(res, 200, { ok: true, path: t.p, batch, ids });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  /* ---- API: which game instances are open right now (v2.2) ---- */
  if (url.pathname === "/api/instances" && req.method === "GET") {
    try {
      const data = await getInstances(url.searchParams.get("force") === "1");
      return json(res, 200, Object.assign({}, data, { queue: queueInfo() }));
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  /* ---- API: live Terror Zone + DClone status (v2.3) ---- */
  if (url.pathname === "/api/live-status" && req.method === "GET") {
    try {
      const data = await getLiveStatus(url.searchParams.get("force") === "1");
      return json(res, 200, data);
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  /* ---- API: verify the loader script (syntax check, no launch) ---- */
  if (url.pathname === "/api/verify-loader" && req.method === "POST") {
    if (!SCRIPT_PATH) return json(res, 200, { ok: false, error: "Loader path is not set." });
    if (!fileExists(SCRIPT_PATH)) return json(res, 200, { ok: false, error: "File not found: " + SCRIPT_PATH });
    if (process.platform !== "win32") {
      return json(res, 200, { ok: true, note: "Non-Windows host \u2014 skipped the PowerShell parse check.", scriptPath: SCRIPT_PATH });
    }
    const safe = SCRIPT_PATH.replace(/'/g, "''");
    const ps = "$ErrorActionPreference='Stop';$t=$null;$e=$null;" +
      "[void][System.Management.Automation.Language.Parser]::ParseFile('" + safe + "',[ref]$t,[ref]$e);" +
      "if($e -and $e.Count){$e|ForEach-Object{$_.Message};exit 1}else{'OK'}";
    const r = await runCapture("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], 20000);
    if (r.ok && /OK/.test(r.out)) {
      return json(res, 200, { ok: true, note: "D2Loader.ps1 parsed successfully.", scriptPath: SCRIPT_PATH });
    }
    return json(res, 200, { ok: false, error: (r.err || r.out || "PowerShell parse check failed.").trim().slice(0, 500), scriptPath: SCRIPT_PATH });
  }

  /* ---- API: start a Get-Token job ---- */
  if (url.pathname === "/api/get-token" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)) || "{}");
      if (!opts.email) return json(res, 400, { ok: false, error: "email is required" });
      const job = newJob();
      runTokenJob(job, opts); // fire and forget; UI polls
      return json(res, 200, { ok: true, jobId: job.id });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  /* ---- API: poll a Get-Token job ---- */
  if (url.pathname === "/api/token-status" && req.method === "GET") {
    const id = url.searchParams.get("jobId");
    const job = jobs.get(id);
    if (!job) return json(res, 404, { ok: false, error: "unknown job" });
    return json(res, 200, { ok: true, status: job.status, events: job.events, result: job.result });
  }

  /* ---- API: secure a pasted URL/token into the CSV (manual fallback) ---- */
  if (url.pathname === "/api/secure-token" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const helper = require("./token-helper.js");
      const token = helper.extractToken(body.raw || "");
      if (!token) return json(res, 400, { ok: false, error: "No token found in the supplied text." });

      let encrypted = false;
      let stored = token;
      if (body.encrypt !== false) {
        try { stored = await runSecrets("secure", token); encrypted = stored.length >= 200; }
        catch (e) { /* fall back to plain */ }
      }
      let csvInfo = null;
      if (body.writeCsv !== false && body.accountId != null) {
        csvInfo = writeTokenToCsv(resolveCsvPath(), {
          accountId: body.accountId, email: body.email, token: stored, setAuthMethod: body.setAuthMethod,
        });
      }
      return json(res, 200, {
        ok: true, token, masked: maskToken(token), storedToken: stored,
        encrypted, csvUpdated: !!csvInfo, csvPath: resolveCsvPath(),
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  /* ---- API: decrypt a stored secret (diagnostics only) ---- */
  if (url.pathname === "/api/unsecure-secret" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const plain = await runSecrets("unsecure", body.value || "");
      return json(res, 200, { ok: true, plain });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  /* ---- static files ---- */
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  // The web files (index.html, app.js, styles.css) live in app/ (= ROOT), while
  // assets/ and data/ sit in the install root (= BASE). Serve those two from BASE.
  const fromBase = filePath.startsWith("/assets/") || filePath.startsWith("/data/");
  const rootDir = fromBase ? BASE : ROOT;
  const abs = path.join(rootDir, filePath);
  if (!abs.startsWith(rootDir)) { res.writeHead(403); return res.end("Forbidden"); }

  fs.readFile(abs, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
      // Never cache: the UI is served from disk, so edits/updates should show
      // up on a normal refresh (no hard-refresh needed).
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(buf);
  });
});

/* long logins (visible fallback) can take minutes — don't cut them off */
server.requestTimeout = 0;
server.headersTimeout = 0;

/* ---- open the UI in a new browser window (Edge/Chrome preferred) ---- */
function findBrowser() {
  if (process.env.D2R_BROWSER_PATH) {
    try { if (fs.existsSync(process.env.D2R_BROWSER_PATH)) return process.env.D2R_BROWSER_PATH; } catch (e) {}
  }
  if (process.platform !== "win32") return null;
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const lad = process.env["LocalAppData"] || "";
  const cands = [
    pf + "\\Microsoft\\Edge\\Application\\msedge.exe",
    pf86 + "\\Microsoft\\Edge\\Application\\msedge.exe",
    lad + "\\Microsoft\\Edge\\Application\\msedge.exe",
    pf + "\\Google\\Chrome\\Application\\chrome.exe",
    pf86 + "\\Google\\Chrome\\Application\\chrome.exe",
    lad + "\\Google\\Chrome\\Application\\chrome.exe"
  ];
  for (let i = 0; i < cands.length; i++) {
    try { if (cands[i] && fs.existsSync(cands[i])) return cands[i]; } catch (e) {}
  }
  return null;
}
/* ---- window geometry helpers (v2.4) ---- */
function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
function windowSizeArg() {
  const w = WINDOW_STATE && clampInt(WINDOW_STATE.w, 640, 6000);
  const h = WINDOW_STATE && clampInt(WINDOW_STATE.h, 480, 4000);
  return (w && h) ? (w + "," + h) : "1280,880";
}
function windowPositionArg() {
  if (!WINDOW_STATE) return null;
  const x = clampInt(WINDOW_STATE.x, -10000, 10000);
  const y = clampInt(WINDOW_STATE.y, -10000, 10000);
  return (x != null && y != null) ? (x + "," + y) : null;
}

/* v2.5: if the UI window is already open, bring it to the front instead of
   doing nothing. Without this the desktop icon looked "dead" whenever the
   window had slipped behind another app, so people clicked it repeatedly. */
function focusUiWindow() {
  if (process.platform !== "win32") return false;
  try {
    const script = "$w = New-Object -ComObject WScript.Shell; $null = $w.AppActivate('D2R Command Center')";
    spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
      detached: true, stdio: "ignore", windowsHide: true,
    }).unref();
    return true;
  } catch (e) { return false; }
}

function openUiWindow() {
  if (process.env.D2R_NO_BROWSER === "1") return;
  const url = "http://localhost:" + PORT;
  try {
    const b = findBrowser();
    if (b) {
      /* Launch in a lightweight, ISOLATED profile. Opening in the user's
         normal Edge/Chrome drags in all their extensions, sync and background
         services (easily 500-1000 MB). A dedicated profile + --app mode gives
         a clean chromeless window that uses far less memory and never touches
         their everyday browser. */
      const base = process.env.LOCALAPPDATA ||
        path.join(process.env.USERPROFILE || ".", "AppData", "Local");
      const profile = path.join(base, "D2RCommandCenter", "browser-profile");
      try { fs.mkdirSync(profile, { recursive: true }); } catch (e) {}
      const args = [
        "--app=" + url,
        "--user-data-dir=" + profile,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-component-update",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-features=Translate,OptimizationHints,MediaRouter,msEdgeSidebarV2,msEdgeIdentityV2,msEdgeFirstRunExperience",
        "--window-size=" + windowSizeArg(),
      ];
      const pos = windowPositionArg();
      if (pos) args.push("--window-position=" + pos);
      spawn(b, args, { detached: true, stdio: "ignore" }).unref();
      console.log("  Opened the UI in a lightweight browser window (isolated profile).");
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      console.log("  Opened the UI in your default browser.");
    } else {
      console.log("  Open " + url + " in your browser.");
    }
  } catch (e) {
    console.log("  (Could not auto-open a browser: " + (e && e.message) + ")");
  }
}

detectElevation();

server.listen(PORT, () => {
  console.log("");
  console.log("  ⚔  D2R Command Center — Launcher Bridge (v" + VERSION + ")");
  console.log("  ------------------------------------------");
  console.log("  Serving UI at:  http://localhost:" + PORT);
  console.log("  Loader script:  " + (SCRIPT_PATH || "(not set — set it in Configuration → Loader & Bridge)"));
  console.log("  Accounts.csv:   " + resolveCsvPath());
  console.log("  Token helper:   " + (tokenHelperAvailable() ? "ready" : "playwright not installed (run: npm install)"));
  console.log("");
  console.log("  Set the loader path in the UI, or via D2LOADER_PATH /");
  console.log("  bridge.config.json with { \"scriptPath\": \"...\" }");
  console.log("");
  if (!NO_BROWSER) setTimeout(openUiWindow, 600);
  else console.log("  (Background mode: not opening a browser window.)");
});

/* If the port is taken, a bridge is already running. Exit quietly - the
   launcher will open the existing UI (via /api/open-ui) if needed, so we
   never spawn a duplicate window. */
server.on("error", (e) => {
  if (e && e.code === "EADDRINUSE") {
    console.log("");
    console.log("  [i] Port " + PORT + " is already in use - a bridge is already running.");
    console.log("      This second instance will exit. The running bridge keeps serving the UI.");
    process.exit(0);
    return;
  }
  throw e;
});
