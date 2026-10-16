# Hamster Hour frontend validation (v2: live or sleeping, chat, meme layer)

**Historical implementation record:** this report predates the four reopened findings. The current [revision report](REVISION.md) reproduces and resolves those findings, corrects the wallet and mood behavior described below, and records the rebuilt export's checks. Original observations and artifacts are retained here without presenting them as new verification.

Reviewed on 2026-10-16 against the final source in `web/` and the production export in `dist/`. These are the worker's own observations, not independent certification. No mainnet approval, wager, chat signature from a real wallet, oracle purchase, settlement, deployment or publication was performed. The deployed contracts, ABIs, addresses, RPCs, wallet connectors and transaction code are unchanged.

| Area | Result |
| --- | --- |
| Six requested changes | Implemented; limits listed below |
| Critic's four findings | Closed, each with a Chromium scenario |
| Product and primary action on the first 390px screen | Yes: OVER / UNDER / SLEEPING end at 670px of 844 (661px at 375×812) |
| Production build, typecheck, export verify | Passed |
| Unit tests (`npm test`) | 15 passed (13 existing + live parsing/mood + chat rules) |
| Chromium interaction scenarios (`npm run test:browser`) | 17 passed with RPC, wallet, proxy and YouTube fixtures |
| Automated accessibility (axe, 8 surfaces) | 0 violations; no horizontal overflow at 320/375/390/768/1440 |
| Real-network check on the allowed `localhost:5173` origin | Live `/live`, `/status`, `/chat` answered; SLEEPING screen rendered; **0 console errors**, 0 failed requests at 375 and 1440 |
| Pinned taste@1 probe | 11/16 raw passes; five explained exceptions below |
| Share metadata | Title, description, favicon, og:title, og:image present |

## Requirement coverage

| Requested behavior | Implementation and evidence |
| --- | --- |
| 1. Reverted/cancelled oracle payment shows the failed receipt and restores Buy | `OraclePurchase.tsx`: a `phase: "error"` transaction state whose hash equals the saved payment clears the saved purchase and local storage, renders a "View failed receipt" link and the Buy button. Scenario "a reverted oracle payment shows the failed receipt and restores Buy" (`docs/frontend/oracle-failed-390.png`). |
| 1. Invalid window lookup shows the error and "Back to next open window" | `Bet.tsx`: `w.isError` renders an error notice with the decoded contract reason and the back control; multipliers read "Pool unavailable" instead of "Reading pool…"; the disabled reason uses the error text. Scenario "an invalid window lookup shows the error and a way back". |
| 1. One detected wallet connects in one tap | `Wallet.tsx` `show()`: exactly one named EIP-6963 extension (and not a phone) connects directly; the picker appears only with several wallets or none (Coinbase/phone rows). The control shows "Connecting…". All connect scenarios use the one-tap path; the accessibility run still audits the picker (no provider present). |
| 1. Primary dark fill + 1px neon border + glow on hover; secondary text #5a8f63 | `styles.css` `.primary` / `.secondary`; selected amount chips follow the same dark scheme. |
| 1. Remove "Bet RUNNING: at least one pass" from How it works | Removed. RUNNING remains an on-chain feature, now reached by a switch inside the SLEEPING sheet ("Bet RUNNING instead"); covered in the poke/easter-egg scenario. |
| 2. Live or sleeping through the proxy | `live.ts` polls `GET /live` every 20 s. `state === "live"` with `playback.kind === "youtube"` embeds `https://www.youtube.com/embed/<publicId>?autoplay=1&mute=1` and switches on publicId change; anything else shows the 16:9 SLEEPING screen (dark, curled pixel mascot, drifting zzz, "HAMSTER IS SLEEPING · stream is off", last known mm/s and cumulative passes from `/status`). Proxy failure embeds the last live id remembered in this browser, else the channel's last known stream `6K_uF2s-LSw`; a blank box is never shown. Badge "LIVE" green / "SLEEPING" dim. Scenarios cover idle at 375 and 1440, live, id switch and proxy failure; the real idle feed was rendered in the real-network check (`sleeping-375.png`, `sleeping-1440.png`, `390.png`, `1440.png`). |
| 3. Wheel chat | `Chat.tsx`: `GET /chat?since=<ms>` every 5 s, append, keep 200, autoscroll unless scrolled up ("Jump to newest"). `POST /chat` with `{address, message, signature, ts}` where the signature is `personal_sign` of `"Hamster Hour chat\n" + ts + "\n" + message` via the connected wallet's provider. Client rules: 200 chars, no links, one message per 5 s; server errors mapped to plain words ("Slow down: one message every 5 seconds.", "No links in chat."). Sender shown as `0xab12…cd34` with a deterministic 5×5 pixel identicon; "bet" tag when `position(k, address)` is non-zero for the current or next window. Not connected: read-only plus "Connect to chat". Messages are rendered as React text (escaped; no markdown/HTML). Right column on desktop, below the buttons on mobile. Scenario posts a signed message, checks the exact signed string, the escaped `<b>` payload, the bet tag, a server rejection, and that a second visitor sees the post within one 5 s poll. |
| 4. Poke the hamster | Web Audio square-wave squeak (no file), mascot hop, per-visitor counter in localStorage ("poked N times"). Scenario checks increments and persistence across reload. |
| 4. Hamster mood in the header | `live.ts` `mood()`: sleeping at zero speed; stretching below 30 % of the line pace; cruising between; zoomies above the line pace; villain era when the current window's passes (first `/status` sample seen in the window, stored locally) exceed 2× the line, or speed exceeds 2× the line pace. Line pace = line × 21 cm ÷ 3600 s. Unit-tested. |
| 4. Losing result card | Small looping chewing video, "you fed the hamster", "$HAMSTER mining coming soon", "share my L" X intent with window number and passes (`result-loss-390.png`). |
| 4. Winning result card | Pixel sunflower-seed confetti, goggled thumbs-up mascot, "share my W" (`result-win-390.png`). |
| 4. Sleeping dim / live pulse | `.page-sleeping` dims the shell 10 % (brightness 0.9); zzz drift over the player; a not-live → live transition during the visit fires one green pulse and a 3 s "HE'S RUNNING" banner. |
| 4. Easter eggs | Ten logo clicks within a run add black pixel sunglasses and "deal with it"; the Konami code spins the page one full turn (`.spin`). Scenario covers both. |
| 4. Jackpot digits | `SlotNumber` rolls each digit on a 0–9 reel when the value changes; used for the available jackpot and the desktop pool total. |
| 4. Reduced motion | Animations and transitions are disabled; zzz render static; confetti hidden; no spin or hop; the chewing video does not autoplay. Probe: no endless animation under reduced motion. |
| 5. Copy | Tooltip "passes = wheel turns, about 21 cm each" on a 24px "?" control under the line (hover/focus/tap); the EXACT sheet shows the requested line verbatim; "Betting on window N · starts in MM:SS · result about 1 h after start" sits under the countdown. |
| 6. Live, real, responsive | All numbers come from chain reads, `/live`, `/status` and `/chat`; nothing is fabricated. No horizontal scroll at 320–1440. Zero console errors in the real-network check. |

**Flag for the requester:** the EXACT line "The jackpot pays only if the closest guess is within 2% of the result" was added exactly as requested, but the deployed `HamsterHour` contract has no 2 % condition: the closest tier shares the jackpot at any distance (`src/HamsterHour.sol`, `_claim`). The copy therefore understates what the contract pays. If that is not intended, change the sentence or ship the rule in a future contract.

## Commands and actual results

Dependencies were installed in `web/node_modules` with `npm ci --legacy-peer-deps` (not committed). The protected manifest, lockfile and build configuration were not modified. Playwright 1.64 (Chromium 1248) was taken from an existing install outside the repository via `IMD_PLAYWRIGHT`.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` (tsc, Vite, export script) | Passed; 24 assets, 1,662,688 bytes excluding the manifest; ABI hashes match the handoff |
| `npm run verify` | Passed |
| `npm test` | 15/15 |
| `node tests/browser.mjs` | 17/17 Chromium scenarios; "fixture error" lines are expected rejection output |
| `node tests/accessibility.mjs` | 0 axe violations on Intro, Bet, Stake, History, Settle, TEAM, amount sheet, wallet picker; reduced-motion video paused; Escape returned focus to Bet OVER; no overflow at five widths |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 11/16; raw output in `taste-summary.json` |
| Real-network smoke script (scratch, served at `http://localhost:5173/preview/`) | Both widths: badge SLEEPING, mood "sleeping", last known `0 mm/s · 45,200 passes total`, chat "0 messages", no overflow, `errors: []`, `failed: []` |

The proxy's CORS allowlist admits the production origin `https://hamster-hour-bet-on-the-wheel.sites.imd.fun` and `http://localhost:5173`; it answers `Access-Control-Allow-Origin: null` (403) to other origins such as `http://127.0.0.1:<port>` or an IPFS gateway. From a disallowed origin the site degrades as designed: fallback embed, "mood: unknown", chat "reconnecting…", and the browser logs CORS errors that the site cannot suppress. Local validation therefore used `localhost:5173`. Any other hosting origin needs the requester to extend the worker's allowlist.

## Better Interface: six-domain review

The workflow section and the core principles of all six domains were applied while building the new surfaces (player states, chat, poke row, result cards, tooltip) and in this review. The requested terminal style, monospace prose, uppercase brand and neon frame remain authoritative.

| Domain | Checked | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility | Native buttons/links/form; labelled chat input (visually hidden label), `role="log"` with `aria-live="polite"`; badge and banner as `role="status"`; tooltip via `aria-describedby` + `role="tooltip"` reachable by keyboard; identicons and seeds `aria-hidden`; 24px "?" control (spacing rule), other new targets ≥ 40px; reduced motion honoured; axe clean. | No screen-reader session, forced-colors device or native zoom; synthesized sound has no visual-only dependency (counter changes too). |
| Layout | 375/390/768/1440 inspected; chat is the right column on desktop and below the buttons on mobile; 16:9 slot measured for the sleeping screen; first-screen action at 390 kept by compacting the poke row and clock. | Tablet 768 checked at 1024 tall (portrait tablet), not 844. |
| Writing | Server errors in plain words; chat hint states "signed by your wallet, no gas · no links"; failed payment text says nothing was paid; invalid window explains and offers a way back. | The requested 2 % jackpot sentence conflicts with the contract (flagged above). |
| Typography | Six sizes unchanged (12–48); new text uses 12/14/16/20. Digit reels keep tabular numerals. | Monospace prose is the brief's choice (probe exception). |
| Colors | Primary now dark with green border; secondary `#5a8f63` on `#0b0d0b` (5.15:1 computed); badge SLEEPING dim on near-black; identicon hues are decorative only, address text carries the identity. | Rendered contrast over video/confetti not measured. |
| UI | Loading/empty/error/read-only/sending states for chat; sleeping/live/fallback/loading for the player; failed/pending/confirmed for the payment; hover glow, focus rings, reduced-motion equivalents. | No real extension signature or phone-wallet deep link exercised. |

## Findings fixed and rechecked

| Severity / root cause | Source | Fix and recheck |
| --- | --- | --- |
| High: failed oracle payment looked like a saved purchase; Buy gone | `web/src/OraclePurchase.tsx` | Error-state hash match clears the purchase, shows the failed receipt, restores Buy. Scenario passes. |
| High: invalid window left "Reading pool…" forever | `web/src/Bet.tsx` | Error notice + back control; "Pool unavailable". Scenario passes. |
| Medium: one wallet still needed two taps | `web/src/Wallet.tsx` | Direct connect for a single detected extension. All connect scenarios pass. |
| Medium: filled primary buttons broke the dark terminal scheme | `web/src/styles.css` | Dark fill, 1px neon border, hover glow; secondary dim. Probe contrast passes. |
| Medium: new rows pushed OVER below 844 at 768 wide | `web/src/styles.css` | Compacted poke row, clock and window line; tablet measured at its 1024 height. First screen at 390 holds. |
| Low: live badge carried border + shadow (probe `chrome`) | `web/src/styles.css` | Shadow replaced by a text glow. |

## Probe exceptions, not hidden passes

1. **Layout:** the six "floating controls over text" are intro-dialog controls over the inert page behind the native modal; the dismissed page has no overlap or overflow.
2. **Casing:** "HAMSTER HOUR" is the requested uppercase title.
3. **Eyebrows:** "Place your bet in", "The line", "Window 85" label live numbers; "Poke the hamster" is a button, not a kicker.
4. **Type-faces:** one monospace family for prose is the brief's requirement.
5. **Chrome:** the intro frame's border + glow is the requested neon frame.

## Limits

Live stream playback could only be observed through the fixture (the real wheel was idle during the run, which is exactly the SLEEPING path). The "HE'S RUNNING" transition, villain-era mood and winning/losing cards were exercised with fixtures, not mainnet state (mainnet has no settled funded window). Chat signatures used an intercepted provider; the server's signature verification was not bypassed or tested with a real key. WebKit, screen readers and physical devices were not run. The committed export is 1,662,688 bytes plus the manifest; no dependency or cache directory is committed.
