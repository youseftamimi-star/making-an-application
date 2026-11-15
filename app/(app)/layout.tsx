"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type Me } from "@/lib/client";
import { MeContext } from "@/components/useMe";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me"), staleTime: 60_000 });

  if (me.isPending) return <div className="p-8 text-center text-slate-500">טוען…</div>;
  if (me.isError || !me.data) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-slate-600">אין חיבור לשרת.</p>
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-white" onClick={() => me.refetch()}>
          נסו שוב
        </button>
      </div>
    );
  }
  const u = me.data;
  const nav = [
    { href: "/", label: "קופה" },
    { href: "/recent", label: "עסקאות אחרונות" },
    ...(u.role === "owner" ? [{ href: "/admin", label: "ניהול" }] : []),
  ];

  return (
    <MeContext.Provider value={u}>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2">
          <span className="ms-0 me-3 font-bold">{u.storeName}</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {nav.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <span className="hidden text-sm text-slate-500 sm:inline">
            {u.name} · {u.role === "owner" ? "בעלים" : "עובד"}
          </span>
          <button
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              router.replace("/login");
            }}
          >
            יציאה
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-4">{children}</main>
    </MeContext.Provider>
  );
}
