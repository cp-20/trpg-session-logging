/**
 * Discord 連携の設定。すべてサーバー側の環境変数（NEXT_PUBLIC_* にしない。docs/DEPLOYMENT.md「Discord」）。
 */

export interface DiscordConfig {
  applicationId: string;
  publicKey: string;
  botToken: string;
  clientSecret: string;
  /** 卓譜の公開 URL（Discord に載せるリンクと OAuth の戻り先の基点） */
  publicUrl: string;
}

export const DEFAULT_PUBLIC_URL = "https://takufu.lolipop-now.app";

export function discordConfig(env: Record<string, string | undefined> = process.env): DiscordConfig {
  return {
    applicationId: env.DISCORD_APPLICATION_ID?.trim() ?? "",
    publicKey: env.DISCORD_PUBLIC_KEY?.trim() ?? "",
    botToken: env.DISCORD_BOT_TOKEN?.trim() ?? "",
    clientSecret: env.DISCORD_CLIENT_SECRET?.trim() ?? "",
    publicUrl: (env.TAKUFU_PUBLIC_URL?.trim() || DEFAULT_PUBLIC_URL).replace(/\/+$/, ""),
  };
}

/** ボットを入れるときに求める権限: チャンネルを見る・送る・埋め込み・イベントを作る・ボイスに接続（ボイスの予定用） */
export const BOT_PERMISSIONS = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  CONNECT: 1n << 20n,
  CREATE_EVENTS: 1n << 44n,
} as const;

/** `/卓譜 つなぐ` を使える人の権限（チャンネルの管理） */
export const MANAGE_CHANNELS = 1n << 4n;

export function botPermissionBits(): bigint {
  return Object.values(BOT_PERMISSIONS).reduce((a, b) => a | b, 0n);
}

/** 投稿に要る権限（予定のイベントは別に扱う） */
export const POST_PERMISSIONS =
  BOT_PERMISSIONS.VIEW_CHANNEL | BOT_PERMISSIONS.SEND_MESSAGES | BOT_PERMISSIONS.EMBED_LINKS;

export function hasPermissions(granted: string | undefined, needed: bigint): boolean {
  if (!granted || !/^\d+$/.test(granted)) return false;
  return (BigInt(granted) & needed) === needed;
}

export function botInstallUrl(applicationId: string): string {
  const params = new URLSearchParams({
    client_id: applicationId,
    scope: "bot applications.commands",
    permissions: botPermissionBits().toString(),
    integration_type: "0",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}
