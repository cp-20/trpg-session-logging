/**
 * ブラウザから Discord 連携の API（/api/discord/*）を呼ぶ。Firebase の ID トークンを付ける。
 * サーバーの秘密（ボットのトークンなど）はここに来ない。
 */
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; code?: string };

async function idToken(): Promise<string | null> {
  const { getTakufuAuth } = await import("../auth");
  const user = getTakufuAuth()?.currentUser;
  return user ? user.getIdToken() : null;
}

async function call<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  const token = await idToken();
  if (!token) return { ok: false, status: 401, error: "ログインし直してください。" };
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`/api/discord/${path}`, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true)
      return {
        ok: false,
        status: res.status,
        error: typeof data.error === "string" ? data.error : "Discord 連携に接続できませんでした。",
        ...(typeof data.code === "string" ? { code: data.code } : {}),
      };
    return data as { ok: true } & T;
  } catch {
    return {
      ok: false,
      status: 0,
      error: "通信できませんでした。通信状態を確かめて、もう一度お試しください。",
    };
  }
}

export interface DiscordAccountView {
  username: string;
  globalName: string | null;
}

export interface TableDiscordView {
  linked: boolean;
  isOwner: boolean;
  channelName?: string;
  guildName?: string;
  voiceChannelName?: string;
  installUrl: string;
}

export const discordClient = {
  account: () => call<{ account: DiscordAccountView | null }>("account", "GET"),
  unlinkAccount: () => call<object>("account", "DELETE"),
  /** Discord の認可画面へ移る */
  async startAccountLink(): Promise<ApiResult<object>> {
    const r = await call<{ url: string }>("oauth", "POST");
    if (r.ok) window.location.assign(r.url);
    return r;
  },
  tableStatus: (tableId: string, current?: { memberIds: string[]; tableName: string }) =>
    call<TableDiscordView>("table", "POST", { action: "status", tableId, ...current }),
  previewCode: (code: string) =>
    call<{ channelName: string; guildName?: string; voiceChannelName?: string; expiresAt: number }>(
      "table",
      "POST",
      { action: "preview", code },
    ),
  /** 卓の名前とメンバーは、卓を作った人の画面から送る（サーバーは卓譜の保存データを読まない） */
  linkTable: (code: string, table: { id: string; name: string; memberIds: string[] }) =>
    call<{ channelName: string; guildName: string | null }>("table", "POST", {
      action: "link",
      code,
      tableId: table.id,
      tableName: table.name,
      memberIds: table.memberIds,
    }),
  unlinkTable: (tableId: string) => call<object>("table", "POST", { action: "unlink", tableId }),
  syncPoll: (eventId: string) => call<{ linked: boolean }>("sync-poll", "POST", { eventId }),
  syncEvent: (input: {
    eventId: string;
    tableId: string;
    deleted?: boolean;
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    durationMin?: number;
  }) => call<{ linked: boolean }>("sync-event", "POST", input),
  /** 共有ページの準備（記録の直後は保存の途中）を待って、何度か試す */
  async postSession(
    slug: string,
    tableId: string | undefined,
    wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {
    let last: ApiResult<object> = { ok: false, status: 0, error: "" };
    for (let attempt = 0; attempt < 6; attempt++) {
      last = await call<object>("post-session", "POST", { slug, ...(tableId ? { tableId } : {}) });
      if (last.ok || last.code !== "not_ready") return last;
      await wait(2000);
    }
    return last;
  },
};

/** OAuth から戻ったときの ?discord=… を文に */
export function oauthOutcomeMessage(outcome: string | null): string | null {
  if (outcome === "denied") return "Discord でつなぐのを取りやめました。";
  if (outcome === "expired") return "時間が経ちすぎたため、つなげませんでした。もう一度お試しください。";
  if (outcome === "failed") return "Discord とつなげませんでした。少し待ってから、もう一度お試しください。";
  return null;
}
