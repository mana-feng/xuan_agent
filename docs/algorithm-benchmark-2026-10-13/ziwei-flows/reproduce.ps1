param([string]$Node = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
$ErrorActionPreference = 'Stop'
foreach ($script in @('run-benchmark.cjs','verify-selection.cjs','verify-timezones.cjs','verify-extended-range.cjs','verify-artifacts.cjs','render-report.cjs')) {
    & $Node (Join-Path $PSScriptRoot $script)
    if ($LASTEXITCODE -ne 0) { throw "$script failed: $LASTEXITCODE" }
}
