import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";

// All money columns are integers in agorot (1 ₪ = 100 agorot) to avoid float errors.

export const roleEnum = pgEnum("staff_role", ["owner", "employee"]);
export const txTypeEnum = pgEnum("tx_type", ["debt", "payment"]);
export const txStatusEnum = pgEnum("tx_status", ["active", "cancelled"]);
export const confirmMethodEnum = pgEnum("confirm_method", ["pin", "owner_override"]);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    // Owner-only 4-6 digit code, typed on an employee's device to approve an override.
    managerPinHash: text("manager_pin_hash"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_username_uq").on(sql`lower(${t.username})`)],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  staffUserId: uuid("staff_user_id")
    .notNull()
    .references(() => staffUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    pinHash: text("pin_hash").notNull(),
    creditLimit: integer("credit_limit"), // agorot, null = no limit
    balance: integer("balance").notNull().default(0), // agorot, cached sum of active transactions
    failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_store_phone_uq").on(t.storeId, t.phone), // BR-05
    index("customers_store_name_idx").on(t.storeId, t.name),
    index("customers_store_last4_idx").on(t.storeId, t.phoneLast4),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    type: txTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    status: txStatusEnum("status").notNull().default("active"),
    confirmedBy: confirmMethodEnum("confirmed_by").notNull(),
    createdByStaffId: uuid("created_by_staff_id")
      .notNull()
      .references(() => staffUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByStaffId: uuid("cancelled_by_staff_id").references(() => staffUsers.id),
    cancelMethod: confirmMethodEnum("cancel_method"),
  },
  (t) => [
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    index("transactions_store_created_idx").on(t.storeId, t.createdAt.desc()),
    index("transactions_customer_created_idx").on(t.customerId, t.createdAt.desc()),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id),
    action: text("action").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_store_created_idx").on(t.storeId, t.createdAt.desc())],
);

export type Store = typeof stores.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
