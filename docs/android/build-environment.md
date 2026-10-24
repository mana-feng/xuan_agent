# Android build environment

The native application lives in `android-app/`; its `core` module is plain Kotlin/JVM and the `app` module is Android Compose. Use the checked-in Gradle wrapper from that directory. No global Java or Android settings need to change.

## Versions

- Gradle wrapper: 8.5
- Java toolchain: JDK 21; generated Java/Kotlin bytecode targets Java 17
- Android Gradle Plugin: 8.2.2
- Kotlin: 1.9.22
- Compose UI: 1.6.1; compiler extension: 1.5.8
- Android compile/target API: 34; minimum API: 26
- JUnit: 4.13.2

Set `JAVA_HOME` to a JDK 21 installation and create ignored `android-app/local.properties` with `sdk.dir` pointing to the Android SDK (or provide `ANDROID_HOME`). The local SDK must include platform API 34 and build-tools 34.0.0. Do not point Gradle 8.5 at Android Studio's JDK 25 runtime.

## Build commands

From the repository root in PowerShell:

```powershell
$env:JAVA_HOME = 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot'
./android-app/tools/build.ps1 -GradleArguments ':core:test','--no-daemon'
./android-app/tools/build.ps1 -GradleArguments ':app:assembleDebug','--no-daemon'
```

The debug APK is `android-app/app/build/outputs/apk/debug/app-debug.apk`. Initial builds may download public dependencies into the user's Gradle cache. Add `--offline` only after those artifacts and plugin markers are cached. A cached compiler artifact alone does not guarantee its Gradle plugin marker is cached.

## This Windows host: local socket workaround

The installed JDK 21.0.5 fails before project configuration with `Unable to establish loopback connection`, caused by `UnixDomainSockets.connect0` reporting `Invalid argument: connect`. An isolated `Selector.open()` reproduces it even without Gradle. Both the default selector and `WindowsSelectorProvider` fail with the default `%TEMP%` location; changing the selector provider does not resolve it.

JDK bytecode inspection shows that the Windows Unix-domain socket directory uses `jdk.net.unixdomain.tmpdir`, then `%TEMP%`, then `java.io.tmpdir`. Therefore setting only `java.io.tmpdir` does not change the directory on this host. An explicit socket directory on F: allows the same selector probe and Gradle startup to run:

```powershell
./android-app/tools/build.ps1 `
  -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot' `
  -SocketDirectory 'F:/github/xuan_agent/.local-dev/android-tmp' `
  -GradleArguments ':core:test','--offline','--no-daemon'
```

The helper applies `JAVA_TOOL_OPTIONS` only for its own invocation and restores the calling environment afterward. It does not modify machine settings. The exact OS cause of the directory-dependent Unix-domain socket failure is not established; the documented result is an observed local workaround.

Diagnostic evidence from 2026-10-25 is under ignored `.local-dev/android/`: `gradle-diagnose.log`, `SelectorProbe.java`, `selector-default.log`, `selector-windows.log`, `selector-unixdir.log`, `gradle-socketdir.log`, and `gradle-online-plugins.log`. The latter reaches Kotlin compilation, proving the initial Gradle startup blocker was removed. The wrapper was generated with the locally installed Gradle 8.5 distribution; its checked-in distribution URL remains the standard public Gradle URL.

## Independent core test fallback

When diagnosing Gradle startup, this helper compiles the actual core sources and selected test sources with the cached Kotlin 1.9.22 compiler, then invokes JUnit directly:

```powershell
./android-app/tools/test-core-direct.ps1 `
  -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot' `
  -TestClasses com.xuan.core.CalendarTest,com.xuan.core.BaziTest
```

Omit `-TestClasses` to discover all `*Test.kt` classes in `com.xuan.core`. It requires exact cached binary JARs for Kotlin, compiler dependencies, and JUnit; it does not download anything. Every invocation compiles into a fresh directory under ignored `core/build/direct-test`, includes the main/test resource directories, and preserves the compiler or JUnit exit status. This verifies JVM engine tests only. Android packaging, device behavior, and UI acceptance require the Android build and emulator/device checks separately.

The app's Android-independent backup/provider unit tests also have a selective fallback:

```powershell
./android-app/tools/test-app-direct.ps1 `
  -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot'
```

It compiles all core sources plus the Android-independent app models, backup/provider protocol, action parser, chart draft, and chat-delivery sources, with cached Gson 2.10.1, OkHttp 4.12.0, Okio 3.6.0, and coroutines 1.7.3. UI and Android framework classes are outside this direct runner.

## Verified build evidence (2026-10-25)

The actual wrapper command `:core:test --offline --no-daemon` completed successfully using JDK 21 and the socket-directory workaround. Its 19 JUnit tests passed: Calendar 4, Bazi 3, Liuyao 4, Qimen 2, Ziwei 6; failures, errors, and skips were all zero. Evidence: `.local-dev/android/gradle-core-green.log` and `android-app/core/build/test-results/test/TEST-*.xml`.

Initial direct test runs were recorded before production stubs were replaced: Calendar 4 failures, Bazi 3 failures, Liuyao/Qimen 6 failures, Ziwei's initial 3 tests failed, and app backup/provider 7 failures. These logs distinguish the initial failing tests from later implementation verification.

The local Android emulator inventory contains `Pixel_9_Pro` (x86_64, API 37.1, Google APIs Play Store 16K image), and WHPX reports usable. Device/app runtime smoke results are recorded separately from the JVM engine results.

## Actual Android offline instrumentation

The app uses the dependency-free framework runner `com.xuan.app.OfflineSmokeRunner` from `app/src/androidTest/`. Build and invoke it with:

```powershell
./android-app/tools/build.ps1 -GradleArguments ':app:assembleDebug',':app:assembleDebugAndroidTest','--no-daemon'
# Use an explicitly selected emulator serial; the examples assume emulator-5554.
$adb = "$env:ANDROID_HOME/platform-tools/adb.exe"
& $adb -s emulator-5554 install -r android-app/app/build/outputs/apk/debug/app-debug.apk
& $adb -s emulator-5554 install -r -t android-app/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $adb -s emulator-5554 shell am instrument -w -r -e launchActivity true com.manafeng.xuan.test/com.xuan.app.OfflineSmokeRunner
```

The runner uses the instrumentation APK context for identity/resources and a `ContextWrapper` that delegates real SQLite/SharedPreferences writes to random `offline-smoke-<UUID>-` names under the instrumented process UID. Android's test APK context directory itself is not writable under that UID; the initial unwrapped harness correctly failed its preferences commit. Guards check the random prefix before cleanup. Production database/settings names and existing Keystore aliases are never deleted.

The device cases cover four-engine chart snapshots across database reopen; valid archives and conversation snapshots; invalid-import atomicity; independent record deletion; actual AndroidKeyStore encrypt/decrypt and clearing; plaintext absence from raw preferences/exports; and optional native activity launch. The large-payload regression stores valid chart and conversation records each exceeding 2 MB and verifies exact reopened snapshots, including Unicode data.

On the task's dedicated emulator, airplane mode was initially 0 and was enabled to 1 before the runtime checks (`airplane-prior.txt` and `airplane-enabled.txt`). The first five existing-production runtime checks passed in `.local-dev/android/instrumentation-isolated.log`. The dedicated large-payload regression then reproduced `SQLiteBlobTooBigException` for both chart and conversation reads in `instrumentation-large-payload-red.log`, before the production retrieval fix. These device results are separate from JVM tests; the original existing-production checks do not claim a prior production-stub RED cycle.

The first headless AVD eventually stopped responding to guest/console operations. Restarting this task-owned read-only AVD with `-gpu swiftshader -feature -Vulkan -camera-back none -camera-front none` restored responsive installation and instrumentation. This is an observed local recovery; the exact emulator freeze cause is not established. The emulator remained hidden and no physical phone was connected.


## Final validation (2026-10-25)

After the storage/draft/reply fixes and final navigation-bar resource update:

- Actual Gradle: `:core:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest` succeeded (`gradle-final-green.log`). The final resource refresh also succeeded (`gradle-final-resources.log`).
- Core JVM: 23 tests; app JVM: 22 tests. All 45 had zero failures, errors, or skips. Structured suite evidence is `.local-dev/android/final-gradle-summary.json`.
- Android runtime: all 8 cases passed, including actual activity recreation retaining the same ViewModel and all unsaved form/options/chat/config drafts, and a failed-write reply followed by an actual SQLite storage-only retry. The added large-record test passed after its recorded failure. Evidence: `instrumentation-final-green.log` (`tests=8`, `failures=0`, `INSTRUMENTATION_CODE: -1`).
- Airplane mode was verified as 1 before final device tests/screenshots, then restored to its original value 0 (`airplane-restored.txt`). No live model request or real API key was used.
- Lint: 0 errors and 4 warnings: incompatible Compose Runtime custom lint checks skipped, future data-extraction configuration, an OutputStream recycle warning at the buffered-writer `use` chain, and missing application icon. General lint success does not establish execution of those skipped Compose-specific checks.
- Final debug APK: 9,194,654 bytes; SHA-256 `A58CE98BD4036BDEC8EAA063B4460CFCEFC00CDD8967F6D630166E03C8B444DC`. `.local-dev/android/final-apk-evidence.json` records the full output path, build timestamp, and counts.
- Actual emulator screenshots: `docs/android/screenshots/home-offline.png` and `docs/android/screenshots/bazi-result-offline.png`. Both were captured with airplane mode enabled; the result was calculated through the native UI. The emulator remains running for inspection.

The eight runtime cases verify: generated-chart persistence; large chart/conversation persistence; invalid import atomicity; valid archive merging/export/deletion/chat retention; Keystore ciphertext and credential clearing; retained replies and storage-only retry; native entry launch; and retained drafts across actual activity recreation. Real provider endpoints, billing behavior, physical phones, and untested Android versions remain outside this evidence.
