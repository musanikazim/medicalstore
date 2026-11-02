. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
Assert-LocalEnv
# Never use down --volumes here. All stored medicine/invoice records are retained.
Invoke-Compose -Arguments @('stop')
Write-Host 'Sehat is stopped. Your database and backups have been kept.' -ForegroundColor Green
