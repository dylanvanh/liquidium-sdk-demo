import { describe, expect, it } from "vitest";
import { Chain } from "@liquidium/client";
import { formatTransactionId, getTransactionExplorerLink } from "./transaction-explorer";

describe("transaction explorer links", () => {
  it.each([
    [Chain.BTC, "bitcoin-id", "https://mempool.space/tx/bitcoin-id", "Mempool"],
    [Chain.ETH, "0xethereum-id", "https://etherscan.io/tx/0xethereum-id", "Etherscan"],
    [
      Chain.ICP,
      "icp-hash",
      "https://dashboard.internetcomputer.org/transaction/icp-hash",
      "ICP Dashboard",
    ],
  ])("maps %s transactions to the correct explorer", (chain, id, href, label) => {
    expect(getTransactionExplorerLink(chain, id)).toEqual({ href, label });
  });

  it("ignores missing transaction data and safely encodes ids", () => {
    expect(getTransactionExplorerLink(null, "transaction-id")).toBeNull();
    expect(getTransactionExplorerLink(Chain.BTC, "  ")).toBeNull();
    expect(getTransactionExplorerLink(Chain.BTC, "id/with spaces")?.href).toBe(
      "https://mempool.space/tx/id%2Fwith%20spaces",
    );
  });

  it("keeps short ids intact and truncates long ids", () => {
    expect(formatTransactionId("12345")).toBe("12345");
    expect(formatTransactionId("1234567890abcdefghijklmnop")).toBe("12345678…klmnop");
  });
});
