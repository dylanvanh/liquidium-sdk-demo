import { Asset, Chain } from "@liquidium/client";
import TokenBTC from "@web3icons/react/icons/tokens/TokenBTC";
import TokenICP from "@web3icons/react/icons/tokens/TokenICP";
import TokenUSDC from "@web3icons/react/icons/tokens/TokenUSDC";
import TokenUSDT from "@web3icons/react/icons/tokens/TokenUSDT";

type AssetIconProps = {
  asset: Asset;
  chain: Chain;
  className?: string;
};

export function AssetIcon({ asset, chain, className = "" }: AssetIconProps) {
  return (
    <span
      aria-hidden="true"
      className={`asset-icon asset-icon-${asset.toLowerCase()} ${className}`.trim()}
    >
      {asset === Asset.BTC ? <TokenBTC variant="branded" /> : null}
      {asset === Asset.ICP ? <TokenICP variant="branded" /> : null}
      {asset === Asset.USDC ? <TokenUSDC variant="branded" /> : null}
      {asset === Asset.USDT ? <TokenUSDT variant="branded" /> : null}
      {chain === Chain.ICP && asset !== Asset.ICP ? (
        <span className="asset-icon-chain">ck</span>
      ) : null}
    </span>
  );
}
