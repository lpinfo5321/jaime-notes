@echo off
setlocal
set "DIR=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\ReturnChecks-OneDrive.vbs" echo CreateObject("Wscript.Shell").Run "cmd /c node ""%DIR%helper.mjs""", 0, False
wscript "%STARTUP%\ReturnChecks-OneDrive.vbs"
echo Listo. El ayudante ya esta activo y arrancara solo cada vez que prendas la computadora.
pause
