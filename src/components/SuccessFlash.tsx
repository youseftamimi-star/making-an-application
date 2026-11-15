"use client";
import { useEffect, useRef } from "react";

/** Full-screen green confirmation. Calls onDone exactly once after `ms`, even if the parent re-renders. */
export function SuccessFlash({ text, onDone, ms = 1200 }: { text: string; onDone: () => void; ms?: number }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-emerald-600 text-white" role="status">
      <svg viewBox="0 0 24 24" width="160" height="160" className="animate-pop" fill="none" stroke="#ffffff" strokeWidth={2.5} aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-4xl font-bold">{text}</p>
    </div>
  );
}
