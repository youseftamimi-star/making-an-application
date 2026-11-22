const DAY_MS = 24 * 60 * 60 * 1000;

export type DebtAgeLevel = "ok" | "warn" | "late";

type Tx = { type: "debt" | "payment"; status: "active" | "cancelled"; createdAt: string };

/**
 * How long a customer with an open balance has gone without paying.
 * Counts from the last active payment; a customer who never paid counts from their first active debt.
 * Up to 30 days → "ok", 30–60 → "warn", over 60 → "late". No open balance → "ok".
 */
export function debtAge(balance: number, history: Tx[], now: number): { level: DebtAgeLevel; days: number | null } {
  if (balance <= 0) return { level: "ok", days: null };
  const active = history.filter((t) => t.status === "active");
  const times = (type: Tx["type"]) => active.filter((t) => t.type === type).map((t) => new Date(t.createdAt).getTime());
  const payments = times("payment");
  const debts = times("debt");
  const since = payments.length ? Math.max(...payments) : debts.length ? Math.min(...debts) : null;
  if (since == null) return { level: "ok", days: null };
  const days = Math.max(0, Math.floor((now - since) / DAY_MS));
  return { level: days > 60 ? "late" : days >= 30 ? "warn" : "ok", days };
}
