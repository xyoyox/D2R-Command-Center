# 🚀 Publishing this as a GitHub repository

This `github\` folder is the **documentation package** for the project. It is
deliberately kept separate so you can delete it from the distribution zip and
still have a clean, lean install for end users.

Everything below is a one-time setup.

---

## What's in here

```
github\
├─ README.md              ← the repo front page (badges, screenshots, features)
├─ CHANGELOG.md           ← version history, 1.0 → 2.7
├─ CONTRIBUTING.md        ← rules (incl. "never modify D2Loader.ps1")
├─ SECURITY.md            ← disclosure policy + security posture
├─ LICENSE                ← MIT (this project only; his loader is his)
├─ .gitignore             ← excludes node_modules, bridge.config.json, logs, *.bak
└─ docs\
   ├─ INSTALL.md          ← end-user + from-source + release build
   ├─ ARCHITECTURE.md     ← process model, API table, queue, startup, tokens
   ├─ BATCH-LOAD-ORDER.md ← the CSV-row-order mechanism, algorithm, API
   ├─ NON-INVASIVE-DESIGN.md ← the "his loader is untouched" contract
   ├─ FAQ.md              ← troubleshooting
   └─ images\             ← 5 screenshots used by README.md
```

---

## Step 1 — create the repo on GitHub

1. Go to <https://github.com/new>.
2. **Repository name:** `d2r-command-center`
3. **Description:**
   `A dark, button-driven companion UI for Shupershuff's Diablo2RLoader — his engine, untouched.`
4. **Public**, and **do not** initialise with a README (we already have one).
5. Create.

---

## Step 2 — assemble the working tree

The docs live in `github\`, but a repo needs the actual program too. Copy the
program files **up one level into a staging folder**, then drop the docs in:

```bat
:: from the folder that contains d2r-command-center\
mkdir d2r-cc-repo
xcopy d2r-command-center\app        d2r-cc-repo\app        /E /I /Y /EXCLUDE:exclude.txt
xcopy d2r-command-center\scripts    d2r-cc-repo\scripts    /E /I /Y
xcopy d2r-command-center\assets     d2r-cc-repo\assets     /E /I /Y
xcopy d2r-command-center\data       d2r-cc-repo\data       /E /I /Y
xcopy d2r-command-center\docs       d2r-cc-repo\docs       /E /I /Y
copy  d2r-command-center\*.bat      d2r-cc-repo\
copy  d2r-command-center\README.txt d2r-cc-repo\
copy  d2r-command-center\VERSION.txt d2r-cc-repo\
copy  d2r-command-center\bridge.config.json.example d2r-cc-repo\

:: now the GitHub docs
xcopy d2r-command-center\github\*   d2r-cc-repo\          /E /I /Y
```

`exclude.txt` should contain `node_modules` and `package-lock.json` so the
`xcopy` doesn't drag 40 MB of dependencies into git.

Then delete the things that must never be committed:

```bat
rmdir /S /Q d2r-cc-repo\app\node_modules
del d2r-cc-repo\bridge.config.json
del d2r-cc-repo\bridge.log
del d2r-cc-repo\app\package-lock.json
```

> ⚠ **Never commit `bridge.config.json`** — it contains your local paths.
> ⚠ **Never commit `Accounts.csv` with real tokens** — the bundled
> `data\Accounts.csv` should be the sample file only.

---

## Step 3 — push

```bat
cd d2r-cc-repo
git init
git add .
git commit -m "D2R Command Center v2.7 - companion UI for Shupershuff's D2R Loader"
git branch -M main
git remote add origin https://github.com/xyoyox/D2R-Command-Center.git
git push -u origin main
```

---

## Step 4 — polish the repo page

**About section (top right → ⚙):**

- Description: `A dark, button-driven companion UI for Shupershuff's Diablo2RLoader — his engine, untouched.`
- Website: your Twitch or YouTube link.
- Topics: `diablo2`, `diablo2resurrected`, `d2r`, `multi-boxing`, `powershell`,
  `nodejs`, `gaming-tool`, `launcher`, `ui`

**Releases:**

1. Releases → *Draft a new release*.
2. Tag `v2.7`, title `v2.7 — Panel order reversed, account emails hidden by default`.
3. Paste the `## [2.7]` section from `CHANGELOG.md`.
4. Attach `D2R-Command-Center-v2.7.zip` (the **Core** zip, without `github\`).
5. Publish.

**Social preview:** Settings → General → Social preview → upload
`docs/images/01-instances.png`.

**Pin the credit:** the README already links his repo in the first paragraph and
in Credits. Consider also adding a line to the repo description if you have room.

---

## Step 5 — keep the two zips separate

| Zip | Contains | Audience |
|---|---|---|
| `D2R-Command-Center-vX.Y.zip` | program only — **no `github\` folder** | end users |
| GitHub repo | program **+** `github\` docs | developers, auditors |

The Core zip is built from the parent folder and simply omits `github\`:

```bat
powershell -NoProfile -Command "Compress-Archive -Path 'Install-*.bat','Update-*.bat','Start-*.bat','Stop-*.bat','Create-*.bat','README.txt','VERSION.txt','app','scripts','assets','data','docs','bridge.config.json.example' -DestinationPath '..\D2R-Command-Center-vX.Y.zip' -Force"
```

Because `github\` isn't in that list, it can never leak into a release. Deleting
it from an install is always safe — nothing in `app\` or `scripts\` references it.

---

## Housekeeping

- Add a `CODE_OF_CONDUCT.md` if the repo gets busy.
- Add issue templates (`.github/ISSUE_TEMPLATE/bug_report.yml`) asking for
  version, `bridge.log` lines, and whether `D2Loader.ps1` is stock.
- If you enable Discussions, point "how do I…" questions there and keep Issues
  for reproducible bugs.
- Never accept a PR that modifies `D2Loader.ps1`. That is the one hard rule.
