"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "@/lib/client";
import { formatAgorot } from "@/lib/money";
import { formatTime } from "@/lib/format";
import { CancelTx } from "@/components/CancelTx";
import { Card, ErrorText } from "@/components/ui";

type Row = {
  id: string;
  type: "debt" | "payment";
  amount: number;
  status: "active" | "cancelled";
  confirmedBy: "pin" | "owner_override";
  createdAt: string;
  customerId: string;
  customerName: string;
  customerBalance: number;
  phoneLast4: string;
  staffName: string;
};

export default function RecentPage() {
  const q = useQuery({
    queryKey: ["recent"],
    queryFn: async () => {
      const d = await api<{ rows: Row[]; serverNow: string }>("/api/transactions/recent");
      return { ...d, skew: new Date(d.serverNow).getTime() - Date.now() };
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">עסקאות אחרונות (24 שעות)</h1>
      <p className="text-sm text-slate-500">ביטול עם קוד הלקוח אפשרי עד 15 דקות. אחרי זה רק בעל העסק.</p>
      {q.isError && <ErrorText>{errorText(q.error)}</ErrorText>}
      <Card className="p-0">
        {q.data?.rows.length === 0 && <p className="px-4 py-8 text-center text-slate-500">אין עסקאות ב-24 השעות האחרונות</p>}
        <ul className="divide-y divide-slate-100">
          {q.data?.rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className={t.status === "cancelled" ? "text-slate-400 line-through" : ""}>
                <span className="me-2 tabular-nums text-slate-500">{formatTime(t.createdAt)}</span>
                <Link href={`/c/${t.customerId}`} className="font-semibold hover:underline">
                  {t.customerName}
                </Link>
                <span className={`ms-2 font-semibold ${t.status === "cancelled" ? "" : t.type === "debt" ? "text-rose-600" : "text-emerald-700"}`}>
                  {t.type === "debt" ? "חוב" : "תשלום"} {formatAgorot(t.amount)}
                </span>
                <span className="ms-2 text-sm text-slate-500">· {t.staffName}</span>
              </div>
              <div className="flex items-center gap-2">
                {t.confirmedBy === "owner_override" && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">אישור בעלים</span>
                )}
                {t.status === "cancelled" && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">בוטל</span>}
                <CancelTx tx={t} customerName={t.customerName} customerBalance={t.customerBalance} clockSkew={q.data.skew} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
