import { describe, expect, it } from "vitest";
import { debtAge } from "@/lib/debtAge";

const now = new Date("2026-06-01T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();
const tx = (type: "debt" | "payment", d: number, status: "active" | "cancelled" = "active") => ({
  type,
  status,
  createdAt: daysAgo(d),
});

describe("debtAge", () => {
  it("no open balance is always ok", () => {
    expect(debtAge(0, [tx("debt", 100)], now)).toEqual({ level: "ok", days: null });
  });

  it("counts from the last payment", () => {
    expect(debtAge(5000, [tx("debt", 90), tx("payment", 10), tx("payment", 40)], now)).toEqual({ level: "ok", days: 10 });
    expect(debtAge(5000, [tx("debt", 90), tx("payment", 45)], now)).toEqual({ level: "warn", days: 45 });
  });

  it("never paid counts from the first debt", () => {
    expect(debtAge(5000, [tx("debt", 5), tx("debt", 61)], now)).toEqual({ level: "late", days: 61 });
  });

  it("uses the 30 / 60 day boundaries", () => {
    expect(debtAge(1, [tx("debt", 29)], now).level).toBe("ok");
    expect(debtAge(1, [tx("debt", 30)], now).level).toBe("warn");
    expect(debtAge(1, [tx("debt", 60)], now).level).toBe("warn");
    expect(debtAge(1, [tx("debt", 61)], now).level).toBe("late");
  });

  it("ignores cancelled transactions", () => {
    expect(debtAge(5000, [tx("debt", 70), tx("payment", 2, "cancelled")], now)).toEqual({ level: "late", days: 70 });
  });
});
