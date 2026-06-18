$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")

Write-Host "== backend pytest ==" -ForegroundColor Cyan
Push-Location $Root
try {
  python -m pytest tests -q
}
finally {
  Pop-Location
}

Write-Host "== frontend tests ==" -ForegroundColor Cyan
Push-Location (Join-Path $Root "frontend")
try {
  npm run test
  npm run build
}
finally {
  Pop-Location
}

Write-Host "== verification complete ==" -ForegroundColor Green
