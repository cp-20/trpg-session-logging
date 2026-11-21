import { memo, useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate } from "../lib/router";
import { Controller, useForm } from "react-hook-form";
import { useStore } from "../store";
import {
  EmptyState,
  Field,
  InlineNotice,
  LoadMore,
  Modal,
  PageHead,
  Select,
  SysBadge,
  cx,
  useVisibleCount,
} from "../components/ui";
import { CharAvatar } from "../components/identity";
import { SheetView } from "../components/sheet";
import { SYSTEMS, SYSTEM_LIST, carriedStats } from "../data/systems";
import { fmtDateShort, uid, todayStr } from "../lib/time";
import {
  importCharactersFromFiles,
  importCharactersFromText,
  toCharacterFields,
  type CharacterImportResult,
  type ParsedCharacter,
} from "../lib/importers";
import {
  EXTERNAL_PROVIDER_LABELS,
  SHEET_SITES,
  bioFromMemo,
  describeSheetUrl,
  extractArchetypeFromMemo,
} from "../lib/external-sync";
import type { Character, ExternalSyncConfig, ExternalSyncProvider } from "../types";
import { IconLink, IconPlus, IconSearch, IconUpload } from "../components/icons";

const charMetaCache = new WeakMap<Character, { latestByKey: Map<string, number>; lastDate?: string }>();

function getCharMeta(c: Character) {
  let hit = charMetaCache.get(c);
  if (hit) return hit;
  const latestByKey = new Map<string, { date: string; val: number }>();
  let lastDate: string | undefined;
  for (const s of c.sessions) {
    if (!lastDate || s.date > lastDate) lastDate = s.date;
    for (const [k, d] of Object.entries(s.delta)) {
      if (d.after == null) continue;
      const prev = latestByKey.get(k);
      if (!prev || s.date >= prev.date) {
        latestByKey.set(k, { date: s.date, val: d.after });
      }
    }
  }
  const valMap = new Map<string, number>();
  for (const [k, v] of latestByKey) valMap.set(k, v.val);
  hit = { latestByKey: valMap, lastDate };
  charMetaCache.set(c, hit);
  return hit;
}

/** セッション記録での最新値を優先し、なければキャラシートの値を返す */
export function currentStat(c: Character, key: string): number | undefined {
  return getCharMeta(c).latestByKey.get(key) ?? c.stats[key];
}

export function lastPlayed(c: Character): string | undefined {
  return getCharMeta(c).lastDate;
}

export type ExternalSheetResponse = {
  ok: boolean;
  kind?: string;
  provider?: ExternalSyncProvider;
  providerLabel?: string;
  url?: string;
  contentHash?: string;
  fetchedAt?: string;
  character?: ParsedCharacter;
  error?: string;
};

/** キャラシの URL を卓譜のサーバー経由で読む（1 件ずつ。一覧の巡回はしない） */
export async function requestExternalSheet(url: string): Promise<ExternalSheetResponse> {
  try {
    const res = await fetch("/api/import/external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = (await res.json()) as ExternalSheetResponse;
    if (!res.ok || !data.ok || data.kind !== "character" || !data.character) {
      return { ok: false, error: data.error ?? "キャラシを読み込めませんでした。" };
    }
    return data;
  } catch {
    return { ok: false, error: "キャラシのサイトと通信できませんでした。通信状態をお確かめください。" };
  }
}

/** 顔を主役にしたキャラクターカード。一覧とユーザーページで共通に使う */
export const CharacterCard = memo(function CharacterCard({ c }: { c: Character }) {
  const sys = SYSTEMS[c.systemId];
  const last = lastPlayed(c);
  /* カードには卓をまたいで続く値（SAN など）だけを出す。HP・MP は毎回戻るので出さない */
  const stats = carriedStats(sys).filter((st) => currentStat(c, st.key) != null);
  return (
    <Link to={`/characters/${c.id}`} className="card-interactive overflow-hidden p-0">
      <div className="flex items-start gap-4 p-4">
        <CharAvatar c={c} size={72} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-snug">{c.name}</h3>
          {c.archetype && <p className="truncate text-sm text-ink2">{c.archetype}</p>}
          <div className="meta mt-2 text-xs">
            <SysBadge sys={sys} />
          </div>
          <div className="meta mt-1 text-xs tabular-nums">
            {stats.map((st) => (
              <span key={st.key}>
                {st.label} <b className="text-base-content">{currentStat(c, st.key)}</b>
              </span>
            ))}
            <span>{last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
});

const CHAR_PAGE_SIZE = 24;
const SITE_NAMES = SHEET_SITES.map((s) => s.label).join("・");

export default function Characters() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [sys, setSys] = useState("all");
  const [wizard, setWizard] = useState(false);
  const [manual, setManual] = useState(false);
  const [visibleCount, setVisibleCount] = useVisibleCount(CHAR_PAGE_SIZE, [deferredQ, sys]);

  const myChars = useMemo(
    () => Object.values(state.characters).filter((c) => c.ownerId === state.me),
    [state.characters, state.me],
  );
  const usedSystems = useMemo(() => new Set(myChars.map((c) => c.systemId)), [myChars]);

  const list = useMemo(() => {
    let items = myChars;
    if (sys !== "all") items = items.filter((c) => c.systemId === sys);
    const query = deferredQ.trim().toLowerCase();
    if (query) {
      items = items.filter((c) => (c.name + c.archetype + c.tags.join()).toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => (lastPlayed(b) ?? "").localeCompare(lastPlayed(a) ?? ""));
  }, [myChars, deferredQ, sys]);

  const shownList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);

  const addButton = (
    <button type="button" className="btn btn-primary" onClick={() => setWizard(true)}>
      <IconPlus width={16} height={16} /> キャラシから取り込む
    </button>
  );

  return (
    <>
      <PageHead title="キャラクター" actions={myChars.length > 0 ? addButton : undefined} />

      {myChars.length === 0 ? (
        <div className="surface">
          <EmptyState kind="first" title="キャラクターを登録しましょう" action={addButton}>
            キャラシの URL を貼ると、能力値と技能をそのまま取り込みます。{SITE_NAMES}・いあきゃらに対応。
          </EmptyState>
        </div>
      ) : (
        <>
          {myChars.length > 4 && (
            <div className="mb-5 flex flex-col gap-2 sm:flex-row">
              <label className="input flex flex-1 items-center gap-2">
                <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
                <input
                  type="search"
                  className="min-w-0 grow"
                  placeholder="名前・職業・タグで検索"
                  aria-label="キャラクターを検索"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              {usedSystems.size > 1 && (
                <Select
                  ariaLabel="システムで絞り込む"
                  value={sys}
                  onChange={setSys}
                  className="sm:w-60"
                  options={[
                    { value: "all", label: "すべてのシステム" },
                    ...SYSTEM_LIST.filter((x) => usedSystems.has(x.id)).map((x) => ({
                      value: x.id,
                      label: x.name,
                    })),
                  ]}
                />
              )}
            </div>
          )}
          {list.length === 0 ? (
            <div className="surface">
              <EmptyState
                kind="filtered"
                action={
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setQ("");
                      setSys("all");
                    }}
                  >
                    絞り込みを解除
                  </button>
                }
              />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shownList.map((c) => (
                  <CharacterCard key={c.id} c={c} />
                ))}
              </div>
              <LoadMore
                shown={shownList.length}
                total={list.length}
                step={CHAR_PAGE_SIZE}
                onMore={() => setVisibleCount((n) => n + CHAR_PAGE_SIZE)}
              />
            </>
          )}
        </>
      )}

      {wizard && (
        <ImportWizard
          onClose={() => setWizard(false)}
          onManual={() => {
            setWizard(false);
            setManual(true);
          }}
        />
      )}
      {manual && <NewCharModal onClose={() => setManual(false)} />}
    </>
  );
}

/* ================= キャラクター取り込み ================= */
type BatchPreviewItem = {
  key: string;
  selected: boolean;
  sourceLabel: string;
  fields: Partial<Character>;
};

/** 取り込み結果を卓譜のキャラクター項目にする（紹介文には職業などの行を入れない） */
function toPreviewCharacter(res: CharacterImportResult, sheetUrl?: string): Partial<Character> {
  const fields = toCharacterFields(res.character, "general");
  const sheet = fields.sheet ?? undefined;
  return {
    ...fields,
    bio: bioFromMemo(res.character.memo),
    archetype: extractArchetypeFromMemo(res.character.memo),
    ...(sheet
      ? { sheet: { ...sheet, ...(sheetUrl ? { url: sheetUrl } : {}), fetchedAt: new Date().toISOString() } }
      : {}),
  };
}

function createCharacterRecord(
  fields: Partial<Character>,
  srcLabel: string,
  externalSync: ExternalSyncConfig | null,
): { id: string; char: Character } {
  const id = "ch_" + uid();
  const sysId = fields.systemId ?? "general";
  return {
    id,
    char: {
      id,
      ownerId: "",
      name: fields.name!.trim(),
      systemId: sysId,
      color: fields.color ?? SYSTEMS[sysId]?.color ?? SYSTEMS.general.color,
      image: fields.image,
      archetype: fields.archetype?.trim() ?? "",
      bio: fields.bio?.trim() ?? "",
      tags: [],
      stats: { ...fields.stats },
      sessions: [],
      growth: [],
      share: {
        enabled: false,
        scope: "private",
        includeProfile: true,
        includeStats: true,
        includeGrowth: true,
        includeSessions: true,
      },
      import: { source: srcLabel, importedAt: todayStr() },
      ...(externalSync ? { externalSync } : {}),
      ...(fields.sheet ? { sheet: fields.sheet } : {}),
    },
  };
}

function ImportWizard({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const { update } = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState<"url" | "file">("url");
  const [sheetUrl, setSheetUrl] = useState("");
  const [tried, setTried] = useState(false);
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Character> | null>(null);
  const [systemKnown, setSystemKnown] = useState(true);
  const [pendingSync, setPendingSync] = useState<ExternalSyncConfig | null>(null);
  const [batch, setBatch] = useState<BatchPreviewItem[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("取り込み");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const site = describeSheetUrl(sheetUrl);
  const looksComplete = /^https?:\/\/[^/\s]+\.[^/\s]+\/\S/.test(sheetUrl.trim());
  const showUrlError = site.state === "invalid" && (tried || looksComplete);

  function showParsedList(results: CharacterImportResult[], pasteUrl?: string) {
    if (results.length === 0) {
      setError(
        "キャラクターを読み取れませんでした。キャラシサイトの「ココフォリア駒出力」や書き出したファイルをお試しください。",
      );
      return;
    }
    setError(null);
    setPendingSync(null);
    if (results.length === 1) {
      const only = results[0]!;
      setBatch(null);
      setSourceLabel(only.sourceLabel);
      setSystemKnown(Boolean(only.character.systemId));
      setPreview(toPreviewCharacter(only, pasteUrl));
      return;
    }
    setPreview(null);
    setBatch(
      results.map((r, i) => ({
        key: `imp-${i}`,
        selected: true,
        sourceLabel: r.sourceLabel,
        fields: toPreviewCharacter(r),
      })),
    );
  }

  async function fetchFromUrl() {
    setTried(true);
    if (parsing) return;
    if (site.state === "paste") {
      showParsedList(importCharactersFromText(pasted).slice(0, 1), site.url);
      if (pasted.trim()) setSourceLabel(site.label);
      return;
    }
    if (site.state !== "ok") return;
    setParsing(true);
    setError(null);
    const data = await requestExternalSheet(site.url);
    setParsing(false);
    if (!data.ok || !data.character || !data.provider) {
      setError(data.error ?? "キャラシを読み込めませんでした。");
      return;
    }
    const label = data.providerLabel ?? EXTERNAL_PROVIDER_LABELS[data.provider];
    setSourceLabel(label);
    setBatch(null);
    setSystemKnown(Boolean(data.character.systemId));
    setPreview(toPreviewCharacter({ character: data.character, sourceLabel: label }, data.url ?? site.url));
    setPendingSync({
      provider: data.provider,
      url: data.url ?? site.url,
      lastSyncedAt: data.fetchedAt ?? new Date().toISOString(),
      lastStatus: "ok",
      contentHash: data.contentHash,
      autoSync: true,
    });
  }

  async function readFiles(files: FileList | File[] | null | undefined) {
    const arr = files ? Array.from(files) : [];
    if (arr.length === 0) return;
    const totalSize = arr.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 25 * 1024 * 1024) {
      setError("合計 25MB 以下のファイルを選んでください。");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      showParsedList(await importCharactersFromFiles(arr));
    } catch {
      setError("ファイルを読み取れませんでした。書き出し直したファイルでお試しください。");
    } finally {
      setParsing(false);
    }
  }

  function saveSingle() {
    if (!preview?.name?.trim()) {
      setError("キャラクターの名前を読み取れませんでした。");
      return;
    }
    const { id, char } = createCharacterRecord(preview, sourceLabel, pendingSync);
    update((state) => {
      char.ownerId = state.me;
      state.characters[id] = char;
    });
    onClose();
    nav({ to: `/characters/${id}` });
  }

  function saveBatch() {
    if (!batch) return;
    const targets = batch.filter((b) => b.selected && b.fields.name?.trim());
    if (targets.length === 0) {
      setError("取り込むキャラクターを 1 件以上選んでください。");
      return;
    }
    update((state) => {
      for (const item of targets) {
        const { id, char } = createCharacterRecord(item.fields, item.sourceLabel, null);
        char.ownerId = state.me;
        state.characters[id] = char;
      }
    });
    onClose();
  }

  function back() {
    setPreview(null);
    setBatch(null);
    setPendingSync(null);
    setError(null);
  }

  const urlPrimaryDisabled = parsing || (site.state === "paste" ? !pasted.trim() : !sheetUrl.trim());

  const foot = preview ? (
    <>
      <button type="button" className="btn btn-quiet" onClick={back}>
        戻る
      </button>
      <button type="button" className="btn btn-primary" onClick={saveSingle}>
        取り込む
      </button>
    </>
  ) : batch ? (
    <>
      <button type="button" className="btn btn-quiet" onClick={back}>
        戻る
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={batch.filter((b) => b.selected).length === 0}
        onClick={saveBatch}
      >
        {batch.filter((b) => b.selected).length}件を取り込む
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-quiet" onClick={onClose}>
        キャンセル
      </button>
      {mode === "url" ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={urlPrimaryDisabled}
          onClick={fetchFromUrl}
        >
          {parsing ? "読み込み中…" : "読み込む"}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={parsing || !pasted.trim()}
          onClick={() => showParsedList(importCharactersFromText(pasted))}
        >
          内容を確認
        </button>
      )}
    </>
  );

  return (
    <Modal title="キャラシから取り込む" onClose={onClose} wide foot={foot}>
      {preview ? (
        <ImportPreview
          preview={preview}
          sourceLabel={sourceLabel}
          systemKnown={systemKnown}
          onSystem={(v) => setPreview({ ...preview, systemId: v })}
        />
      ) : batch ? (
        <div>
          <p className="mb-3 text-sm text-ink2">
            {batch.length}件のキャラクターを読み取りました。取り込むものを選んでください。
          </p>
          <ul className="list rounded-box border border-base-300">
            {batch.map((item) => (
              <li key={item.key} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  aria-label={`${item.fields.name ?? "キャラクター"}を取り込む`}
                  checked={item.selected}
                  onChange={(e) =>
                    setBatch((prev) =>
                      prev
                        ? prev.map((x) => (x.key === item.key ? { ...x, selected: e.target.checked } : x))
                        : null,
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{item.fields.name}</b>
                  <span className="meta text-xs">
                    <SysBadge sys={SYSTEMS[item.fields.systemId ?? "general"]} />
                    <span>{item.sourceLabel}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : mode === "url" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void fetchFromUrl();
          }}
        >
          <Field label="キャラシの URL" noMargin>
            <div
              className={cx(
                "input input-bordered flex w-full items-center gap-2.5",
                showUrlError && "input-error",
              )}
            >
              <IconLink width={18} height={18} className="shrink-0 text-ink2" aria-hidden />
              <input
                type="url"
                inputMode="url"
                className="min-w-0 grow"
                placeholder="https://charaeno.com/7th/…"
                value={sheetUrl}
                disabled={parsing}
                aria-invalid={showUrlError || undefined}
                onChange={(event) => {
                  setSheetUrl(event.target.value);
                  setTried(false);
                  setError(null);
                }}
              />
            </div>
          </Field>
          <div className="mt-2 min-h-5 text-sm">
            {parsing ? (
              <InlineNotice
                tone="pending"
                text={`${site.state === "ok" ? site.label : "キャラシ"}を読み込み中…`}
              />
            ) : showUrlError ? (
              <p role="alert" className="text-error">
                {site.message}
              </p>
            ) : site.state === "ok" ? (
              <p className="text-ink2">
                <b className="font-medium text-base-content">{site.label}</b>
                のキャラシとして読み込みます
              </p>
            ) : site.state === "paste" ? (
              <p className="leading-relaxed">{site.message}</p>
            ) : (
              <p className="text-ink2">{SITE_NAMES} の URL に対応</p>
            )}
          </div>

          {site.state === "paste" && (
            <div>
              <Field label="ココフォリア駒出力">
                <textarea
                  className="textarea textarea-bordered w-full font-mono text-sm"
                  rows={5}
                  value={pasted}
                  onChange={(event) => {
                    setPasted(event.target.value);
                    setError(null);
                  }}
                  placeholder='{"kind":"character","data":{…}}'
                />
              </Field>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-base-300 pt-4 text-sm">
            <span className="mr-2 text-ink2">URL がないときは</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onManual}>
              <IconPlus width={16} height={16} /> 手入力で作る
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setMode("file");
                setError(null);
              }}
            >
              <IconUpload width={16} height={16} /> ファイル・コマから読む
            </button>
          </div>
        </form>
      ) : (
        <>
          <label
            htmlFor="character-file"
            className={cx("drop block cursor-pointer !py-8", dragging && "hot", parsing && "opacity-60")}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const files = event.dataTransfer.files;
              if (files.length === 1) setFileName(files[0]!.name);
              else if (files.length > 1) setFileName(`${files.length} 件のファイル`);
              void readFiles(files);
            }}
          >
            <IconUpload width={28} height={28} className="mx-auto text-ink2" aria-hidden />
            <span className="mt-3 block font-bold">ファイルを選ぶ・ここにドロップ</span>
            <span className="mt-1 block text-sm text-ink2">
              {fileName ?? "キャラッシュ・ココフォリア・ユドナリウムなどから書き出したファイル（複数可）"}
            </span>
            <input
              id="character-file"
              type="file"
              multiple
              className="sr-only"
              accept=".json,.txt,.xml,.zip"
              disabled={parsing}
              onChange={(event) => {
                const files = event.target.files;
                if (files && files.length === 1) setFileName(files[0]!.name);
                else if (files && files.length > 1) setFileName(`${files.length} 件のファイル`);
                void readFiles(files);
                event.target.value = "";
              }}
            />
          </label>
          {parsing && (
            <div className="mt-3">
              <InlineNotice tone="pending" text="読み込み中…" />
            </div>
          )}
          <Field label="またはコマ・キャラシの内容を貼り付け">
            <textarea
              className="textarea textarea-bordered w-full font-mono text-sm"
              rows={5}
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setError(null);
              }}
              placeholder="ココフォリア駒出力、いあきゃら・エモクロアのテキスト出力など"
            />
          </Field>
          <div className="mt-4">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setMode("url");
                setError(null);
              }}
            >
              <IconLink width={16} height={16} /> URL から取り込む
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** 取り込む前の確認。名前・能力値はキャラシのままなので入力欄にしない */
function ImportPreview({
  preview,
  sourceLabel,
  systemKnown,
  onSystem,
}: {
  preview: Partial<Character>;
  sourceLabel: string;
  systemKnown: boolean;
  onSystem: (systemId: string) => void;
}) {
  const sys = SYSTEMS[preview.systemId ?? "general"];
  return (
    <>
      <div className="flex items-center gap-4">
        {preview.image ? (
          <img
            src={preview.image}
            alt="取り込んだキャラクター画像"
            className="size-16 shrink-0 rounded-full border border-base-300 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold leading-snug">{preview.name}</h3>
          <div className="meta mt-0.5">
            {preview.archetype && <span>{preview.archetype}</span>}
            {systemKnown && <SysBadge sys={sys} />}
            <span>{sourceLabel}から</span>
          </div>
        </div>
      </div>
      {!systemKnown && (
        <Field label="システム">
          <Select
            ariaLabel="システム"
            className="w-full"
            value={preview.systemId ?? "general"}
            onChange={onSystem}
            options={SYSTEM_LIST.map((system) => ({ value: system.id, label: system.name }))}
          />
        </Field>
      )}
      {preview.sheet ? (
        <div className="mt-5">
          <SheetView sheet={preview.sheet} systemId={preview.systemId ?? "general"} compact />
        </div>
      ) : null}
      <p className="mt-4 text-sm text-ink2">
        名前・能力値・技能はキャラシの内容のまま入ります。直すときはキャラシ側で直して、キャラクターのページで更新してください。
      </p>
    </>
  );
}

/* ---------- 手入力 ---------- */
interface NewCharFormValues {
  name: string;
  systemId: string;
  archetype: string;
  bio: string;
  tags: string;
}

function NewCharModal({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const nav = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<NewCharFormValues>({
    mode: "onChange",
    defaultValues: {
      name: "",
      systemId: "coc7",
      archetype: "",
      bio: "",
      tags: "",
    },
  });

  function onSubmit(values: NewCharFormValues) {
    const id = "ch_" + uid();
    update((s) => {
      const stats: Record<string, number> = {};
      s.characters[id] = {
        id,
        ownerId: s.me,
        name: values.name.trim(),
        systemId: values.systemId,
        color: SYSTEMS[values.systemId]?.color ?? SYSTEMS.general.color,
        archetype:
          values.archetype.trim() || `${SYSTEMS[values.systemId]?.name ?? "汎用・その他"}のキャラクター`,
        bio: values.bio.trim(),
        tags: values.tags
          .split(/[,、]/)
          .map((t) => t.trim())
          .filter(Boolean),
        stats,
        sessions: [],
        growth: [],
        share: {
          enabled: false,
          scope: "private",
          includeProfile: true,
          includeStats: true,
          includeGrowth: true,
          includeSessions: true,
        },
        import: { source: "手入力", importedAt: todayStr() },
      };
    });
    onClose();
    nav({ to: `/characters/${id}` });
  }

  return (
    <Modal
      title="手入力で作る"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid}
            onClick={handleSubmit(onSubmit)}
          >
            登録する
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="名前" noMargin>
            <input
              className={cx("input input-bordered w-full", errors.name && "input-error")}
              aria-invalid={errors.name ? "true" : undefined}
              placeholder="例: 遠沢澄花"
              {...register("name", {
                validate: (v) => v.trim().length > 0 || "名前を入力してください",
              })}
            />
            {errors.name?.message && (
              <p role="alert" className="text-xs text-error mt-1">
                {errors.name.message}
              </p>
            )}
          </Field>
          <div className="mt-4 sm:mt-0">
            <Field label="システム" noMargin>
              <Controller
                name="systemId"
                control={control}
                render={({ field }) => (
                  <Select
                    ariaLabel="システム"
                    className="w-full"
                    value={field.value}
                    onChange={field.onChange}
                    options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
                  />
                )}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="職業など">
              <input className="input input-bordered w-full" {...register("archetype")} />
            </Field>
          </div>
        </div>
        <Field label="ひとこと紹介">
          <textarea className="textarea textarea-bordered w-full text-sm" {...register("bio")} />
        </Field>
        <Field label="タグ（カンマ区切り）">
          <input className="input input-bordered w-full" placeholder="例: 継続, 学生" {...register("tags")} />
        </Field>
      </form>
    </Modal>
  );
}
