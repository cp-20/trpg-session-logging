import { useMemo } from "react";
import type { ReactNode } from "react";
import { fmtDate, jstTime, sessionDay } from "../lib/time";
import type { Log, Msg, State } from "../types";
import { IconCalendarTime, IconDice, IconFileText, IconLock } from "./icons";
import { Tag, cx } from "./ui";

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

function speakerFallbackSvg(sp: string, kind: Msg["kind"], color: string): string {
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
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
  KP: "進行",
  GM: "進行",
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

function MessageRow({
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
  return (
    <div
      className={cx(
        "group flex gap-3 rounded-lg px-2 sm:px-3 transition-colors hover:bg-base-200/50",
        grouped ? "py-0.5" : "pt-2.5 pb-0.5 mt-1",
        secret && "bg-warning/[0.06] hover:bg-warning/10",
      )}
    >
      <div className="w-9 shrink-0">
        {!grouped && (
          <img
            src={meta.iconUrl}
            alt={m.sp}
            width={36}
            height={36}
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
            <span className="ml-auto text-xs tabular-nums text-ink3">{jstTime(m.ts)}</span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <div
            data-user-content
            className="min-w-0 max-w-[46em] flex-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.8]"
          >
            {grouped && secret && chName && (
              <span className="mr-1.5 align-middle">
                <SecretMark name={chName} />
              </span>
            )}
            {children}
          </div>
          {grouped && (
            <span className="invisible pt-1 text-xs tabular-nums text-ink3 group-hover:visible">
              {jstTime(m.ts)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RollBody({ m }: { m: Msg }) {
  const r = m.roll!;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-base-300 bg-base-100 px-2 py-0.5 tabular-nums">
      <IconDice width={15} height={15} className="opacity-60" aria-hidden />
      <span className="font-semibold">{r.cmd}</span>
      <span className="font-mono text-xs text-ink2">{r.dice}</span>
      <span className="text-ink3" aria-hidden>
        →
      </span>
      <RollResult result={r.result} />
    </span>
  );
}

function NoteLine({ row }: { row: Row }) {
  const { m, chName, secret } = row;
  return (
    <div className="my-3 flex items-center gap-3 px-3 text-sm text-ink2">
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
}

export interface TimelineFilter {
  query: string;
  channel: string;
}

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
  const rows = useMemo(() => {
    const msgs: Row[] = [];
    log.channels.forEach((c) => {
      if (filter.channel !== "all" && c.id !== filter.channel) return;
      c.msgs.forEach((m) => {
        const q = filter.query.trim().toLowerCase();
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
  }, [log, filter]);

  const speakerMap = useMemo(() => {
    const map = new Map<string, SpeakerMeta>();
    for (const { m } of rows) {
      const key = `${m.kind}:${m.sp}`;
      if (!map.has(key)) {
        map.set(key, resolveSpeakerMeta(m.sp, m.kind, log, state));
      }
    }
    return map;
  }, [rows, log, state]);

  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-ink2">条件に合う発言はありません</div>;
  }

  const out: ReactNode[] = [];
  let lastDay = "";
  let prev: Row | null = null;
  rows.forEach((row) => {
    const { m } = row;
    const d = sessionDay(m.ts);
    if (d !== lastDay) {
      out.push(
        <div key={`d-${d}`} className="daysep">
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

  return <div>{out}</div>;
}
