/**
 * "מד מצב רוח" של החוב: פרצוף ותואר מצחיק לפי יתרת החוב של הלקוח.
 * תצוגה בלבד — לא משנה שום חוק עסקי. היתרה באגורות (כמו בכל המערכת).
 */

export type DebtLevel = {
  /** 0 = אין חוב, 4 = הכי גבוה */
  rank: 0 | 1 | 2 | 3 | 4;
  emoji: string;
  title: string;
};

/** ספי הדרגות באגורות: עד 100 ₪, עד 500 ₪, עד 1,000 ₪, ומעל. */
export const DEBT_LEVEL_LIMITS = { small: 100_00, medium: 500_00, large: 1000_00 } as const;

const LEVELS: readonly DebtLevel[] = [
  { rank: 0, emoji: "😇", title: "מלאך, לא חייב כלום" },
  { rank: 1, emoji: "🙂", title: "לקוח מכובד" },
  { rank: 2, emoji: "😅", title: "מתחיל להזיע" },
  { rank: 3, emoji: "😬", title: "חבר ותיק של ההקפה" },
  { rank: 4, emoji: "🫠", title: "שותף בעסק" },
];

export function debtLevel(balanceAgorot: number): DebtLevel {
  if (balanceAgorot <= 0) return LEVELS[0];
  if (balanceAgorot <= DEBT_LEVEL_LIMITS.small) return LEVELS[1];
  if (balanceAgorot <= DEBT_LEVEL_LIMITS.medium) return LEVELS[2];
  if (balanceAgorot <= DEBT_LEVEL_LIMITS.large) return LEVELS[3];
  return LEVELS[4];
}

/** בדיחה קטנה כשלקוח בדרגה הכי גבוהה לוקח עוד חוב. */
export function partnerJoke(balanceAgorot: number): string | undefined {
  return debtLevel(balanceAgorot).rank === 4 ? "בטוח? הוא כבר שותף בעסק 😂" : undefined;
}
