/**
 * シナリオの共有シナリオ一覧の置き場所（Firestore の scenarios/{id}）を、公開 REST API で問い合わせる。サーバーは何も覚えておかない。
 * - 言葉で探す: 切れ端（t.<切れ端> == true）の等号だけを重ねる。単一の索引の合わせ技で答えるので、複合索引は要らない
 * - 並べて見る: rank（システムで絞るときは sysRank の範囲）の順。どちらも単一の索引
 * 共有シナリオ一覧の中身は TALTO の分を scripts/sync-scenario-directory.ts が、利用者の分をブラウザが書く（firestore.rules）。
 */
import {
  parseDirectoryDoc,
  fromDirectoryDoc,
  type DirectoryDoc,
  type DirectoryResult,
  type DirectoryScenario,
  type ScenarioStore,
} from "../lib/scenario-directory";
import {
  fieldPath,
  fromRest,
  fromRestFields,
  restAnd as and,
  restConfig as config,
  restEq as eq,
  restPost as post,
  type RestConfig as Config,
  type RestDoc,
  type RestValue,
} from "./firestore-rest";

function toDoc(d: RestDoc): DirectoryDoc | null {
  return parseDirectoryDoc(d.name.split("/").pop()!, fromRestFields(d.fields ?? {}));
}

async function runQuery(c: Config, structuredQuery: object): Promise<DirectoryDoc[]> {
  const rows = await post<{ document?: RestDoc }[]>(c, ":runQuery", {
    structuredQuery: { from: [{ collectionId: "scenarios" }], ...structuredQuery },
  });
  return rows.flatMap((r) => (r.document ? [toDoc(r.document)].filter((d): d is DirectoryDoc => !!d) : []));
}

async function count(c: Config, where: object | undefined): Promise<number> {
  const rows = await post<{ result?: { aggregateFields?: { n?: RestValue } } }[]>(c, ":runAggregationQuery", {
    structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: "scenarios" }], ...(where ? { where } : {}) },
      aggregations: [{ alias: "n", count: {} }],
    },
  });
  return Number(fromRest(rows[0]?.result?.aggregateFields?.n ?? { integerValue: "0" }));
}

/** システムで絞るときは sysRank の範囲（"coc6:" 以上 "coc6;" 未満）、そうでなければ rank の順 */
function pageQuery(systemId: string | undefined): { where?: object; orderBy: object[] } {
  if (!systemId) return { orderBy: [{ field: { fieldPath: "rank" }, direction: "ASCENDING" }] };
  const range = (op: string, v: string) => ({
    fieldFilter: { field: { fieldPath: "sysRank" }, op, value: { stringValue: v } },
  });
  return {
    where: {
      compositeFilter: {
        op: "AND",
        filters: [range("GREATER_THAN_OR_EQUAL", `${systemId}:`), range("LESS_THAN", `${systemId};`)],
      },
    },
    orderBy: [{ field: { fieldPath: "sysRank" }, direction: "ASCENDING" }],
  };
}

export function firestoreScenarioStore(c: Config): ScenarioStore {
  return {
    async byIds(ids) {
      if (ids.length === 0) return [];
      const rows = await post<{ found?: RestDoc }[]>(c, ":batchGet", {
        documents: ids.map((id) => `${c.documents}/scenarios/${id}`),
      });
      const found = new Map(
        rows.flatMap((r) => {
          const d = r.found && toDoc(r.found);
          return d ? [[d.id, fromDirectoryDoc(d)] as const] : [];
        }),
      );
      return ids.map((id) => found.get(id)).filter((d): d is DirectoryScenario => !!d);
    },
    withGrams: (grams, systemId, limit) =>
      runQuery(c, {
        where: and([
          ...grams.map((g) => eq(fieldPath("t", g), { booleanValue: true })),
          ...(systemId ? [eq("systemId", { stringValue: systemId })] : []),
        ]),
        limit,
      }),
    async page(systemId, offset, limit): Promise<DirectoryResult> {
      const { where, orderBy } = pageQuery(systemId);
      const [docs, total] = await Promise.all([
        runQuery(c, { ...(where ? { where } : {}), orderBy, offset, limit }),
        count(c, where),
      ]);
      return { items: docs.map(fromDirectoryDoc), total };
    },
  };
}

let override: ScenarioStore | null = null;

/** テスト用: 共有シナリオ一覧の置き場所を差し替える（null で元に戻す） */
export function setScenarioStoreForTest(store: ScenarioStore | null): void {
  override = store;
}

/** 共有シナリオ一覧（Firestore の設定がなければ null） */
export function scenarioStore(): ScenarioStore | null {
  if (override) return override;
  const c = config();
  return c ? firestoreScenarioStore(c) : null;
}
