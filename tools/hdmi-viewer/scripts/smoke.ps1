# Launch hdmi-viewer, wait until the capture opens (or fails), close it, report.
# Exit 0 = stream opened, 1 = open failed / timeout. Prints the session log.
#   smoke.ps1 -Exe <path to hdmi-viewer.exe, local or \\wsl.localhost\...> [-TimeoutSec 30]
param([Parameter(Mandatory)][string]$Exe, [int]$TimeoutSec = 30)
$log = Join-Path $env:TEMP 'hdmi-viewer.log'
Get-Process hdmi-viewer* -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 300
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process $Exe | Out-Null
$deadline = (Get-Date).AddSeconds($TimeoutSec); $result = 'TIMEOUT'
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $text = Get-Content $log -Raw -ErrorAction SilentlyContinue
    if ($text -match 'stream open:') { $result = 'PASS'; break }
    if ($text -match 'cannot open|Cannot open') { $result = 'FAIL'; break }
}
Start-Sleep -Milliseconds 500
# A relaunched copy runs under another path: stop every instance.
Get-Process hdmi-viewer* -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Content $log -ErrorAction SilentlyContinue | ForEach-Object { "    $_" }
"smoke ${Exe}: $result"
exit [int]($result -ne 'PASS')
