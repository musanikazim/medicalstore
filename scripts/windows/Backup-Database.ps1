. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
Assert-LocalEnv
Invoke-Compose -Arguments @('up','-d','--wait','--wait-timeout','120','db')
$folder = Join-Path $script:ProjectRoot 'backups'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$name = 'sehat-manual-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8) + '.dump'
$temporary = '/tmp/' + $name
$destination = Join-Path $folder $name
try {
    Invoke-Compose -Arguments @('exec','-T','db','pg_dump','--username=medicalstore','--dbname=medicalstore','--format=custom',('--file=' + $temporary))
    # docker cp preserves binary backup bytes on Windows PowerShell 5.1.
    # Do not replace it with >, Out-File, or Set-Content.
    Invoke-Compose -Arguments @('cp',('db:' + $temporary),$destination)
    if (-not (Test-Path -LiteralPath $destination) -or (Get-Item -LiteralPath $destination).Length -eq 0) { throw 'Backup file is missing or empty.' }
    Write-Host ('Backup saved: ' + $destination) -ForegroundColor Green
} finally {
    Invoke-Compose -Arguments @('exec','-T','db','rm','-f',$temporary)
}
