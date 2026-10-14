# Read-only process/lock assessment shared with the user's local QA cleanup script.
function Get-QaBuildProcessAssessment {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Processes,
        [Parameter(Mandatory)][int]$CurrentSessionId,
        [Parameter(Mandatory)][string]$RepositoryPath
    )
    $repoPrefix = [regex]::Escape($RepositoryPath.Replace('\','/').TrimEnd('/'))
    $repoPattern = $repoPrefix + '(?=[/"\s]|$)'
    foreach ($process in $Processes) {
        if ($process.Name -ne 'node.exe') { continue }
        $command = ([string]$process.CommandLine).Replace('\','/')
        $executable = ([string]$process.ExecutablePath).Replace('\','/')
        $sameSession = [int]$process.SessionId -eq $CurrentSessionId
        $reason = $null
        $kind = 'Unrelated'
        if ([string]::IsNullOrWhiteSpace($command)) {
            if ($sameSession) {
                $kind = 'Block'
                $reason = 'Node command line is unreadable in the current Windows session'
            } else {
                $kind = 'OtherSessionUnknown'
                $reason = 'Unreadable process belongs to another Windows session; its project is not established'
            }
        } else {
            # Only the observed app runtime + specific helper entry points qualify.
            # A Next CLI invoked with that same Node executable is still a build process.
            $helperRuntime = $executable -match '/OpenAI/Codex/runtimes/cua_node/[^/]+/bin/node\.exe$'
            $helperEntry = $command -match '/AppData/Local/Temp/\.tmp[^/]+/(kernel|trusted-worker)\.js(?:["\s]|$)|/cua-repl\.mjs(?:["\s]|$)|\s\./server\.mjs(?:["\s]|$)'
            $explicitQa = $command -match ($repoPrefix + '/apps/(app|bms|seq)/\.next-qa-')
            if ($helperRuntime -and $helperEntry -and -not $explicitQa) {
                $kind = 'AppHelper'
            } elseif ($command -match $repoPattern) {
                $kind = 'Block'
                $reason = 'Node command explicitly references the Genealogiq checkout'
            } elseif ($sameSession -and $command -match 'next/dist/(bin/next|server/lib/start-server)|(?:^|\s)next(?:\.cmd)?\s+(dev|start|build)|local-qa\.mjs|\.next-qa-') {
                $kind = 'Block'
                $reason = 'Next/QA command in the current session has an unresolved project path'
            }
        }
        [pscustomobject]@{ ProcessId=[int]$process.ProcessId; SessionId=[int]$process.SessionId; Kind=$kind; Reason=$reason }
    }
}

function Get-QaBuildLockBlockers {
    param([Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Targets)
    foreach ($target in $Targets) {
        foreach ($relative in @('lock','dev\lock')) {
            $lockPath = Join-Path $target $relative
            if (-not (Test-Path -LiteralPath $lockPath)) { continue }
            $stream = $null
            try {
                $item = Get-Item -LiteralPath $lockPath -Force -ErrorAction Stop
                $parent = Get-Item -LiteralPath $item.DirectoryName -Force -ErrorAction Stop
                if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                    throw 'QA lock or its parent is a link; manual inspection required'
                }
                # Existing file only: no creation or content writes. Fail closed if locked/unreadable.
                $stream = [IO.File]::Open($lockPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            } catch {
                [pscustomobject]@{ Path=$lockPath; Reason=$_.Exception.Message }
            } finally {
                if ($null -ne $stream) { $stream.Dispose() }
            }
        }
    }
}
