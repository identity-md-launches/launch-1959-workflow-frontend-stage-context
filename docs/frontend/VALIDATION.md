# Frontend validation

Implementation and local checks are complete. Git staging/commit could not run inside this task runtime because the repository's `.git` directory is read-only. Source, lockfile, export and evidence are present for the worker's submission step; no commit ID is claimed. Publication, IPFS pinning and site naming remain the control plane's later work.

These are worker observations, not independent certification. No real wallet transaction, oracle purchase, deployment or site publication was performed.

## Scope and binding

The approved launch is `evm_contracts` on Ethereum, containing HamsterHour and OracleVerifier. The static application covers all three betting markets, IMD approvals, both claim modes, staking approval/stake/unstake/rewards, oracle settlement, timeout voiding, reserve funding and all four TEAM schedule/execute pairs. There is no swap pool in this launch.

- Deployment source: `7ab2a01b3d9a15e2acca8b317e77058e6f2d41e9`.
- ABI arrays were compared byte-for-byte with their exports at that commit, then verified by canonical Keccak against both handoff hashes. The app independently checks those hashes at runtime.
- Runtime addresses, chain, RPCs and ABIs come only from `dist/imd-deployment.json`. The build checker verifies exact handoff fields, contract set, unchanged network/add-chain objects and the complete final asset inventory.
- Final production export: 15 declared assets, 847,161 bytes excluding the manifest; every asset is under 8 MiB, and the count is under 128. The manifest excludes itself. The export is comfortably below the publication HTTP budget.
- Root source/configuration, libraries, contract tests and `launch.json` have no diff. All delivered changes are under `web/`, `dist/` or `docs/`; the only added ignore file is the explicitly allowed `web/.gitignore`.
- `docs/DESIGN.md` is used instead of root `DESIGN.md` because the task's overriding write scope prohibits the root path.

## Commands and outcomes

| Check | Actual result |
| --- | --- |
| Dependency install and clean `npm ci --prefix web --legacy-peer-deps --ignore-scripts` | Passed. Normal npm dependencies; no registry archives or node_modules in candidate submission. Additional test dependencies installed through npm and locked. |
| `npm run build --prefix web` | Passed strict TypeScript and Vite production build; export script verified ABIs and generated the inventory. |
| `npm run typecheck --prefix web` | Passed. |
| `npm run test --prefix web` | 10 tests passed: ABI binding/tampering, decimal/uint bounds, binary fee floors, jackpot liability subtraction, window selection, formatting, UUIDs, attestation parsing, stream IDs and error translation. |
| `node web/tests/browser.mjs` with provided Playwright/Chromium paths | 14 scenarios passed against the actual production export served under `/preview/`. Mocked wallet/RPC only; transaction calldata and spender/amount/chain behavior asserted. |
| `node web/tests/accessibility.mjs` with provided paths | Zero axe violations on Bet, Stake, History and wallet picker using WCAG 2 A/AA, 2.1 AA and 2.2 AA tags. No horizontal overflow at 200% root-text size and 390px. |
| Pinned `taste.mjs --out test/scratch/taste` | 15/16 measured checks passed. The remaining `type-faces` flag is deliberate monospace prose, required by the brief. One family and three weights otherwise meet the bar. |
| `npm run verify --prefix web` | Passed exact manifest reconstruction, all asset SHA-256 hashes and ABI canonical hashes. |
| Bounded development-server check | Passed: the dev server returned the exact exported configuration and both ABI arrays. The server was closed by the same foreground script. |
| Live Ethereum reads | Chain ID 1, nonempty code for both contracts, actual game settings read at one block. See `live-read.json`. No sends. |
| Candidate path/size check | No submodules, dependency directories or package archives in the candidate file list. Raw candidate bytes remain below 8 MiB; see `package-check.json`. |
| `git add web/.gitignore web dist` | Failed: `.git/index.lock` could not be created on the read-only Git directory. No staging or commit is claimed. |

The provided browser MCP returned “Transport closed.” Actual rendered checking and screenshots were instead completed with the supplied Playwright/Chromium module in bounded foreground scripts. No new browser was installed. Full commands and reproduction instructions are in `web/README.md`.

## Interaction coverage

The retained `interaction-results.json` lists all scenario results. Coverage includes:

1. Disconnected first-screen action; 320/390/768/1440 reflow; named wallet discovery; modal Escape/focus return and arrow-key tabs.
2. A loaded stream still leaves the main action visible at 390×844, plus hide/resume.
3. Rejected connection, wrong chain, 4902 → exact add-chain parameters → switch, minimum-bet validation, exact-amount approval, confirmation lock and binary calldata.
4. Simulation revert prevents a signature request; wallet rejection releases the submitting lock.
5. EXACT uint validation, one-ticket state and Sleep's boolean encoding.
6. A six-decimal staking token, approval, stake/unstake and IMD reward claims.
7. IMD-only claim overload, history, request-to-evidence-job link, timeout void and attestation settlement encoding.
8. All four TEAM schedule and execute calls, matching values and delay gating. Only intercepted timestamps were advanced; no real-time wait or live proposal was made.
9. Mobile browser without a provider: four “Open in” links and Coinbase Smart Wallet; no generic injected or QR row.
10. Nonzero short allowance resets to zero before the exact approval.
11. Oracle donation's approval and `fundOracleReserve` call.
12. A pending hash survives reload, blocks duplicate signing and unlocks on a confirmed receipt.
13. A changed ABI is rejected before wallet controls mount.
14. Missing contract code disables writes; long balances and full-address menus reflow at 320/390/1440.

Fixtures stay in `web/tests/` and are not imported by application source or included in the static export. Mock signatures do not prove a valid mainnet settlement; the existing deployed verifier remains responsible for the signature and question checks.

## Better Interface review

| Domain | Coverage | Findings/disposition | Limitations |
| --- | --- | --- | --- |
| Accessibility | Native semantics, field labels, visible focus rules, named controls, tabs, dialog focus/escape, axe in four surfaces, reduced motion and enlarged text | Enlarged text overflow fixed with wrapping header/text; bet error description linked to its actual live region. No remaining axe violations. | No screen-reader session, native zoom, forced-colors device session or physical assistive technology. |
| Layout | Actual export at 320/390/768/1440; 390 first-screen action in feed success/failure; long values and account menu | Main action initially below the mobile fold; compacted stream/controls and moved help beneath the action. Currency suffix wrapping was fixed with a nonshrinking suffix. Rechecked. | No claim about every possible value combination, locale or viewport. |
| Writing | Labels traced to ABI methods, separate approvals, unset/read-error states, exact/binary distinctions, settlement and donation consequences | Empty stream is explicitly unavailable; historical/live/sample states are not conflated. No guessed USD price or fake jackpot. | External service wording can become stale only with service changes; no editorial claim about oracle factual accuracy. |
| Typography | Five sizes overall, one system monospace stack, three weights; mobile inputs 16px; numeric alignment and long strings | Countdown size reduced so the brand remains largest on desktop. Retained brief-mandated monospace prose despite the probe's default flag. | OS font substitution and native-device font rasterization not verified. |
| Colors | Probe measured text/background pairs in the rendered dark export; axe contrast checks | All measured pairs met 4.5:1, or 3:1 for large text. State also has text/border cues. | YouTube content, third-party wallet windows and other themes are outside this measurement. |
| UI | Rest/hover/focus/active/disabled, loading, error, empty, approval, signing, confirmation and persisted recovery states | Wallet-client readiness race fixed by fetching the connected provider per action and rechecking identity before signing. Pending receipt gaps no longer reopen controls. | Real Coinbase passkey creation, browser extension signing and native app launches remain untested. |

Fixed finding source references:

| Finding | Source | Correction and recheck |
| --- | --- | --- |
| Main bet below the 390 first screen | `web/src/styles.css:1201`, `web/src/Bet.tsx:236` | Compact phone stream and selections, button before help; screenshot inspected and both stream-state bounding-box assertions passed. |
| 200% text caused horizontal overflow | `web/src/styles.css:1277` | Text wrapping and wrapping header; accessibility script returned `horizontalOverflow: false`. |
| Wallet-client readiness after switching | `web/src/transactions.tsx:139` | Fresh provider per action; actual chain/account rechecked before and after preflight; wrong-chain and rejection scenarios passed. |
| Confirmation delay could invite duplicate action | `web/src/transactions.tsx:94` | Synchronous global guard, per-action receipt state, retained hash and explicit receipt recovery; pending/reload scenario passed. |
| IMD suffix broke across two lines | `web/src/styles.css:1289` | Nonshrinking, nonwrapping currency label; final 390 screenshot reviewed. |
| Error-description target absent | `web/src/Bet.tsx:249`, `web/src/ui.tsx:138` | Stable `bet-error` ID on the adjacent status element. Primary error flow rechecked. |

The `type-faces` probe exception follows the approved requirement: “dark console style like sepolia.squeekchain.com, monospace.” It is not hidden or counted as a probe pass. Theme switching, swap/liquidity controls and a market-price API are not applicable to this brief.

## Screenshots and external behavior

`390.png` and `1440.png` are the inspected export with real public contract reads and the unavailable stream, captured by the final pinned probe. The screenshot block/window numbers can differ from the earlier fixed-block `live-read.json` evidence. `mobile-wallet-picker.png` is explicitly a mocked iPhone user-agent/provider-absent test, showing the mobile connector choices. They are review evidence, not shipped app data.

The live stream feed returned HTTP 404 during this assignment. Staking and jackpot token getters returned zero (unconfigured), and no settled windows existed at the recorded read. The application renders those facts honestly; actual configured-token flows and populated history were exercised using isolated fixtures.

Unperformed live behavior: a mainnet wager, real approval, oracle purchase/delivery and valid settlement signature, jackpot transfer, a native mobile-wallet deep link, a real extension/Smart Wallet signature, WebKit/Safari, a screen-reader walk and browser-native 200% zoom. Browser tests do not establish independent contract correctness or security. Public RPC/API availability, CORS and YouTube embedding permission can change after delivery; errors remain visible and writes require fresh verified state.

No absolute site domain, named gateway or CID is available before publication. Relative assets and sharing metadata are intentional. Immutable/named-copy HTTP hash verification and publication success have not been claimed; those checks run after the publisher receives this work.
