import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link, useParams } from "../lib/router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useStore } from "../store";
import {
  CopyBox,
  DateInput,
  EmptyState,
  Field,
  InlineNotice,
  LoadMore,
  Modal,
  NotFound,
  NumberInput,
  PageHead,
  SectionTitle,
  Select,
  SplitLayout,
  StatBar,
  StatChange,
  SysBadge,
  cx,
} from "../components/ui";
import { CharAvatar } from "../components/identity";
import { SheetView } from "../components/sheet";
import { SYSTEMS, carriedStats } from "../data/systems";
import { fmtDate, fmtDateShort, todayStr, uid } from "../lib/time";
import {
  EXTERNAL_PROVIDER_LABELS,
  canFetchSheet,
  isSheetLinked,
  mergeExternalCharacterUpdate,
  parseExternalUrl,
  shouldAutoSync,
  type StatChangeDiff,
} from "../lib/external-sync";
import { importCharactersFromText, type ParsedCharacter } from "../lib/importers";
import { SHEET_PROVIDER_LABELS, sheetSection } from "../lib/sheet";
import type { Character, GrowthRecord, SessionStat } from "../types";
import { currentStat, requestExternalSheet } from "./Characters";
import { IconExternal, IconPencil, IconRefresh, IconShare, IconPlus, IconHistory } from "../components/icons";

const CHAR_SESSION_PAGE_SIZE = 15;
const CHAR_SESSION_STEP = 20;

export default function CharacterDetail() {
  const { id } = useParams<{ id?: string }>();
  /* 別のキャラクターへ移ったら、表示件数・同期の結果・開いているダイアログを最初に戻す */
  return <CharacterDetailView key={id ?? ""} id={id} />;
}

type SyncSummary = { changed: boolean; diffs: StatChangeDiff[]; profileChanges: string[] };

/** 取得元の名前（URL で結び付いていればそのサイト、貼り付けならシートの取得元） */
function sheetSourceLabel(c: Character): string {
  if (c.externalSync) return EXTERNAL_PROVIDER_LABELS[c.externalSync.provider];
  if (c.sheet) return SHEET_PROVIDER_LABELS[c.sheet.provider];
  return "キャラシ";
}

function sheetUrlOf(c: Character): string | undefined {
  return c.externalSync?.url || c.sheet?.url || undefined;
}

/** 「11月20日に更新」。今日なら「今日更新」 */
function updatedLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return day === todayStr() ? "今日更新" : `${fmtDateShort(day)}に更新`;
}

function CharacterDetailView({ id }: { id: string | undefined }) {
  const { state, update } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  /* 更新中の表示は Transition の待機状態から得る（Effect から始める自動更新でも余分な描画を挟まない） */
  const [syncing, startSync] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [visibleCount, setVisibleCount] = useState(CHAR_SESSION_PAGE_SIZE);
  const autoSyncedKeyRef = useRef<string | null>(null);

  const c = state.characters[id ?? ""];
  const isMineChar = Boolean(c && c.ownerId === state.me);
  const extSync = c?.externalSync;
  const fetchable = Boolean(c && canFetchSheet(c));

  /** 取り込み結果を反映する（URL からでも貼り付けからでも同じ）。卓譜の項目と記録は残す */
  const applySheet = useCallback(
    (incoming: ParsedCharacter, meta: { url?: string; fetchedAt?: string; contentHash?: string }) => {
      if (!c) return;
      const syncedAt = meta.fetchedAt ?? new Date().toISOString();
      const merged = mergeExternalCharacterUpdate(c, incoming, {
        url: meta.url ?? extSync?.url ?? c.sheet?.url ?? "",
        provider: extSync?.provider ?? "iachara",
        syncedAt,
        today: todayStr(),
        contentHash: meta.contentHash,
      });
      const next = merged.next;
      /* URL で結び付いていないキャラクター（貼り付け・ファイル）には URL 連携を足さない */
      if (!extSync) delete next.externalSync;
      if (next.sheet && !next.sheet.url && sheetUrlOf(c)) next.sheet = { ...next.sheet, url: sheetUrlOf(c) };
      update((s) => {
        if (s.characters[c.id]) s.characters[c.id] = next;
      });
      setSyncError(null);
      setSyncSummary({
        changed: merged.changed,
        diffs: merged.statChanges,
        profileChanges: merged.profileChanges,
      });
    },
    [c, extSync, update],
  );

  const syncExternal = useCallback(() => {
    if (!c || !extSync?.url || !fetchable || syncing) return;
    startSync(async () => {
      const data = await requestExternalSheet(extSync.url);
      if (!data.ok || !data.character) {
        const msg = data.error ?? "キャラシを読み込めませんでした。";
        setSyncError(msg);
        update((s) => {
          const target = s.characters[c.id];
          if (target?.externalSync) {
            target.externalSync.lastStatus = "error";
            target.externalSync.lastError = msg;
          }
        });
        return;
      }
      applySheet(data.character, {
        url: data.url ?? extSync.url,
        fetchedAt: data.fetchedAt,
        contentHash: data.contentHash,
      });
    });
  }, [c, extSync, fetchable, syncing, update, applySheet]);

  /* 開いたとき、前の更新から 1 日以上たっていれば読み直す（裏で定期的には読まない） */
  useEffect(() => {
    if (!c || !isMineChar || !extSync?.url || !fetchable) return;
    const key = `${c.id}:${extSync.url}`;
    if (autoSyncedKeyRef.current === key) return;
    if (!shouldAutoSync(extSync, Date.now())) return;
    autoSyncedKeyRef.current = key;
    syncExternal();
  }, [c, isMineChar, extSync, fetchable, syncExternal]);

  const sessions = useMemo(
    () => (c ? [...c.sessions].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [c],
  );
  const looseGrowth = useMemo(() => {
    if (!c) return [];
    const sessionLogIds = new Set(c.sessions.map((s) => s.logId));
    return c.growth
      .filter((g) => !g.logId || !sessionLogIds.has(g.logId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [c]);
  const growthByLogId = useMemo(() => {
    const map = new Map<string, GrowthRecord[]>();
    if (!c) return map;
    for (const g of c.growth) {
      if (!g.logId) continue;
      const arr = map.get(g.logId);
      if (arr) arr.push(g);
      else map.set(g.logId, [g]);
    }
    return map;
  }, [c]);
  const coCharEntries = useMemo(() => {
    if (!c) return [];
    const coChars: Record<string, number> = {};
    for (const s of c.sessions) {
      const log = state.logs[s.logId];
      if (!log) continue;
      for (const [u, p] of Object.entries(log.players)) {
        if (u === c.ownerId) continue;
        for (const cid of p.characterIds) {
          if (cid === c.id) continue;
          coChars[cid] = (coChars[cid] ?? 0) + 1;
        }
      }
    }
    return Object.entries(coChars)
      .filter(([cid]) => Boolean(state.characters[cid]))
      .sort((a, b) => b[1] - a[1]);
  }, [c, state.logs, state.characters]);

  if (!c) return <NotFound what="キャラクター" />;
  const sys = SYSTEMS[c.systemId];
  const isMine = c.ownerId === state.me;
  const owner = state.users[c.ownerId];
  const firstDate = sessions.at(-1)?.date;
  const shownSessions = sessions.slice(0, visibleCount);
  const allSessionsShown = shownSessions.length >= sessions.length;
  const linked = isSheetLinked(c);
  const sheetUrl = sheetUrlOf(c);
  const sourceLabel = sheetSourceLabel(c);

  /* 卓をまたいで続く値（SAN など）。上限はキャラシにあればそれを使う */
  const resources = sheetSection(c.sheet, "resources")?.entries ?? [];
  const carried = carriedStats(sys)
    .map((st) => ({
      ...st,
      value: currentStat(c, st.key),
      max: resources.find((e) => e.label === st.label)?.max ?? st.max,
    }))
    .filter((st) => st.value != null);
  const hasAside = carried.length > 0 || coCharEntries.length > 0;

  const syncStatus =
    syncing || syncError || extSync?.lastStatus === "error" ? (
      <InlineNotice
        tone={syncing ? "pending" : "error"}
        text={
          syncing
            ? `${sourceLabel}から読み込み中…`
            : (syncError ?? extSync?.lastError ?? "更新できませんでした")
        }
      />
    ) : syncSummary?.changed ? (
      <p role="status" className="text-sm text-ink2 tabular-nums">
        {[
          ...syncSummary.diffs.map((d) => `${d.label} ${d.from}→${d.to}`),
          ...syncSummary.profileChanges.map((p) => `${p}が変わりました`),
        ].join("・") || "キャラシの内容が変わりました"}
      </p>
    ) : null;

  const sheetSection_ = linked ? (
    <section aria-label="キャラシ">
      <SectionTitle
        sub={
          <span className="meta">
            <span>{sourceLabel}</span>
            {updatedLabel(extSync?.lastSyncedAt ?? c.sheet?.fetchedAt) && (
              <span>{updatedLabel(extSync?.lastSyncedAt ?? c.sheet?.fetchedAt)}</span>
            )}
          </span>
        }
        right={
          <>
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                <IconExternal width={16} height={16} aria-hidden /> キャラシで開く
              </a>
            )}
            {isMine && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={syncing}
                aria-busy={syncing || undefined}
                onClick={() => (fetchable ? syncExternal() : setPasteOpen(true))}
              >
                <IconRefresh
                  width={16}
                  height={16}
                  aria-hidden
                  className={cx(syncing && "animate-spin motion-reduce:animate-none")}
                />
                {syncing ? "更新中…" : "更新"}
              </button>
            )}
          </>
        }
      >
        キャラシ
      </SectionTitle>
      {syncStatus && <div className="mb-3">{syncStatus}</div>}
      {c.sheet ? (
        <SheetView sheet={c.sheet} systemId={c.systemId} busy={syncing} />
      ) : (
        <div className="surface">
          <EmptyState kind="first" title="キャラシの内容はまだありません">
            「更新」を押すと、{sourceLabel}から能力値と技能を読み込みます。
          </EmptyState>
        </div>
      )}
    </section>
  ) : null;

  const mainCol = (
    <div className="space-y-8">
      {(c.bio || c.tags.length > 0) && (
        <div className="max-w-3xl">
          {c.bio && (
            <p data-user-content className="whitespace-pre-wrap text-sm leading-relaxed sm:text-base">
              {c.bio}
            </p>
          )}
          {c.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink2">
              {c.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
        </div>
      )}

      {sheetSection_}

      <section aria-label="これまでのセッション">
        <SectionTitle
          sub={firstDate ? `${fmtDate(firstDate)}から` : undefined}
          right={
            isMine ? (
              <button className="btn btn-sm" onClick={() => setGrowthOpen(true)}>
                <IconPlus width={16} height={16} /> {sys?.growthLabel ?? "成長"}を記録
              </button>
            ) : undefined
          }
        >
          これまでのセッション
        </SectionTitle>
        {sessions.length === 0 && looseGrowth.length === 0 ? (
          <div className="surface">
            <EmptyState kind="first" title="まだセッションに参加していません">
              セッションを記録するときに、参加者としてこのキャラクターを選ぶとここに並びます。
            </EmptyState>
          </div>
        ) : (
          <>
            <ol className="surface tl">
              {shownSessions.map((s) => {
                const log = state.logs[s.logId];
                const glist = growthByLogId.get(s.logId) ?? [];
                const year = s.date.slice(0, 4);
                const body = (
                  <div className="py-4 pr-4 sm:pr-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <h3 className="font-bold leading-snug transition-colors group-hover:text-primary">
                        {s.title}
                      </h3>
                      <time className="shrink-0 text-xs tabular-nums text-ink2" dateTime={s.date}>
                        {year !== String(new Date().getFullYear())
                          ? `${year}年${fmtDateShort(s.date)}`
                          : fmtDateShort(s.date)}
                      </time>
                    </div>
                    <Changes s={s} sysStats={carriedStats(sys)} growth={glist} />
                    {s.memo.trim() && (
                      <p data-user-content className="mt-1.5 text-sm leading-relaxed text-ink2">
                        {s.memo}
                      </p>
                    )}
                    {!log && <p className="mt-1 text-xs text-ink3">記録は削除されています</p>}
                  </div>
                );
                return (
                  <li key={s.logId} className="tlitem">
                    {log ? (
                      <Link
                        to={`/sessions/${s.logId}`}
                        className="group block transition-colors hover:bg-base-200/40"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
              {allSessionsShown && looseGrowth.length > 0 && (
                <li className="tlitem py-4 pr-4 sm:pr-5">
                  <h3 className="eyebrow mb-2">セッション外の{sys?.growthLabel ?? "成長"}</h3>
                  <ul className="space-y-1.5">
                    {looseGrowth.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-center gap-x-3 text-sm tabular-nums">
                        <span className="w-14 text-ink2">{fmtDateShort(g.date)}</span>
                        <GrowthLine g={g} />
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ol>
            <LoadMore
              shown={shownSessions.length}
              total={sessions.length}
              step={CHAR_SESSION_STEP}
              onMore={() => setVisibleCount((n) => n + CHAR_SESSION_STEP)}
            />
          </>
        )}
      </section>
    </div>
  );

  const asideCol = hasAside ? (
    <div className="space-y-8">
      {carried.length > 0 && (
        <section aria-label="現在の値">
          <SectionTitle>現在の値</SectionTitle>
          <dl className="surface space-y-3.5 p-4 sm:p-5">
            {carried.map((st) => (
              <StatBar key={st.key} label={st.label} value={st.value} max={st.max} />
            ))}
          </dl>
        </section>
      )}

      {coCharEntries.length > 0 && (
        <section aria-label="一緒に遊んだキャラクター">
          <SectionTitle>一緒に遊んだキャラクター</SectionTitle>
          <div className="surface list">
            {coCharEntries.map(([cid]) => {
              const cc = state.characters[cid]!;
              return (
                <Link
                  key={cid}
                  to={`/characters/${cid}`}
                  className="row-interactive flex items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <CharAvatar c={cc} size={38} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{cc.name}</b>
                    <span className="block truncate text-xs text-ink2">
                      {state.users[cc.ownerId]?.name ?? cc.archetype}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  ) : null;

  return (
    <>
      <PageHead
        back={isMine ? { to: "/characters", label: "キャラクター" } : undefined}
        lead={<CharAvatar c={c} size={84} />}
        title={c.name}
        sub={
          <div className="meta">
            {c.archetype && <span>{c.archetype}</span>}
            <SysBadge sys={sys} />
            {!isMine && owner && (
              <Link to={`/users/${c.ownerId}`} className="link-hover">
                {owner.name}のキャラクター
              </Link>
            )}
          </div>
        }
        actions={
          isMine ? (
            <>
              <button className="btn" onClick={() => setEditOpen(true)}>
                <IconPencil width={16} height={16} /> 編集
              </button>
              <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
                <IconShare width={16} height={16} /> 共有
              </button>
            </>
          ) : undefined
        }
      />

      {asideCol ? (
        <SplitLayout asideWidth="md" stickyAside main={mainCol} aside={asideCol} />
      ) : (
        <div className="max-w-4xl">{mainCol}</div>
      )}

      {editOpen && <EditCharModal key={c.id} c={c} onClose={() => setEditOpen(false)} />}
      {shareOpen && <ShareCharModal key={c.id} c={c} onClose={() => setShareOpen(false)} />}
      {growthOpen && <AddGrowthModal key={c.id} c={c} onClose={() => setGrowthOpen(false)} />}
      {pasteOpen && (
        <PasteSheetModal
          c={c}
          sourceLabel={sourceLabel}
          onClose={() => setPasteOpen(false)}
          onApply={(parsed) => {
            applySheet(parsed, {});
            setPasteOpen(false);
          }}
        />
      )}
    </>
  );
}

/** 成長 1 件。上がった幅を数字で見せる（細い線のアイコンには頼らない） */
function GrowthLine({ g }: { g: GrowthRecord }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <StatChange
        label={<b className="font-semibold text-base-content">{g.skill}</b>}
        before={g.from}
        after={g.to}
        showZero
      />
      {g.note && <span className="text-xs text-ink2">{g.note}</span>}
    </span>
  );
}

/** そのセッションでの続く値（SAN など）の増減と成長をまとめて1行に並べる */
function Changes({
  s,
  sysStats,
  growth,
}: {
  s: SessionStat;
  sysStats: { key: string; label: string }[];
  growth: GrowthRecord[];
}) {
  const deltas = Object.entries(s.delta).flatMap(([k, d]) => {
    const def = sysStats.find((x) => x.key === k);
    return def ? [{ k, label: def.label, ...d }] : [];
  });
  if (deltas.length === 0 && growth.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {deltas.map((d) => (
        <StatChange
          key={d.k}
          label={<b className="font-semibold text-base-content">{d.label}</b>}
          before={d.before}
          after={d.after}
          showZero
        />
      ))}
      {growth.map((g) => (
        <GrowthLine key={g.id} g={g} />
      ))}
    </div>
  );
}

/** 貼り付けで取り込んだキャラクターの更新（いあきゃらなど URL から読めないサイト） */
function PasteSheetModal({
  c,
  sourceLabel,
  onClose,
  onApply,
}: {
  c: Character;
  sourceLabel: string;
  onClose: () => void;
  onApply: (parsed: ParsedCharacter) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  function apply() {
    const hit = importCharactersFromText(text)[0];
    if (!hit) {
      setError("キャラクターを読み取れませんでした。コピーした内容をそのまま貼り付けてください。");
      return;
    }
    onApply(hit.character);
  }
  return (
    <Modal
      title={`${c.name}を更新`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={apply}>
            更新する
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">
        {sourceLabel}
        のキャラシで「ココフォリア駒出力」を押し、コピーした内容を貼り付けてください。ひとこと紹介・タグ・セッションの記録はそのまま残ります。
      </p>
      <Field label="ココフォリア駒出力">
        <textarea
          className="textarea textarea-bordered w-full font-mono text-sm"
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
      </Field>
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
    </Modal>
  );
}

interface EditCharFormValues {
  name: string;
  archetype: string;
  bio: string;
  tags: string;
  externalUrl: string;
  stats: Record<string, number>;
}

/**
 * 編集。キャラシと結び付いたキャラクターは、名前・職業・能力値をキャラシが正とするので入力欄を出さず、
 * 卓譜だけの項目（ひとこと紹介・タグ）とキャラシの URL だけを直す。
 */
function EditCharModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  const linked = isSheetLinked(c);
  const sheetUrl = sheetUrlOf(c);
  const carried = carriedStats(sys);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EditCharFormValues>({
    mode: "onChange",
    defaultValues: {
      name: c.name,
      archetype: c.archetype,
      bio: c.bio,
      tags: c.tags.join(", "),
      externalUrl: c.externalSync?.url ?? "",
      stats: { ...c.stats },
    },
  });

  function onSubmit(values: EditCharFormValues) {
    const trimmedUrl = values.externalUrl.trim();
    const parsedUrl = trimmedUrl ? parseExternalUrl(trimmedUrl) : null;
    update((s) => {
      const ch = s.characters[c.id];
      if (!linked) {
        ch.name = values.name.trim();
        ch.archetype = values.archetype.trim();
        for (const st of carried) {
          const v = values.stats[st.key];
          if (typeof v === "number" && Number.isFinite(v)) ch.stats[st.key] = v;
        }
      }
      ch.bio = values.bio.trim();
      ch.tags = values.tags
        .split(/[,、]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (!trimmedUrl) {
        delete ch.externalSync;
      } else if (parsedUrl?.ok && parsedUrl.kind === "character") {
        const same = ch.externalSync?.url === parsedUrl.displayUrl;
        /* URL を変えたら次に開いたときに読み直す（最終更新を消す） */
        ch.externalSync = {
          provider: parsedUrl.provider,
          url: parsedUrl.displayUrl,
          lastSyncedAt: same ? ch.externalSync?.lastSyncedAt : undefined,
          contentHash: same ? ch.externalSync?.contentHash : undefined,
          autoSync: true,
        };
      }
    });
    onClose();
  }

  return (
    <Modal
      title="キャラクターを編集"
      onClose={onClose}
      wide
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
            保存
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        {linked ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-300 pb-4">
            <p className="min-w-0 flex-1 text-sm leading-relaxed">
              名前・職業・能力値・技能は{sheetSourceLabel(c)}
              の内容です。直すときはキャラシ側で直してから、このページで「更新」を押してください。
            </p>
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                <IconExternal width={16} height={16} aria-hidden /> キャラシで編集
              </a>
            )}
          </div>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="名前" noMargin>
              <input
                className={cx("input input-bordered w-full", errors.name && "input-error")}
                aria-invalid={errors.name ? "true" : undefined}
                {...register("name", {
                  validate: (v) => v.trim().length > 0 || "名前を入力してください",
                })}
              />
              {errors.name?.message && (
                <p role="alert" className="mt-1 text-xs text-error">
                  {errors.name.message}
                </p>
              )}
            </Field>
            <div className="mt-4 sm:mt-0">
              <Field label="職業など" noMargin>
                <input className="input input-bordered w-full" {...register("archetype")} />
              </Field>
            </div>
          </div>
        )}
        <Field label="ひとこと紹介">
          <textarea className="textarea textarea-bordered w-full text-sm" {...register("bio")} />
        </Field>
        <Field label="タグ（カンマ区切り）">
          <input className="input input-bordered w-full" {...register("tags")} />
        </Field>
        {!linked && carried.length > 0 && (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {carried.map((st) => (
              <Field key={st.key} label={`${st.label}${st.max ? `（最大${st.max}）` : ""}`}>
                <NumberInput className="w-full" {...register(`stats.${st.key}`, { valueAsNumber: true })} />
              </Field>
            ))}
          </div>
        )}
        <Field
          label="キャラシの URL"
          hint="キャラエノ・キャラッシュ・キャラクター保管所・ゆとシートⅡ。結び付けると名前や能力値はキャラシの内容になります"
        >
          <input
            type="url"
            inputMode="url"
            className={cx("input input-bordered w-full", errors.externalUrl && "input-error")}
            placeholder="https://charaeno.com/7th/…"
            {...register("externalUrl", {
              validate: (v) => {
                const t = v.trim();
                if (!t) return true;
                const parsed = parseExternalUrl(t);
                if (!parsed.ok) return parsed.error;
                if (parsed.kind !== "character") return "キャラクターシートの URL を指定してください。";
                return true;
              },
            })}
          />
          {errors.externalUrl?.message && (
            <p role="alert" className="mt-1 text-xs text-error">
              {errors.externalUrl.message}
            </p>
          )}
        </Field>
        <p className="mt-4 text-sm text-ink2">
          システム: <SysBadge sys={sys} />
        </p>
      </form>
    </Modal>
  );
}

function ShareCharModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  const url = `${location.origin}/share/c/${c.id}`;
  const set = (key: keyof Character["share"], value: boolean) =>
    update((s) => {
      (s.characters[c.id].share as unknown as Record<string, boolean>)[key] = value;
    });
  const parts: [keyof Character["share"], string][] = [
    ["includeProfile", "プロフィール（職業・紹介・タグ）"],
    [
      "includeStats",
      c.sheet
        ? "キャラシ（能力値・技能）と現在の値"
        : `現在の${
            carriedStats(sys)
              .map((x) => x.label)
              .join("・") || "能力値"
          }`,
    ],
    ["includeSessions", "参加したセッション"],
    ["includeGrowth", `${sys?.growthLabel ?? "成長"}の履歴`],
  ];
  return (
    <Modal
      title={`${c.name}を共有`}
      onClose={onClose}
      foot={
        <>
          {c.share.enabled && (
            <Link className="btn" to={`/share/c/${c.id}`}>
              共有ページを見る
            </Link>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            完了
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <b className="block text-sm">リンクを知っている人に公開</b>
          <p className="mt-0.5 text-sm text-ink2">
            {c.share.enabled
              ? "このリンクを知っている人は、下で選んだ内容を見られます。"
              : "オフのあいだは、あなた以外は見られません。"}
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary mt-0.5"
          aria-label="リンクを知っている人に公開"
          checked={c.share.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
      </div>
      {c.share.enabled && (
        <>
          <div className="mt-4">
            <CopyBox text={url} />
          </div>
          <fieldset className="mt-5">
            <legend className="eyebrow mb-1">共有ページに載せる内容</legend>
            <div className="list">
              {parts.map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 py-2.5">
                  <span className="grow text-sm">{label}</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={c.share[key] as boolean}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </Modal>
  );
}

interface AddGrowthFormValues {
  logId: string;
  skill: string;
  custom: string;
  gFrom: number;
  gTo: number;
  gDate: string;
  gNote: string;
}

function AddGrowthModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  const recent = [...c.sessions].sort((a, b) => b.date.localeCompare(a.date));
  const {
    register,
    control,
    getValues,
    setValue,
    trigger,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<AddGrowthFormValues>({
    mode: "onChange",
    defaultValues: {
      logId: recent[0]?.logId ?? "",
      skill: sys.skills[0] ?? "__custom__",
      custom: "",
      gFrom: 0,
      gTo: 0,
      gDate: recent[0]?.date ?? todayStr(),
      gNote: "",
    },
  });

  const skill = useWatch({ control, name: "skill" });

  function onSubmit(values: AddGrowthFormValues) {
    const skillName = values.skill === "__custom__" ? values.custom : values.skill;
    update((s) => {
      s.characters[c.id].growth.push({
        id: "g_" + uid(),
        date: values.gDate || todayStr(),
        logId: values.logId || undefined,
        skill: skillName.trim(),
        from: values.gFrom,
        to: values.gTo,
        note: values.gNote.trim() || undefined,
      });
    });
    onClose();
  }

  return (
    <Modal
      title={`${sys.growthLabel}を記録`}
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
            記録
          </button>
        </>
      }
    >
      <p className="text-sm text-ink2 flex items-start gap-1.5">
        <IconHistory width={16} height={16} className="mt-0.5 shrink-0" aria-hidden /> {sys.growthNote}
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        {recent.length > 0 && (
          <Field label="どのセッションのあとか">
            <Controller
              name="logId"
              control={control}
              render={({ field }) => (
                <Select
                  ariaLabel="どのセッションのあとか"
                  className="w-full"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    const hit = recent.find((r) => r.logId === v);
                    if (hit) setValue("gDate", hit.date);
                  }}
                  options={[
                    ...recent.map((r) => ({ value: r.logId, label: `${fmtDateShort(r.date)} ${r.title}` })),
                    { value: "", label: "セッションに紐付けない" },
                  ]}
                />
              )}
            />
          </Field>
        )}
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="技能 / 能力">
            <Controller
              name="skill"
              control={control}
              render={({ field }) => (
                <Select
                  ariaLabel="技能 / 能力"
                  className="w-full"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    void trigger("custom");
                  }}
                  options={[
                    ...sys.skills.map((s) => ({ value: s, label: s })),
                    { value: "__custom__", label: "自由入力…" },
                  ]}
                />
              )}
            />
          </Field>
          <Field label={skill === "__custom__" ? "技能名（自由入力）" : "補足"}>
            {skill === "__custom__" ? (
              <>
                <input
                  className={cx("input input-bordered w-full", errors.custom && "input-error")}
                  aria-invalid={errors.custom ? "true" : undefined}
                  placeholder="例: 銃構築"
                  {...register("custom", {
                    validate: (v) =>
                      getValues("skill") !== "__custom__" ||
                      v.trim().length > 0 ||
                      "技能名を入力してください",
                  })}
                />
                {errors.custom?.message && (
                  <p role="alert" className="text-xs text-error mt-1">
                    {errors.custom.message}
                  </p>
                )}
              </>
            ) : (
              <input
                className="input input-bordered w-full"
                placeholder="例: クリティカルの余韻で"
                {...register("gNote")}
              />
            )}
          </Field>
        </div>
        {skill === "__custom__" && (
          <Field label="補足">
            <input className="input input-bordered w-full" {...register("gNote")} />
          </Field>
        )}
        <div className="grid sm:grid-cols-3 gap-x-4">
          <Field label="前の値">
            <NumberInput
              className="w-full"
              {...register("gFrom", {
                valueAsNumber: true,
                onChange: () => {
                  void trigger("gTo");
                },
              })}
            />
          </Field>
          <Field label="新しい値">
            <NumberInput
              className="w-full"
              invalid={Boolean(errors.gTo)}
              {...register("gTo", {
                valueAsNumber: true,
                validate: (v) =>
                  (!Number.isNaN(v) && v > getValues("gFrom")) || "前の値より大きい数値を入力してください",
              })}
            />
            {errors.gTo?.message && (
              <p role="alert" className="text-xs text-error mt-1">
                {errors.gTo.message}
              </p>
            )}
          </Field>
          <Field label="日付">
            <DateInput className="w-full" {...register("gDate")} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
