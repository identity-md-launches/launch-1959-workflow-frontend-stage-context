# How to play: implementation and validation

## Scope and result

Complete for the requested source and static-export scope. Added an eighth **How to play** tab at `#docs`, a help link immediately below the bet form, eleven short guide sections with pixel icons, desktop sticky/mobile collapsible contents, eight FAQ accordions and contract/command copy controls. All previous tabs, the cozy pixel palette/fonts, wallet flow, betting actions, worker endpoints, chat and leaderboard calculation are preserved. The shared reward-text constant now defaults to the requested Top 5 whitelist message.

The guide reads the line, jar and current/next window times through the existing 15-second contract queries. The current mining rate also comes from the vault. Failed reads show unknown live values with retry while the rules remain readable. UTC timestamps include dates where a window crosses a day. See [rule-by-rule source verification](HOW-TO-PLAY-SOURCES.md) and [contract evidence](how-to-play/contracts.json): all four requested contract runtimes and the vault's mining engine were reproduced from exact source revisions, with immutable handling documented.

This is this worker's evidence, not independent behavior or security certification. Nothing was published or sent to a live wallet or production chat.

## Commands and actual results

Dependencies were installed in a disposable `web/` copy under `/tmp` using the existing manifest and lockfile. No repository dependency directory, registry mirror, lock change or ignore-file change was needed. Node used here reports v24.21.0. Existing source/lock/configuration remains sufficient to rebuild; install/preview instructions are in the root README.

| Check | Command / method | Result |
| --- | --- | --- |
| Install | `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` in the temporary `web/` | Passed, existing lockfile preserved |
| Production export | `npm run build` | Passed; includes `tsc --noEmit`, Vite production bundle, ABI/hash verification and complete asset inventory |
| Separate typecheck | `npm run typecheck` | Passed |
| Unit/worker regression | `npm test` | 54 passed, 0 failed |
| Export integrity | `npm run verify` | Passed; 25 inventoried runtime assets, plus the manifest |
| Full production Chromium suite | `node tests/browser.mjs` with explicit Playwright/browser paths | 32 passed, 0 failed; no page script errors or missing local resources; [results](how-to-play/regression.json) |
| Focused final guide checks | `HH_TEST=docs node tests/browser.mjs` | 5 passed, 0 failed; no page script errors or missing local resources; [results](how-to-play/interactions.json) |
| Guide accessibility | Axe WCAG A/AA tags during guide scenarios | 8 audits at 320/390/800/1440 in both themes, zero selected-rule violations; [results](how-to-play/accessibility.json) |
| Required design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` with explicit Playwright paths | 14/16; layout, contrast, type scale, motion, copy and share checks pass; retained style exceptions below |
| Guide probe | Same probe against the local export's `#docs`, output under `test/scratch/taste-docs` | 13/16; all geometry/contrast/type/motion/share checks pass; 54 opening-screen prose words at 390; retained naming/style exceptions below |
| Source identity and constants | solc 0.8.26 compilation; `eth_getCode`, `eth_call` at the recorded block | Five runtime matches; game/vault complete ABI entry sets match; numeric constants and tolerance/halving boundary calls confirmed |
| Static subpath | Browser suite serves the actual export under `/preview/` | Source JS/CSS/fonts, ABI, deployment, favicon, share image, wallet assets and existing agent files load through relative URLs |
| Rendered computed styles | Chromium `getComputedStyle` on the production export | Geist 400/600/700 loaded; h1 40px, body 16px/25.6px; [solid-pair contrast and component sizes](how-to-play/rendered-styles.json) |
| WebKit attempt | `HH_BROWSER=webkit HH_TEST='docs mobile entry' node tests/browser.mjs` | Could not launch: host system lacks libraries including `libgtk-4.so.1` and GStreamer components; no Safari pass claimed |

The full suite exercised the 27 previous scenarios plus the five new guide scenarios. After the opening copy and fee explanation were tightened, the focused guide suite was rerun on the rebuilt export. Expected fixture errors for deliberately unavailable reward checkpoints are injected test states, not uncaught production script errors.

## Meaningful interaction coverage

- Home at 390×844 retains the camera/hamster before the bet panel and the primary bet action within its 780px content viewport. Its new help link and the header link open the same guide. A visitor can reach the guide without connecting a wallet.
- Every guide section is present. Mobile contents opens and closes with its button; selecting a section collapses it, scrolls to the heading and moves keyboard focus. Direct `#docs-refunds` / `#docs-faq` entry, reload and browser Back preserve the docs view and destination. Desktop contents remains sticky while reading later sections.
- Every FAQ disclosure opens; Enter and Space toggle native summaries. The focused state was screenshot-inspected. No custom keyboard-only substitute or hidden answer text is used.
- All five address links match the existing runtime/configuration and open their exact Etherscan address. Clipboard reads confirm full addresses and the exact install command. A denied clipboard produces an explicit manual-copy instruction, never a false success.
- A changed contract fixture moves the line from 2,100 to 7,777, changes the jar from 158 to 231 IMD and advances the window after the 15-second refresh. The OVER example updates with the line. Dates stay UTC in a German-locale browser. These are labelled test fixtures, not production values.
- A failed refresh removes stale live numbers, leaves all guide rules available and exposes retry; a successful retry restores values. No transaction is submitted by any docs interaction.
- Fee table percentages, the 13.65 IMD worked return, four halving rates and the shared reward text are checked. My bets, Leaderboard, Agents and Make a pick destination links open their existing tabs.
- Reflow checked at 320, 390, 800, 900, 1024 and 1440px, day/night; no document, reading-column or table overflow. RTL reflow and reduced motion were exercised. This is not a native-zoom or physical-phone test.
- Prior primary flows remain covered: exact approvals and bet review, rejected signing, confirmed test receipts, ticket purchase, feeding, sequential claims, rewards failure/retry, wrong runtime, mobile wallet choices, chat signing, telemetry/camera states, leaderboard scanning/cache/refunds/team exclusion and sharing.

Screenshots included from the final controlled browser run: [390 day](how-to-play/docs-390-day.png), [390 night](how-to-play/docs-390-night.png), [1440 day](how-to-play/docs-1440-day.png), [wheel first screen](how-to-play/docs-wheel-390.png), [keyboard focus](how-to-play/docs-focus-390.png). These show controlled contract/service responses; the real-chain verification is separately recorded in contracts.json. Additional full-page/FAQ/error screenshots and raw probe screenshots were inspected in disposable scratch space.

The supplied browser tool also inspected the real export directly, including the overview, the anchored refund box, sticky contents, fee tables, worked example and safety navigation. Live Ethereum values loaded during that inspection. Existing worker requests from a localhost preview sometimes returned CORS errors (`Access-Control-Allow-Origin: null`), and public RPC fallbacks returned some 400/403 responses. These service limitations were not hidden or mistaken for successful live service verification; controlled interaction checks isolate the app's behavior from them.

## Better Interface: six-domain review

The pinned Better Interface workflow and all six core domains were read and applied while building. The existing product is a cozy pixel betting app; the guide's visual idea is a warm reading surface with small pixel markers and clear steps. The documented user direction, “Keep the current cozy pixel design, all tabs and features unchanged,” takes precedence over generic style preferences.

| Domain | Checked coverage and evidence | Remaining limits |
| --- | --- | --- |
| Accessibility | Native headings/landmarks, labelled main/contents navigation, focusable hash targets, keyboard FAQ/contents/copy, decorative SVG semantics, stable status and retry, 44px mobile contents/copy targets, eight passing targeted Axe audits. Viewed the keyboard focus screenshot. | No screen-reader session, forced-colors test, native browser zoom or physical assistive device. Axe is not a full accessibility certification. |
| Layout | Shared source tokens and edges; desktop sticky contents; mobile disclosure; stacked fee/time grids; all six widths and both themes; full addresses/command wrap; first-screen home action; RTL reflow. Final probe finds no horizontal scroll, text overlap, floating-control obstruction or hidden text clipping. | No exhaustive translated-content or every-width claim; no native 200% zoom test. |
| Writing | Source map for every numerical rule; active sentences, friendly existing terms; pari-mutuel and finalization defined inline, vesting explained as gradual unlocking and WL expanded. Fees, voids, exact loss exclusion and separate jackpot claims are explicit. Errors explain recovery. | Night behavior is an observed tendency, not a constant; swarm/audit provenance comes from the requester and is not independently certified. |
| Typography | Reused local Geist/Silkscreen; no new font. Descending h1/h2/h3 roles, 16px/1.6 reading text, 76ch measure, tabular live digits, complete wrapping of addresses/command. Guide probe uses five sizes including one-offs. | No OS/font-rendering claim outside the tested Chromium environment. |
| Colors | Reused day/night palette. Computed solid body/background contrast: 14.59:1 day, 15.66:1 night; muted/card: 5.42:1 / 7.29:1; important-border/card: 6.56:1 / 11.61:1. Final Axe and probe report no measured text contrast failures. | Ratios omit the existing faint film-grain pseudo-element and are not image-composited pixel measurements. Decorative icon variants beyond the recorded peach pair were not separately quantified. |
| UI | Existing pill/button/card system, original local pixel paths, flat non-nested market cards, native FAQ plus/minus cues, copy success/denial, pending/error/retry states, no new animation. Existing reduced-motion stops continuous motion. | No physical-wallet app, passkey, real signing or real-money transaction; no animation-panel replay at 10% speed. The guide adds no animation requiring such replay. |

## Findings, fixes and rechecks

| Severity / source | Observation, correction and evidence |
| --- | --- |
| High · `web/src/Bet.tsx:303`, `web/src/styles.css:3402` | The initial help link above the form pushed the 390px primary action past the existing 780px opening-content limit and shifted Get IMD under the floating chat at desktop probe size. Moved the help link immediately after the form. The original first-screen regression now passes; final wheel probe reports no floating overlap. |
| Medium · `web/src/Docs.tsx:224`, `web/src/Docs.tsx:277` | Initial introductory and jar copy made the guide opening too wordy under the probe. Shortened the subtitle and jar note while retaining all rules and the separate prize-finalization explanation. Final guide copy-budget check passes at 54 words on the 390 opening screen. |
| Medium · `web/src/Docs.tsx:480` | “Chronological jackpot finalization” was too technical for a new player. Replaced it with prizes fixed “in hour order (called finalization).” Fee tables and focused browser checks pass on the rebuilt export. |
| Preventive · `web/src/Docs.tsx:90` | Clipboard access may be denied. CopyButton catches failure, retains selectable full text and announces a manual-copy instruction. Both actual clipboard success and forced denial paths pass. |
| Test synchronization · `web/tests/browser.mjs:940` | An early test read the FAQ `open` attribute before the native Space/Enter toggle completed; another inspected next-window dates while their refreshed query was still resolving. Wait for the corresponding rendered state instead of asserting during the transition. Final 32-scenario regression and focused five-scenario run pass. No game logic changed. |

Retained probe exceptions, confirmed against screenshots and the requested design:

- **Header pills flagged as eyebrows:** “The wheel” / “How to play” are the existing main-navigation active pill, not an extra content kicker. The header convention is preserved.
- **Border plus shadow / nested field:** chunky primary/category button shadows and the bet amount field are part of the existing cozy pixel system; the new Make a pick links reuse its primary button. New market cards are flat and are not nested inside other cards.
- **Guide uppercase labels:** OVER / UNDER and HAMSTER / IMD are required market/token names. The probe flags those strings, not a new tracked-uppercase label system. Content prose stays in normal case.

Raw probe records are retained as [wheel](how-to-play/taste-wheel.json) and [docs](how-to-play/taste-docs.json). No guide finding that blocks reading or a primary interaction remains open.

## Delivery and limits

The complete `dist/` is copied byte for byte from the tested temporary build. It retains required `.well-known/agent-skills` discovery/ZIP files, all existing runtime assets and the original source lockfile; obsolete hashed build files were removed. Source/configuration/dependency integrity and the conservative changed-file byte budget are recorded in [delivery.json](how-to-play/delivery.json). No ignore file was edited, no submodule was created and no package archive/cache/dependency tree was added.

Static hosting, real wallet signing, production service availability, WebKit/Safari and native-device behavior are outside the recorded successful checks. The WebKit launch specifically answered that its host libraries were missing. Those limits do not change the actual Chromium/build/typecheck results above.
