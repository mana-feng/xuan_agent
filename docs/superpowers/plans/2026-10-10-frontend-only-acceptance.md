# Frontend-only Acceptance and Repair Plan

> **For agentic workers:** Use systematic debugging and test-driven repair for assigned files; the primary agent integrates and verifies all results.

**Goal:** Independently inspect all frontend-only pages, repair confirmed defects with parallel agents, and add clearly separated results and per-issue current status to the existing HTML report.

**Architecture:** Keep frontend-only as a browser-local app with direct model calls. Its local records, settings and chat are independent of the MySQL-backed version. Preserve all earlier frontend-docker/backend-docker changes and report evidence.

**Tech Stack:** Vue, Pinia, uni-app H5, TypeScript, browser local storage, existing local Qwen3.8 at 127.0.0.1:11439.

**Spec:** The user's current request in this chat: fully inspect/test frontend-only, fix discovered issues with multiple agents, and independently identify results and repair status in HTML.

## Global Constraints
- Only change frontend-only and its new report evidence, plus local development helpers.
- Preserve user data. Use clearly synthetic test chart names and a separate origin on port 3050.
- Do not run pnpm auto-install or alter frontend-docker/backend-docker dependencies.
- Direct model tests use the already authorized local Qwen3.8 service; no third-party model credentials or cloud requests.
- Browser actions use the Chrome extension through cua_repl. No hidden browser-state mutation or test-only UI shortcuts.
- Keep earlier report sections and first-round history; add an independently labelled frontend-only section and ledger.

## Review Focus
- Switching chart types must preserve each chart's name, gender and date in display, history, export and chat.
- Local save/edit/reload must keep IDs and timestamps stable and must not lose unrelated records.
- AI failure, truncation and cancellation must not silently resend or claim a valid answer.
- Direct chat URL/reload and follow-up questions must retain selected chart context.
- Keyboard controls, 390px layouts, missing settings, malformed local data and navigation must remain usable.

## Tasks
- [x] Provision isolated installed dependencies, start on loopback port 3050, collect baseline build/type evidence and all 11 page routes.
- [x] Agent chart domain: reproduce cross-chart identity/edit/export problems in stores and chart pages, add behavior regression, fix only confirmed defects.
- [x] Agent AI domain: reproduce provider/config/protocol/chat-context problems, add behavior regressions, fix confirmed defects without adding a backend.
- [x] Agent persistence domain: reproduce local history/save/reload problems, add behavior regression, fix confirmed defects with stable IDs and no destructive cleanup.
- [x] Primary UI pass: visit all routes, use actual forms and controls, exercise settings/history/exports/charts/AI and mobile/keyboard behavior; record evidence before/after.
- [x] Integrate disjoint changes, run final frontend-only tests, typecheck, relevant lint and H5 production build using direct installed Node CLIs; independently review changed behavior.
- [x] Add frontend-only HTML section with scope, test ledger, issue status, screenshots, raw checks and explicit limitations; verify every local link and render in Chrome.
- [x] Leave the independent frontend-only service and report running, preserve the test tab and report tab for user operation.

No commit or deployment is requested. The user has already authorized execution and multi-agent repairs; continue without a separate plan approval.

Completion evidence: reports/frontend-test-2026-10-10/frontend-only/evidence/status.json; 105/105 tests, strict typecheck, H5 build and ESLint (0 errors/28 warnings). Chrome 11 routes and eight Liuyao mode samples exercised. Downloaded TOON contents and native external archive roundtrip remain explicitly unverified in report, not counted as passed.
