import { SystemInstruction, type Transaction } from "@solana/web3.js";
import { expect, it, vi } from "vitest";
import { type ConnectedSolanaWallet, createSolanaAdapter } from "../solana-wallet";

const WALLET_ADDRESS = "11111111111111111111111111111111";
const RECEIVER_ADDRESS = "So11111111111111111111111111111111111111112";
const SIGNATURE_LENGTH_BYTES = 64;
const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const BLOCK_HEIGHT = 100;
const TRANSACTION_SIGNATURE = "test-transaction-signature";

it("signs the exact SDK message and converts Dynamic base64 to hex", async () => {
  // given
  const { wallet } = createWallet();
  const message = "Authorize this SDK borrow.";
  const adapter = createSolanaAdapter(wallet);

  // when
  const signature = await adapter.signMessage?.({
    chain: "SOL",
    account: WALLET_ADDRESS,
    message,
    actionType: "create-borrow",
  });

  // then
  const EXPECTED_SIGNATURE_HEX = "01".repeat(SIGNATURE_LENGTH_BYTES);
  expect(wallet.signMessage).toHaveBeenCalledExactlyOnceWith(message);
  expect(signature).toBe(EXPECTED_SIGNATURE_HEX);
});

it("preserves bigint lamports when the wallet signs a native transfer", async () => {
  // given
  const { wallet, signer } = createWallet();
  const amountLamports = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  const adapter = createSolanaAdapter(wallet);

  // when
  const signature = await adapter.sendSolTransaction?.({
    chain: "SOL",
    account: WALLET_ADDRESS,
    toAddress: RECEIVER_ADDRESS,
    amountLamports,
    actionType: "supply-deposit",
  });

  // then
  expect(signature).toBe(TRANSACTION_SIGNATURE);
  expect(signer.signAndSendTransaction).toHaveBeenCalledTimes(1);
  const [transaction] = signer.signAndSendTransaction.mock.calls[0];
  const transfer = SystemInstruction.decodeTransfer(transaction.instructions[0]);
  expect(transfer.lamports).toBe(amountLamports);
  expect(transfer.fromPubkey.toBase58()).toBe(WALLET_ADDRESS);
  expect(transfer.toPubkey.toBase58()).toBe(RECEIVER_ADDRESS);
});

it("rejects a non-mainnet connection without asking the wallet to send", async () => {
  // given
  const { wallet, connection, signer } = createWallet();
  const amountLamports = 1n;
  connection.getGenesisHash.mockResolvedValue("devnet-genesis");
  const adapter = createSolanaAdapter(wallet);

  // when
  const signature = adapter.sendSolTransaction?.({
    chain: "SOL",
    toAddress: RECEIVER_ADDRESS,
    amountLamports,
    actionType: "supply-deposit",
  });

  // then
  await expect(signature).rejects.toThrow("Switch the Solana wallet to mainnet");
  expect(signer.signAndSendTransaction).not.toHaveBeenCalled();
});

it("rejects a mismatched account before asking for a message signature", async () => {
  // given
  const { wallet } = createWallet();
  const adapter = createSolanaAdapter(wallet);
  const message = "Authorize a different account.";

  // when
  const signature = adapter.signMessage?.({
    chain: "SOL",
    account: RECEIVER_ADDRESS,
    message,
    actionType: "create-borrow",
  });

  // then
  await expect(signature).rejects.toThrow("does not match the connected wallet");
  expect(wallet.signMessage).not.toHaveBeenCalled();
});

it.each([0n, -1n, 2n ** 64n])(
  "rejects invalid lamports %s before RPC or wallet calls",
  async (amountLamports) => {
    // given
    const { wallet, signer } = createWallet();
    const adapter = createSolanaAdapter(wallet);

    // when
    const signature = adapter.sendSolTransaction?.({
      chain: "SOL",
      toAddress: RECEIVER_ADDRESS,
      amountLamports,
      actionType: "supply-deposit",
    });

    // then
    await expect(signature).rejects.toThrow("positive and fit in uint64");
    expect(wallet.getConnection).not.toHaveBeenCalled();
    expect(signer.signAndSendTransaction).not.toHaveBeenCalled();
  },
);

function createWallet() {
  const signatureByte = 1;
  const signatureBase64 = btoa(String.fromCharCode(signatureByte).repeat(SIGNATURE_LENGTH_BYTES));
  const connection = {
    getGenesisHash: vi.fn(async () => MAINNET_GENESIS_HASH),
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: WALLET_ADDRESS,
      lastValidBlockHeight: BLOCK_HEIGHT,
    })),
  };
  const signer = {
    signAndSendTransaction: vi.fn<(transaction: Transaction) => Promise<{ signature: string }>>(
      async () => ({ signature: TRANSACTION_SIGNATURE }),
    ),
  };
  const wallet = {
    address: WALLET_ADDRESS,
    signMessage: vi.fn(async () => signatureBase64),
    getConnection: vi.fn(async () => connection),
    getSigner: vi.fn(async () => signer),
  } satisfies ConnectedSolanaWallet;
  return { wallet, connection, signer };
}
