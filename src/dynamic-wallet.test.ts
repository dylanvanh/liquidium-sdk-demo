import { describe, expect, it, vi } from "vitest";
import { Chain } from "@liquidium/client";
import {
  createBitcoinAdapter,
  createEthereumAdapter,
  getBitcoinPaymentAddress,
} from "./dynamic-wallet";

describe("Dynamic wallet adapters", () => {
  it("switches to Ethereum mainnet and forwards the prepared transaction", async () => {
    const sendTransaction = vi.fn(async () => "0xtransaction");
    const switchNetwork = vi.fn(async () => undefined);
    const wallet = {
      connector: {
        getNetwork: vi.fn(async () => 8453),
        supportsNetworkSwitching: () => true,
        switchNetwork,
        getWalletClient: vi.fn(async () => ({ sendTransaction })),
      },
    } as never;
    const address = "0x1111111111111111111111111111111111111111";
    const adapter = createEthereumAdapter(wallet, address);

    const txid = await adapter.sendEthTransaction?.({
      chain: Chain.ETH,
      account: address,
      actionType: "supply-deposit",
      transaction: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0x1234",
        value: "5",
      },
    });

    expect(switchNetwork).toHaveBeenCalledWith({ networkChainId: 1, networkName: "Ethereum" });
    expect(sendTransaction).toHaveBeenCalledWith({
      account: address,
      to: "0x2222222222222222222222222222222222222222",
      data: "0x1234",
      value: 5n,
    });
    expect(txid).toBe("0xtransaction");
  });

  it("uses the Bitcoin payment address and forwards satoshi transfers", async () => {
    const sendBitcoin = vi.fn(async () => "btc-txid");
    const signMessage = vi.fn(async () => "signature");
    const wallet = {
      address: "bc1pordinal",
      additionalAddresses: [{ address: "bc1qpayment", type: "payment" }],
      sendBitcoin,
      signMessage,
    } as never;

    expect(getBitcoinPaymentAddress(wallet)).toBe("bc1qpayment");
    const adapter = createBitcoinAdapter(wallet);
    expect(
      await adapter.signMessage?.({
        chain: Chain.BTC,
        account: "bc1qpayment",
        actionType: "create-account",
        message: "Authorize profile",
      }),
    ).toBe("signature");
    expect(
      await adapter.sendBtcTransaction?.({
        chain: Chain.BTC,
        account: "bc1qpayment",
        actionType: "supply-deposit",
        toAddress: "bc1qtarget",
        amountSats: 25_000n,
      }),
    ).toBe("btc-txid");
    expect(sendBitcoin).toHaveBeenCalledWith({ amount: 25_000n, recipientAddress: "bc1qtarget" });
  });
});
