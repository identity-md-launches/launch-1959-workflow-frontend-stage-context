# Hamster Hour frontend

No owner, no house: pari-mutuel only, with results only from the IMD oracle. The contract never owes more than it holds under its supported exact-transfer ERC-20 assumptions. TEAM gets 1% of non-void bets and no other privileged payout. TEAM cannot withdraw deposits, reserves, stakes or jackpots; it has only the four public, 48-hour-delayed settings. There is no upgrade or emergency withdrawal.

This directory supplies the React, TypeScript and Vite frontend for the already deployed HamsterHour and OracleVerifier contracts. The static export is `../dist/`. Contract source, root build configuration and the launch manifest are unchanged. This frontend does not deploy or publish anything.

## Install, develop and rebuild

Use Node 22 or newer with npm. From the repository root:

```sh
npm ci --prefix web --legacy-peer-deps
npm run build --prefix web
npm run preview --prefix web
```

The lockfile pins the complete dependency graph. The legacy peer-resolution flag avoids unrelated optional wallet ecosystems being installed; the actual injected and Coinbase connectors and Coinbase SDK are present and bundled. Do not commit `node_modules` or npm caches. `web/.gitignore` excludes dependency and cache directories at every nesting level.

For source development, run `npm run dev --prefix web` **after an initial build**. The development middleware serves the same existing `dist/imd-deployment.json` and `dist/abi/*.json`; it does not invent a development deployment. Rebuild after changing the handoff. Vite's relative base supports an HTTP gateway subpath without server rewrites. `file://` is not a supported browser transport because the app fetches JSON.

`npm run build` runs the strict TypeScript check, creates the production export, copies pinned ABI JSON and regenerates the deployment inventory. It requires the deployed source commit to exist in Git so the ABI exports can be checked against `git show <sourceCommit>:docs/abi/<Contract>.json`.

## Deployment configuration

The only runtime address, chain, RPC and ABI source is `dist/imd-deployment.json`. `src/config.ts` fetches that file and its referenced raw ABI arrays, verifies their recursively canonicalized Keccak-256 hashes, and constructs the public RPC client and wallet configuration from its network block. All contract consumers share this runtime object.

`deployment/handoff.json` and `deployment/network.json` are retained **build inputs**, copied from the pinned workflow inputs. They are not imported into the browser bundle. The export script checks them against pinned inputs when those are present, retains their exact deployment identifiers and contract set, and copies `network` and `walletAddChain` unchanged. No pool key exists for this `evm_contracts` deployment, so no swap, approval to a router, or liquidity flow is added.

`npm run verify --prefix web` recomputes the entire manifest and inventory without rewriting it. Every exported file except the manifest itself has a lowercase SHA-256 entry, including the HTML, ABI JSON, icons and sharing image. Never edit a built file after inventory generation; rebuild instead.

Before enabling transactions the app verifies the configured RPC's chain ID, nonempty code at both deployed addresses, and the game's `oracleVerifier()` binding. The code check repeats before each transaction. These are consistency checks, not a runtime-bytecode audit or independent validation of the oracle's facts.

## User flows

- **Bet:** the default is window zero before genesis, otherwise the next window, clamped to `closedWindowFloor`. Three markets have their actual ABI-bound controls. Window line, side balances, pools, deadlines and account positions are live reads. Read failures are not converted to zero. The window selector supports other IDs.
- **Approval:** approve only the entered amount to HamsterHour. An insufficient nonzero allowance is reset to zero first. The approval and bet/stake/donation are separate wallet actions. No unlimited allowance is requested. Signing and receipt states remain locked until completion.
- **Payouts:** binary multiples use contract fee floors and winning-side stake, before the proposed new bet; one-sided markets and equal-line Over / under results refund. EXACT ties share equally, independent of stake. The UI explains missing-tier allocation and the two-ticket jackpot requirement. Jackpot availability subtracts reserved prizes, IMD liabilities and overlapping staked principal.
- **Claims:** look up a window and read its status and position. `claim(k, true)` includes the jackpot; `claim(k, false)` recovers IMD separately if the prize token fails. There is no guessed claimable balance; eligibility and the final call are simulated before signing.
- **Stake:** until `stakingToken()` is configured the page says “Staking opens with the token.” Once set it reads that token's decimals, allowance and balance, and supports approval, stake, unstake and IMD reward claims. Weight is stake at settlement, not duration. The reserve releases over eligible settlements as implemented by the deployed contract.
- **History:** paginated reads cover twelve window IDs at a time, with exact-ID lookup for any other window. Empty windows are omitted with an explicit empty-range message. Settled requests are decoded as UUIDs; the public oracle API supplies the evidence job ID for `explorer.imd.fun/jobs/<jobId>`. Failure to retrieve the job is shown as unavailable, with the known attestation endpoint retained. This is not an event indexer or a claim to have loaded all history at once.
- **Keepers:** History expands to exact frozen questions, signed-attestation JSON input, readable result/panel/expiry preview, `settle`, timeout `voidWindow`, and explicit oracle reserve funding. The app never purchases an attestation. OracleVerifier verification is performed atomically through `HamsterHour.settle`; a standalone `verify` action would consume in the visitor's domain and is not a game settlement.
- **Public configuration:** everyone can read active settings and pending value hashes/deadlines, with explorer access to scheduled events. Only connected TEAM sees schedule/execute controls for all four settings. One-shot settings disappear after execution; exact matching values and the 48-hour delay gate execution. Future execution does not require this frontend to remain online.

The clock advances from a fetched block timestamp. Core state, token data and account reads refresh every 12 seconds, settings every 15 seconds, history every 30 seconds and deployment checks every 60 seconds, with a manual refresh. JSON-RPC reads are batched; the two public endpoints in the network block provide bounded fallback. Required reads older than 45 seconds or in error disable affected actions. A transaction independently rechecks chain/account, simulates and estimates gas before requesting a wallet signature.

## Wallets, transaction recovery and external services

The wallet sheet uses EIP-6963 named discovery, a generic browser-wallet fallback, mobile in-wallet links for MetaMask/Coinbase/Rabby/Phantom, and Coinbase's passkey-capable connector. There is no WalletConnect project ID or relay. A 4902/unknown-chain switch error invokes the exact supplied `wallet_addEthereumChain` parameters and switches again. Address displays are checksummed, with copying and explorer access; ENS resolution is not added because the supplied network configuration contains no ENS resolver binding.

The pending transaction hash is retained locally under the launch ID. A confirmation timeout or reload keeps new writes locked until “Check confirmation” finds a receipt. The app follows replacement transactions while actively awaiting a receipt. A dropped transaction or a replacement made while the page was closed may require checking the wallet/explorer; automatic historical replacement discovery is not implemented. Local storage contains connection/pending-transaction metadata, never keys.

The stream reads only the requested `https://media.squeekchain.com/live/current.json` feed, validates a YouTube ID, and embeds the current video with controls and no autoplay. It retries every minute and exposes manual retry. That endpoint returned HTTP 404 during validation, so the live export shows “Wheel cam unavailable.” No substitute video or sample chain data is shipped.

No approved USD price source was supplied. The interface uses token units and explicitly says USD values are unavailable. The sharing image is a local PNG; its relative metadata URL is intentional until the publisher supplies a final gateway/domain.

## Validation

```sh
npm run typecheck --prefix web
npm run test --prefix web
npm run verify --prefix web
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node web/tests/browser.mjs
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node web/tests/accessibility.mjs
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The browser scripts own and close their foreground HTTP server and browser. They use the provided Playwright/Chromium installation rather than installing another browser. In another environment, set the two paths to its installed browser tools. Their temporary output goes to `test/scratch/`, never the static export. Browser transaction tests intercept the wallet and both RPC URLs; they do not use funds. The model tests verify arithmetic, boundary validation, oracle normalization and ABI hashes.

See [validation and limitations](../docs/frontend/VALIDATION.md), [design system](../docs/DESIGN.md), and [live read evidence](../docs/frontend/live-read.json). These are worker measurements, not an independent audit or publication attestation. Real-wallet signing, paid oracle delivery, live settlement/staking, device deep-link launches, WebKit and screen-reader sessions remain untested. No mainnet transaction was broadcast.
