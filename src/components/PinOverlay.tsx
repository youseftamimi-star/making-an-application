"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PinPad } from "./PinPad";
import { SuccessFlash } from "./SuccessFlash";
import { ApiError, errorText, type Me } from "@/lib/client";
import { formatAgorot } from "@/lib/money";

export type Summary = {
  type: "debt" | "payment";
  before: number;
  amount: number;
  after: number;
  label?: string; // e.g. "ביטול עסקה"
};

type Props = {
  me: Me;
  customerName: string;
  title: string;
  successText: string;
  onClose: () => void;
  onDone: () => void;
  /** "confirm": customer types their PIN once. "set": customer chooses a new PIN and repeats it. */
  mode: "confirm" | "set";
  summary?: Summary;
  onPin: (pin: string) => Promise<unknown>;
  /** If given, shows the owner override path. */
  onOverride?: (o: { managerPin?: string }) => Promise<unknown>;
  /** Shown above the pad, e.g. a credit limit warning. */
  notice?: string;
  /** Hide the customer PIN pad: only the owner override path is offered (e.g. over the credit limit, PIN locked). */
  overrideOnly?: boolean;
  /** Replaces the default prompt above the pad. */
  prompt?: string;
};

/** Full-screen, customer-facing screen. The seller turns the device toward the customer. */
export function PinOverlay(p: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);
  const [view, setView] = useState<"customer" | "manager">(
    p.overrideOnly && p.me.role !== "owner" ? "manager" : "customer",
  );

  // Take focus so digits typed on a physical keyboard never reach inputs behind the overlay.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);
  const [firstPin, setFirstPin] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        setDone(true);
      } catch (e) {
        setError(errorText(e));
        if (e instanceof ApiError && e.code === "PIN_LOCKED") setLocked(true);
        setResetKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const onCustomerPin = useCallback(
    (pin: string) => {
      if (p.mode === "set") {
        if (!firstPin) {
          setFirstPin(pin);
          setError(null);
          return;
        }
        if (pin !== firstPin) {
          setFirstPin(null);
          setError("הקודים לא תואמים. בחרו קוד מחדש.");
          setResetKey((k) => k + 1);
          return;
        }
      }
      void run(() => p.onPin(pin));
    },
    [p, firstPin, run],
  );

  if (done) {
    if (!p.successText) return <ImmediateDone onDone={p.onDone} />;
    return <SuccessFlash text={p.successText} onDone={p.onDone} />;
  }

  const s = p.summary;
  const isOwner = p.me.role === "owner";
  const prompt = p.prompt ??
    (view === "manager"
      ? "קוד בעלים"
      : p.mode === "set"
        ? firstPin
          ? "הקישו שוב את הקוד לאישור"
          : "בחרו קוד סודי בן 4 ספרות"
        : "הקישו את הקוד הסודי שלכם לאישור");

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-900 text-white outline-none"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={p.onClose} className="rounded-xl bg-white/10 px-4 py-2 text-lg active:bg-white/25">
          ביטול
        </button>
        <span className="text-slate-300">{p.title}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
        <p className="text-3xl font-bold">{p.customerName}</p>

        {s && (
          <div className="grid w-full max-w-xl grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-sm text-slate-400">יתרה קודמת</p>
              <p className="text-lg font-semibold tabular-nums sm:text-2xl">{formatAgorot(s.before)}</p>
            </div>
            <div className={`rounded-2xl p-3 ${s.type === "debt" ? "bg-rose-600" : "bg-emerald-600"}`}>
              <p className="text-sm text-white/80">{s.label ?? (s.type === "debt" ? "חוב חדש" : "תשלום")}</p>
              <p className="text-xl font-bold tabular-nums sm:text-3xl">
                {s.type === "debt" ? "+" : "−"}
                {formatAgorot(s.amount)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-sm text-slate-400">יתרה חדשה</p>
              <p className="text-lg font-semibold tabular-nums sm:text-2xl">{formatAgorot(s.after)}</p>
            </div>
          </div>
        )}

        {p.notice && <p className="rounded-xl bg-amber-500/20 px-4 py-2 text-amber-200">{p.notice}</p>}

        {!(p.overrideOnly && view === "customer") && <p className="text-xl text-slate-200">{prompt}</p>}

        {p.overrideOnly && view === "customer" ? null : view === "customer" ? (
          <PinPad
            key={`c-${firstPin ? 2 : 1}`}
            onComplete={onCustomerPin}
            disabled={busy || locked}
            resetKey={resetKey}
          />
        ) : (
          <PinPad
            key="m"
            onComplete={(pin) => run(() => p.onOverride!({ managerPin: pin }))}
            disabled={busy}
            resetKey={resetKey}
          />
        )}

        <p className="min-h-7 text-lg text-rose-300" role="alert">
          {busy ? <span className="text-slate-300">מאשר…</span> : error}
        </p>

        {p.onOverride && (
          <div className="flex gap-3">
            {isOwner ? (
              <button
                disabled={busy}
                onClick={() => run(() => p.onOverride!({}))}
                className="rounded-xl border border-amber-400/60 px-4 py-2 text-amber-200 active:bg-amber-400/20"
              >
                אישור בעלים ללא קוד לקוח
              </button>
            ) : view === "customer" ? (
              <button
                disabled={busy}
                onClick={() => {
                  setView("manager");
                  setError(null);
                }}
                className="rounded-xl border border-amber-400/60 px-4 py-2 text-amber-200 active:bg-amber-400/20"
              >
                אישור בעלים (קוד בעלים)
              </button>
            ) : p.overrideOnly ? null : (
              <button
                onClick={() => {
                  setView("customer");
                  setError(null);
                }}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                חזרה לקוד לקוח
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ImmediateDone({ onDone }: { onDone: () => void }) {
  const ref = useRef(onDone);
  ref.current = onDone;
  useEffect(() => ref.current(), []);
  return null;
}
