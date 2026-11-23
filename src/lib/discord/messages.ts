/**
 * Discord に出すメッセージの組み立て（純粋関数）。
 * 文は敬体で短く（P12・P4）。メンションは効かせない（allowed_mentions: parse なし）。
 * ネタバレ・シークレットは載せない: セッションは共有ページを匿名で読めるとき（公開）だけ題名などを出す。
 */
import { SYSTEMS } from "../../data/systems";
import { fmtSessionWhen } from "../sittings";
import { ANSWER_MARK, fmtCandidate, isOpenPoll, tallyCandidate } from "./polls";
import type { PollAnswer, PollDoc, SharedCharacterInfo, SharedLogInfo, TableLink } from "./types";

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: { name: string };
  footer?: { text: string };
}

export interface DiscordButton {
  type: 2;
  style: 1 | 2 | 3 | 4 | 5;
  label: string;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
}

export interface DiscordActionRow {
  type: 1;
  components: DiscordButton[];
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  flags?: number;
  allowed_mentions?: { parse: string[] };
}

export const EPHEMERAL = 64;
/** 卓譜の主色（テラコッタ） */
export const BRAND_COLOR = 0xab4120;
const NO_MENTIONS = { parse: [] as string[] };

const BUTTON = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 } as const;

/* ---------- custom_id ---------- */

/** custom_id は 100 文字まで。ID に「:」は使わない前提で区切る */
export type ComponentAction =
  | { kind: "poll-open"; eventId: string; page: number }
  | { kind: "poll-answer"; eventId: string; candidateId: string; value: PollAnswer; page: number };

const ID_RE = /^[\w-]{1,40}$/;

export function encodeAction(a: ComponentAction): string {
  if (a.kind === "poll-open") return `po:${a.eventId}:${a.page}`;
  return `pa:${a.eventId}:${a.candidateId}:${a.value}:${a.page}`;
}

export function decodeAction(customId: string): ComponentAction | null {
  const parts = customId.split(":");
  const page = Number(parts[parts.length - 1]);
  if (!Number.isInteger(page) || page < 0 || page > 50) return null;
  if (parts[0] === "po" && parts.length === 3 && ID_RE.test(parts[1]!))
    return { kind: "poll-open", eventId: parts[1]!, page };
  if (
    parts[0] === "pa" &&
    parts.length === 5 &&
    ID_RE.test(parts[1]!) &&
    ID_RE.test(parts[2]!) &&
    (parts[3] === "ok" || parts[3] === "maybe" || parts[3] === "ng")
  )
    return { kind: "poll-answer", eventId: parts[1]!, candidateId: parts[2]!, value: parts[3], page };
  return null;
}

/** ID が custom_id に収まるか（収まらない日程調整は Discord で回答できない） */
export function fitsCustomId(...ids: string[]): boolean {
  return ids.every((id) => ID_RE.test(id));
}

function linkButton(label: string, url: string): DiscordButton {
  return { type: 2, style: BUTTON.link, label, url };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** 利用者が書いた題名を Markdown・メンションとして解釈させない */
export function plain(text: string): string {
  return text.replace(/([\\*_~`|>#[\]()-])/g, "\\$1").replace(/@/g, "@\u200b");
}

function tableUrl(base: string, tableId: string): string {
  return `${base}/tables/${encodeURIComponent(tableId)}`;
}

/* ---------- 日程調整 ---------- */

function pollLines(poll: PollDoc): string {
  return poll.candidates
    .map((c) => {
      const t = tallyCandidate(poll, c.id);
      const when = fmtCandidate(c);
      const mark = poll.confirmedCandidateId === c.id ? "**確定** " : "";
      return `${mark}${when}　○ ${t.ok}　△ ${t.maybe}　× ${t.ng}`;
    })
    .join("\n");
}

/** チャンネルに出す日程調整。回答数を並べ、「回答する」で自分だけに見える回答欄を開く */
export function pollMessage(
  poll: PollDoc,
  link: Pick<TableLink, "tableName">,
  baseUrl: string,
): DiscordMessage {
  const open = isOpenPoll(poll);
  const buttons: DiscordButton[] = [];
  if (open && fitsCustomId(poll.id))
    buttons.push({
      type: 2,
      style: BUTTON.primary,
      label: "回答する",
      custom_id: encodeAction({ kind: "poll-open", eventId: poll.id, page: 0 }),
    });
  buttons.push(linkButton("卓譜で開く", tableUrl(baseUrl, poll.tableId)));
  return {
    embeds: [
      {
        author: { name: open ? "日程調整" : "日程調整（締め切りました）" },
        title: truncate(poll.title || "日程調整", 256),
        url: tableUrl(baseUrl, poll.tableId),
        description: truncate(pollLines(poll), 4000),
        color: BRAND_COLOR,
        footer: { text: truncate(link.tableName, 2000) },
      },
    ],
    components: [{ type: 1, components: buttons }],
    allowed_mentions: NO_MENTIONS,
  };
}

/** 1 ページに並べる候補の数（1 行 = 候補 + ○△×。ページ送りの行を残す） */
export const CANDIDATES_PER_PAGE = 4;

/** 自分だけに見える回答欄。候補ごとに ○ △ × のボタン。選んだものに色が付く */
export function pollAnswerMessage(poll: PollDoc, uid: string, page: number): DiscordMessage {
  const pages = Math.max(1, Math.ceil(poll.candidates.length / CANDIDATES_PER_PAGE));
  const single = poll.candidates.length <= 5;
  const current = Math.min(Math.max(0, page), pages - 1);
  const shown = single
    ? poll.candidates
    : poll.candidates.slice(current * CANDIDATES_PER_PAGE, (current + 1) * CANDIDATES_PER_PAGE);
  const mine = poll.responses[uid] ?? {};
  const style: Record<PollAnswer, DiscordButton["style"]> = {
    ok: BUTTON.success,
    maybe: BUTTON.primary,
    ng: BUTTON.danger,
  };
  const rows: DiscordActionRow[] = shown.map((c) => ({
    type: 1,
    components: [
      {
        type: 2,
        style: BUTTON.secondary,
        label: truncate(fmtCandidate(c), 80),
        custom_id: `pl:${c.id}`,
        disabled: true,
      },
      ...(["ok", "maybe", "ng"] as const).map((v): DiscordButton => ({
        type: 2,
        style: mine[c.id] === v ? style[v] : BUTTON.secondary,
        label: ANSWER_MARK[v],
        custom_id: encodeAction({
          kind: "poll-answer",
          eventId: poll.id,
          candidateId: c.id,
          value: v,
          page: single ? 0 : current,
        }),
      })),
    ],
  }));
  if (!single)
    rows.push({
      type: 1,
      components: [
        {
          type: 2,
          style: BUTTON.secondary,
          label: "前の候補",
          custom_id: encodeAction({ kind: "poll-open", eventId: poll.id, page: current - 1 }),
          disabled: current === 0,
        },
        {
          type: 2,
          style: BUTTON.secondary,
          label: `${current + 1} / ${pages}`,
          custom_id: "pg",
          disabled: true,
        },
        {
          type: 2,
          style: BUTTON.secondary,
          label: "次の候補",
          custom_id: encodeAction({ kind: "poll-open", eventId: poll.id, page: current + 1 }),
          disabled: current >= pages - 1,
        },
      ],
    });
  return {
    content: `**${plain(truncate(poll.title || "日程調整", 200))}**`,
    components: rows,
    flags: EPHEMERAL,
    allowed_mentions: NO_MENTIONS,
  };
}

/** `/卓譜 日程`: このチャンネルの卓の、回答を受け付けている日程調整 */
export function openPollsMessage(polls: PollDoc[], link: TableLink, baseUrl: string): DiscordMessage {
  if (polls.length === 0)
    return notice(`「${plain(link.tableName)}」に回答を受け付けている日程調整はありません。`, [
      linkButton("卓譜で開く", tableUrl(baseUrl, link.tableId)),
    ]);
  const shown = polls.filter((p) => fitsCustomId(p.id)).slice(0, 5);
  return {
    content: shown.map((p) => `**${plain(p.title || "日程調整")}**　候補 ${p.candidates.length}`).join("\n"),
    components: shown.map((p) => ({
      type: 1,
      components: [
        {
          type: 2,
          style: BUTTON.primary,
          label: truncate(`${p.title || "日程調整"}に回答する`, 80),
          custom_id: encodeAction({ kind: "poll-open", eventId: p.id, page: 0 }),
        },
      ],
    })),
    flags: EPHEMERAL,
    allowed_mentions: NO_MENTIONS,
  };
}

/* ---------- 予定 ---------- */

export interface ConfirmedEvent {
  eventId: string;
  tableId: string;
  title: string;
  /** epoch 秒 */
  start: number;
  end: number;
}

function eventUrl(guildId: string, scheduledEventId?: string): string | null {
  return scheduledEventId ? `https://discord.com/events/${guildId}/${scheduledEventId}` : null;
}

/** 予定が決まった・変わったときのメッセージ */
export function confirmedMessage(
  ev: ConfirmedEvent,
  link: Pick<TableLink, "tableName" | "guildId">,
  baseUrl: string,
  scheduledEventId?: string,
): DiscordMessage {
  const discordEvent = eventUrl(link.guildId, scheduledEventId);
  return {
    embeds: [
      {
        author: { name: "予定が決まりました" },
        title: truncate(ev.title || "予定", 256),
        url: tableUrl(baseUrl, ev.tableId),
        description: fmtSessionWhen({ sittings: [{ start: ev.start, end: ev.end }] }),
        color: BRAND_COLOR,
        footer: { text: truncate(link.tableName, 2000) },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          ...(discordEvent ? [linkButton("イベントを見る", discordEvent)] : []),
          linkButton("卓譜で開く", tableUrl(baseUrl, ev.tableId)),
        ],
      },
    ],
    allowed_mentions: NO_MENTIONS,
  };
}

export function cancelledMessage(title: string, link: Pick<TableLink, "tableName">): DiscordMessage {
  return {
    embeds: [
      {
        author: { name: "予定は取り消されました" },
        title: truncate(title || "予定", 256),
        color: 0x8a8079,
        footer: { text: truncate(link.tableName, 2000) },
      },
    ],
    components: [],
    allowed_mentions: NO_MENTIONS,
  };
}

/** 前日のお知らせ。今日・あすは日本時間の日付で決める */
export function reminderMessage(
  ev: ConfirmedEvent,
  link: Pick<TableLink, "tableName" | "guildId">,
  baseUrl: string,
  nowMs: number,
  scheduledEventId?: string,
): DiscordMessage {
  const day = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
  const label = day(ev.start * 1000) === day(nowMs) ? "今日" : "あす";
  const base = confirmedMessage(ev, link, baseUrl, scheduledEventId);
  return {
    ...base,
    embeds: [{ ...base.embeds![0]!, author: { name: `${label}の予定です` } }],
  };
}

/* ---------- セッションの記録 ---------- */

/**
 * 記録したセッションの投稿。共有ページを匿名で読めるとき（公開）だけ題名・システム・日時を出し、
 * それ以外はリンクだけにする（ネタバレ・メンバー限定の内容を載せない）
 */
export function sessionMessage(slug: string, info: SharedLogInfo, baseUrl: string): DiscordMessage {
  const url = `${baseUrl}/share/l/${encodeURIComponent(slug)}`;
  const anonymous = info.scope === "public";
  if (!anonymous || !info.title) {
    const who = info.scope === "members" ? "卓のメンバー" : "このシナリオを通過した人";
    return {
      content: `セッションを記録しました。共有ページは${who}だけが読めます。`,
      components: [{ type: 1, components: [linkButton("共有ページを開く", url)] }],
      allowed_mentions: NO_MENTIONS,
    };
  }
  const sys = info.systemId ? SYSTEMS[info.systemId]?.name : undefined;
  const lines = [
    sys ?? null,
    info.sittings?.length ? fmtSessionWhen({ sittings: info.sittings }) : null,
  ].filter(Boolean);
  return {
    embeds: [
      {
        author: { name: "セッションを記録しました" },
        title: truncate(info.title, 256),
        url,
        description: lines.join("\n") || undefined,
        color: BRAND_COLOR,
      },
    ],
    components: [{ type: 1, components: [linkButton("ログを読む", url)] }],
    allowed_mentions: NO_MENTIONS,
  };
}

/* ---------- キャラクター ---------- */

export function charactersMessage(chars: SharedCharacterInfo[], baseUrl: string): DiscordMessage {
  if (chars.length === 0)
    return notice("公開しているキャラクターはありません。卓譜のキャラクターの共有から公開できます。", [
      linkButton("キャラクターを開く", `${baseUrl}/characters`),
    ]);
  return {
    embeds: [
      {
        author: { name: "キャラクター" },
        description: chars
          .map((c) => {
            const sys = SYSTEMS[c.systemId]?.name;
            return `[${plain(c.name)}](${baseUrl}/share/c/${encodeURIComponent(c.id)})${sys ? `　${sys}` : ""}`;
          })
          .join("\n"),
        color: BRAND_COLOR,
      },
    ],
    allowed_mentions: NO_MENTIONS,
  };
}

/* ---------- お知らせ（自分だけに見える） ---------- */

export function notice(text: string, buttons: DiscordButton[] = []): DiscordMessage {
  return {
    content: text,
    components: buttons.length ? [{ type: 1, components: buttons }] : [],
    flags: EPHEMERAL,
    allowed_mentions: NO_MENTIONS,
  };
}

export function linkAccountNotice(baseUrl: string): DiscordMessage {
  return notice("卓譜のアカウントとつながっていません。卓譜の設定から Discord とつないでください。", [
    linkButton("卓譜の設定を開く", `${baseUrl}/settings`),
  ]);
}

export function channelLinkNotice(url: string): DiscordMessage {
  return notice("卓譜でこのリンクを開き、つなぐ卓を選んでください。リンクは 10 分間使えます。", [
    linkButton("つなぐ卓を選ぶ", url),
  ]);
}

export function installNotice(installUrl: string): DiscordMessage {
  return notice(
    "卓譜のボットがこのチャンネルに投稿できません。ボットを追加するか、チャンネルの権限を確かめてください。",
    [linkButton("ボットを追加", installUrl)],
  );
}

export { linkButton };
