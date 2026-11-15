"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client";
import { Button, Card, ErrorText, Field } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const [f, setF] = useState({ storeName: "", ownerName: "", username: "", password: "", managerPin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-bold">הקמת המכולת</h1>
        <p className="mb-5 text-slate-500">פעם אחת בלבד: פרטי העסק ומשתמש הבעלים.</p>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^\d{4}$/.test(f.managerPin)) return setError("קוד הבעלים חייב להיות 4 ספרות.");
            setBusy(true);
            setError(null);
            try {
              await api("/api/setup", { body: f });
              router.replace("/");
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="שם המכולת" value={f.storeName} onChange={set("storeName")} required autoFocus />
          <Field label="השם שלך" value={f.ownerName} onChange={set("ownerName")} required />
          <Field label="שם משתמש (באנגלית)" dir="ltr" autoCapitalize="none" value={f.username} onChange={set("username")} required minLength={3} pattern="[a-zA-Z0-9._\-]+" />
          <Field label="סיסמה" type="password" dir="ltr" autoComplete="new-password" value={f.password} onChange={set("password")} required minLength={8} hint="לפחות 8 תווים" />
          <Field label="קוד בעלים (4 ספרות)" inputMode="numeric" dir="ltr" maxLength={4} value={f.managerPin} onChange={set("managerPin")} required hint="מקלידים אותו על מכשיר של עובד כדי לאשר חריגה, ביטול מאוחר או איפוס קוד לקוח." />
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" disabled={busy}>
            {busy ? "יוצר…" : "יצירה וכניסה"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
