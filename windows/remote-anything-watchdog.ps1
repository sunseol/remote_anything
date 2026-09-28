# Aside remote bridge watchdog (Windows counterpart of the macOS LaunchAgent KeepAlive).
# Runs node server/sync-server.mjs in a loop and restarts it 3 seconds after any exit.
# Default args: --host 0.0.0.0 --port 8811. Override by editing bridge.args next to
# this script (single line, e.g. --host 0.0.0.0 --port 8811 --aside "D:\tools\aside.exe").

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$logDir = Join-Path $env:LOCALAPPDATA 'remote-anything'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'bridge.log'

$nodeArgs = @('--host', '0.0.0.0', '--port', '8811')
$argsFile = Join-Path $here 'bridge.args'
if (Test-Path $argsFile) {
  $line = (Get-Content $argsFile -Raw).Trim()
  if ($line) { $nodeArgs = $line -split '\s+' }
}

function Write-Log([string]$message) {
  Add-Content -Path $log -Value ('[' + (Get-Date -Format o) + '] ' + $message)
}

Write-Log ("watchdog starting; repo=" + $repo + " args=" + ($nodeArgs -join " "))
while ($true) {
  Write-Log 'bridge starting'
  & node (Join-Path $repo 'server/sync-server.mjs') @nodeArgs 2>&1 | ForEach-Object {
    Add-Content -Path $log -Value $_.ToString()
  }
  Write-Log ("bridge exited (code " + $LASTEXITCODE + "); restarting in 3s")
  Start-Sleep -Seconds 3
}
