# ============================================================
#  D2R Command Center - bridge control helper
#  ------------------------------------------------------------
#  Keeps everything to ONE background bridge + at most ONE UI
#  window. Used by the launchers and the desktop shortcut.
#
#  Actions:
#     ensure [-NoUi]  - make sure exactly one bridge is running
#                       (starts it hidden if needed) and open the UI
#                       unless -NoUi is given.
#     open-ui         - open the UI window only if one isn't already
#                       open (never creates a duplicate).
#     stop            - stop the background bridge.
#     status          - print whether the bridge is running.
#
#  v2.5 reliability notes
#  ----------------------
#  * Everything talks to 127.0.0.1 (never "localhost"). On some PCs
#    "localhost" resolves to IPv6 ::1 first and the check times out
#    even though the bridge is fine - which made people click the
#    desktop icon again and again.
#  * A named mutex makes "ensure" single-flight, so hammering the icon
#    can no longer start several bridges at once.
#  * If the bridge is slow to answer we retry the start once.
#  * If the UI is ALREADY open we bring that window to the front
#    instead of silently doing nothing (the old "3-4 clicks" feeling).
# ============================================================
param(
    [Parameter(Position = 0)][string]$Action = "ensure",
    [switch]$NoUi
)

$ErrorActionPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path      # ...\scripts
$root = Split-Path -Parent $here                             # install root
$port = 8787
$base = "http://127.0.0.1:$port"
$log  = Join-Path $root 'bridge.log'

function Write-Log([string]$msg) {
    try {
        $line = ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
        Add-Content -LiteralPath $log -Value $line -Encoding UTF8
    } catch {}
}

function Test-Bridge {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$base/api/ping"
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Start-BridgeHidden([bool]$noBrowser) {
    $vbs = Join-Path $here 'start-bridge-hidden.vbs'
    if (-not (Test-Path $vbs)) { Write-Log "start-bridge-hidden.vbs is missing"; return $false }
    if ($noBrowser) { & cscript.exe //nologo $vbs "nobrowser" | Out-Null }
    else            { & cscript.exe //nologo $vbs | Out-Null }
    return $true
}

function Wait-Bridge([int]$seconds = 40) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Bridge) { return $true }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Focus-Ui {
    # Bring the already-open Command Center window to the front.
    try {
        $ws = New-Object -ComObject WScript.Shell
        $null = $ws.AppActivate('D2R Command Center')
    } catch {}
}

function Open-Ui {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Method POST -TimeoutSec 8 "$base/api/open-ui"
        $opened = $true
        try {
            $obj = $r.Content | ConvertFrom-Json
            if ($null -ne $obj.opened) { $opened = [bool]$obj.opened }
        } catch {}
        if (-not $opened) { Focus-Ui }
        return $true
    } catch {
        Write-Log ("open-ui failed: " + $_.Exception.Message)
        return $false
    }
}

function Ensure-Bridge([bool]$noUi) {
    if (-not (Test-Bridge)) {
        Write-Log "ensure: bridge not answering - starting it"
        if (-not (Start-BridgeHidden $noUi)) { return $false }
        if (-not (Wait-Bridge 40)) {
            # One retry: a first start can lose a race with antivirus or a
            # slow disk. The bridge exits quietly if the port is already
            # taken, so a second start is always safe.
            Write-Log "ensure: first start did not answer - retrying once"
            if (Test-Bridge) { return $true }
            $null = Start-BridgeHidden $noUi
            if (-not (Wait-Bridge 25)) {
                Write-Log "ensure: bridge still not answering after retry"
                return $false
            }
        }
        Write-Log "ensure: bridge is up"
    } else {
        Write-Log "ensure: bridge already running"
    }
    if (-not $noUi) {
        if (-not (Open-Ui)) { return $false }
    }
    return $true
}

# ------------------------------------------------------------
#  Single-flight: only one "ensure" may run at a time, so fast
#  repeated clicks on the desktop icon queue up instead of
#  fighting each other.
# ------------------------------------------------------------
$mutex = $null
$haveMutex = $false
if ($Action.ToLower() -eq 'ensure') {
    try {
        $mutex = New-Object System.Threading.Mutex($false, 'Global\D2RCommandCenterEnsure')
        $haveMutex = $mutex.WaitOne(45000)
    } catch {
        $haveMutex = $true   # if the mutex is unavailable, carry on anyway
    }
}

try {
    switch ($Action.ToLower()) {
        'ensure' {
            if (-not (Ensure-Bridge ([bool]$NoUi))) {
                Write-Host "  [!] The bridge did not start. See bridge.log for details."
                exit 1
            }
            exit 0
        }
        'open-ui' {
            if (-not (Test-Bridge)) {
                Write-Log "open-ui: bridge not running - starting it first"
                if (-not (Ensure-Bridge $false)) { exit 1 }
            } else {
                if (-not (Open-Ui)) { exit 1 }
            }
            exit 0
        }
        'stop' {
            Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
                Where-Object { $_.CommandLine -like '*server.js*' } |
                ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
            Write-Log "stop: bridge stopped"
            Write-Host "  D2R Command Center stopped."
            exit 0
        }
        'status' {
            if (Test-Bridge) { Write-Host "  Bridge is running." }
            else { Write-Host "  Bridge is not running." }
            exit 0
        }
        default {
            Write-Host "  Unknown action: $Action  (use: ensure | open-ui | stop | status)"
            exit 2
        }
    }
}
finally {
    if ($mutex -and $haveMutex) {
        try { $mutex.ReleaseMutex() } catch {}
    }
    if ($mutex) { try { $mutex.Dispose() } catch {} }
}
