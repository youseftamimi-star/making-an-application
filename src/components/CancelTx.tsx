"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { CANCEL_WINDOW_MS } from "@/lib/format";
import { PinOverlay } from "./PinOverlay";
import { useMe } from "./useMe";

export type CancelableTx = {
  id: string;
  type: "debt" | "payment";
  amount: number;
  status: "active" | "cancelled";
  createdAt: string;
};

/**
 * Cancel button for one transaction. Within 15 minutes: the customer's PIN (anyone).
 * After that: owner only (override). `clockSkew` = serverNow - Date.now() at fetch time.
 */
export function CancelTx({
  tx,
  customerName,
  customerBalance,
  clockSkew,
}: {
  tx: CancelableTx;
  customerName: string;
  customerBalance: number;
  clockSkew: number;
}) {
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  if (tx.status === "cancelled") return null;

  const age = Date.now() + clockSkew - new Date(tx.createdAt).getTime();
  const inWindow = age <= CANCEL_WINDOW_MS;
  if (!inWindow && me.role !== "owner") return null;

  const minutesLeft = Math.max(0, Math.ceil((CANCEL_WINDOW_MS - age) / 60000));
  const after = tx.type === "debt" ? customerBalance - tx.amount : customerBalance + tx.amount;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 active:bg-rose-50"
      >
        {inWindow ? `ביטול (${minutesLeft} ד׳)` : "ביטול בעלים"}
      </button>
      {open && (
        <PinOverlay
          me={me}
          mode="confirm"
          title="ביטול עסקה"
          customerName={customerName}
          successText="העסקה בוטלה"
          summary={{
            // Cancelling a debt lowers the balance, so show it as a payment-like change and vice versa.
            type: tx.type === "debt" ? "payment" : "debt",
            label: tx.type === "debt" ? "ביטול חוב" : "ביטול תשלום",
            before: customerBalance,
            amount: tx.amount,
            after,
          }}
          overrideOnly={!inWindow}
          onPin={(pin) => api(`/api/transactions/${tx.id}/cancel`, { body: { pin } })}
          onOverride={(override) => api(`/api/transactions/${tx.id}/cancel`, { body: { override } })}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            qc.invalidateQueries();
          }}
        />
      )}
    </>
  );
}
