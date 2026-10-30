# Hamster Hour leaderboard validation

Worker validation on 2026-10-30. This records local checks, not independent certification.

## Scope and delivery

This update adds the Leaderboard hash tab beside Stats and a Top 5 preview at the bottom of The wheel. The original cozy pixel palette, fonts, tabs, betting, jackpot, rewards, claims, wallet flow, chat, worker and contract identities remain in place. No contract/deployment source, ABI, dependency manifest, lockfile, build configuration or ignore file was changed. No backend, key, account or new npm dependency was introduced. The build exports to repository-root `dist/` with relative asset URLs.

Volume comes only from Ethereum `BinaryBet` and `TicketBought` events for the runtime v2 game. An EXACT ticket contributes 5 IMD, one bet and its distinct window. Donations and payments do not count. Ranking uses exact bigint stakes and deterministic address ties. The table pages ten of the top 50 wallets, with a separate connected-wallet position outside that limit. USD is explicitly an estimate from the site's existing shared price query. Optional loss reporting is omitted because this ABI exposes `lossOf(uint256,address)` rather than a wallet-only view.

The new data layer is `web/src/leaderboard.ts`; its public scanner accepts event ABI/decoder, RPC and storage adapters and is independent of React, wallet and pricing. `useLeaderboard.ts` shares one scanner across the two new surfaces. Configurable reward copy is `LEADERBOARD_REWARD_TEXT = ""` in `web/src/leaderboard-config.ts`.

## Actual checks

Builds ran in a disposable copy of `web/` using its unchanged lockfile. This avoided creating repository dependency/cache directories. The copied source, contracts, configuration and lockfile are the same inputs as the delivered tree. All tests use the real production bundle; browser wallet/services fixtures are explicitly controlled and spend no funds.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` | Passed in disposable project; no dependency changes |
| Production | `npm run build` from `web/` | Passed: TypeScript, Vite and ABI/export inventory verification |
| Separate typecheck | `npm run typecheck` | Passed |
| Unit/worker tests | `npm test` | 45 passed, 0 failed; nine leaderboard correctness/failure tests plus 36 existing tests |
| New interaction scenarios | `HH_TEST=leaderboard node tests/browser.mjs` | Six passed with no page script errors |
| Production browser regression | `node tests/browser.mjs` | 24 passed, 0 failed, no page script errors; includes all existing transaction and app scenarios |
| Accessibility | Axe A/AA rules in the browser scenarios | No violations in eight new table audits: day/night at 320, 390, 800, 1440; existing page audits also exercised |
| Official design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 14/16; the two existing-style flags are assessed below |
| Diff/package review | `git diff --check`, protected-path diff, export inventory and file-byte sum | No whitespace errors, dependency/configuration edits, submodules or dependency/cache archives |

Browser and probe commands used `IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs` and `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright`. Commands create and close a foreground preview/browser. The bundle is served at `/preview/` for interaction validation, including direct `#leaderboard` navigation. The export remains stable while browser checks run.

The six new scenarios cover wallet-free viewing and copying, forward-verified ENS, the home preview link, top-five styles, all five top-50 pages, rank 61 pinned above the table, loading/progress/pause, range fallback, empty-to-betting navigation, manual retry, incremental one-minute updates, cached reload without historical log reads, inactive-tab polling cancellation, failed-refresh saved totals, automatic background recovery, both themes, unusually long names/amounts, keyboard focus, and accessibility. Unit tests additionally cover exact ticket weights, both binary markets, bigint precision/rounding, tied ranks, duplicate logs, inclusive chunk boundaries, cache corruption/storage denial, interrupted history resumption, invalid/removed logs, malformed RPC results, HTTP failures, range subdivision, cancellation and reorganizations during/between scans.

## Read-only mainnet evidence

A binary search made 29 historical code queries and found deployment block **26,229,405**. Code was empty at **26,229,404** and nonempty at **26,229,405**. This matches the existing v2 handoff; the boundary is now a fixed config constant and the visitor never searches for it.

An independent run of the scanner over blocks **26,229,405–26,305,606** found **five wallets, seven bets, 7 IMD total, zero EXACT tickets**. The source endpoint cited for this read is [Ethereum PublicNode](https://ethereum-rpc.publicnode.com).

A real Chromium run of the finished export, without wallet/RPC fixtures, subsequently completed the all-time scan through **26,305,676**. It showed the same five wallets and total: the leading wallet had 3 IMD/three bets, and four wallets had 1 IMD/one bet each. It made **39 log requests**, all at most 2,000 blocks, and 116 block-header reads for boundary validation. No page script errors occurred. Snapshot numbers are observations, never seeded production data. See [390-live-leaderboard.png](leaderboard/390-live-leaderboard.png).

The initial public browser run exposed archive restrictions in several example providers: PublicNode returned an archive-token refusal, dRPC refused historical queries, Cloudflare imposed an 800-block cap then returned internal errors, and LlamaRPC failed to fetch. The scanner's fallback remained honest and displayed retry/progress rather than an empty table. We added documented public [BlockPI](https://public.blockpi.io/) and [MEV Blocker](https://docs.mevblocker.io/reference/api/transaction-endpoints) endpoints to the new scanner's list. Both accepted the historical 2,000-block browser probe without a key; the production board then completed. The original four endpoints remain fallbacks. The scanner uses read methods only; existing wallet/transaction RPC configuration is untouched.

The original application's separate historical event reader still encountered public-provider restrictions in that live run. Those service failures did not prevent the new board completing. ENS lookups may independently fail or be absent; the readable/copyable wallet address remains available.

## Better Interface: six-domain review

| Domain | Coverage and actual evidence | Limitations |
| --- | --- | --- |
| Accessibility | Checked native table/caption/row headings, named links/copy controls, stable status and native progress, pause/reduced-motion behavior, and visible keyboard focus. Eight new Axe audits passed. Pagination/empty/retry use native buttons or links. | No screen-reader session, physical phone, forced-colors session or accessibility compliance certification. |
| Layout | Checked 320/390/800/1440, both themes, huge amounts and long ENS names; no page/table overflow. The 390 betting form's primary action stays within 780px of the top. Day, night, preview and live screenshots inspected. | Emulation is not a physical phone or native 200% browser zoom. |
| Writing | Checked exact requested loading/empty/error copy, direct destination/action labels, volume/count explanations, distinct-hour definition and saved-block labelling. Reward text defaults empty. | Requested hamster emoji in the empty state is intentional. |
| Typography | Reused Geist/Silkscreen and existing six size tokens, with tabular numbers. Long names/amounts wrap; shortened addresses retain full accessible name/title/copy value. Local fonts load in the existing first-screen browser check. | No manual OS font-rendering comparison. |
| Colors | Reused existing ink/muted/card/focus tokens. Day/night Axe checks found no WCAG contrast violations on the new table. Rank numbers and trophies reinforce gold/silver/bronze/glow cues. | Decorative gradient/trophy artwork is not claimed as a measured text contrast pair. |
| UI | Checked normal, loading, paused, empty, failed, retrying, cached, paginated and connected states. Static rewards text adds no promises or transactions. Existing reduced-motion rules stop the running hamster; the mobile glow renders once per row. | No manual animation-panel inspection at slowed speed. |

### Findings, fixes and rechecks

| Source | Finding / evidence | Change and recheck |
| --- | --- | --- |
| `web/src/Leaderboard.tsx:44` | ENS could not use the custom game chain's missing resolver metadata. | Supply viem's canonical mainnet resolver only to the new ENS read calls; forward-check the name. Positive ENS and address fallback pass in Chromium. |
| `web/src/leaderboard-config.ts:12` | The original example public endpoints could not complete the historical browser scan. | Added two documented, browser-probed keyless historical providers to the separate leaderboard pool. Real full scan now succeeds. |
| `web/src/leaderboard.ts:417` | A reorganization between chunks could otherwise mix old aggregate data and a new boundary. | Validate the prior checkpoint boundary as well as the range end before committing. Dedicated reorg tests pass. |
| `web/src/styles.css:3745` | At 390, rank 4–5 gradients repeated behind individual mobile table cells, making rectangular patches. | Keep highlighted mobile cells transparent and draw one glow on the row. Rebuilt, reran interaction/accessibility checks, and inspected the live screenshot. |
| `web/tests/browser.mjs` | Earlier regression fixtures assumed reward groups mounted synchronously and USD had not already been cached on home. | Await the reward groups and set price-failure state before the first request. Checks preserve the existing behavior and shared pricing cache. The preview server reads bytes before sending headers. |

### Official probe exceptions

The final entry-page probe passes rendering, layout, targets, contrast, casing, tracking, size/family counts, glyphs, slogans, repetition, copy budget, reduced motion and share metadata. Its two flags were confirmed against screenshots:

- **Eyebrows:** `web/src/App.tsx:293` renders the existing active “The wheel” navigation pill near the hero. It is navigation, not an eyebrow heading; retaining its established treatment follows “Keep the current cozy pixel design, tabs, fonts, colors”.
- **Chrome:** `web/src/styles.css:705` retains the existing chunky pixel button borders/shadows and the amount control inside its betting card. These are the site's established controls. The same explicit preservation requirement takes precedence over a generic surface preference; no new leaderboard card shadow/nested-card system was introduced.

No applicable new high/medium design finding remains. Metadata includes title, favicon, description, `og:title`, and a local `og:image`; the unchanged site metadata passed the probe.

## Evidence and limitations

[390 wheel](leaderboard/390-play.png), [390 preview](leaderboard/390-top5-preview.png), [390 board](leaderboard/390-leaderboard.png), [1440 board](leaderboard/1440-leaderboard.png), [390 night/long values](leaderboard/390-leaderboard-night.png) and [390 real chain data](leaderboard/390-live-leaderboard.png) are actual Chromium screenshots. Except the real-chain screenshot, they use controlled fixtures and do not claim those wallets/amounts are live. The accompanying `leaderboard/checks.json` is a compact copy/summary of actual check outputs; scratch logs are temporary.

WebKit launch was attempted and returned `browserType.launch: Executable doesn't exist`; Safari behavior remains unverified. The browser connector tool returned `Transport closed`; the supplied Playwright/Chromium runtime performed the rendered checks instead. No real wallet connection, signature, spend, passkey creation, production chat post, native zoom or physical phone test occurred. Public RPCs and the existing price/service endpoints can change availability; complete cached data remains block-labelled while retries continue. The static site was built, not published.

Complete for the stated implementation scope, with the browser/service limitations above.
