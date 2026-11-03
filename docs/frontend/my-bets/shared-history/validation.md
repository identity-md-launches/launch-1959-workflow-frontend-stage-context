# Shared My Bets / leaderboard history revision

## Scope and reproduction

Finding `5b9ea475a8f3ba25423093481841b6cbe91558a2321057b065cc287121b9ad57` reproduced on the original committed production export. The controlled Chromium fixture used 390×844, deployment block 26,229,405, head 26,239,407, the supplied hour-429 wallet/refund and an eligible two-sided hour 425. Its topic-filtered leaderboard scan completed, showing “Through block 26,239,407”. Holding the independent unfiltered `Game.useEvents` request left My Bets on “Finding your bets…”; Claim 7.37 IMD failed to appear within the regression's three-second wait. There were no page-script errors. [Original failing run](baseline.json).

The accepted site and design remain the baseline. This revision changes history ownership and its cache format, plus the necessary tests, rebuilt static assets and documentation. No contract, keeper, wallet, transaction, leaderboard eligibility, stylesheet, package manifest, lockfile or build configuration was edited.

## Implementation

- `web/src/leaderboard.ts:365`: `VolumeScanner` optionally retains raw logs from the full game ABI alongside its existing volume checkpoint. Its original four volume-event decoder, side totals, settlements, timeouts, team exclusion, ranking and inclusive 2,000-block scan boundaries remain intact. Claimed, one-sided/refunded bets, tickets and other game events are retained without contributing to eligible volume. Raw logs are validated, deduplicated and saved only with complete validated ranges. Cache resume and reorg reset apply to raw history and aggregates together.
- `web/src/leaderboard.ts:375`: the `:game-history-v1` suffix prevents an aggregate-only cache from masquerading as complete individual history. Such visitors perform one initial shared rescan; subsequent visits restore both datasets and read only newer blocks. Interrupted initial scans resume completed ranges without exposing partial history.
- `web/src/useLeaderboard.ts:51`: one React Query owns that scanner and publishes both the ranking snapshot and decoded raw events. The leaderboard retains its minute cadence; other game tabs keep their 20-second event cadence through this same incremental source. Shared-query errors recover on the existing 15-second schedule; transaction invalidation refreshes all consumers. Usable stale history survives a failed refresh.
- `web/src/App.tsx:189`: `leaderboard.events` is the sole history passed to My Bets and the existing event-based views. The separate `useEvents` / `loadEvents` scan and its cursor/cache were removed from `data.ts`.
- `web/src/data.ts:472`: existing case-insensitive wallet filtering, pending-history gate, per-hour block-pinned reads and the fixed 5,000-block wallet fallback remain. Pending shared history cannot trigger fallback; an errored shared query without usable history can. A successful empty history never triggers fallback. Each failed RPC attempt logs its method, exact URL, range and attempt; existing fallback/decode/contract-read diagnostics remain.

The revision leaves `position`, `windowInfo`, `claimable`, `lossOf`, `windowEnd`, `balances`, `TIMEOUT`, refund classification and claim execution unchanged.

## Checks run

Dependencies were installed in a disposable project outside the repository using the existing manifest and lockfile. No dependency or cache directory is part of the submission. Build output was copied to root `dist/`, with the obsolete hashed bundles removed.

| Command / check | Actual result |
| --- | --- |
| `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` | Passed; existing lockfile preserved |
| `npm run build` | Passed: TypeScript, Vite, ABI hash and export inventory |
| `npm run typecheck` | Passed independently, including updated tests |
| `npm test` | 69/69 passed |
| `npm run verify` | Passed: 25 inventoried assets; 1,349,751 bytes excluding the inventory manifest |
| `HH_TEST='My bets' node tests/browser.mjs` | 8/8 passed; zero page-script errors |
| `node tests/browser.mjs` | Final complete Chromium suite: 41/41 passed; zero page-script errors |
| `HH_TEST='My bets shares the leaderboard' node tests/browser.mjs` | Enhanced regression also passed after adding cached reload coverage |
| `HH_TEST='leaderboard two-sided' node tests/browser.mjs` | 1/1 passed; existing eligibility, team, pending, lazy-void and timeout behavior |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Ran on root production export: 14/16 checks passed |
| `HH_BROWSER=webkit HH_TEST='My bets shares the leaderboard' node tests/browser.mjs` | Launch failed: required GTK/GStreamer and related system libraries are absent; no WebKit interaction result claimed |

The [focused My Bets results](browser-my-bets.json) cover history reuse, pending history, both supplied wallets, day/night reflow at 320/390/800/1440, refund deadline transition, bounded fallback and RPC rotation, exhausted fallback and keyboard retry, empty/account-change isolation and sequential Claim all. The reviewer-specific case holds only the removed unfiltered request: it now renders the refund without any unfiltered or wallet-filtered request. Reload uses the saved raw-history checkpoint without another historical scan. Obsolete unit tests for the deleted independent loader were replaced by shared scanner tests covering refunds, tickets, claims, other game events, incremental cache resume, duplicates, interrupted scans, malformed cache and reorg clearing. All prior leaderboard eligibility tests still pass.

The [final complete Chromium run](browser-full.json) passed **41/41**, including all leaderboard, My Bets, betting/approval/rejection, ticket, feed, stats, chat, wallet, docs, rewards, accessibility and navigation/reflow scenarios, with zero page-script errors. An earlier leaderboard-only process ended with signal 143 after seven printed passes; the completed full run subsequently passed those cases and all remaining cases. The held-scan case in this final run includes cached reload coverage.

## Live read-only check

The same scanner loaded **1,134 raw game events through Ethereum block 26,333,120** using 52 existing 2,000-block ranges. Both My Bets loads consumed that exact history with **zero additional history requests**. No transaction or signature was sent. [Actual chain results](live-read.json).

| Wallet | Hour | Stake | Observed state |
| --- | --- | --- | --- |
| `0xa1c19314851e7abf72b3c124476b1c7a3be2217a` | 429 | 7.37 IMD | Refund ready; exact claimable `7374185066434527746` |
| `0x15e02b8fa7fc6abcf698955587701fe51ddfe217` | 431 | 1 IMD | Refund ready |
| same wallet | 478 | 5 IMD | Waiting for refund; unlock timestamp `1793744400` (Nov 3, 22:20 UTC) |

The post-deadline transition is verified with a controlled browser clock and unit boundary tests; it is not a claim that the future live transaction was exercised. The RPC source is identified by its supplied public endpoint in the evidence.

## Better Interface review

Applied the pinned workflow and all six domains to the affected flow, preserving the existing cozy pixel direction. Source review and screenshots/measurements come from the actual production bundle under `/preview/`. [Rendered evidence](rendered-review.json), [shared-leaderboard refund](shared-leaderboard-390.png), [night waiting/ready states](mybets-night-390.png), [390px product/action first screen](wheel-390.png), and [design probe](design-probe.json).

| Domain | Coverage, findings and limits |
| --- | --- |
| Accessibility | Checked existing native links/buttons, names, heading order, `role=status` loading and `role=alert` error, keyboard retry and claim focus. Eight My Bets main-content axe scans (four widths × two themes) report zero violations. Focus is a solid outline at least 2px. No source/accessibility correction was needed for this data revision. Screen-reader announcements and forced-colors operation were not tested. |
| Layout | Checked My Bets loaded, loading, error, empty and refund states. At 320/390/800/1440 in both themes there is no document horizontal overflow. Inspected the 390 shared-history refund screenshot and existing stacked hour/actions. The production probe's 390 first screen shows the product and Connect to bet; it reports no overlap, clipped text or floating-control coverage. Native 200% browser zoom, physical devices and RTL were not tested. |
| Writing | Exact “Finding your bets…” copy remains while history is pending, with no false empty state or premature failure. Existing Refund ready / Waiting for refund, exact UTC deadline, Try again and empty-wallet action remain. Errors and loading now correspond to the common source. No copy changes were needed. |
| Typography | Existing Geist 400/600/700 and Silkscreen 400 local fonts loaded. Badge labels remain 12px Geist; existing amounts/countdowns use tabular figures. Both supplied wallet fixtures wrap at narrow widths without clipping. No new font, weight or size was introduced. |
| Colors | Browser-computed status pairs in both themes are `#2B2118` on `#FFE08A` at 12.21:1 and on `#A8E6C6` at 11.10:1. The calculations describe solid badge backgrounds, excluding decorative grain compositing. The probe passes measured text contrast. Status is also spelled out in words. No token changes were necessary. |
| UI | Checked pending-history, ready/waiting refund, empty/disconnected, error/retry, account change, deadline transition and sequential claim states. Existing card, pills, help and transaction feedback remain; reduced-motion checks record zero running animations in My Bets. Animation-panel playback at 10% speed was not performed. |

**High, reproduced data defect:** `web/src/App.tsx:189` / `web/src/useLeaderboard.ts:51` / `web/src/leaderboard.ts:365`. Sharing only endpoint URLs left two full-history dependencies. Corrected to publish raw events and rankings from one query/checkpoint. Rechecked by the held-scan regression, reload, scanner tests and live reads; both wallet refunds appear without another history scan.

No additional applicable design findings were reproduced. The probe's two retained flags are the existing active-navigation pill above the heading (`App.tsx` header) and deliberate chunky button border/shadow plus nested amount/notice surfaces (`styles.css`). Screenshots confirm these established conventions; they are outside this data-only correction and were retained as requested. The probe passes render, layout, targets, contrast, casing, tracking, type sizes/faces, glyphs, slogans, repetition, copy budget, motion and share metadata. Nineteen controls are below its comfortable 44px preference but pass minimum size/spacing. Title, favicon, description, og:title and og:image remain in `dist/index.html`.

## Delivery and limitations

`DESIGN.md` records the final existing tokens, typography, components and responsive behavior, with shared-source/loading documentation updated. Root README documents installation, preview, rebuilding and this revision. Source, unchanged package manifest/lockfile and complete static `dist/` remain available; runtime assets are local and asset URLs are relative. No ignore file, build configuration, dependency, submodule, contract or keeper was changed.

Worker-side results are observations, not independent certification. No real wallet signature, production claim/chat post, physical device, native zoom, screen-reader or Safari interaction was performed. Public RPC policies remain external; exhausted providers still produce a retryable error rather than partial/empty history. The unchanged design-probe conventions are documented above.

## Completion

**Complete for this revision**, with the explicit optional browser/device limitations above. The original finding reproduced and is fixed; the production build, independent typecheck, 69 unit tests, complete 41-scenario Chromium suite, targeted regression/reload checks, export verification and real-chain wallet observations passed. The retained design conventions remain documented. [Delivery inventory](delivery.json) records the final size budget.
