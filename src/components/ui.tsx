"use client";
import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: { variant?: "primary" | "secondary" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-slate-900 text-white active:bg-slate-700",
    secondary: "bg-white text-slate-900 border border-slate-300 active:bg-slate-100",
    danger: "bg-rose-600 text-white active:bg-rose-700",
  }[variant];
  return (
    <button {...props} className={`rounded-xl px-5 py-3 text-lg font-semibold disabled:opacity-50 ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-rose-700">
      {children}
    </p>
  );
}
