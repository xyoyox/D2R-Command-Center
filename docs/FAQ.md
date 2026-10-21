# ❓ FAQ & troubleshooting

### Does this modify Shupershuff's loader?

**No.** `D2Loader.ps1` is read-only to us. We call it with its own documented
parameters and read/write the same `config.xml` and `Accounts.csv` it already
uses. Verify with `Get-FileHash D2Loader.ps1` before and after — the hash won't
change. See [NON-INVASIVE-DESIGN.md](NON-INVASIVE-DESIGN.md).

### Do I still need his loader installed?

Yes. This is a UI for his engine, not a replacement. Get it from
[his repository](https://github.com/shupershuff/Diablo2RLoader).

### Will this get me banned?

It launches the game the same way his loader does, with the same arguments and
the same token flow. It adds no injection, no memory reading, no packet
manipulation. That said, multi-boxing and third-party tools are always at your
own risk — the same risk you already accept by using the loader itself.

### Why does the app need admin rights?

It doesn't, for the UI. But `D2Loader.ps1` self-elevates to launch the game, and
Windows will prompt once. The bridge itself runs unelevated.

---

## Startup

### I have to click the desktop icon several times

Fixed in **v2.5**. Root causes were `localhost` resolving to IPv6 `::1` on some
PCs (making the health check time out while the bridge was actually fine), no
single-flight guard for rapid clicks, and silent failure with no feedback.

Now: health checks use `127.0.0.1`, a named mutex serialises concurrent starts,
the helper waits up to 40 s with one automatic retry, an already-open window is
raised with `AppActivate`, and a genuine failure shows a message box pointing at
`bridge.log`.

If you still see it on v2.5, open `bridge.log` — every stage is timestamped.

### The icon opens the wrong version / errors after updating

Fixed in **v2.5**. `make-shortcut.ps1` now validates the existing `.lnk`
(target path, arguments, working directory, icon, and whether the target still
exists) and repairs it in place. `Update-D2R-Command-Center.bat` also refreshes
the shortcut as a mandatory step and calls `ie4uinit.exe -show` so Explorer
redraws the icon.

Manual repair: run **`Create-Desktop-Shortcut.bat`** (it passes `-Force`).

### "Bridge offline"

1. Run `Start-D2R-Command-Center.bat`.
2. Check `bridge.log` in the install folder.
3. Confirm nothing else is on port 8787: `netstat -ano | findstr 8787`.
4. If a stale `node.exe` is holding the port: `Stop-D2R-Command-Center.bat`, then
   start again.

### "Loader path not set"

Configuration → **Loader & Bridge** → **Browse…** and pick `D2Loader.ps1`. The
path is stored in `bridge.config.json`, which survives updates.

### Windows Firewall asked about Node.js

Safe to cancel. The bridge listens on loopback only.

---

## Launching

### Two loaders start at once and both fail

That's the one-token-per-IP rule. The Command Center serialises launches through
a FIFO queue with a settle gap, so this shouldn't happen from the UI. If it does:

- make sure you're on v2.5+,
- make sure you're not also launching from his PowerShell menu at the same time,
- check the Command Log for two jobs with overlapping start times.

### The loader window flashes and disappears

Fixed in **v2.4**. A boolean flag was being passed as text, which PowerShell
couldn't bind. The helper now passes it as a string and elevates up-front so you
get one clean window.

### "Run loader in background" — what does it do?

When enabled, the loader's console window is hidden (`-WindowStyle Hidden` via the
VBS launcher) so you only see the game. Disable it if you want to watch his
console output for debugging.

### Can I change the order a batch loads in?

Yes — **Launch & Presets → ↕ Batch Load Order**. Pick the batch, drag the rows,
**Save order**. It rewrites only that batch's rows in `Accounts.csv`, because his
loader collects batch members top-to-bottom. Full explanation:
[BATCH-LOAD-ORDER.md](BATCH-LOAD-ORDER.md).

### Can I reorder before creating the batch?

You can drag accounts in *Or pick accounts manually* to set a one-off order. For
a **saved** batch, create it first (Accounts tab), then reorder it in Batch Load
Order. Ordering is a property of the batch, so it needs to exist.

---

## Tokens

### "⚠ plain" badge on a token

The bridge couldn't reach PowerShell to DPAPI-encrypt it, so it wrote plain text.
His loader won't accept that. Run `Install-D2R-Command-Center.bat` to repair the
helper, then re-run Get Token.

### Get Token hangs or shows a CAPTCHA

Battle.net sometimes challenges headless logins. The helper detects this and
reopens a **visible** window — finish the CAPTCHA / 2FA there within ~3 minutes
and the token is still captured automatically.

### Can I paste a token manually?

Yes. **Get Token → “Or paste the token / redirect URL manually”** accepts either
the whole `http://localhost:0/?ST=…` URL or just the `US-…-…` token.

### Where are my passwords stored?

In `Accounts.csv`, encrypted with Windows DPAPI (CurrentUser), the same format
his loader uses. Only your Windows user account can decrypt them. They are never
sent anywhere.

---

## UI

### The window doesn't remember its size/position

Move or resize it, then wait a second — geometry is saved (debounced) to
`bridge.config.json`. If `bridge.config.json` is read-only or the folder is
protected, the save silently fails. Check the file's timestamp.

### High memory usage

The UI is a Chromium window: 120–250 MB is normal. Options:

- run with `-nobrowser` and use a browser you already have open,
- close the Command Log tab if you have thousands of lines,
- avoid keeping the Live Status panels open on all four regions.

### Live Status says "unavailable"

D2Emu is unreachable or rate-limiting. Everything else keeps working; the panels
retry on the next poll. Check the region buttons (US/EU/KR/CN) — each is fetched
separately.

### Can I run the UI in my own browser?

Yes: start the bridge, then open <http://127.0.0.1:8787> in any browser. The
desktop shortcut is just a convenience.

---

## Updating

### How do I update?

Unzip the new release into an empty folder and run
`Update-D2R-Command-Center.bat`. It stops the app, replaces program files, keeps
`bridge.config.json` and `data\`, refreshes the shortcut, and restarts. It never
touches `D2Loader.ps1`.

### The version numbers disagree

Sidebar shows `UI vX` and `Bridge vY`. If they differ, the update copied one set
of files but not the other (usually a locked file). Close everything, run
`Stop-D2R-Command-Center.bat`, then re-run the updater.

### Will updating wipe my accounts?

No. `data\` and `bridge.config.json` are preserved. Your real `Accounts.csv` and
`config.xml` live with the loader, not with this app, and are never deleted.

---

## Still stuck?

Open `bridge.log` first — it timestamps every start attempt, health check and
error. Then check the **Command Log** tab for the exact command that was sent.
Between those two, most problems are visible in under a minute.
