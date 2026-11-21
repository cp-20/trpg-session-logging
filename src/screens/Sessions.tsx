import { memo, useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate } from "../lib/router";
import { IconPlus, IconSearch, IconUpload } from "../components/icons";
import {
  DateBlock,
  EmptyState,
  LoadMore,
  PageHead,
  Seg,
  Select,
  SysBadge,
  useVisibleCount,
} from "../components/ui";
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
            {names.length ? "　" : ""}GM {kp.name}
          </span>
        )}
      </span>
    </div>
  );
}

export const SessionRow = memo(function SessionRow({
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
    <Link to={href} className="group row-interactive flex items-start gap-4 px-4 py-4 sm:px-5">
      <DateBlock date={log.dates[0] ?? "2026-01-01"} days={log.dates.length} showMonth={showMonth} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-bold leading-snug transition-colors group-hover:text-primary">
          {log.title}
        </h3>
        <div className="meta mt-1 text-xs sm:text-sm">
          <SysBadge sys={sys} />
          {showScenario && <span className="max-w-48 truncate">{sc.title}</span>}
          {tb && context !== "table" && <span className="max-w-40 truncate">{tb.name}</span>}
          {playMin > 0 && <span className="tabular-nums">{fmtDur(playMin)}</span>}
        </div>
        <Cast log={log} showKp={showKp} />
      </div>
    </Link>
  );
});

type RoleFilter = "all" | "kp" | "pl";

const PAGE_SIZE = 30;

export default function Sessions() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [sys, setSys] = useState("all");
  const [tableFilter, setTableFilter] = useState("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [visibleCount, setVisibleCount] = useVisibleCount(PAGE_SIZE, [deferredQ, sys, tableFilter, role]);

  const myLogs = useMemo(() => sessionsOfMe(state), [state]);
  const usedSystems = useMemo(() => new Set(myLogs.map((l) => l.systemId)), [myLogs]);
  const usedTableIds = useMemo(
    () => new Set(myLogs.map((l) => l.tableId).filter((id): id is string => Boolean(id && state.tables[id]))),
    [myLogs, state.tables],
  );
  const hasKpLogs = useMemo(() => myLogs.some((l) => l.ownerId === state.me), [myLogs, state.me]);
  const hasPlLogs = useMemo(() => myLogs.some((l) => l.ownerId !== state.me), [myLogs, state.me]);

  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of myLogs) {
      const sc = l.scenarioId ? (state.scenarios[l.scenarioId]?.title ?? "") : "";
      const tb = l.tableId ? (state.tables[l.tableId]?.name ?? "") : "";
      const kpName = state.users[l.ownerId]?.name ?? "";
      const parts = [l.title, sc, tb, kpName];
      for (const [uid, p] of Object.entries(l.players)) {
        if (state.users[uid]?.name) parts.push(state.users[uid]!.name);
        for (const cid of p.characterIds) {
          if (state.characters[cid]?.name) parts.push(state.characters[cid]!.name);
        }
      }
      map.set(l.id, parts.join("\0").toLowerCase());
    }
    return map;
  }, [myLogs, state.scenarios, state.tables, state.users, state.characters]);

  const logs = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    const list = myLogs.filter((l) => {
      if (role === "kp" && l.ownerId !== state.me) return false;
      if (role === "pl" && l.ownerId === state.me) return false;
      if (sys !== "all" && l.systemId !== sys) return false;
      if (tableFilter !== "all" && l.tableId !== tableFilter) return false;
      if (needle && !(searchIndex.get(l.id) ?? "").includes(needle)) return false;
      return true;
    });
    return list.sort((a, b) => b.t0 - a.t0);
  }, [myLogs, deferredQ, sys, tableFilter, role, state.me, searchIndex]);

  const shownLogs = useMemo(() => logs.slice(0, visibleCount), [logs, visibleCount]);

  /** 年月ごとにまとめて、長い一覧でも時期で探せるようにする */
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Log[] }[] = [];
    const thisYear = Number(todayStr().slice(0, 4));
    for (const l of shownLogs) {
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
  }, [shownLogs]);

  const sysOptions = useMemo(
    () => [
      { value: "all", label: "すべてのシステム" },
      ...SYSTEM_LIST.filter((s) => usedSystems.has(s.id)).map((s) => ({ value: s.id, label: s.name })),
    ],
    [usedSystems],
  );
  const tableOptions = useMemo(
    () => [
      { value: "all", label: "すべての卓" },
      ...[...usedTableIds]
        .map((id) => state.tables[id]!)
        .sort((a, b) => a.name.localeCompare(b.name, "ja"))
        .map((t) => ({ value: t.id, label: t.name })),
    ],
    [usedTableIds, state.tables],
  );

  if (myLogs.length === 0) {
    return (
      <div className="max-w-4xl">
        <PageHead title="セッション" />
        <div className="surface">
          <EmptyState
            kind="first"
            title="最初のセッションを記録しましょう"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn btn-primary" onClick={() => nav({ to: "/upload" })}>
                  <IconUpload width={16} height={16} /> ログを取り込む
                </button>
                <button className="btn" onClick={() => nav({ to: "/upload?manual=1" })}>
                  <IconPlus width={16} height={16} /> 日時と参加者だけ記録
                </button>
              </div>
            }
          >
            CCFOLIA・Udonarium・テキストのログに対応しています。ログがなくても記録は残せます。
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHead title="セッション" />

      <div className="mb-5 flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="input flex flex-1 items-center gap-2">
            <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
            <input
              type="search"
              className="min-w-0 grow"
              placeholder="タイトル・シナリオ・卓・キャラで検索"
              aria-label="セッションを検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {hasKpLogs && hasPlLogs && (
            <Seg<RoleFilter>
              ariaLabel="立場"
              value={role}
              onChange={setRole}
              options={[
                { v: "all", label: "すべて" },
                { v: "kp", label: "GM" },
                { v: "pl", label: "PL" },
              ]}
            />
          )}
        </div>
        {(sysOptions.length > 2 || tableOptions.length > 2) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sysOptions.length > 2 && (
              <Select
                ariaLabel="システムで絞り込み"
                value={sys}
                options={sysOptions}
                onChange={setSys}
                className="w-full"
              />
            )}
            {tableOptions.length > 2 && (
              <Select
                ariaLabel="卓で絞り込み"
                value={tableFilter}
                options={tableOptions}
                onChange={setTableFilter}
                className="w-full"
              />
            )}
          </div>
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
                  setTableFilter("all");
                  setRole("all");
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
          <LoadMore
            shown={shownLogs.length}
            total={logs.length}
            step={PAGE_SIZE}
            onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
          />
        </div>
      )}
    </div>
  );
}
