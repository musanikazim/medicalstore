param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
Assert-LocalEnv
# This updater deliberately cannot initialize a missing installation or volume.
& docker volume inspect sehat-medicalstore_medicalstore-data --format '{{.Name}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The existing Sehat data volume was not found. Stop here and check your Docker project name. Do not run Setup or create a replacement volume.' }
Write-Host 'Backing up your existing database before applying the update.'
& (Join-Path $PSScriptRoot 'Backup-Database.ps1')
# Build first. A failed build leaves the existing running app available.
Invoke-Compose -Arguments @('build','app')
# Recreate only the app with the same project and database. Never remove volumes.
Invoke-Compose -Arguments @('up','-d','--no-deps','--wait','--wait-timeout','240','app')
$url = Wait-Sehat
Write-Host ('Update complete. Existing data is retained. Open ' + $url) -ForegroundColor Green
if (-not $NoBrowser) { Start-Process $url }
