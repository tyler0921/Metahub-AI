param(
  [switch]$Build,
  [ValidateRange(1, 10)]
  [int]$HealthFailureLimit = 3
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $repoRoot.StartsWith('D:\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "MetaHub runtime must run from the D: drive. Resolved path: $repoRoot"
}

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$logDir = Join-Path $repoRoot 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$mutex = [System.Threading.Mutex]::new($false, 'Local\MetaHubAISupervisor')
if (-not $mutex.WaitOne(0)) {
  Write-Output 'MetaHub supervisor is already running.'
  exit 0
}

function Start-MetaHubProcess {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.error.log"
  return Start-Process -FilePath $npm -ArgumentList $Arguments -WorkingDirectory $repoRoot `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}

function Stop-MetaHubProcess {
  param([System.Diagnostics.Process]$Process)
  if ($null -ne $Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

$backend = $null
$frontend = $null
try {
  if ($Build) {
    & $npm run build --prefix $repoRoot
    if ($LASTEXITCODE -ne 0) { throw 'MetaHub production build failed.' }
  }

  $backend = Start-MetaHubProcess -Name 'backend' -Arguments @('run', 'start:backend')
  $frontend = Start-MetaHubProcess -Name 'frontend' -Arguments @(
    '--workspace', '@ai-company/frontend', 'run', 'preview', '--',
    '--host', '127.0.0.1', '--port', '5173', '--strictPort'
  )

  $healthFailures = 0
  while ($true) {
    Start-Sleep -Seconds 8

    if ($backend.HasExited) {
      $backend = Start-MetaHubProcess -Name 'backend' -Arguments @('run', 'start:backend')
      $healthFailures = 0
    } else {
      try {
        Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 4 | Out-Null
        $healthFailures = 0
      } catch {
        $healthFailures++
        if ($healthFailures -ge $HealthFailureLimit) {
          Stop-MetaHubProcess -Process $backend
          $backend = Start-MetaHubProcess -Name 'backend' -Arguments @('run', 'start:backend')
          $healthFailures = 0
        }
      }
    }

    if ($frontend.HasExited) {
      $frontend = Start-MetaHubProcess -Name 'frontend' -Arguments @(
        '--workspace', '@ai-company/frontend', 'run', 'preview', '--',
        '--host', '127.0.0.1', '--port', '5173', '--strictPort'
      )
    }
  }
} finally {
  Stop-MetaHubProcess -Process $backend
  Stop-MetaHubProcess -Process $frontend
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
