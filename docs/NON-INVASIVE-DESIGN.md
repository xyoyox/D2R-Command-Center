# 🛡 Non-invasive design

This document exists because the single most important question about a
companion tool is: **what does it change?**

Answer: **nothing of Shupershuff's.**

`D2Loader.ps1` is never edited. It is never copied, renamed, patched, forked,
re-implemented, decompiled or redistributed. It is executed as-is, with the
parameters it already documents, and its output files are read and written in the
formats it already understands.

---

## 1. The contract

Shupershuff's loader already has a public interface. It consists of:

**a) Command-line parameters** (`D2Loader.ps1`, `param(...)` block):

| Parameter | Meaning | Who sets it |
|---|---|---|
| `-AccountUsername` | launch one specific account | Command Center (single launch) |
| `-PW` | password for that account | Command Center (single launch) |
| `-Region` | `NA` / `EU` / `KR` / `CN` | Command Center (realm picker) |
| `-All` | launch every account | Command Center (**Open All**) |
| `-Batch <id>` | launch a batch by ID | Command Center (**Launch Batch**) |
| `-ManualSettingSwitcher` | use the manual settings path | Command Center (manual mode) |
| `-Close` | close instance(s) instead of launching | Command Center (**Close**) |

That's it. That is the entire integration surface for launching. There is no
plugin API, no hook, no injected DLL, no memory patching. We build a string of
those flags and run his script.

**b) Files it owns:**

| File | Format | We read | We write |
|---|---|---|---|
| `config.xml` | his XML schema | yes | yes — same keys, same structure |
| `Accounts.csv` | `ID,Acct,AccountLabel,Batches,TimeActive,CustomLaunchArguments,AuthenticationMethod,PW,Token` (+ window geometry columns the loader appends) | yes | yes — same columns, same order |
| `Accounts.csv.bak` | our own one-time backup | — | yes (created before a row reorder) |

**c) Its own secret format:** Windows DPAPI via
`ConvertTo-SecureString … | ConvertFrom-SecureString`, CurrentUser scope. We
produce tokens and passwords in that exact format using `scripts/secrets.ps1`,
so his engine decrypts them with no changes on his side.

---

## 2. What "untouched" means in practice

- The file `D2Loader.ps1` on your disk is byte-identical before and after using
  this app. You can verify with `Get-FileHash D2Loader.ps1`.
- Deleting this entire folder leaves his loader fully functional. Nothing is
  registered, no service is installed, no registry keys are added outside the
  shortcut and Node's own cache.
- Updating the Command Center never deletes or rewrites his loader. The updater
  explicitly refuses to touch files outside its own install directory.
- The Command Center does not run a second loader process in parallel. It queues
  launches, one at a time, because his engine's token flow requires one token
  per IP at a time. Serialisation is a *respect* for his design, not a
  workaround for it.

---

## 3. Why we reorder CSV rows instead of patching the loader

Batch load order is the only feature that could tempt a developer to "just add a
sort" to the loader. We didn't, because that would mean editing his script.

Instead we observed how his engine builds a batch:

```powershell
ForEach ($ID in $Script:AccountOptionsCSV){
    if ($ID.id -in $Script:AcceptableBatchIDs -and
        $ID.batches.split(',') -contains $Script:BatchToOpen.tostring()){
        $Script:BatchedAccountIDsToOpen += $ID.id
    }
}
```

It walks the CSV **top to bottom** and appends matches. Therefore **row order is
load order** — a property of his design we can use without changing a character
of it. Reordering rows for one batch, in place, with all other rows pinned to
their original positions, is a pure data operation on a file we already write.

Details and the exact algorithm: [`BATCH-LOAD-ORDER.md`](BATCH-LOAD-ORDER.md).

---

## 4. Why we don't wrap or shim his script

A shim (`D2Loader-wrapper.ps1` that calls the real one) would be tempting for
logging. We rejected it because:

1. It creates a second thing named "the loader", and users would start editing
   the wrong one.
2. It breaks his self-elevation logic (`Start-Process … -Verb RunAs`), which
   re-launches the *current* script path.
3. It makes his updates harder: if he changes his parameter block, our shim
   silently drifts.

Instead, `scripts/launch-loader.ps1` is an **argument builder** that ends in a
single call to his script by absolute path. It contains no game logic, no token
logic, no config parsing beyond reading the loader path from our own config.

---

## 5. What we do add to your machine

Being honest about the footprint:

| Item | Where | Removable? |
|---|---|---|
| `app\node_modules` (playwright-core + deps) | install folder | yes, delete the folder |
| A desktop shortcut | `%USERPROFILE%\Desktop` | yes, delete it |
| A portable Node runtime, if you had none | `tools\node` | yes |
| `bridge.log` | install folder | yes |
| `bridge.config.json` | install folder | yes — it only holds paths |
| `Accounts.csv.bak` | next to `Accounts.csv` | yes — created only when you reorder a batch |

No services, no scheduled tasks, no drivers, no registry hives beyond what a
normal shortcut creates.

---

## 6. Auditing it yourself

Everything is plain text and readable:

- **Every loader invocation** is a `spawn("powershell", [...])` in
  `app/server.js` — search for `launch-loader.ps1`.
- **Every config write** goes through one function that reads the XML, sets one
  key, and writes it back.
- **Every CSV write** goes through `serializeCsv()`, which preserves headers and
  quoting.
- **The UI** is static HTML/CSS/JS served from disk. No minified bundles, no
  remote scripts, no CDN.

If you find anything in this repo that modifies his files, that's a bug — please
open an issue.
