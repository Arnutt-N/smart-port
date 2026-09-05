$ErrorActionPreference = 'Stop'
$wrapper = Join-Path $PSScriptRoot '../graft-safe.ps1'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$global:graftGuardTestCalls = 0
$global:graftGuardMode = 'stop'
function git {
    if ($args -contains 'rev-parse') { $global:LASTEXITCODE = 0; return $root }
    $global:LASTEXITCODE = 0
    # Excluded paths must not be opened, even if Git returns them.
    return @('secrets/never-read.php', 'database/never-read.sql', '.env', 'scripts/../secrets/never-read.php')
}
function graft {
    $global:graftGuardTestCalls++
    if (($args -join ' ') -cne 'build .') { throw 'Unexpected CLI arguments' }
    if ([Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY')) { throw 'Legacy credential inherited' }
    if ([Environment]::GetEnvironmentVariable('GRAFT_DIR')) { throw 'Graph override inherited' }
    if ([Environment]::GetEnvironmentVariable('UNKNOWN_PROVIDER_TOKEN')) { throw 'Unknown credential inherited' }
    if ([Environment]::GetEnvironmentVariable('NODE_OPTIONS')) { throw 'Node preload inherited' }
    if (@(Get-ChildItem -Force).Count -ne 0) { throw 'Excluded file copied' }
    if ($global:graftGuardMode -eq 'missing-output') { $global:LASTEXITCODE = 0; return }
    throw 'EXPECTED_MOCK_STOP'
}
$savedKey = [Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY')
$savedDir = [Environment]::GetEnvironmentVariable('GRAFT_DIR')
$savedUnknown = [Environment]::GetEnvironmentVariable('UNKNOWN_PROVIDER_TOKEN')
$savedNodeOptions = [Environment]::GetEnvironmentVariable('NODE_OPTIONS')
try {
    $env:OPENROUTER_API_KEY = 'synthetic-test-only'
    $env:GRAFT_DIR = 'synthetic-outside-path'
    $env:UNKNOWN_PROVIDER_TOKEN = 'synthetic-test-only'
    $env:NODE_OPTIONS = '--require=synthetic-test-only'
    foreach ($case in @(
        @('build', '.', '--deep'), @('build', '--deep=true'),
        @('build', '..'), @('build', 'C:\'), @('ask', 'question'),
        @('build', '.', '--dir=..'), @('build', '.', '--lsp')
    )) {
        try { & $wrapper @case; throw 'Unexpected acceptance' }
        catch { if ($_.Exception.Message -notlike 'Only build*') { throw } }
    }
    if ($global:graftGuardTestCalls -ne 0) { throw 'Rejected arguments reached Graft' }
    $lockPath = Join-Path $root '.graft-safe.lock'
    try {
        [IO.File]::WriteAllText($lockPath, 'synthetic-test-only')
        try { & $wrapper build .; throw 'Concurrent build lock was ignored' }
        catch { if ($_.Exception.Message -notlike '*already exists*') { throw } }
    }
    finally {
        if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
    }
    if ($global:graftGuardTestCalls -ne 0) { throw 'Locked build reached Graft' }
    try { & $wrapper build .; throw 'Expected mock failure' }
    catch { if ($_.Exception.Message -ne 'EXPECTED_MOCK_STOP') { throw } }
    if ($global:graftGuardTestCalls -ne 1) { throw 'Expected one structural invocation' }
    if ($env:OPENROUTER_API_KEY -ne 'synthetic-test-only' -or
        $env:GRAFT_DIR -ne 'synthetic-outside-path' -or
        $env:UNKNOWN_PROVIDER_TOKEN -ne 'synthetic-test-only' -or
        $env:NODE_OPTIONS -ne '--require=synthetic-test-only') {
        throw 'Parent environment not restored'
    }
    $global:graftGuardMode = 'missing-output'
    try { & $wrapper build .; throw 'Missing graph output was accepted' }
    catch { if ($_.Exception.Message -ne 'Graft reported success without producing a graph directory.') { throw } }
    if ($global:graftGuardTestCalls -ne 2) { throw 'Expected missing-output invocation' }
    if (Test-Path -LiteralPath (Join-Path $root '.graft-safe.lock')) { throw 'Build lock was not removed' }
    if (@(Get-ChildItem -LiteralPath $root -Directory -Filter 'smart-port-graft-safe-*').Count -ne 0) {
        throw 'Snapshot was not removed'
    }
    Write-Output 'PASS: argument rejection, excluded paths, environment allowlist, output validation, fixed invocation, restoration and cleanup.'
}
finally {
    [Environment]::SetEnvironmentVariable('OPENROUTER_API_KEY', $savedKey)
    [Environment]::SetEnvironmentVariable('GRAFT_DIR', $savedDir)
    [Environment]::SetEnvironmentVariable('UNKNOWN_PROVIDER_TOKEN', $savedUnknown)
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $savedNodeOptions)
}
