/* ---------- X 卓報告カード ---------- */

export interface ReportCardData {
  scenarioTitle?: string;
  scenarioEmoji?: string;
  title: string;
  dateLabel: string;
  systemName: string;
  playerCount: number;
  endLabel?: string;
  shareUrl: string;
}

export function buildReportCardSVG(d: ReportCardData): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const clip = (s: string, count: number) => Array.from(s).length > count ? Array.from(s).slice(0, count - 1).join("") + "…" : s;
  const title = Array.from(clip(d.scenarioTitle ?? d.title, 38));
  const lines = [title.slice(0, 19).join(""), title.slice(19).join("")].filter(Boolean);
  let host = "卓譜";
  try { host = new URL(d.shareUrl).hostname; } catch { /* Use the product name for a malformed URL. */ }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="670" viewBox="0 0 600 335">
  <rect width="600" height="335" rx="12" fill="#f8fafc"/>
  <text x="32" y="42" font-family="sans-serif" font-weight="700" font-size="18" fill="#0e7490">卓譜</text>
  <text x="568" y="40" text-anchor="end" font-family="sans-serif" font-size="12" fill="#475569">#卓報告</text>
  <path d="M32 60H568" stroke="#cbd5e1"/>
  ${lines.map((line, i) => `<text x="32" y="${112 + i * 37}" font-family="sans-serif" font-weight="700" font-size="26" fill="#0f172a">${esc(line)}</text>`).join("")}
  <text x="32" y="194" font-family="sans-serif" font-size="14" fill="#475569">${esc(clip(d.dateLabel, 35))}</text>
  <text x="32" y="220" font-family="sans-serif" font-size="14" fill="#475569">${esc(clip(d.systemName, 30))} / ${d.playerCount}人でプレイ</text>
  ${d.endLabel ? `<text x="32" y="262" font-family="sans-serif" font-weight="700" font-size="16" fill="#0e7490">${esc(clip(d.endLabel, 32))}</text>` : ""}
  <text x="568" y="309" text-anchor="end" font-family="sans-serif" font-size="11" fill="#475569">${esc(host)}</text>
</svg>`;
}

export async function downloadReportPNG(svg: string, filename: string): Promise<void> {
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("画像を作成できませんでした。")); img.src = source; });
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 670;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を保存できませんでした。");
    context.drawImage(img, 0, 0, 1200, 670);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像を保存できませんでした。")), "image/png"));
    const url = URL.createObjectURL(png);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally { URL.revokeObjectURL(source); }
}

export function reportTweetText(d: ReportCardData): string {
  const label = d.scenarioTitle ?? d.title;
  return `「${label}」を${d.playerCount}人でプレイしました${d.endLabel ? `(${d.endLabel})` : ""} #卓報告`;
}

export function xIntentUrl(d: ReportCardData): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(reportTweetText(d))}&url=${encodeURIComponent(d.shareUrl)}`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
