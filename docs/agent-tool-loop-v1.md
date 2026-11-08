# Agent Tool Loop v1 — architecture and acceptance

## Scope
The v1 implementation adds a validated text-based tool protocol, a bounded client-side tool loop, and versioned structured context snapshots. It reuses the existing production chart calculators and model proxy; it does **not** make claims of native provider tool calling, server-side agent isolation, or mathematical validation beyond existing chart tests.

## Execution contract
1. The user must be authenticated before initiating the request. The existing /api/llm/agent endpoint remains the sole model entry point; Chat and Agent use separately configured scopes and each model round counts toward account quota.
2. A model reply with no `<!--AGENT_ACTION:...-->` ends the turn.
3. A reply with exactly one directive is parsed and validated using the registry in `toolProtocol.ts`. Unknown tools, invalid dates, invalid IANA zones, and incomplete birth data do not execute.
4. The frontend performs the chosen calculation via the existing Pinia chart Store. It does **not** change the calculation algorithms.
5. Tool results are returned to the model as a tagged, untrusted JSON data message. The UI offers a separate result-navigation action rather than unmounting the Agent mid-loop.
6. Stop after at most 3 tool invocations (at most 4 model calls). Repeated identical invocations halt. Errors remain explicit and can be explained by a final model message.
7. Changes of account token between model or tool steps block subsequent calls.

## Tools

| ID | Action |
|---|---|
| get_chart_context | Read existing Bazi, Liuyao, Ziwei or Qimen chart state without recomputation |
| run_bazi_chart | Calculate chart with validated birth data |
| run_ziwei_chart | Calculate chart with validated birth data, optionally selecting a palace |
| run_liuyao_chart | Cast time-based six-line chart with explicit question |
| focus_ziwei_palace | Change focused palace on an existing Ziwei chart |
| navigate | Offer a user-confirmed route to the relevant page |

Direct Qimen calculation is intentionally not introduced until its input contract and time-zone semantics have a separately tested adapter.

## Structured context rules
- Every snapshot declares `version:1`, module, chart identity, calculation zone and rule version (where present), and only fields copied from the existing calculator.
- Bazi: four pillars, stems/branches, hidden stems, ten-god fields and five elements.
- Liuyao: original question, casting rule and moving-line data, with the existing detailed human-readable six-line export.
- Ziwei: chart fundamentals, 12 palace positions and major/minor stars, focus and view mode.
- Qimen: exact engine keys (`diPan`, `tianPan`, `jiuXing`, `baMen`, `baShen`, `anGan`, `juShu`, etc.), not invented `palaces` fields.
- Over 16,000 serialized characters: return a truncation signal; require a narrowed module instead of silently cutting or fabricating valid JSON.
- Treat all user-authored chart titles/questions as untrusted data, never instructions.

## Required acceptance
- Run `node --test tests/agent-tool-loop.test.cjs tests/agent-auth.test.cjs tests/agent-qimen-entry.test.cjs`.
- Run `npm test`, `npm run typecheck`, and `npm run build:h5` inside `frontend-docker`.
- Run `node --test tests/*.test.cjs` inside `backend-docker` after `npm ci`.
- Browser E2E: log in, create a Bazi chart through Agent, verify result text and chart, open result page, reopen Agent, read context; repeat for Liuyao and Ziwei.
- Test timezone: explicit Asia/Shanghai vs America/New_York, NY DST gap and duplicated 01:30 time; ambiguous input must fail rather than shift silently.
- Verify quota charges after a 2-step response and after an upstream error.
- Verify logout or account switch during a model request prevents subsequent tool execution.
- Verify 320px mobile UI and desktop for the long tool reply and navigation banner.
- Compare calculation snapshots with the independent existing algorithm fixtures. Do not interpret a structurally valid chart as proof of predictive validity.

## Subsequent iterations
- Provider adapters for native function calling (OpenAI, Anthropic, Gemini and Ollama), unified typed tool-result envelopes; no implicit feature detection.
- Persistent authenticated Agent conversation, cancellation, replayability and idempotency keys.
- Fine-grained context tools for individual Ziwei palaces and Qimen positions, to avoid context truncation.
- Server-side security policy and per-turn quota budget for all model rounds; do not trust browser-supplied tool results.
- End-to-end integration on actual backend + MySQL + at least one configured model, then mobile/native acceptance.

## Notes and limitations
The first patch is deliberately a client-side tool loop, not a remote privileged executor. Client code and prompts can be inspected. Any future administrative or write-capable tool must execute on the server with independent authorization and audit logging. The existence of the GitHub CI workflow does not imply that tests passed until the associated run is completed and reviewed.
