param(
  [switch]$OpenEnv = $true,
  [switch]$OpenSchema = $false
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Jaime Notes setup ==" -ForegroundColor Cyan

if (-not (Test-Path ".\env.example")) {
  Write-Host "No se encontró env.example. Ejecuta este script dentro de app-jaime." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".\.env.local")) {
  Copy-Item ".\env.example" ".\.env.local"
  Write-Host "Creado .env.local (desde env.example)." -ForegroundColor Green
} else {
  Write-Host ".env.local ya existe." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Ahora pega tus llaves de Supabase en .env.local:" -ForegroundColor Cyan
Write-Host "  - NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Gray
Write-Host "  - NEXT_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor Gray

if ($OpenEnv) {
  Write-Host "Abriendo .env.local..." -ForegroundColor Cyan
  notepad ".\.env.local"
}

if ($OpenSchema) {
  if (Test-Path ".\supabase\schema.sql") {
    Write-Host "Abriendo supabase/schema.sql..." -ForegroundColor Cyan
    notepad ".\supabase\schema.sql"
  } else {
    Write-Host "No se encontró supabase/schema.sql" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Luego reinicia:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "Y verifica:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000/login" -ForegroundColor Gray

