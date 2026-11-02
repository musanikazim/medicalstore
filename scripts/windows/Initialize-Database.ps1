. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
Assert-LocalEnv
Invoke-Compose -Arguments @('up','-d','--wait','--wait-timeout','120','db')
Invoke-Compose -Arguments @('run','--rm','-T','--no-deps','app','npm','run','db:migrate')
Write-Host 'Database initialized. Existing data is preserved; applied migrations are not repeated.' -ForegroundColor Green
