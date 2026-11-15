/** Money is kept in agorot (integer). 1 ₪ = 100 agorot. */

/** Parse user input like "12", "12.5", "12.50" into agorot. Returns null if invalid. */
export function parseShekelsToAgorot(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

const whole = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2 });

/** 12345 -> "‏123.45 ₪", 5000 -> "‏50 ₪" */
export function formatAgorot(agorot: number): string {
  return (agorot % 100 === 0 ? whole : cents).format(agorot / 100);
}
