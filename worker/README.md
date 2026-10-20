# Additive worker routes

`worker.mjs` is a self-contained Cloudflare module built from `web/worker/index.ts`. It needs no secret, storage, private RPC, or server dependency. Public Ethereum RPCs and the verified v2 ABI/configuration are bundled. It implements:

- `GET /stats7`: proxies `https://api.squeekchain.com/v1/measurement/stats?range=7d`.
- `GET /stats30`: the same, `range=30d`.
- `GET /api/window`: reads the current and next hour, next line/pools/close time, jackpot buckets, and previous 24 hours at one Ethereum block. Integers are decimal strings, timestamps Unix seconds, amounts 18-decimal IMD base units. Unknown results are `null`. Includes block hash and identity.
- `/live`, `/status`, `/rounds`, `/chat`: forwards the original method, body, query and headers to the existing public worker, preserving its storage and signed chat protocol.

The existing worker source and account access were not provided. **This task does not publish workers or change DNS.** The frontend continues to use the existing public worker hostname. Its `/stats7` and `/stats30` currently return 404; the static site transparently shows dated saved telemetry until the new routes are installed.

A concrete merge wrapper is:

```js
import v2 from "./worker.mjs";
import legacy from "./existing-worker.js"; // the operator's existing handler
export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (["/stats7", "/stats30", "/api/window"].includes(path)) {
      return v2.fetch(request);
    }
    return legacy.fetch(request, env, ctx);
  },
};
```

This routes only the three additions through the bundle and keeps all other behavior in the existing handler. The import name for that handler is illustrative; use its real existing entry file.

Operator handoff: merge the three new read-only route branches into the existing worker without replacing its other handlers. This preserves its hostname, original endpoints, CORS policy and chat storage. Alternatively deploy this module as `hamster-hour-v2-api` and use Cloudflare routes on `hamsterhour.fun/stats7`, `hamsterhour.fun/stats30`, and `hamsterhour.fun/api/window`; update `services.statsProxy` in `web/src/config.ts` to the production origin and rebuild. Do not deploy this module under the legacy worker's name: its fallthrough targets that legacy service. Public read routes return CORS headers and cacheable snapshots; failures remain non-200 and contain no invented values.

Rebuild from the installed `web/` project: `node scripts/build-worker.mjs`. The standalone output is `worker/worker.mjs`. Dry-run by importing its `createHandler` and injecting a test client/fetch; see `web/tests/worker.test.ts`. Account-bound publishing is an operator step after review, outside this static-site assignment.
