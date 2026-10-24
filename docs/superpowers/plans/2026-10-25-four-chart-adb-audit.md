# Four native chart flows versus mobile web: implementation and acceptance plan

> For agentic workers: use superpowers:executing-plans. Root performs device operations and fixes; independent read-only domain audits may run in parallel.

**Updated acceptance (user clarification):** Keep the same visual style; exact mobile-web parity is no longer required. Exercise the four Kotlin-native workflows on the physical phone, fix usability/correctness issues and update the installed app. The earlier browser comparison is partial evidence only; do not claim four complete web/native paired audits.

**Goal:** Exercise all four native flows through real screen input using ADB, fix observed issues and update the phone.
**Architecture:** Same physical phone for native UI and a new localhost browser origin via task-specific ADB reverse. Keep persistent records/configuration; create clearly named synthetic test records. Browser/native screenshots and view trees are evidence, while independent source audits guide reproducible checks.
**Tech Stack:** Kotlin/Compose, ADB input/uiautomator/screencap, existing Vite H5 baseline, JVM regression checks.
**Spec:** docs/superpowers/specs/2026-10-25-android-web-parity-design.md and user's explicit complete-flow follow-up.

## Global constraints
- Work only in android worktree; preserve frontend reference and unrelated main changes.
- Use UI entry points for all accepted flow steps; VM calls are not UI evidence.
- Do not clear app data, uninstall, expose secrets or send real AI requests.
- Test data names begin ADB-AUDIT-1025. Do not delete user records.
- Preserve Kotlin-native UI/algorithms, offline charting/records and configured AI networking.

## Review focus
- Date solar/lunar conversion, timezone and draft restoration must survive cancel/confirm and editing.
- Every displayed selector must actually update the board/matrix and selected state.
- Saved/reopened/edited records must retain original inputs and avoid duplicates.
- Manual/incomplete casting must never invent lines; all eight methods must be reachable.
- Long scrollable boards/tables/dialogs and horizontal tracks must remain usable at the actual phone density.

## Tasks
- [x] Record physical device baseline and partial mobile-web Bazi baseline; stop browser comparison after user scope clarification.
- [x] Bazi: UI name/gender/date/calendar/rules → submit → matrix/diagram/luck selectors → save → history/reopen/edit.
- [x] Ziwei: UI name/gender/date → submit → palace/highlight/details and decadal timeline → save/reopen/edit.
- [x] Liuyao: UI question/time, incomplete/complete manual casting → result/table/copy/raw parameters → save/reopen/edit. Eight submission gates and additional casting algorithms have JVM coverage.
- [x] Qimen: UI question/time/zone/now → board/list/palace/rules → save/reopen/edit.
- [x] Fix selected source-audit issues and physical-device findings; repeat affected primary flows without pursuing exact parity.
- [x] Run full appropriate tests/build/lint, review final diff, update phone via install -r, preserve data and commit to android.
- [x] Save a per-step comparison ledger with actual versus code-only checks and explicit remaining differences.
