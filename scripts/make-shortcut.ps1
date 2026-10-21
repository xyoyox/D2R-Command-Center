# ============================================================
#  D2R Command Center - Desktop Shortcut creator / repairer
#  ------------------------------------------------------------
#  Creates (or REPAIRS) a "D2R Command Center" shortcut on the
#  current user's Desktop. The shortcut launches
#  launch-command-center.vbs, which starts the bridge with NO
#  console window and opens the UI (reusing an existing window).
#
#  v2.5: the shortcut is now self-healing. If it already exists but
#  points at an old/moved install folder (the classic "the icon
#  errors after an update" problem) it is rewritten automatically -
#  you no longer need -Force for that.
#
#  Falls back to Start-D2R-Command-Center.bat if the .vbs is
#  missing for any reason.
#
#  Usage:
#     powershell -NoProfile -ExecutionPolicy Bypass -File make-shortcut.ps1
#     powershell ... -File make-shortcut.ps1 -Force   # always rewrite
# ============================================================
param([switch]$Force)

$ErrorActionPreference = 'Stop'

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\scripts
$root   = Split-Path -Parent $here                          # install root
$vbs    = Join-Path $here 'launch-command-center.vbs'
$bat    = Join-Path $root 'Start-D2R-Command-Center.bat'
$icon   = Join-Path $root 'assets\d2r.ico'

# Prefer the silent VBS launcher; fall back to the .bat.
if (Test-Path $vbs) { $target = $vbs } else { $target = $bat }

if (-not (Test-Path $target)) {
    Write-Host "  [!] Could not find launch-command-center.vbs or Start-D2R-Command-Center.bat next to this script." -ForegroundColor Red
    exit 1
}

# What the shortcut SHOULD look like for THIS install folder.
$wantTarget = $target
$wantArgs   = ''
if ($target -eq $vbs) {
    # Launch the silent .vbs through wscript explicitly, so it works even
    # if the .vbs file association has been changed on this PC.
    $wantTarget = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $wantArgs   = '"' + $vbs + '"'
}
$wantDir  = $root
$wantIcon = if (Test-Path $icon) { "$icon,0" } else { '' }

# GetFolderPath handles OneDrive-redirected Desktops correctly.
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'D2R Command Center.lnk'

$ws = New-Object -ComObject WScript.Shell

# ---- does an existing shortcut already point at this install? ----
if ((Test-Path $lnk) -and -not $Force) {
    $ok = $false
    try {
        $cur = $ws.CreateShortcut($lnk)
        $curTargetOk = ($cur.TargetPath -ieq $wantTarget)
        $curArgsOk   = ((($cur.Arguments  + '') -replace '\s+$','') -ieq (($wantArgs + '') -replace '\s+$',''))
        $curDirOk    = ($cur.WorkingDirectory -and ((Resolve-Path $cur.WorkingDirectory -ErrorAction SilentlyContinue).Path.TrimEnd('\') -ieq $wantDir.TrimEnd('\')))
        $curIconOk   = (-not $wantIcon) -or ($cur.IconLocation -ieq $wantIcon)
        # The target file itself must still exist, or the icon will error.
        $curFileOk   = (Test-Path $cur.TargetPath)
        $ok = ($curTargetOk -and $curArgsOk -and $curDirOk -and $curIconOk -and $curFileOk)
    } catch { $ok = $false }

    if ($ok) {
        Write-Host "  Desktop shortcut is already correct - leaving it alone." -ForegroundColor DarkGray
        exit 0
    }
    Write-Host "  Repairing an out-of-date desktop shortcut..." -ForegroundColor Yellow
}

$s = $ws.CreateShortcut($lnk)
$s.TargetPath       = $wantTarget
if ($wantArgs) { $s.Arguments = $wantArgs }
$s.WorkingDirectory = $wantDir
$s.Description      = 'D2R Command Center - companion UI for the D2R Loader'
$s.WindowStyle      = 7   # 7 = minimized: the .vbs shows no window anyway
if ($wantIcon) { $s.IconLocation = $wantIcon }
$s.Save()

# Force Explorer to notice the new icon immediately.
try {
    $code = 'ie4uinit.exe -show'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $code -WindowStyle Hidden -Wait
} catch {}

Write-Host ("  Desktop shortcut ready: " + $lnk) -ForegroundColor Green
