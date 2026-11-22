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
  Combobox,
  MultiCombobox,
  SysBadge,
  cx,
  useVisibleCount,
} from "../components/ui";
import { CharAvatar } from "../components/identity";
import { SheetView } from "../components/sheet";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { fmtDateShort, uid, todayStr } from "../lib/time";
import { recentSystemIds, systemOptions } from "../lib/system-options";
import { cleanTags, tagOptions } from "../lib/tags";
import { toCharacterFields, type ParsedCharacter } from "../lib/importers";
import { carriedValues, currentCarriedValue } from "../lib/character-growth";
import {
  EXTERNAL_PROVIDER_LABELS,
  SHEET_SITES,
  bioFromMemo,
  describeSheetUrl,
  extractArchetypeFromMemo,
} from "../lib/external-sync";
import type { Character, ExternalSyncConfig, ExternalSyncProvider } from "../types";
import { IconLink, IconPlus, IconSearch } from "../components/icons";

const lastPlayedCache = new WeakMap<Character, string | undefined>();

/** 卓をまたいで続く値（SAN など）の今の値。セッションの記録とキャラシのうち新しいほう */
export function currentStat(c: Character, key: string): number | undefined {
  return currentCarriedValue(c, key);
}

export function lastPlayed(c: Character): string | undefined {
  if (lastPlayedCache.has(c)) return lastPlayedCache.get(c);
  let last: string | undefined;
  for (const s of c.sessions) if (!last || s.date > last) last = s.date;
  lastPlayedCache.set(c, last);
  return last;
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
  /* カードには卓をまたいで続く値（SAN など）だけを出す。続かない値（HP・幸運・共鳴など）は出さない */
  const stats = carriedValues(c);
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
                {st.label} <b className="text-base-content">{st.value}</b>
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

/** 読み込めるキャラシサイト。説明文ではなく名前の並びで見せる */
function SheetSites({ className }: { className?: string }) {
  return (
    <ul aria-label="対応しているキャラシサイト" className={cx("meta justify-center", className)}>
      {SHEET_SITES.map((site) => (
        <li key={site.label} className="whitespace-nowrap">
          {site.label}
        </li>
      ))}
    </ul>
  );
}

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
          <EmptyState kind="first" title="キャラシの URL から取り込めます" action={addButton}>
            <SheetSites />
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
                <Combobox
                  ariaLabel="システムで絞り込む"
                  value={sys}
                  onChange={setSys}
                  className="sm:w-60"
                  options={[
                    { value: "all", label: "すべてのシステム" },
                    ...systemOptions(SYSTEM_LIST.filter((x) => usedSystems.has(x.id))),
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

/* ================= キャラクター取り込み（キャラシの URL だけ。P6） ================= */

/** 取り込み結果を卓譜のキャラクター項目にする（紹介文には職業などの行を入れない） */
function toPreviewCharacter(character: ParsedCharacter, sheetUrl: string): Partial<Character> {
  const fields = toCharacterFields(character, "general");
  const sheet = fields.sheet ?? undefined;
  return {
    ...fields,
    bio: bioFromMemo(character.memo),
    archetype: extractArchetypeFromMemo(character.memo),
    ...(sheet ? { sheet: { ...sheet, url: sheetUrl, fetchedAt: new Date().toISOString() } } : {}),
  };
}

function createCharacterRecord(
  fields: Partial<Character>,
  srcLabel: string,
  externalSync: ExternalSyncConfig,
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
      externalSync,
      ...(fields.sheet ? { sheet: fields.sheet } : {}),
    },
  };
}

function ImportWizard({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const { update } = useStore();
  const nav = useNavigate();
  const [sheetUrl, setSheetUrl] = useState("");
  const [tried, setTried] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Character> | null>(null);
  const [systemKnown, setSystemKnown] = useState(true);
  const [pendingSync, setPendingSync] = useState<ExternalSyncConfig | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("キャラシ");
  const [error, setError] = useState<string | null>(null);

  const site = describeSheetUrl(sheetUrl);
  const looksComplete = /^https?:\/\/[^/\s]+\.[^/\s]+\/\S/.test(sheetUrl.trim());
  const showUrlError = site.state === "invalid" && (tried || looksComplete);

  async function fetchFromUrl() {
    setTried(true);
    if (parsing || site.state !== "ok") return;
    setParsing(true);
    setError(null);
    const data = await requestExternalSheet(site.url);
    setParsing(false);
    if (!data.ok || !data.character || !data.provider) {
      setError(data.error ?? "キャラシを読み込めませんでした。");
      return;
    }
    const label = data.providerLabel ?? EXTERNAL_PROVIDER_LABELS[data.provider];
    const url = data.url ?? site.url;
    setSourceLabel(label);
    setSystemKnown(Boolean(data.character.systemId));
    setPreview(toPreviewCharacter(data.character, url));
    setPendingSync({
      provider: data.provider,
      url,
      lastSyncedAt: data.fetchedAt ?? new Date().toISOString(),
      lastStatus: "ok",
      contentHash: data.contentHash,
      autoSync: true,
    });
  }

  function save() {
    if (!preview?.name?.trim() || !pendingSync) {
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

  function back() {
    setPreview(null);
    setPendingSync(null);
    setError(null);
  }

  const foot = preview ? (
    <>
      <button type="button" className="btn btn-quiet" onClick={back}>
        戻る
      </button>
      <button type="button" className="btn btn-primary" onClick={save}>
        取り込む
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-quiet" onClick={onClose}>
        キャンセル
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={parsing || !sheetUrl.trim()}
        onClick={fetchFromUrl}
      >
        {parsing ? "読み込み中…" : "読み込む"}
      </button>
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
      ) : (
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
              </p>
            ) : (
              <SheetSites className="!justify-start" />
            )}
          </div>

          <div className="mt-6 border-t border-base-300 pt-4">
            <button type="button" className="btn btn-quiet btn-sm" onClick={onManual}>
              <IconPlus width={16} height={16} /> キャラシなしで作る
            </button>
          </div>
        </form>
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
          <Combobox
            ariaLabel="システム"
            className="w-full"
            value={preview.systemId ?? "general"}
            onChange={onSystem}
            options={systemOptions()}
          />
        </Field>
      )}
      {preview.sheet ? (
        <div className="mt-5">
          <SheetView sheet={preview.sheet} systemId={preview.systemId ?? "general"} compact />
        </div>
      ) : null}
    </>
  );
}

/* ---------- 手入力 ---------- */
interface NewCharFormValues {
  name: string;
  systemId: string;
  archetype: string;
  bio: string;
  tags: string[];
}

function NewCharModal({ onClose }: { onClose: () => void }) {
  const { state, update } = useStore();
  const recentSystems = useMemo(() => recentSystemIds(Object.values(state.logs)), [state.logs]);
  const tagSuggestions = useMemo(
    () => tagOptions(Object.values(state.characters).filter((x) => x.ownerId === state.me)),
    [state.characters, state.me],
  );
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
      tags: [],
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
        tags: cleanTags(values.tags),
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
      title="キャラシなしで作る"
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
                  <Combobox
                    ariaLabel="システム"
                    className="w-full"
                    value={field.value}
                    onChange={field.onChange}
                    options={systemOptions()}
                    pinned={recentSystems}
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
        <Field label="タグ">
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <MultiCombobox
                ariaLabel="タグ"
                className="w-full"
                values={field.value}
                onChange={field.onChange}
                options={tagSuggestions}
                placeholder="タグを探すか、新しく追加"
              />
            )}
          />
        </Field>
      </form>
    </Modal>
  );
}
