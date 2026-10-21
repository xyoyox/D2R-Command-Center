' ============================================================
'  D2R Command Center - silent launcher (used by the Desktop icon)
'  ------------------------------------------------------------
'  Starts the background bridge (hidden, no console window) and
'  opens the UI. If the bridge is already running it just makes
'  sure the UI is open (and brings it to the front) - it never
'  starts a second copy.
'
'  Nothing is shown on screen: no console window at all.
'
'  v2.5: we now WAIT for the helper to finish and, if it really
'  could not start, show a message box instead of failing
'  silently. That silent failure is why people used to click the
'  desktop icon three or four times.
' ============================================================
Option Explicit
Dim fso, sh, here, root, ps, rc, logFile

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
root = fso.GetParentFolderName(here)                     ' install root
sh.CurrentDirectory = root

ps = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "\bridge-ctl.ps1"" ensure"

' 0 = hidden window, True = wait so we can read the exit code
rc = sh.Run(ps, 0, True)

If rc <> 0 Then
    logFile = root & "\bridge.log"
    MsgBox "The D2R Command Center could not start." & vbCrLf & vbCrLf & _
           "Please try again in a few seconds. If it keeps happening, open" & vbCrLf & _
           "this file for details:" & vbCrLf & vbCrLf & logFile, _
           vbExclamation, "D2R Command Center"
End If
