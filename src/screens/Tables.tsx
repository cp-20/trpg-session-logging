import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "../lib/router";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";
import {
  IconCalendarTime,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconSearch,
  IconUpload,
  IconX,
} from "../components/icons";
import {
  EmptyState,
  Field,
  FieldError,
  LoadMore,
  Modal,
  NotFound,
  PageHead,
  SectionTitle,
  Seg,
  SplitLayout,
  TableMark,
  CopyBox,
  cx,
  useVisibleCount,
} from "../components/ui";
import { Avatar, AvatarStack, ImageUploadField, UserName } from "../components/identity";
import {
  INVITE_EXPIRY_OPTIONS,
  inviteExpiresAt,
  inviteUrl,
  isInviteOpen,
  mergeTableJoins,
  newInviteToken,
  userHref,
  type InviteExpiry,
} from "../lib/people";
import { unansweredCount } from "../lib/schedule";
import { fmtDate, jstDate, todayStr, uid, sessionStart } from "../lib/time";
import { useStore } from "../store";
import type { Log, State, Table, TableEvent } from "../types";
import { EventDetailModal, EventRow, PollDetailModal } from "./Calendar";
import { TableDiscordPanel } from "../components/discord";

/** `/卓譜 つなぐ` のリンク（/tables/discord?code=…）で、Discord のチャンネルと卓をつなぐ */
export { DiscordChannelLink as TableDiscordLink } from "../components/discord";
import { SessionRow } from "./Sessions";
import { sessionTitle } from "../lib/session-scenario";

/** 卓詳細で検索欄を出すセッション数のしきい値 */
const SEARCH_THRESHOLD = 6;

function tableSessions(state: State, tableId: string): Log[] {
  return Object.values(state.logs)
    .filter((l) => l.tableId === tableId)
    .sort((a, b) => sessionStart(b) - sessionStart(a));
}

function tableUpcoming(state: State, tableId: string, today: string): TableEvent[] {
  return Object.values(state.events ?? {})
    .filter((ev) => ev.status !== "poll" && ev.tableId === tableId && ev.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function tablePolls(state: State, tableId: string): TableEvent[] {
  return Object.values(state.events ?? {}).filter((ev) => ev.status === "poll" && ev.tableId === tableId);
}

/** 卓のメンバー（顔の重なり＋名前）。卓は作成者よりメンバーが大事なので、名前を全員分並べる */
function Members({ ids, state }: { ids: string[]; state: State }) {
  const users = ids.map((id) => state.users[id]).filter((u): u is NonNullable<typeof u> => Boolean(u));
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-sm text-ink2">
      <AvatarStack people={users.map((user) => ({ kind: "user", user }) as const)} size={26} max={6} />
      <span className="min-w-0 truncate">{users.map((u) => u.name).join("、")}</span>
    </span>
  );
}

export default function Tables() {
  const { state } = useStore();
  const [newTable, setNewTable] = useState(false);
  const today = todayStr();

  const { tables, nextEventByTable } = useMemo(() => {
    const nextMap = new Map<string, TableEvent>();
    for (const ev of Object.values(state.events ?? {})) {
      if (ev.status === "poll" || !ev.tableId || ev.date < today) continue;
      const prev = nextMap.get(ev.tableId);
      if (!prev || ev.date < prev.date || (ev.date === prev.date && ev.startTime < prev.startTime)) {
        nextMap.set(ev.tableId, ev);
      }
    }
    const lastMap = new Map<string, number>();
    for (const l of Object.values(state.logs)) {
      if (!l.tableId) continue;
      const prev = lastMap.get(l.tableId) ?? 0;
      if (sessionStart(l) > prev) lastMap.set(l.tableId, sessionStart(l));
    }
    const mine = Object.values(state.tables).filter(
      (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
    );
    // 次の予定がある卓を日付の近い順に、残りは最後に遊んだ順に
    mine.sort((a, b) => {
      const na = nextMap.get(a.id)?.date ?? "";
      const nb = nextMap.get(b.id)?.date ?? "";
      if (na && nb) return na.localeCompare(nb);
      if (na || nb) return na ? -1 : 1;
      return (lastMap.get(b.id) ?? 0) - (lastMap.get(a.id) ?? 0);
    });
    return { tables: mine, nextEventByTable: nextMap };
  }, [state.tables, state.events, state.logs, state.me, today]);

  return (
    <div>
      <PageHead
        title="卓"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setNewTable(true)}>
            <IconPlus width={17} height={17} /> 卓を作成
          </button>
        }
      />

      {tables.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind="first"
            title="いつものメンバーで卓を作りましょう"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setNewTable(true)}>
                <IconPlus width={16} height={16} /> 卓を作成
              </button>
            }
          >
            いつものメンバーを卓にまとめておくと、記録と次の予定がメンバーに共有されます。
          </EmptyState>
        </div>
      ) : (
        <div className="surface list">
          {tables.map((t) => {
            const next = nextEventByTable.get(t.id);
            return (
              <Link
                key={t.id}
                to={`/tables/${t.id}`}
                className="group row-interactive flex items-center gap-4 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold leading-snug transition-colors group-hover:text-primary">
                    {t.name}
                  </h2>
                  <div className="mt-1.5">
                    <Members ids={t.memberIds} state={state} />
                  </div>
                  {(t.note || next) && (
                    <div className="meta mt-1.5 text-xs sm:text-sm">
                      {t.note && <span className="min-w-0 truncate">{t.note}</span>}
                      {next && (
                        <span className="min-w-0 truncate text-base-content">
                          <span className="font-semibold text-primary">次回</span>{" "}
                          <span className="tabular-nums">
                            {fmtDate(next.date)} {next.startTime}
                          </span>{" "}
                          {next.title}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <IconChevronRight width={18} height={18} className="shrink-0 text-ink3" aria-hidden />
              </Link>
            );
          })}
        </div>
      )}

      {newTable && <NewTableModal onClose={() => setNewTable(false)} />}
    </div>
  );
}

interface TableFormValues {
  name: string;
  note: string;
}

function TableMetaFields({
  register,
  errors,
  namePlaceholder,
  notePlaceholder,
  includeNote = true,
}: {
  register: UseFormRegister<TableFormValues>;
  errors: FieldErrors<TableFormValues>;
  namePlaceholder?: string;
  notePlaceholder?: string;
  includeNote?: boolean;
}) {
  return (
    <>
      <Field label="卓名" noMargin>
        <input
          className={cx("input w-full", errors.name && "input-error")}
          placeholder={namePlaceholder}
          aria-invalid={errors.name ? "true" : undefined}
          {...register("name", {
            validate: (v) => v.trim().length > 0 || "卓名を入力してください",
          })}
        />
        <FieldError text={errors.name?.message} />
      </Field>
      {includeNote && (
        <Field label="メモ（任意）">
          <input className="input w-full" placeholder={notePlaceholder} {...register("note")} />
        </Field>
      )}
    </>
  );
}

function NewTableModal({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const nav = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TableFormValues>({
    mode: "onChange",
    defaultValues: { name: "", note: "" },
  });

  function onSubmit(values: TableFormValues) {
    const id = `t_${uid()}`;
    update((s) => {
      s.tables[id] = {
        id,
        name: values.name.trim(),
        ownerId: s.me,
        // ほかのメンバーは、卓を作ったあとの招待リンクで加わってもらう（名前で人を探させない。P14）
        memberIds: [s.me],
        createdAt: new Date().toISOString(),
      };
    });
    onClose();
    nav({ to: `/tables/${id}` });
  }

  return (
    <Modal
      title="新しい卓を作る"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit(onSubmit)}>
            作成する
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <TableMetaFields
          register={register}
          errors={errors}
          namePlaceholder="例: 廃校部"
          includeNote={false}
        />
      </form>
    </Modal>
  );
}

const SESSION_PAGE_SIZE = 15;
const SESSION_STEP = 20;

export function TableDetail() {
  const { id } = useParams<{ id?: string }>();
  const { state, update } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [openEvent, setOpenEvent] = useState<TableEvent | null>(null);
  const [pollTarget, setPollTarget] = useState<{ id: string; mode: "view" | "answer" } | null>(null);
  const [visibleCount, setVisibleCount] = useVisibleCount(SESSION_PAGE_SIZE, [id, q]);
  const today = todayStr();

  const table = state.tables[id ?? ""];
  const sessions = useMemo(() => (table ? tableSessions(state, table.id) : []), [state, table]);
  const upcomingEvents = useMemo(
    () => (table ? tableUpcoming(state, table.id, today) : []),
    [state, table, today],
  );
  const polls = useMemo(() => (table ? tablePolls(state, table.id) : []), [state, table]);
  const openPoll = useMemo(
    () => (pollTarget ? (polls.find((ev) => ev.id === pollTarget.id) ?? null) : null),
    [pollTarget, polls],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? sessions.filter((l) => sessionTitle(l, state.scenarios).toLowerCase().includes(needle))
      : sessions;
  }, [sessions, q]);
  if (!table) return <NotFound what="卓" />;

  const isOwner = table.ownerId === state.me;
  const shownList = shown.slice(0, visibleCount);
  const recordHref = `/upload?table=${table.id}`;

  function removeMember(uid2: string) {
    update((s) => {
      s.tables[table!.id]!.memberIds = s.tables[table!.id]!.memberIds.filter((m) => m !== uid2);
    });
  }

  const mainCol = (
    <div className="space-y-8">
      <section aria-label="次の予定">
        <SectionTitle>次の予定</SectionTitle>
        <div className="surface list">
          {upcomingEvents.map((ev) => (
            <EventRow
              key={ev.id}
              ev={ev}
              state={state}
              showTable={false}
              onOpen={() => setOpenEvent(ev)}
              metaRight={<RsvpTally ev={ev} />}
            />
          ))}
          {polls.map((ev) => {
            const waiting = unansweredCount(ev, state.me) > 0;
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => setPollTarget({ id: ev.id, mode: "view" })}
                className="row-interactive flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm sm:px-5"
              >
                <IconCalendarTime width={18} height={18} className="shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-ink2">日程調整中</span>{" "}
                  <span className="font-semibold">{ev.title}</span>
                </span>
                <span className={cx("shrink-0", waiting ? "font-semibold text-primary" : "text-ink2")}>
                  {waiting ? "返事待ち" : "回答済み"}
                </span>
                <IconChevronRight width={16} height={16} className="shrink-0 text-ink3" aria-hidden />
              </button>
            );
          })}
          {upcomingEvents.length === 0 && polls.length === 0 && (
            <div className="flex flex-col items-start gap-3 px-4 py-4 text-sm text-ink2 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span>決まっている予定はありません。</span>
              <Link to="/calendar" className="btn btn-sm">
                <IconCalendarTime width={15} height={15} /> 予定を立てる
              </Link>
            </div>
          )}
        </div>
      </section>

      <section aria-label="セッション">
        <SectionTitle
          right={
            sessions.length >= SEARCH_THRESHOLD ? (
              <label className="input input-sm flex w-40 items-center gap-1.5 sm:w-52">
                <IconSearch width={14} height={14} className="shrink-0 opacity-50" aria-hidden />
                <input
                  type="search"
                  className="min-w-0 grow"
                  placeholder="この卓で検索"
                  aria-label="この卓のセッションを検索"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
            ) : undefined
          }
        >
          セッション
        </SectionTitle>
        <div className="surface">
          {sessions.length === 0 ? (
            <EmptyState
              kind="first"
              title="この卓の記録はまだありません"
              action={
                <button className="btn" onClick={() => nav({ to: recordHref })}>
                  <IconUpload width={16} height={16} /> セッションを記録
                </button>
              }
            />
          ) : shown.length === 0 ? (
            <EmptyState
              kind="filtered"
              action={
                <button className="btn btn-sm" onClick={() => setQ("")}>
                  検索を解除
                </button>
              }
            />
          ) : (
            <div className="list">
              {shownList.map((l) => (
                <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} context="table" />
              ))}
            </div>
          )}
        </div>
        <LoadMore
          shown={shownList.length}
          total={shown.length}
          step={SESSION_STEP}
          onMore={() => setVisibleCount((n) => n + SESSION_STEP)}
        />
      </section>
    </div>
  );

  const asideCol = (
    <section aria-label="メンバー">
      <SectionTitle>メンバー</SectionTitle>
      <div className="surface">
        <ul className="list">
          {table.memberIds.map((m) => {
            const u = state.users[m];
            if (!u) return null;
            return (
              <li key={m} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Link to={userHref(u)} className="group/member flex min-w-0 flex-1 items-center gap-3">
                  <Avatar u={u} size={32} />
                  <UserName u={u} className="flex min-w-0 items-baseline group-hover/member:underline" />
                </Link>
                {isOwner && m !== table.ownerId && (
                  <button
                    type="button"
                    className="icon-btn -mr-2"
                    aria-label={`${u.name}をメンバーから外す`}
                    onClick={() => removeMember(m)}
                  >
                    <IconX width={16} height={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && <TableInvitePanel table={table} />}
        <TableDiscordPanel table={table} />
      </div>
    </section>
  );

  return (
    <>
      <PageHead
        back={{ to: "/tables", label: "卓" }}
        lead={<TableMark table={table} size={56} />}
        title={table.name}
        sub={
          <div className="flex flex-col gap-1.5">
            <Members ids={table.memberIds} state={state} />
            {table.note && <span>{table.note}</span>}
          </div>
        }
        actions={
          <>
            <button className="btn" onClick={() => setEditing(true)}>
              <IconPencil width={16} height={16} /> 編集
            </button>
            <button className="btn btn-primary" onClick={() => nav({ to: recordHref })}>
              <IconPlus width={17} height={17} /> この卓で記録
            </button>
          </>
        }
      />

      <SplitLayout asideWidth="sm" stickyAside main={mainCol} aside={asideCol} />

      {editing && <EditTableModal table={table} onClose={() => setEditing(false)} />}
      {openPoll && (
        <PollDetailModal
          key={openPoll.id}
          event={openPoll}
          state={state}
          initialMode={pollTarget?.mode}
          inTable
          onClose={() => setPollTarget(null)}
        />
      )}
      {openEvent && (
        <EventDetailModal
          event={openEvent}
          table={table}
          scenario={openEvent.scenarioId ? state.scenarios[openEvent.scenarioId] : undefined}
          today={today}
          onClose={() => setOpenEvent(null)}
          onRecordSession={() => {
            const sc = openEvent.scenarioId ?? "";
            setOpenEvent(null);
            nav({ to: `${recordHref}&scenario=${sc}` });
          }}
        />
      )}
    </>
  );
}

/** 予定への出欠の集計（◯ の人数だけを主に見せる） */
function RsvpTally({ ev }: { ev: TableEvent }) {
  const vals = Object.values(ev.responses);
  const ok = vals.filter((v) => v === "ok").length;
  const maybe = vals.filter((v) => v === "maybe").length;
  const ng = vals.filter((v) => v === "ng").length;
  if (vals.length === 0) return null;
  return (
    <span
      className="hidden shrink-0 gap-2 text-xs text-ink2 tabular-nums sm:flex"
      aria-label={`参加可 ${ok}人、未定 ${maybe}人、不可 ${ng}人`}
    >
      <span className="font-semibold text-base-content">◯ {ok}</span>
      {maybe > 0 && <span>△ {maybe}</span>}
      {ng > 0 && <span>× {ng}</span>}
    </span>
  );
}

function EditTableModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const { update } = useStore();
  const [image, setImage] = useState(table.image ?? "");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TableFormValues>({
    mode: "onChange",
    defaultValues: { name: table.name, note: table.note ?? "" },
  });

  function onSubmit(values: TableFormValues) {
    update((s) => {
      const t = s.tables[table.id]!;
      t.name = values.name.trim();
      t.note = values.note.trim() || undefined;
      t.image = image || undefined;
    });
    onClose();
  }

  return (
    <Modal
      title="卓を編集"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit(onSubmit)}>
            保存
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <ImageUploadField
            value={image}
            onChange={setImage}
            label="卓の画像"
            render={(src) => <TableMark table={{ id: table.id, image: src || undefined }} size={56} />}
          />
        </div>
        <TableMetaFields
          register={register}
          errors={errors}
          notePlaceholder="例: キャンペーンの概要や連絡事項"
        />
      </form>
    </Modal>
  );
}

/**
 * 卓の招待リンク（作った人だけ）。名前で人を探して足す代わりに、リンクを渡した人に加わってもらう（P14）。
 * 卓ごとに有効なリンクは 1 つ。ログインしているときは、加わった人をここで取り込む
 */
function TableInvitePanel({ table }: { table: Table }) {
  const { state, update, authUser } = useStore();
  const [expiry, setExpiry] = useState<InviteExpiry>("7d");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invite = isInviteOpen(table.invite) ? table.invite : undefined;
  const token = invite?.token;

  // 招待から加わった人を、卓のメンバーに入れる
  useEffect(() => {
    if (!authUser || !token) return;
    let alive = true;
    void (async () => {
      try {
        const cloud = await import("../lib/cloud-people");
        const joined = await cloud.fetchTableJoins(token);
        if (!alive || joined.length === 0) return;
        let changed = false;
        update((s) => {
          changed = mergeTableJoins(s, table.id, joined);
        });
        if (changed) {
          // 招待を開いた人に見せる顔ぶれも今に合わせる（失敗しても招待は使える）
          void cloud
            .refreshTableInviteMembers(token, table, {
              ...state.users,
              ...Object.fromEntries(joined.map((u) => [u.id, u])),
            })
            .catch(() => {});
        }
      } catch {
        /* 次に開いたときにまた取り込む */
      }
    })();
    return () => {
      alive = false;
    };
    // 卓を開いたとき・リンクを替えたときだけ取り込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, token, table.id]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const cloud = authUser ? await import("../lib/cloud-people") : null;
      const next = {
        token: newInviteToken(),
        createdAt: new Date().toISOString(),
        expiresAt: inviteExpiresAt(expiry),
      };
      if (cloud) {
        // 古いリンクを止められなければ、新しいリンクも作らない（古いリンクが知らないうちに生き残らないように）
        if (table.invite) await cloud.revokeTableInvite(table.invite.token);
        await cloud.publishTableInvite(next.token, table, state.users, state.me, next.expiresAt);
      }
      update((s) => {
        s.tables[table.id]!.invite = next;
      });
    } catch {
      setError("招待リンクを作れませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      if (authUser) await (await import("../lib/cloud-people")).revokeTableInvite(invite.token);
      update((s) => {
        delete s.tables[table.id]!.invite;
      });
    } catch {
      setError("招待リンクを無効にできませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-base-300 px-4 py-4 sm:px-5" aria-label="メンバーを招待" role="group">
      <div className="eyebrow mb-2">メンバーを招待</div>
      {invite ? (
        <>
          <CopyBox text={inviteUrl(typeof location === "undefined" ? "" : location.origin, invite.token)} />
          <p className="mt-2 text-sm text-ink2">
            {invite.expiresAt
              ? `${fmtDate(jstDate(Math.floor(Date.parse(invite.expiresAt) / 1000)))}まで有効`
              : "無期限"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={create}>
              作り直す
            </button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={revoke}>
              無効にする
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Seg<InviteExpiry>
            size="sm"
            ariaLabel="招待リンクの期限"
            value={expiry}
            onChange={setExpiry}
            options={INVITE_EXPIRY_OPTIONS.map((o) => ({ v: o.value, label: o.label }))}
          />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={create}>
            {busy && <span className="loading loading-spinner loading-xs" aria-hidden />}
            招待リンクを作る
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
