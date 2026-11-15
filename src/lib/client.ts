"use client";
import { formatTime } from "./format";
import { formatAgorot } from "./money";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public extra: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, ...extra } = data ?? {};
    if (res.status === 401 && error === "UNAUTHORIZED" && !location.pathname.startsWith("/login")) {
      location.href = "/login";
    }
    throw new ApiError(error ?? "NETWORK", res.status, extra);
  }
  return data as T;
}

/** Hebrew message for an API error. */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  const x = e.extra;
  switch (e.code) {
    case "WRONG_PIN":
      return `קוד שגוי. נותרו ${x.remaining} ניסיונות`;
    case "PIN_LOCKED":
      return `הקוד ננעל עד ${formatTime(String(x.until))}. בעל העסק יכול לאשר או לאפס קוד.`;
    case "CREDIT_LIMIT_EXCEEDED":
      return `חריגה מתקרת האשראי (${formatAgorot(Number(x.creditLimit))}). נדרש אישור בעלים.`;
    case "PAYMENT_EXCEEDS_BALANCE":
      return `התשלום גבוה מיתרת החוב (${formatAgorot(Number(x.balance))}).`;
    case "OVERRIDE_REQUIRED":
      return x.reason === "window_passed" ? "עברו 15 דקות. רק בעל העסק יכול לבטל." : "נדרש אישור בעלים.";
    case "FORBIDDEN":
      return x.reason === "bad_manager_pin" ? "קוד בעלים שגוי." : "אין לך הרשאה לפעולה זו.";
    case "ALREADY_CANCELLED":
      return "העסקה כבר בוטלה.";
    case "PHONE_EXISTS":
      return "כבר קיים לקוח עם מספר הטלפון הזה.";
    case "USERNAME_EXISTS":
      return "שם המשתמש תפוס.";
    case "BAD_CREDENTIALS":
      return "שם משתמש או סיסמה שגויים.";
    case "RATE_LIMITED":
      return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
    case "NOT_FOUND":
      return "לא נמצא.";
    case "VALIDATION":
      return "יש לבדוק את הפרטים שהוזנו.";
    case "ALREADY_SET_UP":
      return "המערכת כבר הוגדרה. היכנסו עם המשתמש הקיים.";
    default:
      return "אירעה שגיאה. נסו שוב.";
  }
}

export type Me = {
  staffId: string;
  storeId: string;
  role: "owner" | "employee";
  name: string;
  username: string;
  storeName: string;
  hasManagerPin: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  phoneLast4: string;
  creditLimit: number | null;
  balance: number;
  pinLockedUntil: string | null;
  createdAt: string;
};
