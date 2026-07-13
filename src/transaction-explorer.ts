import { Chain } from "@liquidium/client";

export interface TransactionExplorerLink {
  href: string;
  label: string;
}

export function getTransactionExplorerLink(
  chain: Chain | null,
  transactionId: string,
): TransactionExplorerLink | null {
  const id = transactionId.trim();
  if (!id) return null;

  const encodedId = encodeURIComponent(id);
  switch (chain) {
    case Chain.BTC:
      return { href: `https://mempool.space/tx/${encodedId}`, label: "Mempool" };
    case Chain.ETH:
      return { href: `https://etherscan.io/tx/${encodedId}`, label: "Etherscan" };
    case Chain.ICP:
      return {
        href: `https://dashboard.internetcomputer.org/transaction/${encodedId}`,
        label: "ICP Dashboard",
      };
    default:
      return null;
  }
}

export function formatTransactionId(transactionId: string): string {
  const id = transactionId.trim();
  if (id.length <= 18) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}
