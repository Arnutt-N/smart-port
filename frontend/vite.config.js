import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  root: ".",
  base: "/",
  server: {
    port: 5174,
    host: "0.0.0.0",
    open: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  // Remove problematic esbuild config for vanilla JS
  // esbuild: {
  //   loader: { ".js": "jsx" },
  //   jsxFactory: "h",
  //   jsxFragment: "Fragment",
  // },
})
