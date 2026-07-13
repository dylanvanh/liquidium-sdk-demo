import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const projectPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const requireFromProject = createRequire(import.meta.url);
const requireFromDynamicEthereum = createRequire(
  requireFromProject.resolve("@dynamic-labs/ethereum/package.json"),
);
const requireFromEmbeddedWallet = createRequire(
  requireFromDynamicEthereum.resolve("@dynamic-labs/embedded-wallet-evm/package.json"),
);
const nobleHashesUtilsPath = requireFromProject.resolve("@noble/hashes/utils");
const turnkeyStamperPath = dirname(requireFromEmbeddedWallet.resolve("@turnkey/api-key-stamper"));

export default defineConfig({
  define: {
    global: "globalThis",
    process: { env: {}, version: "v18.0.0" },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: projectPath("./src") },
      { find: /^@noble\/hashes\/utils$/, replacement: nobleHashesUtilsPath },
      { find: "@noble/hashes", replacement: dirname(nobleHashesUtilsPath) },
      { find: "./nodecrypto.mjs", replacement: `${turnkeyStamperPath}/webcrypto.mjs` },
      {
        find: /^buffer(?:\/index\.js)?$/,
        replacement: requireFromProject.resolve("buffer/index.js"),
      },
      {
        find: /^process(?:\/browser)?$/,
        replacement: requireFromProject.resolve("process/browser"),
      },
      { find: /^stream$/, replacement: requireFromProject.resolve("stream-browserify") },
      { find: /^util$/, replacement: requireFromProject.resolve("util/") },
    ],
  },
  build: {
    chunkSizeWarningLimit: 6_000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === "INVALID_ANNOTATION" &&
          warning.id?.includes("/node_modules/.pnpm/ox@")
        )
          return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (
            id.includes("@dynamic-labs") ||
            id.includes("@reown") ||
            id.includes("@turnkey") ||
            id.includes("@walletconnect") ||
            id.includes("bitcoinjs-lib") ||
            id.includes("sats-connect") ||
            id.includes("viem") ||
            id.includes("/ox/")
          )
            return "wallet-stack";
        },
      },
    },
  },
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
