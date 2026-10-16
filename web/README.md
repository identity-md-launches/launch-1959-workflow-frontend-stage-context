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
- `Wallet.tsx` retains named EIP-6963 extension discovery, a native wallet picker, MetaMask/Coinbase/Rabby/Phantom mobile browser links, Coinbase Smart Wallet, chain switching/addition and disconnect. One header control opens the choices. Physical wallet apps and passkey creation require a visitor’s wallet and were not exercised with real funds.
- `transactions.tsx` checks wallet account/network, simulates, estimates gas, requests the wallet signature, waits for confirmation, follows replacements and persists an unresolved transaction. An unresolved receipt prevents duplicate actions. The visitor always controls approvals and transactions.
- `Bet.tsx` combines exact-amount approval and one bet into one UI action. Existing allowances skip approval; an insufficient nonzero allowance is reset before exact approval. A funded wallet may therefore sign one, two or three transactions, but only one is a bet. Amount chips are 1 / 5 / 10 / 25 IMD. Current pool multipliers and estimated returns include the stake and change as bets arrive; uncontested pools are refunded.
- `portfolio.ts` discovers the wallet’s `Bet` and settler events from the pinned deployment block in bounded RPC ranges. TEAM also discovers its settlement credits. `MyBets.tsx` reads actual positions, shows current/next-hour bets, pending results, refunds, winning payouts and Claim. Payout arithmetic preserves contract fee floors, exact-ticket ties, final-claim rounding, separate jackpot claims and oracle reimbursement. Historical lookup remains in History.
- `Settings.tsx` reads all four current settings, pending hashes, decoded `ConfigScheduled` values and execution dates for everyone. Inputs and Schedule/Execute are rendered only when the connected address equals `TEAM()`. The contract independently enforces authorization.

## Oracle purchase and closing a window

Open More → Settle. Select a finished window that has bets and is still within its 48-hour deadline. “Buy oracle answer” shows a reviewable request and a 0.5 IMD purchase. It reads the exact `question(k)`, uses the protocol’s free preflight, obtains the Ethereum Intake from public capabilities, confirms the on-chain price and asks the wallet to approve and request. No project-owned key is involved.

The body contains `v:1`, `chainId:1`, `window:{hours:24}`, `answerType:"uint256"`, `evidence:"panel"`, `panelSize:20`, `quorum:14`, `validForSeconds:86400` and `consumer:{chainId:1,verifyingContract:HamsterHour}`. See [the full integration documentation](../docs/ORACLE.md).

The payment hash is remembered locally. The UI polls the Intake status to obtain the oracle UUID, shows the panel on `explorer.imd.fun`, polls the signed answer every 15 seconds, verifies it and fills the manual JSON field. “Settle” submits the actual deployed ABI tuple. Anyone can still paste a separately acquired signed response. The successful caller may claim 0.5 IMD from a funded reserve on a fee-bearing window; reimbursement and panel delivery are not guaranteed. The 48-hour refund action and reserve donation remain available.

## Cam, intro and art

`Stream.tsx` immediately renders the requested YouTube ID with autoplay, mute, lazy loading and 16:9 sizing. It tries `current.json` in the background and accepts only a valid publicId. A blocked feed does not replace the player with an unavailable state. The live source is outside this app’s control: its current CORS denial appears in the browser’s network console even though the player works; failed discovery is not retried continuously.

The first visit opens a native full-screen dialog with the supplied video stored in `public/assets/hamster-chewing.mp4`. Start playing, Escape, close and outside taps dismiss it; localStorage remembers dismissal. The video is muted, loops, plays inline, can be paused, and starts paused for reduced-motion preferences. The supplied clip is bundled verbatim. The goggle hamster, happy/asleep variants, wheel runner, favicon and share image are original SVG artwork. IBM Plex Mono is bundled locally with its font license.

## Repeatable checks

`npm test` runs model/protocol tests. Browser tests use a real Chromium browser with intercepted RPC, wallet and oracle fixtures; they do not broadcast Ethereum transactions or claim that a production panel ran. The production bundle itself has no test mode.

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

The browser scripts own their static preview server and close it on exit. Test outputs go to `test/scratch/` and are not delivery assets. `HH_BROWSER=webkit` selects WebKit for interaction tests when its system libraries are installed. The current machine could run Chromium; WebKit launch reported missing GTK/GStreamer and related libraries. Real-device Safari, screen readers and real wallet signatures remain untested.

Actual results, the six-domain Better Interface review, deliberate brief overrides and remaining limits are recorded in [validation report](../docs/frontend/VALIDATION.md). [DESIGN.md](../DESIGN.md) documents the final source; [attribution](../docs/frontend/ATTRIBUTION.md) retains source and license notices.
