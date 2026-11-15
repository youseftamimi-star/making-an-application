"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client";
import { Button, Card, ErrorText, Field } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ setUp: boolean }>("/api/setup")
      .then((r) => !r.setUp && router.replace("/setup"))
      .catch(() => {});
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold">פנקס</h1>
        <p className="mb-5 text-slate-500">כניסה לקופה</p>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api("/api/auth/login", { body: { username, password } });
              router.replace("/");
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="שם משתמש" dir="ltr" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          <Field label="סיסמה" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" disabled={busy}>
            {busy ? "נכנס…" : "כניסה"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
