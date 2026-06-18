param(
  [switch]$IncludeReleases
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")

$targets = @(
  "runtime_data",
  "build_cache",
  "frontend\dist",
  "frontend\tsconfig.tsbuildinfo"
)

if ($IncludeReleases) {
  $targets += "releases"
}

foreach ($relative in $targets) {
  $target = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $target)) {
    continue
  }
  $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
  $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
  if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理项目目录之外的路径：$resolvedTarget"
  }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
  Write-Host "已清理：$resolvedTarget"
}
