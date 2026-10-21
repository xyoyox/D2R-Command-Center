' ============================================================
'  D2R Command Center - start the bridge with NO window
'  ------------------------------------------------------------
'  Launches "node app\server.js" with a completely hidden console,
'  so the Command Center can run quietly in the background.
'
'  Usage:
'     cscript //nologo start-bridge-hidden.vbs            (bridge + UI)
'     cscript //nologo start-bridge-hidden.vbs nobrowser  (bridge only)
'
'  Output is appended to bridge.log in the install root.
' ============================================================
Option Explicit
Dim fso, sh, here, root, noBrowser, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
root = fso.GetParentFolderName(here)                     ' install root
sh.CurrentDirectory = root

noBrowser = False
If WScript.Arguments.Count > 0 Then
    If LCase(WScript.Arguments(0)) = "nobrowser" Then noBrowser = True
End If

If noBrowser Then
    cmd = "cmd /c node """ & root & "\app\server.js"" --no-browser >> """ & root & "\bridge.log"" 2>&1"
Else
    cmd = "cmd /c node """ & root & "\app\server.js"" >> """ & root & "\bridge.log"" 2>&1"
End If

' 0 = hidden window, False = do not wait for it to finish
sh.Run cmd, 0, False
