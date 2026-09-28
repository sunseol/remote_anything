# Registers a per-user scheduled task that starts the bridge at logon and keeps it
# alive (watchdog loop plus task-level restart). Safe to re-run.
param(
  [int]$Port = 8811,
  [string]$BindHost = '0.0.0.0'
)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$taskName = 'RemoteAnything'

# Persist bridge args once so the task and the watchdog agree.
$argsFile = Join-Path $here 'bridge.args'
if (-not (Test-Path $argsFile)) {
  Set-Content -Path $argsFile -Value ('--host ' + $BindHost + ' --port ' + $Port) -Encoding ascii
}

# Stop any previous instance before replacing the task.
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'powershell.exe' OR Name = 'wscript.exe'" |
  Where-Object { $_.CommandLine -match 'sync-server\.mjs|remote-anything-watchdog\.ps1|remote-anything-launch\.vbs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$vbs = Join-Path $here 'remote-anything-launch.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B "' + $vbs + '"') -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Remote Anything session bridge (server/sync-server.mjs)' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output ("Task '$taskName' installed and started.")
Write-Output ('Args: ' + (Get-Content $argsFile))
Write-Output ('Log: ' + (Join-Path $env:LOCALAPPDATA 'remote-anything\bridge.log'))
