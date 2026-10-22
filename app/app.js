/* ============================================================
   D2R COMMAND CENTER — app.js
   Companion front-end for Shupershuff's Diablo2RLoader.
   Reads/writes his config.xml + Accounts.csv and builds the
   exact launch parameters his D2Loader.ps1 already understands.
   His engine is never modified.
   ============================================================ */

"use strict";

/* ---------- region helpers ---------- */
const REGIONS = {
  "1": { code: "na", label: "NA", name: "Americas" },
  "2": { code: "eu", label: "EU", name: "Europe" },
  "3": { code: "kr", label: "KR", name: "Asia / Korea" },
};

/* Live-status regions (DClone keys returned by /api/live-status). */
const LIVE_REGION_LABEL = { us: "Americas (US)", eu: "Europe (EU)", kr: "Asia (KR)", cn: "China (CN)" };

/* ---------- config.xml schema (drives the Configuration view) ---------- */
const CONFIG_SCHEMA = [
  {
    group: "Game & Launch",
    icon: "🎮",
    desc: "Core paths and how the game starts.",
    items: [
      { key: "GamePath", label: "Game Install Path", type: "text", desc: "Where Diablo II Resurrected is installed.", wide: true },
      { key: "DefaultRegion", label: "Default Region", type: "select", options: [["1", "1 — Americas (NA)"], ["2", "2 — Europe (EU)"], ["3", "3 — Asia (KR)"]], desc: "Region used when you just hit enter." },
      { key: "ForceWindowedMode", label: "Force Windowed Mode", type: "bool", desc: "Always start windowed. Can affect saved window size." },
    ],
  },
  {
    group: "Window Management",
    icon: "🪟",
    desc: "Remember layouts and switch between instances.",
    items: [
      { key: "RememberWindowLocations", label: "Remember Window Locations", type: "bool", desc: "Launch each instance to its saved position & size." },
      { key: "WindowSwitcherComboKeys", label: "Window Switcher Hotkeys", type: "text", desc: "Comma-separated: Alt, Ctrl, Shift. Blank = off. e.g. Shift,Alt" },
      { key: "DisableIconStacking", label: "Disable Taskbar Icon Stacking", type: "bool", desc: "Stop D2R icons from grouping in the taskbar." },
    ],
  },
  {
    group: "Settings Switching",
    icon: "🎛",
    desc: "Load different graphics/audio settings per account.",
    items: [
      { key: "SettingSwitcherEnabled", label: "Automatic Settings Switcher", type: "bool", desc: "Load settings<ID>.json per account automatically." },
      { key: "ManualSettingSwitcherEnabled", label: "Manual Settings Switcher", type: "bool", desc: "Pick a settings profile at launch time." },
    ],
  },
  {
    group: "Accounts & Security",
    icon: "🔐",
    desc: "Account handling and shortcuts.",
    items: [
      { key: "ConvertPlainTextSecrets", label: "Encrypt Plain-Text Secrets", type: "bool", desc: "Convert plain passwords/tokens to secure strings. Recommended." },
      { key: "DisableOpenAllAccountsOption", label: "Disable 'Open All' Option", type: "bool", desc: "Prevent accidentally opening every account at once." },
      { key: "ShowCloseOptionInMenu", label: "Show 'Force Close' Option", type: "bool", desc: "Allow force-closing instances from the loader." },
      { key: "CreateDesktopShortcut", label: "Create Desktop Shortcut", type: "bool", desc: "Recreate the desktop shortcut each run." },
      { key: "ShortcutCustomIconPath", label: "Custom Shortcut Icon Path", type: "text", desc: "Optional .ico path for the shortcut.", wide: true },
      { key: "ForceAuthTokenForRegion", label: "Force Token Auth For Region", type: "text", desc: "Comma-separated NA/EU/KR. Use only if parameter auth is down." },
    ],
  },
  {
    group: "Playtime Tracking",
    icon: "⏱",
    desc: "Track how long each account is used.",
    items: [
      { key: "TrackAccountUseTime", label: "Track Account Use Time", type: "bool", desc: "Update accounts.csv / stats.csv with playtime." },
      { key: "IdleLimitForAccountUseTime", label: "Idle Limit (minutes)", type: "number", desc: "Pause tracking after N idle minutes. Blank = off." },
    ],
  },
  {
    group: "DClone Alerts",
    icon: "👹",
    desc: "Über Diablo walk notifications.",
    items: [
      { key: "DCloneTrackerSource", label: "DClone Tracker Source", type: "select", options: [["D2Emu.com", "D2Emu.com (live, recommended)"], ["D2runewizard.com", "D2runewizard.com"], ["diablo2.io", "diablo2.io"]], desc: "Where DClone status data comes from." },
      { key: "DCloneAlarmList", label: "Alarm Regions/Modes", type: "text", desc: "e.g. SCL-NA, SCL-EU, SC-KR. Blank = disabled.", wide: true },
      { key: "DCloneAlarmLevel", label: "Alarm Level", type: "select", options: [["All", "All changes"], ["Close", "Close (4/6, 5/6, walked)"], ["Imminent", "Imminent (5/6, walked)"]], desc: "Which status changes trigger an alarm." },
      { key: "AlarmVoice", label: "Alarm Voice", type: "select", options: [["Amazon", "Amazon (Zira — female)"], ["Paladin", "Paladin (David — male)"]], desc: "Text-to-speech voice for alarms." },
      { key: "AlarmVolume", label: "Alarm Volume (1–100)", type: "number", desc: "How loud the voice alarm is." },
    ],
  },
  {
    group: "Terror Zones",
    icon: "🔥",
    desc: "Terror Zone alerts and overlay.",
    live: "tz",
    items: [
      { key: "TerrorZoneAlertAreas", label: "Alert Areas (level IDs)", type: "text", desc: "Comma-separated level IDs, e.g. 34,66,108,131.", wide: true },
      { key: "TerrorZoneOverlay", label: "Terror Zone Overlay", type: "bool", desc: "Show a movable overlay with current & next TZ." },
    ],
  },
];

/* ---------- app state ---------- */
const state = {
  config: {},          // parsed config.xml values
  configRaw: "",       // original XML text (for faithful export)
  accounts: [],        // parsed Accounts.csv rows
  presets: [],         // saved presets
  region: "1",         // current default region
  view: "instances",
  filter: "all",
  search: "",
  selection: new Set(),// account IDs selected for manual launch
  open: new Set(),     // account IDs that are open (live-detected when the bridge supports it)
  liveSupported: false,// bridge can read real D2R windows (Windows only)
  queue: { running: null, queued: [] }, // bridge launch queue (v2.2)
  log: [],
  bridgeOnline: false,
  tokenHelper: false,
  bridgeInfo: null,    // last /api/ping payload (paths + status)
  scriptPath: "D2Loader.ps1",
  showEmails: false,   // privacy: hide account emails on the Instances screen by default
  showAcctEmails: false, // privacy: hide emails in the Accounts table by default
  acctReveal: new Set(), // row indexes revealed one-by-one in the Accounts table
  sidebarCollapsed: false,
  accountRegions: {},  // per-account region override: { "1": "2", ... } keyed by account ID
  liveRegion: "us",    // live-status region (default US / Americas)
  live: null,          // last /api/live-status payload
  liveAt: 0,           // when the live payload was fetched
  liveError: null,     // last live-status error string
  manualOrder: [],     // ordered account IDs for manual pick / launch order (v2.4)
  sideTzOpen: false,   // sidebar Terror Zone dropdown open?
  sideDcOpen: false,   // sidebar DClone dropdown open?
  boBatch: "",         // batch whose load order is being edited (v2.5)
  boRows: [],          // [{id,label,acct,batches}] in current CSV order
  boDirty: false,      // unsaved order changes?
  boDragId: null,      // id being dragged in the batch-order list
};

/* ---------- tiny helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const regionCode = (r) => (REGIONS[r] ? REGIONS[r].code : "na");

/* ============================================================
   PARSERS
   ============================================================ */
function parseConfigXml(xmlText) {
  const out = {};
  try {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const root = doc.querySelector("D2loaderconfig") || doc.documentElement;
    Array.from(root.children).forEach((el) => {
      out[el.tagName] = (el.textContent || "").trim();
    });
  } catch (e) {
    console.warn("config parse failed", e);
  }
  return out;
}

/* CSV parse that respects quoted fields */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && !(r.length === 1 && r[0] === ""));
}

function parseAccountsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
    return obj;
  }).filter((a) => a.ID && a.ID.length);
}

/* ============================================================
   SERIALIZERS
   ============================================================ */
function setXmlValue(xml, tag, value) {
  const safe = String(value == null ? "" : value);
  const re = new RegExp("(<" + tag + ">)([\\s\\S]*?)(</" + tag + ">)");
  if (re.test(xml)) return xml.replace(re, "$1" + safe + "$3");
  // tag missing → inject before closing root
  return xml.replace(/<\/D2loaderconfig>/, "\t<" + tag + ">" + safe + "</" + tag + ">\n</D2loaderconfig>");
}

function exportConfigXml() {
  let xml = state.configRaw || "<D2loaderconfig>\n</D2loaderconfig>";
  Object.entries(state.config).forEach(([k, v]) => { xml = setXmlValue(xml, k, v); });
  return xml;
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportAccountsCsv() {
  const headers = ["ID", "Acct", "AccountLabel", "Batches", "TimeActive", "CustomLaunchArguments", "AuthenticationMethod", "PW", "Token"];
  const lines = [headers.join(",")];
  state.accounts.forEach((a) => {
    lines.push(headers.map((h) => csvEscape(a[h] || "")).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

/* ============================================================
   COMMAND BUILDER — mirrors D2Loader.ps1 parameters
   ============================================================ */
function accountRegion(id) {
  const r = state.accountRegions[String(id)];
  return REGIONS[r] ? r : state.region;
}
function setAccountRegion(id, region) {
  if (!REGIONS[region]) return;
  state.accountRegions[String(id)] = region;
  saveAccountRegions();
  const acct = state.accounts.find((a) => String(a.ID) === String(id));
  const label = acct ? (acct.AccountLabel || ("Account " + id)) : ("Account " + id);
  toast(label + " \u2192 " + REGIONS[region].label, "ok", "\U0001F30D");
}
function buildLaunchCmd({ account, batch, all, region }) {
  const parts = ['powershell -ExecutionPolicy Bypass -File "' + state.scriptPath + '"'];
  if (all) parts.push("-All True");
  else if (batch != null) parts.push("-Batch " + batch);
  else if (account != null) parts.push("-AccountUsername " + account);
  parts.push("-Region " + regionCode(region != null ? region : state.region));
  return parts.join(" ");
}
function buildCloseCmd({ account, all }) {
  const parts = ['powershell -ExecutionPolicy Bypass -File "' + state.scriptPath + '"'];
  parts.push("-Close " + (all ? "all" : account));
  return parts.join(" ");
}

/* ============================================================
   LOGGING + TOASTS
   ============================================================ */
function logLine(kind, text, cmd) {
  state.log.push({ time: nowTime(), kind, text, cmd: cmd || null });
  renderConsole();
  const badge = $("#navBadgeLog");
  badge.textContent = state.log.length;
  badge.classList.toggle("zero", state.log.length === 0);
}

function renderConsole() {
  const c = $("#console");
  if (!state.log.length) {
    c.innerHTML = '<div class="console-line muted">// Command log — launch actions appear here.</div>';
    return;
  }
  c.innerHTML = state.log.map((l, i) => {
    const cls = { ok: "ok", err: "err", warn: "warn", cmd: "cmd" }[l.kind] || "";
    const body = l.cmd
      ? '<span class="' + cls + '">' + esc(l.text) + '</span><br><span class="cmd">' + esc(l.cmd) + '</span>'
      : '<span class="' + cls + '">' + esc(l.text) + '</span>';
    const copy = l.cmd ? '<button class="console-copy" data-copy="' + i + '">copy</button>' : "";
    return '<div class="console-line"><span class="console-time">' + l.time + '</span><span class="console-body">' + body + '</span>' + copy + '</div>';
  }).join("");
  $$(".console-copy", c).forEach((b) => b.addEventListener("click", () => {
    const l = state.log[+b.dataset.copy];
    if (l && l.cmd) copyText(l.cmd);
  }));
  c.scrollTop = c.scrollHeight;
}

function toast(msg, kind = "ok", ico) {
  const wrap = $("#toastWrap");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = '<span class="t-ico">' + (ico || (kind === "err" ? "⚠" : "✔")) + '</span><span>' + esc(msg) + '</span>';
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(40px)"; el.style.transition = "all .3s"; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast("Copied to clipboard", "ok", "📋")).catch(() => toast("Copy failed", "err"));
  } else {
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard", "ok", "📋"); } catch (e) { toast("Copy failed", "err"); }
    ta.remove();
  }
}

/* ============================================================
   LAUNCH / CLOSE ACTIONS
   ============================================================ */
async function runCommand(payload, { markOpen = [], label = "", pretty = "" } = {}) {
  const display = pretty || describePayload(payload);
  logLine("cmd", label || "Command:", display);
  if (state.bridgeOnline) {
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ ids: markOpen.map(String), label }, payload)),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.queued && data.ahead) {
          logLine("ok", "Queued" + (label ? " (" + label + ")" : "") + " — " + data.ahead + " ahead. Launches run one at a time so each token login can finish.");
          toast("Queued" + (label ? ": " + label : "") + " (" + data.ahead + " ahead)", "ok", "⏳");
        } else {
          logLine("ok", "Launching via bridge." + (label ? " (" + label + ")" : "") + (data.note ? " " + data.note : ""));
          toast("Launching" + (label ? ": " + label : ""), "ok", "🚀");
        }
        if (data.queued) pollInstancesSoon();
      } else {
        logLine("err", "Bridge error: " + (data.error || res.statusText));
        toast("Launch failed — see Command Log", "err");
      }
    } catch (e) {
      logLine("err", "Bridge unreachable: " + e.message);
      toast("Bridge unreachable", "err");
    }
  } else {
    copyText(display);
    logLine("warn", "Bridge offline — command copied to clipboard. Paste it into PowerShell to run.");
    toast("Command copied (bridge offline)", "ok", "📋");
  }
  // With live detection the card only turns "Open" once the game window really
  // appears. Without it (bridge offline / non-Windows) mark it optimistically.
  if (!state.liveSupported) markOpen.forEach((id) => state.open.add(String(id)));
  renderInstances();
  updateOpenBadge();
}

/* Human-readable preview of a structured launch payload. */
function describePayload(p) {
  if (!p) return "";
  if (p.mode === "account") return buildLaunchCmd({ account: p.account });
  if (p.mode === "batch") return buildLaunchCmd({ batch: p.batch });
  if (p.mode === "all") return buildLaunchCmd({ all: true });
  if (p.mode === "close") return buildCloseCmd({ account: p.account, all: p.all });
  return JSON.stringify(p);
}

function launchAccount(id) {
  const acct = state.accounts.find((a) => String(a.ID) === String(id));
  const label = acct ? (acct.AccountLabel || ("Account " + id)) : ("Account " + id);
  const reg = accountRegion(id);
  runCommand({ mode: "account", account: String(id), region: regionCode(reg) },
    { markOpen: [id], label, pretty: buildLaunchCmd({ account: id, region: reg }) });
}

function launchBatch(batchId) {
  const ids = state.accounts.filter((a) => String(a.Batches || "").split(",").map((s) => s.trim()).includes(String(batchId))).map((a) => a.ID);
  runCommand({ mode: "batch", batch: String(batchId), region: regionCode(state.region) },
    { markOpen: ids, label: "Batch " + batchId, pretty: buildLaunchCmd({ batch: batchId }) });
}

function launchAll() {
  runCommand({ mode: "all", region: regionCode(state.region) },
    { markOpen: state.accounts.map((a) => a.ID), label: "All accounts", pretty: buildLaunchCmd({ all: true }) });
}

function launchSelected() {
  // Launch in the user's drag-and-drop order (v2.4). state.manualOrder holds
  // every account ID in the displayed order; we keep only the selected ones.
  ensureManualOrder();
  const ids = state.manualOrder.filter((id) => state.selection.has(String(id)));
  if (!ids.length) { toast("No accounts selected", "err"); return; }
  ids.forEach((id) => launchAccount(id));
  toast("Queued " + ids.length + " launches — they open one at a time", "ok", "⏳");
}

function closeAccount(id) {
  runCommand({ mode: "close", account: String(id) }, { label: "Close " + id, pretty: buildCloseCmd({ account: id }) });
  state.open.delete(String(id));
  renderInstances();
  updateOpenBadge();
}

function closeAll() {
  runCommand({ mode: "close", all: true }, { label: "Force close ALL", pretty: buildCloseCmd({ all: true }) });
  state.open.clear();
  renderInstances();
  updateOpenBadge();
}

/* ============================================================
   RENDERERS
   ============================================================ */
function updateOpenBadge() {
  const b = $("#navBadgeOpen");
  b.textContent = state.open.size;
  b.classList.toggle("zero", state.open.size === 0);
}

function renderRegionSeg() {
  $$("#regionSeg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.region === state.region);
  });
}

function renderInstances() {
  const grid = $("#instanceGrid");
  const q = state.search.toLowerCase();
  let list = state.accounts.filter((a) => {
    const hay = (a.AccountLabel + " " + a.Acct + " " + a.ID).toLowerCase();
    if (q && !hay.includes(q)) return false;
    const isOpen = state.open.has(String(a.ID));
    if (state.filter === "open" && !isOpen) return false;
    if (state.filter === "closed" && isOpen) return false;
    return true;
  });

  $("#instancesEmpty").hidden = list.length !== 0;

  grid.innerHTML = list.map((a) => {
    const isOpen = state.open.has(String(a.ID));
    const qs = isOpen ? null : queueStatusFor(a.ID); // "launching" | "queued" | null
    const batches = (a.Batches || "").split(",").map((s) => s.trim()).filter(Boolean);
    const auth = (a.AuthenticationMethod || "Parameter");
    const hasToken = String(a.Token || "").trim() !== "";

    // Privacy: never show the account email/username on this screen unless the
    // user explicitly turns it on. If the friendly label itself looks like an
    // email, mask that too.
    const rawLabel = a.AccountLabel || "";
    const labelLooksLikeEmail = rawLabel.indexOf("@") !== -1;
    const label = (labelLooksLikeEmail && !state.showEmails)
      ? "••••••••"
      : (rawLabel || ("Account " + a.ID));
    const emailRow = state.showEmails
      ? '<div class="ic-email">' + esc(a.Acct || "—") + '</div>'
      : "";

    return `
      <div class="instance-card ${isOpen ? "is-open" : ""}">
        <div class="ic-top">
          <div class="ic-id">${esc(a.ID)}</div>
          <div class="ic-status ${isOpen ? "open" : (qs || "closed")}">${isOpen ? "● Open" : qs === "launching" ? "◔ Launching" : qs === "queued" ? "⏳ Queued" : "○ Available"}</div>
        </div>
        <div class="ic-label" title="${esc(rawLabel || ("Account " + a.ID))}">${esc(label)}</div>
        ${emailRow}
        <div class="ic-meta">
          <span class="tag ${auth.toLowerCase() === "parameter" ? "gold" : "blue"}">${esc(auth)}</span>
          ${hasToken ? '<span class="tag green">🔒 Token</span>' : ""}
          ${batches.map((b) => '<span class="tag">Batch ' + esc(b) + '</span>').join("")}
        </div>
        <div class="ic-actions">
          <select class="ic-region" data-region-for="${esc(a.ID)}" title="Region for this account" aria-label="Region for account ${esc(a.ID)}">
            ${["1", "2", "3"].map((rk) => '<option value="' + rk + '"' + (accountRegion(a.ID) === rk ? " selected" : "") + '>' + REGIONS[rk].label + '</option>').join("")}
          </select>
          ${isOpen
            ? '<button class="btn btn-danger" data-close="' + esc(a.ID) + '">■ Close</button>'
            : qs
              ? '<button class="btn btn-primary" disabled title="Waiting its turn — one token login at a time">' + (qs === "launching" ? "◔ Starting" : "⏳ Queued") + '</button>'
              : '<button class="btn btn-primary" data-launch="' + esc(a.ID) + '">▶ Launch</button>'}
          <button class="btn btn-gold" data-get-token-card="${state.accounts.indexOf(a)}" title="Get Battle.net token">🔑</button>
          <button class="btn btn-ghost" data-copy-acct="${esc(a.ID)}" title="Copy launch command">⧉</button>
        </div>
      </div>`;
  }).join("");

  $$("[data-launch]", grid).forEach((b) => b.addEventListener("click", () => launchAccount(b.dataset.launch)));
  $$("[data-close]", grid).forEach((b) => b.addEventListener("click", () => closeAccount(b.dataset.close)));
  $$("[data-get-token-card]", grid).forEach((b) => b.addEventListener("click", () => openTokenModal(+b.dataset.getTokenCard)));
  $$("[data-copy-acct]", grid).forEach((b) => b.addEventListener("click", () => copyText(buildLaunchCmd({ account: b.dataset.copyAcct, region: accountRegion(b.dataset.copyAcct) }))));
  $$("[data-region-for]", grid).forEach((sel) => sel.addEventListener("change", () => setAccountRegion(sel.dataset.regionFor, sel.value)));
}

/* Keep state.manualOrder in sync with the account list while preserving any
   order the user has already set by dragging (v2.4). */
function ensureManualOrder() {
  const ids = state.accounts.map((a) => String(a.ID));
  const idSet = new Set(ids);
  const kept = (state.manualOrder || []).filter((id) => idSet.has(String(id)));
  const seen = new Set(kept.map(String));
  ids.forEach((id) => { if (!seen.has(id)) kept.push(id); });
  state.manualOrder = kept;
}

function renderManualSelect() {
  const box = $("#manualSelect");
  ensureManualOrder();
  const byId = {};
  state.accounts.forEach((a) => { byId[String(a.ID)] = a; });
  box.innerHTML = state.manualOrder.map((id, idx) => {
    const a = byId[id];
    if (!a) return "";
    const checked = state.selection.has(String(id));
    return `<div class="ms-item ${checked ? "checked" : ""}" draggable="true" data-id="${esc(id)}">
      <span class="ms-grip" title="Drag to reorder launch order" aria-hidden="true">⠿</span>
      <span class="ms-order">${idx + 1}</span>
      <input type="checkbox" data-sel="${esc(id)}" ${checked ? "checked" : ""} />
      <span class="ms-id">#${esc(id)}</span>
      <span class="ms-name">${esc(a.AccountLabel || a.Acct || "Account")}</span>
    </div>`;
  }).join("");

  $$("[data-sel]", box).forEach((cb) => cb.addEventListener("change", () => {
    const id = String(cb.dataset.sel);
    if (cb.checked) state.selection.add(id); else state.selection.delete(id);
    cb.closest(".ms-item").classList.toggle("checked", cb.checked);
    $("#selCount").textContent = state.selection.size;
  }));
  $("#selCount").textContent = state.selection.size;

  // ---- drag & drop reordering ----
  let dragId = null;
  $$(".ms-item", box).forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.id;
      row.classList.add("dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
    });
    row.addEventListener("dragend", () => {
      dragId = null;
      $$(".ms-item", box).forEach((r) => r.classList.remove("dragging", "drop-above", "drop-below"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragId || row.dataset.id === dragId) return;
      const r = row.getBoundingClientRect();
      const below = (e.clientY - r.top) > r.height / 2;
      row.classList.toggle("drop-below", below);
      row.classList.toggle("drop-above", !below);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetId = row.dataset.id;
      if (!dragId || targetId === dragId) return;
      const r = row.getBoundingClientRect();
      const below = (e.clientY - r.top) > r.height / 2;
      const order = state.manualOrder.slice();
      const from = order.indexOf(dragId);
      if (from < 0) return;
      order.splice(from, 1);
      let to = order.indexOf(targetId);
      if (to < 0) to = order.length;
      if (below) to += 1;
      order.splice(to, 0, dragId);
      state.manualOrder = order;
      renderManualSelect();
    });
  });
}

/* ---------- batch load order (v2.5) ------------------------------------
   Shupershuff's loader collects a batch's accounts by walking Accounts.csv
   top-to-bottom, so the CSV row order IS the load order. We read that order
   from the bridge and let the user drag it into a new one - the loader file
   itself is never touched. */
function boSetStatus(msg, kind) {
  const el = $("#boStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "bo-status" + (kind ? " " + kind : "");
}
function boSetDirty(dirty) {
  state.boDirty = !!dirty;
  const save = $("#boSave"), reset = $("#boReset");
  if (save) save.disabled = !dirty || !state.boRows.length;
  if (reset) reset.disabled = !dirty || !state.boRows.length;
  if (dirty) boSetStatus("Unsaved changes", "warn");
  else boSetStatus("");
}

async function loadBatchList() {
  const sel = $("#boBatch");
  if (!sel) return;
  try {
    const r = await fetch("/api/batch-order", { cache: "no-store" });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "could not read Accounts.csv");
    const list = d.batches || [];
    if (!list.length) {
      sel.innerHTML = '<option value="">No batches found</option>';
      state.boBatch = ""; state.boRows = [];
      renderBatchOrder();
      boSetStatus("No batches in Accounts.csv yet.", "warn");
      return;
    }
    const keep = String(state.boBatch || list[0].id);
    sel.innerHTML = list.map((b) =>
      `<option value="${esc(b.id)}" ${String(b.id) === keep ? "selected" : ""}>Batch ${esc(b.id)} — ${b.count} account${b.count === 1 ? "" : "s"}</option>`
    ).join("");
    state.boBatch = String(sel.value || list[0].id);
    await loadBatchOrder(state.boBatch);
  } catch (e) {
    sel.innerHTML = '<option value="">Bridge offline</option>';
    state.boRows = [];
    renderBatchOrder();
    boSetStatus("Bridge offline — start it to edit batch order.", "err");
  }
}

async function loadBatchOrder(batch) {
  if (!batch) { state.boRows = []; renderBatchOrder(); return; }
  try {
    const r = await fetch("/api/batch-order?batch=" + encodeURIComponent(batch), { cache: "no-store" });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "could not read this batch");
    state.boRows = d.rows || [];
    renderBatchOrder();
    boSetDirty(false);
    boSetStatus(state.boRows.length + " account" + (state.boRows.length === 1 ? "" : "s") + " in batch " + batch, "ok");
  } catch (e) {
    state.boRows = [];
    renderBatchOrder();
    boSetStatus(e.message, "err");
  }
}

function renderBatchOrder() {
  const box = $("#boList");
  if (!box) return;
  if (!state.boRows.length) {
    box.innerHTML = '<div class="sl-muted">No accounts to show.</div>';
    boSetDirty(false);
    return;
  }
  box.innerHTML = state.boRows.map((a, i) => `
    <div class="bo-item" draggable="true" data-id="${esc(a.id)}">
      <span class="ms-grip" title="Drag to reorder" aria-hidden="true">⠿</span>
      <span class="ms-order">${i + 1}</span>
      <span class="ms-id">#${esc(a.id)}</span>
      <span class="bo-name">${esc(a.label || a.acct || "Account")}</span>
      <span class="bo-batches" title="Also in these batches">${(a.batches || []).map((b) => `<span class="bo-tag">${esc(b)}</span>`).join("")}</span>
    </div>`).join("");

  let dragId = null;
  $$(".bo-item", box).forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.id;
      state.boDragId = dragId;
      row.classList.add("dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
    });
    row.addEventListener("dragend", () => {
      dragId = null; state.boDragId = null;
      $$(".bo-item", box).forEach((r) => r.classList.remove("dragging", "drop-above", "drop-below"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragId || row.dataset.id === dragId) return;
      const r = row.getBoundingClientRect();
      const below = (e.clientY - r.top) > r.height / 2;
      row.classList.toggle("drop-below", below);
      row.classList.toggle("drop-above", !below);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetId = row.dataset.id;
      if (!dragId || targetId === dragId) return;
      const r = row.getBoundingClientRect();
      const below = (e.clientY - r.top) > r.height / 2;
      const rows = state.boRows.slice();
      const from = rows.findIndex((a) => String(a.id) === String(dragId));
      if (from < 0) return;
      const moved = rows.splice(from, 1)[0];
      let to = rows.findIndex((a) => String(a.id) === String(targetId));
      if (to < 0) to = rows.length;
      if (below) to += 1;
      rows.splice(to, 0, moved);
      state.boRows = rows;
      renderBatchOrder();
      boSetDirty(true);
    });
  });
}

async function saveBatchOrder() {
  if (!state.boBatch || !state.boRows.length) return;
  const btn = $("#boSave");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const r = await fetch("/api/batch-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: state.boBatch, ids: state.boRows.map((a) => a.id) }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "could not save");
    boSetDirty(false);
    boSetStatus("Saved — batch " + state.boBatch + " will load in this order.", "ok");
    toast("Batch " + state.boBatch + " load order saved", "ok", "↕");
  } catch (e) {
    boSetStatus(e.message, "err");
    toast("Could not save the order: " + e.message, "err");
  } finally {
    if (btn) { btn.textContent = "Save order"; btn.disabled = !state.boDirty; }
  }
}

function bindBatchOrder() {
  const sel = $("#boBatch");
  if (sel) sel.addEventListener("change", () => {
    state.boBatch = String(sel.value || "");
    loadBatchOrder(state.boBatch);
  });
  const reload = $("#boReload");
  if (reload) reload.addEventListener("click", loadBatchList);
  const save = $("#boSave");
  if (save) save.addEventListener("click", saveBatchOrder);
  const reset = $("#boReset");
  if (reset) reset.addEventListener("click", () => loadBatchOrder(state.boBatch));
}

function renderPresets() {
  const box = $("#presetList");
  if (!state.presets.length) {
    box.innerHTML = '<div class="preset-empty">No presets yet. Configure a launch, then save it above.</div>';
    return;
  }
  box.innerHTML = state.presets.map((p) => {
    const detail = [
      REGIONS[p.region] ? REGIONS[p.region].label : "NA",
      p.batchId ? "Batch " + p.batchId : null,
      p.accountIds && p.accountIds.length ? p.accountIds.length + " accounts" : null,
    ].filter(Boolean).join(" · ");
    return `<div class="preset-item">
      <div class="preset-info">
        <div class="preset-name">${esc(p.name)}</div>
        <div class="preset-detail">${esc(detail)}</div>
      </div>
      <div class="preset-actions">
        <button class="btn btn-primary" data-preset-run="${esc(p.id)}">▶ Run</button>
        <button class="btn btn-ghost" data-preset-del="${esc(p.id)}">✕</button>
      </div>
    </div>`;
  }).join("");
  $$("[data-preset-run]", box).forEach((b) => b.addEventListener("click", () => runPreset(b.dataset.presetRun)));
  $$("[data-preset-del]", box).forEach((b) => b.addEventListener("click", () => {
    state.presets = state.presets.filter((p) => p.id !== b.dataset.presetDel);
    savePresets(); renderPresets(); toast("Preset deleted", "ok", "🗑");
  }));
}

function runPreset(id) {
  const p = state.presets.find((x) => x.id === id);
  if (!p) return;
  state.region = p.region || state.region;
  renderRegionSeg();
  if (p.batchId) launchBatch(p.batchId);
  else if (p.accountIds && p.accountIds.length) {
    p.accountIds.forEach((aid) => launchAccount(aid));
  } else launchAll();
  toast("Running preset: " + p.name, "ok", "💾");
}

function savePreset() {
  const name = $("#presetName").value.trim();
  if (!name) { toast("Give your preset a name", "err"); return; }
  const batchId = $("#batchIdInput").value.trim();
  state.presets.push({
    id: "p" + Date.now(),
    name,
    region: state.region,
    batchId: batchId || null,
    accountIds: Array.from(state.selection),
    createdAt: Date.now(),
  });
  savePresets(); renderPresets();
  $("#presetName").value = "";
  toast("Preset saved: " + name, "ok", "💾");
}

/* ---------- config view ---------- */
function renderConfig() {
  const box = $("#configGroups");
  box.innerHTML = CONFIG_SCHEMA.map((g) => {
    const rows = g.items.map((it) => {
      const val = state.config[it.key] != null ? state.config[it.key] : "";
      let control = "";
      if (it.type === "bool") {
        const on = String(val).toLowerCase() === "true";
        control = `<label class="switch"><input type="checkbox" data-cfg="${it.key}" ${on ? "checked" : ""}/><span class="slider"></span></label>`;
      } else if (it.type === "select") {
        control = `<select data-cfg="${it.key}">` + it.options.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("") + `</select>`;
      } else if (it.type === "number") {
        control = `<input type="number" data-cfg="${it.key}" value="${esc(val)}" placeholder="—" />`;
      } else {
        control = `<input type="text" data-cfg="${it.key}" value="${esc(val)}" placeholder="—" />`;
      }
      return `<div class="cfg-row${it.wide ? " wide" : ""}">
        <div class="cfg-info"><div class="cfg-name">${esc(it.label)}</div><div class="cfg-desc">${esc(it.desc)}</div></div>
        <div class="cfg-control">${control}</div>
      </div>`;
    }).join("");
    const liveBlock = g.live === "tz" ? '<div class="cfg-live" id="tzCfgLive"></div>' : "";
    return `<div class="cfg-group">
      <div class="cfg-group-head"><h3>${g.icon} ${esc(g.group)}</h3><p>${esc(g.desc)}</p></div>
      <div class="cfg-rows">${rows}${liveBlock}</div>
    </div>`;
  }).join("");

  $$("[data-cfg]", box).forEach((el) => {
    el.addEventListener("change", () => {
      const key = el.dataset.cfg;
      state.config[key] = el.type === "checkbox" ? (el.checked ? "True" : "False") : el.value;
      saveConfig();
    });
  });

  renderTzConfigLive();
}

/* ---------- accounts table ---------- */
function tokenBadge(tok) {
  const t = String(tok || "").trim();
  if (!t) return '<span class="tok-badge none">— none</span>';
  if (t.length >= 200) return '<span class="tok-badge ok">🔒 encrypted</span>';
  return '<span class="tok-badge plain">⚠ plain</span>';
}

/* Mask an email so it is still recognisable but not readable on stream.
   "john.doe@gmail.com" -> "j\u2022\u2022\u2022@\u2022\u2022\u2022.com" */
function maskEmail(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  const at = s.indexOf("@");
  if (at < 1) return s.slice(0, 1) + "\u2022".repeat(Math.max(3, s.length - 1));
  const user = s.slice(0, at);
  const dom = s.slice(at + 1);
  const dot = dom.lastIndexOf(".");
  const dname = dot > 0 ? dom.slice(0, dot) : dom;
  const tld = dot > 0 ? dom.slice(dot) : "";
  const bullets = (n) => "\u2022".repeat(Math.max(2, n));
  return user.slice(0, 1) + bullets(user.length - 1) + "@" + dname.slice(0, 1) + bullets(dname.length - 1) + tld;
}

function renderAccountsTable() {
  const body = $("#acctTableBody");
  body.innerHTML = state.accounts.map((a, i) => {
    const revealed = state.showAcctEmails || state.acctReveal.has(i);
    const emailCell = revealed
      ? `<input type="text" data-f="Acct" value="${esc(a.Acct)}" />`
      : `<div class="email-masked" title="Email hidden \u2014 click the eye to reveal just this one"><span class="em-mask">${esc(maskEmail(a.Acct)) || "\u2014"}</span><button type="button" class="em-reveal" data-reveal-email="${i}" title="Reveal this email" aria-label="Reveal this email">\ud83d\udc41</button></div>`;
    return `
    <tr data-row="${i}">
      <td class="col-id"><input type="text" data-f="ID" value="${esc(a.ID)}" /></td>
      <td class="col-email">${emailCell}</td>
      <td class="col-label"><input type="text" data-f="AccountLabel" value="${esc(a.AccountLabel)}" class="label-input" /></td>
      <td class="col-batches"><input type="text" data-f="Batches" value="${esc(a.Batches)}" /></td>
      <td>
        <select data-f="AuthenticationMethod">
          ${["Parameter", "Token", "Steam"].map((o) => `<option ${String(a.AuthenticationMethod) === o ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </td>
      <td class="col-pw">
        <div class="pw-cell">
          <button type="button" class="pw-toggle" data-pw-toggle title="Show / hide password field">\ud83d\udd12</button>
          <input type="password" data-f="PW" value="${esc(a.PW)}" placeholder="(encrypted)" class="pw-input" hidden />
        </div>
      </td>
      <td class="col-token">${tokenBadge(a.Token)}</td>
      <td class="col-actions">
        <button class="btn btn-gold btn-sm" data-get-token="${i}" title="Get Battle.net token">\ud83d\udd11</button>
        <button class="btn btn-danger btn-sm" data-del-row="${i}" title="Remove">\u2715</button>
      </td>
    </tr>`;
  }).join("");

  $$("[data-reveal-email]", body).forEach((b) => b.addEventListener("click", () => {
    state.acctReveal.add(+b.dataset.revealEmail);
    renderAccountsTable();
  }));

  $$("[data-row] input, [data-row] select", body).forEach((el) => {
    el.addEventListener("change", () => {
      const row = +el.closest("tr").dataset.row;
      state.accounts[row][el.dataset.f] = el.value;
      saveAccounts();
      if (el.dataset.f === "ID" || el.dataset.f === "AccountLabel") { renderInstances(); renderManualSelect(); }
      if (el.dataset.f === "Token") { renderAccountsTable(); }
    });
  });
  $$("[data-get-token]", body).forEach((b) => b.addEventListener("click", () => openTokenModal(+b.dataset.getToken)));
  $$("[data-pw-toggle]", body).forEach((b) => b.addEventListener("click", () => {
    const cell = b.closest(".pw-cell");
    const inp = cell && cell.querySelector(".pw-input");
    if (!inp) return;
    inp.hidden = !inp.hidden;
    b.classList.toggle("active", !inp.hidden);
    if (!inp.hidden) inp.focus();
  }));
  $$("[data-del-row]", body).forEach((b) => b.addEventListener("click", () => {
    state.accounts.splice(+b.dataset.delRow, 1);
    saveAccounts(); renderAccountsTable(); renderInstances(); renderManualSelect();
    toast("Account removed", "ok", "🗑");
  }));
}

/* ============================================================
   PERSISTENCE
   ============================================================ */
const LS = {
  config: "d2rcc.config",
  configRaw: "d2rcc.configRaw",
  accounts: "d2rcc.accounts",
  presets: "d2rcc.presets",
  region: "d2rcc.region",
  showEmails: "d2rcc.showEmails",
  showAcctEmails: "d2rcc.showAcctEmails",
  sidebar: "d2rcc.sidebarCollapsed",
  accountRegions: "d2rcc.accountRegions",
  liveRegion: "d2rcc.liveRegion",
};
function saveConfig() { try { localStorage.setItem(LS.config, JSON.stringify(state.config)); } catch (e) {} }
function saveAccounts() { try { localStorage.setItem(LS.accounts, JSON.stringify(state.accounts)); } catch (e) {} }
function savePresets() { try { localStorage.setItem(LS.presets, JSON.stringify(state.presets)); } catch (e) {} }
function saveRegion() { try { localStorage.setItem(LS.region, state.region); } catch (e) {} }
function savePrefs() {
  try {
    localStorage.setItem(LS.showEmails, state.showEmails ? "1" : "0");
    localStorage.setItem(LS.showAcctEmails, state.showAcctEmails ? "1" : "0");
    localStorage.setItem(LS.sidebar, state.sidebarCollapsed ? "1" : "0");
  } catch (e) {}
}
function saveAccountRegions() {
  try { localStorage.setItem(LS.accountRegions, JSON.stringify(state.accountRegions)); } catch (e) {}
}

function loadFromLocalStorage() {
  try {
    const c = localStorage.getItem(LS.config); if (c) state.config = JSON.parse(c);
    const cr = localStorage.getItem(LS.configRaw); if (cr) state.configRaw = cr;
    const a = localStorage.getItem(LS.accounts); if (a) state.accounts = JSON.parse(a);
    const p = localStorage.getItem(LS.presets); if (p) state.presets = JSON.parse(p);
    const r = localStorage.getItem(LS.region); if (r) state.region = r;
    state.showEmails = localStorage.getItem(LS.showEmails) === "1";
    state.showAcctEmails = localStorage.getItem(LS.showAcctEmails) === "1";
    state.sidebarCollapsed = localStorage.getItem(LS.sidebar) === "1";
    const ar = localStorage.getItem(LS.accountRegions); if (ar) state.accountRegions = JSON.parse(ar) || {};
    const lr = localStorage.getItem(LS.liveRegion); if (lr && LIVE_REGION_LABEL[lr]) state.liveRegion = lr;
  } catch (e) { console.warn("LS load failed", e); }
}

/* ============================================================
   BRIDGE
   ============================================================ */
async function detectBridge() {
  try {
    const res = await fetch("/api/ping", { cache: "no-store" });
    if (res.ok) {
      const info = await res.json().catch(() => ({}));
      state.bridgeOnline = true;
      state.tokenHelper = !!info.tokenHelper;
      state.bridgeInfo = info;
      const bs = $("#bridgeStatus");
      bs.classList.add("online");
      $(".bridge-text", bs).textContent = info.tokenHelper ? "Bridge online · token ready" : "Bridge online";
      logLine("ok", "Local launcher bridge detected — buttons will run D2Loader.ps1 directly.");
      if (!info.tokenHelper) logLine("warn", "Token automation needs a one-time setup: run install-deps.bat (installs playwright-core).");
      if (!info.scriptExists) logLine("warn", "Loader path not set — open Configuration → Loader & Bridge to point the bridge at D2Loader.ps1.");
    }
  } catch (e) {
    state.bridgeOnline = false;
    state.bridgeInfo = null;
  }
  updateVersionBadges();
  renderBridgeConfig();
  updateSetupBanner();
  updateLiveChip(null);
  if (state.bridgeOnline) refreshInstances(true);
  if (state.bridgeOnline) refreshLiveStatus(false);
  // populate the batch-order dropdown once the bridge is reachable
  if (state.bridgeOnline && !state.boDirty) {
    const sel = $("#boBatch");
    const stale = !sel || !state.boRows.length || /Loading|offline|No batches/i.test(sel.options[0] ? sel.options[0].textContent : "");
    if (stale) loadBatchList();
  }
}

const UI_VERSION = "2.7";

function updateVersionBadges() {
  const ui = $("#uiVersion"), br = $("#bridgeVersion");
  if (ui) ui.textContent = "UI v" + UI_VERSION;
  if (br) {
    const v = state.bridgeOnline && state.bridgeInfo ? state.bridgeInfo.version : null;
    br.textContent = v ? "Bridge v" + v : "Bridge —";
    br.classList.toggle("mismatch", !!v && v !== UI_VERSION);
    br.title = v && v !== UI_VERSION
      ? "Heads-up: the bridge is v" + v + " but this page is v" + UI_VERSION + ". Restart the bridge and refresh."
      : "Bridge version";
  }
}

function updateSetupBanner() {
  const b = $("#setupBanner");
  if (!b) return;
  const show = !!(state.bridgeOnline && state.bridgeInfo && !state.bridgeInfo.scriptExists);
  b.hidden = !show;
}

/* ============================================================
   LOADER & BRIDGE SETTINGS (v1.2+)
   ============================================================ */
function chip(cls, label) {
  return `<span class="bc-chip ${cls}"><span class="dot"></span>${esc(label)}</span>`;
}

function renderBridgeConfig() {
  const card = $("#bridgeCfgCard");
  if (!card) return;
  const info = state.bridgeInfo;
  const status = $("#bridgeCfgStatus");
  const sp = $("#cfgScriptPath"), cp = $("#cfgCsvPath");
  const saveBtn = $("#btnSaveBridgeCfg");
  const hideWin = $("#cfgHideLoaderWindow");

  if (!state.bridgeOnline || !info) {
    status.innerHTML = `<div class="bc-chips">${chip("err", "Bridge offline")}</div>` +
      `<div class="bc-path">Start <code>Start-D2R-Command-Center.bat</code> to set the loader path here.</div>`;
    if (sp) sp.disabled = true;
    if (cp) cp.disabled = true;
    if (saveBtn) saveBtn.disabled = true;
    $("#btnBrowseScript").disabled = true;
    $("#btnBrowseCsv").disabled = true;
    return;
  }

  if (sp) sp.disabled = false;
  if (cp) cp.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
  if (hideWin) { hideWin.disabled = false; hideWin.checked = info.hideLoaderWindow !== false; }
  $("#btnBrowseScript").disabled = false;
  $("#btnBrowseCsv").disabled = false;

  // Only overwrite the inputs when the user isn't mid-edit.
  if (document.activeElement !== sp) sp.value = info.scriptPath || "";
  if (document.activeElement !== cp) cp.value = info.accountsCsvPath || "";

  const chips = [];
  chips.push(info.scriptExists ? chip("ok", "D2Loader.ps1 found") : chip("err", "D2Loader.ps1 not set"));
  chips.push(info.csvExists ? chip("ok", "Accounts.csv found") : chip("warn", "Accounts.csv not found"));
  chips.push(info.tokenHelper ? chip("ok", "Token helper ready") : chip("warn", "Token helper not installed"));
  chips.push(chip("ok", "Bridge v" + (info.version || "?")));

  status.innerHTML = `<div class="bc-chips">${chips.join("")}</div>` +
    `<div class="bc-path">Loader: ${esc(info.scriptPath || "(not set)")}<br>CSV: ${esc(info.csvPath || "(none)")}</div>`;
}

async function saveBridgeConfig() {
  if (!state.bridgeOnline) { toast("Bridge offline", "err"); return; }
  const btn = $("#btnSaveBridgeCfg");
  btn.disabled = true;
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptPath: $("#cfgScriptPath").value.trim(),
        accountsCsvPath: $("#cfgCsvPath").value.trim(),
        hideLoaderWindow: $("#cfgHideLoaderWindow") ? $("#cfgHideLoaderWindow").checked : undefined,
      }),
    });
    const info = await res.json();
    if (!info.ok) throw new Error(info.error || "save failed");
    state.bridgeInfo = info;
    renderBridgeConfig();
    toast(info.scriptExists ? "Loader path saved ✓" : "Saved — but that D2Loader.ps1 wasn't found", info.scriptExists ? "ok" : "err", "💾");
    logLine(info.scriptExists ? "ok" : "warn", "Loader path set to: " + (info.scriptPath || "(none)"));
  } catch (e) {
    toast("Could not save: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function browseForPath(kind) {
  if (!state.bridgeOnline) { toast("Bridge offline — type the path instead", "err"); return; }
  const target = kind === "csv" ? $("#cfgCsvPath") : $("#cfgScriptPath");
  const btn = kind === "csv" ? $("#btnBrowseCsv") : $("#btnBrowseScript");
  btn.disabled = true;
  try {
    const res = await fetch("/api/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const data = await res.json();
    if (data.ok && data.path) {
      target.value = data.path;
      toast("Selected: " + data.path.split(/[\\/]/).pop(), "ok", "📁");
    } else if (data.cancelled) {
      /* user closed the dialog — nothing to do */
    } else {
      toast("Browse needs Windows — type the path instead", "err");
    }
  } catch (e) {
    toast("Browse unavailable — type the path instead", "err");
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================
   IMPORT / EXPORT
   ============================================================ */
let importBuf = { config: null, accounts: null };

function openImport() { importBuf = { config: null, accounts: null }; $("#importModal").hidden = false; updateImportApply(); }
function closeImport() { $("#importModal").hidden = true; }
function updateImportApply() { $("#importApply").disabled = !(importBuf.config || importBuf.accounts); }

function handleFile(kind, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    if (kind === "config") {
      importBuf.config = text;
      $("#dzConfigName").textContent = file.name;
      $("#dropConfig").classList.add("loaded");
    } else {
      importBuf.accounts = text;
      $("#dzAccountsName").textContent = file.name;
      $("#dropAccounts").classList.add("loaded");
    }
    updateImportApply();
  };
  reader.readAsText(file);
}

function applyImport() {
  if (importBuf.config) {
    state.configRaw = importBuf.config;
    state.config = parseConfigXml(importBuf.config);
    saveConfig();
    try { localStorage.setItem(LS.configRaw, state.configRaw); } catch (e) {}
    renderConfig();
  }
  if (importBuf.accounts) {
    state.accounts = parseAccountsCsv(importBuf.accounts);
    saveAccounts();
    renderInstances(); renderManualSelect(); renderAccountsTable();
  }
  closeImport();
  toast("Import applied", "ok", "⬆");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

/* ============================================================
   NAV / VIEWS
   ============================================================ */
const VIEW_META = {
  instances: ["Instances", "Your Battle.net accounts, ready to launch."],
  launch: ["Launch & Presets", "Batch launches, saved presets, and live status."],
  config: ["Configuration", "Every config.xml option — as buttons, not XML."],
  accounts: ["Accounts", "Manage the accounts.csv roster."],
  console: ["Command Log", "The exact commands sent to D2Loader.ps1."],
};
function setView(v) {
  state.view = v;
  $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === v));
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
  const [t, s] = VIEW_META[v] || ["", ""];
  $("#viewTitle").textContent = t;
  $("#viewSub").textContent = s;
  if (v === "config") { if (!state.bridgeOnline) detectBridge(); else renderBridgeConfig(); }
}

/* ============================================================
   GET TOKEN  (automated Battle.net login -> token -> Accounts.csv)
   ============================================================ */
const TOKEN_RE = /(?<=\?ST=|&ST=|^|http:\/\/localhost:0\/\?ST=)([^&]+)/;

function extractTokenClient(str) {
  if (!str) return null;
  const s = String(str);
  let m = s.match(/[?&]ST=([^&]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  m = s.match(/http:\/\/localhost:0\/\?ST=([^&]+)/);
  if (m && m[1]) return m[1];
  m = s.match(/\b([A-Z]{2}-[0-9a-f]{8,}-[0-9a-f]{6,})\b/i);
  if (m && m[1]) return m[1];
  return null;
}

let tokenJobTimer = null;

function openTokenModal(accountIndex) {
  const sel = $("#tokenAccount");
  sel.innerHTML = state.accounts.map((a, i) =>
    `<option value="${i}">${esc(a.AccountLabel || a.Acct || ("Account " + a.ID))} — ${esc(a.Acct || "no email")}</option>`
  ).join("");
  if (typeof accountIndex === "number" && state.accounts[accountIndex]) sel.value = String(accountIndex);

  $("#tokenModal").hidden = false;
  $("#tokenProgress").hidden = true;
  $("#tokenResult").hidden = true;
  $("#tokenLog").innerHTML = "";
  $("#tokenPassword").value = "";
  syncTokenFields();
}

function closeTokenModal() {
  if (tokenJobTimer) { clearInterval(tokenJobTimer); tokenJobTimer = null; }
  $("#tokenModal").hidden = true;
}

function currentTokenAccount() {
  const i = +$("#tokenAccount").value;
  return state.accounts[i] || null;
}

function syncTokenFields() {
  const a = currentTokenAccount();
  if (!a) return;
  $("#tokenEmail").value = a.Acct || "";
  const hasSaved = String(a.PW || "").trim().length > 0;
  $("#tokenUseSaved").disabled = !hasSaved;
  if (!hasSaved) $("#tokenUseSaved").checked = false;
  $("#tokenUseSaved").parentElement.style.opacity = hasSaved ? "1" : ".5";
  $("#tokenPassword").disabled = $("#tokenUseSaved").checked;
}

function tokenLogLine(msg, kind) {
  const box = $("#tokenLog");
  const cls = kind === "err" ? "tp-err" : kind === "ok" ? "tp-ok" : "";
  box.insertAdjacentHTML("beforeend", `<div class="tp-line ${cls}">${esc(msg)}</div>`);
  box.scrollTop = box.scrollHeight;
}

function applyTokenToAccount(a, storedToken, encrypted) {
  if (!a) return;
  a.Token = storedToken;
  if ($("#tokenSetAuth").checked) a.AuthenticationMethod = "Token";
  saveAccounts();
  renderAccountsTable();
  renderInstances();
}

async function startGetToken() {
  const a = currentTokenAccount();
  if (!a) { toast("No account selected", "err"); return; }
  const email = $("#tokenEmail").value.trim();
  const password = $("#tokenPassword").value;
  const useSaved = $("#tokenUseSaved").checked;
  if (!email) { toast("Enter the Battle.net email", "err"); return; }
  if (!useSaved && !password) { toast("Enter the password (or use the saved one)", "err"); return; }

  if (!state.bridgeOnline) {
    toast("Bridge offline — using manual paste instead", "err");
    $("#tokenManual").focus();
    return;
  }

  const headless = $("#tokenMode").value === "headless";
  $("#btnGetToken").disabled = true;
  $("#tokenProgress").hidden = false;
  $("#tokenResult").hidden = true;
  $("#tokenLog").innerHTML = "";
  tokenLogLine("Starting Battle.net sign-in…");

  try {
    const res = await fetch("/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: a.ID,
        email,
        password: useSaved ? null : password,
        useSavedPassword: useSaved,
        region: $("#tokenRegion").value,
        headless,
        visibleFallback: true,
        encrypt: $("#tokenEncrypt").checked,
        setAuthMethod: $("#tokenSetAuth").checked,
        writeCsv: true,
      }),
    });
    const data = await res.json();
    if (!data.ok || !data.jobId) throw new Error(data.error || "Could not start the login job.");
    pollTokenJob(data.jobId, a);
  } catch (e) {
    $("#btnGetToken").disabled = false;
    tokenLogLine(e.message, "err");
    toast("Get Token failed: " + e.message, "err");
  }
}

function pollTokenJob(jobId, a) {
  let seen = 0;
  tokenJobTimer = setInterval(async () => {
    try {
      const res = await fetch("/api/token-status?jobId=" + encodeURIComponent(jobId), { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "status failed");
      (data.events || []).slice(seen).forEach((ev) => {
        seen++;
        if (ev.message) tokenLogLine(ev.message, ev.stage === "error" ? "err" : ev.stage === "token" || ev.stage === "csv" ? "ok" : "");
      });
      if (data.status === "done" || data.status === "error") {
        clearInterval(tokenJobTimer); tokenJobTimer = null;
        $("#btnGetToken").disabled = false;
        if (data.status === "done") onTokenSuccess(a, data.result);
        else onTokenError(data.result);
      }
    } catch (e) {
      clearInterval(tokenJobTimer); tokenJobTimer = null;
      $("#btnGetToken").disabled = false;
      tokenLogLine(e.message, "err");
    }
  }, 900);
}

function onTokenSuccess(a, result) {
  applyTokenToAccount(a, result.storedToken || result.token, result.encrypted);
  const r = $("#tokenResult");
  r.hidden = false;
  r.className = "token-result ok";
  r.innerHTML =
    `<div class="tr-title">✓ Token captured</div>` +
    `<div class="tr-row"><span>Token</span><code>${esc(result.masked)}</code></div>` +
    `<div class="tr-row"><span>Stored</span><span>${result.encrypted ? "🔒 DPAPI-encrypted" : "⚠ plain text"}</span></div>` +
    `<div class="tr-row"><span>Accounts.csv</span><span>${result.csvUpdated ? "✓ updated" : "not written"}</span></div>` +
    (result.usedVisibleFallback ? `<div class="tr-note">Completed in a visible window (verification was required).</div>` : "");
  toast("Token saved" + (result.encrypted ? " (encrypted)" : ""), "ok", "🔑");
}

function onTokenError(result) {
  const r = $("#tokenResult");
  r.hidden = false;
  r.className = "token-result err";
  const ch = result && result.challenge;
  r.innerHTML =
    `<div class="tr-title">✕ Could not get the token</div>` +
    `<div class="tr-note">${esc((result && result.error) || "Unknown error")}</div>` +
    (ch ? `<div class="tr-note">Battle.net requested human verification (${esc(ch.kind)}). Try again with “Show browser window”, or paste the token manually below.</div>` : "") +
    (result && result.code === "NO_PLAYWRIGHT" ? `<div class="tr-note">Run <code>install-deps.bat</code> once to enable automation.</div>` : "");
  toast("Get Token failed", "err");
}

async function useManualToken() {
  const a = currentTokenAccount();
  const raw = $("#tokenManual").value.trim();
  const token = extractTokenClient(raw);
  if (!token) { toast("No token found in that text", "err"); return; }

  if (state.bridgeOnline) {
    try {
      const res = await fetch("/api/secure-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: a ? a.ID : null, email: a ? a.Acct : "",
          raw, encrypt: $("#tokenEncrypt").checked,
          setAuthMethod: $("#tokenSetAuth").checked, writeCsv: true,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "failed");
      applyTokenToAccount(a, data.storedToken || token, data.encrypted);
      onTokenSuccess(a, { masked: data.masked, encrypted: data.encrypted, csvUpdated: data.csvUpdated, token: data.token });
      return;
    } catch (e) {
      tokenLogLine(e.message, "err");
    }
  }
  // Offline fallback: store plain; the loader encrypts it on next run.
  applyTokenToAccount(a, token, false);
  onTokenSuccess(a, { masked: token.length > 14 ? token.slice(0, 8) + "…" + token.slice(-6) : token, encrypted: false, csvUpdated: false });
  toast("Token set (plain) — loader will encrypt it on next run", "ok", "🔑");
}

/* ============================================================
   INIT
   ============================================================ */
async function loadDefaults() {
  // config.xml
  try {
    const r = await fetch("data/config.xml", { cache: "no-store" });
    if (r.ok) { state.configRaw = await r.text(); }
  } catch (e) { console.warn("config fetch failed", e); }
  if (!state.configRaw) state.configRaw = "<D2loaderconfig>\n</D2loaderconfig>";
  if (!Object.keys(state.config).length) state.config = parseConfigXml(state.configRaw);

  // Accounts.csv
  if (!state.accounts.length) {
    try {
      const r = await fetch("data/Accounts.csv", { cache: "no-store" });
      if (r.ok) state.accounts = parseAccountsCsv(await r.text());
    } catch (e) { console.warn("accounts fetch failed", e); }
  }
}

function bindEvents() {
  // nav
  $$(".nav-item").forEach((n) => n.addEventListener("click", () => setView(n.dataset.view)));

  // region
  $$("#regionSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    state.region = b.dataset.region; saveRegion(); renderRegionSeg();
    toast("Default realm: " + REGIONS[state.region].name, "ok", "🌍");
  }));

  // instances toolbar
  $("#acctSearch").addEventListener("input", (e) => { state.search = e.target.value; renderInstances(); });
  $$("#batchFilterRow .chip").forEach((c) => c.addEventListener("click", () => {
    state.filter = c.dataset.batch;
    $$("#batchFilterRow .chip").forEach((x) => x.classList.toggle("active", x === c));
    renderInstances();
  }));
  $("#btnOpenAll").addEventListener("click", launchAll);

  // launch view
  $$("#quickBatch .btn-batch").forEach((b) => b.addEventListener("click", () => {
    // quick batch = launch first N available accounts
    const n = +b.dataset.count;
    const avail = state.accounts.filter((a) => !state.open.has(String(a.ID))).slice(0, n);
    if (!avail.length) { toast("No available accounts", "err"); return; }
    avail.forEach((a) => launchAccount(a.ID));
    toast("Queued " + avail.length + " instances — they open one at a time", "ok", "⏳");
  }));
  $("#btnLaunchBatch").addEventListener("click", () => {
    const v = $("#batchIdInput").value.trim();
    if (!v) { toast("Enter a batch ID", "err"); return; }
    launchBatch(v);
  });
  $("#btnLaunchSelected").addEventListener("click", launchSelected);
  $("#btnClearSel").addEventListener("click", () => { state.selection.clear(); renderManualSelect(); });
  $("#btnSavePreset").addEventListener("click", savePreset);
  $("#btnCloseOne").addEventListener("click", () => {
    const v = $("#closeIdInput").value.trim();
    if (!v) { toast("Enter an account ID", "err"); return; }
    closeAccount(v);
  });
  $("#btnCloseAll").addEventListener("click", closeAll);

  // config
  $("#btnExportConfig").addEventListener("click", () => { download("config.xml", exportConfigXml()); toast("config.xml exported", "ok", "⬇"); });

  // loader & bridge settings (v1.2+)
  $("#btnSaveBridgeCfg").addEventListener("click", saveBridgeConfig);
  $("#btnBrowseScript").addEventListener("click", () => browseForPath("loader"));
  $("#btnBrowseCsv").addEventListener("click", () => browseForPath("csv"));
  const hideWinCb = $("#cfgHideLoaderWindow");
  if (hideWinCb) hideWinCb.addEventListener("change", () => { saveBridgeConfig(); toast(hideWinCb.checked ? "Loader will run hidden" : "Loader window will show", "ok"); });
  $("#cfgScriptPath").addEventListener("keydown", (e) => { if (e.key === "Enter") saveBridgeConfig(); });
  $("#cfgCsvPath").addEventListener("keydown", (e) => { if (e.key === "Enter") saveBridgeConfig(); });
  $("#btnSetupGo").addEventListener("click", () => setView("config"));

  // accounts
  $("#btnAddAccount").addEventListener("click", () => {
    const nextId = String(state.accounts.reduce((m, a) => Math.max(m, parseInt(a.ID, 10) || 0), 0) + 1);
    state.accounts.push({ ID: nextId, Acct: "", AccountLabel: "", Batches: "", TimeActive: "", CustomLaunchArguments: "", AuthenticationMethod: "Parameter", PW: "", Token: "" });
    saveAccounts(); renderAccountsTable(); renderInstances(); renderManualSelect();
    toast("Account added", "ok", "＋");
  });
  $("#btnExportAccounts").addEventListener("click", () => { download("Accounts.csv", exportAccountsCsv()); toast("Accounts.csv exported", "ok", "⬇"); });

  // get token
  $("#btnGetTokenTop").addEventListener("click", () => openTokenModal());
  $("#tokenClose").addEventListener("click", closeTokenModal);
  $("#tokenCancel").addEventListener("click", closeTokenModal);
  $("#tokenAccount").addEventListener("change", syncTokenFields);
  $("#tokenUseSaved").addEventListener("change", syncTokenFields);
  $("#btnGetToken").addEventListener("click", startGetToken);
  $("#btnTokenManual").addEventListener("click", useManualToken);

  // console
  $("#btnClearLog").addEventListener("click", () => { state.log = []; renderConsole(); updateOpenBadge(); $("#navBadgeLog").textContent = "0"; $("#navBadgeLog").classList.add("zero"); });

  // import/export modals
  $("#btnImport").addEventListener("click", openImport);
  $("#importClose").addEventListener("click", closeImport);
  $("#importCancel").addEventListener("click", closeImport);
  $("#importApply").addEventListener("click", applyImport);
  $("#fileConfig").addEventListener("change", (e) => handleFile("config", e.target.files[0]));
  $("#fileAccounts").addEventListener("change", (e) => handleFile("accounts", e.target.files[0]));
  ["#dropConfig", "#dropAccounts"].forEach((sel) => {
    const el = $(sel);
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("dragover"); });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", (e) => {
      e.preventDefault(); el.classList.remove("dragover");
      handleFile(sel === "#dropConfig" ? "config" : "accounts", e.dataTransfer.files[0]);
    });
  });

  $("#btnExport").addEventListener("click", () => { $("#exportModal").hidden = false; });
  $("#exportClose").addEventListener("click", () => { $("#exportModal").hidden = true; });
  $("#dlConfig").addEventListener("click", () => { download("config.xml", exportConfigXml()); toast("config.xml exported", "ok", "⬇"); });
  $("#dlAccounts").addEventListener("click", () => { download("Accounts.csv", exportAccountsCsv()); toast("Accounts.csv exported", "ok", "⬇"); });
  $("#dlBoth").addEventListener("click", () => {
    download("config.xml", exportConfigXml());
    setTimeout(() => download("Accounts.csv", exportAccountsCsv()), 400);
    toast("Exporting both files", "ok", "⬇");
  });

  // modal backdrop close
  $$(".modal-overlay").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal-overlay").forEach((m) => (m.hidden = true)); });
}


/* ============================================================
   v1.4 — sidebar collapse, email privacy, loader test
   ============================================================ */
function applySidebarState() {
  const sb = $("#sidebar");
  if (!sb) return;
  sb.classList.toggle("collapsed", !!state.sidebarCollapsed);
  const btn = $("#sidebarToggle");
  if (btn) {
    btn.title = state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
    btn.setAttribute("aria-expanded", state.sidebarCollapsed ? "false" : "true");
  }
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  savePrefs();
  applySidebarState();
}

function applyEmailToggle() {
  const btn = $("#btnToggleEmails");
  if (!btn) return;
  btn.classList.toggle("on", !!state.showEmails);
  btn.setAttribute("aria-pressed", state.showEmails ? "true" : "false");
  const lbl = $(".pt-label", btn);
  if (lbl) lbl.textContent = state.showEmails ? "Hide emails" : "Show emails";
  const ico = $(".pt-ico", btn);
  if (ico) ico.textContent = state.showEmails ? "👁" : "👁";
}

function toggleEmails() {
  state.showEmails = !state.showEmails;
  savePrefs();
  applyEmailToggle();
  renderInstances();
  toast(state.showEmails ? "Showing account emails" : "Hiding account emails", "ok", state.showEmails ? "👁" : "👁");
}

function applyAcctEmailToggle() {
  const btn = $("#btnAcctEmails");
  if (!btn) return;
  btn.classList.toggle("on", !!state.showAcctEmails);
  btn.setAttribute("aria-pressed", state.showAcctEmails ? "true" : "false");
  const lbl = $("#acctEmailsLbl");
  if (lbl) lbl.textContent = state.showAcctEmails ? "Hide emails" : "Show emails";
  const ico = $("#acctEmailsIco");
  if (ico) ico.textContent = state.showAcctEmails ? "\ud83d\ude48" : "\ud83d\udc41";
}

function toggleAcctEmails() {
  state.showAcctEmails = !state.showAcctEmails;
  if (!state.showAcctEmails) state.acctReveal.clear();
  savePrefs();
  applyAcctEmailToggle();
  renderAccountsTable();
  toast(state.showAcctEmails ? "Showing account emails" : "Account emails hidden", "ok", "\ud83d\udc41");
}

async function testLoader() {
  if (!state.bridgeOnline) { toast("Bridge offline", "err"); return; }
  const btn = $("#btnTestLoader");
  const old = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "\u23f3 Testing\u2026"; }
  try {
    const res = await fetch("/api/verify-loader", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      toast(data.note || "Loader looks good", "ok", "🧪");
      logLine("ok", "Loader test: " + (data.note || "OK"));
    } else {
      toast("Loader test failed \u2014 see Command Log", "err");
      logLine("err", "Loader test failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    toast("Loader test error: " + e.message, "err");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

function bindV14() {
  const t = $("#sidebarToggle"); if (t) t.addEventListener("click", toggleSidebar);
  const e = $("#btnToggleEmails"); if (e) e.addEventListener("click", toggleEmails);
  const ae = $("#btnAcctEmails"); if (ae) ae.addEventListener("click", toggleAcctEmails);
  const tl = $("#btnTestLoader"); if (tl) tl.addEventListener("click", testLoader);
  applySidebarState();
  applyEmailToggle();
  applyAcctEmailToggle();
}

/* ---- "Rp_Casanova" socials drop-down in the sidebar brand ---- */
function bindCredit() {
  const btn = $("#bcToggle"), menu = $("#bcMenu");
  if (!btn || !menu) return;
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  const open = () => { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); };
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  document.addEventListener("click", (ev) => {
    if (menu.hidden) return;
    if (!menu.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) close();
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") close(); });
}

/* ============================================================
   LIVE INSTANCES + LAUNCH QUEUE  (v2.2)
   ------------------------------------------------------------
   Every few seconds ask the bridge which D2R game windows are
   really open (the loader titles each one "<ID> - <Label> ...").
   That way a game you close with the X button, Task Manager, or
   a crash shows as Available again - no page refresh needed.
   The same call returns the bridge's launch queue so cards can
   show "Queued" / "Launching" while they wait their turn.
   ============================================================ */
const LIVE_POLL_MS = 4000;
let livePollTimer = null;
let liveBusy = false;

function queueStatusFor(id) {
  const q = state.queue || {};
  const sid = String(id);
  if (q.running && (q.running.ids || []).map(String).includes(sid)) return "launching";
  if ((q.queued || []).some((j) => (j.ids || []).map(String).includes(sid))) return "queued";
  return null;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

async function refreshInstances(force) {
  if (!state.bridgeOnline || liveBusy) return false;
  liveBusy = true;
  try {
    const res = await fetch("/api/instances" + (force ? "?force=1" : ""), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) return false;
    const prevQueue = JSON.stringify(state.queue);
    state.queue = data.queue || { running: null, queued: [] };
    let changed = prevQueue !== JSON.stringify(state.queue);
    state.liveSupported = !!data.supported;
    if (data.supported) {
      const next = new Set((data.open || []).map(String));
      if (!setsEqual(next, state.open)) {
        const closed = Array.from(state.open).filter((id) => !next.has(id));
        const opened = Array.from(next).filter((id) => !state.open.has(id));
        state.open = next;
        changed = true;
        opened.forEach((id) => logLine("ok", "Detected game open: " + acctName(id)));
        closed.forEach((id) => logLine("warn", "Detected game closed: " + acctName(id)));
      }
    }
    if (changed) { renderInstances(); updateOpenBadge(); }
    updateQueueBar();
    updateLiveChip(data);
    return true;
  } catch (e) {
    return false;
  } finally {
    liveBusy = false;
  }
}

function acctName(id) {
  const a = state.accounts.find((x) => String(x.ID) === String(id));
  return a ? (a.AccountLabel || ("Account " + id)) : ("Account " + id);
}

function pollInstancesSoon() { setTimeout(() => refreshInstances(true), 600); }

function startLivePolling() {
  if (livePollTimer) return;
  refreshInstances(true);
  livePollTimer = setInterval(() => { if (!document.hidden) refreshInstances(false); }, LIVE_POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshInstances(true); });
}

function updateQueueBar() {
  const bar = $("#queueBar");
  if (!bar) return;
  const q = state.queue || {};
  const waiting = (q.queued || []).length;
  if (!q.running && !waiting) { bar.hidden = true; return; }
  bar.hidden = false;
  const runLabel = q.running ? q.running.label : "next launch";
  $("#queueText").innerHTML =
    "<strong>" + esc(q.running ? "Launching: " + runLabel : "Starting " + runLabel) + "</strong>" +
    (waiting ? " &middot; " + waiting + " waiting" : "") +
    ' <span class="qb-hint">One token login at a time — the next one starts after this account reaches character select.</span>';
}

function updateLiveChip(data) {
  const el = $("#liveChip");
  if (!el) return;
  if (!state.bridgeOnline) { el.textContent = "Offline"; el.className = "live-chip off"; el.title = "Bridge offline"; return; }
  if (data && data.supported === false) { el.textContent = "Live: n/a"; el.className = "live-chip off"; el.title = "Live game detection works on Windows only"; return; }
  el.textContent = "● Live";
  el.className = "live-chip on";
  el.title = "Open games are detected automatically every few seconds";
}

async function manualRefresh() {
  const btn = $("#btnRefresh");
  if (btn) { btn.disabled = true; btn.classList.add("spinning"); }
  try {
    if (!state.bridgeOnline) await detectBridge();
    // pick up any edits to Accounts.csv made outside the app
    if (state.bridgeOnline) {
      try {
        const r = await fetch("/api/accounts-csv", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && d.ok && d.text) {
            // Merge (never delete): refresh fields for known IDs, add new IDs.
            const fresh = parseAccountsCsv(d.text);
            let added = 0;
            fresh.forEach((f) => {
              const cur = state.accounts.find((x) => String(x.ID) === String(f.ID));
              if (cur) Object.assign(cur, f); else { state.accounts.push(f); added++; }
            });
            if (fresh.length) { saveAccounts(); renderAccountsTable(); renderManualSelect(); }
            if (added) logLine("ok", "Refresh: picked up " + added + " new account(s) from Accounts.csv.");
          }
        }
      } catch (e) {}
    }
    const ok = await refreshInstances(true);
    renderInstances(); updateOpenBadge();
    toast(ok ? "Refreshed — " + state.open.size + " open" : "Refreshed", "ok", "⟳");
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; btn.classList.remove("spinning"); }, 400);
  }
}

async function clearQueue() {
  try {
    const r = await fetch("/api/queue/clear", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    toast(d.cancelled ? "Cancelled " + d.cancelled + " waiting launch" + (d.cancelled > 1 ? "es" : "") : "Nothing waiting", "ok", "✕");
    if (d.cancelled) logLine("warn", "Cancelled " + d.cancelled + " queued launch(es).");
  } catch (e) {}
  refreshInstances(true);
}

/* ============================================================
   LIVE STATUS  (v2.3)  — Terror Zone + DClone, live from D2Emu.com
   ------------------------------------------------------------
   The bridge fetches the loader's own TZ / DClone endpoints
   (d2emu.com) and hands back clean JSON. We just render it.
   Defaults to the Americas (US) region.
   ============================================================ */
const LIVE_STATUS_POLL_MS = 60000;
let liveStatusTimer = null;
let liveStatusBusy = false;

function fmtClock(unixSec) {
  if (!unixSec) return "—";
  try { return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return "—"; }
}
function fmtIn(unixSec) {
  if (!unixSec) return "";
  const mins = Math.round((unixSec * 1000 - Date.now()) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return "in " + mins + "m";
  const h = Math.floor(mins / 60), m = mins % 60;
  return "in " + h + "h" + (m ? " " + m + "m" : "");
}
function fmtAgo(ms) {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  return Math.round(s / 60) + "m ago";
}
function areaChips(names) {
  if (!names || !names.length) return '<span class="tz-none">—</span>';
  return names.map((n) => '<span class="tz-chip">' + esc(n) + "</span>").join("");
}
function tzMetaLine(superUniques, bossPacks, immunities) {
  const bits = [];
  if (bossPacks && bossPacks.length >= 2) bits.push("Boss packs " + bossPacks[0] + "–" + bossPacks[1]);
  if (superUniques && superUniques.length) bits.push("SuperUniques: " + superUniques.join(", "));
  if (immunities && immunities.length) bits.push("Immunities: " + immunities.join(", "));
  return bits.length ? bits.join(" · ") : "";
}
function nextTzCell(tz) {
  if (tz.nextAvailable && tz.next && tz.next.length) return areaChips(tz.next);
  return '<span class="tz-none">Unlocks ' + (tz.nextAvailableUtc ? fmtIn(tz.nextAvailableUtc) : "soon") + "</span>";
}

function renderLiveStatus() {
  const tz = state.live && state.live.tz;
  const dc = state.live && state.live.dclone;

  $$("#liveRegionSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.liveRegion === state.liveRegion));

  const upd = $("#liveUpdated");
  if (upd) upd.textContent = state.liveAt ? "Updated " + fmtAgo(state.liveAt) : "—";

  const errEl = $("#liveError");
  if (errEl) {
    if (state.liveError) { errEl.hidden = false; errEl.textContent = "⚠ " + state.liveError; }
    else errEl.hidden = true;
  }

  // ---- Terror Zone ----
  const tzLive = $("#tzLive");
  if (tzLive) tzLive.textContent = tz ? "live" : "";
  const curBox = $("#tzCurrent"), nextBox = $("#tzNext");
  const curMeta = $("#tzCurrentMeta"), nextMeta = $("#tzNextMeta"), nextIn = $("#tzNextIn");
  if (tz) {
    if (curBox) curBox.innerHTML = areaChips(tz.current);
    if (curMeta) curMeta.innerHTML = tzMetaLine(tz.currentSuperuniques, tz.currentBossPacks, tz.currentImmunities);
    if (nextIn) nextIn.textContent = tz.nextStartUtc ? "· " + fmtClock(tz.nextStartUtc) : "";
    if (nextBox) nextBox.innerHTML = nextTzCell(tz);
    if (nextMeta) nextMeta.innerHTML = (tz.nextAvailable && tz.next && tz.next.length)
      ? tzMetaLine(tz.nextSuperuniques, tz.nextBossPacks, tz.nextImmunities) : "";
  } else {
    if (curBox) curBox.innerHTML = '<span class="tz-none">—</span>';
    if (nextBox) nextBox.innerHTML = '<span class="tz-none">—</span>';
    if (curMeta) curMeta.innerHTML = "";
    if (nextMeta) nextMeta.innerHTML = "";
    if (nextIn) nextIn.textContent = "";
  }

  // ---- DClone ----
  const list = $("#dcloneList");
  const regLabel = $("#dcloneRegionLabel");
  if (regLabel) regLabel.textContent = (state.liveRegion || "us").toUpperCase();
  if (list) {
    const rows = (dc && dc[state.liveRegion]) || [];
    if (!rows.length) {
      list.innerHTML = '<div class="dc-empty">' + (state.liveError ? "Live data unavailable" : "No DClone data for this region") + "</div>";
    } else {
      list.innerHTML = rows.map((r) => {
        const p = Math.max(0, Math.min(6, r.progress));
        const walked = p >= 6;
        const segs = Array.from({ length: 6 }, (_, i) => '<span class="dc-seg' + (i < p ? " on" : "") + (walked ? " walked" : "") + '"></span>').join("");
        return '<div class="dc-row' + (walked ? " walked" : "") + '">' +
          '<div class="dc-name">' + esc(r.name) + '<span class="dc-tag">' + esc(r.tag) + "</span></div>" +
          '<div class="dc-bar">' + segs + "</div>" +
          '<div class="dc-val">' + p + "/6" + (walked ? " 🔥" : "") + "</div>" +
          "</div>";
      }).join("");
    }
  }

  renderTzConfigLive();
  renderSideLive();
}

/* ---- sidebar live-status dropdowns (v2.4) ---- */
function renderSideLive() {
  const tz = state.live && state.live.tz;
  const dc = state.live && state.live.dclone;

  // Region buttons
  $$("#slRegionSeg .sl-region-btn").forEach((b) => b.classList.toggle("active", b.dataset.liveRegion === state.liveRegion));

  // Terror Zone summary + body
  const tzVal = $("#slTzVal");
  if (tzVal) {
    if (state.liveError && !tz) tzVal.textContent = "offline";
    else if (tz && tz.current && tz.current.length) tzVal.textContent = tz.current[0] + (tz.current.length > 1 ? " +" + (tz.current.length - 1) : "");
    else tzVal.textContent = "—";
  }
  const tzNow = $("#slTzNow");
  if (tzNow) tzNow.innerHTML = tz ? areaChips(tz.current) : '<span class="sl-muted">—</span>';
  const tzNext = $("#slTzNext");
  if (tzNext) tzNext.innerHTML = tz ? nextTzCell(tz) : '<span class="sl-muted">—</span>';
  const tzMeta = $("#slTzMeta");
  if (tzMeta) tzMeta.innerHTML = tz ? tzMetaLine(tz.currentSuperuniques, tz.currentBossPacks, tz.currentImmunities) : "";

  // DClone summary + body
  const rows = (dc && dc[state.liveRegion]) || [];
  const dcVal = $("#slDcVal");
  if (dcVal) {
    if (state.liveError && !rows.length) dcVal.textContent = "offline";
    else if (rows.length) {
      const maxP = Math.max.apply(null, rows.map((r) => Math.max(0, Math.min(6, r.progress))));
      dcVal.textContent = maxP >= 6 ? "WALKED 🔥" : maxP + "/6";
    } else dcVal.textContent = "—";
  }
  const dcList = $("#slDcList");
  if (dcList) {
    if (!rows.length) {
      dcList.innerHTML = '<span class="sl-muted">' + (state.liveError ? "Live data unavailable" : "No DClone data for this region") + "</span>";
    } else {
      dcList.innerHTML = rows.map((r) => {
        const p = Math.max(0, Math.min(6, r.progress));
        const walked = p >= 6;
        const segs = Array.from({ length: 6 }, (_, i) => '<span class="sl-seg' + (i < p ? " on" : "") + (walked ? " walked" : "") + '"></span>').join("");
        return '<div class="sl-dc-row' + (walked ? " walked" : "") + '">' +
          '<span class="sl-dc-name">' + esc(r.tag || r.name) + "</span>" +
          '<span class="sl-dc-bar">' + segs + "</span>" +
          '<span class="sl-dc-val">' + p + "/6</span>" +
          "</div>";
      }).join("");
    }
  }
}

function bindSideLive() {
  const tzBtn = $("#slTzToggle"), tzBody = $("#slTzBody");
  const dcBtn = $("#slDcToggle"), dcBody = $("#slDcBody");
  const setOpen = (btn, body, open) => {
    if (!btn || !body) return;
    body.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("open", open);
  };
  if (tzBtn) tzBtn.addEventListener("click", () => {
    state.sideTzOpen = !state.sideTzOpen;
    setOpen(tzBtn, tzBody, state.sideTzOpen);
  });
  if (dcBtn) dcBtn.addEventListener("click", () => {
    state.sideDcOpen = !state.sideDcOpen;
    setOpen(dcBtn, dcBody, state.sideDcOpen);
  });
  setOpen(tzBtn, tzBody, state.sideTzOpen);
  setOpen(dcBtn, dcBody, state.sideDcOpen);
  $$("#slRegionSeg .sl-region-btn").forEach((b) => b.addEventListener("click", () => setLiveRegion(b.dataset.liveRegion)));
}

function renderTzConfigLive() {
  const box = $("#tzCfgLive");
  if (!box) return;
  const tz = state.live && state.live.tz;
  if (!tz) {
    box.innerHTML = '<div class="tzc-head">🔥 Live Terror Zone</div>' +
      '<div class="tzc-body tz-none">' + (state.liveError ? "Live data unavailable — " + esc(state.liveError) : "Loading live Terror Zone…") + "</div>";
    return;
  }
  box.innerHTML =
    '<div class="tzc-head">🔥 Live Terror Zone <span class="tzc-upd">' + (state.liveAt ? fmtAgo(state.liveAt) : "") + "</span></div>" +
    '<div class="tzc-body">' +
      '<div class="tzc-line"><span class="tzc-k">Now</span><span class="tzc-v">' + areaChips(tz.current) + "</span></div>" +
      '<div class="tzc-line"><span class="tzc-k">Next</span><span class="tzc-v">' + nextTzCell(tz) + "</span></div>" +
    "</div>" +
    '<button class="btn btn-gold btn-sm tzc-use" id="btnUseCurrentTz">Use current TZ as Alert Areas</button>';
  const b = $("#btnUseCurrentTz");
  if (b) b.addEventListener("click", () => {
    const ids = (tz.currentIds || []).join(",");
    if (!ids) { toast("No current TZ ids available", "err"); return; }
    state.config["TerrorZoneAlertAreas"] = ids;
    saveConfig();
    renderConfig();
    toast("Alert Areas set to current TZ (" + ids + ")", "ok", "🔥");
  });
}

async function refreshLiveStatus(force) {
  if (!state.bridgeOnline) { state.liveError = "Bridge offline"; renderLiveStatus(); return false; }
  if (liveStatusBusy) return false;
  liveStatusBusy = true;
  const btn = $("#btnLiveRefresh");
  if (btn) btn.classList.add("spinning");
  try {
    const res = await fetch("/api/live-status" + (force ? "?force=1" : ""), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data && data.ok) {
      state.live = data;
      state.liveAt = Date.now();
      state.liveError = null;
    } else {
      state.liveError = (data && data.error) || "Could not reach D2Emu.com";
    }
    renderLiveStatus();
    return !!(data && data.ok);
  } catch (e) {
    state.liveError = e.message || "network error";
    renderLiveStatus();
    return false;
  } finally {
    liveStatusBusy = false;
    if (btn) setTimeout(() => btn.classList.remove("spinning"), 400);
  }
}

function setLiveRegion(r) {
  if (!LIVE_REGION_LABEL[r]) return;
  state.liveRegion = r;
  try { localStorage.setItem(LS.liveRegion, r); } catch (e) {}
  renderLiveStatus();
}

function startLiveStatusPolling() {
  if (liveStatusTimer) return;
  refreshLiveStatus(false);
  liveStatusTimer = setInterval(() => { if (!document.hidden) refreshLiveStatus(false); }, LIVE_STATUS_POLL_MS);
}

/* ============================================================
   SINGLE-INSTANCE HEARTBEAT
   ------------------------------------------------------------
   The bridge keeps exactly ONE Command Center window open. It
   only opens a window when it hasn't heard from one recently, so
   this page quietly tells the bridge "I'm still open" every few
   seconds. That is what stops a second window from popping up.
   ============================================================ */
function startHeartbeat() {
  const beat = () => {
    try { fetch("/api/ui-heartbeat", { cache: "no-store" }).catch(() => {}); } catch (e) {}
  };
  beat();
  setInterval(beat, 4000);
}

/* ---------- window geometry persistence (v2.4) ---------- */
function startWindowStateTracking() {
  let t = null;
  let last = "";
  function report() {
    const w = Math.round(window.outerWidth || 0);
    const h = Math.round(window.outerHeight || 0);
    const x = Math.round(window.screenX || 0);
    const y = Math.round(window.screenY || 0);
    if (!w || !h) return;
    const key = [x, y, w, h].join(",");
    if (key === last) return;
    last = key;
    try {
      fetch("/api/window-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y, w, h }),
      }).catch(() => {});
    } catch (e) {}
  }
  function schedule() { clearTimeout(t); t = setTimeout(report, 700); }
  window.addEventListener("resize", schedule);
  window.addEventListener("move", schedule);
  setTimeout(report, 1200);
  schedule();
}

async function init() {
  loadFromLocalStorage();
  await loadDefaults();
  bindEvents();
  renderRegionSeg();
  renderInstances();
  renderManualSelect();
  renderPresets();
  renderConfig();
  renderAccountsTable();
  renderConsole();
  updateOpenBadge();
  bindV14();
  bindCredit();
  bindSideLive();
  bindBatchOrder();
  loadBatchList();
  detectBridge();
  startHeartbeat();
  startLivePolling();
  startWindowStateTracking();
  const rb = $("#btnRefresh"); if (rb) rb.addEventListener("click", manualRefresh);
  const qc = $("#btnQueueClear"); if (qc) qc.addEventListener("click", clearQueue);
  // keep the bridge status fresh (e.g. if you start it after opening the UI)
  setInterval(() => { if (!state.bridgeOnline) detectBridge(); }, 5000);
}

document.addEventListener("DOMContentLoaded", init);
