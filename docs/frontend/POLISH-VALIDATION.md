# Hamster Hour v2 polish validation

Date: 2026-10-20. Local implementation evidence, not independent certification. No wallet funds, production chat message, contract deployment, worker publication or hosting change was made.

## Scope and requirements

Preserved the existing cozy pixel design, palettes, fonts, illustrations, v2 ABI, runtime identity, wallet connectors and transaction service. The historical pinned deployment describes v1; the project history and accepted v2 handoff remain the authority for the unchanged current integration. Existing build configuration, dependencies and lockfiles are unchanged. No ignore rule was edited.

| Requirement | Implemented result |
| --- | --- |
| Five top tabs | The wheel, Jackpot, Stats, My bets, Agents; hash links, direct reload and browser history work. |
| Short home, in the requested order | Header/headline/New here, shared hamster frame with passes and seeds, bet panel, compact jackpot strip, one-line ticker. No supporting sections or footer on home. |
| One frame; never old recording | Fresh worker `/live` state, supported ID, observation time and expiry are required. Offline, expired or failed checks unmount the iframe. The remembered-ID and hard-coded fallback were removed. Pixel sleep/run follows fresh status. |
| Mobile product and action | At 390×844, the frame precedes the form; choices, amount and primary action fit above the 64px chat utility area. The duplicate fixed betting bar was removed. |
| Jackpot | Full jar, local-time hour selector, ticket flow, feeding and “fed by” list live here. Home has the amount, requested 5 IMD action and a tab link. Both use the existing transaction paths. |
| Stats | One usual-day chart and the last 24 finished game windows, newest first; line, actual available pass count and market outcome/refund. No-bet windows still use observed telemetry. |
| Correct history data | Exact round boundaries/checkpoints or complete observed buckets; no future/ongoing windows, partial totals or typical-day means presented as results. Oracle fallback counts are explicitly labelled. |
| Wake estimate | First future local hour in the 7-day mean with at least 100 passes; no percentage-of-peak heuristic. A test with the threshold first reached 12 hours later returns 12. Averages older than 24 hours suppress the note. |
| Commas | Explicit en-US numeric formatting, including a French-browser test; dates/times remain local. |
| Agents and chat | Agent skill moved to its tab. Shared bottom-right chat control opens a native modal drawer on all five tabs, retaining the signed-message protocol. |
| Static delivery | Source and existing lockfile plus root dist/index.html, local fonts/art, metadata, ABI, deployment inventory and agent discovery assets. Relative assets work at `/preview/`. |
| Documentation | Root DESIGN.md reflects final tokens/components/responsive behavior. README covers install, preview, rebuild, checks and service limits. |

The product's visual idea remains a small pixel hamster and warm rounded betting controls. Supporting tools are reached through tabs instead of lengthening the betting page.

## Checks actually run

Dependencies were installed using the unchanged web lockfile in a temporary mirror, leaving repository node_modules untouched. Commands below ran there unless marked repository root. Source/tests were copied into that mirror before the final production build; its complete dist replaced root dist, removing obsolete hashed assets.

| Check | Result |
| --- | --- |
| `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` | Passed using the protected existing manifest/lockfile. No dependency directory, cache or archive is delivered. |
| `npm run build` | Passed: no-emit TypeScript, Vite production bundle and verified ABI/asset export. |
| `npm run typecheck` | Passed separately. |
| `npm test` | 24/24 passed: existing amount, payout, status, chat and worker tests, plus history order/time boundaries, no-bet zeroes, incomplete observations, exact BigInt counter deltas, :20 boundary handling, independent market winners/refunds, stream leases, wake threshold and comma formatting. |
| `npm run verify` | Passed: ABI hash, deployment configuration and every asset inventory hash. |
| Chromium `node tests/browser.mjs` | 13/13 scenarios passed on the production export, with no page script errors or missing local resources. Controlled wallet/RPC/service fixtures; no real signatures/spends. |
| Axe inside browser suite | 14 audits, zero reported violations for the selected WCAG A/AA tags: all five tabs in day/night, chat drawer, wallet sheet and desktop Stats in both themes. |
| Pinned taste probe, repository root | 14/16 measurements pass; layout, contrast, targets, typography, motion, metadata and render pass. Two retained flags are assessed below. Screens checked at 320, 390 and 1440; browser suite also checks 800. |
| Read-only Ethereum verification | At block 26232604: chain 1, v2 runtime hash matches, IMD matches the runtime handoff, GENESIS is 1791847200. Public RPC provenance: [Ethereum PublicNode](https://ethereum-rpc.publicnode.com). |
| Current public service | `/live` returns an explicit state and expiry; `/rounds` supplies recent settlements/checkpoints. `/stats7` and `/stats30` both returned HTTP 404 in this revision. The dated snapshots remain honestly labelled fallbacks. |
| WebKit attempt | Browser launch failed because its executable is unavailable. No WebKit/Safari compatibility claim is made. |
| Repository integrity | Protected configuration, dependencies, ABI/handoff/network, wallet/transaction service and ignore files unchanged. Runtime network and wallet parameters match the pinned input. `git diff --check` passes. |

Browser command (from an installed web directory):

```sh
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node tests/browser.mjs
```

The exact required probe ran from the repository root on the final export:

```sh
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The scripts own and close their foreground previews and browsers. Full scratch screenshots are disposable. Compact retained evidence is in `docs/frontend/polish/`: browser results, Axe summary, probe summary and 390px screenshots. They contain controlled fixture amounts, not real gameplay.

## Primary interactions

The browser suite checks exact approval followed by a separate reviewed bet, signature rejection/retry and confirmed share image; direct compact-strip ticket purchase and full-tab feeding with exact approvals; sequential Claim all; 7/30-day changes and saved-data labelling; hour selection; signed chat in a drawer; Escape/focus restoration; day/night and onboarding persistence; live speed/unknown status and motion opt-out; bytecode mismatch before any send; a reverted approval with failed receipt link and restored action; mobile wallet choices; five tabs/direct reload; French-locale comma formatting; offline/expired/failed stream checks despite a remembered recording ID; responsive widths and local font/resource loading. Reduced motion disables illustration loops and live-player autoplay.

## Better Interface review: all six domains

Applied the pinned workflow and core principles while implementing. Attribution and licenses remain in the existing frontend attribution/license files. Coverage is specific to this revision and the inherited behaviors exercised above.

| Domain | Checked | Unperformed / limits |
| --- | --- | --- |
| Accessibility | Native links/buttons/inputs, input labels, named scroll regions, one main/h1, skip link, pressed/expanded state, drawer Escape/focus return, modal background behavior, motion preferences and 14 Axe audits. | No screen reader, physical touch device, native 200% zoom, forced-colors session or exhaustive focus walk. Automated scans do not prove full compliance. |
| Layout | Exact home composition/order, mobile frame/action, all five routes at 320/390/800/1440, drawer, chart, results scrolling, current/unknown data and compact strip. No measured page overflow/overlap. | No exhaustive viewport sweep, RTL mirror or pseudo-localization. French browser validates grouping, not translated copy. |
| Writing | Cost and approval/bet separation, explicit ticket/donation context, result versus observation, pending/refund/missing states and error recovery. UNDER now says “At or below”, matching equality. | Service content and the hamster's behavior are external. |
| Typography | Existing local Geist/Silkscreen, loaded font files, six tokens and three weights, changing tabular numbers, comma grouping, complete counters and mobile input sizes. | Other OS/browser font rendering unverified. |
| Colors | Existing day/night palettes, selected/hover states and Axe/probe text pairs. Recomputed solid ratios: ink/day page 14.59:1, muted/day card 5.42:1, ink/night card 13.88:1, muted/night card 7.29:1, dark ink/peach 9.11:1, butter/jackpot 11.61:1. | No blanket claim for pixel art, film grain, video or every composited pixel. |
| UI | Reused cards, buttons, native sheets/help, transaction approval/review/success/rejection/revert states, drawer, stale camera removal, paused/reduced motion, dates and unknowns. | No physical audio listen, 10%-speed animation-panel inspection, real wallet/passkey signing or real YouTube playback. |

## Findings and corrections

| Severity / source | Observation, fix and recheck |
| --- | --- |
| High · `web/src/App.tsx:327`, `web/src/styles.css:2845` | Supporting sections made home long and the first mobile build put the primary action below 844px. Moved sections to five tabs, retained one frame, compressed mobile spacing and placed the normal action after the amount. Final 390px geometry test requires the action's bottom at or above 780px, clear of chat. Screenshot inspected. |
| High · `web/src/live.ts:67`, `web/src/Stream.tsx:6` | Existing fallback replayed a remembered/default video without proof it was live. Removed both fallbacks and gate embeds on fresh live leases; poll failures/expiry remove the iframe. Offline/expired/error fixtures prove the old local-storage ID cannot reappear. |
| High · `web/src/data.ts:104`, `web/src/history.ts:6`, `web/src/Stats.tsx:124` | History ordering and contract-only no-bet values could mislead about finished hours and passes. Derive completed boundaries from chain time, filter/sort again by actual timestamps and use exact observation evidence. Unit and rendered tests verify 24 decreasing completed endings, no-bet zeroes and honest gaps. |
| Medium · `web/src/history.ts:17` | The game's :20 boundaries do not match half-hour stats buckets. Never prorate a positive partial bucket. Fully observed zero buckets can establish zero subintervals; exact counter endpoints preserve BigInt precision. Tests cover both cases. |
| Medium · `web/src/telemetry.ts:85` | Wake used a fraction of the daily peak. Changed to the first future local hour averaging at least 100 passes; tests cover the 12-hour example and stale averages. |
| Medium · `web/src/model.ts:42`, `web/src/Bet.tsx:179`, `web/src/Stats.tsx:236` | Locale-dependent grouping could show spaces. Explicit comma formatting now covers pass counts, amounts and records. A French-browser check still displays 2,100. |
| Medium · `web/src/Chat.tsx:361`, `web/src/Sheet.tsx:2` | Chat occupied a full home section. It now uses the shared native sheet as an always-available drawer; test all five tabs, signing, Escape and trigger focus. |
| Low · `web/src/App.tsx:191`, `web/src/App.tsx:264` | Tabs now reset scroll. The skip link focuses main without changing the selected hash page; keyboard check verifies Stats remains selected. |
| Low · `web/src/Bet.tsx:203`, `web/src/styles.css:3121` | Corrected equality copy to “At or below”; large counters can wrap and result cells size to full content instead of overlapping adjacent data. |

There is no separate previous critic finding file in the supplied inputs. The previous `V2-VALIDATION.md` records medium issues for scroll anchoring, selected-range hover contrast, result text/chart contrast, share-card fitting and repeated quiet-history scans. Those fixes were retained; their affected states were rechecked by the browser/Axe suite, downloaded share image and existing event-cursor test. No finding IDs or unavailable low findings are invented.

## Probe flags retained after screenshot inspection

- `eyebrows`: the probe identifies the **active navigation link “The wheel”** above the hero as a kicker. It is the requested top tab, with native navigation semantics and current-page state. It is not an editorial label. Retained to preserve navigation and the compact first screen.
- `chrome`: existing category/primary/ticket buttons intentionally combine a border and colored pixel shadow. The “nested card” is the amount form control inside the bet card. The task says “Keep the design, colors”; these existing treatments remain. The previous v2 validation already records this exception. No new content cards are nested.

Neither flag is reported as a clean pass. The probe finds no horizontal overflow, text overlap, floating control covering text, clipped text, contrast failure, missing metadata or motion failure on the measured home states.

## Completion and remaining limits

Complete for the authorized frontend/source/static-export work. Historical source coverage is incomplete: the existing worker returns only recent settlement/checkpoint data and live stats routes still return 404. Some active :20 windows cannot be reconstructed exactly from saved half-hour totals; those show no observation, or a clearly labelled settled oracle count. We do not invent passes, use future windows, replace the worker, change contract wiring or publish services to conceal this limitation. The inherited worker extension and its installation notes remain unchanged.

WebKit/Safari, real wallet spending, physical phone app opening, passkey creation and actual YouTube playback were not verified. The delivered site remains dependent on the existing public RPC and worker availability, with explicit loading/error/unknown states.

## Final packaging

The delivered export matches the tested build byte for byte, and every frontend source file matches the build mirror. The export contains 25 inventoried assets plus its deployment inventory: 1,188,505 bytes in total (1,182,888 asset bytes). The complete submission candidate is approximately 7.92 MB, below the 8,388,608-byte limit; inputs and disposable scratch are excluded. No dependency cache, registry archive, submodule or node_modules is included. Protected configuration and dependency paths were mechanically compared with Git and are unchanged. Current summaries and compact screenshots are retained in [polish/](polish/).
