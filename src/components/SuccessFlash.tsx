"use client";
import { useEffect, useRef } from "react";
import { MoneyRain } from "./MoneyRain";
import { playChaChing } from "@/lib/sound";

/**
 * Full-screen green confirmation. Calls onDone exactly once after `ms`, even if the parent re-renders.
 * `celebrate`: "payment" rains money with a cash register sound; "paidOff" (balance reached 0) rains harder.
 */
export function SuccessFlash({
  text,
  onDone,
  ms,
  celebrate,
}: {
  text: string;
  onDone: () => void;
  ms?: number;
  celebrate?: "payment" | "paidOff";
}) {
  const duration = ms ?? (celebrate === "paidOff" ? 1800 : 1200);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), duration);
    return () => clearTimeout(t);
  }, [duration]);
  useEffect(() => {
    if (celebrate) playChaChing();
  }, [celebrate]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-emerald-600 text-white" role="status">
      {celebrate && <MoneyRain count={celebrate === "paidOff" ? 60 : 28} />}
      <svg viewBox="0 0 24 24" width="160" height="160" className="animate-pop" fill="none" stroke="#ffffff" strokeWidth={2.5} aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-4xl font-bold">{text}</p>
      {celebrate === "paidOff" && <p className="animate-pop text-3xl font-bold">החוב נסגר! 🎉</p>}
    </div>
  );
}
