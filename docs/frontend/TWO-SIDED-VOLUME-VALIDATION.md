# Two-sided leaderboard counting validation

## Scope and result

The leaderboard and the wheel's Top 5 preview now classify binary stakes from `BinaryBet.side` and `amount`, independently of `MarketVoided`. Each window/market must have positive total stake on both sides. Eligible binary stakes count only after settlement, with timeout taking precedence. Unsettled two-sided binary stakes and unsettled EXACT tickets can be pending; one-sided and timed-out stakes appear in neither total. EXACT settlement behavior, the team exclusion, address-based tie ordering, layout, refresh cadence and recovery logic are preserved.

Only frontend counting, its explanatory copy, regression fixtures/tests, documentation and the generated static export changed. Contract source, ABI exports, keeper/worker implementation, wallet flows, dependency manifests/lockfiles and build configuration were preserved. Dependencies and browser downloads were installed outside the repository; no ignore files changed. The existing source manifest and lockfile remain part of the repository delivery. Nothing was deployed, signed, committed or pushed by this task.

## Live-chain evidence

A read-only scan of Ethereum from deployment block **26,229,405** through **26,314,829**, observed **2026-10-31T19:27:15.671Z**, decoded 30 relevant events for the existing v2 runtime address. Public source: `https://ethereum-rpc.publicnode.com`. Actual chain results are saved in [chain-checks.json](two-sided-volume/chain-checks.json); the captured public logs are in [the offline regression fixture](../../web/tests/fixtures/leaderboard-26314829.json).

| Wallet | Counted IMD | Window | Kind |
| --- | ---: | --- | --- |
| `0x2300878c6e8fc1706cabdf86f3d70f909bf572f1` | 5 | 429 | EXACT |
| `0xc6579c593b34916fcc7f3f2750e8b56749bf0808` | 5 | 440 | Binary |
| `0xdc8a2958f8b8a07a9609d6f4cb4d35f3b5856c26` | 4 | 440 | Binary |

The original ascending lowercase-address tiebreak orders the two 5 IMD wallets. The team has 2 counted IMD in window 178, shown separately without a rank. No wallet has pending eligible volume at this snapshot.

`0xa1c19314851e7abf72b3c124476b1c7a3be2217a` has 7.374185066434527746 IMD on `side=true` in market 1 of settled window 429 and no opposing stake there. Its block-pinned `claimable(429, wallet)` returned **7374185066434527746 wei IMD**, its full stake. The wallet is absent from both ranked and pending results. The production browser regression replays these captured logs through the real scanner, checks all three amounts and ticket counts, reloads the cache, and checks the home preview. No fixture is bundled into the production app.

A separate browser-tool session also completed a real public-RPC scan through block **26,314,842** and displayed the same three wallets and separate team row. That session exposed external service failures described below; it is not represented as an error-free service check.

## Implementation and regression coverage

- `web/src/leaderboard.ts:15`: binary events retain a required boolean side; ticket stakes use a null side. Aggregates are keyed by wallet, market and side within each window.
- `web/src/leaderboard.ts:111`: market side totals include every bettor, including the unranked team. Refund eligibility is checked before creating a wallet total, so fully refunded wallets disappear rather than producing pending/zero rows. Counts, distinct played hours and USD totals include only counted volume.
- `web/src/leaderboard.ts:268`: decoding retains `side`; cache save/load preserves it and rejects missing/malformed sides. Copy-on-write window/stake aggregation preserves earlier checkpoints.
- `web/src/leaderboard-config.ts:11`: `v3-two-sided-ticket-5-imd` ignores old no-side caches and forces one complete historical rebuild. The scanner requests four events; `MarketVoided` is removed from this read-only filter, with no ABI file changes.
- The unit suite covers both one-sided directions without a void event, zero opposing amounts, cross-window/cross-market isolation, multiple stakes on one side, a wallet taking both sides, timeout precedence, EXACT independence, team counterparties, unordered events, chunk boundaries, duplicate logs, reorgs, interruption, corrupt caches and migration. It also replays the actual chain fixture.
- Production-browser scenarios cover the recorded regression; preview/table navigation; copy and ENS; top-50 pagination and a connected rank beyond 50; loading, empty, retry and saved states; minute refresh, tab inactivity and reload; huge values and long ENS names; team exclusion; one-sided pending becoming eligible after an opposing event; settlement without recounting; day/night reflow and keyboard access.

## Commands and actual results

All npm commands ran in an isolated copy of `web/`, installed with the repository's unchanged manifest/lockfile. Only the complete production `dist/` was copied back; the bundled worker was not rebuilt. Browser tests serve that production export under `/preview/`, and close their own preview and Chromium sessions.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` | Exit 0; 58 packages installed outside the repository |
| Independent typecheck | `npm run typecheck` | Exit 0 |
| Unit regressions | `npm test` | Exit 0; 58/58 tests passed |
| Production build | `npm run build` | Exit 0; TypeScript + Vite + ABI/inventory verification |
| Export integrity | `npm run verify` | Exit 0; 25 inventoried assets, 1,336,821 asset bytes, excluding manifest |
| Production interactions | `node tests/browser.mjs` with Playwright/Chromium configured | Exit 0; 34/34 scenarios passed, including 11 leaderboard scenarios; no page script errors or missing local resources. [Results](two-sided-volume/interactions.json) |
| WebKit attempt | `HH_BROWSER=webkit HH_TEST='leaderboard navigation' node tests/browser.mjs` | Exit 1 before page creation: required host libraries missing, including GTK/GStreamer; no WebKit behavior claimed |
| Pinned design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Ran successfully; 14/16 checks passed, exceptions reviewed below |
| Formatting/scope | `prettier --write` on the five changed TS/TSX/test files; `git diff --check` | Source formatting applied; whitespace check passed |

The first browser pass exposed a fixture assertion that assumed only one pending label existed after adding a counterparty. It was narrowed to the intended wallet. A broader pass exposed two existing timing assumptions: auto-reconnection could replace Connect during the helper's click, and a queued hash-focus animation frame could reset focus just after Tab. Test setup now accepts only the completed connected state and flushes the anchor-focus frame before exercising the next Tab. These fixes change test synchronization, not wallet or docs product behavior. The initial broader run passed 32/34; after those setup fixes, the final complete run passed 34/34. The final result JSON records the last run.

## Better Interface review

The pinned Better Interface workflow and all six core domains were applied to the changed table, preview and shared states, with the existing cozy pixel system retained. Source values are documented in root [DESIGN.md](../../DESIGN.md). The visual idea remains a warm, compact betting interface with an original pixel hamster and readable betting data.

| Domain | Coverage and evidence | Findings / limitations |
| --- | --- | --- |
| Accessibility | Checked: native table headings and row headers, named address copy buttons, status/progress announcements, pagination state, keyboard navigation and focus, reduced motion. Production axe audits cover leaderboard states at 320/390/800/1440 in day/night. | No automated violations in the 16 final targeted audits ([results](two-sided-volume/accessibility.json)). Screen-reader sessions, native devices, forced-colors and native zoom were not performed. |
| Layout | Checked: unchanged single-card table, pending/team variants, home preview, long ENS and huge values at 320/390/800/1440 in both themes. The pinned probe reports no page overflow, text overlap, covering control or hidden text. | The 390 first screen was inspected: hamster frame, choices, amount and Connect to bet are visible above the utility area. No layout changes were needed. RTL/localization were outside this counting fix; broader docs checks are recorded as actually run. |
| Writing | Checked: counting explanation and empty state against the rule; action labels and retry/empty recovery. | Fixed `web/src/Leaderboard.tsx:227` and `:469`: “both sides of the hour” was ambiguous, omitted settlement and misdescribed EXACT. The final copy says same market, settlement, excluded refunds and separate pending. |
| Typography | Checked: existing Geist/Silkscreen roles, six-token scale, wrapping and tabular amounts; probe reports two families, three weights and passing size/tracking checks. | No typography token changes. Huge amounts and long ENS names remain complete and wrapped. No platform-specific font rasterization claim. |
| Colors | Checked: existing day/night semantic tokens; final targeted axe audits and probe's resolved solid-background text checks. | No color changes or new status colors. Numerical contrast on grain, gradient and image pixels was not independently measured; solid-background automated results are not a claim about every pixel. |
| UI | Checked: shared table/preview data, trophies only on counted ranks, team/pending labels, visible empty/loading/retry states, copy feedback and reduced-motion behavior. | No new motion/surfaces. Slowed animation-panel review was not performed. The existing pixel button treatment is preserved. |

### Findings, fixes and probe interpretation

1. **High, consequential data error — fixed:** `web/src/leaderboard.ts:111`. The former lazy-void rule counted one-sided settled refunds. Reproduced with the real 7.374185066434527746 IMD stake; per-market side totals now exclude it. Unit replay, production browser replay, reload and live-chain scan confirm the correction.
2. **High, stale cached results — fixed:** `web/src/leaderboard-config.ts:11` and `web/src/leaderboard.ts:398`. Old checkpoints contain no side data and cannot be safely migrated by guessing. The new version performs a real rescan; missing/malformed-side caches are rejected. Cache migration and incremental counterparty/settlement regressions pass.
3. **Medium, ambiguous counting copy — fixed:** `web/src/Leaderboard.tsx:227` and `:469`. Empty and persistent explanations now name the market and settlement conditions; no new explanatory card or style was added.
4. **Probe `eyebrows`, reviewed exception:** `web/src/App.tsx` main navigation renders the active “The wheel” pill above the mobile title. It is the existing navigation link, not an eyebrow label. The 390 screenshot confirms the navigation remains usable; removing it would change established navigation outside the counting task.
5. **Probe `chrome`, reviewed exception:** `web/src/styles.css` uses the existing pixel button borders/downward shadows; the amount field is an actual input within the bet card. These are established controls, not extra decorative cards. Kept to preserve the requested existing design. No repeated first-screen defect was introduced by the counting fix.

The probe's other 14 checks pass: render, layout, targets, contrast, casing, tracking, type sizes, families/weights, glyphs, slogans, repetition, first-screen copy budget, motion and share metadata. It reports 19 controls below the comfortable 44px size, while all measured targets pass its 24px-or-spacing minimum. Metadata includes a title, description, favicon, `og:title` and local `og:image`; asset URLs use the existing relative Vite base. The [probe JSON](two-sided-volume/taste.json), [390px wheel screenshot](two-sided-volume/home-390.png) and [390px recorded-chain table screenshot](two-sided-volume/leaderboard-390.png) are delivered. The table screenshot uses the explicit browser price fixture; its USD estimates are not a live price record. Exhaustive transient screenshots remain in scratch and are not part of the bundle.

## Remaining limitations

Live browser telemetry calls to the existing worker returned CORS failures for the local preview origin; some public RPCs returned CORS/403/400 responses and recovered via existing fallback. The leaderboard eventually completed and showed the expected table. These external service failures are separate from script/local-asset errors in controlled production tests. Contract settlement continues to be authoritative; missing telemetry remains unknown. No worker, RPC configuration or wallet infrastructure was changed for this counting task.

WebKit could not launch on this host. Real signatures, spending, claims, production chat posts, physical devices, assistive-technology sessions and native 200% zoom were not tested. Wallet, transaction and service interaction checks use explicit controlled fixtures; the live scan and `claimable()` check were read-only. Current live data can change after the recorded block and cache boundaries retain the existing reorg checks.

Complete for the stated frontend counting scope, with the platform/service limitations above. These are worker-recorded results, not independent verifier certification.
