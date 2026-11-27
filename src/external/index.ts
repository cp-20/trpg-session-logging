/* ---------- X の #卓報告 の投稿文（画像は src/lib/report-card.ts とサーバーの描画） ---------- */

export interface ReportTweet {
  /** セッションの呼び名（= シナリオの題名） */
  title: string;
  playerCount: number;
  shareUrl: string;
}

export function reportTweetText(d: ReportTweet): string {
  return d.playerCount > 0
    ? `「${d.title}」を${d.playerCount}人で遊びました #卓報告`
    : `「${d.title}」を遊びました #卓報告`;
}

export function xIntentUrl(d: ReportTweet): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(reportTweetText(d))}&url=${encodeURIComponent(d.shareUrl)}`;
}
