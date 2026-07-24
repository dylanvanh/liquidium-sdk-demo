import { describe, expect, test } from "vitest";
import {
  formatProtocolActivityAmount,
  formatRelativeTime,
  getProtocolActivityOperationMeta,
} from "./activity";

const BASE_TIME = new Date("2026-07-24T12:00:00Z");

describe("formatRelativeTime", () => {
  test("should return just now for timestamps under a minute old", () => {
    // given
    const timestamp = "2026-07-24T11:59:30Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("just now");
  });

  test("should use singular minute for a timestamp one minute old", () => {
    // given
    const timestamp = "2026-07-24T11:59:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("1 minute ago");
  });

  test("should return minutes for timestamps under an hour old", () => {
    // given
    const timestamp = "2026-07-24T11:41:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("19 minutes ago");
  });

  test("should use singular hour for a timestamp one hour old", () => {
    // given
    const timestamp = "2026-07-24T11:00:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("about 1 hour ago");
  });

  test("should return hours for timestamps under a day old", () => {
    // given
    const timestamp = "2026-07-24T09:00:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("about 3 hours ago");
  });

  test("should use singular day for a timestamp one day old", () => {
    // given
    const timestamp = "2026-07-23T12:00:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("1 day ago");
  });

  test("should return days for timestamps older than a day", () => {
    // given
    const timestamp = "2026-07-20T12:00:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("4 days ago");
  });

  test("should clamp future timestamps to just now", () => {
    // given
    const timestamp = "2026-07-24T12:05:00Z";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("just now");
  });

  test("should return unknown time for invalid timestamps", () => {
    // given
    const timestamp = "not-a-date";

    // when
    const result = formatRelativeTime(timestamp, BASE_TIME);

    // then
    expect(result).toBe("Unknown time");
  });
});

describe("formatProtocolActivityAmount", () => {
  test("should group thousands and keep two fraction digits", () => {
    // given
    const amount = 110_054_000_000n;
    const decimals = 8;

    // when
    const result = formatProtocolActivityAmount(amount, decimals);

    // then
    expect(result).toBe("1,100.54");
  });

  test("should trim trailing zeros from the fraction", () => {
    // given
    const amount = 200_000_000n;
    const decimals = 8;

    // when
    const result = formatProtocolActivityAmount(amount, decimals);

    // then
    expect(result).toBe("2");
  });

  test("should keep small fractions up to six digits", () => {
    // given
    const amount = 3_587_200n;
    const decimals = 8;

    // when
    const result = formatProtocolActivityAmount(amount, decimals);

    // then
    expect(result).toBe("0.035872");
  });
});

describe("getProtocolActivityOperationMeta", () => {
  test("should map every operation to a label, tone, and direction", () => {
    // given
    const operations = ["deposit", "borrow", "repayment", "withdrawal", "liquidation"] as const;

    // when
    const metas = operations.map(getProtocolActivityOperationMeta);

    // then
    expect(metas.map((meta) => meta.label)).toEqual([
      "Supplied",
      "Borrowed",
      "Repaid",
      "Withdrawn",
      "Liquidated",
    ]);
    expect(metas.map((meta) => meta.direction)).toEqual(["in", "out", "in", "out", "alert"]);
  });
});
