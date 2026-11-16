import { useMemo } from "react";
import type { Log, Msg, State } from "../types";
import { fmtDate, jstTime, sessionDay } from "../lib/time";
import { cx, Tag } from "./ui";
import { IconDice, IconFileText, IconCalendarTime } from "./icons";

/* ---------- 発言者カラー解決 ---------- */
export function makeColorOf(state: State) {
  const userByName = new Map(Object.values(state.users).map((u) => [u.name, u.color]));
  const charByName = new Map(Object.values(state.characters).map((c) => [c.name, c.color]));
  return (sp: string, kind: Msg["kind"]) => {
    if (kind === "KP" || kind === "GM") return "#555b6e";
    return charByName.get(sp) ?? userByName.get(sp) ?? "#8d8578";
  };
}

const KIND_BADGE: Record<string, string> = {
  KP: "badge-neutral",
  GM: "badge-neutral",
  PC: "badge-primary badge-outline",
  NPC: "badge-warning badge-outline",
  PL: "badge-ghost",
  SYSTEM: "badge-ghost",
};

const RESULT_BADGE = (r: string) =>
  /クリティカル/.test(r) ? "badge-success" : /ファンブル/.test(r) ? "badge-error" : /スペシャル/.test(r) ? "badge-primary" : /SAN/.test(r) ? "badge-info" : "badge-ghost";

/* ---------- 1行 ---------- */
function TextLine({ m, color, chName }: { m: Msg; color: string; chName?: string }) {
  return (
    <div className="msg">
      <div className="who">
        <span className="truncate" style={{ color }}>{m.sp}</span>
        <span className="kind">{m.kind}</span>
      </div>
      <div className="body">
        {m.text}
        {chName && <span className="text-[10px] text-base-content/35 ml-1.5">#{chName}</span>}
      </div>
      <span className="time">{jstTime(m.ts)}</span>
    </div>
  );
}

function RollLine({ m, chName }: { m: Msg; chName?: string }) {
  const r = m.roll!;
  return (
    <div className="rollrow">
      <IconDice width={15} height={15} className="opacity-50 flex-none" />
      <span className="cmd">{r.cmd}</span>
      <span className="dice">{r.dice}</span>
      <Tag v="gray" className={cx("!badge-sm", RESULT_BADGE(r.result))}>{r.result}</Tag>
      <span className="ml-auto text-[10.5px] text-ink2 flex-none">{m.sp}{chName && ` · #${chName}`} · {jstTime(m.ts)}</span>
    </div>
  );
}

function NoteLine({ m, chName }: { m: Msg; chName?: string }) {
  return (
    <div className="noterow">
      <IconFileText width={14} height={14} className="opacity-40 flex-none mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-[11px] text-ink2 mr-1.5">本文</span>
        {m.text}
        <span className="text-[10.5px] text-ink2 ml-1.5">{jstTime(m.ts)}{chName && ` · #${chName}`}</span>
      </div>
    </div>
  );
}

/* ---------- 統合タイムライン ---------- */
export interface TimelineFilter {
  query: string;
  channel: string; // "all" | channel id
}

export function SessionTimeline({
  log,
  state,
  mode,
  filter,
}: {
  log: Log;
  state: State;
  mode: "own" | "share";
  filter: TimelineFilter;
}) {
  const colorOf = makeColorOf(state);

  const rows = useMemo(() => {
    let msgs: { m: Msg; chName?: string }[] = [];
    log.channels.forEach((c) => {
      if (mode === "share" && c.secret) return; // シークレットタブは共有に含まれない
      if (filter.channel !== "all" && c.id !== filter.channel) return;
      c.msgs.forEach((m) => {
        if (mode === "share" && m.type === "note") return; // シナリオ本文は共有しない
        const q = filter.query.trim().toLowerCase();
        if (q && !((m.text ?? "").toLowerCase().includes(q) || m.sp.toLowerCase().includes(q) || (m.roll?.cmd ?? "").toLowerCase().includes(q))) return;
        msgs.push({ m, chName: c.secret ? `${c.name}(シークレット)` : c.name !== "メイン" ? c.name : undefined });
      });
    });
    return msgs.sort((a, b) => a.m.ts - b.m.ts);
  }, [log, mode, filter]);

  if (rows.length === 0) {
    return <div className="text-[12px] text-ink2 py-6 text-center">表示できる行がありません</div>;
  }

  /* 日付区切り（6:00区切りの sessionDay）を挟む */
  const out: JSX.Element[] = [];
  let lastDay = "";
  rows.forEach(({ m, chName }) => {
    const d = sessionDay(m.ts);
    if (d !== lastDay) {
      out.push(
        <div key={`d-${d}`} className="daysep">
          <span className="text-[11px] font-bold text-ink2 flex items-center gap-1.5"><IconCalendarTime width={13} height={13} /> {fmtDate(d)}</span>
        </div>
      );
      lastDay = d;
    }
    out.push(
      m.type === "roll" ? <RollLine key={m.id} m={m} chName={chName} /> : m.type === "note" ? <NoteLine key={m.id} m={m} chName={chName} /> : <TextLine key={m.id} m={m} color={colorOf(m.sp, m.kind)} chName={chName} />
    );
  });

  return <div>{out}</div>;
}
