# ReturnChecks: abre en el Explorador la carpeta de los PDF (o el PDF) en el OneDrive de ESTA computadora.
# La app lo llama con un enlace rcopen:<año>/<archivo.pdf>. Solo abre cosas dentro de NSF CHECKS PDF FILES.
$u = ($args -join ' ')
$q = [uri]::UnescapeDataString(($u -replace '^rcopen:(//)?', '')).Trim().TrimEnd('/')
$sub = 'LA PRIMAVERA SUPERMARKET INC\CHECK CASHING SERVICES\RETURNED CHECKS\NSF CHECKS PDF FILES'
$roots = @($env:OneDriveConsumer, $env:OneDrive, (Join-Path $env:USERPROFILE 'OneDrive')) | Where-Object { $_ }
$base = $null
foreach ($r in $roots) { $p = Join-Path $r $sub; if (Test-Path -LiteralPath $p) { $base = $p; break } }
if (-not $base) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("No encontre la carpeta de OneDrive en esta computadora:`n$sub`n`nRevisa que OneDrive este abierto con la cuenta de La Primavera.", 'Return Checks') | Out-Null
  exit
}
$year = ''; $name = ''
if ($q -match '^(\d{4})(/(.*))?$') { $year = $Matches[1]; $name = [string]$Matches[3] }
if ($name -and ($name -notmatch '\.pdf$' -or $name -match '[\/:*?"<>|]' -or $name -match '\.\.')) { $name = '' }
$dir = if ($year) { Join-Path $base $year } else { $base }
if (-not (Test-Path -LiteralPath $dir)) { $dir = $base }
$file = if ($name) { Join-Path $dir $name } else { '' }
if ($file -and (Test-Path -LiteralPath $file)) {
  Start-Process explorer.exe -ArgumentList "/select,`"$file`""
} else {
  Start-Process explorer.exe -ArgumentList "`"$dir`""
}
