param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$SocketDirectory = '',
    [string[]]$GradleArguments = @(':core:test')
)
$ErrorActionPreference = 'Stop'
$androidRoot = Split-Path $PSScriptRoot -Parent
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin/java.exe'))) {
    throw 'Set JAVA_HOME to JDK 21 or provide -JavaHome. Gradle 8.5 cannot run on JDK 25.'
}
$previousJavaHome = $env:JAVA_HOME
$previousJavaOptions = $env:JAVA_TOOL_OPTIONS
$buildExitCode = 1
try {
    $env:JAVA_HOME = $JavaHome
    if ($SocketDirectory) {
        New-Item -ItemType Directory -Force $SocketDirectory | Out-Null
        $socketPath = (Resolve-Path -LiteralPath $SocketDirectory).Path.Replace('\', '/')
        $socketOption = '-Djdk.net.unixdomain.tmpdir="' + $socketPath + '"'
        $env:JAVA_TOOL_OPTIONS = (@($previousJavaOptions, $socketOption) | Where-Object { $_ }) -join ' '
    }
    & (Join-Path $androidRoot 'gradlew.bat') -p $androidRoot @GradleArguments
    $buildExitCode = $LASTEXITCODE
} finally {
    $env:JAVA_HOME = $previousJavaHome
    $env:JAVA_TOOL_OPTIONS = $previousJavaOptions
}
exit $buildExitCode
