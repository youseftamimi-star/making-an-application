"use client";

/** On-screen keypad for a shekel amount (string like "12.5"). */
export function AmountKeypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (k: string) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === "." && (value.includes(".") || value === "")) return;
    const next = value === "0" && k !== "." ? k : value + k;
    if (!/^\d{0,6}(\.\d{0,2})?$/.test(next)) return;
    onChange(next);
  };
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          className="h-14 rounded-xl bg-slate-100 text-2xl font-semibold active:bg-slate-300"
          aria-label={k === "⌫" ? "מחיקה" : k}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
