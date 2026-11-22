import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link, useParams } from "../lib/router";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { useStore } from "../store";
import {
  CopyBox,
  EmptyState,
  Field,
  InlineNotice,
  LoadMore,
  Modal,
  NotFound,
  NumberInput,
  PageHead,
  SectionTitle,
  Combobox,
  MultiCombobox,
  SplitLayout,
  StatBar,
  StatChange,
  SysBadge,
  cx,
} from "../components/ui";
import { CharAvatar } from "../components/identity";
import { SheetView } from "../components/sheet";
import { SYSTEMS, carriedStats } from "../data/systems";
import { fmtDateShort, todayStr, uid } from "../lib/time";
import { userHref } from "../lib/people";
import {
  EXTERNAL_PROVIDER_LABELS,
  canFetchSheet,
  isSheetLinked,
  mergeExternalCharacterUpdate,
  shouldAutoSync,
  type StatChangeDiff,
} from "../lib/external-sync";
import {
  carriedDeltas,
  carriedValues,
  currentSkillValue,
  reassignGrowth,
  sessionsNewestFirst,
} from "../lib/character-growth";
import {
  applyLinkedEdit,
  applyManualEdit,
  validateSheetUrl,
  type CharacterOwnedEdit,
  type LinkedCharacterEdit,
  type ManualCharacterEdit,
} from "../lib/character-edit";
import { SHEET_PROVIDER_LABELS } from "../lib/sheet";
import { tagOptions } from "../lib/tags";
import type { Character, GrowthRecord, SessionStat } from "../types";
import { requestExternalSheet } from "./Characters";
import { IconExternal, IconPencil, IconRefresh, IconShare, IconPlus } from "../components/icons";

const CHAR_SESSION_PAGE_SIZE = 15;
const CHAR_SESSION_STEP = 20;

export default function CharacterDetail() {
  const { id } = useParams<{ id?: string }>();
  /* 別のキャラクターへ移ったら、表示件数・同期の結果・開いているダイアログを最初に戻す */
  return <CharacterDetailView key={id ?? ""} id={id} />;
}

type SyncSummary = {
  changed: boolean;
  /** 成長にならなかった変化（SAN の増減など） */
  diffs: StatChangeDiff[];
  profileChanges: string[];
  /** この同期で自動で残した成長 */
  growthIds: string[];
};

/** 取得元の名前（URL で結び付いていればそのサイト、そうでなければシートの取得元） */
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

/** セッションの選択肢（新しい順。「11/14 廃校の十三時間目」） */
function sessionOptions(sessions: SessionStat[]) {
  return sessions.map((r) => ({ value: r.logId, label: `${fmtDateShort(r.date)} ${r.title}` }));
}

function CharacterDetailView({ id }: { id: string | undefined }) {
  const { state, update } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);
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

  /** 読み込んだキャラシを反映する。卓譜の項目と記録は残し、上がった技能は成長として残す */
  const applySheet = useCallback(
    (
      incoming: Parameters<typeof mergeExternalCharacterUpdate>[1],
      meta: { url?: string; fetchedAt?: string; contentHash?: string },
    ) => {
      if (!c || !extSync) return;
      const syncedAt = meta.fetchedAt ?? new Date().toISOString();
      const merged = mergeExternalCharacterUpdate(c, incoming, {
        url: meta.url ?? extSync.url,
        provider: extSync.provider,
        syncedAt,
        contentHash: meta.contentHash,
      });
      const next = merged.next;
      if (next.sheet && !next.sheet.url && sheetUrlOf(c)) next.sheet = { ...next.sheet, url: sheetUrlOf(c) };
      update((s) => {
        if (s.characters[c.id]) s.characters[c.id] = next;
      });
      setSyncError(null);
      const grown = new Set(merged.growth.map((g) => g.skill));
      setSyncSummary({
        changed: merged.changed,
        diffs: merged.statChanges.filter((d) => !grown.has(d.label)),
        profileChanges: merged.profileChanges,
        growthIds: merged.growth.map((g) => g.id),
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

  const sessions = useMemo(() => (c ? sessionsNewestFirst(c) : []), [c]);
  const growthByLogId = useMemo(() => {
    const map = new Map<string, GrowthRecord[]>();
    if (!c) return map;
    for (const g of c.growth) {
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
  const shownSessions = sessions.slice(0, visibleCount);
  const linked = isSheetLinked(c);
  const sheetUrl = sheetUrlOf(c);
  const sourceLabel = sheetSourceLabel(c);
  const growthLabel = sys?.growthLabel ?? "成長";

  /* 卓をまたいで続く値（SAN など）だけ。続かない値は出さない（P3） */
  const carried = carriedValues(c);
  const hasAside = carried.length > 0 || coCharEntries.length > 0;
  /* 成長を手で記録するのはキャラシのないキャラクターだけ。キャラシのあるものは同期で残る */
  const canAddGrowth = isMine && !linked && sessions.length > 0;
  const syncedGrowth = syncSummary ? c.growth.filter((g) => syncSummary.growthIds.includes(g.id)) : [];

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
      <div className="space-y-3">
        {syncedGrowth.length > 0 && (
          <SyncedGrowth
            c={c}
            growth={syncedGrowth}
            growthLabel={growthLabel}
            sessions={sessions}
            onSession={(session) =>
              update((s) => {
                const target = s.characters[c.id];
                if (target) reassignGrowth(target, syncSummary.growthIds, session);
              })
            }
          />
        )}
        {(syncSummary.diffs.length > 0 || syncSummary.profileChanges.length > 0) && (
          <p role="status" className="text-sm text-ink2 tabular-nums">
            {[
              ...syncSummary.diffs.map((d) => `${d.label} ${d.from}→${d.to}`),
              ...syncSummary.profileChanges.map((p) => `${p}が変わりました`),
            ].join("・")}
          </p>
        )}
      </div>
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
            {isMine && fetchable && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={syncing}
                aria-busy={syncing || undefined}
                onClick={syncExternal}
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
          <EmptyState kind="first" title="キャラシの内容はまだありません" />
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
          right={
            canAddGrowth ? (
              <button className="btn btn-sm" onClick={() => setGrowthOpen(true)}>
                <IconPlus width={16} height={16} /> {growthLabel}を記録
              </button>
            ) : undefined
          }
        >
          これまでのセッション
        </SectionTitle>
        {sessions.length === 0 ? (
          <div className="surface">
            <EmptyState kind="first" title="まだセッションに参加していません" />
          </div>
        ) : (
          <>
            <ol className="surface tl">
              {shownSessions.map((s) => {
                const log = state.logs[s.logId];
                const glist = growthByLogId.get(s.logId) ?? [];
                const year = s.date.slice(0, 4);
                const body = (
                  <>
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
                    <Changes s={s} systemId={c.systemId} growth={glist} />
                    {s.memo.trim() && (
                      <p data-user-content className="mt-1.5 text-sm leading-relaxed text-ink2">
                        {s.memo}
                      </p>
                    )}
                    {!log && <p className="mt-1 text-xs text-ink3">記録は削除されています</p>}
                  </>
                );
                return (
                  <li key={s.logId} className="tlitem">
                    {log ? (
                      <Link to={`/sessions/${s.logId}`} className="tlrow row-interactive group">
                        {body}
                      </Link>
                    ) : (
                      <div className="tlrow">{body}</div>
                    )}
                  </li>
                );
              })}
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
        <dl aria-label={carried.map((st) => st.label).join("・")} className="surface space-y-3.5 p-4 sm:p-5">
          {carried.map((st) => (
            <StatBar key={st.key} label={st.label} value={st.value} max={st.max} />
          ))}
        </dl>
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
              <Link to={userHref(owner)} className="link-hover">
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

      {editOpen &&
        (linked ? (
          <EditLinkedCharModal key={c.id} c={c} onClose={() => setEditOpen(false)} />
        ) : (
          <EditManualCharModal key={c.id} c={c} onClose={() => setEditOpen(false)} />
        ))}
      {shareOpen && <ShareCharModal key={c.id} c={c} onClose={() => setShareOpen(false)} />}
      {growthOpen && canAddGrowth && (
        <AddGrowthModal key={c.id} c={c} sessions={sessions} onClose={() => setGrowthOpen(false)} />
      )}
    </>
  );
}

/**
 * 同期で自動で残した成長。どのセッションのあとかだけを選び直せる（既定は前の同期のあとに遊んだうち最新）
 */
function SyncedGrowth({
  c,
  growth,
  growthLabel,
  sessions,
  onSession,
}: {
  c: Character;
  growth: GrowthRecord[];
  growthLabel: string;
  sessions: SessionStat[];
  onSession: (session: SessionStat) => void;
}) {
  const logId = growth[0]?.logId ?? "";
  return (
    <div role="status" className="surface motion-enter p-4 sm:p-5">
      <b className="block text-sm">{growthLabel}を記録しました</b>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {growth.map((g) => (
          <GrowthLine key={g.id} g={g} />
        ))}
      </div>
      {sessions.length > 1 && (
        <div className="mt-3 max-w-sm">
          <Combobox
            ariaLabel={`${c.name}の${growthLabel}のセッション`}
            size="sm"
            className="w-full"
            value={logId}
            onChange={(v) => {
              const hit = sessions.find((s) => s.logId === v);
              if (hit) onSession(hit);
            }}
            options={sessionOptions(sessions)}
          />
        </div>
      )}
    </div>
  );
}

/** 成長 1 件。上がった幅を数字で見せる（細い線のアイコンには頼らない） */
function GrowthLine({ g }: { g: GrowthRecord }) {
  return (
    <StatChange
      label={<b className="font-semibold text-base-content">{g.skill}</b>}
      before={g.from}
      after={g.to}
      showZero
    />
  );
}

/** そのセッションでの続く値（SAN など）の増減と成長をまとめて1行に並べる */
function Changes({ s, systemId, growth }: { s: SessionStat; systemId: string; growth: GrowthRecord[] }) {
  const deltas = carriedDeltas(systemId, s.delta);
  if (deltas.length === 0 && growth.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {deltas.map((d) => (
        <StatChange
          key={d.key}
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

function useTagSuggestions() {
  const { state } = useStore();
  // 候補は自分のキャラクターに付けたタグ
  return useMemo(
    () => tagOptions(Object.values(state.characters).filter((x) => x.ownerId === state.me)),
    [state.characters, state.me],
  );
}

/** 卓譜だけが持つ項目（ひとこと紹介・タグ・キャラシの URL）の入力欄。2 つの編集フォームで共通の項目だけを触る */
function OwnedFields({ form }: { form: UseFormReturn<CharacterOwnedEdit> }) {
  const tagSuggestions = useTagSuggestions();
  const urlError = form.formState.errors.sheetUrl?.message;
  return (
    <>
      <Field label="ひとこと紹介">
        <textarea className="textarea textarea-bordered w-full text-sm" {...form.register("bio")} />
      </Field>
      <Field label="タグ">
        <Controller
          name="tags"
          control={form.control}
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
      <Field label="キャラシの URL">
        <input
          type="url"
          inputMode="url"
          className={cx("input input-bordered w-full", urlError && "input-error")}
          placeholder="https://charaeno.com/7th/…"
          {...form.register("sheetUrl", { validate: validateSheetUrl })}
        />
        {urlError && (
          <p role="alert" className="mt-1 text-xs text-error">
            {urlError}
          </p>
        )}
      </Field>
    </>
  );
}

/** どちらの編集フォームも卓譜だけが持つ項目を同じ名前で持つので、その部分だけを見せる */
function ownedPart<T extends CharacterOwnedEdit>(form: UseFormReturn<T>): UseFormReturn<CharacterOwnedEdit> {
  return form as unknown as UseFormReturn<CharacterOwnedEdit>;
}

function EditFoot({
  onClose,
  onSave,
  disabled,
}: {
  onClose: () => void;
  onSave: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={onClose}>
        キャンセル
      </button>
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={onSave}>
        保存
      </button>
    </>
  );
}

/**
 * キャラシと結び付いたキャラクターの編集。名前・職業・能力値・技能はキャラシが持つので入力欄を置かず（P3）、
 * キャラシで直す入口だけを置く。直せるのは卓譜だけが持つ項目と URL
 */
function EditLinkedCharModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sheetUrl = sheetUrlOf(c);
  const form = useForm<LinkedCharacterEdit>({
    mode: "onChange",
    defaultValues: { bio: c.bio, tags: [...c.tags], sheetUrl: c.externalSync?.url ?? "" },
  });
  const {
    handleSubmit,
    formState: { isValid },
  } = form;

  function onSubmit(values: LinkedCharacterEdit) {
    update((s) => {
      const ch = s.characters[c.id];
      if (ch) applyLinkedEdit(ch, values);
    });
    onClose();
  }

  return (
    <Modal
      title="キャラクターを編集"
      onClose={onClose}
      wide
      foot={<EditFoot onClose={onClose} onSave={handleSubmit(onSubmit)} disabled={!isValid} />}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        {sheetUrl && (
          <a href={sheetUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
            <IconExternal width={16} height={16} aria-hidden /> 名前・能力値を{sheetSourceLabel(c)}で直す
          </a>
        )}
        <OwnedFields form={ownedPart(form)} />
      </form>
    </Modal>
  );
}

/** キャラシのないキャラクターの編集。名前・職業・続く値（SAN など）も直せる */
function EditManualCharModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const carried = carriedStats(SYSTEMS[c.systemId]);
  const form = useForm<ManualCharacterEdit>({
    mode: "onChange",
    defaultValues: {
      name: c.name,
      archetype: c.archetype,
      bio: c.bio,
      tags: [...c.tags],
      sheetUrl: c.externalSync?.url ?? "",
      stats: { ...c.stats },
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = form;

  function onSubmit(values: ManualCharacterEdit) {
    update((s) => {
      const ch = s.characters[c.id];
      if (ch)
        applyManualEdit(
          ch,
          values,
          carried.map((st) => st.key),
        );
    });
    onClose();
  }

  return (
    <Modal
      title="キャラクターを編集"
      onClose={onClose}
      wide
      foot={<EditFoot onClose={onClose} onSave={handleSubmit(onSubmit)} disabled={!isValid} />}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
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
        {carried.length > 0 && (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {carried.map((st) => (
              <Field key={st.key} label={st.label}>
                <NumberInput
                  className="w-full"
                  min={0}
                  max={st.max}
                  {...register(`stats.${st.key}`, { valueAsNumber: true })}
                />
              </Field>
            ))}
          </div>
        )}
        <OwnedFields form={ownedPart(form)} />
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
  const statsLabel =
    [...(c.sheet ? ["キャラシ"] : []), ...carriedStats(sys).map((x) => x.label)].join("・") || "能力値";
  const parts: [keyof Character["share"], string][] = [
    ["includeProfile", "プロフィール（職業・紹介・タグ）"],
    ["includeStats", statsLabel],
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
      <label className="flex cursor-pointer items-center gap-4">
        <b className="min-w-0 flex-1 text-sm">リンクを知っている人に公開</b>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={c.share.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
      </label>
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
  /** 今の値が分からない技能のときだけ尋ねる */
  from: number;
  to: number;
}

/**
 * キャラシのないキャラクターの成長を手で記録する。尋ねるのはセッション・技能・新しい値だけで、
 * 前の値は分かる範囲で埋め（前に記録した値）、日付はそのセッションの日付にする（P2）
 */
function AddGrowthModal({
  c,
  sessions,
  onClose,
}: {
  c: Character;
  sessions: SessionStat[];
  onClose: () => void;
}) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  // 前に記録した技能（新しい順）を先頭に出す。システムの技能表にないものもここから選び直せる
  const recentSkills = [...new Set([...c.growth].reverse().map((g) => g.skill))].slice(0, 5);
  const [extraSkills, setExtraSkills] = useState<string[]>([]);
  const skillOptions = [...new Set([...(sys?.skills ?? []), ...recentSkills, ...extraSkills])].map(
    (name) => ({ value: name, label: name }),
  );
  const {
    register,
    control,
    getValues,
    trigger,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<AddGrowthFormValues>({
    mode: "onChange",
    defaultValues: {
      logId: sessions[0]?.logId ?? "",
      skill: recentSkills[0] ?? sys?.skills[0] ?? "",
      from: Number.NaN,
      to: Number.NaN,
    },
  });
  const skill = useWatch({ control, name: "skill" });
  const known = skill ? currentSkillValue(c, skill) : undefined;
  const fromOf = () => known ?? getValues("from");

  function onSubmit(values: AddGrowthFormValues) {
    const session = sessions.find((s) => s.logId === values.logId);
    if (!session) return;
    update((s) => {
      s.characters[c.id].growth.push({
        id: "g_" + uid(),
        logId: session.logId,
        date: session.date,
        skill: values.skill.trim(),
        from: known ?? values.from,
        to: values.to,
      });
    });
    onClose();
  }

  return (
    <Modal
      title={`${sys?.growthLabel ?? "成長"}を記録`}
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <Field label="セッション" noMargin>
          <Controller
            name="logId"
            control={control}
            rules={{ validate: (v) => sessions.some((s) => s.logId === v) }}
            render={({ field }) => (
              <Combobox
                ariaLabel="セッション"
                className="w-full"
                value={field.value}
                onChange={field.onChange}
                options={sessionOptions(sessions)}
              />
            )}
          />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="技能">
            <Controller
              name="skill"
              control={control}
              rules={{ validate: (v) => v.trim().length > 0 || "技能を選んでください" }}
              render={({ field, fieldState }) => (
                <>
                  <Combobox
                    ariaLabel="技能"
                    className="w-full"
                    value={field.value}
                    placeholder="技能を探す"
                    options={skillOptions}
                    pinned={recentSkills}
                    pinnedLabel="前に記録した技能"
                    onChange={(v) => {
                      field.onChange(v);
                      void trigger("to");
                    }}
                    onCreate={(name) => {
                      setExtraSkills((xs) => [...xs, name]);
                      field.onChange(name);
                    }}
                    invalid={Boolean(fieldState.error)}
                  />
                  {fieldState.error?.message && (
                    <p role="alert" className="mt-1 text-xs text-error">
                      {fieldState.error.message}
                    </p>
                  )}
                </>
              )}
            />
          </Field>
          <Field label="値" group>
            <div className="flex items-center gap-2">
              {known != null ? (
                <span className="w-12 shrink-0 text-right text-base tabular-nums text-ink2">{known}</span>
              ) : (
                <NumberInput
                  aria-label="前の値"
                  className="min-w-0 flex-1"
                  {...register("from", {
                    valueAsNumber: true,
                    validate: (v) => known != null || !Number.isNaN(v),
                    onChange: () => void trigger("to"),
                  })}
                />
              )}
              <span aria-hidden className="text-ink2">
                →
              </span>
              <NumberInput
                aria-label="新しい値"
                className="min-w-0 flex-1"
                invalid={Boolean(errors.to)}
                {...register("to", {
                  valueAsNumber: true,
                  validate: (v) => {
                    const from = fromOf();
                    if (Number.isNaN(v)) return false;
                    return Number.isNaN(from) || v > from || `${from} より大きい値にしてください`;
                  },
                })}
              />
            </div>
            {errors.to?.message && (
              <p role="alert" className="mt-1 text-xs text-error">
                {errors.to.message}
              </p>
            )}
          </Field>
        </div>
      </form>
    </Modal>
  );
}
