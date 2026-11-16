import type { Provider } from "../types";

/**
 * 外部依存(OAuth・頒布元確認・X投稿)の契約。
 * モック実装と本番実装(Firebase Auth / 実API)をここで差し替える。
 */

/* ---------- OAuth(サインイン) ---------- */

export const SIGNIN_PROVIDERS: Provider[] = ["google", "discord", "x"];

export interface OAuthFlow {
  /** 同意画面の見せ方: モックはアカウント選択モーダル */
  kind: "mock-account-chooser";
  scope: string;
}

export function oauthFlow(provider: Provider): OAuthFlow {
  return {
    kind: "mock-account-chooser",
    scope: provider === "google" ? "openid / email / profile(識別のみ)" : "identify(識別のみ)",
  };
}

/* ---------- 頒布元アカウント確認(BOOTH/TALTO 文面確認) ---------- */

export type VerificationProvider = "booth" | "talto";

export interface VerificationCode {
  code: string;
  /** ISO文字列。モックでは30分 */
  expiresAt: string;
  /** コードを貼る場所の説明 */
  place: string;
}

export interface VerificationResult {
  ok: boolean;
  externalId?: string;
  verifiedAt?: string;
  error?: string;
}

export interface VerificationService {
  createCode(provider: VerificationProvider): Promise<VerificationCode>;
  confirm(provider: VerificationProvider, code: string): Promise<VerificationResult>;
  /** 確認ページの取得先(モックではダミーURL) */
  targetUrl(provider: VerificationProvider): string;
}

export function createMockVerificationService(opts: { latencyMs?: number } = {}): VerificationService {
  const latency = opts.latencyMs ?? 900;
  const issued = new Map<VerificationProvider, VerificationCode>();
  return {
    async createCode(provider) {
      await sleep(latency / 2);
      const code = `TF-${rand(4)}-${rand(4)}`;
      const v: VerificationCode = {
        code,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        place: provider === "booth" ? "ショップの自己紹介欄" : "プロフィールの自己紹介欄",
      };
      issued.set(provider, v);
      return v;
    },
    async confirm(provider, code) {
      await sleep(latency);
      const v = issued.get(provider);
      if (!v || v.code !== code) return { ok: false, error: "確認コードが一致しません" };
      if (Date.now() > new Date(v.expiresAt).getTime()) return { ok: false, error: "確認コードの有効期限が切れています" };
      issued.delete(provider);
      return {
        ok: true,
        externalId: provider === "booth" ? "example-shop" : "12345",
        verifiedAt: new Date().toISOString().slice(0, 10),
      };
    },
    targetUrl(provider) {
      return provider === "booth" ? "https://example.booth.pm" : "https://talto.io/users/12345";
    },
  };
}

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
  const title = esc(d.scenarioTitle ?? d.title);
  const date = esc(d.dateLabel);
  const sys = esc(d.systemName);
  const end = d.endLabel ? esc(d.endLabel) : null;
  const meta = `${esc(String(d.playerCount))}人でプレイ`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="335" viewBox="0 0 600 335">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e1a2e"/>
      <stop offset="1" stop-color="#3a2f57"/>
    </linearGradient>
  </defs>
  <rect width="600" height="335" rx="24" fill="url(#bg)"/>
  <text x="300" y="64" text-anchor="middle" font-family="sans-serif" font-size="13" letter-spacing="5" fill="#ffffff" opacity="0.7">TRPG SESSION REPORT</text>
  <text x="300" y="118" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="26" fill="#ffffff">${title}</text>
  <text x="300" y="158" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#ffffff" opacity="0.8">${date} · ${sys}</text>
  <text x="300" y="184" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#ffffff" opacity="0.8">${meta}</text>
  ${end ? `<rect x="210" y="212" width="180" height="34" rx="17" fill="none" stroke="#ffffff" stroke-opacity="0.45"/><text x="300" y="235" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#ffffff">${end}</text>` : ""}
  <text x="300" y="300" text-anchor="middle" font-family="sans-serif" font-size="12" letter-spacing="3" fill="#ffffff" opacity="0.5">🎼 卓譜 — takufu.app</text>
</svg>`;
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

export function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- utils ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (n: number) =>
  Array.from({ length: n }, () => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 36)]).join("");
