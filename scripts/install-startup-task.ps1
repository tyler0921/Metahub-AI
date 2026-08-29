param([string]$TaskName = 'MetaHub AI Company')

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $repoRoot.StartsWith('D:\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Startup task must point to the D: drive. Resolved path: $repoRoot"
}

$supervisor = Join-Path $PSScriptRoot 'metahub-supervisor.ps1'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$actionArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $actionArgs -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Starts and supervises the MetaHub AI Company backend and frontend.' -Force | Out-Null

Write-Output "Installed scheduled task '$TaskName' for $repoRoot"
