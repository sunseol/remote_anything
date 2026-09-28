# Tails the bridge log. Usage: powershell -File logs.ps1 [-Tail 100] [-Follow]
param(
  [int]$Tail = 40,
  [switch]$Follow
)
$log = Join-Path $env:LOCALAPPDATA 'remote-anything\bridge.log'
if (-not (Test-Path $log)) { Write-Output ('No log yet: ' + $log); return }
if ($Follow) { Get-Content $log -Tail $Tail -Wait } else { Get-Content $log -Tail $Tail }
