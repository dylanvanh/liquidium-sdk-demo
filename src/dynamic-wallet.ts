import { isBitcoinWallet } from "@dynamic-labs/bitcoin";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Chain, type WalletAdapter } from "@liquidium/client";

type DynamicWallet = ReturnType<typeof useDynamicContext>["primaryWallet"];
type SigningChain = typeof Chain.BTC | typeof Chain.ETH;

type EvmWalletClient = {
  signMessage?(request: { account: `0x${string}`; message: string }): Promise<string>;
  sendTransaction(request: {
    account: `0x${string}`;
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  }): Promise<string>;
};

type EvmConnector = {
  signMessage?(message: string): Promise<string | undefined>;
  getWalletClient?(
    chainId?: string,
  ): Promise<EvmWalletClient | undefined> | EvmWalletClient | undefined;
  getNetwork?(): Promise<number | undefined>;
  supportsNetworkSwitching?(): boolean;
  switchNetwork?(request: { networkChainId: number; networkName?: string }): Promise<void>;
};

type BitcoinAddress = { address?: string; type?: string; addressType?: string };
type BitcoinWallet = NonNullable<DynamicWallet> & {
  additionalAddresses?: BitcoinAddress[];
  signMessage(message: string, options?: { addressType: "payment" }): Promise<string | undefined>;
  sendBitcoin(request: { amount: bigint; recipientAddress: string }): Promise<string | undefined>;
};

export type ConnectedWallet = {
  address: string;
  chain: SigningChain;
  adapter: WalletAdapter;
};

export function getConnectedWallet(wallet: DynamicWallet): ConnectedWallet | null {
  if (!wallet) return null;
  if (isEthereumWallet(wallet)) {
    const address = wallet.address?.trim();
    if (!address) return null;
    return { address, chain: Chain.ETH, adapter: createEthereumAdapter(wallet, address) };
  }
  if (isBitcoinWallet(wallet)) {
    const bitcoinWallet = wallet as BitcoinWallet;
    const address = getBitcoinPaymentAddress(bitcoinWallet);
    if (!address) return null;
    return { address, chain: Chain.BTC, adapter: createBitcoinAdapter(bitcoinWallet) };
  }
  return null;
}

export function createEthereumAdapter(
  wallet: NonNullable<DynamicWallet>,
  address: string,
): WalletAdapter {
  const connector = wallet.connector as EvmConnector | undefined;
  const account = address as `0x${string}`;
  return {
    signMessage: async ({ message }) => {
      const directSignature = await connector?.signMessage?.(message);
      if (directSignature) return directSignature;
      const client = await connector?.getWalletClient?.("1");
      const signature = await client?.signMessage?.({ account, message });
      if (!signature) throw new Error("Connected Ethereum wallet cannot sign messages.");
      return signature;
    },
    sendEthTransaction: async ({ transaction }) => {
      await ensureEthereumMainnet(connector);
      const client = await connector?.getWalletClient?.("1");
      if (!client) throw new Error("Connected wallet does not expose an Ethereum client.");
      return await client.sendTransaction({
        account,
        to: transaction.to as `0x${string}`,
        ...(transaction.data ? { data: transaction.data as `0x${string}` } : {}),
        ...(transaction.value ? { value: BigInt(transaction.value) } : {}),
      });
    },
  };
}

export function createBitcoinAdapter(wallet: BitcoinWallet): WalletAdapter {
  return {
    signMessage: async ({ message }) => {
      const signature = await wallet.signMessage(message, { addressType: "payment" });
      if (!signature) throw new Error("Connected Bitcoin wallet did not return a signature.");
      return signature;
    },
    sendBtcTransaction: async ({ toAddress, amountSats }) => {
      if (!amountSats || amountSats <= 0n) throw new Error("Enter a positive BTC amount.");
      const txid = await wallet.sendBitcoin({ amount: amountSats, recipientAddress: toAddress });
      if (!txid) throw new Error("Connected Bitcoin wallet did not return a transaction ID.");
      return txid;
    },
  };
}

async function ensureEthereumMainnet(connector?: EvmConnector): Promise<void> {
  const chainId = await connector?.getNetwork?.();
  if (!chainId || chainId === 1) return;
  if (!connector?.switchNetwork || connector.supportsNetworkSwitching?.() === false) {
    throw new Error("Switch the connected wallet to Ethereum mainnet.");
  }
  await connector.switchNetwork({ networkChainId: 1, networkName: "Ethereum" });
}

export function getBitcoinPaymentAddress(wallet: BitcoinWallet): string | null {
  const addresses = wallet.additionalAddresses as BitcoinAddress[] | undefined;
  const payment = addresses?.find(
    (item) => item.type === "payment" || item.addressType === "payment",
  )?.address;
  return payment?.trim() || wallet.address?.trim() || null;
}
