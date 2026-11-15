# Behavioral script checks in an isolated filesystem sandbox with a fake Docker
# command. No installed customer containers or volumes are accessed.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = Join-Path $root ('.cache\validation\windows-' + [Guid]::NewGuid().ToString('N'))
$scripts = Join-Path $testRoot 'scripts\windows'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
Copy-Item -Path (Join-Path $root 'scripts\windows\*.ps1') -Destination $scripts
# The real store already owns port 3001. Remove only the socket probe from the
# disposable script copy so this test never binds or stops that live port.
$setupPath = Join-Path $scripts 'Setup.ps1'
$setupLines = @(Get-Content -LiteralPath $setupPath | Where-Object { $_ -notmatch '\$listener' })
[IO.File]::WriteAllLines($setupPath,$setupLines)
$mock = @'
$script:ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:LocalEnv = Join-Path $script:ProjectRoot '.env'
function Assert-Docker { }
function Assert-LocalEnv { if (-not (Test-Path $script:LocalEnv)) { throw 'Missing test environment' } }
function New-LocalEnv { [IO.File]::WriteAllText($script:LocalEnv,'test-only-configuration') }
function Wait-Sehat { return 'http://localhost:3001' }
function Read-Host { param($Prompt) return $global:ReleaseTest.Answer }
function docker {
    $global:LASTEXITCODE = 0
    $line = $args -join ' '
    [void]$global:ReleaseTest.Commands.Add('docker ' + $line)
    if ($line.StartsWith('volume ls') -and $global:ReleaseTest.Existing) { return 'sehat-medicalstore_medicalstore-data' }
    if ($line.StartsWith('volume inspect')) { return 'sehat-medicalstore' }
    if ($line.StartsWith('ps -a') -and $global:ReleaseTest.Existing) { return 'sehat-medicalstore-app-1' }
}
function Invoke-Compose {
    param([string[]]$Arguments)
    $line = $Arguments -join ' '
    [void]$global:ReleaseTest.Commands.Add($line)
    if ($Arguments[0] -eq 'cp') {
        [IO.File]::WriteAllBytes($Arguments[2],[Text.Encoding]::ASCII.GetBytes('test-only-dump-bytes'))
        $global:ReleaseTest.Backup = $Arguments[2]
    }
    if ($line.Contains('sha256sum')) {
        if ($global:ReleaseTest.BadBackup) { return 'invalid-checksum' }
        return ((Get-FileHash $global:ReleaseTest.Backup -Algorithm SHA256).Hash.ToLowerInvariant() + '  temporary.dump')
    }
}
'@
[IO.File]::WriteAllText((Join-Path $scripts 'Common.ps1'),$mock)
[IO.File]::WriteAllText((Join-Path $scripts 'Start.ps1'), 'param([switch]$NoBrowser) [void]$global:ReleaseTest.Commands.Add("health-verified")')
[IO.File]::WriteAllText((Join-Path $scripts 'Create-Administrator.ps1'), 'param([switch]$Demo) [void]$global:ReleaseTest.Commands.Add("administrator-demo-" + [bool]$Demo)')
function Reset-TestState {
    $global:ReleaseTest = @{Commands=(New-Object Collections.ArrayList); Existing=$false; Answer=''; BadBackup=$false; Backup=''}
}
function Check([bool]$Condition,[string]$Message) { if (-not $Condition) { throw ('FAIL: ' + $Message) }; Write-Output ('PASS: ' + $Message) }
Reset-TestState
& (Join-Path $scripts 'Setup.ps1') -NoBrowser
Check ($global:ReleaseTest.Commands.Contains('administrator-demo-False')) 'Fresh setup defaults to no demo'
Check ($global:ReleaseTest.Commands.Contains('health-verified')) 'Fresh setup checks application health'
$before=(Get-FileHash (Join-Path $testRoot '.env')).Hash
$rejected=$false
try { & (Join-Path $scripts 'Setup.ps1') -NoBrowser } catch { $rejected=$_.Exception.Message.Contains('Update-Sehat.cmd') }
Check $rejected 'Existing installation is directed to the safe updater'
Check ((Get-FileHash (Join-Path $testRoot '.env')).Hash -eq $before) 'Setup preserves existing environment file'
Reset-TestState
$global:ReleaseTest.Existing=$true
& (Join-Path $scripts 'Update.ps1') -NoBrowser
$commands=@($global:ReleaseTest.Commands)
Check (($commands -join "`n").Contains('pg_restore --list')) 'Update verifies backup archive readability'
Check (($commands -join "`n").Contains('sha256sum')) 'Update verifies backup copy checksum'
$backupIndex=-1; $upIndex=-1
for($i=0;$i -lt $commands.Count;$i++){if($commands[$i].Contains('sha256sum')){$backupIndex=$i};if($commands[$i].StartsWith('up -d --no-deps')){$upIndex=$i}}
Check ($backupIndex -ge 0 -and $upIndex -gt $backupIndex) 'Verified backup precedes application replacement and migrations'
Check ((Get-FileHash (Join-Path $testRoot '.env')).Hash -eq $before) 'Update preserves environment configuration'
Reset-TestState
$global:ReleaseTest.Existing=$true; $global:ReleaseTest.BadBackup=$true
$rejected=$false;try { & (Join-Path $scripts 'Update.ps1') -NoBrowser } catch { $rejected=$true }
Check $rejected 'Invalid backup aborts update'
Check (-not (($global:ReleaseTest.Commands -join "`n").Contains('up -d --no-deps'))) 'Failed backup prevents migration startup'
Reset-TestState
$global:ReleaseTest.Existing=$true; $global:ReleaseTest.Answer='wrong confirmation'
$rejected=$false;try { & (Join-Path $scripts 'Reset-Development.ps1') } catch { $rejected=$true }
Check ($rejected -and -not (($global:ReleaseTest.Commands -join "`n").Contains('volume rm'))) 'Development reset rejects incorrect confirmation'
Reset-TestState
$global:ReleaseTest.Existing=$true; $global:ReleaseTest.Answer='RESET SEHAT';$global:ReleaseTest.BadBackup=$true
$rejected=$false;try { & (Join-Path $scripts 'Reset-Development.ps1') } catch { $rejected=$true }
Check ($rejected -and -not (($global:ReleaseTest.Commands -join "`n").Contains('volume rm'))) 'Development reset refuses deletion after backup failure'
Reset-TestState
$global:ReleaseTest.Existing=$true; $global:ReleaseTest.Answer='RESET SEHAT'
& (Join-Path $scripts 'Reset-Development.ps1')
Check ($global:ReleaseTest.Commands.Contains('docker volume rm sehat-medicalstore_medicalstore-data')) 'Confirmed reset targets only the exact Sehat volume'
Check (-not (Test-Path (Join-Path $testRoot '.env'))) 'Confirmed development reset archives configuration for fresh setup'
Check (@(Get-ChildItem -LiteralPath $testRoot -Filter '.env.reset-*').Count -eq 1) 'Original reset configuration is retained for recovery'
Check (-not (($global:ReleaseTest.Commands -join "`n") -match 'prune|down .*--volumes')) 'Reset never prunes Docker or broadly deletes volumes'
Write-Output 'Windows workflow checks completed with fake Docker commands only. Physical Docker reset was not executed.'
