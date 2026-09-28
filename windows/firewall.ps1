# Adds or removes the inbound firewall rule so phones on the LAN can reach the bridge.
# Requires an elevated (Administrator) PowerShell. Scope is LocalSubnet only.
param(
  [int]$Port = 8811,
  [switch]$Remove
)
$ruleName = 'remote-anything'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output 'Run this script from an elevated PowerShell.'; exit 1 }
if ($Remove) {
  Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  Write-Output ("Firewall rule '$ruleName' removed.")
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet | Out-Null
  Write-Output ("Firewall rule '$ruleName' added (TCP $Port, LocalSubnet only).")
}
