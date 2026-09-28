# Removes the scheduled task and stops bridge-related processes (matched by command
# line, so unrelated node processes are untouched).
$taskName = 'RemoteAnything'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'powershell.exe' OR Name = 'wscript.exe'" |
  Where-Object { $_.CommandLine -match 'sync-server\.mjs|remote-anything-watchdog\.ps1|remote-anything-launch\.vbs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Output ("Task '$taskName' removed and bridge processes stopped.")
