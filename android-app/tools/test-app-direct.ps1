param(
    [string[]]$TestClasses = @(),
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$GradleCache = "$env:USERPROFILE/.gradle/caches/modules-2/files-2.1",
    [string]$OutputDirectory = ""
)
$ErrorActionPreference = 'Stop'
$androidRoot = Split-Path $PSScriptRoot -Parent
if (!$JavaHome) { throw 'Set JAVA_HOME to JDK 21 or provide -JavaHome.' }
$java = Join-Path $JavaHome 'bin/java.exe'
if (!$OutputDirectory) { $OutputDirectory = Join-Path $androidRoot 'app/build/direct-test' }
# Resolve exact binary jars only. This runner uses the same cached versions as Gradle.
$names = @('kotlin-compiler-embeddable-1.9.22.jar','kotlin-stdlib-1.9.22.jar','kotlin-script-runtime-1.9.22.jar','kotlin-reflect-1.6.10.jar','trove4j-1.0.20200330.jar','annotations-13.0.jar','junit-4.13.2.jar','hamcrest-core-1.3.jar','gson-2.10.1.jar','okhttp-4.12.0.jar','okio-jvm-3.6.0.jar','kotlinx-coroutines-core-jvm-1.7.3.jar')
$jars = foreach ($name in $names) {
    $matches = @(Get-ChildItem $GradleCache -Recurse -File -Filter $name)
    if ($matches.Count -ne 1) { throw "Expected one cached $name, found $($matches.Count). Populate Gradle dependencies first." }
    $matches[0].FullName
}
$classpath = $jars -join [IO.Path]::PathSeparator
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
# Every run has a fresh output directory so removed source classes cannot remain.
$classes = Join-Path $OutputDirectory ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $classes | Out-Null
$main = @(Get-ChildItem (Join-Path $androidRoot 'core/src/main/kotlin') -Recurse -Filter '*.kt' | ForEach-Object FullName)
$main += @('AppModels.kt','BackupCodec.kt','AiProtocol.kt','AiStream.kt','WebAiProviders.kt','ChartDraft.kt','ToonCodec.kt','ChatDelivery.kt','AgentActions.kt','LiuyaoExport.kt','ZiweiExport.kt','ZiweiViewState.kt') | ForEach-Object { Join-Path $androidRoot ('app/src/main/kotlin/com/xuan/app/' + $_) }
$testRoot = Join-Path $androidRoot 'app/src/test/kotlin'
$tests = @(Get-ChildItem $testRoot -Recurse -Filter '*Test.kt')
if ($TestClasses.Count -eq 0) { $TestClasses = @($tests | ForEach-Object { 'com.xuan.app.' + $_.BaseName }) }
$tests = @($tests | Where-Object { ('com.xuan.app.' + $_.BaseName) -in $TestClasses } | ForEach-Object FullName)
if ($tests.Count -ne $TestClasses.Count) { throw 'Some requested test classes have no matching source.' }
& $java -cp $classpath org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -classpath $classpath -d $classes @main @tests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$runtime = @($classes, (Join-Path $androidRoot 'core/src/main/resources'), (Join-Path $androidRoot 'app/src/main/resources'), (Join-Path $androidRoot 'app/src/test/resources'), $classpath) -join [IO.Path]::PathSeparator
& $java -cp $runtime org.junit.runner.JUnitCore @TestClasses
exit $LASTEXITCODE
