import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
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
import { EmptyState, Field, FieldError, Modal, NotFound, PageHead, SectionTitle, cx } from "../components/ui";
import { Avatar, AvatarStack, PlayerPicker } from "../components/identity";
import { unansweredCount } from "../lib/schedule";
import { fmtDate, todayStr, uid } from "../lib/time";
import { useStore } from "../store";
import type { Log, State, Table, TableEvent } from "../types";
import { EventDetailModal, EventRow } from "./Calendar";
import { SessionRow } from "./Sessions";

/** 卓詳細で検索欄を出すセッション数のしきい値 */
const SEARCH_THRESHOLD = 6;

function tableSessions(state: State, tableId: string): Log[] {
  return Object.values(state.logs)
    .filter((l) => l.tableId === tableId)
    .sort((a, b) => b.t0 - a.t0);
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
      <AvatarStack people={users.map((user) => ({ kind: "user", user }) as const)} size={24} max={6} />
      <span className="min-w-0 truncate">{users.map((u) => u.name).join("、")}</span>
    </span>
  );
}

export default function Tables() {
  const { state } = useStore();
  const [newTable, setNewTable] = useState(false);
  const today = todayStr();

  const tables = useMemo(() => {
    const mine = Object.values(state.tables).filter(
      (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
    );
    const lastPlayed = (t: Table) => tableSessions(state, t.id)[0]?.t0 ?? 0;
    const nextDate = (t: Table) => tableUpcoming(state, t.id, today)[0]?.date ?? "";
    // 次の予定がある卓を日付の近い順に、残りは最後に遊んだ順に
    return mine.sort((a, b) => {
      const na = nextDate(a);
      const nb = nextDate(b);
      if (na && nb) return na.localeCompare(nb);
      if (na || nb) return na ? -1 : 1;
      return lastPlayed(b) - lastPlayed(a);
    });
  }, [state, today]);

  return (
    <>
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
            const next = tableUpcoming(state, t.id, today)[0];
            return (
              <Link
                key={t.id}
                to={`/tables/${t.id}` as never}
                className="row-interactive flex items-center gap-4 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold leading-snug">{t.name}</h2>
                  <div className="mt-1.5">
                    <Members ids={t.memberIds} state={state} />
                  </div>
                  {(t.note || next) && (
                    <div className="meta mt-1.5">
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
    </>
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
}: {
  register: UseFormRegister<TableFormValues>;
  errors: FieldErrors<TableFormValues>;
  namePlaceholder?: string;
  notePlaceholder?: string;
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
      <Field label="いつ遊ぶか・メモ（任意）">
        <input className="input w-full" placeholder={notePlaceholder} {...register("note")} />
      </Field>
    </>
  );
}

function NewTableModal({ onClose }: { onClose: () => void }) {
  const { state, update } = useStore();
  const nav = useNavigate();
  const [members, setMembers] = useState<string[]>([]);
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
        memberIds: [s.me, ...members],
        note: values.note.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
    });
    onClose();
    nav({ to: `/tables/${id}` as never });
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
          notePlaceholder="例: 隔週土曜 21:00〜"
        />
        <Field label="メンバー" hint={`${state.users[state.me]?.name ?? "あなた"}は自動で入ります`}>
          <PlayerPicker state={state} selected={members} onChange={setMembers} exclude={[state.me]} />
        </Field>
      </form>
    </Modal>
  );
}

export function TableDetail() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const { state, update } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [openEvent, setOpenEvent] = useState<TableEvent | null>(null);
  const today = todayStr();

  const table = state.tables[id ?? ""];
  const sessions = useMemo(() => (table ? tableSessions(state, table.id) : []), [state, table]);
  const upcomingEvents = useMemo(
    () => (table ? tableUpcoming(state, table.id, today) : []),
    [state, table, today],
  );
  const polls = useMemo(() => (table ? tablePolls(state, table.id) : []), [state, table]);
  if (!table) return <NotFound what="卓" />;

  const isOwner = table.ownerId === state.me;
  const needle = q.trim().toLowerCase();
  const shown = needle ? sessions.filter((l) => l.title.toLowerCase().includes(needle)) : sessions;
  const recordHref = `/upload?table=${table.id}`;

  function addMember(uid2: string) {
    update((s) => {
      s.tables[table!.id]!.memberIds.push(uid2);
    });
  }
  function removeMember(uid2: string) {
    update((s) => {
      s.tables[table!.id]!.memberIds = s.tables[table!.id]!.memberIds.filter((m) => m !== uid2);
    });
  }

  return (
    <>
      <PageHead
        back={{ to: "/tables", label: "卓" }}
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
            <button className="btn btn-primary" onClick={() => nav({ to: recordHref as never })}>
              <IconPlus width={17} height={17} /> この卓で記録
            </button>
          </>
        }
      />

      <SectionTitle>次の予定</SectionTitle>
      <div className="surface list">
        {upcomingEvents.map((ev) => (
          <EventRow
            key={ev.id}
            ev={ev}
            state={state}
            showTable={false}
            onOpen={() => setOpenEvent(ev)}
            trailing={<RsvpTally ev={ev} />}
          />
        ))}
        {polls.map((ev) => {
          const waiting = unansweredCount(ev, state.me) > 0;
          return (
            <Link
              key={ev.id}
              to="/calendar"
              className="row-interactive flex items-center gap-3 px-4 py-3.5 text-sm sm:px-5"
            >
              <IconCalendarTime width={18} height={18} className="shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-ink2">日程調整中</span>{" "}
                <span className="font-semibold">{ev.title}</span>
              </span>
              <span className={cx("shrink-0", waiting ? "font-semibold text-warning" : "text-ink2")}>
                {waiting ? "返事する" : "カレンダーで見る"}
              </span>
              <IconChevronRight width={16} height={16} className="shrink-0 text-ink3" aria-hidden />
            </Link>
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
              <button className="btn btn-primary" onClick={() => nav({ to: recordHref as never })}>
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
            {shown.map((l) => (
              <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} context="table" />
            ))}
          </div>
        )}
      </div>

      <SectionTitle>メンバー</SectionTitle>
      <div className="surface">
        <ul className="list">
          {table.memberIds.map((m) => {
            const u = state.users[m];
            if (!u) return null;
            return (
              <li key={m} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Link
                  to={`/users/${u.id}` as never}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                >
                  <Avatar u={u} size={32} />
                  <span className="truncate font-semibold">{u.name}</span>
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

        {isOwner && (
          <div className="border-t border-base-300 px-4 py-4 sm:px-5">
            <div className="eyebrow mb-2">メンバーを追加</div>
            <div className="max-w-md">
              <PlayerPicker
                state={state}
                selected={[]}
                onChange={(ids) => ids.forEach(addMember)}
                exclude={table.memberIds}
                placeholder="名前で検索"
                quickLabel="ほかの卓で一緒に遊んだ人"
                quickIds={suggestMembers(state, table.id)}
              />
            </div>
          </div>
        )}
      </div>

      {editing && <EditTableModal table={table} onClose={() => setEditing(false)} />}
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
            nav({ to: `${recordHref}&scenario=${sc}` as never });
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
      <span className="font-semibold text-success">◯ {ok}</span>
      {maybe > 0 && <span>△ {maybe}</span>}
      {ng > 0 && <span>× {ng}</span>}
    </span>
  );
}

function suggestMembers(state: State, excludeTableId: string) {
  const mine = state.tables[excludeTableId]?.memberIds ?? [];
  const counts: Record<string, number> = {};
  Object.values(state.tables)
    .filter((t) => t.id !== excludeTableId)
    .forEach((t) => {
      const overlap = t.memberIds.filter((m) => mine.includes(m)).length;
      if (overlap > 0) {
        t.memberIds.filter((m) => !mine.includes(m)).forEach((m) => (counts[m] = (counts[m] ?? 0) + overlap));
      }
    });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);
}

function EditTableModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const { update } = useStore();
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
        <TableMetaFields register={register} errors={errors} />
      </form>
    </Modal>
  );
}
