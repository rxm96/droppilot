import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  root: "src/renderer",
  plugins: [
    react(),
    renderer(),
    electron({
      main: {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: ["electron-updater"],
            },
          },
        },
      },
      preload: {
        input: {
          preload: "src/preload/index.ts",
        },
        vite: {
          build: {
            outDir: "dist-electron/preload",
          },
        },
      },
    }),
  ],
  build: {
    outDir: "../../dist/renderer",
  },
});
