"use client";
import { useMemo } from "react";

const ICONS = ["💵", "💵", "💸", "🪙", "💰"];

/** Bills and coins falling over the screen. Pure CSS; pointer-events off so it never blocks a tap. */
export function MoneyRain({ count = 28 }: { count?: number }) {
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        icon: ICONS[i % ICONS.length],
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 0.9 + Math.random() * 0.8,
        size: 32 + Math.random() * 36,
        spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
      })),
    [count],
  );
  return (
    <div className="money-rain pointer-events-none fixed inset-0 z-[61] overflow-hidden" aria-hidden>
      {drops.map((d) => (
        <span
          key={d.id}
          className="money-drop absolute top-0"
          style={
            {
              left: `${d.left}%`,
              fontSize: d.size,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
              "--spin": `${d.spin}deg`,
            } as React.CSSProperties
          }
        >
          {d.icon}
        </span>
      ))}
    </div>
  );
}
