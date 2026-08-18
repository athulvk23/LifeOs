import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: "all",
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
