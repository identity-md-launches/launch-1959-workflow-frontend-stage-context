# My Bets shared-event recovery

Scope: the existing Hamster Hour site, its production static export, and the My Bets loading/refund/claim flow. The established cozy pixel design, contracts, keeper, leaderboard implementation, wallet configuration, build configuration, manifest and lockfile are preserved. Production contains no test-wallet injection or fixture data.

## Revision: event history through the leaderboard's RPC list

A reviewer reported that My Bets still showed "Your bets could not load" while the leaderboard loaded. It reproduced. The shared `useEvents` query and the wallet fallback both requested logs only through the runtime RPCs, PublicNode and dRPC. On November 3, a direct `eth_getLogs` for blocks 26,229,405–26,234,404 returned these results:

| RPC | Result |
| --- | --- |
| BlockPI (`ethereum.public.blockpi.network`) | logs returned |
| MEV Blocker | logs returned |
| PublicNode | -32602 "Archive requests require a personal token" |
| dRPC | 35 "ranges over 10000 blocks are not supported on free plan" |
| LlamaRPC | HTTP 525 |
| Cloudflare | -32047 "Max range: 800" |

Fix (`web/src/data.ts`): `GAME_LOG_RPCS` is the leaderboard's own `LEADERBOARD_RPCS` list. `logRequester` sends each bounded request to the preferred RPC. On failure it logs the step, RPC URL, block range and attempt, then moves to the next RPC, with two passes per chunk. The working RPC stays preferred. `loadEvents`, the shared query My Bets filters in memory, and `loadWalletBets`, the error-only fallback, both use it with fixed 5,000-block chunks. Contract reads, refund classification, the leaderboard scanner and its configuration are unchanged.

The leaderboard's `VolumeScanner` was not changed to also hand My Bets its logs. It keeps only per-window aggregates: no `Claimed` events, transaction hashes or log identities. Its localStorage checkpoint means a returning visitor's scan reads only blocks after the checkpoint. It therefore cannot supply a wallet's full history without changing leaderboard logic, which the brief forbids. The shared events query now reads from the same endpoints the leaderboard uses.

Checks run for this revision:

| Check | Actual outcome |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm test` | 69/69 passed. New: shared loader skips a PublicNode-style refusal, stays at 5,000-block ranges, logs the failed RPC and range, and filters BinaryBet/Claimed for the wallet. Updated: the loader no longer touches the wallet transport, and the fallback prefers the working RPC. |
| `npm run build` | Passed, with export verification (25 assets) |
| Live Node run of `loadEvents` → unchanged `loadMyBets` → `classify` | 1,130 events, 0 failed attempts. `0xa1c1…217a`: hour 429, 7.37 IMD, Refund ready. `0x15e0…e217`: hour 431, 1 IMD, Refund ready; hour 478, 5 IMD, Waiting for refund at 1793744399, Refund ready at 1793744400 (Nov 3 22:20 UTC). |
| Live Node run of `loadWalletBets` (fallback) for both wallets | Hours 429 (7.37), 431 (1) and 478 (5), 0 failed attempts |
| Chromium, 390×844, production `dist/` served locally, live RPCs, read-only EIP-6963 provider (`eth_accounts`/`eth_chainId` only) | Wallet 1: hour 429 · 7.37 IMD · Refund ready, Claim 7.37 IMD shown ([screenshot](mybets-live-0xa1c1-390.png)). Wallet 2: "Finding your bets…" while loading, then hour 478 · 5 IMD · Waiting for refund ("22:20 UTC Nov 3") and hour 431 · 1 IMD · Refund ready ([screenshot](mybets-live-0x15e0-390.png)). Network: every historical log request went to BlockPI; PublicNode served only latest-block reads. No My Bets console errors. The only console errors were CORS refusals of the worker endpoints for the `127.0.0.1` origin, which this change does not affect. |

| `taste.mjs --out test/scratch/taste`, with a Playwright installed only in scratch | 14/16, matching the previous round. The two failures are the documented existing-style exceptions: the active "The wheel" nav tab is read as a kicker, and the bet side buttons use border plus shadow. Neither is touched by this data-layer change. |

Limitations: no transaction was signed or sent. The broad `tests/browser.mjs` suite was not re-run in this revision. Its fixtures intercept RPC traffic, and the change is confined to the log-loading data layer. Layout, CSS and copy are unchanged, so the earlier Better Interface review and design-probe results still apply.

## Implementation

`web/src/App.tsx:412` passes the existing shared `useEvents` query to My Bets. `walletEvents` (`web/src/data.ts:262`) filters BinaryBet/TicketBought by bettor and Claimed by account, case-insensitively. It does not apply leaderboard volume eligibility. `useMyBets` (`data.ts:492`) enables its reads only after shared history is available or that query errors. A successful empty array never triggers a scan. Available shared history remains usable through a background refresh error.

`web/src/MyBets.tsx:123` renders “Finding your bets…” while history is pending. Error and empty states remain distinct. The per-hour read list and block pinning remain unchanged: position, windowInfo, claimable, lossOf, windowEnd, balances and TIMEOUT. Refund classification and transaction execution are unchanged.

Only an errored shared query without usable data enables `loadWalletBets` (`data.ts:302`). It reads one latest head, scans from the configured deployment block in inclusive nonoverlapping ranges of at most 5,000 blocks, rotates the configured RPC URLs, and allows two passes through the list per chunk. There is no unbounded range or recursive splitting. The result is returned only after all chunks succeed. No separate wallet-scan cache can retain stale claim events. Query keys separate accounts, chains, contracts and wallet-event revisions.

Console errors identify shared scanning, fallback requests, log decoding, or the particular contract read, with the requested block range. Each fallback failure records the exact URL and attempt. For the preserved multi-provider contract client, nested viem errors supply the provider URL when available; otherwise the diagnostic names the configured pool and includes the original error. Latest-head failures explicitly say `latest` because no numeric head is known yet.

## Live observations

A read-only public-RPC scan loaded 1,126 decoded game events through Ethereum block **26,332,824** on November 3. Contract reads in each My Bets load were pinned to one then-current block. [Actual observations](live-read.json):

| Wallet | Hour | Stake | Observed status |
| --- | --- | --- | --- |
| `0xa1c19314851e7abf72b3c124476b1c7a3be2217a` | 429 | 7.37 IMD | Refund ready |
| `0x15e02b8fa7fc6abcf698955587701fe51ddfe217` | 431 | 1 IMD | Refund ready |
| same wallet | 478 | 5 IMD | Waiting for refund; unlocks Nov 3 at 22:20 UTC |

The exact hour-429 claimable read was `7374185066434527746` token units. Hour 478's unlock timestamp was `1793744400`. Unit tests check one second before, at, and after this boundary. The production-browser test advances a controlled clock to verify the existing UI changes to Refund ready and exposes Claim 5 IMD. This is a simulated future transition, not a claim that a live refund transaction was sent.

## Commands and evidence

Dependencies were installed in a disposable copy with the unchanged source manifest/lockfile; dependency directories and npm caches remain outside the submission. The following commands ran against that copy of the final source, with `dist/` copied back into the repository:

| Command | Actual outcome |
| --- | --- |
| `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` | Passed; protected lockfile installed without edits |
| `npm run build` | Passed; TypeScript, Vite production bundle and ABI/export inventory |
| `npm run typecheck` | Passed independently |
| `npm test` | 68/68 passed |
| `npm run verify` | Passed; 25 inventoried assets, ABI hash and inventory match |
| `HH_TEST='My bets' node tests/browser.mjs` | Final focused run: 7/7 passed; zero page-script or local-resource errors |
| `HH_TEST='leaderboard one-sided pending' node tests/browser.mjs` | Repaired reload wait: 1/1 passed |
| `HH_TEST='reward price failure' node tests/browser.mjs` | Repaired asynchronous assertion: 1/1 passed |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Ran against the final root export; 14/16 checks passed |

Two complete Chromium runs each finished **39/40**, with zero page-script errors. The first failure was the leaderboard reload timing assertion; after its wait repair, that scenario passed both a focused recheck and the second broad run. The second run's only failure was the independent rewards-read timing assertion, which passed after the fixture wait repair. The entire broad suite was not repeated after that final test-only repair; both broad results and both focused rechecks are retained.

Browser checks use `IMD_PLAYWRIGHT` and `PLAYWRIGHT_BROWSERS_PATH` to name a temporary Playwright installation. `node tests/browser.mjs` serves the actual production bundle under `/preview/`, intercepts wallet/RPC/services, and closes its own server/browser. `HH_TEST='My bets'` selects this task's seven scenarios. The [final My Bets results](browser-my-bets.json), [initial broad run](browser-initial.json), [second broad run](browser-broad.json), [leaderboard recheck](browser-refresh-recheck.json) and [rewards recheck](browser-rewards-recheck.json) preserve the actual outcomes. No public service availability or real signature is inferred from those fixtures.

The new scenarios cover shared-history reuse with zero additional log scans, pending history, both supplied wallets, both themes, the refund deadline, fixed chunk boundaries and RPC rotation after shared failure, exhausted retries and recovery, empty wallets, account changes, and the existing sequential Claim all. Unit tests additionally verify exact read names/block pinning, claim filtering, no scan for empty shared history, per-chunk retries and no partial return, and diagnostic context.

The broad regression exposed test timing/expectation issues: the existing Claim all assertion expected newest-first while the unchanged implementation deliberately claims oldest-first; its expectation was corrected. A leaderboard refresh test advanced its clock during a reload's mount-time cached refresh; it now waits for network idle before advancing the next minute. The rewards price-failure fixture also assumed its independent contract reads had finished when the USD error appeared; its assertions now wait for the actual IMD values. That case passed a focused rerun. No leaderboard source, rewards source or claim-order code was changed.

## Better Interface review

The pinned workflow and core principles in all six domains were read and applied to the affected flow. This is a scoped review, not a redesign of unrelated pages. Screenshots were produced and inspected from the production export; responsive browser emulation is not a physical-device test.

| Domain | Coverage and evidence |
| --- | --- |
| Accessibility | Checked native controls, names, headings, polite loading and error roles, focus styling and reduced-motion CSS. Eight automated audits of the My Bets main content (four widths × two themes) reported zero violations. A focused claim action was inspected and its solid outline measured at least 2px. Error retry has a keyboard path. Screen-reader announcement behavior, every keyboard stop and forced-colors behavior remain unverified. |
| Layout | Checked loaded My Bets at 320, 390, 800 and 1440px in day/night; no document horizontal overflow. Phone lines stack and claim controls expand. Inspected the 390×844 wheel first screen: product, amount and Connect to bet are visible; the full regression also asserts that action fits. Inspected My Bets loading, ready, waiting, error and deadline states. Native browser zoom, RTL and physical devices remain unverified. |
| Writing | Checked the exact requested “Finding your bets…” text and preserved status vocabulary. Errors retain Try again; empty history offers Make your first pick. Wallet/account changes do not show another account's bets. No speculative recovery success or fabricated balance is shown. |
| Typography | Checked the existing CSS size tokens and natural wrapping. Browser evidence records loaded Geist 400/600/700 and Silkscreen 400 local fonts. Stake labels use 14px and status labels 12px; existing tabular figures stabilize countdowns/amounts. No new size or font was added. |
| Colors | Checked actual computed badge pairs in both themes: `#2B2118` on butter `#FFE08A` = **12.21:1**; on mint `#A8E6C6` = **11.10:1**. The solid-pair calculation excludes decorative film-grain compositing. Text also spells out each state. The probe passed its measured text contrast check. |
| UI | Checked loading, disconnected, empty, pending refund, ready refund, error, retry and claim flow. Existing cards, pills, help controls and transaction feedback are reused. With reduced motion, the My Bets review recorded zero running animations. No new animation or surface treatment was added. Animations-panel playback at 10% speed was not performed. |

[Rendered audit/color/font evidence](rendered-review.json) records all eight views. Representative screenshots: [day phone](mybets-390-day.png), [night phone](mybets-390-night.png), [desktop](mybets-1440-day.png), [loading](mybets-loading-390.png), [error](mybets-error-390.png), [focus](mybets-focus-390.png), [refund deadline](mybets-deadline-390.png), and the [390px wheel first screen](wheel-390.png).

### Findings, fixes and retained conventions

- **High, loading/data:** `web/src/data.ts:492` and `web/src/MyBets.tsx:123`. The previous wallet-wide scan could fail before existing shared history was used. Shared-query gating and in-memory wallet filtering replace that path. Rechecked with pending, successful, empty, failed, retry and account-change fixtures, plus actual chain reads.
- **High, recovery:** `web/src/data.ts:302`. Recursive range splitting still began with one whole-history request. Fixed ranges, explicit RPC rotation and bounded retries replace it. Tests assert every requested range, full coverage and rejection on incomplete history.
- **Medium, diagnostics:** `web/src/data.ts:272`. Failed reads lacked a useful step/range diagnostic. Context is now logged for shared history, fallback and contract reads; the unit test checks RPC URL, function and pinned block.
- **Medium, layout:** `web/src/styles.css:2786`. The first probe and 1440px screenshot showed the fixed Chat button covering the one-sided refund notice. Moving it to `right: 18px` clears that text at the inspected desktop size and preserves the existing phone override. The final probe passes layout: no horizontal overflow, text overlaps, floating-control coverage or clipped text at its tested widths.
- **Low, announcements:** `web/src/MyBets.tsx:125` and `:129`. Loading and exhausted-error copy now expose status/alert roles. Automated audits pass; screen-reader announcement timing is explicitly unverified.

The final [probe output](design-probe.json) passes render, layout, targets, contrast, casing, tracking, type sizes/faces, glyphs, slogans, repetition, copy budget, motion and share metadata. Its remaining two flags are retained established conventions: it treats the active navigation pill above the heading as an eyebrow, and flags the existing pixel-button border/shadow plus the amount/notice surfaces. These were inspected and retained to preserve the site's design and meaningful betting information. Neither affects the My Bets loading fix. The probe reports 19 controls below its comfortable 44px preference but all meet its minimum/spacing check.

## Delivery budget

Evidence lives under `docs/frontend/my-bets/` so it is included in the Git submission with the existing ignore rules. Path budgets are 2 MiB for `dist/`, 4 MiB for this evidence directory, and 1 MiB for changed source/tests/root documentation: 7 MiB total, within the assignment's 8 MiB limit. No ignore file was changed. The delivery inventory records the final measured bytes and hashes.

## Limits

The supplied browser connector could not launch its missing Chrome distribution. A temporary Playwright Chromium installation successfully ran the production checks instead. WebKit was downloaded and attempted, but launch failed because its required GTK/GStreamer and related system libraries are absent; Safari coverage is unperformed. No physical-device, native 200% zoom, screen-reader, production chat post or real wallet transaction was performed. The final broad-suite count remains 39/40 before the last fixture wait repair, with a successful focused recheck; it is not reported as a clean 40/40 run. Public RPC policies can change; exhausted providers still produce an explicit retryable error instead of false empty history. Nothing was published or deployed by this task.

`DESIGN.md` documents the final tokens, typography, components and responsive behavior. The root README explains installation, preview, rebuilding and this fix. The committed source manifest/lockfile and the complete relative-URL static export are retained; no new dependency, package archive, submodule or ignore rule was introduced.

## Completion

**Complete for the stated My Bets scope**, with the platform and broad-suite coverage limitations above. The final production build/typecheck/export verification, all 68 unit tests, all seven focused My Bets production-browser scenarios, eight targeted accessibility audits and both supplied live-wallet examples passed. These are worker-side observations, not independent certification.
