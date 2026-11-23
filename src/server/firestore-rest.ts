/**
 * Firestore の公開 REST API（サーバーは利用者の認証情報を持たない）。読めるかどうかは firestore.rules が決める。
 * シナリオの共有シナリオ一覧（scenario-directory.ts）と、共有ページの OG 画像（shared-pages.ts）が使う。
 */

export type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};
export type RestDoc = { name: string; fields?: Record<string, RestValue> };

/** REST の値を素の値に */
export function fromRest(v: RestValue): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(fromRest);
  if (v.mapValue) return fromRestFields(v.mapValue.fields ?? {});
  return null;
}
export const fromRestFields = (fields: Record<string, RestValue>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromRest(v)]));

/** 欄の道筋。名前に記号や日本語を含む欄（切れ端）は ` で囲む */
export function fieldPath(...segments: string[]): string {
  return segments
    .map((s) =>
      /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) ? s : `\`${s.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``,
    )
    .join(".");
}

export interface RestConfig {
  /** projects/<id>/databases/<db>/documents */
  documents: string;
  /** https://firestore.googleapis.com/v1 か エミュレーター */
  host: string;
  key?: string;
}

/** Firestore の設定（なければ null） */
export function restConfig(env: NodeJS.ProcessEnv = process.env): RestConfig | null {
  const project = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project) return null;
  const database = env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "takufu";
  const host =
    env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true"
      ? `http://127.0.0.1:${env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080}/v1`
      : "https://firestore.googleapis.com/v1";
  return {
    documents: `projects/${project}/databases/${database}/documents`,
    host,
    key: env.NEXT_PUBLIC_FIREBASE_API_KEY || undefined,
  };
}

function restUrl(c: RestConfig, rest: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...params, ...(c.key ? { key: c.key } : {}) }).toString();
  return `${c.host}/${c.documents}${rest}${q ? `?${q}` : ""}`;
}

export async function restPost<T>(c: RestConfig, action: string, body: unknown): Promise<T> {
  const res = await fetch(restUrl(c, action), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`firestore ${action}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** 文書 1 件。無い・読めないときは null */
export async function restGet(c: RestConfig, path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(restUrl(c, `/${path}`), { cache: "no-store" });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`firestore get: ${res.status}`);
  return fromRestFields(((await res.json()) as RestDoc).fields ?? {});
}

/** コレクションの文書を ID つきで（読めないときは例外） */
export async function restList(
  c: RestConfig,
  path: string,
  pageSize = 300,
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const res = await fetch(restUrl(c, `/${path}`, { pageSize: String(pageSize) }), { cache: "no-store" });
  if (!res.ok) throw new Error(`firestore list: ${res.status}`);
  const body = (await res.json()) as { documents?: RestDoc[] };
  return (body.documents ?? []).map((d) => ({
    id: d.name.split("/").pop()!,
    data: fromRestFields(d.fields ?? {}),
  }));
}

export const restEq = (path: string, value: RestValue) => ({
  fieldFilter: { field: { fieldPath: path }, op: "EQUAL", value },
});
export const restAnd = (filters: object[]) =>
  filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
