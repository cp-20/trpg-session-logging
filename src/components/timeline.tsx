import { createContext, memo, useContext, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { identiconDataUri } from "../lib/identicon";
import { logSpeakers, splitSpeakers } from "../lib/log-speakers";
import { roleLabel } from "../lib/roles";
import { rollSpeech } from "../lib/roll-text";
import { rollTone } from "../lib/roll-tone";
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

/** 誰とも結び付かない発言者の顔。発言者名を種にした既定の画像（GM 側は人の姿、ほかはキャラの姿） */
function speakerFallbackSvg(sp: string, kind: Msg["kind"]): string {
  const isKeeper = kind === "KP" || kind === "GM" || kind === "SYSTEM";
  return identiconDataUri(sp, isKeeper ? "user" : "character");
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
    iconUrl = speakerFallbackSvg(sp, kind);
  }

  return {
    iconUrl,
    color,
    plName,
    roleLabel: roleLabel(log?.systemId, kind),
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
    iconUrl = speakerFallbackSvg(sp, kind);
  }

  return {
    iconUrl,
    color,
    plName,
    roleLabel: roleLabel(log?.systemId, kind),
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

/** 判定結果: 例外的な結果（クリティカル・ファンブル）だけを目立たせる */
function RollResult({ result }: { result: string }) {
  const tone = rollTone(result);
  if (tone === "crit" || tone === "special") return <Tag v="ok">{result}</Tag>;
  if (tone === "fumble") return <Tag v="danger">{result}</Tag>;
  return (
    <span
      className={cx(
        "min-w-0 text-sm font-semibold [overflow-wrap:anywhere]",
        tone === "fail" ? "text-ink2" : "text-base-content",
      )}
    >
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
            <span className="text-xs text-ink2">{meta.plName ? `PC · ${meta.plName}` : meta.roleLabel}</span>
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
  // 時刻のないログ（ts = 0）では何も出さない
  if (!(ts > 0)) return null;
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

/** 繰り返しロールの 1 回分。出目だけを並べ、段階は色で見せる（判定の文はまとめの行と読み上げに） */
function RepeatOutcome({ n, dice, result }: { n: number; dice: string; result: string }) {
  const tone = rollTone(result);
  const judged = tone !== undefined;
  return (
    <li
      className={cx(
        "min-w-7 max-w-full rounded border px-1 text-center font-mono text-xs leading-5 [overflow-wrap:anywhere]",
        tone === "crit" || tone === "special"
          ? "border-success text-success font-bold"
          : tone === "fumble"
            ? "border-error text-error font-bold"
            : tone === "fail"
              ? "border-transparent text-ink3"
              : "border-base-300 text-base-content",
      )}
    >
      <span className="sr-only">{`#${n} `}</span>
      {judged ? dice : result}
      {judged && <span className="sr-only">{` ${result}`}</span>}
    </li>
  );
}

/** これより長い出目は畳む（100D6 のような大きなロールが画面を埋めないように） */
const DICE_PREVIEW_CHARS = 60;

/** 出目。長いものは先頭だけ出して、押すと全部見せる */
function DiceText({ dice }: { dice: string }) {
  const [open, setOpen] = useState(false);
  const long = dice.length > DICE_PREVIEW_CHARS;
  return (
    <span className="min-w-0 max-w-full font-mono text-xs text-ink2 [overflow-wrap:anywhere]">
      {long && !open ? `${dice.slice(0, DICE_PREVIEW_CHARS)}…` : dice}
      {long && (
        <button
          type="button"
          className="ml-1.5 font-sans font-medium underline decoration-dotted underline-offset-2 hover:text-base-content"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "畳む" : "すべての出目"}
        </button>
      )}
    </span>
  );
}

function RollBody({ m }: { m: Msg }) {
  const r = m.roll!;
  if (r.repeats?.length) {
    return (
      <span className="inline-flex max-w-full flex-col gap-1.5 rounded-lg bg-base-200/75 px-2.5 py-1.5 tabular-nums">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <IconDice width={15} height={15} className="opacity-65" aria-hidden />
          <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.cmd}</span>
          <span className="text-ink3" aria-hidden>
            →
          </span>
          <span className="text-sm font-semibold">{r.result}</span>
        </span>
        <ol className="flex flex-wrap gap-1" aria-label={`${r.repeats.length} 回の結果`}>
          {r.repeats.map((o, i) => (
            <RepeatOutcome key={i} n={i + 1} dice={o.dice} result={o.result} />
          ))}
        </ol>
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-base-200/75 px-2.5 py-1 tabular-nums">
      <IconDice width={15} height={15} className="shrink-0 opacity-65" aria-hidden />
      <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.cmd}</span>
      <DiceText dice={r.dice} />
      <span className="text-ink3" aria-hidden>
        →
      </span>
      <RollResult result={r.result} />
    </span>
  );
}

/** ダイスの行。添えられた言葉があれば上に出す */
function RollMessage({ m }: { m: Msg }) {
  const speech = rollSpeech(m);
  return (
    <>
      {speech && <span className="block">{speech}</span>}
      <RollBody m={m} />
    </>
  );
}

/** 場面の見出し（src/lib/scene-headings.ts）。推定なので、だれの発言かは残す */
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
        {m.kind !== "SYSTEM" && (
          <span data-user-content className="text-xs text-ink3">
            {m.sp}
          </span>
        )}
        {secret && chName ? (
          <SecretMark name={chName} />
        ) : (
          chName && <span className="text-ink3">#{chName}</span>
        )}
        <MsgTime ts={m.ts} className="tabular-nums text-xs text-ink3" />
      </span>
      <span className="h-px min-w-4 flex-1 bg-base-300" aria-hidden />
    </div>
  );
});

/**
 * 描写（場面・場所の見出しやあらすじの名前で流す地の文）。登場人物の発言ではないので顔と役割を出さず、
 * 見出しと本文にして発言の列に揃える
 */
const NarrationBlock = memo(function NarrationBlock({ row }: { row: Row }) {
  const { m, chName, secret } = row;
  return (
    <section
      aria-label={m.sp}
      className={cx("my-4 rounded-lg px-2 py-2 sm:px-3", secret && "bg-warning/[0.06]")}
    >
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 justify-center pt-0.5 text-ink3">
          <IconFileText width={18} height={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span data-user-content className="text-sm font-bold text-ink2">
              {m.sp}
            </span>
            {secret && chName && <SecretMark name={chName} />}
            {!secret && chName && <span className="text-xs text-ink3">#{chName}</span>}
            <MsgTime ts={m.ts} className="ml-auto text-xs tabular-nums text-ink3" />
          </div>
          <p
            data-user-content
            className="max-w-[46em] whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.8] text-base-content/85"
          >
            {m.text}
          </p>
        </div>
      </div>
    </section>
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
  const { main, rest } = useMemo(() => {
    const split = splitSpeakers(logSpeakers(log.channels));
    return {
      main: split.main.map(({ sp, kind }) => ({
        sp,
        meta: resolveSpeakerMetaWithIndex(sp, kind, log, state, speakerIdx),
      })),
      rest: split.rest,
    };
  }, [log, state, speakerIdx]);
  const restActive = rest.some((r) => r.sp === filter.speaker);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const c of log.channels) {
      for (const m of c.msgs) if (m.ts > 0) set.add(sessionDay(m.ts));
    }
    return [...set].sort();
  }, [log.channels]);

  const showSecondRow = main.length + rest.length >= 2 || days.length >= 2;

  return (
    <div
      className={cx(
        "mb-3 space-y-2 border-b border-base-300/60 bg-base-200/95 py-2.5 backdrop-blur",
        stickyClassName,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-sm flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
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
          {main.length + rest.length >= 2 && (
            <div
              className="flex min-w-0 flex-wrap items-center gap-1"
              role="group"
              aria-label="発言者で絞り込み"
            >
              {main.map(({ sp, meta }) => {
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
              {rest.length > 0 && (
                <Select
                  size="sm"
                  className="max-w-44 [&>button]:h-7 [&>button]:min-h-7 [&>button]:px-2 [&>button]:text-xs [&>button]:font-medium"
                  ariaLabel="ほかの発言者で絞り込み"
                  value={restActive ? filter.speaker! : ""}
                  onChange={(sp) => onChange({ ...filter, speaker: sp || undefined })}
                  options={[
                    { value: "", label: "ほかの発言者" },
                    ...rest.map((r) => ({ value: r.sp, label: r.sp })),
                  ]}
                />
              )}
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
            <div
              className="ml-auto flex flex-wrap items-center gap-1"
              role="group"
              aria-label="遊んだ日へ移動"
            >
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
    const d = m.ts > 0 ? sessionDay(m.ts) : lastDay;
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
    if (m.kind === "NARRATION" && m.type === "text") {
      out.push(<NarrationBlock key={m.id} row={row} />);
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
        {m.type === "roll" ? <RollMessage m={m} /> : m.text}
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
