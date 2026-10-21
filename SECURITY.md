# Security policy

## Scope

D2R Command Center runs entirely on your PC. There is no server of ours, no
account system, no telemetry, and no remote code loading.

## Design decisions that matter

| Decision | Why |
|---|---|
| Bridge binds to `127.0.0.1` only | No network surface. Reaching the port already implies local code execution. |
| No API authentication | There is nothing to authenticate against — it's loopback-only by design. Do not expose port 8787 to a LAN or the internet. |
| Secrets encrypted with Windows DPAPI (CurrentUser) | Same mechanism as the loader. Only your Windows user can decrypt them. |
| Secrets passed to PowerShell over **STDIN** | They never appear in the process list or in shell history. |
| UI is static files from disk | No CDN, no remote script, no minified third-party bundle. |
| No `eval` of remote data | Config and CSV values are escaped before rendering. |
| Updater writes only inside its install directory | It never touches `D2Loader.ps1` or any other app's files. |

## What is stored, and where

| Data | Location | Protection |
|---|---|---|
| Battle.net tokens / passwords | `Accounts.csv` (next to the loader) | DPAPI, CurrentUser |
| Loader path, CSV path, window geometry | `bridge.config.json` | none needed (paths only) |
| Logs | `bridge.log` | none — **may contain paths and account labels** |
| Launch history | in memory | lost on restart |

`bridge.log` and the Command Log may include account labels and file paths.
Redact them before posting logs publicly.

## Known limitations

- **Local malware is out of scope.** Anything already running as your user can
  read your DPAPI secrets, exactly as it could with the loader alone.
- **Do not port-forward 8787.** The API can launch processes.
- **`bridge.config.json` is trusted input.** If someone can write to it, they can
  point the bridge at a different `.ps1`. Keep the install folder under your user
  profile, not in a world-writable location.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Contact the maintainer privately — via the links in the README (Twitch / YouTube
/ tip page all reach Rp_Casanova) or a GitHub security advisory on this repo.

Include:

- affected version (sidebar `UI vX` / `Bridge vX`),
- a description of the issue and its impact,
- reproduction steps,
- whether it requires local access or can be triggered remotely.

You'll get an acknowledgement as soon as possible. Please give a reasonable
window for a fix before public disclosure.

## Supported versions

Only the latest release is supported. Update with
`Update-D2R-Command-Center.bat` before reporting.
