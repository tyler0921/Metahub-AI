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
$node = (Get-Command node.exe -ErrorAction Stop).Source
$backendEntry = Join-Path $repoRoot 'Backend\dist\main.js'
$frontendEntry = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
$logDir = Join-Path $repoRoot 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$launchSequence = 0
$supervisorLog = Join-Path $logDir 'supervisor.log'

$mutex = [System.Threading.Mutex]::new($false, 'Local\MetaHubAISupervisor')
if (-not $mutex.WaitOne(0)) {
  Write-Output 'MetaHub supervisor is already running.'
  exit 0
}

function Start-MetaHubProcess {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string]$EntryPoint,
    [Parameter(Mandatory)] [string]$WorkingDirectory,
    [string[]]$Arguments = @()
  )

  $script:launchSequence++
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $logPrefix = "$Name.$stamp.$($script:launchSequence)"
  $stdout = Join-Path $logDir "$logPrefix.out.log"
  $stderr = Join-Path $logDir "$logPrefix.error.log"
  $quotedEntryPoint = '"' + $EntryPoint + '"'
  $nodeArguments = @($quotedEntryPoint) + $Arguments
  return Start-Process -FilePath $node -ArgumentList $nodeArguments -WorkingDirectory $WorkingDirectory `
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

  $backend = Start-MetaHubProcess -Name 'backend' -EntryPoint $backendEntry `
    -WorkingDirectory (Join-Path $repoRoot 'Backend')
  $frontend = Start-MetaHubProcess -Name 'frontend' -EntryPoint $frontendEntry `
    -WorkingDirectory (Join-Path $repoRoot 'Frontend') -Arguments @(
    'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'
  )

  $healthFailures = 0
  while ($true) {
    Start-Sleep -Seconds 8
    try {
      if ($backend.HasExited) {
        $backend = Start-MetaHubProcess -Name 'backend' -EntryPoint $backendEntry `
          -WorkingDirectory (Join-Path $repoRoot 'Backend')
        $healthFailures = 0
      } else {
        try {
          Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 4 | Out-Null
          $healthFailures = 0
        } catch {
          $healthFailures++
          if ($healthFailures -ge $HealthFailureLimit) {
            Stop-MetaHubProcess -Process $backend
            $backend = Start-MetaHubProcess -Name 'backend' -EntryPoint $backendEntry `
              -WorkingDirectory (Join-Path $repoRoot 'Backend')
            $healthFailures = 0
          }
        }
      }

      if ($frontend.HasExited) {
        $frontend = Start-MetaHubProcess -Name 'frontend' -EntryPoint $frontendEntry `
          -WorkingDirectory (Join-Path $repoRoot 'Frontend') -Arguments @(
          'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'
        )
      }
    } catch {
      Add-Content -LiteralPath $supervisorLog -Value "$(Get-Date -Format o) $($_.Exception.Message)"
    }
  }
} catch {
  Add-Content -LiteralPath $supervisorLog -Value "$(Get-Date -Format o) fatal: $($_.Exception.ToString())"
  throw
} finally {
  Stop-MetaHubProcess -Process $backend
  Stop-MetaHubProcess -Process $frontend
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
