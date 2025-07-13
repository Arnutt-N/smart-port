import { defineConfig } from "vite"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
        // --- FIX ---
        // เปลี่ยนจากการใช้ resolve(__dirname, ...) เป็น relative path แบบง่ายๆ
        main: "./index.html",
        admin: "./admin.html",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
})
