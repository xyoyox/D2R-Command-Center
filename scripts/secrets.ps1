# ============================================================
#  D2R Command Center - Secret Tool
#  ------------------------------------------------------------
#  Secures / unsecures secrets using the SAME DPAPI scheme the
#  D2R Loader uses, so tokens & passwords written here are
#  byte-for-byte compatible with Shupershuff's engine.
#
#    secure   : plain  ->  ConvertTo-SecureString -AsPlainText | ConvertFrom-SecureString
#    unsecure : secure ->  ConvertTo-SecureString | SecureStringToBSTR | PtrToStringAuto
#
#  The value is read from STDIN (never the command line) so it
#  never shows up in the process list.
#
#  Usage:
#     "my secret" | powershell -NoProfile -File secrets.ps1 -Mode secure
# ============================================================
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('secure', 'unsecure')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Read the whole of stdin as the value
$value = [Console]::In.ReadToEnd()
if ($null -eq $value) { $value = "" }
# Trim a single trailing newline that pipes often add
$value = $value -replace "`r?`n$", ""

try {
    if ($Mode -eq 'secure') {
        if ($value.Length -eq 0) { throw "No value supplied on stdin." }
        $sec = ConvertTo-SecureString -String $value -AsPlainText -Force
        $out = $sec | ConvertFrom-SecureString
        [Console]::Out.Write($out)
    }
    else {
        if ($value.Length -eq 0) { throw "No value supplied on stdin." }
        $sec = ConvertTo-SecureString $value
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        try {
            $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [Console]::Out.Write($plain)
        }
        finally {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
    exit 0
}
catch {
    [Console]::Error.Write($_.Exception.Message)
    exit 1
}
