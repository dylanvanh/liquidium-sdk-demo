import {
  Chain,
  type Pool,
  type ProtocolActivityEntry,
  type ProtocolActivityOperation,
} from "@liquidium/client";
import { client, formatBaseUnits } from "./liquidium";

export const PROTOCOL_ACTIVITY_LIMIT = 50;
export const PROTOCOL_ACTIVITY_POLL_INTERVAL_MS = 15_000;
const ACTIVITY_AMOUNT_MAX_FRACTION_DIGITS = 6;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export type ProtocolActivityFilter = "all" | ProtocolActivityOperation;

export const PROTOCOL_ACTIVITY_FILTERS: ReadonlyArray<{
  label: string;
  value: ProtocolActivityFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Supplied", value: "deposit" },
  { label: "Borrowed", value: "borrow" },
  { label: "Repaid", value: "repayment" },
  { label: "Withdrawn", value: "withdrawal" },
  { label: "Liquidated", value: "liquidation" },
];

export type ProtocolActivityOperationMeta = {
  label: string;
  tone: "success" | "info" | "accent" | "neutral" | "danger";
  direction: "in" | "out" | "alert";
};

export function getProtocolActivityOperationMeta(
  operation: ProtocolActivityOperation,
): ProtocolActivityOperationMeta {
  switch (operation) {
    case "deposit":
      return { label: "Supplied", tone: "success", direction: "in" };
    case "borrow":
      return { label: "Borrowed", tone: "info", direction: "out" };
    case "repayment":
      return { label: "Repaid", tone: "accent", direction: "in" };
    case "withdrawal":
      return { label: "Withdrawn", tone: "neutral", direction: "out" };
    case "liquidation":
      return { label: "Liquidated", tone: "danger", direction: "alert" };
  }
}

export async function fetchProtocolActivity(
  filter: ProtocolActivityFilter,
): Promise<ProtocolActivityEntry[]> {
  return await client.history.getProtocolActivity({
    limit: PROTOCOL_ACTIVITY_LIMIT,
    operations: filter === "all" ? undefined : [filter],
  });
}

export function getPoolByActivity(pools: Pool[], entry: ProtocolActivityEntry): Pool | undefined {
  return pools.find((pool) => pool.id === entry.poolId);
}

export function getActivityExplorerChain(
  pools: Pool[],
  entry: ProtocolActivityEntry,
): Chain | null {
  return getPoolByActivity(pools, entry)?.chain ?? null;
}

export function formatProtocolActivityAmount(amount: bigint, decimals: number): string {
  const formatted = formatBaseUnits(amount, BigInt(decimals), ACTIVITY_AMOUNT_MAX_FRACTION_DIGITS);
  const numeric = Number(formatted);
  if (!Number.isFinite(numeric)) return formatted;
  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: ACTIVITY_AMOUNT_MAX_FRACTION_DIGITS,
  });
}

export function formatRelativeTime(timestamp: string, now: Date = new Date()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (elapsedSeconds < SECONDS_PER_MINUTE) return "just now";
  const minutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return hours === 1 ? "about 1 hour ago" : `about ${hours} hours ago`;
  }
  const days = Math.floor(hours / HOURS_PER_DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
