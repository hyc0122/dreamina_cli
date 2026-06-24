param(
  [string]$AppName = "",
  [switch]$SkipNpmInstall,
  [switch]$SkipPythonInstall,
  [switch]$UseCurrentPython
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppName)) {
  $AppName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("5Y2z5qKmY2xp6Ieq5Yqo5o6S6Zif5Yqp5omL"))
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")
$Frontend = Join-Path $Root "frontend"
$FrontendDist = Join-Path $Frontend "dist"
$DistPath = Join-Path $Root "releases"
$BuildPath = Join-Path $Root "build_cache"
$BuildVenv = Join-Path $BuildPath ".venv"
$SpecPath = Join-Path $BuildPath "spec"
$Launcher = Join-Path $Root "packaging\dreamina_desktop.py"

Write-Host "== $AppName EXE Build ==" -ForegroundColor Cyan
Write-Host "Root: $Root"

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Launcher not found: $Launcher"
}

if (-not $SkipNpmInstall) {
  Write-Host "== npm install ==" -ForegroundColor Cyan
  Push-Location $Frontend
  try {
    npm install
  }
  finally {
    Pop-Location
  }
}

Write-Host "== frontend build ==" -ForegroundColor Cyan
Push-Location $Frontend
try {
  npm run build
}
finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $FrontendDist)) {
  throw "Frontend build completed but dist was not found: $FrontendDist"
}

New-Item -ItemType Directory -Force -Path $DistPath, $BuildPath, $SpecPath | Out-Null

$BuildPython = "python"
if (-not $UseCurrentPython) {
  $BuildPython = Join-Path $BuildVenv "Scripts\python.exe"
  if (-not (Test-Path -LiteralPath $BuildPython)) {
    Write-Host "== create isolated build venv ==" -ForegroundColor Cyan
    python -m venv $BuildVenv
  }
}

if (-not $SkipPythonInstall) {
  Write-Host "== python dependencies ==" -ForegroundColor Cyan
  & $BuildPython -m pip install --upgrade pip
  & $BuildPython -m pip install -r (Join-Path $Root "backend\requirements.txt")
  & $BuildPython -m pip install pyinstaller
}

$ResolvedDistPath = (Resolve-Path -LiteralPath $DistPath).Path
$AppDistPath = Join-Path $DistPath $AppName
if (Test-Path -LiteralPath $AppDistPath) {
  $ResolvedAppDistPath = (Resolve-Path -LiteralPath $AppDistPath).Path
  if (-not $ResolvedAppDistPath.StartsWith($ResolvedDistPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean a path outside releases: $ResolvedAppDistPath"
  }
  Write-Host "== clean previous app dist ==" -ForegroundColor Cyan
  Remove-Item -LiteralPath $ResolvedAppDistPath -Recurse -Force
}

Write-Host "== pyinstaller ==" -ForegroundColor Cyan
Push-Location $Root
try {
  & $BuildPython -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --noconsole `
    --name $AppName `
    --distpath $DistPath `
    --workpath $BuildPath `
    --specpath $SpecPath `
    --paths $Root `
    --collect-all fastapi `
    --collect-all starlette `
    --collect-all anyio `
    --collect-all pydantic `
    --collect-all pydantic_core `
    --collect-submodules fastapi `
    --collect-submodules uvicorn `
    --collect-submodules pydantic `
    --collect-submodules multipart `
    --add-data "$FrontendDist;frontend\dist" `
    $Launcher
}
finally {
  Pop-Location
}

$OutputExe = Join-Path $DistPath "$AppName\$AppName.exe"
if (-not (Test-Path -LiteralPath $OutputExe)) {
  throw "Build completed but EXE was not found: $OutputExe"
}

$DocsSource = Join-Path $Root "docs"
$DocsTarget = Join-Path $AppDistPath "docs"
if (Test-Path -LiteralPath $DocsSource) {
  Write-Host "== copy docs ==" -ForegroundColor Cyan
  if (Test-Path -LiteralPath $DocsTarget) {
    Remove-Item -LiteralPath $DocsTarget -Recurse -Force
  }
  Copy-Item -LiteralPath $DocsSource -Destination $DocsTarget -Recurse -Force
}

Write-Host "== build complete ==" -ForegroundColor Green
Write-Host "EXE: $OutputExe"
