param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
New-LocalEnv
New-Item -ItemType Directory -Path (Join-Path $script:ProjectRoot 'backups') -Force | Out-Null
Write-Host 'Preparing Sehat. The first download/build may take 10-20 minutes. Keep this window open.'
Invoke-Compose -Arguments @('build','app')
& (Join-Path $PSScriptRoot 'Initialize-Database.ps1')
$answer = Read-Host 'Include demonstration medicines for practice? Type Y for yes, or press Enter for a clean store'
& (Join-Path $PSScriptRoot 'Create-Administrator.ps1') -Demo:($answer -match '^[Yy]$')
& (Join-Path $PSScriptRoot 'Start.ps1') -NoBrowser:$NoBrowser
Write-Host 'Setup complete. Sign in with the email and password you chose. Neither is included in this download.' -ForegroundColor Green
