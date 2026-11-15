import type { DB } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditAction =
  | "store_setup"
  | "staff_created"
  | "staff_deactivated"
  | "customer_created"
  | "customer_updated"
  | "tx_created"
  | "tx_override"
  | "tx_cancelled"
  | "tx_cancel_override"
  | "pin_reset"
  | "pin_failed"
  | "pin_locked";

export async function audit(
  db: Pick<DB, "insert">,
  e: {
    storeId: string;
    staffUserId: string | null;
    action: AuditAction;
    customerId?: string | null;
    transactionId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await db.insert(auditLog).values({
    storeId: e.storeId,
    staffUserId: e.staffUserId,
    action: e.action,
    customerId: e.customerId ?? null,
    transactionId: e.transactionId ?? null,
    details: e.details ?? null,
  });
}
