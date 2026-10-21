# ============================================================
#  D2R Command Center - Updater  (v2.5)
#  ------------------------------------------------------------
#  Cleanly updates an EXISTING install to THIS version:
#     1. finds your existing D2R Command Center folder
#     2. stops the running app
#     3. removes old / stale app files
#     4. copies the new files in
#     5. keeps your settings + data (bridge.config.json, data\)
#     6. restarts the app
#
#  It NEVER touches Shupershuff's D2Loader.ps1.
#
#  Usage:
#     powershell -NoProfile -ExecutionPolicy Bypass -File update.ps1
#     powershell ... -File update.ps1 -Target "C:\path\to\D2R-Command-Center"
#     powershell ... -File update.ps1 -DryRun     (show what it WOULD do)
# ============================================================
param(
    [string]$Target,
    [switch]$DryRun
)

$ErrorActionPreference = 'SilentlyContinue'
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\scripts
$source = Split-Path -Parent $here                          # install root (the folder you unzipped)

# Items that are USER data - never overwritten, never deleted.
$protectedDirs  = @('node_modules', '.git', 'data')
$protectedFiles = @('bridge.config.json', 'bridge.log', 'install.log', '.d2rcc-target')

function Say([string]$m, [string]$c) {
    if ($c) { Write-Host $m -ForegroundColor $c } else { Write-Host $m }
}

function Test-InstallFolder([string]$dir) {
    if ([string]::IsNullOrWhiteSpace($dir)) { return $false }
    if (-not (Test-Path $dir)) { return $false }
    $srv = (Test-Path (Join-Path $dir 'app\server.js')) -or (Test-Path (Join-Path $dir 'server.js'))
    $idx = (Test-Path (Join-Path $dir 'app\index.html')) -or (Test-Path (Join-Path $dir 'index.html'))
    return ($srv -and $idx)
}

function Get-SavedTarget {
    $f = Join-Path $source '.d2rcc-target'
    if (Test-Path $f) {
        $t = (Get-Content $f -Raw).Trim()
        if (Test-InstallFolder $t) { return $t }
    }
    return $null
}

function Get-ShortcutTarget {
    try {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $lnk = Join-Path $desktop 'D2R Command Center.lnk'
        if (-not (Test-Path $lnk)) { return $null }
        $ws = New-Object -ComObject WScript.Shell
        $s = $ws.CreateShortcut($lnk)
        if (Test-InstallFolder $s.WorkingDirectory) { return $s.WorkingDirectory }
        if ($s.Arguments) {
            $vbs = $s.Arguments.Trim('"')
            if (Test-Path $vbs) {
                $d = Split-Path -Parent $vbs
                if (Test-InstallFolder $d) { return $d }
            }
        }
    } catch {}
    return $null
}

function Find-Installs {
    $hits = @()
    $desktop   = [Environment]::GetFolderPath('Desktop')
    $downloads = Join-Path $env:USERPROFILE 'Downloads'
    $documents = [Environment]::GetFolderPath('MyDocuments')
    $seeds = @($desktop, $downloads, $documents, $env:USERPROFILE) | Where-Object { $_ -and (Test-Path $_) }

    # Also look at top-level drive folders that look like ours.
    foreach ($drive in @('C:', 'D:', 'E:', 'F:')) {
        if (Test-Path ($drive + '\')) {
            Get-ChildItem -Path ($drive + '\') -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match 'd2r|command|diablo' } |
                ForEach-Object { $seeds += $_.FullName }
        }
    }

    foreach ($s in $seeds) {
        Get-ChildItem -Path $s -Filter 'server.js' -File -Recurse -Depth 3 -ErrorAction SilentlyContinue | ForEach-Object {
            $dir = $_.Directory.FullName
            if ((Split-Path -Leaf $dir) -ieq 'app') { $dir = Split-Path -Parent $dir }
            if (($dir -ne $source) -and (Test-InstallFolder $dir)) {
                $txt = Get-Content $_.FullName -Raw
                if ($txt -match 'D2R Command Center') {
                    if ($hits -notcontains $dir) { $hits += $dir }
                }
            }
        }
    }
    return $hits
}

# ------------------------------------------------------------
Say ""
Say "  ============================================" "Cyan"
Say "   D2R COMMAND CENTER - UPDATE" "Cyan"
Say "  ============================================" "Cyan"
Say ""

if (-not (Test-InstallFolder $source)) {
    Say "  [!] This updater must sit in the folder you unzipped (next to the app\ folder)." "Red"
    exit 1
}

# ---- 1) figure out which folder to update ----
$dest = $null
if ($Target) { $dest = $Target }
if (-not (Test-InstallFolder $dest)) { $dest = Get-SavedTarget }
if (-not (Test-InstallFolder $dest)) { $dest = Get-ShortcutTarget }

if (-not (Test-InstallFolder $dest)) {
    $hits = Find-Installs
    if ($hits.Count -eq 1) {
        $dest = $hits[0]
    } elseif ($hits.Count -gt 1) {
        Say "  Found more than one D2R Command Center folder:" "Yellow"
        for ($i = 0; $i -lt $hits.Count; $i++) { Say ("    [" + ($i + 1) + "] " + $hits[$i]) }
        $pick = Read-Host "  Type the number to update"
        $idx = 0
        if ([int]::TryParse($pick, [ref]$idx) -and $idx -ge 1 -and $idx -le $hits.Count) {
            $dest = $hits[$idx - 1]
        }
    }
}

if (-not (Test-InstallFolder $dest)) {
    Say "  I couldn't find your existing D2R Command Center folder automatically." "Yellow"
    Say "  Tip: open your D2R Command Center folder, copy the address bar, paste it below."
    $manual = Read-Host "  Path to your D2R Command Center folder (blank = cancel)"
    if (Test-InstallFolder $manual) { $dest = $manual }
}

if (-not (Test-InstallFolder $dest)) {
    Say "  [!] No existing install selected - nothing to update." "Red"
    exit 1
}

$dest       = (Resolve-Path $dest).Path.TrimEnd('\')
$sourceFull = (Resolve-Path $source).Path.TrimEnd('\')
$same       = ($dest -eq $sourceFull)

Say ("  Updating : " + $dest) "White"
Say ("  From     : " + $sourceFull)
if ($DryRun) { Say "  (DRY RUN - no changes will be made)" "Yellow" }
Say ""

# ---- 2) stop the running app ----
Say "  [1/6] Stopping the running app..."
$ctl = Join-Path $dest 'scripts\bridge-ctl.ps1'
if (-not $DryRun) {
    if (Test-Path $ctl) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ctl stop | Out-Null
    } else {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
            Where-Object { $_.CommandLine -like '*server.js*' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}

if ($same) {
    # The user unzipped straight into the install folder - files already replaced.
    Say "  [2/6] Files already in place (you unzipped into this folder)."
    Say "  [3/6] Skipping copy."
    Say "  [4/6] Skipping stale-file cleanup."
} else {
    # ---- 3) back up settings ----
    Say "  [2/6] Backing up your settings..."
    $cfg    = Join-Path $dest 'bridge.config.json'
    $cfgBak = Join-Path $env:TEMP 'd2rcc_bridge.config.json'
    if (Test-Path $cfg) { if (-not $DryRun) { Copy-Item -LiteralPath $cfg -Destination $cfgBak -Force } }

    # ---- 4) copy the new files in ----
    Say "  [3/6] Copying the new files..."
    $rc = @($sourceFull, $dest, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/R:1', '/W:1')
    foreach ($d in $protectedDirs)  { $rc += '/XD'; $rc += $d }
    foreach ($f in $protectedFiles) { $rc += '/XF'; $rc += $f }
    if ($DryRun) { $rc += '/L' }
    & robocopy @rc | Out-Null

    # ---- 5) remove old / stale app files ----
    Say "  [4/6] Removing old / stale files..."
    Get-ChildItem -Path $dest -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($dest.Length).TrimStart('\')
        $skip = $false
        foreach ($d in $protectedDirs)  { if ($rel -eq $d -or $rel -like ($d + '\*')) { $skip = $true } }
        foreach ($f in $protectedFiles) { if ($rel -eq $f) { $skip = $true } }
        if ($skip) { return }
        if (-not (Test-Path (Join-Path $sourceFull $rel))) {
            if ($DryRun) { Say ("        would remove: " + $rel) 'DarkGray' }
            else { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
        }
    }

    # remove now-empty leftover folders (deepest first)
    Get-ChildItem -Path $dest -Recurse -Directory -ErrorAction SilentlyContinue |
        Sort-Object { $_.FullName.Length } -Descending |
        ForEach-Object {
            $rel = $_.FullName.Substring($dest.Length).TrimStart('\')
            $skip = $false
            foreach ($d in $protectedDirs) { if ($rel -eq $d -or $rel -like ($d + '\*')) { $skip = $true } }
            if ($skip) { return }
            $empty = ((Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0)
            if ($empty -and (-not (Test-Path (Join-Path $sourceFull $rel)))) {
                if ($DryRun) { Say ("        would remove empty dir: " + $rel) 'DarkGray' }
                else { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
            }
        }

    # ---- restore settings + make sure data\ exists ----
    if ((Test-Path $cfgBak) -and (-not (Test-Path $cfg))) {
        if (-not $DryRun) { Copy-Item -LiteralPath $cfgBak -Destination $cfg -Force }
    }
    if (-not (Test-Path (Join-Path $dest 'data'))) {
        $srcData = Join-Path $sourceFull 'data'
        if (Test-Path $srcData) { if (-not $DryRun) { Copy-Item -LiteralPath $srcData -Destination (Join-Path $dest 'data') -Recurse -Force } }
    }
}

# ---- remember the target for next time ----
if (-not $DryRun) {
    try { Set-Content -Path (Join-Path $sourceFull '.d2rcc-target') -Value $dest -Encoding ASCII } catch {}
}

# ---- 5) refresh the desktop shortcut ----
# v2.5: an update used to leave the OLD shortcut in place. If the install
# folder moved (or the shortcut was made by an older version) the icon then
# errored. Always rebuild it against the folder we just updated.
Say "  [5/6] Refreshing the desktop shortcut..."
if (-not $DryRun) {
    $mk = Join-Path $dest 'scripts\make-shortcut.ps1'
    if (-not (Test-Path $mk)) { $mk = Join-Path $sourceFull 'scripts\make-shortcut.ps1' }
    if (Test-Path $mk) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $mk -Force | Out-Null
    } else {
        Say "        (make-shortcut.ps1 not found - skipping)"
    }
}

# ---- 6) restart ----
Say "  [6/6] Restarting the app..."
if (-not $DryRun) {
    if (Test-Path $ctl) { & powershell -NoProfile -ExecutionPolicy Bypass -File $ctl ensure | Out-Null }
}

Say ""
Say "  Done! Your D2R Command Center is now up to date." "Green"
Say "  (If the browser still shows the old look, press Ctrl+F5 once.)"
Say ""
