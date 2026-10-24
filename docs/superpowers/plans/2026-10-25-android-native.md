# Android Native Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans; isolated algorithm ports may use dispatching-parallel-agents. Steps use checkboxes for progress.

**Goal:** Build a native Kotlin Android offline charting application with user-configured online AI.
**Architecture:** Pure Kotlin core engines and shared civil-time/calendar contract, Compose app, local SQLite repositories, encrypted API settings.
**Tech Stack:** Kotlin 1.9.22, Compose compiler 1.5.8/UI 1.6.1/Material3 1.2.0, Gradle 8.5, AGP 8.2.2, JUnit 4.13.2, API 26—34.
**Spec:** docs/superpowers/specs/2026-10-25-android-native-design.md

## Global Constraints
- Kotlin calculations; no JS engine, WebView or Java charting dependency in runtime.
- Input years 1900—2099; explicit time zone, preserve input and rules in saved snapshot.
- No network for charts/records; AI network only on explicit send; API keys excluded from backup/logs.
- Work only on android branch, leave main/frontend changes untouched.

## Review Focus
- Civil-time validation and DST ambiguity; invalid dates never silently normalize.
- Imported archives validate all entries before transaction; invalid file leaves existing records intact.
- User edits after calculation do not change a saved result's original inputs.
- Network errors/cancellation never produce duplicate paid requests or lose conversation.
- Calendar range edges, leap months, precise solar terms and 23:00 rollover match fixed reference.

## Task 1: Offline core and build
Files: android-app/{settings.gradle.kts,build.gradle.kts,gradle.properties}, core/src/main/kotlin/com/xuan/core/{Models,CalendarEngine,BaziEngine}.kt, core/src/main/resources/calendar.tsv, core/src/test/kotlin/com/xuan/core/CalendarTest.kt; tools/export-calendar.cjs.
Interfaces: ChartInput(civil:String,timeZone:String,gender:Int,dayDivide:String), CalendarEngine.pillars(input):Pillars; lunar(date):LunarDate; terms(year):List<SolarTerm>; ChartResult(type,title,sections,metadata).
- [x] Write literal/reference fixtures and failing calendar/pillar tests; run :core:test.
- [x] Implement calendar and Bazi; check leap month/DST/hour boundaries/DaYun.
- [x] Run core tests and retain provenance.

## Task 2: Six-line and Qimen engines
Files: core/src/main/kotlin/com/xuan/core/{LiuyaoEngine,QimenEngine}.kt and matching tests.
Interfaces: LiuyaoEngine.calculate(input,lines:List<Int>):ChartResult; QimenEngine.calculate(input):ChartResult; shared CalendarEngine for time/pillars/terms.
- [x] Freeze frontend fixtures before code; demonstrate failing tests.
- [x] Port all structural computations to Kotlin; compare 64 hexagrams and Qimen board fixtures.
- [x] Run core tests, preserve source licensing.

## Task 3: Ziwei engine
Files: core/src/main/kotlin/com/xuan/core/ZiweiEngine.kt, static rule data, ZiweiTest.kt.
Interfaces: ZiweiEngine.calculate(input):ChartResult; shared calendar lunar/terms.
- [x] Freeze independent expected soul/body, class, stars and transformations.
- [x] Port palace/star/decade calculations including leap-midmonth and late-Zi rules.
- [x] Run core tests with frontend fixture comparisons.

## Task 4: Local Android app and AI
Files: app/build.gradle.kts, AndroidManifest.xml, kotlin/com/xuan/app/{MainActivity,AppUi,ChartViewModel,LocalStore,AiClient,SecretStore}.kt, unit/instrumentation tests.
Consumes ChartInput/ChartResult and four engines. SQLite stores immutable snapshots and conversations; backup schema version 1.
- [x] Add real behavior tests for backup validation and AI payload/errors.
- [x] Implement native forms/results, history/backup, encrypted settings and cancellable provider calls.
- [x] Compile app; run unit tests, lint and assembleDebug.

## Task 5: Acceptance
- [x] Review complete branch and repair important issues; fresh reviewer where available.
- [x] Install/launch on available emulator; offline chart/save/restart checks where possible.
- [x] Write README and docs/android/acceptance.md with exact commands/counts, APK location and explicit pending checks.
- [x] Commit scoped native implementation on android branch; no push.
