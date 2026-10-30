# Played-volume leaderboard validation

Worker checks on 2026-10-30. This is a record of local evidence, not independent certification.

## Scope and accounting

The existing Leaderboard and wheel Top 5 now count only played stakes. The v2 game remains `0xe33ab493249a2df0d8c4a71ac54f46d1f7778367` on Ethereum. The historical pinned deployment input describes v1; the task's explicit v2 address matches the existing frontend handoff, which was preserved. No contract, ABI file, transaction, fee, wallet connector, RPC list, build configuration, dependency manifest, lockfile or ignore file was changed.

| Input | Counted volume / bets / hours | Pending volume |
| --- | --- | --- |
| BinaryBet: Settled, no matching market void, no timeout | Full event amount, one bet, its distinct window | None |
| BinaryBet: matching MarketVoided, or window TimedOut | None | None |
| TicketBought: Settled, no timeout | 5 IMD, one bet and EXACT ticket, its distinct window | None |
| TicketBought: TimedOut | None | None |
| Unsettled eligible binary bet / ticket | None | Full stake / 5 IMD |

A void is keyed by both window and market. It does not affect the other market or EXACT. Timeout takes precedence even if a settlement is also present. Later events can reclassify earlier window aggregates regardless of event order, chunk boundaries or reloads. Counted USD uses only counted IMD. Ranking stays exact bigint with deterministic address ties.

The team wallet supplied by the task is removed before ranking. It has a separate muted row below pagination, including for fully refunded history. It never receives a trophy, preview slot or pinned ranked position. Pending-only non-team wallets follow the top 50 ranked wallets in the existing ten-row pagination, without a rank; this makes every pending wallet inspectable without including it in the ranking. The connected non-team wallet still has a pinned position. An empty counted ranking shows the requested copy and wheel link even when pending or team rows exist.

The old `v1-ticket-5-imd` cache is deliberately ignored. The new version retains per-window status and per-wallet/market aggregates, with the same storage fallback, validated chunk commits, block hashes/reorg recovery, endpoint fallback, 2,000-block chunks, 60-second active-tab refresh, 15-second failed-scan retry and visibility/abort behavior. No timer was waited out in real time to test settlement: Playwright advances its controlled clock.

## Checks performed

Dependencies were installed only in a disposable project under `/tmp`, using the unchanged source manifest and lockfile. Its built `dist/` was copied back in full. No dependency or cache directory is part of the submission. Test fixture addresses, wallet methods and service responses live only in tests. Production contains no seeded bets or wallets.

| Check | Command / method | Actual result |
| --- | --- | --- |
| Install | `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` in disposable `web/` | Passed; protected manifest and lock unchanged |
| Production build | `npm run build` | Passed: TypeScript, Vite and ABI/export inventory verification |
| Separate typecheck | `npm run typecheck` | Passed |
| Unit/worker tests | `npm test` | 54 passed, 0 failed, including 18 leaderboard cases |
| Production browser regression | `node tests/browser.mjs` | Final run: 27 passed, 0 failed, no page script errors or missing local resources; includes all nine leaderboard scenarios |
| Accessibility | Axe selected WCAG A/AA rules in the browser suite | 16 leaderboard audits and 14 existing app audits; zero violations |
| Export verification | `npm run verify`; SHA-256 inventory checked against repository `dist/` | Passed; 25 inventoried assets plus deployment manifest, 1,309,918 bytes including the manifest |
| Official design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Completed, 14/16 passed; two preserved-design exceptions assessed below |
| Assigned browser tool | Real export over HTTP, 390×844, live public RPCs; screenshots, accessibility snapshot, link activation and computed styles | Completed mainnet scan and empty-to-wheel navigation; primary action visible; service failures below |
| Source/file integrity | `git diff --check`; protected-file comparison to HEAD; asset hashes and submodule scan | Passed; no protected edits or submodules |

Browser scripts use `IMD_PLAYWRIGHT=/path/to/playwright/index.mjs` and `PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers`, both installed outside this repository. The browser script creates and closes its own preview under `/preview/`; direct hash navigation and relative assets are exercised there. App and test-library versions come from the unchanged project lock; Playwright is installed separately for browser validation. The pinned probe's code is unchanged.

The leaderboard interaction scenarios cover the existing preview, forward-verified ENS, copying, explorer links, top-five styles, top-50 pagination and rank beyond 50, loading/progress/pause, failure/manual retry, automatic retries, complete cached totals during failures, incremental refresh, inactive-tab cancellation, pending-only wallets, independent void/timeout filtering, team exclusion even when connected, refunded team history, pending labels in preview, and pending-to-counted transition after reload. Long ENS, maximum uint128-sized counted and pending amounts, both themes and 320/390/800/1440 layouts are exercised. New arithmetic tests also cover malformed/corrupt caches, obsolete cache versions, duplicate logs, cancellation, RPC/range errors, partial history, reorgs, late voids/timeouts and the five event definitions against the actual v2 ABI.

## Live observation and service limits

The assigned browser loaded the finished export without RPC/wallet fixtures and completed blocks **26,229,405–26,306,529** (77,125 blocks). Its persisted boundary hash was `0x4f87bf23661b07dcd7c17ba55fbc733380bc116a5d0b4bd63e01bafb65582b97`. The checkpoint contained 10 bets across 8 windows, one settled window and two timed-out windows. All-wallet totals were **0 counted IMD, 8 pending IMD and 5 refunded IMD**. The team had three historical bets and appeared only in its muted zero row. The full board displayed two pending-only wallets and the required empty state. These are dated observations, not production fixtures or a promise about later blocks.

The existing public worker rejected local-origin CORS requests for `/status`, `/rounds` and `/stats7`. Some public RPCs returned HTTP 400/403 or CORS errors. The leaderboard's existing fallback completed despite those failures; no provider or off-chain integration was changed. The probe found no missing local assets or page script errors. Controlled tests separately isolate behavior from external availability. No real signature, transaction, production chat post, passkey creation or publication occurred.

## Better Interface review

The pinned workflow and core principles in all six domains were read and applied. The implementation retains the cozy pixel design and existing component structure. The two neutral colors are limited to the requested pending/team states. The existing combined Better Interface / Impeccable license matches the pinned license byte for byte.

| Domain | Coverage and evidence | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility | Native table headers/captions, row headings, named wallet/copy links, labelled pagination and stable scan status. Pending and team status have explicit words as well as color. Existing keyboard/reduced-motion paths exercised. Sixteen targeted day/night Axe audits of the leaderboard report no selected A/AA violations. | No screen-reader session, forced-colors test or physical-device test; an Axe pass is not accessibility certification. |
| Layout | Existing 680px table-to-grid breakpoint retained. Checked 320/390/800/1440 with counted, pending and team rows, including long names/amounts. No horizontal page/table overflow. Screenshots inspected. Live 390×844 home has Connect to bet at y=728–772, above the 780px scroll-area boundary. | No native 200% browser zoom or physical phone. English-only surface; no RTL/localization change was requested. |
| Writing | Exact requested explanation and empty copy, Counted volume/Counted bets labels, clear pending/team words, contextual no-counted-bets state for the connected wallet, existing recovery links. | The requested hamster emoji and existing EXACT market name intentionally remain. |
| Typography | Existing Geist and Silkscreen fonts and size scale retained. Browser confirmed local font loading. Pending uses 12px text / 18px line height; large values wrap, with tabular numbers. Counted amount emphasis stays intact. | No cross-OS font-rendering comparison. |
| Colors | Browser-measured pending foreground/card pairs: day `rgb(111,107,102)` / `rgb(255,251,244)` = **5.13:1**; night `rgb(189,183,199)` / `rgb(41,35,61)` = **7.68:1**. Team uses the same neutral token. Existing rank highlights are unchanged. | Ratios describe solid computed pairs, excluding decorative film grain and gradients. Trophy artwork is not claimed as a measured text pair. |
| UI | Checked loading, empty, cached, retrying, counted, pending, team, connected and paginated states. No new animation, card system or icon. Automatic settlement updates both full board and shared preview data. | No slowed animation-panel inspection or new modal/form to review. |

### Findings, fixes and rechecks

| Severity / source | Finding and impact | Fix / evidence |
| --- | --- | --- |
| High · `web/src/leaderboard.ts:108` | Previous wallet-only totals counted unsettled/refunded stakes and lacked the window/market data needed for later reclassification. | Retain window aggregates; derive counted/pending totals from settlement, void and timeout flags. Unit tests and production scenarios cover cross-chunk/reload transitions and refund precedence. |
| High · `web/src/useLeaderboard.ts:40` | Existing unfiltered localStorage totals could otherwise be displayed after the rule change. | Version the schema/rule key; old cache tests prove a fresh scan. Polling/retry code is unchanged. |
| High · `web/src/leaderboard.ts:138`, `web/src/Leaderboard.tsx:339` | Team stakes could occupy ranked/top-five/pinned slots. | Exclude before assigning rank; render a separate muted row. Test with team stake larger than every player, connected team, and refunded team history. |
| Medium · `web/src/Leaderboard.tsx:115` | A wallet waiting for settlement needed its stake visible without inflating volume, USD, bets or hours. | Conditional grey pending sub-label; unranked pending-only rows. Rendered tests verify label removal after settlement, both themes and long values. |
| Medium · `web/src/Leaderboard.tsx:225` | Previous empty and method copy described unfiltered volume. | Insert the task's exact text and preserve the wheel link. Tested on a genuinely empty scan and an empty counted ranking with pending/team stakes. |
| Test reliability · `web/tests/browser.mjs` | Cached rows can render before refresh scheduling; RPC retry text appears during fallback; reward placeholder queries resolve separately. Immediate assertions/clicks raced those states. | Await the completed cached scan and both reward placeholders; keep simulated RPC failures active until Retry now has been clicked. Close failed test contexts to isolate fixtures. No production timing or reward code changed. |

### Probe exceptions

The probe passes render, layout, targets, contrast, casing, tracking, type sizes/families, glyphs, slogans, repetition, copy budget, motion and share metadata. Screenshots confirm its two flags concern unchanged existing design:

- **Eyebrows:** `web/src/App.tsx:293` places the active The wheel navigation pill above the hero. It is navigation. The instruction “Keep the design, layout” takes precedence over treating it as a new eyebrow.
- **Chrome:** `web/src/styles.css:698` retains the existing pixel buttons' border plus offset shadow; the existing amount input is within the betting card. The same preservation instruction takes precedence. No new nested card, shadow or decorative layer was added for this change.

The first 390 screen shows the product, choices, amount and primary action. Metadata has a title, local favicon, description, og:title and local og:image; the probe passed all five. No applicable new high/medium design finding remains.

## Evidence

Actual screenshots in `docs/frontend/played-volume/`:

- [390 leaderboard](played-volume/leaderboard-390.png), [1440 leaderboard](played-volume/leaderboard-1440.png), [390 night](played-volume/leaderboard-390-night.png), [empty counted ranking](played-volume/empty-390.png): controlled RPC/wallet fixtures, not live activity.
- [390 live leaderboard](played-volume/leaderboard-390-live.png), [390 live home](played-volume/wheel-390-live.png): actual public-service reads, including unavailable telemetry.

The probe outputs and raw interaction screenshots remain in disposable scratch paths; concise results are retained in [checks.json](played-volume/checks.json). `DESIGN.md` describes the final tokens, typography, components and responsive behavior; README documents installation, preview, rebuilding and accounting.

## Browser limitations

WebKit was installed outside the repository and a real launch was attempted with `HH_BROWSER=webkit HH_TEST="leaderboard navigation" node tests/browser.mjs`. It returned `browserType.launch: Host system is missing dependencies to run browsers`, including `libgtk-4.so.1` and GStreamer libraries. Safari/WebKit remains unverified. Chromium initially hit a temporary thread/resource limit; the final sequential run completed all 27 scenarios. Native zoom, screen-reader operation, physical wallet apps, passkeys and real signing remain untested. These limitations do not change the recorded Chromium results.

## Completion and package budget

Complete for the stated scope. The production build and separate typecheck pass; all 54 unit tests and 27 production Chromium scenarios pass after repairing the test synchronization races described above. The copied repository source and export were byte-compared against the tested temporary build. The static export retains the required agent discovery index/archive and all runtime assets. Obsolete hashed JavaScript/CSS files from the prior export were replaced; no dependencies, caches, registry mirrors, source maps or unnecessary archives were added. No ignore file was edited.

The conservative sum of entire added/modified files, including screenshots and rebuilt bundles, is below **2.8 MiB** against the **8 MiB** submission limit. The website export itself is **1,309,918 bytes**. Final source/file integrity checks remain worker evidence rather than independent certification.
