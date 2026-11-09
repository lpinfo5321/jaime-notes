' Instala el permiso para que Return Checks abra las carpetas de OneDrive de esta computadora.
' Solo para este usuario de Windows (no necesita administrador). No muestra ventanas negras.
Option Explicit
Dim sh, fso, dir, here, wscript, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\ReturnChecks"
If Not fso.FolderExists(dir) Then fso.CreateFolder dir
here = fso.GetParentFolderName(WScript.ScriptFullName)
fso.CopyFile here & "\rcopen.vbs", dir & "\rcopen.vbs", True
wscript = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
cmd = """" & wscript & """ //nologo """ & dir & "\rcopen.vbs"" ""%1"""
sh.RegWrite "HKCU\Software\Classes\rcopen\", "URL:Return Checks", "REG_SZ"
sh.RegWrite "HKCU\Software\Classes\rcopen\URL Protocol", "", "REG_SZ"
sh.RegWrite "HKCU\Software\Classes\rcopen\shell\open\FriendlyAppName", "Return Checks", "REG_SZ"
sh.RegWrite "HKCU\Software\Classes\rcopen\shell\open\command\", cmd, "REG_SZ"
' Avisar a la app que esta computadora ya tiene el permiso
sh.Run "https://returnchecks.vercel.app/permiso-carpetas?ok=1", 1, False
