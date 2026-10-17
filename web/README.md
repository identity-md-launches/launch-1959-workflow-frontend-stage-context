# Hamster Hour website

A static React/TypeScript app for the existing Ethereum HamsterHour and OracleVerifier contracts. The primary screen is the live wheel, countdown, line, OVER / UNDER / SLEEPING buttons, and the wallet’s bets and results. Stake, History, Settle and TEAM live under More. EXACT and the opposite sleep side (RUNNING) remain available through secondary controls.

## Install, preview and rebuild

From `web/`, with Node 24 and npm:

```sh
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
npm run verify
npm run preview -- --host 127.0.0.1
```

The existing manifest, lockfile and build configuration are protected and unchanged. `npm ci` alone fails because the lockfile omits the `playwright-core` peer of the accessibility tool; `--legacy-peer-deps` installs the pinned graph without rewriting it. No registry mirror or vendored npm package is needed. `npm run dev` starts development mode after an initial build.

The build exports to `../dist/` with Vite `base: "./"`. Keep that whole directory when hosting, including `abi/`, local fonts, mascot assets, the supplied MP4, and `imd-deployment.json`. Use HTTP or a static gateway subpath; `file://` cannot support the app’s configuration fetch. No rewrite rules, backend, API secret, relay, WalletConnect project ID or server process is needed at runtime.

The export script compares the ABI files with pinned source commit `7ab2a01b3d9a15e2acca8b317e77058e6f2d41e9`, checks canonical ABI hashes against the deployment handoff, and hashes all output assets. A rebuild needs that Git commit available in the checkout. Source handoffs are copied into `web/deployment/`; the temporary `.imd/reads/` inputs are not runtime dependencies.

## Live data and wallets

- `config.ts` validates the public deployment record and ABIs; `data.ts` checks chain ID, deployed code and the game’s verifier before transactions. Public production RPCs are the pinned Ethereum endpoints, with fallback. Reads refresh about every 12 seconds and after confirmed writes. No sample values or mock transport enter `dist/`.
- `Wallet.tsx` retains named EIP-6963 extension discovery, a native wallet picker, MetaMask/Coinbase/Rabby/Phantom mobile browser links, Coinbase Smart Wallet, chain switching/addition and disconnect. One header control directly connects a sole detected wallet, including a legacy `window.ethereum` provider. Named discovery suppresses the generic duplicate; multiple wallets or no detected provider keep the picker. Physical wallet apps and passkey creation require a visitor’s wallet and were not exercised with real funds.
- `transactions.tsx` checks wallet account/network, simulates, estimates gas, requests the wallet signature, waits for confirmation, follows replacements and persists an unresolved transaction. An unresolved receipt prevents duplicate actions. The visitor always controls approvals and transactions.
- `Bet.tsx` combines exact-amount approval and one bet into one UI action. Existing allowances skip approval; an insufficient nonzero allowance is reset before exact approval. A funded wallet may therefore sign one, two or three transactions, but only one is a bet. Amount chips are 1 / 5 / 10 / 25 IMD. Current pool multipliers and estimated returns include the stake and change as bets arrive; uncontested pools are refunded.
- `portfolio.ts` discovers the wallet’s `Bet` and settler events from the pinned deployment block in bounded RPC ranges. TEAM also discovers its settlement credits. `MyBets.tsx` reads actual positions, shows current/next-hour bets, pending results, refunds, winning payouts and Claim. Payout arithmetic preserves contract fee floors, exact-ticket ties, final-claim rounding, separate jackpot claims and oracle reimbursement. Historical lookup remains in History.
- `Settings.tsx` reads all four current settings, pending hashes, decoded `ConfigScheduled` values and execution dates for everyone. Inputs and Schedule/Execute are rendered only when the connected address equals `TEAM()`. The contract independently enforces authorization.

## Oracle purchase and closing a window

Open More → Settle. Select a finished window that has bets and is still within its 48-hour deadline. “Buy oracle answer” shows a reviewable request and a 0.5 IMD purchase. It reads the exact `question(k)`, uses the protocol’s free preflight, obtains the Ethereum Intake from public capabilities, confirms the on-chain price and asks the wallet to approve and request. No project-owned key is involved.

The body contains `v:1`, `chainId:1`, `window:{hours:24}`, `answerType:"uint256"`, `evidence:"panel"`, `panelSize:20`, `quorum:14`, `validForSeconds:86400` and `consumer:{chainId:1,verifyingContract:HamsterHour}`. See [the full integration documentation](../docs/ORACLE.md).

The payment hash is remembered locally. The UI polls the Intake status to obtain the oracle UUID, shows the panel on `explorer.imd.fun`, polls the signed answer every 15 seconds, verifies it and fills the manual JSON field. “Settle” submits the actual deployed ABI tuple. Anyone can still paste a separately acquired signed response. The successful caller may claim 0.5 IMD from a funded reserve on a fee-bearing window; reimbursement and panel delivery are not guaranteed. The 48-hour refund action and reserve donation remain available.

## Live or sleeping, chat and the meme layer

The site never calls squeekchain.com directly. `live.ts` polls the project proxy `https://hamster-hour.hamsterhour562.workers.dev`: `GET /live` (mirror of `media.squeekchain.com/live/current.json`) every 20 s and `GET /status` (mirror of `api.squeekchain.com/v1/status`) every 20 s. `Stream.tsx` embeds `https://www.youtube.com/embed/<publicId>?autoplay=1&mute=1` when `state` is `live` and `playback.kind` is `youtube`, switching when the id changes; otherwise it shows the SLEEPING screen in the same 16:9 slot with the last known `measurement.speedMmPerSecond` and `cumulativeWorkUnits`. If the proxy fails it embeds the last live id remembered in this browser, falling back to the channel's last known stream `6K_uF2s-LSw`. The proxy's CORS allowlist covers the production origin and `http://localhost:5173`; from other origins the page degrades to the fallback embed and logs CORS errors it cannot suppress.

`Chat.tsx` polls `GET /chat?since=<ms>` every 5 s, keeps the last 200 messages and autoscrolls unless the reader scrolled up. Posting signs `"Hamster Hour chat\n" + ts + "\n" + message` with `personal_sign` through the connected wallet (no gas) and sends `{address, message, signature, ts}`. Client rules: 200 characters, no links, one message per 5 s; server rejections are shown in plain words. Messages are plain text, escaped by React. A "bet" tag marks senders whose `position(k, address)` is non-zero in the current or next window.

Failed `/live` refreshes take priority over cached live or idle data, so an earlier SLEEPING response cannot hide the fallback player. A successful subsequent poll restores the reported state.

`meme.tsx` holds the synthesized squeak, poke counter (localStorage), Konami listener, logo click run, `SlotNumber` digit reels, seed confetti and X share intents. Moods come from `/status` against the line pace (line × 21 cm / 3600 s): sleeping, stretching (< 30 %), cruising, zoomies (> line pace), villain era (tracked current-window passes strictly above 2× the line). Speed alone never selects villain era. The reel viewport, rows and translation share `--slot-row-height: 1.2em`. Everything honours `prefers-reduced-motion`.

The EXACT jackpot sentence and How it works jackpot balance are rendered only after the on-chain `jackpotToken()` is nonzero. The existing conditional copy is retained verbatim when configured; the previously documented contract/copy distinction remains in `docs/frontend/VALIDATION.md`.

`WindowProgress.tsx` shows the current running window below the countdown/window line and repeats it beside a connected visitor’s bet on that window. `live.ts` polls the same worker’s `/rounds` every 20 seconds, alongside the existing `/status` cadence. All four settlement fields are parsed as BigInt decimal strings. Mapping uses **Squeekchain genesis 1791847800**, independently of the game genesis: `firstRound = floor((startsAt - 1791847800) / 600) + 1`, `lastRound = firstRound + 5`. The preceding exact settlement provides the baseline; otherwise the latest earlier settlement is marked `≈`. With no baseline or valid live counter only the round is shown. The difference is clamped to zero and the bar to 100%. No new request goes directly to Squeekchain. This display is explicitly unofficial and never affects settlement, payouts or transaction eligibility.

On narrow layouts, the full summary remains one horizontally scrollable line with the bar below it; the focusable labelled region supports keyboard scrolling. Grid items can shrink so personal bets cannot widen the page. Amount suffixes stay on one line with a 3ch minimum while the input shrinks. Counter labels use singular only for exactly one, including result/share/preview pass counts.

How it works opens when `hamster-hour:how-it-works:v1` is absent. The first mount records a collapsed default for later visits; an explicit open/collapse choice is remembered. Storage errors leave the native disclosure usable.

The first visit opens a native full-screen dialog with the supplied video stored in `public/assets/hamster-chewing.mp4`. Start playing, Escape, close and outside taps dismiss it; localStorage remembers dismissal. The video is muted, loops, plays inline, can be paused, and starts paused for reduced-motion preferences. The supplied clip is bundled verbatim. The goggle hamster, happy/asleep variants, wheel runner, favicon and share image are original SVG artwork. IBM Plex Mono is bundled locally with its font license.

## Repeatable checks

`npm test` runs model/protocol tests plus live-feed parsing, mood and chat rules (21 tests). Browser tests (25 scenarios) use a real Chromium browser with intercepted RPC, wallet, proxy (`/live`, `/status`, `/rounds`, `/chat`), YouTube and oracle fixtures; they do not broadcast Ethereum transactions, sign with a real key or claim that a production panel ran. Four revision scenarios cover failed refresh and recovery, legacy/named/multiple wallets, mood thresholds, and rendered digit alignment. Run just those with `HH_TEST=revision: npm run test:browser`; their clocks advance the polling intervals without waiting in real time. Run the four maintenance scenarios with `HH_TEST=maintenance: npm run test:browser`; they cover all five sheets and public pages at 1280/800/375, first-visit persistence, worker polling, exact/approximate/missing baselines, sleeping zero-pass personal bets, jackpot configuration and plurals. The production bundle itself has no test mode. To check against the real proxy, serve `dist/` at `http://localhost:5173` (an allowed origin).

Install Playwright outside the repository and provide its module path:

```sh
npm install --prefix /tmp/hamster-browser playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-browsers /tmp/hamster-browser/node_modules/.bin/playwright install chromium
export IMD_PLAYWRIGHT=/tmp/hamster-browser/node_modules/playwright/index.mjs
export PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-browsers
npm run test:browser
npm run test:accessibility
# From the repository root, while the pinned input is available:
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The browser scripts own their static preview server and close it on exit. Test outputs go to `test/scratch/` and are not delivery assets. `HH_BROWSER=webkit` selects WebKit for interaction tests when its system libraries are installed. This maintenance run used installed Chrome through Playwright; the WebKit executable was unavailable. Real-device Safari, screen readers and real wallet signatures remain untested.

Current results and the six-domain Better Interface review are in the [maintenance report](../docs/frontend/MAINTENANCE.md); the [revision report](../docs/frontend/REVISION.md) is historical; the [original validation report](../docs/frontend/VALIDATION.md) retains the earlier implementation record. [DESIGN.md](../DESIGN.md) documents the final source; [attribution](../docs/frontend/ATTRIBUTION.md) retains source and license notices.
