/**
 * 共有ページ（/share/l/{slug}・/share/c/{id}）の中身を、サーバーが誰でもない立場で読む。OG 画像と題名に使う。
 * 公開 REST API を鍵なしで読むので、読めるのは firestore.rules が誰にでも見せてよいとした分だけ
 * （記録は scope が public のもの、キャラクターは共有中のもの）。参加者だけの記録は題名も読めない。
 */
import { cache } from "react";
import type { SharedCharacterData, SharedLogData } from "../lib/cloud-state";
import { upgradeSharedScenario } from "../lib/session-scenario";
import { upgradeLogSchedule } from "../lib/sittings";
import {
  restConfig,
  restEq,
  restAnd,
  restGet,
  restList,
  restPost,
  fromRestFields,
  type RestConfig,
  type RestDoc,
} from "./firestore-rest";

export type SharedPage<T> =
  | { status: "public"; data: T }
  /** あるが、参加者・合言葉を通った人だけが読める */
  | { status: "limited" }
  | { status: "missing" };

/** 文書 ID として読めるもの（区切りの / や . だけのものは除く） */
const KEY_RE = /^(?!\.\.?$)[^/]{1,200}$/;

async function readChunks(c: RestConfig, parent: string, revision: string, count: unknown): Promise<unknown> {
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 200) return null;
  // 見出しが言う数だけを読む（持ち主が余分な切れ端を足しても、読む量は増えない）
  const rows = await restList(c, `${parent}/revisions/${revision}/chunks`, count);
  const pieces = new Map(rows.map((r) => [r.id, r.data.data]));
  const chunks = Array.from({ length: count }, (_, i) => pieces.get(String(i).padStart(4, "0")));
  if (chunks.some((x) => typeof x !== "string")) return null;
  return JSON.parse(chunks.join(""));
}

async function loadLog(c: RestConfig, slug: string): Promise<SharedPage<SharedLogData>> {
  const manifest = await restGet(c, `sharedLogs/${slug}`);
  if (!manifest || manifest.revision === "revoked" || typeof manifest.revision !== "string")
    return { status: "missing" };
  if (manifest.scope !== "public") return { status: "limited" };
  const payload = (await readChunks(
    c,
    `sharedLogs/${slug}`,
    manifest.revision,
    manifest.chunkCount,
  )) as SharedLogData | null;
  if (!payload?.log) return { status: "missing" };
  upgradeLogSchedule(payload.log as unknown as Record<string, unknown>);
  upgradeSharedScenario(payload);
  // 名前を出してよいと本人が決めた参加者だけ（共有ページと同じ条件）
  const rows = await restPost<{ document?: RestDoc }[]>(c, `/sharedLogs/${slug}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: "members" }],
      where: restAnd([restEq("hidden", { booleanValue: false }), restEq("linked", { booleanValue: true })]),
      limit: 50,
    },
  }).catch(() => []);
  for (const row of rows) {
    if (!row.document) continue;
    const id = row.document.name.split("/").pop()!;
    const { displayName, color, image } = fromRestFields(row.document.fields ?? {});
    if (typeof displayName !== "string") continue;
    payload.users[id] = {
      id,
      name: displayName,
      color: typeof color === "string" ? color : "#64748b",
      accounts: [],
      ...(typeof image === "string" && image ? { image } : {}),
    };
    payload.log.players[id] = { linked: true, hidden: false, characterIds: [] };
  }
  return { status: "public", data: payload };
}

async function loadCharacter(c: RestConfig, id: string): Promise<SharedPage<SharedCharacterData>> {
  const manifest = await restGet(c, `sharedCharacters/${id}`);
  if (!manifest || manifest.enabled !== true || typeof manifest.revision !== "string")
    return { status: "missing" };
  const payload = (await readChunks(
    c,
    `sharedCharacters/${id}`,
    manifest.revision,
    manifest.chunkCount,
  )) as SharedCharacterData | null;
  if (!payload?.character) return { status: "missing" };
  const share = payload.character.share;
  if (!share?.enabled || share.scope === "private") return { status: "limited" };
  return { status: "public", data: payload };
}

/** 読めなかったとき（Firestore の設定が無い・通信の失敗）は missing。OG 画像は一般の札になる */
async function guard<T>(
  key: string,
  load: (c: RestConfig, key: string) => Promise<SharedPage<T>>,
): Promise<SharedPage<T>> {
  const c = restConfig();
  if (!c || !KEY_RE.test(key)) return { status: "missing" };
  try {
    return await load(c, encodeURIComponent(key));
  } catch {
    return { status: "missing" };
  }
}

/** 同じ描画の中（題名と OG 画像の両方）で 1 回だけ読む */
export const sharedLogPage = cache((slug: string) => guard(slug, loadLog));
export const sharedCharacterPage = cache((id: string) => guard(id, loadCharacter));
