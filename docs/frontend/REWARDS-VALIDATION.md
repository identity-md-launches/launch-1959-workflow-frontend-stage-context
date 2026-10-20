# Rewards pool and jackpot validation

2026-10-20. Complete for the requested update, with the limitations below. These are contributor-run checks, not independent certification.

## Delivered scope and calculations

- `$HAMSTER` → Stake and its Stats card use the same `RewardsPool` component. The existing site, wallet flow, transactions, contracts, worker and other tabs retain their implementation.
- Waiting IMD is exactly `dripDeposited() + hookDeposited() + gameDeposited() - rewardsPaid()` from the specified vault. All vault inputs in a snapshot use one block.
- Daily release is approximately `(dripPrincipal - dripReleased) / 100 + (hookRate + gameRate) * 86400 / 1e27`, using the current previewed `rewardState()`. It is zero when eligible weight is zero. Preview failures preserve the waiting pool while dependent estimates remain unknown.
- This is a current run rate, not a prediction of the next 24 hours. It excludes future deposits, stake changes and stream expiries. The implementation-derived vault ABI and pinned [staking source](https://github.com/identity-md-launches/launch-2304-project-site-https-hamsterhour-fun-launc/blob/69ca386/src/HamsterStaking.sol) distinguish 7-day hook streams and 30-day game streams. Both active rates count; game rewards are not falsely described as 7-day streams.
- HAMSTER/IMD price reads `poolId()` from the existing hook and `getSlot0(poolId)` from the supplied network StateView. Both tokens have 18 decimals; the square-root price is oriented by currency ordering. No pool ID or token price is hard-coded. The hook getter is derived from the [pinned hook source](https://github.com/identity-md-launches/launch-2336-hamster-hour/blob/bf12d71/src/HamsterHook.sol).
- USD is an approximate public DexScreener quote: the highest-liquidity Ethereum pair with the actual IMD address as base token and a finite positive USD price. The working `/latest/dex/tokens/{IMD}` API is used; `/tokens/v1/ethereum/{IMD}` was observed to reject the read and is not used. Quotes/pool price refresh every minute; vault state refreshes every 20 seconds. Pricing failures leave IMD values available and provide Retry rewards.
- APR is `dailyIMD * IMD_USD * 365 / ((totalStaked + totalGrantBalance) * HAMSTER_IMD * IMD_USD) * 100`. Vesting grants count as stake; the denominator also includes warming stake. Zero total stake yields an unknown APR, rather than division by zero. The UI explicitly calls APR and daily income estimates that change with stake and price.
- Wallet share uses eligible earning weight, including mature grants, divided by the same reward snapshot's total weight. It combines checkpointed account weight with matured lots beyond its cursor and excludes warming lots. IMD/day is the corresponding fraction of the daily release. The preview is bounded at 128 outstanding lots; larger backlogs show an unavailable estimate rather than a partial result. This does not change staking/claim transactions.
- Home and Jackpot both use `jackpotSeed + totalPendingJackpotDeposits`. The secondary next-hour fixed prize retains the original finalization rule. Selecting another ticket hour cannot change the global total.

## Checks actually run

The unchanged `web/package.json` and lockfile were installed in a disposable project copy under `test/scratch/`. No repository dependency directory, build configuration, ignore file, contract ABI, deployment identity, wallet connector or transaction sender was changed.

| Check | Actual result |
| --- | --- |
| `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` | Passed with the existing lockfile. |
| `npm run typecheck` | Passed separately. |
| `npm run build` | Passed: TypeScript, Vite production build, ABI validation and export inventory. |
| `npm test` | 36/36 passed, including seven rewards calculation/data regressions. |
| `npm run verify` | Passed on the completed export; existing ABI hash and every runtime asset inventory hash match. |
| Chromium `node tests/browser.mjs` | 18/18 scenarios passed at the `/preview/` static subpath; no page script errors or missing local resources under controlled service/RPC/wallet fixtures. |
| New rewards accessibility checks | Eight Axe audits, at 320, 390, 800 and 1440 in both themes; zero reported violations for the selected WCAG A/AA tags. |
| Existing app accessibility checks | Fourteen additional Axe audits pass, covering the original five tabs/themes and modal/desktop states. These are targeted automated checks, not a claim of full accessibility compliance. |
| Live read-only integration | Vault snapshot and actual hook pool price loaded on Ethereum at block 26236287; the public IMD USD API also loaded. The vault preview had zero eligible weight, correctly yielding a paused daily release. No live write/signature was requested. |
| Browser-tool inspection | Viewed the actual export with real public reads at 390×844 and 1440×1000; rewards in day/night, its explanation, Jackpot, and the home action. At 390, the betting action occupied y=728–772 and was fully visible on the first screen. No horizontal overflow in those views. |
| Pinned taste probe | Ran `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline` with explicit Playwright/browsers paths. 13/16 measurements passed; retained flags are assessed below. |
| Scope and size | `git diff --check` passes. Protected paths are unchanged; no submodule, dependency archive or ignore-rule change was added. Final package measurements are recorded below. |

`web/tests/browser.mjs` now fixes its fixture timezone to UTC and can omit its injected wallet. This removes implicit timezone/auto-reconnection assumptions from the logged-out and hour-label assertions. Production timezone and wallet behavior are unchanged.

The new interaction cases deliberately make all pending jackpot deposits 33 IMD while the next bucket is only 3 IMD. With a 125 IMD seed, both views must show 158 IMD. Rewards fixtures separately exercise 2,000 IMD waiting, $4,000 USD, approximately 20 IMD/day, 2,920% APR, 25% wallet share and 5 IMD/day. Missing prices recover through Retry rewards; checkpoint failures stay unknown; zero eligible weight pauses release and income. These fixture values are confined to tests.

The existing scenarios still validate approvals, review/rejection/receipt flows, betting, ticket buying, feeding, claims, navigation/history, chat, saved telemetry, responsive layout and reduced motion without spending real funds. The final bundle includes title, favicon, description, og:title and local og:image. Its asset URLs are relative.

## Better Interface review

The supplied Better Interface workflow and the core principles of all six domains were applied to the changed surfaces. The established cozy pixel design is retained.

| Domain | Coverage and result |
| --- | --- |
| Accessibility | Checked native heading/list semantics, named groups, keyboard explanation toggle, existing visible focus treatment, stable status/retry region, and logged-out/connected states. Targeted Axe audits pass. A screen-reader session, forced-colors and native zoom were not performed. |
| Layout | Checked two-column reward figures, trailing help alignment, wrapping complete values, top-of-Stake placement, repeated Stats block and secondary jackpot line. Chromium checks cover 320/390/800/1440; both themes retain the existing responsive grid. RTL/localization expansion was not tested. |
| Writing | Checked calculation labels, IMD/USD units, explicit estimate language, paused/unknown states, actionable retry copy and the distinction between global jackpot total and the next fixed prize. |
| Typography | Reused the existing six size tokens, local Geist weights and tabular numeric figures. Inspected wrapping of the live amount at 390; no clipped value. Local fonts loaded in browser checks. |
| Colors | Reused existing ink/muted/card tokens in both themes. Axe's rendered contrast rule reports no failures in the eight changed-surface audits. Image/film-grain compositing is not a separately measured contrast guarantee. |
| UI details | Reused the definition-list, Help and text-button components; no new surface, animation or transaction state. Verified loading, known zero, missing price, unavailable preview, retry and connected income states. Slow-motion animation review is not applicable to these static additions. |

Findings and corrections:

| Source | Finding, fix and evidence |
| --- | --- |
| `web/src/Jackpot.tsx:145` | High, incorrect total: using next-window deposits excluded other funded hours. Changed both displays through their shared total expression; the 33-versus-3 fixture and hour-selection case pass. |
| `web/src/rewards.ts:30` | High, misleading release risk: nominal deposits/rates alone ignore released drip, matured stake and paused emissions. Current previewed state, remaining drip and its eligible weight now determine release; zero/checkpoint/expiry-rate tests pass. |
| `web/src/rewards.ts:74` | High, incorrect personal income risk: staked balance includes warming tokens and omits earning grants. Account weight plus matured lots now uses the same snapshot; the mature-grant/warm-up test yields 25% and 5 IMD/day. |
| `web/src/styles.css:3291` | Medium, potential explanation overflow: placing the help directly after the label could extend its right-aligned popup past the card's leading edge. The row now places it at the trailing edge. Viewed the opened desktop popup and mobile rewards; responsive audits report no overflow. |
| `web/src/RewardsPool.tsx:68` | Medium, incomplete-data ambiguity: unavailable price/preview must not become a fabricated zero/APR. Dependent values stay unknown, IMD survives pricing failures, and the stable status region offers a working retry. Error/recovery browser cases pass. |

Taste probe flags retained under “Small update. Change nothing else”:

- `layout`: in the offline entry-page probe at 1440×900, the pre-existing fixed chat launcher overlaps the betting action. The requested components do not create that placement. The 390×844 first-screen action is fully visible and was checked separately. The desktop launcher limitation is disclosed, without an unrelated layout change (`web/src/styles.css:2781`).
- `eyebrows`: the probe classifies the active “The wheel” navigation pill above the hero as a kicker. It is the existing primary navigation, retained intentionally.
- `chrome`: existing chunky bordered/shadowed action buttons and the amount field inside the betting card are intentional established components, documented in DESIGN.md. No nested card or shadow was added by this update.

## Limits and evidence

WebKit launch was attempted but unavailable; no Safari compatibility claim is made. Physical wallets, Coinbase passkeys, native zoom, manual screen-reader testing and real funded transactions were not exercised. Real public preview requests to the existing worker encountered CORS rejections for telemetry/history; rewards RPC and price reads worked. The site retains its existing fallback behavior. External service availability and market price freshness cannot be guaranteed by a static export.

Raw logs, probe JSON/screenshots, browser results and targeted audits were written under `test/scratch/`, which is excluded from delivery. Reproduce with the unchanged frontend install/build commands in README, then `node tests/browser.mjs` with explicit `IMD_PLAYWRIGHT` and `PLAYWRIGHT_BROWSERS_PATH`. Use `HH_TEST` to select a scenario. The source test suite and this report are delivered; generated browser screenshots are not runtime assets.

Better Interface attribution and licenses remain in `docs/frontend/ATTRIBUTION.md` and `docs/frontend/BETTER-INTERFACE-LICENSE.txt`.

Final export: 1,245,366 bytes including its deployment inventory, 25 inventory assets. All recorded asset hashes were recomputed against root `dist/`; no root-relative runtime asset URL was found. The complete delivered file set measures 8,101,746 bytes against the 8,388,608-byte limit, leaving 286,862 bytes. No dependency/cache directory or unnecessary archive is included.
