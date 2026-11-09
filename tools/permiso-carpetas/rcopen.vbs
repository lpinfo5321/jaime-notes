' Return Checks: abre en el Explorador el PDF (o la carpeta del año) en el OneDrive de ESTA computadora.
' La app lo llama con un enlace rcopen:<año>/<archivo.pdf>. Solo abre cosas dentro de NSF CHECKS PDF FILES.
Option Explicit
Dim sh, fso, q, i, yr, nm, subp, roots, r, base, d, f, bad, c
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count = 0 Then WScript.Quit
q = WScript.Arguments(0)
If LCase(Left(q, 7)) = "rcopen:" Then q = Mid(q, 8)
Do While Left(q, 1) = "/"
  q = Mid(q, 2)
Loop
Do While Right(q, 1) = "/"
  q = Left(q, Len(q) - 1)
Loop
q = Unescape(q)

subp = "LA PRIMAVERA SUPERMARKET INC\CHECK CASHING SERVICES\RETURNED CHECKS\NSF CHECKS PDF FILES"
roots = Array(sh.ExpandEnvironmentStrings("%OneDriveConsumer%"), sh.ExpandEnvironmentStrings("%OneDrive%"), sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\OneDrive")
base = ""
For Each r In roots
  If r <> "" And Left(r, 1) <> "%" Then
    If fso.FolderExists(r & "\" & subp) Then
      base = r & "\" & subp
      Exit For
    End If
  End If
Next
If base = "" Then
  MsgBox "No encontré la carpeta de OneDrive de La Primavera en esta computadora." & vbCrLf & vbCrLf & _
    "Revisa que OneDrive esté abierto con la cuenta de La Primavera y que ya terminó de sincronizar.", vbExclamation, "Return Checks"
  WScript.Quit
End If

yr = "" : nm = ""
i = InStr(q, "/")
If i > 0 Then
  yr = Left(q, i - 1) : nm = Mid(q, i + 1)
Else
  yr = q
End If
If Not (Len(yr) = 4 And IsNumeric(yr)) Then yr = ""
bad = False
If nm <> "" Then
  If LCase(Right(nm, 4)) <> ".pdf" Or InStr(nm, "..") > 0 Then bad = True
  For Each c In Array("\", "/", ":", "*", "?", """", "<", ">", "|")
    If InStr(nm, c) > 0 Then bad = True
  Next
End If
If bad Then nm = ""

d = base
If yr <> "" Then
  If fso.FolderExists(base & "\" & yr) Then d = base & "\" & yr
End If
f = ""
If nm <> "" Then
  If fso.FileExists(d & "\" & nm) Then f = d & "\" & nm
End If
If f <> "" Then
  sh.Run "explorer.exe /select,""" & f & """", 1, False
Else
  sh.Run "explorer.exe """ & d & """", 1, False
End If
