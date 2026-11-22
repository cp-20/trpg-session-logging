import { BRAND_COLORS, markContent } from "../components/brand";

/* ---------- X 卓報告カード ---------- */

export interface ReportCardData {
  scenarioTitle?: string;
  scenarioEmoji?: string;
  title: string;
  dateLabel: string;
  systemName: string;
  playerCount: number;
  shareUrl: string;
}

export function buildReportCardSVG(d: ReportCardData): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const clip = (s: string, count: number) =>
    Array.from(s).length > count
      ? Array.from(s)
          .slice(0, count - 1)
          .join("") + "…"
      : s;
  const mainTitle = Array.from(clip(d.scenarioTitle ?? d.title, 36));
  const lines = [mainTitle.slice(0, 18).join(""), mainTitle.slice(18).join("")].filter(Boolean);
  const subTitle = d.scenarioTitle && d.title && d.title !== d.scenarioTitle ? clip(d.title, 36) : "";
  let host = "卓譜";
  try {
    host = new URL(d.shareUrl).hostname;
  } catch {
    /* Use the product name for a malformed URL. */
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="670" viewBox="0 0 600 335">
  <rect width="600" height="335" fill="#f2ebe0"/>
  <rect x="18" y="18" width="564" height="299" rx="14" fill="#fffdf9" stroke="#e2d7c5" stroke-width="1.5"/>
  <rect x="18" y="18" width="564" height="5" rx="2.5" fill="${BRAND_COLORS.tile}"/>
  <g transform="translate(40 37) scale(0.75)"><rect width="32" height="32" rx="7" fill="${BRAND_COLORS.tile}"/>${markContent(BRAND_COLORS.paper)}</g>
  <text x="66" y="55" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700" font-size="16" fill="${BRAND_COLORS.tile}">卓譜</text>
  <text x="560" y="54" text-anchor="end" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="600" font-size="12" fill="#68594c">#卓報告</text>
  <line x1="40" y1="72" x2="560" y2="72" stroke="#e2d7c5" stroke-width="1"/>
  <text x="40" y="102" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700" font-size="12" fill="${BRAND_COLORS.tile}">${esc(clip(d.systemName, 40))}</text>
  ${lines.map((line, i) => `<text x="40" y="${138 + i * 36}" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="700" font-size="25" fill="#221c17">${esc(line)}</text>`).join("")}
  ${subTitle ? `<text x="40" y="${lines.length > 1 ? 204 : 172}" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="500" font-size="13" fill="#68594c">${esc(subTitle)}</text>` : ""}
  <text x="40" y="242" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="500" font-size="13" fill="#221c17">${esc(clip(d.dateLabel, 34))}  ·  ${d.playerCount}人でプレイ</text>
  <line x1="40" y1="264" x2="560" y2="264" stroke="#e2d7c5" stroke-width="1"/>
  <text x="560" y="292" text-anchor="end" font-family="'Noto Sans JP', 'Hiragino Sans', sans-serif" font-weight="500" font-size="12" fill="#68594c">${esc(host)}</text>
</svg>`;
}

export async function downloadReportPNG(svg: string, filename: string): Promise<void> {
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("画像を作成できませんでした。"));
      img.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 670;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を保存できませんでした。");
    context.drawImage(img, 0, 0, 1200, 670);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("画像を保存できませんでした。"))),
        "image/png",
      ),
    );
    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function reportTweetText(d: ReportCardData): string {
  const label = d.scenarioTitle ?? d.title;
  return `「${label}」を${d.playerCount}人でプレイしました #卓報告`;
}

export function xIntentUrl(d: ReportCardData): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(reportTweetText(d))}&url=${encodeURIComponent(d.shareUrl)}`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
