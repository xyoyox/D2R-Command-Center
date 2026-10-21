/* ============================================================
   D2R Command Center — Battle.net Token Helper
   ------------------------------------------------------------
   Automates the Battle.net "OSI" login to obtain the D2R auth
   token that the loader expects in the `Token` column.

   How the token is produced (verified against Battle.net):
     1. Go to  https://<region>.account.battle.net/login/en/?app=osi
     2. Type the account email into  #accountName  and submit.
     3. On the password page type the password into #password and
        submit. Battle.net runs an SRP6a proof in the page's own JS,
        then 302-redirects to  http://localhost:0/?ST=<TOKEN>&...
     4. We grab <TOKEN> from the redirect (three independent channels)
        and return it.

   Because the redirect target uses port 0 (an "unsafe port"), Chrome
   refuses to actually load it — but the URL is still observable, so
   we intercept it and read the token.

   Headless-first. If Battle.net throws a CAPTCHA / MFA / device
   challenge we detect it and (optionally) reopen a *visible* window
   so the user can finish the challenge; we then keep watching for
   the token. Nothing is ever sent anywhere except Battle.net.

   This module has NO dependency on the loader. It only needs a
   Chromium-based browser (system Edge/Chrome preferred, so nothing
   huge has to be downloaded).
   ============================================================ */

"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");

/* ---- region -> Battle.net login host ---- */
const REGION_HOSTS = {
  na: "us.account.battle.net",
  us: "us.account.battle.net",
  eu: "eu.account.battle.net",
  kr: "kr.account.battle.net",
  asia: "kr.account.battle.net",
};

/* ---- the loader's own token extraction regex ---- */
const TOKEN_RE = /(?<=\?ST=|&ST=|^|http:\/\/localhost:0\/\?ST=)([^&]+)/;

/* Extract the token from a redirect URL / Location header / bare token.
   NOTE: the loader's regex has a `^` branch (for bare pasted tokens) which
   would match the start of ANY url, so we only use it as a last resort. */
function extractToken(str) {
  if (!str) return null;
  const s = String(str);
  // 1) explicit ST= query parameter (redirect Location headers, URLs)
  let m = s.match(/[?&]ST=([^&]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  // 2) the loader's localhost redirect shape
  m = s.match(/http:\/\/localhost:0\/\?ST=([^&]+)/);
  if (m && m[1]) return m[1];
  // 3) a bare pasted token, e.g. US-d4cc45d7f6ffb3f4ca6d6ee9e88fdb43-85625860
  m = s.match(/\b([A-Z]{2}-[0-9a-f]{8,}-[0-9a-f]{6,})\b/i);
  if (m && m[1]) return m[1];
  return null;
}

/* ---- candidate browser executables on Windows / macOS / Linux ---- */
function candidateExecutables() {
  const out = [];
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env["LOCALAPPDATA"] || "";
    out.push(
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe")
    );
  } else if (process.platform === "darwin") {
    out.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    out.push(
      "/usr/bin/microsoft-edge",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    );
  }
  return out.filter((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
}

/* ---- load playwright (full or -core) ---- */
function loadPlaywright() {
  const tries = ["playwright", "playwright-core"];
  for (const name of tries) {
    try { return require(name); } catch (e) { /* keep trying */ }
  }
  const err = new Error(
    "Playwright is not installed. In the bridge folder run:\n" +
    "    npm install\n" +
    "(it installs playwright-core and uses your existing Edge/Chrome, so no big download)."
  );
  err.code = "NO_PLAYWRIGHT";
  throw err;
}

/* ---- launch a Chromium-based browser, preferring the system one ---- */
async function launchBrowser(pw, { headless }) {
  const commonArgs = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=Translate,OptimizationHints,MediaRouter,msEdgeSidebarV2",
    // Trim RAM: no extensions, no background services, no component updates.
    // The token grab is short-lived and the browser is closed right after.
    "--disable-extensions",
    "--disable-component-update",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-client-side-phishing-detection",
  ];
  const attempts = [];

  // 0) explicit override (tests / power users): D2R_BROWSER_PATH
  if (process.env.D2R_BROWSER_PATH) attempts.push({ executablePath: process.env.D2R_BROWSER_PATH });
  // 1) system channels (no browser download needed)
  attempts.push({ channel: "msedge" });
  attempts.push({ channel: "chrome" });
  // 2) explicit executable paths
  for (const exe of candidateExecutables()) attempts.push({ executablePath: exe });
  // 3) whatever playwright bundled
  attempts.push({});

  let lastErr = null;
  for (const opt of attempts) {
    try {
      const browser = await pw.chromium.launch({
        headless,
        timeout: 20000,
        args: commonArgs,
        ignoreDefaultArgs: ["--enable-automation"],
        ...opt,
      });
      return browser;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Could not launch any Chromium-based browser.");
}

/* ---- find an input by a list of selectors, fill it ---- */
async function fillAny(page, selectors, value, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        try {
          await el.click({ timeout: 2000 }).catch(() => {});
          await el.fill("");
          await el.type(value, { delay: 12 });
          return sel;
        } catch (e) { /* try next */ }
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickAny(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      try { await el.click({ timeout: 3000 }); return sel; } catch (e) { /* next */ }
    }
  }
  return null;
}

/* ---- detect a human-interaction challenge ---- */
async function detectChallenge(page) {
  const url = page.url() || "";
  if (/captcha|challenge|verify|verification|authenticator|device/i.test(url)) {
    return { kind: "url", detail: url };
  }
  const cap = await page.$(
    'iframe[src*="captcha"], iframe[src*="hcaptcha"], iframe[src*="recaptcha"],' +
    ' .g-recaptcha, #captcha, [data-sitekey], form.form-with-captcha.captcha-visible'
  ).catch(() => null);
  if (cap) return { kind: "captcha", detail: "captcha element present" };

  const code = await page.$(
    'input[name="code"], input#code, input[autocomplete="one-time-code"],' +
    ' input[name="otp"], input[name="authenticatorCode"], input[name="deviceProof"]:not([value])'
  ).catch(() => null);
  if (code) return { kind: "mfa", detail: "one-time-code field present" };

  const body = (await page.textContent("body").catch(() => "")) || "";
  if (/verification code|authenticator|two-factor|2-step|enter the code|check your (email|inbox)|approve.*login/i.test(body)) {
    return { kind: "mfa-text", detail: "verification text on page" };
  }
  return null;
}

/* ============================================================
   One login attempt in a single browser session.
   ============================================================ */
async function attemptLogin(pw, { email, password, region, headless, allowChallenge, onEvent, tokenWaitMs }) {
  const host = REGION_HOSTS[String(region || "na").toLowerCase()] || REGION_HOSTS.na;
  // D2R_LOGIN_URL lets tests point the flow at a local mock; unset in normal use.
  const loginUrl = process.env.D2R_LOGIN_URL || `https://${host}/login/en/?app=osi`;

  const browser = await launchBrowser(pw, { headless });
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
    userAgent: undefined,
  });
  const page = await context.newPage();

  let token = null;
  const grab = (s) => { const t = extractToken(s); if (t && !token) token = t; };

  page.on("response", (r) => { try { grab(r.headers()["location"]); } catch (e) {} });
  page.on("request", (r) => grab(r.url()));
  page.on("framenavigated", (f) => grab(f.url()));

  // Intercept the unsafe-port redirect so the browser never hangs on the error page.
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (/localhost:0/.test(u) || /[?&]ST=/.test(u)) {
      grab(u);
      return route.abort().catch(() => {});
    }
    return route.continue().catch(() => {});
  });

  const finish = async (result) => { try { await browser.close(); } catch (e) {} return result; };

  try {
    onEvent && onEvent({ stage: "navigate", url: loginUrl });
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // ---- Step 1: email ----
    const emailSel = await fillAny(page, [
      "#accountName", 'input[name="accountName"]', 'input[type="email"]',
      'input[name="email"]', 'input[autocomplete="username"]', "#email",
    ], email, 30000);
    if (!emailSel) return finish({ ok: false, error: "Could not find the email field on the Battle.net page." });

    onEvent && onEvent({ stage: "email-entered" });
    await clickAny(page, ["#submit", 'button[type="submit"]', ".submit-button", 'button:has-text("Continue")', 'button:has-text("Next")']);

    // ---- Step 2: password (page may be the same or a new one) ----
    const passSel = await fillAny(page, [
      "#password", 'input[name="password"]', 'input[type="password"]',
      'input[autocomplete="current-password"]',
    ], password, 30000);

    if (!passSel) {
      const ch = await detectChallenge(page);
      if (ch) return finish({ ok: false, challenge: ch, stage: "after-email" });
      return finish({ ok: false, error: "Could not find the password field. The login page layout may have changed." });
    }

    onEvent && onEvent({ stage: "password-entered" });
    await clickAny(page, ["#submit", 'button[type="submit"]', ".submit-button", 'button:has-text("Log In")', 'button:has-text("Continue")']);

    // ---- Step 3: wait for the token (or a challenge) ----
    const deadline = Date.now() + (tokenWaitMs || 25000);
    let challengeSeen = null;
    while (Date.now() < deadline) {
      if (token) break;
      const ch = await detectChallenge(page);
      if (ch) {
        challengeSeen = ch;
        if (!allowChallenge) break;           // headless: bail so caller can retry visible
        // visible mode: keep waiting for the human to finish
      }
      await page.waitForTimeout(500);
    }

    if (token) return finish({ ok: true, token, region: String(region || "na").toLowerCase(), host });
    if (challengeSeen) return finish({ ok: false, challenge: challengeSeen, stage: "after-password" });
    return finish({ ok: false, error: "Timed out waiting for the token. Check the email/password and try again." });
  } catch (e) {
    return finish({ ok: false, error: e.message || String(e) });
  }
}

/* ============================================================
   Public entry point. Headless-first with optional visible fallback.
   ============================================================ */
async function getToken({ email, password, region = "na", headless = true, visibleFallback = true, onEvent } = {}) {
  if (!email || !password) throw new Error("email and password are required");
  const pw = loadPlaywright();

  onEvent && onEvent({ stage: "start", headless, region });
  let res = await attemptLogin(pw, {
    email, password, region, headless, allowChallenge: false, onEvent, tokenWaitMs: 25000,
  });

  if (!res.ok && res.challenge && headless && visibleFallback) {
    onEvent && onEvent({
      stage: "fallback",
      message: "Battle.net asked for human verification — reopening a visible window. Please finish it there; the token is captured automatically.",
      challenge: res.challenge,
    });
    res = await attemptLogin(pw, {
      email, password, region, headless: false, allowChallenge: true, onEvent, tokenWaitMs: 180000,
    });
    if (res.ok) res.usedVisibleFallback = true;
  }

  return res;
}

/* ============================================================
   CLI:  node token-helper.js --email a@b.c --password x --region na [--show]
   (used for testing; the bridge calls getToken() directly)
   ============================================================ */
if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--email") opt.email = args[++i];
    else if (a === "--password") opt.password = args[++i];
    else if (a === "--region") opt.region = args[++i];
    else if (a === "--show") opt.headless = false;
  }
  opt.onEvent = (e) => console.error("[event]", JSON.stringify(e));
  getToken(opt)
    .then((r) => { console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.log(JSON.stringify({ ok: false, error: e.message })); process.exit(2); });
}

module.exports = { getToken, extractToken, REGION_HOSTS, loadPlaywright };
