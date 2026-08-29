$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$healthy = $true

$task = Get-ScheduledTask -TaskName 'MetaHub AI Company' -ErrorAction SilentlyContinue
$taskState = if ($null -eq $task) { 'NotInstalled' } else { $task.State }
Write-Output "ScheduledTask=$taskState"

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 4
  Write-Output "Backend=$($health.status) Version=$($health.version) Uptime=$($health.uptime)s"
} catch {
  Write-Output 'Backend=unreachable'
  $healthy = $false
}

try {
  $frontend = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173' -TimeoutSec 4
  Write-Output "Frontend=ok Status=$($frontend.StatusCode)"
} catch {
  Write-Output 'Frontend=unreachable'
  $healthy = $false
}

foreach ($relativePath in @(
  'data\sessions.sqlite',
  'data\autonomous-work.json',
  'data\autonomous-inbox.json',
  'data\llm-budget.json'
)) {
  $path = Join-Path $repoRoot $relativePath
  Write-Output "$relativePath=$(if (Test-Path -LiteralPath $path) { 'present' } else { 'not-created' })"
}

if (-not $healthy) { exit 1 }
