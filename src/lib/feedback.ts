/**
 * ご意見・不具合の報告フォーム。送られた内容は運営者の Discord に Webhook で届ける。
 * 中身はフォームに書かれたものだけ（ログイン情報や記録は付けない）。
 */
import { z } from "zod";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind } from "./feedback-kinds";

export { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind };

export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS.map((k) => k.v) as [FeedbackKind, ...FeedbackKind[]]),
  body: z
    .string()
    .trim()
    .min(1, "内容を書いてください。")
    .max(FEEDBACK_LIMITS.body, `内容は ${FEEDBACK_LIMITS.body} 文字までです。`),
  contact: z
    .string()
    .trim()
    .max(FEEDBACK_LIMITS.contact, `連絡先は ${FEEDBACK_LIMITS.contact} 文字までです。`)
    .optional()
    .default(""),
  /** どの画面から開いたか（/feedback?from=…）。自動で入る */
  page: z.string().trim().max(FEEDBACK_LIMITS.page).optional().default(""),
  /** 人には見えない入力欄。ここが埋まっていたらボットとみなして黙って捨てる */
  website: z.string().optional().default(""),
});
export type FeedbackInput = z.input<typeof feedbackSchema>;
export type Feedback = z.output<typeof feedbackSchema>;

/** Discord のメンション記法（@everyone・<@id> など）が効かないようにする */
export function neutralizeMentions(text: string): string {
  return text.replace(/@(everyone|here)/g, "@​$1").replace(/<@/g, "<​@");
}

/** Discord Webhook に送る本文。メンションはすべて無効にする */
export function discordPayload(f: Feedback, receivedAt: Date) {
  const kind = FEEDBACK_KINDS.find((k) => k.v === f.kind)!;
  const fields = [
    f.contact && { name: "連絡先", value: neutralizeMentions(f.contact), inline: true },
    f.page && { name: "開いていた画面", value: neutralizeMentions(f.page), inline: true },
  ].filter(Boolean) as { name: string; value: string; inline: boolean }[];
  return {
    username: "卓譜 フォーム",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: `【${kind.discord}】`,
        description: neutralizeMentions(f.body),
        color: f.kind === "bug" ? 0xc8102e : f.kind === "rights" ? 0x2b140c : 0xbf3a16,
        fields,
        timestamp: receivedAt.toISOString(),
      },
    ],
  };
}

export type FeedbackResult = { ok: true } | { ok: false; status: number; error: string };

export interface FeedbackDeps {
  webhookUrl: string | undefined;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

/** 送信の受け付け。Webhook の URL は利用者に見せない */
export async function handleFeedback(body: unknown, deps: FeedbackDeps): Promise<FeedbackResult> {
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "入力を確かめてください。" };
  }
  // ボットには成功したふりをして、何も送らない
  if (parsed.data.website) return { ok: true };
  if (!deps.webhookUrl) {
    return {
      ok: false,
      status: 503,
      error: "いまはフォームを受け付けていません。時間をおいて試してください。",
    };
  }
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const res = await fetchFn(deps.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload(parsed.data, (deps.now ?? (() => new Date()))())),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  } catch {
    return { ok: false, status: 502, error: "送れませんでした。時間をおいてもう一度送ってください。" };
  }
  return { ok: true };
}

/** 同じ送り元からの連投を抑える（サーバーのメモリ上。再起動で消えてよい） */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}
