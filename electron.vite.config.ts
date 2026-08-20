import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "electron-vite";

// https://electron-vite.org/config/
export default defineConfig({
  main: {
    clearScreen: false,
  },
  preload: {
    clearScreen: false,
    // Sandboxed preload scripts must be CommonJS. Keep the extension explicit
    // so Electron's sandbox loader can require it regardless of "type": "module".
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    clearScreen: false,
    root: ".",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL("./index.html", import.meta.url)),
        },
      },
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        generatedRouteTree: "./src/route-tree.gen.ts",
        routeFileIgnorePattern: "_modules",
        routeTreeFileHeader: ["/* oxlint-disable */", "// @ts-nocheck"],
      }),
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
    ],
  },
});
