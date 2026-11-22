import { describe, expect, it } from "vitest";
import { debtLevel, partnerJoke } from "@/lib/debtLevel";

describe("debtLevel", () => {
  it("maps balances to the right level at each boundary", () => {
    expect(debtLevel(0).emoji).toBe("😇");
    expect(debtLevel(-500).emoji).toBe("😇");
    expect(debtLevel(1).emoji).toBe("🙂");
    expect(debtLevel(100_00).emoji).toBe("🙂");
    expect(debtLevel(100_01).emoji).toBe("😅");
    expect(debtLevel(500_00).emoji).toBe("😅");
    expect(debtLevel(500_01).emoji).toBe("😬");
    expect(debtLevel(1000_00).emoji).toBe("😬");
    expect(debtLevel(1000_01).emoji).toBe("🫠");
  });

  it("jokes only for the top level", () => {
    expect(partnerJoke(1000_00)).toBeUndefined();
    expect(partnerJoke(1000_01)).toContain("שותף בעסק");
  });
});
