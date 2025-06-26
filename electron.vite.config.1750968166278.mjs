// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "/Users/ctf/Documents/CodingProjects/euphoria-pos";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/main.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/preload.ts")
        },
        output: {
          format: "cjs",
          entryFileNames: "index.cjs"
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@features": resolve(__electron_vite_injected_dirname, "src/features")
      }
    },
    plugins: [react()],
    root: __electron_vite_injected_dirname,
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "index.html")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
