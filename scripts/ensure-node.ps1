# ============================================================
#  D2R Command Center - make sure Node.js is available
#  ------------------------------------------------------------
#  If Node.js is already installed, does nothing.
#  Otherwise it tries, in order:
#     1. winget  (built into Windows 10/11)
#     2. downloading the official Node.js LTS .msi and installing
#        it silently
#
#  Prints NODE_OK on success, NODE_FAIL on failure.
#  Exit code 0 = ready, 1 = could not install.
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

function Have-Node {
    return ((Get-Command node -ErrorAction SilentlyContinue) -ne $null)
}

function Refresh-Path {
    $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $u = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($m, $u | Where-Object { $_ }) -join ';'
}

if (Have-Node) { Write-Host 'NODE_OK'; exit 0 }

# ---- 1) winget ----
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
    Write-Host '  Trying winget...'
    & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements 2>&1 | Out-Null
    Refresh-Path
    if (Have-Node) { Write-Host 'NODE_OK'; exit 0 }
}

# ---- 2) official MSI ----
Write-Host '  Downloading the Node.js installer from nodejs.org...'
try {
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $lts = $idx | Where-Object { $_.lts } | Select-Object -First 1
    if (-not $lts) { $lts = $idx | Select-Object -First 1 }
    $ver  = $lts.version
    $arch = 'x64'
    if (-not [Environment]::Is64BitOperatingSystem) { $arch = 'x86' }
    $url  = "https://nodejs.org/dist/$ver/node-$ver-$arch.msi"
    $out  = Join-Path $env:TEMP 'd2rcc-node-install.msi'
    Write-Host ("  Getting " + $url)
    Invoke-WebRequest $url -OutFile $out -UseBasicParsing
    Write-Host '  Installing (this can take a minute)...'
    Start-Process msiexec.exe -ArgumentList "/i `"$out`" /qn /norestart" -Wait
    Refresh-Path
    if (Have-Node) { Write-Host 'NODE_OK'; exit 0 }
} catch {
    Write-Host ('  Download/install failed: ' + $_.Exception.Message)
}

Write-Host 'NODE_FAIL'
exit 1
