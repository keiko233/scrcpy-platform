import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devtools } from "@tanstack/devtools-vite";

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      router: {
        generatedRouteTree: `route-tree.gen.ts`,
        routeTreeFileHeader: [`/* oxlint-disable */`, `// @ts-nocheck`],
        routeFileIgnorePattern: "_modules",
      },
    }),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
});
