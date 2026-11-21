/** ご意見フォームの種類と上限。画面（Landing.tsx）からはこちらを読む（検証の zod をブラウザに載せないため） */
export const FEEDBACK_KINDS = [
  { v: "bug", label: "不具合", discord: "不具合" },
  { v: "idea", label: "要望", discord: "要望" },
  { v: "rights", label: "削除・権利", discord: "削除・権利" },
  { v: "other", label: "その他", discord: "その他" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["v"];

export const FEEDBACK_LIMITS = { body: 2000, contact: 200, page: 300 } as const;
