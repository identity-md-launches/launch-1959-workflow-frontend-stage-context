import { build } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  configFile: false,
  root: web,
  build: {
    outDir: resolve(web, "../worker"),
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    lib: {
      entry: resolve(web, "worker/index.ts"),
      formats: ["es"],
      fileName: () => "worker.mjs",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
