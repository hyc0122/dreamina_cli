param(
    [string]$Root = "",
    [string]$DataDir = "",
    [string]$PythonPath = "",
    [switch]$FrozenExecutable
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $Root = (Resolve-Path $Root).Path
}

if (-not $DataDir) {
    $DataDir = Join-Path $Root "runtime_data"
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$RuntimeDir = Join-Path $DataDir "runtime"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

if (-not $PythonPath) {
    $PythonPath = "python"
}

$env:DREAMINA_CLI_PROJECT_DIR = $Root
$env:DREAMINA_CLI_DATA_DIR = $DataDir
$env:DREAMINA_QUEUE_WORKER = "1"

$arguments = @()
if (-not $FrozenExecutable) {
    $arguments = @("-m", "backend.app.queue_worker")
}

if ($arguments.Count -gt 0) {
    $worker = Start-Process -FilePath $PythonPath `
        -ArgumentList $arguments `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru
} else {
    $worker = Start-Process -FilePath $PythonPath `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru
}

$payload = @{
    ok = $true
    worker_pid = $worker.Id
    root = $Root
    data_dir = $DataDir
    frozen_executable = [bool]$FrozenExecutable
    started_at = (Get-Date).ToUniversalTime().ToString("o")
}

$payload | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $RuntimeDir "worker-process.json")
$payload | ConvertTo-Json
