# Hamster Hour: review revision

Reviewed 2026-10-16. All four reported findings reproduced on the original committed export and were fixed with changes limited to the affected components. The production export was rebuilt and checked. These are worker observations, not independent certification.

The existing visual system, layout, contracts, ABI files, chain configuration, transaction flow and dependency/build configuration are preserved. Wallet selection now recognizes a sole legacy injected provider; the connector configuration is unchanged. No transaction, real-wallet signature, chat post, deployment or publication was performed.

## Findings and rechecks

Full finding IDs and verdicts are in [`.imd-responses.json`](../../.imd-responses.json). Before/after checks are retained in [revision-checks.json](revision-checks.json).

| Finding | Reproduction before editing | Fix and production recheck |
| --- | --- | --- |
| `6b1698b8…` — high, cached idle after failed refresh | Chromium 375×812 and 1440×900: idle response, then abort proxy requests; advance the 20 s poll and its retry. Three `/live` attempts, badge SLEEPING, zero iframes. | `web/src/Stream.tsx:30`: failure takes precedence over cached data. Both widths now embed the default or saved stream ID in exactly the same player bounds. Sleeping dimming clears. Successful subsequent idle and live polls restore their respective states. |
| `4d21db49…` — high, legacy wallet needs a second tap | Chromium 390×844: `window.ethereum` without EIP-6963 announcements; one Connect click opens the picker and makes zero account requests. | `web/src/Wallet.tsx:86`: an available generic injected connector joins the direct-connect candidates after existing duplicate filtering. Legacy account requests and discovered-provider permission/account requests start on the first click. Rejection restores Connect; retry succeeds. Two discovered providers still show the picker; no duplicate Browser wallet row. |
| `2f8d0238…` — high, fast speed selects villain era | Chromium 390×844: line 1000, speed 200 mm/s, cumulative 45200, no saved window baseline. The header said villain era while tracked window passes were zero. | `web/src/live.ts:119`: remove the speed-above-twice-pace branch. Zero and exactly 2000 tracked passes show zoomies; 2001 shows villain era. Zero speed still shows sleeping. Unit tests also check the boundary. |
| `5b8ebcb6…` — medium, clipped slot digits | Chromium 1440×900, reduced motion, pools 12 + 10 + 2 IMD: digit rows were 24px high, but translations were −40/−80px; visible fragments did not read 24. | `web/src/meme.tsx:118`, `web/src/styles.css:638`: one `--slot-row-height: 1.2em` drives viewport, rows and translation. Expected rows align within 0.1px for pool 24, update 1,009.08, jackpot 976 and a normal-motion update back to 24. |

Screenshots inspected: [fallback at 375](revision-fallback-375.png), [readable 24 IMD at 1440](revision-reels-1440.png), [real idle feed at 390](revision-390.png), [real idle feed at 1440](revision-1440.png). The first two use explicitly intercepted RPC/proxy/YouTube fixtures; the video-frame text is test content and is not part of `dist/`.

## Commands and results

Dependencies were installed from the unchanged `web/package.json` and lockfile with `npm ci --legacy-peer-deps` in an isolated copy under `/tmp`. That copy contained the unchanged deployment inputs, ABI files and test references. The export script used this checkout's Git objects read-only to compare pinned ABI exports. No dependency/cache directory was created in the submission. The resulting `dist/` was copied back byte-for-byte and obsolete hashed assets were removed.

The following project commands ran from that copy's `web/` directory, with `IMD_PLAYWRIGHT` pointing to a separate Playwright install and `PLAYWRIGHT_BROWSERS_PATH` to its temporary browser directory:

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `npm test` | 15/15 passed, including updated fallback and mood assertions |
| `npm run build` | Exit 0; TypeScript, Vite and export checks pass; both canonical ABI hashes match the handoff |
| `npm run verify` | Exit 0; complete asset inventory and hashes match |
| `HH_TEST=revision: node tests/browser.mjs` | Four new production-export scenarios pass |
| `node tests/browser.mjs` | 21/21 Chromium scenarios pass, including the original 17 |
| `node tests/accessibility.mjs` | Exit 0; zero axe violations on eight surfaces; reduced-motion intro paused; amount-sheet Escape restores focus; no horizontal overflow at 320/375/390/768/1440 |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (repository root) | Exit 0; 11/16 raw checks pass, five established exceptions below |
| Assigned browser on the local production export | Real `/live`, `/status` and `/chat` answer HTTP 200; SLEEPING at 375/390/1440; no console errors; one existing iframe `allow`/`allowfullscreen` warning |

The initial isolated unit-test invocation lacked an existing `docs/references` fixture. Copying that unchanged fixture resolved the harness error; the full rerun passed. The wallet regression initially assumed every connector used `eth_requestAccounts`; the fixture and assertion now cover both EIP-1193 account requests and the supported permissions path, without changing application connector behavior.

Browser tests serve the production export under `/preview/`, validating relative asset URLs. Polling regressions use Playwright's clock, retaining the actual 20 s interval and retry behavior without real-time waits. The broader suite rechecks signed-chat transport and a second visitor's poll, both result cards, poke persistence, easter eggs, all bet modes, oracle failure recovery, invalid-window recovery, claims, staking and TEAM controls using fixtures.

At the real-feed check, the main action's lower edge was 661.375px in a 375×812 viewport and 669.8125px at 390×844, after dismissing the existing introduction. The player and primary action remain on the first screen. At 1440×900 the established two-column layout and chat placement remain. Poking incremented the local counter to one. Two chat requests were aborted during the session and subsequent polls succeeded; the console logged no errors.

## Better Interface: six-domain coverage

The pinned workflow and core principles in all six domains informed the fixes and this focused review. The terminal palette, monospace type, uppercase brand, pixel art and existing responsive structure are retained as requested. [DESIGN.md](../../DESIGN.md) now documents the shared reel height, direct wallet selection and corrected state rules.

| Domain | Checked on the changed surfaces | Limits |
| --- | --- | --- |
| Accessibility | Native Connect control; pending/rejected/retry states; preserved picker and focus behavior; `SlotNumber` accessible label still matches the rendered amount; reduced-motion digits align; axe clean. | No screen-reader session, physical device, forced-colors session or browser-native zoom. |
| Layout | Player bounds stay identical through idle → failure → recovery; 16:9 slot retained; no horizontal overflow at five widths; first-screen actions measured at 375 and 390; desktop and phone screenshots inspected. | No RTL or localization variants are implemented or added. |
| Writing | Mood labels now describe their specified thresholds; connect/error vocabulary stays consistent; no unrelated copy changes. | The pre-existing requested 2% jackpot copy still disagrees with the deployed contract, as documented in the original report; outside these findings. |
| Typography | Shared 1.2em row height fixes actual clipped numbers at 20px and the smaller jackpot size. Commas/decimals survive updates. Six-size scale and local fonts preserved. | Screen-reader pronunciation and alternate OS font rendering not tested. |
| Colors | Existing semantic colors unchanged; the probe's measurable solid text pairs pass contrast; numeric and stream state remain expressed by text as well as color. | The probe cannot measure 88 image/video/transparency-dependent text boxes. No new contrast ratio is claimed for those backgrounds. |
| UI | Cached success, failed refresh, fallback and recovery exercised; sole legacy/discovered, multiple-provider and rejection wallet states checked; motion and reduced-motion numeric updates checked. | Real wallet extension prompts/passkeys and actual YouTube live playback remain unverified. |

The probe's five failures retain the existing explanations: **layout** counts intro controls over the inert underlying page; **casing** flags the deliberate uppercase brand; **eyebrows** flags numeric labels, utility controls and the established wheel caption; **type-faces** flags the requested monospace prose; **chrome** flags the existing neon intro frame's border and glow. Screenshots and the dismissed-page checks show no new overflow or numeric clipping. These exceptions are reported as raw failures, not converted into passes.

## Delivery and limitations

The static export contains 24 inventoried assets plus `imd-deployment.json`, with 1,662,785 asset bytes excluding that manifest. Title, description, favicon, `og:title`, `og:image` and relative asset URLs are present. Required video, fonts, artwork, ABI files, source and lockfile remain complete. No build configuration, dependency manifest/lockfile, ignore file, contract, submodule or protected path was changed. Packaging measurements are recorded in [revision-package.json](revision-package.json).

WebKit was downloaded, but host validation reported missing GTK/GStreamer and related libraries, so WebKit execution was not performed. The live wheel was idle: live-video switching, proxy failure, wallet signing and on-chain action flows were tested with intercepted transports. Intentional aborted proxy requests produce browser network diagnostics in the failure test; no uncaught application errors occurred. Real-wallet signatures, mainnet transactions, server-side chat signature verification, screen readers and physical devices remain untested.

Complete for the four-finding revision scope, with these validation limits recorded.
