# Hamster Hour maintenance validation

Date: 2026-10-17. Complete for the stated maintenance scope. This is the implementer's record, not independent certification. The same static-site slot receives the repository-root `dist/`; no publishing or on-chain deployment command was run.

## Scope and acceptance

The existing terminal design, layout, copy outside the requested changes, deployment identity, ABIs, wallet/transaction flow, chat protocol, History, Settle, Stake and TEAM tools are preserved. No dependency, manifest, lockfile, build configuration or ignore file changed. The pinned Better Interface workflow and core principles of all six domains were read and applied while implementing and reviewing these changes; retained attribution is in [ATTRIBUTION.md](ATTRIBUTION.md).

| Requested change | Result and evidence |
| --- | --- |
| IMD suffix in every bet sheet | OVER, UNDER, SLEEPING, RUNNING and EXACT checked at 1280, 800 and 375px. The suffix has nowrap, a 3ch minimum and no flex shrink; the input shrinks instead. Each rendered suffix is one text rectangle, remains inside its input container, and stays intact with a long entered amount. Amount chips and Escape/focus return work. |
| Singular counters throughout | Shared counter formatter handles exactly 1/1n; chat, pokes, dynamic pass counts in live progress, result cards/share copy, History, Settle preview and the sleep screen use the appropriate singular. Zero and other values remain plural. Browser checks exercise 1/2 messages, 1/2 pokes, 0/1 passes, and a one-pass line with the bar capped at 100%; unit checks include bigint. |
| Jackpot copy hidden until configured | Both specified pieces are absent with zero/unread jackpot token. An intercepted transition to a configured token restores the balance line and the exact existing 2% sentence. The current real contract has no jackpot token configured. No contract behavior changed. |
| Running-window progress | Uses `windowTimes(k)` and the frozen line for an existing window; an uncreated current window uses the current line. Separate Squeekchain epoch 1791847800, one-based first round and first+5 last round; strict decimal-string BigInt parsing; exact preceding settlement, latest-earlier approximate fallback, or round-only fallback. Counter difference clamps at zero, progress caps at 100%. Main panel and a connected visitor's current bet both show the block. Worker-only `/status` + `/rounds`, 20s polling. Browser checks cover running, sleeping N=0, ≈ fallback, missing baseline, poll updates and no direct Squeekchain requests. |
| First-visit How it works | Opens once when the new preference key is absent; next visit defaults collapsed. Explicit open/collapse is remembered across reload and navigation. The existing first-visit video intro is unchanged. |
| Static export, metadata and first screen | Complete `dist/index.html`, relative assets, deployment record, ABIs, video, fonts and share image included. Title, favicon, description, og:title and og:image pass the probe. At 390×844, after the existing intro's Start playing action, the game and OVER button are within the first viewport even with progress visible. |

The single-line mobile requirement is implemented as a horizontally scrollable summary region rather than reducing text size or dropping any value. Its accessible label identifies the window and scrolling; it is keyboard focusable. The bar remains below it at full available width. Small print wraps naturally. Desktop summary text can wrap inside its panel.

## Commands and actual outcomes

Dependencies were installed from the unchanged manifest/lockfile in an isolated temporary copy of the frontend; no repository `node_modules/` was created or edited. The source and configuration were copied unchanged into that build tree. The original checkout's read-only Git object store was used for the existing export script's pinned-ABI comparison. The complete resulting export was copied byte-for-byte to root `dist/` and checked for equality. Normal reproduction uses the commands in the root and web READMEs.

| Check | Actual result |
| --- | --- |
| `npm ci` | Fails with the existing lockfile: missing `playwright-core@1.64.1` peer. No protected file changed. |
| `npm ci --legacy-peer-deps --no-audit --no-fund` | Exit 0; installs the existing pinned graph. |
| `npm run typecheck` | Exit 0 after the final application source change. |
| `npm test` | Exit 0; **21/21** unit/protocol tests, including six new counter/progress tests. |
| `npm run build` | Exit 0; TypeScript check, Vite production build, original deployment/ABI/asset export verification. **24 assets**, **1,666,516 bytes** excluding the manifest (previously 1,662,688; +3,828 bytes / 0.23%). |
| `npm run verify` | Exit 0; canonical ABI hashes and complete asset inventory match. Addresses and verified chain remain unchanged. |
| `npm run test:browser` with installed Chrome via Playwright | Exit 0; **25/25** production-export scenarios. Served at `/preview/` to verify gateway-subpath asset URLs. [Full scenario results](maintenance/interactions.json). |
| `HH_TEST=maintenance: npm run test:browser` | Exit 0; four maintenance scenarios rerun with additional axe audits of the running block and sleeping connected My bets at 375px. Both additional audits have zero violations and also pass within the final full suite. [Maintenance subset of final results](maintenance/maintenance-interactions.json). These operate only on intercepted fixtures. |
| `npm run test:accessibility` | Exit 0; zero axe violations in intro, Bet, Stake, History, Settle, TEAM, amount sheet and wallet picker. Reduced-motion intro video paused; amount-sheet Escape returns focus to Bet OVER. No body overflow at 320/375/390/768/1440. [Raw results](maintenance/accessibility.json). |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Ran against final root export: **11/16** checks pass; five preserved-design/modal exceptions below. [Actual probe checks](maintenance/taste.json). |
| WebKit launch attempt | Could not launch: its browser executable is not installed. No WebKit/Safari result is claimed. |

The unit checks cover start-inclusive/end-exclusive timing; rounds 1–6 and the clamp; independent epoch mapping with a one-round game-start shift; exact versus older/future/spanning settlements; missing data; counters larger than Number.MAX_SAFE_INTEGER; zero, negative differences and cap; malformed/unsafe feed values; and singular labels.

The browser regression set also covers the unchanged extension-discovery and legacy wallet paths, mobile wallet links, wrong-chain handling, approvals and bet calldata, wallet rejection and transaction receipts, chat posting/error rules, History lookup, public TEAM state, paid oracle request/persistence/settlement, failed oracle payment recovery, invalid-window recovery, staking and claims. These are intercepted test transports; they do not broadcast transactions or post to production chat. The production build has no test mode.

## Rendered review and real services

Inspected exported pages and screenshots at **1280, 800 and 375px**, including all five sheets, expanded How it works, History lookup, public TEAM, Stake and Settle. Inspected the 390px first screen and final 375px sleeping/My bets layout. Console and page errors in the maintenance fixture scenarios were empty; the export loads from a subpath without missing local assets. The complete page has no horizontal overflow, including connected personal positions. The summary itself deliberately scrolls horizontally on narrow layouts.

Retained screenshots:

- [First game screen at 390](maintenance/maintenance-first-screen-390.png)
- [EXACT amount sheet at 375](maintenance/maintenance-exact-375.png)
- [Sleeping zero-pass window and connected My bets at 375](maintenance/maintenance-sleeping-375.png)

Other generated screenshots remain in temporary `test/scratch/interaction/` during checks and are intentionally excluded from delivery.

A separate browser-tool inspection loaded the production export at the worker-allowed `http://localhost:5173` origin with real Ethereum/worker reads. At 1280px it showed **Window 102, round 6 of 6, 0 passes, line 1000**, no horizontal overflow, the initial expanded guide and a collapsed guide on reload. Local IBM Plex Mono loaded. Real `/rounds` and `/status` returned HTTP 200 with the documented string fields; the sampled hardware counter and preceding settlement were both 55910. No write or chat post was sent. [Real read-only screen at 1280](maintenance/real-read-1280.png). YouTube displayed its automated-browser sign-in challenge; actual stream playback is therefore unverified. Two external/player warnings (allowFullscreen precedence and unavailable YouTube adapters) were observed, with no page console errors in that inspection.

## Better Interface six-domain coverage

| Domain | Checked | Limits |
| --- | --- | --- |
| Accessibility | Native labelled form inputs/disclosures; amount chips; dialog focus containment and Escape return; descriptive region and progressbar names, min/max/current values and exact/approximate value text; keyboard-focusable mobile summary; reduced motion; axe scans. New state includes text and the oracle note, so color is not the only cue. | No screen-reader session, physical device, forced-colors test or native 200% zoom. Cross-origin iframe excluded from axe. |
| Layout | Existing shared edges and breakpoints preserved. 1280/800/375, first action at 390, reflow checks to 320; amount input flex sizing, mobile one-line summary/bar, connected My bets grid shrink. | Reflow is not native zoom. No RTL/localization variant is implemented or claimed. |
| Writing | Requested sentences retained verbatim when applicable; singular only for exactly one; approximation and unofficial status explicit; no invented live zero when data/baseline is missing. Other copy preserved. | Existing dormant 2% jackpot sentence retains the previously documented difference from contract logic, as the brief expressly requires it to return when configured. |
| Typography | Existing local IBM Plex Mono regular/bold, six sizes 12/14/16/20/32/48; new block uses 12px and tabular numbers. Amount suffix uses nowrap/min-width. Full mobile values are available through scrolling. | Monospace prose and uppercase brand are preserved visual requirements. |
| Colors | Existing tokens only. Browser-computed solid foreground/background pairs: summary `#f2f0e6` on page `#0b0d0b` **17.07:1**, note `#85aa8b` on page **7.54:1**, bar `#39ff6a` on `#163a1c` **9.47:1**. Eligible probe contrast checks pass. | Solid-pair calculations exclude the faint grid/image pixels and video. The probe leaves 112 image/video/gradient-dependent text boxes unmeasured. |
| UI | Existing button/focus/disabled/hover rules reused. Progress has running, zero, approximate, missing-counter/baseline and outside-window states, with no animation. Native disclosure preference persists and storage failures are caught. | WebKit unavailable. No real wallet approval, signing, funds, passkey creation or physical wallet-app handoff tested. No motion-panel slow replay performed; the added block has no animation. |

## Findings, fixes and rechecks

| Severity and source | Finding and applied change | Recheck |
| --- | --- | --- |
| Medium — `web/src/styles.css:1150` / `:1157` | The amount input's 100% width consumed flex space and allowed the suffix to break. Input now has `flex: 1 1 0`; suffix has nowrap, 3ch minimum and no shrink. | One suffix text rectangle and contained input bounds for all five sheets at 1280/800/375, including a long number. |
| Medium — `web/src/Chat.tsx:240`, `web/src/model.ts:10` | Dynamic chat count always used “messages”. Shared singular/plural formatting applied throughout dynamic counters; already-correct poke behavior retained through the helper. | 21 unit tests plus chat/poke/one-pass browser states. |
| Medium — `web/src/Bet.tsx:474` / `:574` | Jackpot copy appeared despite the unconfigured token. Both pieces now depend on the current chain-read nonzero token. | Absent with zero, restored after configured-token fixture refresh. |
| High during implementation — `web/src/styles.css:1041` | Initial screenshot review found that the new nowrap summary expanded a connected personal-position grid item beyond the phone. Added `min-width: 0` to the grid item. | Rebuilt; connected sleeping My bets at 1280/800/375 asserts no document overflow. Final 375 screenshot is exactly 375px wide. |
| Medium — `web/src/live.ts:115` / `:158`, `web/src/WindowProgress.tsx:16` | New live display must not confuse hardware counts, settlement rounds and game epoch or invent results. Strict BigInt baseline model, independent epoch, approximation/round-only fallback and explicit oracle note implemented. | Boundary/precision/fallback unit tests and 20s poll fixtures; read-only real worker/Ethereum inspection. |
| Medium — `web/src/Bet.tsx:76` / `:430` | How it works was always collapsed. First mount opens it; a persisted default and native toggle state govern later visits. Initial native toggle does not overwrite the later-visit default. | First visit, no-toggle reload, explicit reopen/reload, collapse/navigation/reload all pass. |

## Probe exceptions retained under the brief

The brief says **“Keep design, layout, copy … exactly as they are. Change only the five items below.”** The five failed probe categories reproduce preserved elements rather than a requested redesign:

1. **Layout:** six controls in the existing native intro modal geometrically cover text on the inert page behind it. The actual modal backdrop obscures that content. Dismissed-page and connected My bets overflow checks pass.
2. **Casing:** existing uppercase HAMSTER HOUR brand.
3. **Eyebrows:** existing controls, timer/line labels, hero text and intro controls are classified as kickers; no new kicker was added.
4. **Type-faces:** existing deliberate monospace prose, with one family and two weights.
5. **Chrome:** existing intro video's neon border plus glow.

Render, targets, eligible contrast, tracking, type sizes, glyphs, slogans, repetition, copy budget, motion and share metadata pass. No failed check is presented as a pass. Main game/action visibility at 390 is independently asserted after dismissing the preserved intro.

## Delivery limits

The export is prepared for the existing slot; slot publication/domain propagation happen after this repository submission. No real transaction or production chat write was performed. Live stream playback, WebKit, screen readers, native zoom and physical wallets remain unverified as described above. Required runtime media, fonts, ABIs, deployment record, source and the unchanged lockfile are retained; caches, dependency trees and packaging archives are excluded. The final package/path audit is recorded in [bundle-check.json](maintenance/bundle-check.json).
