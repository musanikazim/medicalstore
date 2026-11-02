param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
Assert-LocalEnv
New-Item -ItemType Directory -Path (Join-Path $script:ProjectRoot 'backups') -Force | Out-Null
Invoke-Compose -Arguments @('up','-d','--wait','--wait-timeout','240')
$url = Wait-Sehat
Write-Host ('Sehat is ready at ' + $url) -ForegroundColor Green
if (-not $NoBrowser) { Start-Process $url }
