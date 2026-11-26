/**
 * まだ公開しない機能の出し入れ。NEXT_PUBLIC_FEATURE_* は `next build` のときに埋め込まれるので、
 * 値を変えたらビルドし直す（Deploy Now では node scripts/ops.ts deploy --setup で環境変数に送る）。
 * 読むたびに環境変数を見る（テストで vi.stubEnv が効くように）。
 */
export const features = {
  /**
   * Google カレンダーの空き時間の照らし合わせ。calendar.freebusy などの許可は Google の OAuth 審査が要り、
   * 通るまでは「未確認のアプリ」の警告と 100 人の上限がつくので、審査が通るまで切っておく。
   * 切っている間は、設定の欄も、取り込み済みの時間帯との照らし合わせも出さない。
   */
  get googleCalendar(): boolean {
    return process.env.NEXT_PUBLIC_FEATURE_GOOGLE_CALENDAR === "true";
  },
};
