import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "serve-verified-deployment-in-development",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const path = new URL(request.url ?? "/", "http://dev.local").pathname;
          if (
            !/^\/(imd-deployment\.json|abi\/(HamsterHour|OracleVerifier)\.json)$/.test(
              path,
            )
          )
            return next();
          try {
            const bytes = await readFile(
              fileURLToPath(new URL(`../dist${path}`, import.meta.url)),
            );
            response.setHeader("Content-Type", "application/json");
            response.end(bytes);
          } catch {
            response.statusCode = 503;
            response.end(
              "Run npm run build before starting the development server.",
            );
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
});
