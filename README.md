# Hamster Hour

A cozy pixel betting app for the live HamsterHour v2 contract on Ethereum, with a compact betting home and seven top tabs. The finished static site is in [`dist/`](dist/); editable React/TypeScript source is in [`web/src/`](web/src/). The existing `hamsterhour.fun` domain and worker hostname are retained. Nothing is deployed, published, re-minted or signed by this repository update.

## Install, preview and rebuild

Node 22 and npm are sufficient. From `web/`:

```sh
npm ci --legacy-peer-deps
npm run build
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite. The build typechecks TypeScript, bundles local assets using the existing relative `base: './'`, writes repository-root `dist/`, and verifies the ABI and asset inventory. `npm run dev` starts the existing development server. Navigation uses hashes; no server rewrite is required. The source package manifest, lockfile, Vite/TypeScript configuration and all existing contract build configuration/dependencies are preserved. The protected lockfile requires `--legacy-peer-deps`: plain `npm ci` reports a missing peer `playwright-core@1.64.1`.

For an environment that must not create repository `node_modules`, run `node web/scripts/sandbox-build.mjs` from the repository root. It installs the same protected lockfile in a temporary project and copies the site and bundled worker back. This delivery likewise used a disposable copy with the unchanged lockfile. No dependency directory or npm archive is delivered.

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

The historical deployment input describes the replaced game. The preceding v2 request explicitly supplied its replacement address and source; this polish preserves that verified identity and integration in `web/deployment/handoff.json`. `web/deployment/network.json` is byte-identical to the supplied network input. The static `imd-deployment.json` carries that complete network block, ABI hash, runtime code hash and asset inventory. The interface reads addresses and ABI from it at runtime. Historical Solidity deliverables in `src/`, `test/`, `lib/` and `docs/abi/` are not frontend runtime inputs and have not been changed.

Before any signature, the app checks live chain ID, code hash, token and genesis, then simulates from the connected account. Approval is for the entered amount only. Approval and betting are separate steps. The review retains the exact chosen hour/side/amount while state refreshes; it rechecks closing before sending. Receipts, reverts and wallet rejection are visible, with explorer links. No unlimited approval, private key, oracle key, arbitrary recipient or relayer is used.

EIP-6963 browser discovery, wallet-browser links for MetaMask/Coinbase/Rabby/Phantom, Coinbase Smart Wallet, reconnection, chain switching and disconnect use the preserved wallet implementation. There is no project ID or relay. “Claim all” deliberately asks for one transaction per payable hour because the contract has no batch claim method. The user pays Ethereum gas.

## What the game shows

The line and four binary pools come from `windowInfo(k)`. OVER/UNDER are one market, SNOOZE yes/no another. Bets close at the hour's start; equality is UNDER. Under 100 passes refunds OVER/UNDER. A one-sided pool refunds; otherwise estimates include the new stake and 9% fees. A 5 IMD ticket wins within ±0.5% of the settled result; winners split 80% and 20% carries. Prize amounts are labelled unfixed until chronological finalization. Feed donations split 90% jackpot / 10% tip jar. My bets uses wallet-indexed events, live positions and `claimable`, including later jackpot claims. No fictional activity or market amounts are seeded into production.

Live wheel video, hardware status, settlement telemetry and signed chat retain the original `/live`, `/status`, `/rounds`, `/chat` worker endpoints. Chat signs the existing plain text protocol and never sends a transaction. Telemetry is informational: stale/missing readings remain unknown. The mascot and automatic night theme follow fresh speed, independently of the camera. Six seeds show exact ten-minute telemetry when available, including the current interval's live count against an exact preceding baseline. A missing interval stays unknown; the odometer labels approximate baselines. Only the IMD oracle settles results.

## Pages and live data

The wheel has the headline and “New here?”, one shared camera/hamster frame, this hour’s passes and six seeds, the bet form, a compact jackpot strip one-line live activity, and a Top 5 leaderboard preview at the bottom. On phones the frame precedes the form; its amount and main action are on the first 390×844 screen. Jackpot contains the full jar, hour selector, ticket purchase, feeding and feeds. Stats contains the usual-day chart and completed-window history. My bets retains claims, and Agents contains the skill. Chat opens from the small bottom-right button on every tab. All seven pages use hash links, including direct links and browser back/forward.

The camera is embedded only when `/live` explicitly says live, supplies a supported ID, and its `observedAt` and `validUntil` establish freshness. Expired/offline/failed checks show the existing telemetry-driven pixel hamster in the same frame. Remembered stream IDs and the old hard-coded recording fallback are gone. The wake note chooses the first future local hour whose 7-day mean is at least 100 passes. Pass counts, amounts and records use comma grouping independent of browser locale; times remain local.

Stats filters out unfinished/future windows and orders the last 24 finished windows newest first. Observed passes use exact `/rounds` cumulative boundaries, quiet mining checkpoints, or complete dated stats buckets, including no-bet hours. The game’s :20 boundaries cannot be inferred by prorating positive half-hour buckets. Missing observations remain unknown; settled oracle counts are separately labelled as a fallback. Winning sides/refunds use each frozen line and the game’s independent pools. This preserves the distinction between informational telemetry and settlement.

## Rewards pool and jackpot totals

The $HAMSTER tab shows the same Rewards pool block at the top of Stake and in its Stats card. Waiting IMD is `dripDeposited + hookDeposited + gameDeposited - rewardsPaid`. The current daily estimate combines about 1% of remaining drip with the active hook/game stream rates from `rewardState()`. Emissions pause when no stake is earning. Hook streams last 7 active days; game streams use the vault's 30-day schedule.

HAMSTER is priced from the hook's actual Uniswap v4 pool ID and the network's StateView `getSlot0`. USD uses DexScreener's most liquid Ethereum pair with IMD as the base token, refreshed each minute. APR annualizes daily USD release over the USD value of total staked HAMSTER, including vesting grants. A connected wallet sees its share of earning stake and estimated IMD/day; warming lots earn after 24 hours. Missing prices or checkpoint previews leave dependent estimates unknown with a retry control. These are changing estimates, not promised returns.

The home strip and Jackpot tab both show `jackpotSeed + totalPendingJackpotDeposits`, across all hours. Next hour's fixed prize remains a separate secondary line and stays unfixed until the contract finalizes it. Choosing a different ticket hour does not change the total.

## All-time leaderboard

The new **Leaderboard** tab sits next to Stats. The wheel ends with a compact Top 5 card linking to it. Viewing, copying addresses and paging never require a connection or signature. The existing wallet connection adds a Your position row, including ranks beyond the top 50. The full table shows ranks 1–50 in ten-row pages; ties use ascending lowercase wallet address. Bet counts include EXACT tickets, whose count is also shown. Hours are distinct `k` values, not elapsed wall-clock hours.

`web/src/leaderboard.ts` contains the reusable scanner, exact bigint aggregation, cache validation and ranking. `useLeaderboard.ts` shares one instance between the table and preview. The game address still comes from the existing runtime handoff. `leaderboard-config.ts` contains the first deployment block **26,229,405**, event definitions, the fixed 5 IMD ticket price, public RPC list, pagination and refresh interval. A 29-query historical `eth_getCode` binary search confirmed empty code at 26,229,404 and code at 26,229,405. The browser does not repeat that search.

The scanner requests only `BinaryBet` and `TicketBought` logs, in inclusive nonoverlapping ranges of at most 2,000 blocks, from deployment to a pinned latest head. Binary volume is the event's complete `amount`; a ticket contributes exactly `5e18`. Feeds, claims, payouts and fees are excluded from aggregation. Full stakes count even when the bet later loses or refunds. Sorting and two-decimal IMD formatting retain bigint precision. USD is an estimate from the **same shared IMD price query already used in $HAMSTER**; unavailable prices do not prevent displaying IMD totals. ENS is optional, uses viem's canonical Ethereum resolver, and must resolve forward to the same wallet before replacing its address.

Public RPCs are BlockPI, MEV Blocker, PublicNode, LlamaRPC, dRPC and Cloudflare. The first two accepted historical log reads without a key during browser validation; some of the example endpoints restricted archive access. Each request has an eight-second timeout, automatic fallback and one bounded retry pass; all-provider range refusals can subdivide the range. A failed or malformed result never becomes an empty range. Successfully decoded ranges persist after each chunk, with the block cursor/hash, bigint strings, counts and distinct hours. The versioned localStorage key includes chain, contract and deployment block. Later visits validate the saved boundary hash and read only newer logs. A changed boundary hash resets and rebuilds the board after a reorg. Duplicate logs within a range count once. Initial interrupted history remains a progress state rather than a partial all-time ranking. Storage denial/quota errors keep the scanner usable in memory.

The wheel preview and Leaderboard refresh every 60 seconds while their tab is active. Failed scans retry after 15 seconds and offer Retry now. Leaving those tabs aborts the scan and stops its timer; returning to a visible document resumes. Previously complete totals remain labelled with their block during a failed refresh. Newly mined data can change after a reorg; every displayed snapshot names its last block.

Edit **`LEADERBOARD_REWARD_TEXT`** in `web/src/leaderboard-config.ts` to add reward copy below “Top 5 by volume”; its default is empty. Rebuild the export after editing. No rewards, contract settings or transactions are added. The optional loss column is omitted: this game's `lossOf` takes both a window and a wallet, rather than the single-address view in the brief.

## Worker and agent handoff

[`worker/worker.mjs`](worker/worker.mjs) is a standalone additive Cloudflare module, with source in `web/worker/index.ts`. See [`worker/README.md`](worker/README.md) for installation/merge options. It implements `/stats7`, `/stats30` and `/api/window`, preserving the existing endpoints through fallthrough. **The new routes have not been published.** The current public worker returns 404 for stats routes. The website shows dated, real Squeekchain snapshots with “Saved telemetry · refresh unavailable” until the extension is installed. It never labels the saved chart live. Snapshot dates are embedded in the files; after 24 hours the wake estimate is suppressed. The existing worker source, hosting account and chat storage were not provided, so no attempt was made to replace them.

[`SKILL.md`](SKILL.md) is published in the export alongside `/.well-known/agent-skills/index.json` and its SHA-256-identified archive, matching the Squeekchain discovery format. After the static export is hosted, `npx skills add https://hamsterhour.fun` discovers it. It covers identity/ABI verification, reading hours, pools, betting, tickets, feeds, claims, spending limits and own-wallet-only safety. The API route requires the worker handoff; the skill explains direct contract reading as the fallback.

## Validation and limits

Current leaderboard results, six-domain Better Interface coverage and limitations are recorded in [LEADERBOARD-VALIDATION.md](docs/frontend/LEADERBOARD-VALIDATION.md). Earlier rewards/jackpot results remain in [REWARDS-VALIDATION.md](docs/frontend/REWARDS-VALIDATION.md). Earlier polish evidence remains in [POLISH-VALIDATION.md](docs/frontend/POLISH-VALIDATION.md). [DESIGN.md](DESIGN.md) describes the final source. The preceding implementation’s evidence remains in [V2-VALIDATION.md](docs/frontend/V2-VALIDATION.md).

The leaderboard production build, separate typecheck, 45 unit/worker tests and 24 production Chromium interaction scenarios passed. The current validation report records these results, eight new accessibility audits and the completed live public-RPC browser scan. The prior rewards revision passed 36 unit/worker tests and 18 interaction scenarios. Eight targeted rewards accessibility audits and fourteen existing app audits report no violations for the selected WCAG A/AA rules. Tests use controlled wallets/services, with no real spending or production chat posts. Real read-only Ethereum verification also confirmed the unchanged runtime and IMD identity. WebKit launch was attempted but unavailable; Chromium performs the rendered checks. Physical phone wallets, passkeys and actual YouTube playback remain unverified. The current public worker still supplies only recent rounds and has no live stats routes: incomplete historical observations stay explicitly unknown, with dated snapshots retained. No worker or website is published by this task.
