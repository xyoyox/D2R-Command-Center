# ============================================================
#  D2R Command Center - loader launcher (window control + icon)
#  ------------------------------------------------------------
#  Runs Shupershuff's D2Loader.ps1 and controls the console window
#  it runs in:
#     -Hide 1  -> the console is hidden (loader never flashes up)
#     -Hide 0  -> the console is visible (you can watch the loader)
#  In BOTH cases the console window is given the Command Center's
#  own icon (assets\d2r.ico) instead of the generic PowerShell icon.
#
#  Why this file exists:
#    The bridge elevates the loader with `Start-Process -Verb RunAs`
#    (the loader needs admin). Windows IGNORES -WindowStyle Hidden
#    when a process is elevated that way, so the loader's console
#    still appeared. The reliable fix is to hide the console from
#    *inside* the process - which is exactly what this wrapper does
#    before it hands control to the loader.
#
#  IMPORTANT (v2.4 fix):
#    -Hide is a STRING, not a [bool]. When the bridge passes
#    "-Hide 0" / "-Hide 1" on the command line, Windows hands it over
#    as text; a [bool] parameter REJECTS that text ("Cannot convert
#    value System.String to type System.Boolean") and the whole
#    wrapper dies instantly - which made the loader window flash open
#    and vanish and the game never launch. We parse the text instead.
#
#  It is invoked like this (by server.js):
#    powershell -NoProfile -ExecutionPolicy Bypass -File launch-loader.ps1 `
#        -LoaderPath "C:\...\D2Loader.ps1" -Hide 1 -AccountUsername foo -Region 1
#
#  Every parameter the loader understands is declared here too, and
#  only the ones that were actually supplied are forwarded - so the
#  loader receives exactly the same named parameters it always did.
#
#  NOTE: This file does NOT modify Shupershuff's loader in any way.
#        It only controls the window of the process that runs it.
# ============================================================
param(
    [Parameter(Mandatory = $true)]
    [string]$LoaderPath,

    # Hide the console window? "1"/"true" = hide, "0"/"false" = show.
    [string]$Hide = "1",

    # Internal guard so a self-elevated relaunch does not loop.
    [string]$Elevated = "0",

    # ---- the loader's own parameters (forwarded verbatim) ----
    [string]$AccountUsername,
    [string]$PW,
    [string]$Region,
    [string]$All,
    [string]$Batch,
    [string]$ManualSettingSwitcher,
    [string]$Close
)

# ---- 0) work out what the caller actually wants ----
$hideConsole = -not ($Hide -eq "0" -or $Hide -eq "false" -or $Hide -eq "False")

# ---- 1) make sure we are elevated BEFORE running the loader ----
# The loader self-elevates (Start-Process -Verb RunAs; exit) if it is
# not admin. If we let it do that from inside this wrapper, the loader
# spawns a SECOND window and this one closes - the "flash then gone"
# look. Elevating the wrapper up-front means the loader sees it is
# already admin, stays in this one console, and keeps our icon.
$isAdmin = $false
try {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { $isAdmin = $false }

if (-not $isAdmin -and $Elevated -ne "1") {
    try {
        $argList = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", "`"$PSCommandPath`"",
            "-LoaderPath", "`"$LoaderPath`"",
            "-Hide", "`"$Hide`"",
            "-Elevated", "1"
        )
        foreach ($name in 'AccountUsername', 'PW', 'Region', 'All', 'Batch', 'ManualSettingSwitcher', 'Close') {
            if ($PSBoundParameters.ContainsKey($name)) {
                $argList += "-$name"
                $argList += "`"$($PSBoundParameters[$name])`""
            }
        }
        Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs
    } catch {
        # If elevation fails, fall through and try to run anyway.
    }
    exit
}

# ---- 2) Win32 helpers (hide the console + set its icon) ----
try {
    if (-not ('D2RCC.Win' -as [type])) {
        Add-Type -Namespace D2RCC -Name Win -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll", EntryPoint="SetClassLongPtr", CharSet=CharSet.Auto)] public static extern IntPtr SetClassLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
'@
    }
} catch {
    # If we can't add the type for any reason, carry on anyway.
}

# ---- 3) Hide THIS console window (only when asked) ----
# Works even when we were started with -Verb RunAs (elevation), which
# ignores -WindowStyle Hidden. (Technique: user32 ShowWindow SW_HIDE.)
if ($hideConsole) {
    try {
        $h = [D2RCC.Win]::GetConsoleWindow()
        if ($h -ne [IntPtr]::Zero) { [void][D2RCC.Win]::ShowWindow($h, 0) }
    } catch {
        # If we can't hide the window for any reason, carry on anyway -
        # the loader must still launch.
    }
}

# ---- 4) Give the console window OUR icon ----
# The loader sets its own window TITLE, but the icon stays the generic
# PowerShell one. We replace the small + big window icons (and the class
# icons, which is what the taskbar / Alt-Tab use) with assets\d2r.ico.
try {
    $iconPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\d2r.ico'
    if (-not (Test-Path -LiteralPath $iconPath)) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $iconPath  = Join-Path (Split-Path -Parent $scriptDir) 'assets\d2r.ico'
    }
    if (Test-Path -LiteralPath $iconPath) {
        $hwnd = [D2RCC.Win]::GetConsoleWindow()
        if ($hwnd -ne [IntPtr]::Zero) {
            $IMAGE_ICON      = 1
            $LR_LOADFROMFILE = 0x10
            $LR_DEFAULTSIZE  = 0x40
            $WM_SETICON      = 0x80
            $ICON_SMALL      = [IntPtr]0
            $ICON_BIG        = [IntPtr]1
            $GCLP_HICON      = -14
            $GCLP_HICONSM    = -34

            $hBig   = [D2RCC.Win]::LoadImage([IntPtr]::Zero, $iconPath, $IMAGE_ICON, 0, 0, ($LR_LOADFROMFILE -bor $LR_DEFAULTSIZE))
            $hSmall = [D2RCC.Win]::LoadImage([IntPtr]::Zero, $iconPath, $IMAGE_ICON, 16, 16, $LR_LOADFROMFILE)

            if ($hBig   -ne [IntPtr]::Zero) { [void][D2RCC.Win]::SendMessage($hwnd, $WM_SETICON, $ICON_BIG,   $hBig) }
            if ($hSmall -ne [IntPtr]::Zero) { [void][D2RCC.Win]::SendMessage($hwnd, $WM_SETICON, $ICON_SMALL, $hSmall) }
            # Class icons: what the taskbar button and Alt-Tab actually show.
            if ($hBig   -ne [IntPtr]::Zero) { [void][D2RCC.Win]::SetClassLongPtr($hwnd, $GCLP_HICON,   $hBig) }
            if ($hSmall -ne [IntPtr]::Zero) { [void][D2RCC.Win]::SetClassLongPtr($hwnd, $GCLP_HICONSM, $hSmall) }
        }
    }
} catch {
    # Cosmetic only - never block the launch.
}

# ---- 5) Run the loader in this same console ----
# Running it in-process means the console keeps our icon for the whole
# run. The loader sees it is already elevated, so it will not try to
# re-launch itself (which is what used to pop a window up).
if (Test-Path -LiteralPath $LoaderPath) {
    $forward = @{}
    foreach ($name in 'AccountUsername', 'PW', 'Region', 'All', 'Batch', 'ManualSettingSwitcher', 'Close') {
        if ($PSBoundParameters.ContainsKey($name)) { $forward[$name] = $PSBoundParameters[$name] }
    }
    & $LoaderPath @forward
}
