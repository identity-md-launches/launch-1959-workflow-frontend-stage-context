# Hamster Hour

A cozy pixel betting app for the live HamsterHour v2 contract on Ethereum. The finished static site is in [`dist/`](dist/); editable React/TypeScript source is in [`web/src/`](web/src/). The existing `hamsterhour.fun` domain and worker hostname are retained. Nothing is deployed, published, re-minted or signed by this repository update.

## Install, preview and rebuild

Node 22 and npm are sufficient. From `web/`:

```sh
npm ci --legacy-peer-deps
npm run build
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite. The build typechecks TypeScript, bundles local assets using the existing relative `base: './'`, writes repository-root `dist/`, and verifies the ABI and asset inventory. `npm run dev` starts the existing development server. Navigation uses hashes; no server rewrite is required. The source package manifest, lockfile, Vite/TypeScript configuration and all existing contract build configuration/dependencies are preserved. The protected lockfile requires `--legacy-peer-deps`: plain `npm ci` reports a missing peer `playwright-core@1.64.1`.

For an environment that must not create repository `node_modules`, run `node web/scripts/sandbox-build.mjs` from the repository root. It installs the same protected lockfile in a temporary project and copies the site and bundled worker back. That is the method used for this delivery. No dependency directory or npm archive is delivered.

Useful checks, from an installed `web/`:

```sh
npm run typecheck
npm test
npm run verify
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/browser.mjs
node scripts/build-worker.mjs
```

The browser script starts and closes its own bounded preview at a subpath, uses the real production bundle, and intercepts wallet/RPC/service traffic. It does not spend funds. `HH_TEST='text in a scenario name'` selects a scenario. `node scripts/share-image.mjs` regenerates the locally rendered 1200×630 social image when Playwright is available.

## Live contract and transactions

- HamsterHour v2: [`0xe33ab493249a2df0d8c4a71ac54f46d1f7778367`](https://etherscan.io/address/0xe33ab493249a2df0d8c4a71ac54f46d1f7778367), Ethereum mainnet, chain ID 1.
- IMD: `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7`, 18 decimals.
- ABI: [`web/contracts/HamsterHour.json`](web/contracts/HamsterHour.json), fetched from the requested [v2 repository](https://github.com/identity-md-launches/launch-2260-build-hamster-hour-v2) at commit `49f53ca0f278fe4edf6431f68a51468552372af7`.
- Deployment block: `26229405`. Observed runtime Keccak: `0x1e66fecb356e22bc82058abcbb1564d5604606a2d776fbd107bca301a5989cde`.

The historical deployment input describes the replaced game. The current assignment explicitly supplies the replacement address and source, so `web/deployment/handoff.json` records that authority and the v2 identity. `web/deployment/network.json` is byte-identical to the supplied network input. The static `imd-deployment.json` carries that complete network block, ABI hash, runtime code hash and asset inventory. The interface reads addresses and ABI from it at runtime. Historical Solidity deliverables in `src/`, `test/`, `lib/` and `docs/abi/` are not frontend runtime inputs and have not been changed.

Before any signature, the app checks live chain ID, code hash, token and genesis, then simulates from the connected account. Approval is for the entered amount only. Approval and betting are separate steps. The review retains the exact chosen hour/side/amount while state refreshes; it rechecks closing before sending. Receipts, reverts and wallet rejection are visible, with explorer links. No unlimited approval, private key, oracle key, arbitrary recipient or relayer is used.

EIP-6963 browser discovery, wallet-browser links for MetaMask/Coinbase/Rabby/Phantom, Coinbase Smart Wallet, reconnection, chain switching and disconnect use the preserved wallet implementation. There is no project ID or relay. “Claim all” deliberately asks for one transaction per payable hour because the contract has no batch claim method. The user pays Ethereum gas.

## What the game shows

The line and four binary pools come from `windowInfo(k)`. OVER/UNDER are one market, SNOOZE yes/no another. Bets close at the hour's start; equality is UNDER. Under 100 passes refunds OVER/UNDER. A one-sided pool refunds; otherwise estimates include the new stake and 9% fees. A 5 IMD ticket wins within ±0.5% of the settled result; winners split 80% and 20% carries. Prize amounts are labelled unfixed until chronological finalization. Feed donations split 90% jackpot / 10% tip jar. My bets uses wallet-indexed events, live positions and `claimable`, including later jackpot claims. No fictional activity or market amounts are seeded into production.

Live wheel video, hardware status, settlement telemetry and signed chat retain the original `/live`, `/status`, `/rounds`, `/chat` worker endpoints. Chat signs the existing plain text protocol and never sends a transaction. Telemetry is informational: stale/missing readings remain unknown. The mascot and automatic night theme follow fresh speed, independently of the camera. Six seeds show exact ten-minute telemetry when available, including the current interval's live count against an exact preceding baseline. A missing interval stays unknown; the odometer labels approximate baselines. Only the IMD oracle settles results.

## Worker and agent handoff

[`worker/worker.mjs`](worker/worker.mjs) is a standalone additive Cloudflare module, with source in `web/worker/index.ts`. See [`worker/README.md`](worker/README.md) for installation/merge options. It implements `/stats7`, `/stats30` and `/api/window`, preserving the existing endpoints through fallthrough. **The new routes have not been published.** The current public worker returns 404 for stats routes. The website shows dated, real Squeekchain snapshots with “Saved telemetry · refresh unavailable” until the extension is installed. It never labels the saved chart live. Snapshot dates are embedded in the files; after 24 hours the wake estimate is suppressed. The existing worker source, hosting account and chat storage were not provided, so no attempt was made to replace them.

[`SKILL.md`](SKILL.md) is published in the export alongside `/.well-known/agent-skills/index.json` and its SHA-256-identified archive, matching the Squeekchain discovery format. After the static export is hosted, `npx skills add https://hamsterhour.fun` discovers it. It covers identity/ABI verification, reading hours, pools, betting, tickets, feeds, claims, spending limits and own-wallet-only safety. The API route requires the worker handoff; the skill explains direct contract reading as the fallback.

## Validation and limits

Actual build, typecheck, ABI/export integrity, unit/worker tests, Chromium interactions and the six-domain Better Interface review are recorded in [`docs/frontend/V2-VALIDATION.md`](docs/frontend/V2-VALIDATION.md). [`DESIGN.md`](DESIGN.md) documents the final tokens and components. Read-only mainnet verification and the worker's real contract snapshot succeeded. Transaction tests use fixtures; no real money or signed production chat was sent. YouTube playback, physical phone wallet launches and passkey creation remain unverified. The optional browser MCP connection was unavailable; the supplied Chromium/Playwright runtime performed rendered checks instead.
