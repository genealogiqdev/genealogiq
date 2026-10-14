$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'qa-build-process-guard.ps1')
$repo = 'C:\Users\Tiger\Desktop\dev\personal\genealogiq'
$runtime = 'C:\Users\Tiger\AppData\Local\OpenAI\Codex\runtimes\cua_node\abc\bin\node.exe'
$cases = @(
    @{Label='other Windows session without metadata'; Session=1; Command=$null; Executable=$null; Expected='OtherSessionUnknown'}
    @{Label='current session without metadata'; Session=2; Command=$null; Executable=$null; Expected='Block'}
    @{Label='explicit repository in another session'; Session=1; Command="node $repo\scripts\local-qa.mjs"; Executable='C:\node.exe'; Expected='Block'}
    @{Label='unrelated project'; Session=2; Command='node C:\projects\other\server.js'; Executable='C:\node.exe'; Expected='Unrelated'}
    @{Label='unresolved Next project in current session'; Session=2; Command='node C:\tools\next\dist\bin\next dev'; Executable='C:\node.exe'; Expected='Block'}
    @{Label='unresolved Next project in other session'; Session=1; Command='node C:\tools\next\dist\bin\next dev'; Executable='C:\node.exe'; Expected='Unrelated'}
    @{Label='verified runtime helper with repo context'; Session=2; Command="node C:\Users\Tiger\AppData\Local\Temp\.tmp123\kernel.js --working-dir $repo"; Executable=$runtime; Expected='AppHelper'}
    @{Label='runtime executable used for real build'; Session=2; Command="node $repo\node_modules\next\dist\bin\next build"; Executable=$runtime; Expected='Block'}
    @{Label='repository-name prefix collision'; Session=2; Command="node $repo-backup\script.js"; Executable='C:\node.exe'; Expected='Unrelated'}
    @{Label='relative QA build in current session'; Session=2; Command='node .next-qa-build\server.js'; Executable='C:\node.exe'; Expected='Block'}
    @{Label='helper mentioning actual QA output'; Session=2; Command="node C:\Users\Tiger\AppData\Local\Temp\.tmp123\kernel.js $repo\apps\seq\.next-qa-build"; Executable=$runtime; Expected='Block'}
)
foreach ($case in $cases) {
    $record = [pscustomobject]@{Name='node.exe';ProcessId=42;SessionId=$case.Session;CommandLine=$case.Command;ExecutablePath=$case.Executable}
    $result = @(Get-QaBuildProcessAssessment -Processes @($record) -CurrentSessionId 2 -RepositoryPath $repo)
    if ($result.Count -ne 1 -or $result[0].Kind -ne $case.Expected) { throw "Failed $($case.Label): expected $($case.Expected), observed $($result.Kind)" }
}
# A real lock is tested without deleting anything, including this small owned fixture.
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('genealogiq-qa-lock-test-' + [guid]::NewGuid().ToString('N'))
$dev = Join-Path $fixture 'dev'
[IO.Directory]::CreateDirectory($dev) | Out-Null
$lock = Join-Path $dev 'lock'
[IO.File]::WriteAllText($lock, 'unchanged')
$held = [IO.File]::Open($lock, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    $blocked = @(Get-QaBuildLockBlockers -Targets @($fixture))
    if ($blocked.Count -ne 1 -or $blocked[0].Path -ne $lock) { throw 'Held QA lock was not blocked.' }
} finally { $held.Dispose() }
if (@(Get-QaBuildLockBlockers -Targets @($fixture)).Count -ne 0) { throw 'Closed QA lock was incorrectly blocked.' }
if ([IO.File]::ReadAllText($lock) -cne 'unchanged') { throw 'Lock check changed file contents.' }
Write-Host "$($cases.Count) process cases and 3 real lock expectations passed. No processes stopped or files deleted."
Write-Host "Retained tiny test fixture: $fixture"
