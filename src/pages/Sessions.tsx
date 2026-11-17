import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { IconPlus, IconSearch, IconUpload } from "../components/icons";
import { DateBlock, EmptyState, PageHead, Select, SysBadge } from "../components/ui";
import { AvatarStack } from "../components/identity";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { fmtDur, sessionPlayMinutes, todayStr } from "../lib/time";
import { sessionsOfMe, useStore } from "../store";
import type { Log } from "../types";

/** 参加キャラクター（いなければPL）を顔アイコンの重なりと名前で示す */
function Cast({ log, showKp }: { log: Log; showKp: boolean }) {
  const { state } = useStore();
  const kp = state.users[log.ownerId];
  const people = Object.entries(log.players)
    .filter(([uid]) => uid !== log.ownerId && state.users[uid])
    .map(([uid, p]) => {
      const char = p.characterIds[0] ? state.characters[p.characterIds[0]] : undefined;
      return char ? ({ kind: "char", char } as const) : ({ kind: "user", user: state.users[uid]! } as const);
    });
  const names = people.map((p) => (p.kind === "char" ? p.char.name : p.user.name));
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2.5 text-sm text-ink2">
      <AvatarStack people={people} />
      <span className="min-w-0 truncate">
        {names.join("、")}
        {showKp && kp && (
          <span className="text-ink3">
            {names.length ? "　" : ""}進行 {kp.name}
          </span>
        )}
      </span>
    </div>
  );
}

export function SessionRow({
  log,
  href,
  showKp = true,
  showMonth = true,
  context,
}: {
  log: Log;
  href: string;
  showKp?: boolean;
  /** 月見出しの下に並べるときは月を省く */
  showMonth?: boolean;
  /** 卓・シナリオのページに並べるときは、その名前を各行で繰り返さない */
  context?: "table" | "scenario";
}) {
  const { state } = useStore();
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const tb = log.tableId ? state.tables[log.tableId] : null;
  const sys = SYSTEMS[log.systemId];
  const playMin = sessionPlayMinutes(log);
  const showScenario = sc && context !== "scenario" && !log.title.includes(sc.title);

  return (
    <Link to={href as never} className="row-interactive flex items-start gap-4 px-4 py-4 sm:px-5">
      <DateBlock date={log.dates[0] ?? "2026-01-01"} days={log.dates.length} showMonth={showMonth} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-bold leading-snug">{log.title}</h3>
        <div className="meta mt-1 text-xs sm:text-sm">
          <SysBadge sys={sys} />
          {showScenario && <span className="truncate max-w-48">{sc.title}</span>}
          {tb && context !== "table" && <span className="truncate max-w-40">{tb.name}</span>}
          {playMin > 0 && <span className="tabular-nums">{fmtDur(playMin)}</span>}
        </div>
        <Cast log={log} showKp={showKp} />
      </div>
    </Link>
  );
}

export default function Sessions() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");

  const myLogs = useMemo(() => sessionsOfMe(state), [state]);
  const usedSystems = useMemo(() => new Set(myLogs.map((l) => l.systemId)), [myLogs]);

  const logs = useMemo(() => {
    let list = [...myLogs];
    if (sys !== "all") list = list.filter((l) => l.systemId === sys);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((l) => {
        const sc = l.scenarioId ? state.scenarios[l.scenarioId]?.title : "";
        const tb = l.tableId ? state.tables[l.tableId]?.name : "";
        return [l.title, sc, tb].some((t) => t?.toLowerCase().includes(needle));
      });
    }
    return list.sort((a, b) => b.t0 - a.t0);
  }, [myLogs, q, sys, state.scenarios, state.tables]);

  /** 年月ごとにまとめて、長い一覧でも時期で探せるようにする */
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Log[] }[] = [];
    const thisYear = Number(todayStr().slice(0, 4));
    for (const l of logs) {
      const [y, m] = (l.dates[0] ?? "2026-01-01").split("-").map(Number);
      const key = `${y}-${m}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: y === thisYear ? `${m}月` : `${y}年${m}月`, items: [] };
        out.push(g);
      }
      g.items.push(l);
    }
    return out;
  }, [logs]);

  const sysOptions = useMemo(
    () => [
      { value: "all", label: "すべてのシステム" },
      ...SYSTEM_LIST.filter((s) => usedSystems.has(s.id)).map((s) => ({ value: s.id, label: s.name })),
    ],
    [usedSystems],
  );

  if (myLogs.length === 0) {
    return (
      <>
        <PageHead title="セッション" />
        <div className="surface">
          <EmptyState
            kind="first"
            title="最初のセッションを記録しましょう"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn btn-primary" onClick={() => nav({ to: "/upload" as never })}>
                  <IconUpload width={16} height={16} /> ログを取り込む
                </button>
                <button className="btn" onClick={() => nav({ to: "/upload?manual=1" as never })}>
                  <IconPlus width={16} height={16} /> 日時と参加者だけ記録
                </button>
              </div>
            }
          >
            CCFOLIA・Udonarium・テキストのログに対応しています。ログがなくても記録は残せます。
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="セッション" />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <label className="input flex flex-1 items-center gap-2">
          <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
          <input
            type="search"
            className="min-w-0 grow"
            placeholder="タイトル・シナリオ・卓で検索"
            aria-label="セッションを検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {sysOptions.length > 2 && (
          <Select
            ariaLabel="システムで絞り込み"
            value={sys}
            options={sysOptions}
            onChange={setSys}
            className="sm:w-60"
          />
        )}
      </div>

      {logs.length === 0 ? (
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
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="eyebrow mb-2 px-1">{g.label}</h2>
              <div className="surface list">
                {g.items.map((l) => (
                  <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} showMonth={false} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
