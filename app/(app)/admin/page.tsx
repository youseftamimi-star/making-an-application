"use client";
import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/client";
import { formatAgorot } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { Button, Card, ErrorText, Field } from "@/components/ui";
import { useMe } from "@/components/useMe";

type Tab = "audit" | "staff" | "premium";

export default function AdminPage() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("audit");
  if (me.role !== "owner") return <ErrorText>אין לך הרשאה לעמוד זה.</ErrorText>;
  const tabs: [Tab, string][] = [
    ["audit", "יומן פעולות"],
    ["staff", "עובדים"],
    ["premium", "תזכורות SMS"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-3 py-2 font-medium ${tab === k ? "bg-white shadow-sm" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "audit" && <AuditLog />}
      {tab === "staff" && <Staff />}
      {tab === "premium" && <Premium />}
    </div>
  );
}

// ---------------------------------------------------------------------------

type AuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  staffName: string | null;
  customerId: string | null;
  customerName: string | null;
};

const ACTIONS: Record<string, string> = {
  tx_created: "עסקה אושרה בקוד",
  tx_override: "עסקה באישור בעלים",
  tx_cancelled: "ביטול עסקה בקוד",
  tx_cancel_override: "ביטול באישור בעלים",
  customer_created: "פתיחת לקוח",
  customer_updated: "עדכון לקוח",
  pin_reset: "איפוס קוד לקוח",
  pin_failed: "קוד שגוי",
  pin_locked: "קוד ננעל",
  staff_created: "הוספת עובד",
  staff_deactivated: "השבתת עובד",
  store_setup: "הקמת המערכת",
};
const WARN = new Set(["tx_override", "tx_cancel_override", "pin_reset", "pin_locked", "pin_failed"]);

function describe(r: AuditRow) {
  const d = r.details ?? {};
  if (typeof d.amount === "number") {
    const kind = d.type === "debt" ? "חוב" : "תשלום";
    return `${kind} ${formatAgorot(d.amount)} · יתרה ${formatAgorot(Number(d.balanceBefore))} ← ${formatAgorot(Number(d.balanceAfter))}`;
  }
  if (r.action === "pin_failed") return `ניסיון ${d.attempt}`;
  if (r.action === "staff_created") return `${d.username} (${d.role === "owner" ? "בעלים" : "עובד"})`;
  return "";
}

function AuditLog() {
  const [action, setAction] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["audit", action],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<AuditRow[]>(`/api/audit?${new URLSearchParams({ ...(action && { action }), ...(pageParam && { before: pageParam }) })}`),
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1].createdAt : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">יומן פעולות</h2>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
          <option value="">כל הפעולות</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {q.isError && <ErrorText>{errorText(q.error)}</ErrorText>}
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="w-32 shrink-0 text-sm tabular-nums text-slate-500">{formatDateTime(r.createdAt)}</span>
            <span className={`font-medium ${WARN.has(r.action) ? "text-amber-700" : ""}`}>{ACTIONS[r.action] ?? r.action}</span>
            {r.customerName && (
              <Link href={`/c/${r.customerId}`} className="hover:underline">
                {r.customerName}
              </Link>
            )}
            <span className="text-sm text-slate-600">{describe(r)}</span>
            <span className="ms-auto text-sm text-slate-500">{r.staffName}</span>
          </li>
        ))}
        {!q.isPending && rows.length === 0 && <li className="px-4 py-6 text-center text-slate-500">אין רשומות</li>}
      </ul>
      {q.hasNextPage && (
        <div className="p-3 text-center">
          <Button variant="secondary" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            עוד
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

type StaffRow = { id: string; name: string; username: string; role: "owner" | "employee"; active: boolean };

function Staff() {
  const me = useMe();
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => api<StaffRow[]>("/api/staff") });
  const empty = { name: "", username: "", password: "", role: "employee" as "owner" | "employee", managerPin: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <ul className="divide-y divide-slate-100">
          {staff.data?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <span className={s.active ? "" : "text-slate-400 line-through"}>
                <span className="font-semibold">{s.name}</span>{" "}
                <span className="text-sm text-slate-500" dir="ltr">
                  @{s.username}
                </span>{" "}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">{s.role === "owner" ? "בעלים" : "עובד"}</span>
              </span>
              {s.id !== me.staffId && (
                <Button
                  variant="secondary"
                  className="py-1.5 text-sm"
                  onClick={async () => {
                    await api(`/api/staff/${s.id}`, { method: "PATCH", body: { active: !s.active } });
                    qc.invalidateQueries({ queryKey: ["staff"] });
                  }}
                >
                  {s.active ? "השבתה" : "הפעלה"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">הוספת עובד</h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (f.role === "owner" && !/^\d{4}$/.test(f.managerPin)) return setErr("לבעלים נדרש קוד בעלים בן 4 ספרות.");
            setBusy(true);
            setErr(null);
            try {
              await api("/api/staff", {
                body: { ...f, managerPin: f.role === "owner" ? f.managerPin : undefined },
              });
              setF(empty);
              qc.invalidateQueries({ queryKey: ["staff"] });
            } catch (e2) {
              setErr(errorText(e2));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="שם" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <Field label="שם משתמש (באנגלית)" dir="ltr" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required minLength={3} pattern="[a-zA-Z0-9._\-]+" />
          <Field label="סיסמה" type="password" dir="ltr" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">תפקיד</span>
            <select
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value as "owner" | "employee" })}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg"
            >
              <option value="employee">עובד</option>
              <option value="owner">בעלים</option>
            </select>
          </label>
          {f.role === "owner" && (
            <Field label="קוד בעלים (4 ספרות)" inputMode="numeric" dir="ltr" maxLength={4} value={f.managerPin} onChange={(e) => setF({ ...f, managerPin: e.target.value })} required />
          )}
          <div className="sm:col-span-2">
            <ErrorText>{err}</ErrorText>
          </div>
          <Button className="sm:col-span-2" disabled={busy}>
            הוספה
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Premium() {
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">תזכורות SMS ותשלום מרחוק</h2>
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Premium · בקרוב</span>
      </div>
      <p className="text-slate-600">
        שליחה אוטומטית של תזכורת SMS (למשל ב-10 לכל חודש) ללקוחות עם יתרת חוב, עם קישור לתשלום מרחוק שמעדכן את היתרה
        באפליקציה אוטומטית.
      </p>
      <Button disabled>הפעלה</Button>
    </Card>
  );
}
