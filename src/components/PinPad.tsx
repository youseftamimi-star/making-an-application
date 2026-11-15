"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 4-digit keypad. Calls onComplete as soon as the 4th digit is typed (no confirm button).
 * Physical keyboard digits work too. Bump `resetKey` to clear and shake after a wrong PIN.
 */
export function PinPad({
  onComplete,
  disabled,
  resetKey,
  length = 4,
  tone = "dark",
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  resetKey?: number;
  length?: number;
  tone?: "dark" | "light";
}) {
  const [pin, _setPin] = useState("");
  const pinRef = useRef("");
  const setPin = (v: string) => {
    pinRef.current = v;
    _setPin(v);
  };
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (resetKey === undefined || resetKey === 0) return;
    setPin("");
    setShake(true);
    const t = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(t);
  }, [resetKey]);

  const press = useCallback(
    (d: string) => {
      if (disabled || pinRef.current.length >= length) return;
      const next = pinRef.current + d;
      setPin(next);
      if (next.length === length) setTimeout(() => onComplete(next), 60);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, length, onComplete],
  );
  const back = useCallback(() => {
    if (!disabled) setPin(pinRef.current.slice(0, -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back]);

  const keyCls =
    tone === "dark"
      ? "bg-white/10 active:bg-white/25 text-white"
      : "bg-slate-100 active:bg-slate-300 text-slate-900";

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      <div className={`flex gap-4 ${shake ? "animate-shake" : ""}`} dir="ltr" aria-label="PIN">
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`size-5 rounded-full border-2 ${
              tone === "dark" ? "border-white" : "border-slate-700"
            } ${i < pin.length ? (tone === "dark" ? "bg-white" : "bg-slate-700") : ""}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={disabled}
            className={`size-20 rounded-2xl text-3xl font-semibold ${keyCls} disabled:opacity-40`}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")} disabled={disabled}
          className={`size-20 rounded-2xl text-3xl font-semibold ${keyCls} disabled:opacity-40`}>
          0
        </button>
        <button type="button" onClick={back} disabled={disabled} aria-label="מחיקה"
          className={`size-20 rounded-2xl text-2xl ${keyCls} disabled:opacity-40`}>
          ⌫
        </button>
      </div>
    </div>
  );
}
