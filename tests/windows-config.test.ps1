# Filesystem-only regression tests: no Docker or database operations.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\windows\Common.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('sehat-config-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$script:LocalEnv = Join-Path $testRoot '.env'
try {
    $password = 'ab' * 48
    $secret = 'cd' * 48
    foreach ($ending in @("`r`n", "`n")) {
        foreach ($bom in @($false,$true)) {
            $content = 'POSTGRES_PASSWORD=' + $password + $ending + 'JWT_SECRET=' + $secret + $ending + 'APP_PORT=3001' + $ending
            [IO.File]::WriteAllText($script:LocalEnv,$content,(New-Object Text.UTF8Encoding($bom)))
            $before = (Get-FileHash $script:LocalEnv).Hash
            Assert-LocalEnv
            if ((Get-FileHash $script:LocalEnv).Hash -ne $before) { throw 'Validation modified existing settings.' }
            Write-Output ('PASS line endings/BOM, preserved file: CRLF=' + ($ending.Length -eq 2) + ', BOM=' + $bom)
        }
    }
    foreach ($content in @(
        ('POSTGRES_PASSWORD=' + $password + "`r`n"),
        ('POSTGRES_PASSWORD=short' + "`r`nJWT_SECRET=" + $secret),
        ('POSTGRES_PASSWORD=' + $password + "`r`nJWT_SECRET=" + $secret + "`r`nJWT_SECRET=" + $secret)
    )) {
        [IO.File]::WriteAllText($script:LocalEnv,$content)
        $rejected=$false
        try { Assert-LocalEnv } catch { $rejected=$true }
        if (-not $rejected) { throw 'Invalid or duplicate settings were accepted.' }
        Write-Output 'PASS invalid/missing/duplicate setting rejected.'
    }
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
