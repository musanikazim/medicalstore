Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:LocalEnv = Join-Path $script:ProjectRoot '.env'

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/, restart Windows if requested, and start Docker Desktop.'
    }
    $kind = & docker info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, wait until its engine is running, then try again.' }
    if (($kind | Out-String).Trim() -ne 'linux') { throw 'Docker Desktop must use Linux containers and the WSL 2 engine. Switch to Linux containers in Docker Desktop.' }
    & docker compose version | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required. Update Docker Desktop.' }
}
function Assert-LocalEnv {
    if (-not (Test-Path -LiteralPath $script:LocalEnv)) { throw 'Run Setup-Windows.cmd first. Your private local settings file is missing.' }
    # ReadAllLines handles Windows CRLF, Unix LF and a UTF-8 BOM. Matching
    # the raw file with `$` left a trailing CR in Windows-generated values.
    $lines = [IO.File]::ReadAllLines($script:LocalEnv)
    foreach ($key in @('POSTGRES_PASSWORD','JWT_SECRET')) {
        $values = @($lines | Where-Object { $_.StartsWith($key + '=') })
        if ($values.Count -ne 1) {
            throw ('The local ' + $key + ' setting is missing or duplicated. Keep your original .env; see WINDOWS-INSTALL.md.')
        }
        $value = $values[0].Substring($key.Length + 1).Trim()
        if ($value -notmatch '^[A-Fa-f0-9]{64,}$') {
            throw ('The local ' + $key + ' setting is missing or invalid. Do not delete or replace an existing database password. See WINDOWS-INSTALL.md.')
        }
    }
}
function Invoke-Compose {
    param([Parameter(Mandatory=$true)][string[]]$Arguments)
    Push-Location $script:ProjectRoot
    try {
        & docker compose --project-name sehat-medicalstore --env-file $script:LocalEnv --file (Join-Path $script:ProjectRoot 'compose.yaml') @Arguments
        if ($LASTEXITCODE -ne 0) { throw ('Docker command failed (exit ' + $LASTEXITCODE + '). Keep this window open and check the message above.') }
    } finally { Pop-Location }
}
function New-LocalSecret {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
}
function New-LocalEnv {
    if (Test-Path -LiteralPath $script:LocalEnv) {
        Assert-LocalEnv
        Write-Host 'Keeping your existing private .env file and database settings.'
        return
    }
    # A missing .env with a retained database volume is a recovery situation.
    $volumes = & docker volume ls --filter 'label=com.docker.compose.project=sehat-medicalstore' --format '{{.Name}}'
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Docker volumes.' }
    if (@($volumes | Where-Object { $_ }).Count -gt 0) { throw 'An existing Sehat database volume was found but .env is missing. Restore the original .env from your private copy; do not generate another database password.' }
    $lines = @('# Private local configuration. Keep a secure copy. Never share this file.', ('POSTGRES_PASSWORD=' + (New-LocalSecret)), ('JWT_SECRET=' + (New-LocalSecret)), 'APP_PORT=3001')
    [IO.File]::WriteAllLines($script:LocalEnv, $lines, (New-Object Text.UTF8Encoding($false)))
    if ($env:OS -eq 'Windows_NT') {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls.exe $script:LocalEnv '/inheritance:r' '/grant:r' ($identity + ':(F)') '*S-1-5-18:(F)' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict permissions on .env. Move the installation to a local NTFS folder and retry.' }
    }
    Write-Host 'Created new random local database and session secrets. No cloud credentials were copied.'
}
function Wait-Sehat {
    $port = '3001'
    foreach ($line in [IO.File]::ReadAllLines($script:LocalEnv)) { if ($line -match '^APP_PORT=(\d+)$') { $port = $Matches[1] } }
    $url = 'http://localhost:' + $port
    for ($i=0; $i -lt 90; $i++) {
        try {
            $response = Invoke-WebRequest -Uri ($url + '/api/health') -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200 -and ($response.Content | ConvertFrom-Json).status -eq 'ok') { return $url }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw 'The app did not become ready. Run docker compose logs --tail=80 app db from the project folder and see WINDOWS-INSTALL.md.'
}
