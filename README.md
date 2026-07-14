# Liquidium SDK Demo

A client-side React demo for `@liquidium/client` `0.5.0-rc.1`. It mirrors Liquidium's Simple and Advanced product hierarchy while keeping the implementation focused enough to use as SDK integration reference.

## Included flows

- Accountless Simple Loans with quote validation, generated deposit and repayment targets, activity polling, and recovery by reference, address, or transaction ID.
- Native BTC, USDC, and USDT routes plus ICP, ckBTC, ckUSDC, and ckUSDT routes through the SDK's `Chain + Asset` identifiers.
- Dynamic-connected Ethereum and Bitcoin profiles for supply, borrow, repay, withdraw, and portfolio reads.
- Manual ICRC transfer instructions with the live ledger fee, exact fee-inclusive wallet debit, copyable account details, and transaction-reference tracking for ICP-chain assets.
- Typed, chain-aware destination validation for native and ICP delivery routes, including explicit recovery when a Simple Loan was created but could not be hydrated immediately.
- Live Insights charts for supplied capital, borrowed capital, deposit composition, utilization, and rates across SDK-supported pools.

The app uses Liquidium's bundled mainnet canisters and service defaults. It does not broadcast transactions during automated tests.

## Environment

Copy `.env.example` to `.env` and set a public Dynamic environment configured with Ethereum and Bitcoin wallet connectors.

```bash
VITE_DYNAMIC_ENVIRONMENT_ID=
```

`VITE_EVM_RPC_URL` and `VITE_INFURA_API_KEY` are optional. The implemented transfer/deposit-address flows do not require an RPC, but the client accepts either value for future contract-interaction work.

Vite environment variables are bundled into browser code; do not put private credentials in them.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Container

Build and publish the production image for the homelab's AMD64 and ARM64 nodes. The Vite environment is mounted only for the build step and is bundled into the public client assets.

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --secret id=vite_env,src=.env \
  --tag ghcr.io/dylanvanh/liquidium-sdk-demo:latest \
  --push .
```

## Structure

- `src/App.tsx` contains the wallet-free Simple flow and shared shell.
- `src/AdvancedApp.tsx` is lazy-loaded and contains Dynamic-backed profile flows.
- `src/InsightsApp.tsx` derives live market charts and the asset table from SDK pool snapshots.
- `src/liquidium.ts` owns RC request construction, route mapping, and SDK orchestration.
- `src/dynamic-wallet.ts` adapts Dynamic Ethereum and Bitcoin wallets to the Liquidium `WalletAdapter` interface.
