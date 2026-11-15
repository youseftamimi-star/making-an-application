"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type Customer } from "@/lib/client";
import { formatAgorot } from "@/lib/money";
import { useMe } from "@/components/useMe";

export default function RegisterHome() {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 120);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ["customers", dq],
    queryFn: () => api<Customer[]>(`/api/customers?q=${encodeURIComponent(dq)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const first = results.data?.[0];
          if (first && dq === q.trim()) router.push(`/c/${first.id}`);
        }}
      >
        <input
          ref={input}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לקוח: אותיות ראשונות או 4 ספרות אחרונות"
          className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-2xl outline-none focus:border-slate-900"
          enterKeyHint="go"
          autoComplete="off"
        />
      </form>

      <div className="flex gap-2">
        {me.role === "owner" && (
          <Link href="/c/new" className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">
            + לקוח חדש
          </Link>
        )}
        <Link href="/recent" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold">
          עסקאות אחרונות
        </Link>
      </div>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {results.data?.map((c) => (
          <li key={c.id}>
            <Link href={`/c/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-4 active:bg-slate-100 hover:bg-slate-50">
              <span>
                <span className="block text-xl font-semibold">{c.name}</span>
                <span className="text-slate-500" dir="ltr">
                  •••{c.phoneLast4}
                </span>
              </span>
              <span className={`text-xl font-bold tabular-nums ${c.balance > 0 ? "text-rose-600" : "text-slate-400"}`}>
                {formatAgorot(c.balance)}
              </span>
            </Link>
          </li>
        ))}
        {results.data?.length === 0 && (
          <li className="px-5 py-8 text-center text-slate-500">
            {dq ? "לא נמצאו לקוחות" : "עדיין אין לקוחות."}
            {me.role === "owner" && (
              <>
                {" "}
                <Link href="/c/new" className="font-semibold text-slate-900 underline">
                  פתיחת לקוח חדש
                </Link>
              </>
            )}
          </li>
        )}
        {results.isError && <li className="px-5 py-4 text-rose-600">שגיאה בטעינה. בדקו חיבור.</li>}
      </ul>
    </div>
  );
}
