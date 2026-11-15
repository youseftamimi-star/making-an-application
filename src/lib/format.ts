const dateTime = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const timeOnly = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });

export function formatDateTime(d: string | Date) {
  return dateTime.format(new Date(d));
}
export function formatTime(d: string | Date) {
  return timeOnly.format(new Date(d));
}

/** Keep digits only, e.g. "050-123 4567" -> "0501234567". */
export function normalizePhone(p: string) {
  return p.replace(/\D/g, "");
}

export const CANCEL_WINDOW_MS = 15 * 60 * 1000;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;
