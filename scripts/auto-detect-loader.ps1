# ============================================================
#  D2R Command Center - auto-detect Shupershuff's D2Loader.ps1
#  ------------------------------------------------------------
#  Searches the usual places for D2Loader.ps1 and, if it finds
#  one, writes bridge.config.json so the user never has to type
#  a path by hand.
#
#  Prints:
#     FOUND:<full path>     (and writes bridge.config.json)
#     NOTFOUND              (nothing written)
#
#  Usage:
#     powershell -NoProfile -ExecutionPolicy Bypass -File auto-detect-loader.ps1
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\scripts
$root = Split-Path -Parent $here                          # install root
$cfg  = Join-Path $root 'bridge.config.json'

# ---- where to look (in order) ----
$desktop   = [Environment]::GetFolderPath('Desktop')
$downloads = Join-Path $env:USERPROFILE 'Downloads'
$documents = [Environment]::GetFolderPath('MyDocuments')

$seeds = @($desktop, $downloads, $documents, $env:USERPROFILE) | Where-Object { $_ -and (Test-Path $_) }

# Also include any top-level C:\ folders that look like a loader folder.
Get-ChildItem -Path 'C:\' -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'diablo|d2r|loader' } |
    ForEach-Object { $seeds += $_.FullName }

$found = $null

# 1) Direct hits: <seed>\D2Loader.ps1  and  <seed>\*\D2Loader.ps1
foreach ($s in $seeds) {
    $direct = Join-Path $s 'D2Loader.ps1'
    if (Test-Path $direct) { $found = $direct; break }
}
if (-not $found) {
    foreach ($s in $seeds) {
        $hit = Get-ChildItem -Path $s -Filter 'D2Loader.ps1' -File -Recurse -Depth 3 -ErrorAction SilentlyContinue |
               Select-Object -First 1
        if ($hit) { $found = $hit.FullName; break }
    }
}

if (-not $found) {
    Write-Host '  [--] Could not find D2Loader.ps1 automatically.'
    Write-Host '       No problem - you can set it in the app:'
    Write-Host '       Configuration  ->  Loader & Bridge  ->  Browse.'
    Write-Host 'NOTFOUND'
    exit 0
}

# ---- write bridge.config.json (keep hideLoaderWindow if it was set) ----
$hide = $true
if (Test-Path $cfg) {
    try {
        $old = Get-Content $cfg -Raw | ConvertFrom-Json
        if ($null -ne $old.hideLoaderWindow) { $hide = [bool]$old.hideLoaderWindow }
    } catch { }
}

$obj = [ordered]@{
    scriptPath       = ($found -replace '\\', '/')
    hideLoaderWindow = $hide
}
$obj | ConvertTo-Json | Set-Content -Path $cfg -Encoding UTF8

Write-Host ('  [OK] Found your loader: ' + $found)
Write-Host ('FOUND:' + $found)
exit 0
