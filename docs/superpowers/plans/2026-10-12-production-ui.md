# Production UI Integration Plan

**Goal:** Apply the approved Vue draft to the real uni-app pages and verify existing chart, AI and account-history features with isolated simulated API data.

**Approved design:** `frontend-docker/ui-draft/src`; user approved integration on 2026-10-12. Keep cyan/blue/green, amber and lake gradients, never purple. Preserve task-first home, desktop sidebar, mobile bottom navigation and separate casting/birth time.

**Architecture:** Keep existing uni-app routes, Pinia stores, chart engines, services, auth and streaming. Replace presentation in place. Shared `PageScaffold` owns navigation and theme. Do not route production pages through the draft context or demo data. Mock API runs in a separate local development process and origin; production code still calls the original endpoints.

**Shared style contract:** Shell supplies `--x-bg`, `--x-paper`, `--x-ink`, `--x-body`, `--x-muted`, `--x-line`, `--x-accent`, `--x-accent-end`, `--x-tint`, `--x-gradient`, `--x-gradient-soft`, `--x-serif`, `--x-sans`. Each page keeps unique local styles. `PageScaffold` title/subtitle/tag/header-extra/footer contract remains compatible.

## Tasks and ownership

- [ ] Shell, home/Agent, chart chat and theme: root. Files `components/layout/*`, new `components/shell/*`, `styles/workbench.css`, `features/workbench/*`, `pages/agent/*`, `components/agent/*`, `pages/chat/*`, `chat/*`, `App.vue` and required build configuration only.
- [ ] Chart input pages: forms worker. `pages/index/index.nvue`, `pages/ziwei/index.nvue`, `pages/liuyao/index.nvue`, `components/liuyao/{LiuyaoBasicInfo,TimeInput,MethodCard,YaoSelector,ParamPreview}.vue`, `features/liuyao/useLiuyaoForm.ts` and narrowly related tests. Preserve all eight casting methods, lunar/calendar controls and original chart-store execution.
- [ ] Results and account history: results worker. `pages/index/detail.nvue`, `pages/ziwei/result.nvue`, its local result components, `pages/liuyao/result.nvue`, `pages/history/list.nvue`. Preserve save/update/delete, pagination, sort/filter/search, export/copy, chart focus and timeline, edit and AI context.
- [ ] Simulation harness: simulation worker. Only new files under `frontend-docker/scripts/ui-simulation/`, simulation tests and test documentation. Build fixture server for original APIs with success/loading/empty/error/quota/auth states. Do not change production services/auth/store/algorithms.
- [ ] Root integrates, runs existing regression tests + H5 build/typecheck, then browser-tests all user-visible feature groups on desktop/mobile and saves evidence/report.

## Verification contract

Run existing tests before/after. Add meaningful behavior tests before changing casting time or other non-visual behavior; do not add source-mirroring style tests. Browser verification must inspect real rendered states and response effects, not infer them from build success. Test real local chart engines with representative inputs; API/AI responses are simulated and must remain labeled as such. Exercise normal/empty/loading/error, login/quota, records CRUD, result tools, all casting methods and desktop/mobile layouts. Document any native-platform or live-model functionality not exercised. No deployment or external messages.

## Execution decision

Continue the already authorized in-workspace implementation. The approved draft and package-script additions are uncommitted here; preserve them. The independent file domains above may be worked concurrently per dispatching-parallel-agents, with shared browser use reserved to root. User approval of this concrete design and integration request is already given; no additional confirmation gate.
