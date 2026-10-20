# Hamster Hour frontend

The current install, build, preview, runtime contract, worker and validation documentation is in the [repository README](../README.md). Source lives in `src/`; `npm run build` writes the complete root `dist/` using the existing Vite configuration. Install with `npm ci --legacy-peer-deps`; existing manifests and lockfiles are protected and preserved.

The app uses the v2 ABI from `contracts/HamsterHour.json` and identity from `deployment/handoff.json`, exported to the runtime configuration. All production contract reads and writes use that runtime identity. No historical ABI is imported into the site.

`worker/index.ts` implements the additive API routes. `scripts/build-worker.mjs` creates the standalone `../worker/worker.mjs`; no worker is published by a build. See [worker handoff](../worker/README.md).

`npm test` runs amount, payout, telemetry, chat and worker tests. `node tests/browser.mjs` runs the production bundle with controlled wallet and RPC fixtures. Name Playwright using `IMD_PLAYWRIGHT` and browsers using `PLAYWRIGHT_BROWSERS_PATH`. A foreground preview and browser are created and closed inside that script. Screenshots and JSON results go only to root `test/scratch/browser-polish/`.

The polish adds five hash tabs, one leased live-camera/mascot frame, a shared chat drawer and exact finished-window history helpers. Current evidence and service limitations are in [POLISH-VALIDATION.md](../docs/frontend/POLISH-VALIDATION.md). Browser checks accept `HH_BROWSER=webkit` when that optional engine is installed; Chromium is the supplied usable engine.
