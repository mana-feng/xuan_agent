# Native Android code review — 2026-10-25

## Scope and evidence

Reviewed the uncommitted native implementation in branch `android`, based on `frontend@6b5a379c947acf3824def77a14dd26cdbbc2fdde`, using `.local-dev/android/review-package.diff`, the actual Kotlin sources, the design/specification, implementation plan and progress rulings. This is a static code review, not an Android runtime acceptance result. No implementation, index, branch or commits were changed by this reviewer; this report is the sole permitted write.

Read the core tests for calendar/Bazi/BaziDetails/Liuyao/Qimen/Ziwei, app codec/protocol/Agent tests, and the Android smoke runner. Existing reported baseline results (19 core tests, 15 app JVM tests, and four new BaziDetails tests) were not rerun. The tests provide useful frozen-reference comparison evidence, but the app JVM suite does not exercise ChartViewModel, Compose lifecycle, actual SQLite CursorWindow behavior, or network cancellation/persistence races. The smoke runner checks small valid archives and prevalidation rejection, not the large-row and completion-write failure cases below.

SQLiteOpenHelper, HTTPS-only custom endpoints, and unsupported browser-archive migration are accepted explicit rulings. No unresolved core calendar mismatch was identified against the fixed civil-time/reference contract: strict dates and DST rejection are present; Bazi/Liuyao use civil clock rules, Ziwei advances the full date at 23:00, and Qimen converts the instant to fixed UTC+08:00.

## Strengths

- Offline calculation code and resources are separated from Android/network code; static reference fixtures are not used as runtime chart snapshots.
- Chart calculations capture a ChartInput snapshot before background work; subsequent edits do not mutate an already calculated SavedChart.
- Import validation precedes an SQLite transaction, and exceptions inside insertion roll back that transaction.
- API calls disable automatic connection retries and redirects; cancellation reaches the OkHttp Call; HTTP errors avoid exposing service response bodies.
- API keys are encrypted with Android Keystore and are absent from the archive model. Agent suggestions require a user click and a bounded, typed, strict parser.

## Critical

None identified.

## Important — fix before completion

### R1 / P1 — Enforce a readable serialized row budget before writing SQLite

Location: [BackupCodec.kt:32](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/BackupCodec.kt:32), lines 32–39; [LocalStore.kt:16](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/LocalStore.kt:16), lines 16–17 and 26–34.

The validator caps the whole archive at 8 MiB but allows a single chart/conversation payload to consume most of that space. Each database read projects the complete JSON payload into an Android CursorWindow. On supported devices with the usual approximately 2 MiB window, a larger row cannot be read even though SQLite accepted its insertion.

Reproduction: create a version-1 archive with no charts and one conversation containing 30 alternating user/assistant messages, each with 100,000 ASCII characters. The archive is approximately 3 MB, every individual content length is allowed, and 30 is below the 2,000-message limit. Import commits the row; the subsequent `reload()` fails when `conversations()` tries to fill its cursor. After restart, initialization's combined charts/conversations reload still fails, and export also fails. There is no UI route to select/delete the offending conversation because the list cannot load. Normal accumulated conversation history can reach the same condition without importing a file, since `saveConversation` has no serialized-size guard.

This is persistent loss of access to local history, not a rejected invalid import. Bound serialized UTF-8 payloads conservatively before every local/imported write, or store messages/large fields in separately readable rows. Validate incoming rows before the transaction. Add a device test that imports an over-budget row, verifies rejection without changes, closes/reopens storage, and proves existing charts/chats remain readable. The precise device window threshold is platform-dependent; the defect is the absence of any compatible per-row storage contract. This review did not execute that device reproduction.

### R2 / P2 — Make every successful export compatible with the importer

Location: [BackupCodec.kt:10](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/BackupCodec.kt:10), lines 10–12 and 37–39; [ChartViewModel.kt:117](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/ChartViewModel.kt:117), lines 117–126; [AiClient.kt:24](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/AiClient.kt:24).

`encode` validates counts/fields but never checks the encoded byte size, while both `decode` and the UI importer reject anything above 8 MiB. Export always includes all records and offers no selection or splitting. Consequently a success notice can describe a backup that this same application cannot restore. Separately, a normal accepted AI reply may exceed the archive's 100,000-character message limit: AiClient accepts up to 2 MiB of response JSON and persistence accepts the resulting message without the backup limit. One such message makes *all* backup export fail.

Reproductions: (a) save 100 separate small conversations, each containing a 90,000-character ASCII message; their individual rows and fields fit current limits, export succeeds with approximately 9 MB, and importing that exact exported file fails. (b) a compatible endpoint returns one otherwise valid OpenAI reply with 100,001 ASCII characters and `finish_reason: stop`; it is accepted and saved, but exporting the archive then fails validation. Both follow directly from unequal size predicates; no real API request is required to cover them.

Define consistent limits across creation, persistence and archive handling. Provide a recoverable export strategy such as bounded selectable/split archives, or compatible streaming import with an appropriate total budget. Do not silently truncate existing user data. A successful export must round-trip through the actual importer; merely rejecting oversized exports leaves the user's existing larger archive without a backup route. Add focused boundary tests for total UTF-8 bytes and accepted assistant message sizes.

### R3 / P2 — Keep input mode, casting inputs and chat drafts outside transient lazy items

Location: [AppUi.kt:121](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/AppUi.kt:121), lines 121–126 and 173–178; [ChartViewModel.kt:39](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/ChartViewModel.kt:39), lines 39–64 and 75.

The civil date lives in ChartViewModel, but the lunar/leap mode, six-line casting method/numbers/manual lines and unsent chat draft live only in `rememberSaveable` inside conditional, position-keyed LazyColumn items. They are not part of application/form state. Compose 1.6.1's inspected `LazySaveableStateHolder` explicitly removes no-longer-composed item state during `performSave`, so `rememberSaveable` in these lazy items does not establish cross-page lifecycle persistence.

Reproduction: enter lunar `2023-02-16`, select leap month, then navigate to settings/records, rotate the device (or cause Activity saved-state capture), and return to the chart input. ChartInput's raw civil string remains in the ViewModel, while removed form mode is reconstructed as Gregorian/non-leap; pressing calculate can now calculate a different date. The same sequence loses manual/numeric casting choices or an unsent AI question. Also, when replaying a saved six-line chart, `openRecord` restores only ChartInput; the saved schema retains resulting lines but not the casting method/original numeric values, so returning to input cannot restore the original casting request.

Hoist the complete typed draft (including calendar mode and casting parameters) and per-conversation chat drafts into retained application state. Persist the original casting inputs with the SavedChart and restore them deliberately when opening a record. Keep input mode and civil text as one coherent value rather than restoring them independently. Add lifecycle/navigation tests for lunar/leap input, manual six-line input, numeric casting, and unsent chat drafts. This finding is source/lifecycle reasoning; device interaction remains unexecuted. Do not generalize it to a claim that every simple tab switch necessarily loses state: lazy items can transiently retain their state in memory.

### R4 / P2 — Preserve a received AI reply even if its database save fails

Location: [ChartViewModel.kt:108](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/ChartViewModel.kt:108), lines 108–113.

After the HTTP request succeeds, the completed conversation exists only in a local variable. It is published to UI state only *after* `store.saveConversation(completed)` succeeds. A disk-full/I/O exception therefore discards an already received, potentially paid-for answer and leaves the visible conversation at the pending user message. Retrying sends the request again instead of retrying persistence. Cancellation while this write is finishing can also leave current chat state showing only the question even when the completed answer has already committed; `reload()` updates the conversation list but does not reconcile `state.chat`.

Reproduction: let the pending-question write succeed, return one valid model reply, then make the completion write throw SQLiteFullException. The error is shown, but the received answer cannot be viewed/copied/saved and the next attempt calls the endpoint again. For the cancellation variant, cancel between successful reply receipt and completion persistence/resumption.

Publish/retain the completed conversation before attempting persistence, track a visible unsaved state, and offer a storage-only retry. Make completion/cancellation reconciliation explicit so a committed response is not represented as unanswered. Test a failure on the second write and cancellation at that boundary, asserting that the answer remains available and the request count stays one. A database failure need not be common to make discarding a successful answer acceptable; it violates the requested safe save/retry behavior.

## Minor — separate from the blocking findings

### M1 — Named Ziwei charts cannot be found by name

Location: [ZiweiEngine.kt:158](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/core/src/main/kotlin/com/xuan/core/ZiweiEngine.kt:158) and [AppUi.kt:161](C:/Users/Administrator/.codex/worktrees/android-native/xuan_agent/android-app/app/src/main/kotlin/com/xuan/app/AppUi.kt:161).

Ziwei always returns a generic title and neither its result sections nor its displayed metadata include `input.title`. History search checks only result.title/civil/type, even though the form accepts a name and the search field promises name/remark search. Save a Ziwei chart named `Alice`, then search for `Alice`: it is absent. The original name survives in SavedChart.input, so this is a discoverability/display defect, not loss of stored data. Include the user label in the result/history and search `record.input.title` independently.

## Declined to judge

- Astronomical or traditional-school correctness beyond parity with the fixed frontend reference: scope explicitly uses that reference; no independent scientific validation was requested.
- True solar time, alternate schools, Ziwei timeline/transit interaction and automated fortune scoring: absent from the approved native scope and explicitly bounded in port documentation.
- Browser/legacy archive compatibility: explicitly ruled unsupported in the progress ledger; no silent acceptance was found.
- HTTP endpoints and cleartext exceptions: explicitly ruled unsupported; HTTPS-only is accepted.
- Room and hypothetical future database-version migration: SQLiteOpenHelper is an accepted ruling; version 1 introduces no existing native schema to migrate. A future version still requires a migration design.
- Real provider interoperability/fees, Android runtime cancellation, visual layout/accessibility on physical devices, and actual CursorWindow failure reproduction: not executed in this read-only review; parent owns emulator/device/network acceptance. Source-level defects above remain review findings, not runtime PASS claims.
- Exact parity of historical IANA timezone databases across Android versions: the implementation uses each platform's java.time rules; broad device-version timezone comparison was not performed.
- Generic first-run calendar initialization performance and very large UI-list rendering: no measured performance evidence, so no speculative performance finding is raised.
- Release signing, Play Store policy and production release readiness: the approved deliverable is a local debug side-load build.

## Verdict

**Not ready for completion/merge.** Address R1–R4 and run the corresponding focused regression checks. The fixed-reference core implementation and network/secret boundaries are well separated, but recovery and data-retention defects remain in ordinary Android lifecycle and storage-failure paths. Keep APK build evidence, offline device acceptance and real API acceptance as distinct statements.

## 审查问题处理（2026-10-25）

上文为独立审查在修复前的结论。实现者已按问题建立回归并完成修复；没有把原审查结论改写成独立复审通过。

- I1：真实 Android 上先复现 >2 MB 单行 chart/conversation 的 SQLiteBlobTooBigException，改为事务内分块读取后，同一数据、Unicode 尾部及关闭重开验证通过。
- I2：导出执行与导入相同的 8 MB/字段约束，超过上限明确失败；界面提供单盘/单对话导出；允许正常客户端接收范围内的长回复。超限导出先红后绿，15万字回复往返通过。
- I3：FormOptions、聊天与设置草稿迁入 ViewModel；计算快照保存原始历法、闰月、数字/手动参数；恢复时保留原输入，避免农历日期被当作公历。ChartDraft 两类重放回归先红后绿；实际旋转测试另见最终验收。
- I4：ChatDelivery 先将成功回复交给界面再尝试存储；失败保留回复并显示仅保存重试/导出入口，阻止切换丢失未保存回复。失败写入回归先红后绿；重试不经过 API 客户端。
- M1：命名结果在原生保存边界保留用户标题；历史搜索同时查输入备注；命名紫微回归先红后绿。

真实 API 和实体手机仍未执行。最终全套测试/静态检查/模拟器结果以 acceptance.md 为准。


## 0.2.0 网页交互修正的独立审查

只读审查基准 ea0f555 至当前修改。发现两项 P2：

1. 新建八字/紫微/奇门没有清除旧记录身份，可能覆盖上一人的档案。修正：只有显式修改保留 editingId，从导航开始新盘清除；所有表单提供新建动作。
2. 异步计算完成后可能把已切换模块的表单与旧结果混在一起。修正：输入、选项、导航、重置和打开记录更新计算代次，旧代次完成不发布。

独立复审已确认这两项修正，并检查了中断流式正文保留的路径；无新增 P1/P2。新增设备断言覆盖同编号更新、第二个人保留旧盘、独立模块草稿与途中切换计算。真实运行结果以 web-parity.md 的最终记录为准。
