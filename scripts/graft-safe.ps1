[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GraftArguments = @('build', '.')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (($GraftArguments.Count -ne 1 -and $GraftArguments.Count -ne 2) -or
    $GraftArguments[0] -cne 'build' -or
    ($GraftArguments.Count -eq 2 -and $GraftArguments[1] -cne '.')) {
    throw 'Only build or build . is permitted. Flags, other commands and external paths are blocked.'
}

$scriptRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repoRoot = (& git -C $scriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw 'Run this script from inside the Smart Port Git worktree.'
}
$repoRoot = [IO.Path]::GetFullPath($repoRoot)
if ($repoRoot -ne $scriptRoot) { throw 'Unexpected repository root.' }

function Assert-NoReparsePoint([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Path escapes the permitted root.'
    }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'Symlinks and junctions are not permitted.'
            }
        }
        $cursor = Split-Path -Parent $cursor
    }
}

$excludedPrefixes = @(
    '.agents/',
    '.claude/',
    '.qwen/',
    '.zcode/',
    'database/',
    'docs/',
    'document-ocr/',
    'graft/',
    'project-log-md/',
    'secrets/',
    'smartport/db-data/',
    'uploads/'
)
$excludedExtensions = @(
    '.bak', '.csv', '.doc', '.docx', '.dump', '.env', '.jks', '.kdbx',
    '.key', '.log', '.pdf', '.pem', '.pfx', '.p12', '.sql', '.xls', '.xlsx'
)

$tempRoot = Join-Path $repoRoot ("smart-port-graft-safe-" + [guid]::NewGuid().ToString('N'))
$lockPath = Join-Path $repoRoot '.graft-safe.lock'
$graftCommand = Get-Command graft -ErrorAction Stop
$allowedEnvironment = @('SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'PATH', 'PATHEXT')
$savedEnvironment = $null
$environmentChanged = $false
$lockCreated = $false

try {
    Assert-NoReparsePoint $lockPath $repoRoot
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $lock.Dispose()
    $lockCreated = $true
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    $trackedFiles = @(& git -C $repoRoot -c core.quotePath=false ls-files)
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to enumerate tracked files. Refusing to build an unbounded snapshot.'
    }

    $copiedCount = 0
    $excludedCount = 0
    foreach ($relativePath in $trackedFiles) {
        $normalizedPath = $relativePath.Replace('\', '/')
        $extension = [IO.Path]::GetExtension($normalizedPath).ToLowerInvariant()
        $isExcluded = $false
        # Only source code in explicit roots; never copy tool configuration or data.
        if ($normalizedPath -notmatch '^(backend|frontend/src|scripts)/' -or
            $normalizedPath -match '(^|/)[.]|(^|/)(secrets|credentials|backups|db-backups|uploads|node_modules|vendor|fixtures|data)(/|$)' -or
            $extension -notin @('.php', '.js', '.mjs', '.vue', '.ts', '.css')) {
            $isExcluded = $true
        }

        foreach ($prefix in $excludedPrefixes) {
            if ($normalizedPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                $isExcluded = $true
                break
            }
        }
        if (-not $isExcluded -and $excludedExtensions -contains $extension) {
            $isExcluded = $true
        }
        if (-not $isExcluded -and [IO.Path]::GetFileName($normalizedPath) -match '(?i)(credential|private[-_]?key|secret)') {
            $isExcluded = $true
        }

        if ($isExcluded) {
            $excludedCount++
            continue
        }

        $sourcePath = Join-Path $repoRoot $relativePath
        Assert-NoReparsePoint $sourcePath $repoRoot
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            continue
        }

        $destinationPath = Join-Path $tempRoot $relativePath
        Assert-NoReparsePoint $destinationPath $tempRoot
        $destinationDirectory = Split-Path -Parent $destinationPath
        if (-not (Test-Path -LiteralPath $destinationDirectory)) {
            New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        }
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
        $copiedCount++
    }

    # The PowerShell Env: provider can fail when a host injects case-variant names.
    $savedEnvironment = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process)
    $environmentChanged = $true
    foreach ($variableName in @($savedEnvironment.Keys)) {
        [Environment]::SetEnvironmentVariable([string]$variableName, $null, 'Process')
    }
    foreach ($variableName in @($savedEnvironment.Keys)) {
        if ($allowedEnvironment -contains [string]$variableName) {
            [Environment]::SetEnvironmentVariable([string]$variableName, [string]$savedEnvironment[$variableName], 'Process')
        }
    }
    [Environment]::SetEnvironmentVariable('NO_COLOR', '1', 'Process')

    Push-Location $tempRoot
    try {
        # Fixed invocation: never forward user arguments to the CLI.
        & $graftCommand build .
        if ($LASTEXITCODE -ne 0) {
            throw "Graft exited with code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $generatedGraph = Join-Path $tempRoot 'graft'
    if (-not (Test-Path -LiteralPath $generatedGraph -PathType Container)) {
        throw 'Graft reported success without producing a graph directory.'
    }
    Assert-NoReparsePoint $generatedGraph $tempRoot
    foreach ($requiredFileName in @('INDEX.md', '.graph/wiring.json')) {
        $requiredFile = Join-Path $generatedGraph $requiredFileName
        Assert-NoReparsePoint $requiredFile $tempRoot
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "Graft output is incomplete: missing $requiredFileName."
        }
    }
    $repoGraph = Join-Path $repoRoot 'graft'
    Assert-NoReparsePoint $repoGraph $repoRoot
    if ([IO.Path]::GetFullPath((Split-Path -Parent $repoGraph)) -ne $repoRoot -or (Split-Path -Leaf $repoGraph) -ne 'graft') {
        throw 'Refusing to replace an unexpected graph path.'
    }
    if (Test-Path -LiteralPath $repoGraph) {
        $backupGraph = Join-Path $repoRoot ('.graft-backup-' + [guid]::NewGuid().ToString('N'))
        Assert-NoReparsePoint $backupGraph $repoRoot
        Move-Item -LiteralPath $repoGraph -Destination $backupGraph
        Write-Host 'Previous graph preserved in a local .graft-backup-* directory.'
    }
    Copy-Item -LiteralPath $generatedGraph -Destination $repoGraph -Recurse

    Write-Host "Safe local Graft command completed. Included tracked files: $copiedCount; excluded sensitive/local files: $excludedCount."
}
finally {
    if ($environmentChanged) {
        foreach ($variableName in @($allowedEnvironment + 'NO_COLOR')) {
            [Environment]::SetEnvironmentVariable($variableName, $null, 'Process')
        }
        foreach ($variableName in @($savedEnvironment.Keys)) {
            [Environment]::SetEnvironmentVariable([string]$variableName, [string]$savedEnvironment[$variableName], 'Process')
        }
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Assert-NoReparsePoint (Join-Path $tempRoot 'cleanup-check') $tempRoot
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    if ($lockCreated -and (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
        Assert-NoReparsePoint $lockPath $repoRoot
        Remove-Item -LiteralPath $lockPath -Force
    }
}
