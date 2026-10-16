# Hamster Hour frontend validation

Reviewed on 2026-10-16. This report describes the final source in `web/` and the production export in `dist/`. These are worker observations, not independent certification. No mainnet approval, wager, oracle purchase, settlement, deployment or publication was performed.

| Area | Result |
| --- | --- |
| Six requested changes | Implemented; external-service and live-transaction limits below |
| Product and primary action on the first 390px screen | Yes, after the requested first-visit intro; primary buttons end at about 577px in the 844px viewport |
| Production build, typecheck and export integrity | Passed |
| Model/protocol tests | 13 passed |
| Chromium interaction scenarios | 11 passed with explicit RPC/wallet/API fixtures |
| Automated accessibility | Zero axe violations across eight surfaces |
| Horizontal overflow | None at 320, 375, 390, 768 and 1440px |
| Pinned taste@1 probe | 11/16 raw passes; five reviewed exceptions explained below |
| Share metadata | Title, description, favicon, og:title and og:image present |
| Live integration | Public Ethereum reads, capabilities and Intake price checked; real YouTube playback observed |
| Literal zero-console-error target | Not met: the required optional current.json attempt is denied by the external server's CORS policy |

The visual idea is a dark grid betting terminal, lit by neon green and an orange-and-cream pixel hamster with green goggles. The original React/Vite/TypeScript stack, wallet infrastructure, Solidity, ABIs, dependencies and build configuration remain intact.

## Requirement coverage

| Requested behavior | Implementation and evidence |
| --- | --- |
| “Embed the YouTube player directly” | `Stream.tsx` renders the specified ID immediately, 16:9, muted/autoplay/lazy. The source link remains. Only a valid returned publicId changes the player. A blocked feed leaves the working embed visible. Chromium tests cover failure and a successful ID change; actual playback was visually inspected. |
| “Buy oracle answer” before manual paste | `OraclePurchase.tsx` reads `question(k)` and builds the exact 24-hour, uint256, 20/14 panel body with the HamsterHour consumer. The paid route resolves the public Ethereum Intake, confirms code/token/action/0.5 IMD price, approves and requests. It saves the payment hash, polls at 15 seconds, links the panel, verifies a delivered signature and prefills Settle. The fixture test decodes the actual request and settlement calldata and exercises reload recovery. |
| “Only allow buying when the window has ended and has bets” | UI gating and fresh checks before payment enforce funded, open-for-settlement windows before the 48-hour deadline. Future and empty-window tests pass. The reserve reimbursement note and manual fallback remain. |
| “TEAM … otherwise read-only” | All four settings show current and pending values, pending hashes and execute dates. Pending bytes are decoded from public events. Only an exact TEAM address match renders inputs and Schedule/Execute. Both visitor and TEAM fixture states pass. |
| “OVER, UNDER, SLEEPING” → amount → bet | Three primary buttons open one amount sheet with 1/5/10/25 IMD chips and a custom amount. One UI action performs approval when needed and exactly one bet. Existing allowance requires one transaction; a new allowance requires approval plus bet, and a short nonzero allowance can require a reset first. The screen shows Approving, Placing and confirmed estimated return. |
| “pays x1.8” from live pools | Multipliers use the actual market pools and fee floors and refresh with chain reads. Empty pools show “No bets yet”; one-sided pools show the refund rule rather than a fabricated multiplier. |
| EXACT secondary; all on-chain features retained | EXACT is behind “Guess the exact number”; RUNNING, future-window lookup and jackpot details remain in How it works. Stake/unstake/rewards, both claim overloads, history, timeout refunds, reserve donation and all four TEAM pairs remain reachable under More. |
| Plain player copy and result cards | Bet uses the requested two explanatory lines. Technical terminology is contained in How it works, Settle, TEAM and documentation. Results show passes, winning sides, the wallet's remaining payout, a matching mascot and Claim. |
| “Claimable windows surface automatically” / “My bets” | Wallet-specific events are discovered from the deployment block. Current/next positions and earlier results need no window-number lookup. Claim arithmetic covers refunds, exact ties, binary fee floors, last-claim rounding, jackpot shares and settlement reimbursement. Automatic discovery and Claim pass in Chromium; arithmetic cases pass in unit tests. |
| Wallet, balance, Get IMD and X | Existing EIP-6963, mobile wallet-browser links and Coinbase Smart Wallet share one connect control. A low balance exposes an ETH→IMD Uniswap link using the real token address. Header/footer X and both footer contract links are present. Real native-wallet signing remains untested. |
| “First visit … video … remember dismissal” | The supplied MP4 is bundled locally, muted, inline and looping. Start playing, Escape, close and outside tap dismiss the native dialog; localStorage remembers it. Follow on X opens a new tab. Pause and reduced-motion support are included. Fresh 375px and 1440px intros and return visits pass. |
| Terminal visual style and mascot | Requested palette, faint 25px grid, local IBM Plex Mono, square controls and neon glow are implemented. Original front, happy, sleeping and wheel-running SVGs supply logo/favicon/loading/results/desktop art; a local PNG supplies og:image. No stock imagery or fabricated live numbers are shipped. |
| Static export and documentation | Complete relative-URL `dist/`, unchanged source lockfile, root `DESIGN.md`, and install/preview/rebuild instructions are present. No runtime depends on the temporary `.imd/reads` inputs. |

## Commands and actual results

Dependencies were installed in a temporary build copy outside the repository. The protected existing manifest and lockfile were not modified. Plain `npm ci` failed because the lockfile omits the accessibility tool's `playwright-core` peer; `npm ci --legacy-peer-deps` successfully installed the pinned graph. No repository `node_modules`, registry mirror, package archive or new ignore rule was introduced.

| Command / check | Actual result |
| --- | --- |
| `npm run typecheck --prefix /tmp/hh-build/web` | Passed TypeScript without emit. The production build also runs this check. |
| `GIT_DIR="$PWD/.git" npm run build --prefix /tmp/hh-build/web` | Passed TypeScript, Vite and export generation; the complete generated directory was copied to root `dist/`. |
| `GIT_DIR="$PWD/.git" npm run verify --prefix /tmp/hh-build/web` | Passed asset inventory/hash reconstruction and canonical ABI binding. 22 declared assets, 1,637,242 bytes excluding the manifest. |
| `npm test --prefix /tmp/hh-build/web` | 13/13 passed: existing ABI/model cases plus claim calculations, request body and Intake calldata. |
| `IMD_PLAYWRIGHT=/tmp/hh-browser/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/hh-browsers node /tmp/hh-build/web/tests/browser.mjs` | 11/11 Chromium scenarios passed. Fixture rejection messages are expected test output. No app JavaScript exceptions or missing local resources in this harness. |
| Same Playwright variables with `npm run test:accessibility --prefix /tmp/hh-build/web` | Zero axe violations on Intro, Bet, Stake, History, Settle, TEAM, amount sheet and wallet picker. Reduced-motion video was paused; Escape returned focus to Bet OVER. Five viewport overflow checks passed. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/hh-browsers IMD_PLAYWRIGHT=/tmp/hh-browser/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Executed from repository root against the final export. 11/16 raw passes; no script errors, missing local files, horizontal scroll, overlapping text or clipped text. Exceptions below. |
| `forge test --out /tmp/hh-forge-out --cache-path /tmp/hh-forge-cache --match-contract OracleTest` | Existing contract tests: 16 passed, 0 failed. Signature/domain/question/panel/time/replay behavior tested without changing contracts. |
| Actual production export via browser tool at `/preview/` | Visually inspected mobile and desktop live playback, local intro video, primary choices, font loading and overflow. Both 400/700 WOFF2 faces loaded. At 1440×1000 and 375×812 the local intro video was playing with readyState 4. |
| WebKit launch | Could not run: Playwright reported missing GTK/GStreamer and related system libraries. No Safari success is claimed. |

`GIT_DIR` above points the temporary build copy to the existing pinned source history for read-only ABI verification. Normal installation/rebuild commands for a checkout are in the root README and `web/README.md`. The build, typecheck, interaction and accessibility results were followed only by font-format/grid refinements; the final production build, ABI verify, real-browser inspection and taste probe include those refinements. No application behavior changed after the passing interaction run.

Retained machine-readable evidence in `docs/frontend/`: `interaction-results.json`, `accessibility-results.json`, `taste-summary.json`, `live-read.json`, `build-results.json` and `package-check.json`. Browser fixtures live only under `web/tests/`; they are not imported by production source. The signed-answer fixture uses a freshly generated test-only signer and intercepted verifier reads; it is not a production attester signature.

## Better Interface: six-domain review

The pinned Better Interface workflow and the core principles of all six domains were used during implementation and this final review. Supporting dialog, keyboard, forms, motion, type, color and responsive guidance informed the implementation. The final source tokens/components are documented in root `DESIGN.md`. The requested terminal style takes precedence over generic defaults.

| Domain | Checked coverage and result | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility | Native buttons/links/dialogs, input labels, named controls, focus outline, keyboard dismissal/focus return, reduced motion and eight-surface axe audit. No reported axe violations. | No screen-reader session, physical assistive technology, native browser zoom or forced-colors device session. An accessibility tree is not a screen-reader test. |
| Layout | Actual export at 320/375/390/768/1440; game controls on the first mobile screen; amount/wallet sheets; disclosure under More; long address wrapping. No measured horizontal overflow. | No native 200% zoom or RTL mirror. English-only dark interface; no additional localization/theme was requested. |
| Writing | Requested player lines, plain action/error/empty text, technical terms isolated to appropriate panels, honest unconfigured-token and empty-pool states. Approval/network fees, estimated returns and oracle payment consequences are explained near actions. | No claim that third-party oracle evidence is factually correct or delivery guaranteed. |
| Typography | One locally loaded family, two supplied weights, six sizes, tabular numbers, 16px inputs, wrapping long values. Both actual WOFF2 faces loaded in the final browser session. | Physical-device font rasterization and browser-native zoom unverified. Monospace prose/uppercase brand intentionally follow the brief. |
| Colors | Tokens checked in source; declared solid pairs calculated; rendered axe/probe checks passed eligible text. Text/state labels accompany colors. Dim copy kept off the raised surface and grid opacity reduced. | The probe skipped 74 text boxes over image/video/grid backgrounds. Their full rendered pixel contrast and cross-origin YouTube content are not claimed measured. Dark-only is intentional. |
| UI | Rest, focus, hover/press styles, loading, empty, disabled, invalid, rejected, pending and success states reviewed. Approval→bet and paid request→poll→verified result flows exercised. Native dialogs, one Claim action and transaction locks preserve task context. | No 10%-speed DevTools animation replay, real extension signature, native wallet deep-link launch or Coinbase passkey creation. External video behavior depends on its host. |

## Findings fixed and rechecked

| Severity / root cause | Final source | Evidence, correction and recheck |
| --- | --- | --- |
| High: cam depended on a blocked discovery feed | `web/src/Stream.tsx:40` | Direct requested ID now renders independently; discovery failure cannot replace it with an unavailable panel. Failed-feed fixture and real YouTube playback checked. |
| High: main player path had too many controls/steps | `web/src/Bet.tsx:105`, `web/src/styles.css:412` | Three main buttons open amount chips; one action approves as needed and submits one bet. Other markets/settings moved behind disclosure. Chromium asserts approval/bet calldata and mobile button bounds. |
| High: results required a window lookup | `web/src/portfolio.ts:32`, `web/src/MyBets.tsx:26` | Real wallet events discover positions and results automatically; payout/Claim cards use live state. Automatic claim scenario and rounding/refund tests pass. |
| High: no browser paid-oracle path | `web/src/oracle.ts:18`, `web/src/OraclePurchase.tsx:115` | Added exact body, price-checked Intake route, persistence, polling, panel link and cryptographic prefill. Full intercepted paid-request→settle scenario passes; production delivery remains unverified. |
| Medium: TEAM editing controls exposed to visitors | `web/src/Settings.tsx:77`, `web/src/Settings.tsx:107` | Public decoded proposals/dates remain visible; only TEAM renders editing controls. Visitor and TEAM fixtures pass. |
| Medium: dialog could disappear during approval/bet | `web/src/Sheet.tsx:2`, `web/src/Bet.tsx:394` | Close/Escape/backdrop are locked during the combined flow so progress stays visible. Transaction rejection releases the flow; focus restoration checked. |
| Medium: form errors shared unrelated context | `web/src/Bet.tsx:48` | Window-lookup errors and amount-sheet errors have separate state. Rejection and invalid-amount scenarios pass. |
| Medium: dim text on a stronger grid/surface needed care | `web/src/styles.css:17`, `web/src/styles.css:46` | Secondary surface copy uses the brighter muted token; the requested dim token stays on the dark page. Grid strokes reduced to 25% opacity. Final probe passes measurable contrast pairs; image-backed pairs remain explicitly unmeasured. |
| Low: font packaging and loading | `web/src/styles.css:1` | Bundled only regular/bold Latin WOFF2 with the license. The final export is smaller and both weights loaded in the actual browser. |

## Probe exceptions, not hidden passes

1. **Layout:** the probe reports five floating controls covering background text. These are controls in the requested native full-screen intro dialog; the underlying page is obscured and inert. The visible dialog itself has no overlapping/clipped text. Separate dismissed-page measurements show no horizontal overflow or hidden main action.
2. **Casing:** the flagged “HAMSTER HOUR” is the exact requested bold uppercase title.
3. **Eyebrows:** “Place your bet in” and “The line” label live numbers, not marketing kickers. The third flag compares background “More” with the foreground modal title. Removing these data labels would harm comprehension.
4. **Type-faces:** one monospace family for prose is explicitly required. There are two weights and six sizes.
5. **Chrome:** the intro frame combines border and shadow to implement the explicitly requested neon frame/glow. There are no nested cards or gradient text.

The raw results remain 11/16. Nine utility targets are below the probe's comfortable 44px size but meet its 24px-or-spacing criterion; primary betting, wallet and purchase controls use larger targets. These counts do not establish full accessibility compliance.

## Live evidence, screenshots and limits

`live-read.json` records chain 1 at block **26205042**, both deployed code bodies, the matching verifier, current window **84**, line **1000**, no bets since deployment, no configured staking/jackpot token and zero oracle reserve. These are actual chain states, not placeholders. Production RPC sources are the pinned public endpoints. The protocol capabilities response and `priceOf` confirmed the Ethereum v2 Intake and exactly **0.5 IMD**. The site does not invent missing pools, history or $HAMSTER rewards.

Inspected screenshots: `docs/frontend/390.png` and `1440.png` show the real live feed and chain reads; `intro-375.png` and `intro-1440.png` show the local supplied video. `mobile-wallet-picker.png` is the final production export in Chromium with an iPhone 13 user agent; it shows all four native wallet-browser links and Coinbase Smart Wallet, without launching those external apps. `bet-success-390.png` is explicitly fixture-driven interaction evidence. Screenshot window/countdown values can differ from the earlier fixed-block read.

There were **no application JavaScript exceptions or missing local assets** in the checked export. In a real-source session Chromium logged two errors for the mandated background `current.json` request: missing `Access-Control-Allow-Origin`, followed by `net::ERR_FAILED`. The catch preserves the working cam and does not repeatedly retry. Browser warnings also included overlapping fullscreen permissions and an external YouTube adapter warning. Literal zero console errors cannot be claimed while this required cross-origin attempt meets the source's present policy. No unrequested proxy/backend was added.

Mainnet has no funded finished window in the recorded state, so an actual paid panel and valid production settlement could not be exercised. The browser fixture validates transaction construction, response verification, persistence and flow; the existing Solidity tests validate the verifier locally. Neither is a mainnet end-to-end result. Physical wallets, passkeys, Safari/WebKit, screen readers and native zoom remain unverified. Public RPC, API CORS, panel availability and YouTube embedding permissions can change independently of this export.

Implementation and the runnable local validation are complete. The live paid-settlement acceptance remains unverified, and the external CORS console-error limitation remains. The complete production export is 1,642,451 bytes including its manifest. The candidate source, documentation and export total about 5.1 MB of uncompressed file content, below the 8,388,608-byte budget; a compressed snapshot is about 3.2 MB. The path audit found no protected-file changes, ignore changes, submodules, dependency/cache directories or package archives in the candidate. Exact counts are in `package-check.json`. Publication and IPFS pinning are downstream work; no publication or Git commit is claimed here.
