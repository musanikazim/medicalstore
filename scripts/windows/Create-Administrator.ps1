param([switch]$Demo)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Docker
Assert-LocalEnv
$email = (Read-Host 'Choose your administrator email address').Trim().ToLowerInvariant()
try { $parsed = New-Object Net.Mail.MailAddress($email); if ($parsed.Address -ne $email) { throw 'Invalid email' } } catch { throw 'Enter a valid email address, such as yourname@example.com. It is used only as a local login; no email is sent.' }
$secure = Read-Host 'Choose an administrator password (at least 12 characters; typing is hidden)' -AsSecureString
$confirm = Read-Host 'Type that password again (hidden)' -AsSecureString
$first = [IntPtr]::Zero
$second = [IntPtr]::Zero
$oldEmail = [Environment]::GetEnvironmentVariable('SEED_ADMIN_EMAIL','Process')
$oldPassword = [Environment]::GetEnvironmentVariable('SEED_ADMIN_PASSWORD','Process')
try {
    $first = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $second = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($first)
    if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($second)) { throw 'The passwords did not match. Run Create-Administrator.cmd to try again.' }
    if ($plain.Length -lt 12 -or [Text.Encoding]::UTF8.GetByteCount($plain) -gt 72) { throw 'Use at least 12 characters and at most 72 UTF-8 bytes (12-72 English letters/numbers/symbols).' }
    [Environment]::SetEnvironmentVariable('SEED_ADMIN_EMAIL',$email,'Process')
    [Environment]::SetEnvironmentVariable('SEED_ADMIN_PASSWORD',$plain,'Process')
    $command = @('run','--rm','-T','--no-deps','-e','SEED_ADMIN_EMAIL','-e','SEED_ADMIN_PASSWORD','app','npm','run','db:seed')
    if ($Demo) { $command += @('--','--demo') }
    Invoke-Compose -Arguments $command
    Write-Host 'Account prepared. Existing accounts/passwords are never overwritten. Keep your chosen password in a password manager.' -ForegroundColor Green
} finally {
    [Environment]::SetEnvironmentVariable('SEED_ADMIN_EMAIL',$oldEmail,'Process')
    [Environment]::SetEnvironmentVariable('SEED_ADMIN_PASSWORD',$oldPassword,'Process')
    $plain = $null
    if ($first -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($first) }
    if ($second -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($second) }
    $secure.Dispose(); $confirm.Dispose()
}
