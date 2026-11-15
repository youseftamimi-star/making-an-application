"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Customer } from "@/lib/client";
import { formatAgorot, parseShekelsToAgorot } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { AmountKeypad } from "@/components/AmountKeypad";
import { PinOverlay } from "@/components/PinOverlay";
import { CancelTx } from "@/components/CancelTx";
import { Button, Card, ErrorText } from "@/components/ui";
import { useMe } from "@/components/useMe";

type HistoryRow = {
  id: string;
  type: "debt" | "payment";
  amount: number;
  balanceAfter: number;
  status: "active" | "cancelled";
  confirmedBy: "pin" | "owner_override";
  createdAt: string;
  cancelledAt: string | null;
  staffName: string;
};
type Data = { customer: Customer; history: HistoryRow[]; serverNow: string };

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const d = await api<Data>(`/api/customers/${id}`);
      return { ...d, skew: new Date(d.serverNow).getTime() - Date.now() };
    },
    refetchInterval: 5000,
  });

  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<null | "debt" | "payment">(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState<null | "set" | "manager">(null);
  const [managerPin, setManagerPin] = useState<string | undefined>();
  const [editLimit, setEditLimit] = useState(false);

  if (q.isPending) return <p className="p-8 text-center text-slate-500">טוען…</p>;
  if (q.isError) return <ErrorText>{errorText(q.error)}</ErrorText>;
  const { customer: c, history, skew } = q.data;

  const agorot = parseShekelsToAgorot(amount);
  const locked = !!c.pinLockedUntil && new Date(c.pinLockedUntil).getTime() > Date.now() + skew;

  function start(type: "debt" | "payment") {
    setFormError(null);
    if (!agorot) return setFormError("הזינו סכום.");
    if (type === "payment" && agorot > c.balance) {
      return setFormError(`התשלום גבוה מיתרת החוב (${formatAgorot(c.balance)}).`);
    }
    setPending(type);
  }

  const after = pending && agorot ? (pending === "debt" ? c.balance + agorot : c.balance - agorot) : 0;
  const overLimit = pending === "debt" && c.creditLimit != null && after > c.creditLimit;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{c.name}</h1>
          <p className="text-slate-500" dir="ltr">
            {c.phone.replace(/^(\d{3})(\d+)$/, "$1-$2")}
          </p>
          {locked && <p className="mt-1 text-sm font-medium text-amber-700">הקוד נעול זמנית אחרי ניסיונות שגויים</p>}
        </div>
        <div className="text-end">
          <p className="text-sm text-slate-500">יתרת חוב</p>
          <p data-testid="balance" className={`text-4xl font-bold tabular-nums ${c.balance > 0 ? "text-rose-600" : "text-slate-700"}`}>
            {formatAgorot(c.balance)}
          </p>
          <p className="text-sm text-slate-500">
            תקרת אשראי: {c.creditLimit == null ? "ללא" : formatAgorot(c.creditLimit)}
          </p>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">סכום (₪)</span>
              <input
                autoFocus
                disabled={!!pending}
                value={amount}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (/^\d{0,6}(\.\d{0,2})?$/.test(v)) setAmount(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") start("debt");
                }}
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                className="w-full rounded-2xl border-2 border-slate-300 px-4 py-3 text-center text-4xl font-bold tabular-nums outline-none focus:border-slate-900"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" className="py-5 text-xl" onClick={() => start("debt")}>
                רישום חוב
              </Button>
              <Button className="bg-emerald-600 py-5 text-xl active:bg-emerald-700" onClick={() => start("payment")}>
                רישום תשלום
              </Button>
            </div>
            <ErrorText>{formError}</ErrorText>
          </div>
          <AmountKeypad value={amount} onChange={setAmount} />
        </div>
      </Card>

      {me.role === "owner" && (
        <OwnerTools customer={c} editLimit={editLimit} setEditLimit={setEditLimit} onResetPin={() => setResetOpen("set")} />
      )}
      {me.role !== "owner" && locked && (
        <Button variant="secondary" onClick={() => setResetOpen("manager")}>
          איפוס קוד לקוח (באישור בעלים)
        </Button>
      )}

      <Card className="p-0">
        <h2 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold">היסטוריה</h2>
        {history.length === 0 && <p className="px-4 py-6 text-center text-slate-500">אין עסקאות עדיין</p>}
        <ul className="divide-y divide-slate-100">
          {history.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className={t.status === "cancelled" ? "text-slate-400 line-through" : ""}>
                <span className={`font-semibold ${t.type === "debt" ? "text-rose-600" : "text-emerald-700"} ${t.status === "cancelled" ? "!text-slate-400" : ""}`}>
                  {t.type === "debt" ? "חוב" : "תשלום"} {formatAgorot(t.amount)}
                </span>
                <span className="ms-2 text-sm text-slate-500">
                  {formatDateTime(t.createdAt)} · {t.staffName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {t.confirmedBy === "owner_override" && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">אישור בעלים</span>
                )}
                {t.status === "cancelled" ? (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">בוטל</span>
                ) : (
                  <span className="text-sm text-slate-500 tabular-nums">יתרה: {formatAgorot(t.balanceAfter)}</span>
                )}
                <CancelTx tx={t} customerName={c.name} customerBalance={c.balance} clockSkew={skew} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {pending && agorot && (
        <PinOverlay
          me={me}
          mode="confirm"
          title={pending === "debt" ? "אישור חוב" : "אישור תשלום"}
          customerName={c.name}
          successText={pending === "debt" ? "החוב נרשם" : "התשלום נרשם"}
          summary={{ type: pending, before: c.balance, amount: agorot, after }}
          overrideOnly={overLimit || locked}
          notice={
            overLimit
              ? `חריגה מתקרת האשראי (${formatAgorot(c.creditLimit!)}). נדרש אישור בעלים.`
              : locked
                ? "הקוד של הלקוח נעול זמנית. בעל העסק יכול לאשר."
                : undefined
          }
          onPin={(pin) => api("/api/transactions", { body: { customerId: c.id, type: pending, amount: agorot, pin } })}
          onOverride={(override) =>
            api("/api/transactions", { body: { customerId: c.id, type: pending, amount: agorot, override } })
          }
          onClose={() => setPending(null)}
          onDone={() => {
            qc.invalidateQueries();
            router.push("/");
          }}
        />
      )}

      {resetOpen === "manager" && (
        <PinOverlay
          me={me}
          mode="confirm"
          title="איפוס קוד לקוח"
          customerName={c.name}
          prompt="בעל העסק: הקישו את קוד הבעלים"
          successText=""
          onPin={async (pin) => setManagerPin(pin)}
          onClose={() => setResetOpen(null)}
          onDone={() => setResetOpen("set")}
        />
      )}
      {resetOpen === "set" && (
        <PinOverlay
          me={me}
          mode="set"
          title="איפוס קוד לקוח"
          customerName={c.name}
          successText="הקוד עודכן"
          onPin={(newPin) => api(`/api/customers/${c.id}/reset-pin`, { body: { newPin, managerPin } })}
          onClose={() => {
            setResetOpen(null);
            setManagerPin(undefined);
          }}
          onDone={() => {
            setResetOpen(null);
            setManagerPin(undefined);
            qc.invalidateQueries({ queryKey: ["customer", id] });
          }}
        />
      )}
    </div>
  );
}

function OwnerTools({
  customer: c,
  editLimit,
  setEditLimit,
  onResetPin,
}: {
  customer: Customer;
  editLimit: boolean;
  setEditLimit: (v: boolean) => void;
  onResetPin: () => void;
}) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(c.creditLimit == null ? "" : String(c.creditLimit / 100));
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="flex flex-wrap items-center gap-2">
      <span className="me-auto text-sm font-medium text-slate-500">ניהול לקוח</span>
      {editLimit ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = limit.trim() === "" ? null : parseShekelsToAgorot(limit);
            if (limit.trim() !== "" && v == null) return setErr("סכום לא תקין");
            try {
              await api(`/api/customers/${c.id}`, { method: "PATCH", body: { creditLimit: v } });
              setEditLimit(false);
              setErr(null);
              qc.invalidateQueries({ queryKey: ["customer", c.id] });
            } catch (e2) {
              setErr(errorText(e2));
            }
          }}
        >
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            placeholder="ללא תקרה"
            className="w-32 rounded-lg border border-slate-300 px-3 py-2"
            autoFocus
          />
          <Button className="py-2 text-base">שמירה</Button>
          <Button type="button" variant="secondary" className="py-2 text-base" onClick={() => setEditLimit(false)}>
            ביטול
          </Button>
          {err && <span className="text-sm text-rose-600">{err}</span>}
        </form>
      ) : (
        <Button variant="secondary" className="py-2 text-base" onClick={() => setEditLimit(true)}>
          שינוי תקרת אשראי
        </Button>
      )}
      <Button variant="secondary" className="py-2 text-base" onClick={onResetPin}>
        איפוס קוד לקוח
      </Button>
    </Card>
  );
}
