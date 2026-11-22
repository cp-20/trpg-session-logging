/**
 * Discord 連携の部品。サーバーの API（/api/discord/*、src/lib/discord/client.ts）だけを通し、ボットの秘密には触れない。
 *
 * - DiscordAccountRow: 設定の「Discord」の行（つなぐ・外す）
 * - TableDiscordPanel: 卓の画面のメンバー欄の下（つないだチャンネル・ボットの追加）
 * - DiscordChannelLink: `/卓譜 つなぐ` が出したリンク（/tables/discord?code=…）で卓を選ぶ
 * - DiscordSync: 卓譜で日程調整・予定を変えたら、つないだチャンネルに映す（画面には何も出さない）
 * - useTableDiscord: 記録の完了で「Discord に投稿」を出すか
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParam } from "../lib/router";
import { canConfirmPoll } from "../lib/schedule";
import {
  discordClient,
  oauthOutcomeMessage,
  type DiscordAccountView,
  type TableDiscordView,
} from "../lib/discord/client";
import { useStore } from "../store";
import type { State, Table, TableEvent } from "../types";
import { IconDiscord } from "./icons";
import { ProviderIcon } from "./identity";
import {
  Combobox,
  CompletionModal,
  EmptyState,
  FormRow,
  InlineNotice,
  PageHead,
  Seal,
  SettingRow,
  TableMark,
} from "./ui";

/* ================= 設定: Discord の行 ================= */

export function DiscordAccountRow() {
  const { authUser } = useStore();
  const outcome = useSearchParam("discord");
  const [account, setAccount] = useState<DiscordAccountView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => oauthOutcomeMessage(outcome));

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    void discordClient.account().then((r) => {
      if (!alive) return;
      // 連携の準備ができていない（503）ときは「未連携」として出し、つなぐ操作だけ止める
      setAccount(r.ok ? r.account : null);
    });
    return () => {
      alive = false;
    };
  }, [authUser]);

  async function connect() {
    setBusy(true);
    setError(null);
    const r = await discordClient.startAccountLink();
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const r = await discordClient.unlinkAccount();
    if (r.ok) setAccount(null);
    else setError(r.error);
    setBusy(false);
  }

  const name = account ? account.globalName || account.username : null;
  return (
    <>
      <SettingRow
        icon={<ProviderIcon provider="discord" size={28} />}
        title="Discord"
        desc={
          !authUser
            ? "サンプルでは未連携"
            : account === undefined
              ? "確かめています…"
              : account
                ? `${name}${account.globalName ? `（${account.username}）` : ""}`
                : "連携していません"
        }
      >
        {authUser && account !== undefined && (
          <button className="btn btn-sm" disabled={busy} onClick={account ? disconnect : connect}>
            {busy ? "接続中…" : account ? "連携を解除" : "連携する"}
          </button>
        )}
      </SettingRow>
      {error && (
        <p className="px-4 pb-3 text-sm text-error sm:px-5" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/* ================= 卓: つないだチャンネル ================= */

function useTableStatus(table: Table | undefined, sendCurrent: boolean) {
  const { authUser } = useStore();
  const [status, setStatus] = useState<TableDiscordView | null>(null);
  const memberKey = table?.memberIds.join(",") ?? "";
  useEffect(() => {
    if (!authUser || !table) return;
    let alive = true;
    void discordClient
      .tableStatus(
        table.id,
        // 卓を作った人の画面からだけ、メンバーと卓名を Discord 側に写す（日程調整に回答できる人を決める）
        sendCurrent && table.ownerId === authUser.uid
          ? { memberIds: table.memberIds, tableName: table.name }
          : undefined,
      )
      .then((r) => {
        if (alive) setStatus(r.ok ? r : null);
      });
    return () => {
      alive = false;
    };
    // メンバーと卓名が変わったときだけ問い合わせ直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, table?.id, table?.name, memberKey, sendCurrent]);
  return [status, setStatus] as const;
}

/** 記録の完了などで、この卓が Discord とつながっているか（つながっていなければ null） */
export function useTableDiscord(tableId: string | undefined): TableDiscordView | null {
  const { state } = useStore();
  const [status] = useTableStatus(tableId ? state.tables[tableId] : undefined, false);
  return status?.linked ? status : null;
}

export function TableDiscordPanel({ table }: { table: Table }) {
  const { state } = useStore();
  const [status, setStatus] = useTableStatus(table, true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = table.ownerId === state.me;
  if (!status || (!status.linked && !isOwner)) return null;

  async function unlink() {
    setBusy(true);
    setError(null);
    const r = await discordClient.unlinkTable(table.id);
    if (r.ok) setStatus({ ...status!, linked: false });
    else setError(r.error);
    setBusy(false);
  }

  return (
    <div className="border-t border-base-300 px-4 py-4 sm:px-5" aria-label="Discord" role="group">
      <div className="eyebrow mb-2">Discord</div>
      {status.linked ? (
        <div className="flex items-center gap-3">
          <ProviderIcon provider="discord" size={28} />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm">#{status.channelName}</b>
            {(status.guildName || status.voiceChannelName) && (
              <p className="meta text-sm text-ink2">
                {status.guildName && <span className="truncate">{status.guildName}</span>}
                {status.voiceChannelName && (
                  <span className="truncate">ボイス: {status.voiceChannelName}</span>
                )}
              </p>
            )}
          </div>
          {isOwner && (
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={unlink}>
              解除
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-ink2">
            チャンネルで /卓譜 つなぐ を送ると、日程調整と予定がそこにも届きます。
          </p>
          <a className="btn btn-sm mt-2" href={status.installUrl} target="_blank" rel="noreferrer">
            <IconDiscord width={16} height={16} aria-hidden /> ボットを追加
          </a>
        </>
      )}
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ================= /tables/discord?code=…: チャンネルと卓をつなぐ ================= */

type Preview = { channelName: string; guildName?: string; voiceChannelName?: string };

export function DiscordChannelLink() {
  const { state, authUser } = useStore();
  const nav = useNavigate();
  const code = useSearchParam("code") ?? "";
  const owned = useMemo(
    () => Object.values(state.tables).filter((t) => t.ownerId === state.me),
    [state.tables, state.me],
  );
  const [fetched, setPreview] = useState<Preview | null | undefined>(undefined);
  const preview = !authUser || !code ? null : fetched;
  const [tableId, setTableId] = useState<string>(() => (owned.length === 1 ? owned[0]!.id : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<Table | null>(null);

  useEffect(() => {
    if (!authUser || !code) return;
    let alive = true;
    void discordClient.previewCode(code).then((r) => {
      if (alive) setPreview(r.ok ? r : null);
    });
    return () => {
      alive = false;
    };
  }, [authUser, code]);

  async function link() {
    const table = owned.find((t) => t.id === tableId);
    if (!table) return;
    setBusy(true);
    setError(null);
    const r = await discordClient.linkTable(code, table);
    setBusy(false);
    if (r.ok) setLinked(state.tables[tableId] ?? null);
    else setError(r.error);
  }

  const head = <PageHead back={{ to: "/tables", label: "卓" }} title="Discord のチャンネルとつなぐ" />;
  if (!authUser)
    return (
      <div className="max-w-3xl">
        {head}
        <div className="surface">
          <EmptyState kind="permission" title="ログインしてから開いてください" />
        </div>
      </div>
    );
  if (preview === undefined)
    return (
      <div className="max-w-3xl">
        {head}
        <InlineNotice tone="pending" text="リンクを確かめています…" />
      </div>
    );
  if (!preview)
    return (
      <div className="max-w-3xl">
        {head}
        <div className="surface">
          <EmptyState kind="permission" title="リンクの期限が切れています">
            Discord でもう一度 /卓譜 つなぐ を送ってください。
          </EmptyState>
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl">
      <PageHead
        back={{ to: "/tables", label: "卓" }}
        title="Discord のチャンネルとつなぐ"
        lead={<ProviderIcon provider="discord" size={56} />}
        sub={
          <div className="meta">
            <span className="font-bold text-base-content">#{preview.channelName}</span>
            {preview.guildName && <span>{preview.guildName}</span>}
            {preview.voiceChannelName && <span>ボイス: {preview.voiceChannelName}</span>}
          </div>
        }
      />
      {owned.length === 0 ? (
        <div className="surface">
          <EmptyState
            title="自分が作った卓がありません"
            action={
              <Link className="btn" to="/tables">
                卓を開く
              </Link>
            }
          />
        </div>
      ) : (
        <div className="surface px-4 py-5 sm:px-5">
          <FormRow label="卓" htmlFor="discord-table">
            <Combobox
              id="discord-table"
              ariaLabel="つなぐ卓"
              placeholder="卓を選ぶ"
              value={tableId}
              onChange={setTableId}
              options={owned.map((t) => ({ value: t.id, label: t.name }))}
            />
          </FormRow>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={!tableId || busy} onClick={link}>
              {busy && <span className="loading loading-spinner loading-xs" aria-hidden />}
              つなぐ
            </button>
          </div>
        </div>
      )}
      {linked && (
        <CompletionModal
          title="チャンネルとつなぎました"
          stamp={<Seal />}
          onClose={() => nav({ to: `/tables/${linked.id}` })}
          primary={{ label: "卓を開く", to: `/tables/${linked.id}` }}
        >
          <p className="flex items-center justify-center gap-2 text-base font-bold text-base-content">
            <TableMark table={linked} size={24} />
            <span className="min-w-0 truncate">{linked.name}</span>
          </p>
          <p className="mt-1">#{preview.channelName}</p>
        </CompletionModal>
      )}
    </div>
  );
}

/* ================= 日程調整・予定を Discord に映す ================= */

/** その人の変更として Discord に映すものの印。ほかの人の変更（取り込み）では変わらないものだけを含める */
export function discordSyncSignature(ev: TableEvent, state: Pick<State, "me" | "tables">): string | null {
  if (!ev.tableId) return null;
  const manages = canConfirmPoll(ev, state);
  if (ev.status === "poll") {
    const mine = (ev.candidates ?? []).map((c) => [c.id, c.responses[state.me] ?? ""]);
    const def = manages
      ? [ev.title, ev.durationMin, (ev.candidates ?? []).map((c) => [c.id, c.date, c.startTime, c.endTime])]
      : null;
    return JSON.stringify(["poll", mine, def]);
  }
  // 確定した予定は、作った人か卓を作った人の変更だけを映す
  return manages
    ? JSON.stringify(["event", ev.title, ev.date, ev.startTime, ev.endTime, ev.durationMin ?? null])
    : JSON.stringify(["event-other"]);
}

/** 前の印と今の印から、呼ぶ API を決める（純粋関数。テストする） */
export function discordSyncPlan(
  prev: Map<string, { sig: string; ev: TableEvent; manages: boolean }>,
  events: Record<string, TableEvent>,
  state: Pick<State, "me" | "tables">,
): { polls: string[]; events: TableEvent[]; deleted: TableEvent[] } {
  const polls: string[] = [];
  const changed: TableEvent[] = [];
  const deleted: TableEvent[] = [];
  for (const ev of Object.values(events)) {
    const sig = discordSyncSignature(ev, state);
    const before = prev.get(ev.id);
    if (!sig || before?.sig === sig) continue;
    // 新しく現れた予定は、自分が作ったものだけ（ほかの人が作ったものの取り込みでは映さない）
    if (!before && ev.createdBy !== state.me) continue;
    if (ev.status === "poll") polls.push(ev.id);
    else if (canConfirmPoll(ev, state)) {
      if (before?.ev.status === "poll") polls.push(ev.id);
      changed.push(ev);
    }
  }
  for (const [id, before] of prev) {
    if (!events[id] && before.manages && before.ev.tableId) deleted.push(before.ev);
  }
  return { polls, events: changed, deleted };
}

/**
 * ログインしているとき、自分が日程調整に回答した・日程調整や予定を作った・変えた・消したら、
 * つないだチャンネルに映す。開いたときにあるものは映さない（変えたものだけ）
 */
export function DiscordSync() {
  const { state, authUser } = useStore();
  const seen = useRef<Map<string, { sig: string; ev: TableEvent; manages: boolean }> | null>(null);

  useEffect(() => {
    if (!authUser) return;
    const snapshot = () =>
      new Map(
        Object.values(state.events).flatMap((ev) => {
          const sig = discordSyncSignature(ev, state);
          return sig ? [[ev.id, { sig, ev, manages: canConfirmPoll(ev, state) }] as const] : [];
        }),
      );
    if (!seen.current) {
      seen.current = snapshot();
      return;
    }
    // 続けて変えたときは、落ち着いてから 1 回だけ（日程調整の共有文書の保存を待つ）
    const timer = window.setTimeout(() => {
      const plan = discordSyncPlan(seen.current!, state.events, state);
      seen.current = snapshot();
      for (const id of plan.polls) void discordClient.syncPoll(id);
      for (const ev of plan.events)
        void discordClient.syncEvent({
          eventId: ev.id,
          tableId: ev.tableId!,
          title: ev.title,
          date: ev.date,
          startTime: ev.startTime,
          endTime: ev.endTime,
          ...(ev.durationMin ? { durationMin: ev.durationMin } : {}),
        });
      for (const ev of plan.deleted)
        void discordClient.syncEvent({ eventId: ev.id, tableId: ev.tableId!, deleted: true });
    }, 2500);
    return () => window.clearTimeout(timer);
    // 予定が変わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, state.events]);

  return null;
}
