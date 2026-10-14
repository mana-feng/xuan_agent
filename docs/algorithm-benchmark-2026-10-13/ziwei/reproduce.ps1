param(
    [string]$Node = 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',
    [switch]$Download
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$benchmarkCache = Join-Path $repoRoot '.local-dev/ziwei-benchmark'
New-Item -ItemType Directory -Force -Path $benchmarkCache | Out-Null
$packageArchive = Join-Path $benchmarkCache 'fortel.tgz'
$sourceArchive = Join-Path $benchmarkCache 'fortel-source.zip'
if ($Download) {
    Invoke-WebRequest 'https://registry.npmjs.org/fortel-ziweidoushu/-/fortel-ziweidoushu-1.3.4.tgz' -OutFile $packageArchive
    Invoke-WebRequest 'https://codeload.github.com/airicyu/fortel-ziweidoushu/zip/39584e11ad9ddb124bd4b337a3b148c2f0b25611' -OutFile $sourceArchive
}
if ((Get-FileHash -LiteralPath $packageArchive -Algorithm SHA256).Hash -ne 'CFCCF313CAB829D5824733F5C29F00F2BA6F39262E0DABAA9F9BE74091539BAD') { throw 'Fortel npm archive hash mismatch' }
if ((Get-FileHash -LiteralPath $sourceArchive -Algorithm SHA256).Hash -ne '72DCFB3DC229DDFE0DDD36F6D9AEDA62F97DB786BA40976B44875F3A3C1C8A8D') { throw 'Fortel Git source archive hash mismatch' }
# Extract into the task cache only; no npm install, package lifecycle hooks, or
# writes to the project's shared frontend node_modules are necessary.
& tar -xzf $packageArchive -C $benchmarkCache
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract Fortel package' }
Expand-Archive -LiteralPath $sourceArchive -DestinationPath (Join-Path $benchmarkCache 'source') -Force
Push-Location $repoRoot
try {
    & $Node (Join-Path $PSScriptRoot 'run-benchmark.cjs') 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot 'run.log')
    $benchmarkExit = $LASTEXITCODE
    & $Node (Join-Path $PSScriptRoot 'render-report.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Report generation failed' }
    & $Node (Join-Path $PSScriptRoot 'verify-artifacts.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Artifact verification failed' }
    if ($benchmarkExit -ne 0) { throw "Benchmark returned $benchmarkExit; inspect unresolved.json" }
} finally { Pop-Location }
