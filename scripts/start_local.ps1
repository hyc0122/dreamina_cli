param(
    [int]$ApiPort = 18177,
    [int]$WebPort = 62100
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Frontend = Join-Path $Root "frontend"
$DataDir = Join-Path $Root "runtime_data"
$RuntimeDir = Join-Path $DataDir "runtime"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$env:DREAMINA_CLI_PROJECT_DIR = $Root
$env:DREAMINA_CLI_DATA_DIR = $DataDir
$env:DREAMINA_DESKTOP_PORT = "$ApiPort"

$api = Start-Process -FilePath "python" `
    -ArgumentList @("-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "$ApiPort") `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru
$worker = Start-Process -FilePath "python" `
    -ArgumentList @("-m", "backend.app.queue_worker") `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru
$web = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$WebPort") `
    -WorkingDirectory $Frontend -WindowStyle Hidden -PassThru

@{
    api_pid = $api.Id
    worker_pid = $worker.Id
    web_pid = $web.Id
    api_url = "http://127.0.0.1:$ApiPort"
    web_url = "http://127.0.0.1:$WebPort/#/jimeng"
} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $RuntimeDir "local-processes.json")

Start-Process "http://127.0.0.1:$WebPort/#/jimeng"
Write-Host "本地服务已启动：API=$ApiPort，队列 Worker PID=$($worker.Id)，网页=$WebPort"
