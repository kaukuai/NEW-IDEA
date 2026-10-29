import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 3000, strictPort: true, allowedHosts: true },
  build: { target: "es2022" },
});
