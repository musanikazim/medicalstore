param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
# Fresh installation must never double as an updater.
$existingVolumes = @(& docker volume ls --filter 'label=com.docker.compose.project=sehat-medicalstore' --format '{{.Name}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing Docker volumes.' }
$existingContainers = @(& docker ps -a --filter 'label=com.docker.compose.project=sehat-medicalstore' --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing Docker containers.' }
if ((Test-Path -LiteralPath $script:LocalEnv) -or @($existingVolumes | Where-Object { $_ }).Count -gt 0 -or @($existingContainers | Where-Object { $_ }).Count -gt 0) {
    throw 'An existing Sehat installation or configuration was found. Use Update-Sehat.cmd for a safe upgrade. Reset-Development-Installation.cmd is a separate intentional development reset requiring a verified backup and RESET SEHAT confirmation. For an interrupted first setup, preserve .env and use Initialize-Database.cmd, Create-Administrator.cmd and Start-Sehat.cmd.'
}
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,3001)
try { $listener.Start() } catch { throw 'Port 3001 is occupied. Stop the conflicting service before fresh setup.' } finally { $listener.Stop() }
New-LocalEnv
New-Item -ItemType Directory -Path (Join-Path $script:ProjectRoot 'backups') -Force | Out-Null
Write-Host 'Preparing Sehat. The first download/build may take 10-20 minutes. Keep this window open.'
Invoke-Compose -Arguments @('build','app')
& (Join-Path $PSScriptRoot 'Initialize-Database.ps1')
$answer = Read-Host 'Do you want to load demo/sample data? Y = Yes, N or Enter = No'
& (Join-Path $PSScriptRoot 'Create-Administrator.ps1') -Demo:($answer -match '^[Yy]$')
& (Join-Path $PSScriptRoot 'Start.ps1') -NoBrowser:$NoBrowser
Write-Host 'Setup complete. Sign in with the email and password you chose. Neither is included in this download.' -ForegroundColor Green
