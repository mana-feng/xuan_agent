param(
 [string]$Node='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',
 [string]$Python='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
)
$ErrorActionPreference='Stop'
# Dependencies are pinned and isolated by ../ziwei/reproduce.ps1 and the qimen
# benchmark's sxtwl2.0.6 setup. Never install into the frontend node_modules junction.
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
try {
 & $Python -X utf8 (Join-Path $PSScriptRoot 'calendar-1900.py') 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot 'calendar-1900.log')
 if($LASTEXITCODE -ne 0){throw 'Independent calendar run failed'}
 $env:BENCHMARK_RUN='after'
 & $Node (Join-Path $PSScriptRoot 'run-benchmark.cjs') 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot 'after-run.log')
 if($LASTEXITCODE -ne 0){throw 'Extended comparison failed; inspect after-unresolved.json'}
 Remove-Item Env:BENCHMARK_RUN
 & $Node (Join-Path $PSScriptRoot 'verify-artifacts.cjs') 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot 'verification.log')
 if($LASTEXITCODE -ne 0){throw 'Artifact validation failed'}
 & $Node (Join-Path $PSScriptRoot 'render-report.cjs')
 if($LASTEXITCODE -ne 0){throw 'Report generation failed'}
} finally {Remove-Item Env:BENCHMARK_RUN -ErrorAction SilentlyContinue;Pop-Location}
