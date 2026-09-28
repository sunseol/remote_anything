# Shows task state, healthz and the latest pairing code from the bridge log.
$taskName = 'RemoteAnything'
$port = 8811
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$argsFile = Join-Path $here 'bridge.args'
if (Test-Path $argsFile) {
  $m = (Get-Content $argsFile -Raw) | Select-String -Pattern '--port\s+(\d+)'
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) { Write-Output ('Task: ' + $task.State) } else { Write-Output 'Task: not installed' }
try {
  Invoke-RestMethod -Uri ('http://127.0.0.1:' + $port + '/healthz') -TimeoutSec 3 | Out-Null
  Write-Output ('Health: ok (port ' + $port + ')')
} catch { Write-Output ('Health: unreachable on port ' + $port) }
$log = Join-Path $env:LOCALAPPDATA 'remote-anything\bridge.log'
if (Test-Path $log) {
  $code = Select-String -Path $log -Pattern 'Pairing code: (\d{6})' | Select-Object -Last 1
  if ($code) { Write-Output ('Pairing code (latest run): ' + $code.Matches[0].Groups[1].Value) }
  Write-Output '--- last log lines ---'
  Get-Content $log -Tail 10
}
