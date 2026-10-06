import { rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Real lab recordings in public/samples/local/ are personal health data.
// Vite copies everything in public/ into dist/, so we delete that folder after
// the build. This keeps them out of GitHub Pages even after a local build.
function removeLocalRecordings(): Plugin {
  let outDir = "dist";
  return {
    name: "remove-local-recordings",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      rmSync(resolve(outDir, "samples/local"), {
        recursive: true,
        force: true,
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeLocalRecordings()],
});
