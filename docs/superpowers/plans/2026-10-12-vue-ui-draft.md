# Vue UI Draft Implementation Plan

> **For agentic workers:** Execute in this session. Steps use checkbox syntax for tracking.

**Goal:** Replace the live HTML preview with the approved design running on the repository's Vue 3 / uni-app H5 toolchain.

**Architecture:** A separate `frontend-docker/ui-draft` uni-app input keeps the prototype independent of production bootstrap and APIs. Vue components and one reactive composable own navigation, forms, demo records and themes.

**Tech Stack:** Existing Vue 3.5.26, uni-app and Vite dependencies. No additional dependencies.

**Spec:** `docs/ui-draft/index.html` and the user's accepted refinements in this conversation.

## Constraints and review focus

- Preserve all three gradients without purple and preserve responsive layout.
- Keep current-time snapshot, manual override and restore-now separate from birth information; edit a saved record without changing its timestamp.
- Retain accessible native H5 controls, validation, keyboard navigation and safe text rendering.
- Demo data stays local; calculations and AI replies remain explicitly simulated.
- No business-page, API or authentication changes. This is a reversible prototype; validate through actual browser interactions and build rather than adding mirrored unit tests.

## Tasks

- [x] Create the isolated uni-app H5 entry, preview/build scripts and reusable Vue components.
- [x] Migrate existing markup and styles; replace DOM-string rendering with templates, computed values and bindings.
- [x] Build and type-check the draft. Verify desktop/mobile, gradients, all three forms, time independence, history, chat and keyboard controls in browser.
- [x] Open the runnable preview, capture a screenshot and document restart commands.

## Execution notes

User requested direct conversion of the already reviewed draft. Continue inline without a new approval gate. Existing dependency lockfiles match the installed sibling checkout; a local ignored junction reuses that installation, with Vite cache kept in this workspace.

Validation: H5 production build and configured `vue-tsc` passed. Browser checks covered all three form/result flows, solar/lunar/leap fields, custom casting time, empty-date validation, restore-now, record save/search/filter/sort/reopen/edit, keyboard result tabs, escaped chat text, theme persistence, dialog Escape, mobile menu and skip-link focus. Widths 320/390/834/1280 had no horizontal overflow. No new browser warnings/errors during the verified session. Existing Browserslist database age warning remains informational.

The optional `--noUnusedLocals` audit also reported string-based Vue template refs as unused; these refs are required and were verified in browser (focus, time validity, dialog and navigation). Removed the three genuinely unused destructured values; kept the normal project typecheck configuration.
