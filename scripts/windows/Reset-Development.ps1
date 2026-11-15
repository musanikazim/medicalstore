param([switch]$NoPrompt)
. (Join-Path $PSScriptRoot 'Common.ps1')
if ($NoPrompt) { throw 'Noninteractive development resets are not supported.' }
Assert-Docker
Assert-LocalEnv
$volume = 'sehat-medicalstore_medicalstore-data'
$labelFormat = '{{index .Labels "com.docker.compose.project"}}'
# Windows PowerShell's legacy native argument handling strips embedded quotes.
# Modern PowerShell passes them through, so escape only for legacy handling.
if ($PSVersionTable.PSVersion -lt [version]'7.3' -or (Get-Variable PSNativeCommandArgumentPassing -ValueOnly -ErrorAction SilentlyContinue) -eq 'Legacy') {
    $labelFormat = $labelFormat.Replace('"','\"')
}
$label = & docker volume inspect $volume --format $labelFormat
if ($LASTEXITCODE -ne 0 -or ($label | Out-String).Trim() -ne 'sehat-medicalstore') { throw 'Expected Sehat project volume label was not found. Nothing was deleted.' }
Write-Host 'DEVELOPMENT RESET ONLY. This permanently removes the following Sehat installation:' -ForegroundColor Red
Invoke-Compose -Arguments @('ps','--all')
Write-Host ('Database volume: ' + $volume)
Write-Host ('Configuration: ' + $script:LocalEnv)
$confirmation = Read-Host 'Type RESET SEHAT to create a verified backup and delete this development installation'
if ($confirmation -cne 'RESET SEHAT') { throw 'Reset cancelled. Nothing was deleted.' }
Invoke-Compose -Arguments @('stop','app')
try { & (Join-Path $PSScriptRoot 'Backup-Database.ps1') } catch {
    Invoke-Compose -Arguments @('start','app')
    throw 'Backup failed. Reset aborted; no volume was deleted.'
}
# Explicit Compose project; never prune Docker and never remove unrelated volumes.
Invoke-Compose -Arguments @('down','--remove-orphans')
& docker volume rm $volume
if ($LASTEXITCODE -ne 0) { throw 'Volume removal failed. Keep configuration and backups; investigate before setup.' }
# Rename configuration inside the verified project directory; preserve it for recovery.
$resolvedRoot = [IO.Path]::GetFullPath($script:ProjectRoot).TrimEnd('\') + '\'
$resolvedEnv = [IO.Path]::GetFullPath($script:LocalEnv)
if (-not $resolvedEnv.StartsWith($resolvedRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Configuration path is outside the project; refused to move it.' }
Move-Item -LiteralPath $resolvedEnv -Destination ($resolvedEnv + '.reset-' + (Get-Date -Format 'yyyyMMddHHmmss'))
Write-Host 'Development installation removed. Backups and archived configuration remain. Run Setup-Windows.cmd for a fresh installation.' -ForegroundColor Green
