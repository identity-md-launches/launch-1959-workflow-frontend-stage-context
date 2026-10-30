# Hamster Hour frontend

The current install, build, preview, runtime contract, worker and validation documentation is in the [repository README](../README.md). Source lives in `src/`; `npm run build` writes the complete root `dist/` using the existing Vite configuration. Install with `npm ci --legacy-peer-deps`; existing manifests and lockfiles are protected and preserved.

The app uses the v2 ABI from `contracts/HamsterHour.json` and identity from `deployment/handoff.json`, exported to the runtime configuration. All production contract reads and writes use that runtime identity. No historical ABI is imported into the site.

`worker/index.ts` implements the additive API routes. `scripts/build-worker.mjs` creates the standalone `../worker/worker.mjs`; no worker is published by a build. See [worker handoff](../worker/README.md).

`npm test` runs amount, payout, telemetry, chat and worker tests. `node tests/browser.mjs` runs the production bundle with controlled wallet and RPC fixtures. Name Playwright using `IMD_PLAYWRIGHT` and browsers using `PLAYWRIGHT_BROWSERS_PATH`. A foreground preview and browser are created and closed inside that script. Screenshots and JSON results go only to root `test/scratch/browser-polish/`.

The polish adds five hash tabs, one leased live-camera/mascot frame, a shared chat drawer and exact finished-window history helpers. Current evidence and service limitations are in [POLISH-VALIDATION.md](../docs/frontend/POLISH-VALIDATION.md). Browser checks accept `HH_BROWSER=webkit` when that optional engine is installed; Chromium is the supplied usable engine.

The all-time volume board adds `leaderboard.ts` (reusable scanning, aggregation and cache), `leaderboard-config.ts` (public RPCs, deployment boundary, ticket value and editable empty reward text), `useLeaderboard.ts` (one shared active-tab scanner), and `Leaderboard.tsx` (table and Top 5 preview). The full calculation and recovery rules are in the root README. `tests/leaderboard.test.ts` tests correctness/failures; the nine `leaderboard` scenarios in `tests/browser.mjs` exercise the production export, including automatic retry, ENS, top-50 paging and connected ranks beyond 50.

Current validation: [PLAYED-VOLUME-VALIDATION.md](../docs/frontend/PLAYED-VOLUME-VALIDATION.md). Run only the new browser scenarios with `HH_TEST=leaderboard node tests/browser.mjs` using the same Playwright variables. Build the export before starting browser tests and keep its files stable while the preview is running.

Only settled, non-refunded stakes count now. The event scanner persists settlement, market-void and timeout flags alongside per-window stakes, so pending amounts survive reloads and reclassify on incremental refresh. The team wallet is displayed separately and never ranked. See the root README for the exact rules and cache migration.
