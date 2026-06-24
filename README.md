# Liquidium SDK Demo

A simple Vite React demo for the Liquidium SDK accountless instant-loan flow.

The app shows how to load Liquidium markets, preview an LTV, create an instant loan, and restore an existing loan by short reference.

## Requirements

- Node.js compatible with Vite 8
- pnpm 11.2.2

## Run

Install dependencies.

```bash
pnpm install
```

Start the dev server.

```bash
pnpm dev
```

## Commands

```bash
pnpm build
pnpm preview
```

## Project Notes

- `src/App.tsx` contains the demo UI and flow state.
- `src/liquidium.ts` wraps the Liquidium SDK calls.
- The demo uses `@liquidium/client` 0.4.x.
