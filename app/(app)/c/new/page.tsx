"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Customer } from "@/lib/client";
import { parseShekelsToAgorot } from "@/lib/money";
import { normalizePhone } from "@/lib/format";
import { PinOverlay } from "@/components/PinOverlay";
import { Button, Card, ErrorText, Field } from "@/components/ui";
import { useMe } from "@/components/useMe";

export default function NewCustomerPage() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", phone: "", creditLimit: "" });
  const [error, setError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (me.role !== "owner") return <ErrorText>רק בעל העסק יכול לפתוח לקוח חדש.</ErrorText>;

  const creditLimit = f.creditLimit.trim() === "" ? null : parseShekelsToAgorot(f.creditLimit);

  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">לקוח חדש</h1>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const phone = normalizePhone(f.phone);
          if (phone.length < 9 || phone.length > 13) return setError("מספר טלפון לא תקין.");
          if (f.creditLimit.trim() !== "" && creditLimit == null) return setError("תקרת אשראי לא תקינה.");
          setError(null);
          setPinOpen(true);
        }}
      >
        <Field label="שם מלא" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
        <Field label="טלפון" type="tel" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <Field
          label="תקרת אשראי ב-₪ (לא חובה)"
          inputMode="decimal"
          dir="ltr"
          value={f.creditLimit}
          onChange={(e) => setF({ ...f, creditLimit: e.target.value })}
          hint="השאירו ריק אם אין תקרה"
        />
        <ErrorText>{error}</ErrorText>
        <Button className="w-full">המשך: הלקוח בוחר קוד</Button>
      </form>

      {pinOpen && (
        <PinOverlay
          me={me}
          mode="set"
          title="פתיחת לקוח"
          customerName={f.name}
          successText="הלקוח נפתח"
          onPin={async (pin) => {
            try {
              const c = await api<Customer>("/api/customers", {
                body: { name: f.name, phone: f.phone, creditLimit, pin },
              });
              setCreatedId(c.id);
            } catch (e) {
              // Form errors (e.g. phone exists) belong on the form, not the PIN screen.
              setPinOpen(false);
              setError(errorText(e));
              throw e;
            }
          }}
          onClose={() => setPinOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["customers"] });
            router.replace(createdId ? `/c/${createdId}` : "/");
          }}
        />
      )}
    </Card>
  );
}
