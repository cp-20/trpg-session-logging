import { createContext, memo, useContext, useDeferredValue, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { fmtDate, fmtDateShort, jstTime, sessionDay } from "../lib/time";
import type { Character, Log, Msg, State, User } from "../types";
import { IconCalendarTime, IconDice, IconFileText, IconLock, IconSearch } from "./icons";
import { LoadMore, Seg, Select, Tag, cx, useVisibleCount } from "./ui";

export interface SpeakerMeta {
  iconUrl: string;
  color: string;
  plName?: string;
  roleLabel: string;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const fallbackSvgCache = new Map<string, string>();

function speakerFallbackSvg(sp: string, kind: Msg["kind"], color: string): string {
  const key = `${kind}:${sp}:${color}`;
  const hit = fallbackSvgCache.get(key);
  if (hit !== undefined) return hit;
  const hash = hashString(`${kind}:${sp}`);
  const warmBg = ["#f3e5d8", "#ebe3d5", "#e8e0d8", "#f0dfd5", "#e4e6dc", "#e6e1ea"][hash % 6]!;
  const isKeeper = kind === "KP" || kind === "GM" || kind === "SYSTEM";
  const inner = isKeeper
    ? `
      <rect x="26" y="28" width="48" height="44" rx="6" fill="${color}" fill-opacity="0.9"/>
      <path d="M50 28 L50 72" stroke="${warmBg}" stroke-width="2.4"/>
      <path d="M33 38 L44 38 M33 46 L44 46 M56 38 L67 38 M56 46 L67 46" stroke="${warmBg}" stroke-width="2.2" stroke-linecap="round"/>
    `
    : `
      <circle cx="50" cy="39" r="14" fill="${color}" fill-opacity="0.88"/>
      <path d="M24 82 C26 63 36 56 50 56 C64 56 74 63 76 82 Z" fill="${color}" fill-opacity="0.88"/>
    `;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${warmBg}"/><circle cx="50" cy="50" r="46" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="2"/>${inner}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  if (fallbackSvgCache.size >= 500) {
    const first = fallbackSvgCache.keys().next().value;
    if (first !== undefined) fallbackSvgCache.delete(first);
  }
  fallbackSvgCache.set(key, uri);
  return uri;
}

type SpeakerNameIndex = {
  charByName: Map<string, Character>;
  userByName: Map<string, User>;
};

function buildSpeakerNameIndex(state: State): SpeakerNameIndex {
  const charByName = new Map<string, Character>();
  for (const c of Object.values(state?.characters ?? {})) {
    if (!charByName.has(c.name)) charByName.set(c.name, c);
  }
  const userByName = new Map<string, User>();
  for (const u of Object.values(state?.users ?? {})) {
    if (!userByName.has(u.name)) userByName.set(u.name, u);
  }
  return { charByName, userByName };
}

function resolveSpeakerMetaWithIndex(
  sp: string,
  kind: Msg["kind"],
  log: Log,
  state: State,
  idx: SpeakerNameIndex,
): SpeakerMeta {
  const characters = state?.characters ?? {};
  const users = state?.users ?? {};
  const iconRef = log?.speakerIcons?.[sp];
  const charByName = idx.charByName.get(sp);
  const charByRef = iconRef ? characters[iconRef] : undefined;
  const matchedChar = charByName ?? charByRef;
  const userByName = idx.userByName.get(sp);
  const userByRef = iconRef ? users[iconRef] : undefined;
  const matchedUser = userByName ?? userByRef;

  const plName = matchedChar ? users[matchedChar.ownerId]?.name : undefined;
  const color =
    kind === "KP" || kind === "GM" ? "#6b5d50" : (matchedChar?.color ?? matchedUser?.color ?? "#856e5c");

  let iconUrl: string | undefined;
  if (iconRef) {
    if (iconRef.startsWith("data:") || iconRef.startsWith("http")) {
      iconUrl = iconRef;
    } else if (characters[iconRef]?.image) {
      iconUrl = characters[iconRef].image;
    } else if (users[iconRef]?.image) {
      iconUrl = users[iconRef].image;
    }
  }
  if (!iconUrl && charByName?.image) {
    iconUrl = charByName.image;
  }
  if (!iconUrl && (kind === "KP" || kind === "GM") && log?.ownerId && users[log.ownerId]?.image) {
    iconUrl = users[log.ownerId].image;
  }
  if (!iconUrl && userByName?.image) {
    iconUrl = userByName.image;
  }
  if (!iconUrl) {
    iconUrl = speakerFallbackSvg(sp, kind, color);
  }

  return {
    iconUrl,
    color,
    plName,
    roleLabel: kind,
  };
}

export function resolveSpeakerMeta(sp: string, kind: Msg["kind"], log: Log, state: State): SpeakerMeta {
  const characters = state?.characters ?? {};
  const users = state?.users ?? {};
  const iconRef = log?.speakerIcons?.[sp];
  const charByName = Object.values(characters).find((c) => c.name === sp);
  const charByRef = iconRef ? characters[iconRef] : undefined;
  const matchedChar = charByName ?? charByRef;
  const userByName = Object.values(users).find((u) => u.name === sp);
  const userByRef = iconRef ? users[iconRef] : undefined;
  const matchedUser = userByName ?? userByRef;

  const plName = matchedChar ? users[matchedChar.ownerId]?.name : undefined;
  const color =
    kind === "KP" || kind === "GM" ? "#6b5d50" : (matchedChar?.color ?? matchedUser?.color ?? "#856e5c");

  let iconUrl: string | undefined;
  if (iconRef) {
    if (iconRef.startsWith("data:") || iconRef.startsWith("http")) {
      iconUrl = iconRef;
    } else if (characters[iconRef]?.image) {
      iconUrl = characters[iconRef].image;
    } else if (users[iconRef]?.image) {
      iconUrl = users[iconRef].image;
    }
  }
  if (!iconUrl && charByName?.image) {
    iconUrl = charByName.image;
  }
  if (!iconUrl && (kind === "KP" || kind === "GM") && log?.ownerId && users[log.ownerId]?.image) {
    iconUrl = users[log.ownerId].image;
  }
  if (!iconUrl && userByName?.image) {
    iconUrl = userByName.image;
  }
  if (!iconUrl) {
    iconUrl = speakerFallbackSvg(sp, kind, color);
  }

  return {
    iconUrl,
    color,
    plName,
    roleLabel: kind,
  };
}

export function makeColorOf(state: State) {
  const userByName = new Map(Object.values(state.users).map((u) => [u.name, u.color]));
  const charByName = new Map(Object.values(state.characters).map((c) => [c.name, c.color]));
  return (sp: string, kind: Msg["kind"]) => {
    if (kind === "KP" || kind === "GM") return "#6b5d50";
    return charByName.get(sp) ?? userByName.get(sp) ?? "#856e5c";
  };
}

const ROLE_LABEL: Record<Msg["kind"], string> = {
  PC: "PC",
  NPC: "NPC",
  KP: "GM",
  GM: "GM",
  PL: "PL",
  SYSTEM: "システム",
};

/** 判定結果: 例外的な結果（クリティカル・ファンブル）だけを目立たせる */
function RollResult({ result }: { result: string }) {
  if (/クリティカル|スペシャル/.test(result)) return <Tag v="ok">{result}</Tag>;
  if (/ファンブル/.test(result)) return <Tag v="danger">{result}</Tag>;
  return (
    <span className={cx("text-sm font-semibold", /失敗/.test(result) ? "text-ink2" : "text-base-content")}>
      {result}
    </span>
  );
}

/** シークレットの印。行を隠さず、どの秘匿タブの発言かを明示する */
function SecretMark({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-warning">
      <IconLock width={12} height={12} aria-hidden />
      シークレット・{name}
    </span>
  );
}

type Row = { m: Msg; chName?: string; secret: boolean };

const MessageRow = memo(function MessageRow({
  row,
  meta,
  grouped,
  children,
}: {
  row: Row;
  meta: SpeakerMeta;
  /** 直前と同じ発言者の続き。顔と名前を省いて読みやすくする */
  grouped: boolean;
  children: ReactNode;
}) {
  const { m, chName, secret } = row;
  const isNarratorText = m.type === "text" && (m.kind === "KP" || m.kind === "GM");
  return (
    <div
      className={cx(
        // ホバーの面が上下対称になるよう、行の余白は上下同じにする。発言者の切り替わりは行の外（margin）で空ける。
        // シークレットは左の帯ではなく、薄い地の色と SecretMark で示す
        "group flex gap-3 rounded-lg px-2 py-1 sm:px-3 transition-colors",
        !grouped && "mt-2",
        secret ? "bg-warning/[0.06] hover:bg-warning/10" : "hover:bg-base-200/50",
      )}
    >
      <div className="w-9 shrink-0">
        {!grouped && (
          <img
            src={meta.iconUrl}
            alt={m.sp}
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            className="mt-0.5 size-9 rounded-full border border-base-300 bg-base-200 object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              data-user-content
              className="font-bold text-sm"
              style={{ color: `color-mix(in oklab, ${meta.color} 72%, currentColor)` }}
            >
              {m.sp}
            </span>
            <span className="text-xs text-ink2">
              {meta.plName ? `PC · ${meta.plName}` : (ROLE_LABEL[m.kind] ?? meta.roleLabel)}
            </span>
            {secret && chName && <SecretMark name={chName} />}
            {!secret && chName && <span className="text-xs text-ink3">#{chName}</span>}
            <MsgTime ts={m.ts} className="ml-auto text-xs tabular-nums text-ink3" />
          </div>
        )}
        <div className="flex items-start gap-2">
          <div
            data-user-content
            className={cx(
              "min-w-0 max-w-[46em] flex-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.8]",
              isNarratorText && "text-base-content/85",
            )}
          >
            {grouped && secret && chName && (
              <span className="mr-1.5 align-middle">
                <SecretMark name={chName} />
              </span>
            )}
            {children}
          </div>
          {grouped && (
            <MsgTime
              ts={m.ts}
              className="invisible pt-1 text-xs tabular-nums text-ink3 group-hover:visible group-focus-within:visible"
            />
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * 発言時刻から録画のその場面を開く URL を返す関数。録画の開始時刻が分かっているときだけ、時刻をリンクにする。
 * セッション詳細・共有ページが関連するもの（src/components/media.tsx の recordingLinksAt）から渡す。
 */
export const RecordingLinkContext = createContext<((ts: number) => string | undefined) | null>(null);

function MsgTime({ ts, className }: { ts: number; className: string }) {
  const linkAt = useContext(RecordingLinkContext);
  const href = linkAt?.(ts);
  if (!href) return <span className={className}>{jstTime(ts)}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`録画で ${jstTime(ts)} の場面を開く`}
      className={cx(className, "underline decoration-dotted underline-offset-2 hover:text-primary")}
    >
      {jstTime(ts)}
    </a>
  );
}

function RollBody({ m }: { m: Msg }) {
  const r = m.roll!;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-base-200/75 px-2.5 py-1 tabular-nums">
      <IconDice width={15} height={15} className="opacity-65" aria-hidden />
      <span className="font-semibold">{r.cmd}</span>
      <span className="font-mono text-xs text-ink2">{r.dice}</span>
      <span className="text-ink3" aria-hidden>
        →
      </span>
      <RollResult result={r.result} />
    </span>
  );
}

const NoteLine = memo(function NoteLine({ row }: { row: Row }) {
  const { m, chName, secret } = row;
  return (
    <div className="my-5 flex items-center gap-3 px-3 text-sm text-ink2">
      <span className="h-px min-w-4 flex-1 bg-base-300" aria-hidden />
      <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-1.5 text-center">
        <IconFileText width={14} height={14} className="flex-none opacity-50" aria-hidden />
        <span data-user-content className="break-words">
          {m.text}
        </span>
        {secret && chName ? (
          <SecretMark name={chName} />
        ) : (
          chName && <span className="text-ink3">#{chName}</span>
        )}
        <span className="tabular-nums text-xs text-ink3">{jstTime(m.ts)}</span>
      </span>
      <span className="h-px min-w-4 flex-1 bg-base-300" aria-hidden />
    </div>
  );
});

export interface TimelineFilter {
  query: string;
  channel: string;
  speaker?: string;
  rollsOnly?: boolean;
}

export function LogReaderBar({
  log,
  state,
  filter,
  onChange,
  stickyClassName = "sticky top-14 lg:top-0 z-20 -mx-4 px-4 sm:-mx-8 sm:px-8",
  rightSlot,
}: {
  log: Log;
  state: State;
  filter: TimelineFilter;
  onChange: (next: TimelineFilter) => void;
  stickyClassName?: string;
  rightSlot?: ReactNode;
}) {
  const hasRolls = useMemo(
    () => log.channels.some((c) => c.msgs.some((m) => m.type === "roll")),
    [log.channels],
  );
  const speakerIdx = useMemo(() => buildSpeakerNameIndex(state), [state]);
  const speakers = useMemo(() => {
    const seen = new Map<string, SpeakerMeta>();
    for (const c of log.channels) {
      for (const m of c.msgs) {
        if (m.type === "note") continue;
        if (!seen.has(m.sp)) {
          seen.set(m.sp, resolveSpeakerMetaWithIndex(m.sp, m.kind, log, state, speakerIdx));
        }
      }
    }
    return [...seen.entries()].map(([sp, meta]) => ({ sp, meta }));
  }, [log, state, speakerIdx]);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const c of log.channels) {
      for (const m of c.msgs) set.add(sessionDay(m.ts));
    }
    return [...set].sort();
  }, [log.channels]);

  const showSecondRow = speakers.length >= 2 || days.length >= 2;

  return (
    <div
      className={cx(
        "mb-3 space-y-2 border-b border-base-300/60 bg-base-200/95 py-2.5 backdrop-blur",
        stickyClassName,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="input flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
          <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
          <input
            type="search"
            aria-label="本文・発言者で絞り込み"
            className="min-w-0 grow"
            placeholder="本文・発言者で絞り込み…"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
          />
        </label>
        {log.channels.length >= 2 && log.channels.length <= 4 && (
          <Seg
            size="sm"
            ariaLabel="タブで絞り込み"
            value={filter.channel}
            onChange={(channel) => onChange({ ...filter, channel })}
            options={[
              { v: "all", label: "すべて" },
              ...log.channels.map((c) => ({
                v: c.id,
                label: c.secret ? `${c.name}（秘匿）` : c.name,
              })),
            ]}
          />
        )}
        {log.channels.length >= 5 && (
          <Select
            size="sm"
            align="right"
            className="max-w-full"
            value={filter.channel}
            onChange={(channel) => onChange({ ...filter, channel })}
            ariaLabel="タブで絞り込み"
            options={[
              { value: "all", label: "すべてのタブ" },
              ...log.channels.map((c) => ({
                value: c.id,
                label: `${c.name}${c.secret ? "（シークレット）" : ""}`,
              })),
            ]}
          />
        )}
        {hasRolls && (
          <Seg<"all" | "roll">
            size="sm"
            ariaLabel="表示種別"
            value={filter.rollsOnly ? "roll" : "all"}
            onChange={(v) => onChange({ ...filter, rollsOnly: v === "roll" })}
            options={[
              { v: "all", label: "すべて" },
              { v: "roll", label: "ダイス" },
            ]}
          />
        )}
        {rightSlot}
      </div>

      {showSecondRow && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {speakers.length >= 2 && (
            <div
              className="flex min-w-0 flex-wrap items-center gap-1"
              role="group"
              aria-label="発言者で絞り込み"
            >
              {speakers.map(({ sp, meta }) => {
                const active = filter.speaker === sp;
                return (
                  <button
                    key={sp}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ ...filter, speaker: active ? undefined : sp })}
                    className={cx(
                      "inline-flex min-h-7 items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors",
                      active
                        ? "bg-primary/15 font-bold text-primary"
                        : "bg-base-100/75 font-medium text-ink2 hover:bg-base-100 hover:text-base-content",
                    )}
                  >
                    <img
                      src={meta.iconUrl}
                      alt=""
                      width={18}
                      height={18}
                      className="size-[18px] shrink-0 rounded-full object-cover"
                    />
                    <span className="max-w-28 truncate">{sp}</span>
                  </button>
                );
              })}
              {filter.speaker && (
                <button
                  type="button"
                  className="btn btn-quiet btn-xs"
                  onClick={() => onChange({ ...filter, speaker: undefined })}
                >
                  全員
                </button>
              )}
            </div>
          )}
          {days.length >= 2 && (
            <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="実施日へ移動">
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("takufu:jump-day", { detail: d }));
                    window.requestAnimationFrame(() => {
                      document
                        .getElementById(`day-${d}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  className="inline-flex min-h-7 items-center rounded-lg px-2 py-1 text-xs font-medium tabular-nums text-ink2 transition-colors hover:bg-base-100 hover:text-base-content"
                >
                  {fmtDateShort(d)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const INITIAL_VISIBLE_ROWS = 150;

export function SessionTimeline({
  log,
  state,
  mode: _mode,
  filter,
}: {
  log: Log;
  state: State;
  mode: "own" | "share";
  filter: TimelineFilter;
}) {
  const deferredQuery = useDeferredValue(filter.query);
  const [visibleCount, setVisibleCount] = useVisibleCount(INITIAL_VISIBLE_ROWS, [
    log.id,
    filter.channel,
    filter.rollsOnly,
    filter.speaker,
    deferredQuery,
  ]);

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const msgs: Row[] = [];
    log.channels.forEach((c) => {
      if (filter.channel !== "all" && c.id !== filter.channel) return;
      c.msgs.forEach((m) => {
        if (filter.rollsOnly && m.type !== "roll") return;
        if (filter.speaker && m.sp !== filter.speaker) return;
        if (
          q &&
          !(
            (m.text ?? "").toLowerCase().includes(q) ||
            m.sp.toLowerCase().includes(q) ||
            (m.roll?.cmd ?? "").toLowerCase().includes(q)
          )
        ) {
          return;
        }
        msgs.push({
          m,
          secret: c.secret,
          chName: c.secret || c.name !== "メイン" ? c.name : undefined,
        });
      });
    });
    return msgs.sort((a, b) => a.m.ts - b.m.ts);
  }, [log, filter.channel, filter.rollsOnly, filter.speaker, deferredQuery]);

  useEffect(() => {
    function onJumpDay(ev: Event) {
      const targetDay = (ev as CustomEvent<string>).detail;
      if (!targetDay) return;
      const idx = rows.findIndex((r) => sessionDay(r.m.ts) === targetDay);
      if (idx >= 0) {
        setVisibleCount((n) => Math.max(n, idx + 40));
      }
    }
    window.addEventListener("takufu:jump-day", onJumpDay);
    return () => window.removeEventListener("takufu:jump-day", onJumpDay);
  }, [rows, setVisibleCount]);

  const speakerIdx = useMemo(() => buildSpeakerNameIndex(state), [state]);
  const speakerMap = useMemo(() => {
    const map = new Map<string, SpeakerMeta>();
    for (const { m } of rows) {
      const key = `${m.kind}:${m.sp}`;
      if (!map.has(key)) {
        map.set(key, resolveSpeakerMetaWithIndex(m.sp, m.kind, log, state, speakerIdx));
      }
    }
    return map;
  }, [rows, log, state, speakerIdx]);

  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-ink2">条件に合う発言はありません</div>;
  }

  const visibleRows = rows.slice(0, visibleCount);
  const out: ReactNode[] = [];
  let lastDay = "";
  let prev: Row | null = null;
  visibleRows.forEach((row) => {
    const { m } = row;
    const d = sessionDay(m.ts);
    if (d !== lastDay) {
      out.push(
        <div key={`d-${d}`} id={`day-${d}`} className="daysep scroll-mt-28">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink2">
            <IconCalendarTime width={15} height={15} aria-hidden /> {fmtDate(d)}
          </span>
        </div>,
      );
      lastDay = d;
      prev = null;
    }
    if (m.type === "note") {
      out.push(<NoteLine key={m.id} row={row} />);
      prev = null;
      return;
    }
    const p: Row | null = prev;
    const grouped =
      p !== null &&
      p.m.sp === m.sp &&
      p.m.kind === m.kind &&
      p.chName === row.chName &&
      m.ts - p.m.ts < 5 * 60;
    const meta = speakerMap.get(`${m.kind}:${m.sp}`)!;
    out.push(
      <MessageRow key={m.id} row={row} meta={meta} grouped={grouped}>
        {m.type === "roll" ? <RollBody m={m} /> : m.text}
      </MessageRow>,
    );
    prev = row;
  });

  return (
    <div>
      {out}
      <LoadMore
        shown={visibleRows.length}
        total={rows.length}
        step={INITIAL_VISIBLE_ROWS}
        onMore={() => setVisibleCount((n) => n + INITIAL_VISIBLE_ROWS)}
        label="続きの発言を表示"
      />
    </div>
  );
}
