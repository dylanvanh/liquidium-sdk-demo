import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  fmt: {
    ignorePatterns: [".agents/**", "dist/**", "node_modules/**"],
  },
  lint: {
    ignorePatterns: [".agents/**", "dist/**", "node_modules/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
