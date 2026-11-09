# Arma public/permiso/ReturnChecks-Permiso.exe con IExpress (viene con Windows).
# Uso: powershell -ExecutionPolicy Bypass -File tools\permiso-carpetas\build.ps1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'public\permiso\ReturnChecks-Permiso.exe'
$sed = Join-Path $env:TEMP 'rc-permiso.sed'
$txt = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=¿Permitir que Return Checks abra los PDF en las carpetas de OneDrive de esta computadora?
DisplayLicense=
FinishMessage=¡Listo! Return Checks ya puede abrir las carpetas de OneDrive en esta computadora. Ya puedes volver a la app.
TargetName=$out
FriendlyName=Return Checks
AppLaunched=wscript.exe //nologo install.vbs
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="install.vbs"
FILE1="rcopen.vbs"
[SourceFiles]
SourceFiles0=$here\
[SourceFiles0]
%FILE0%=
%FILE1%=
"@
[IO.File]::WriteAllText($sed, $txt, [Text.Encoding]::GetEncoding(1252))
New-Item -ItemType Directory -Force (Split-Path -Parent $out) | Out-Null
Start-Process -Wait -FilePath "$env:SystemRoot\System32\iexpress.exe" -ArgumentList '/N', '/Q', $sed
Remove-Item $sed -ErrorAction SilentlyContinue
Get-Item $out | Select-Object Name, Length
