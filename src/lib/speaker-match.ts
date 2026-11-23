/**
 * ログの発言者名 → 卓譜のキャラクター・ユーザーの対応付けと、記録の下書き（Draft）組み立て。
 * 画面に依存しない純粋関数だけを置く（顔アイコンの解決は呼び出し側から渡す）。
 */
import { inferSystem } from "../data/systems";
import { deriveSittings, type Sitting } from "./sittings";
import type { Channel, Character, Log, MsgKind, Scope, SelfRole, State, User } from "../types";

export interface SpeakerLink {
  userId?: string;
  characterId?: string;
}

/** 確定前の入力状態。ログあり/なしの両方を同じ形で運ぶ */
export interface Draft {
  /** 読み込んだログのファイル名（複数のログを 1 つのセッションにまとめたときは複数） */
  fileNames: string[];
  channels: Channel[];
  kinds: Record<string, MsgKind>;
  speakerIcons: Record<string, string>;
  speakerLinks: Record<string, SpeakerLink>;
  meta: { systemId: string };
  guess: { id: string } | null;
  scope: Scope;
  tableId: string;
  scenarioId: string;
  /** 共有シナリオ一覧に無いシナリオを足すとき。private なら共有シナリオ一覧に載せない */
  newScenario: { title: string; author: string; private?: boolean } | null;
  /** 記録する本人以外の参加者 */
  players: { userId: string; characterIds: string[] }[];
  /**
   * 記録する本人。記録するのは遊んだ人なので既定で参加者（P1）。人の代わりに記録するときだけ played を外す。
   * 役割はログから推す: 本人に結び付いた GM の発言者がいれば GM、本人のキャラの発言があれば PL
   */
  self: SelfFields /**
   * 遊んだ時間帯。ログの発言時刻から導き、利用者が直せる。発言に時刻のないログ（CCFOLIA の HTML）や
   * ログなしの記録では空から入れてもらう
   */;
  sittings: Sitting[];
}

export interface SelfFields {
  played: boolean;
  role: SelfRole;
  characterIds: string[];
}

export function compactName(s: string): string {
  return s.replace(/[\s　]+/g, "").toLowerCase();
}

/** 【】[]（）() の注記と「KP:」などの役割接頭辞を落とした比較用の名前 */
export function stripSpeakerDecorations(s: string): string {
  return s
    .replace(/【[^】]*】/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/^(?:KP|GM|PL|PC\d*|NPC)\s*[:：／/]\s*/i, "")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

/** 括弧・角括弧の中身（「遠沢澄花（みかん）」の「みかん」など、PL 名の手がかり） */
export function speakerHints(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/[（(【[]([^）)】\]]+)[）)】\]]/g)) {
    const h = compactName(m[1]!);
    if (h.length >= 1) out.push(h);
  }
  return out;
}

export function isGenericRoleName(sp: string): boolean {
  return /^(?:kp|gm|pl|pc\d*|npc|system|キーパー|進行役)$/i.test(sp.trim());
}

export interface MatchContext {
  /** 推定したシステム。同名キャラが複数いるとき、このシステムのキャラを優先する */
  preferredSystemId?: string;
  /** この記録に関わりそうな人（卓のメンバー・添付先ログの参加者）。その人のキャラを優先する */
  participantIds?: readonly string[];
  /** 発言者に付いている顔画像。キャラの画像と一致すれば強い手がかりになる */
  icon?: string;
}

/** 名前の一致の強さ。0 は不一致 */
function nameScore(sp: string, name: string): number {
  if (sp === name) return 100;
  const spCompact = compactName(sp);
  const nCompact = compactName(name);
  if (spCompact === nCompact) return 90;
  const spClean = stripSpeakerDecorations(sp);
  const nClean = stripSpeakerDecorations(name);
  if (spClean.length >= 2 && spClean === nClean) return 80;
  if (spClean.length >= 2 && nClean.length >= 2 && (spClean.includes(nClean) || nClean.includes(spClean))) {
    // 部分一致は短い方が長い方に占める割合で強さを決める（「澄花」⊂「遠沢澄花」）
    const ratio = Math.min(spClean.length, nClean.length) / Math.max(spClean.length, nClean.length);
    return 40 + Math.round(ratio * 30);
  }
  return 0;
}

/**
 * 発言者名に対応するキャラクター（なければユーザー）を推定する。
 * 名前の一致を主に、次の手がかりで同点を崩す:
 *   画像の一致 > 括弧内の PL 名 > 参加しそうな人のキャラ > 推定システム > 名前の長さ
 */
export function matchSpeakerToState(
  sp: string,
  state: Pick<State, "characters" | "users">,
  ctx: MatchContext | string = {},
): { character: Character | null; user: User | null } {
  const c: MatchContext = typeof ctx === "string" ? { preferredSystemId: ctx } : ctx;
  if (isGenericRoleName(sp)) return { character: null, user: null };
  const hints = speakerHints(sp);
  const participants = new Set(c.participantIds ?? []);
  const ownerHinted = (ownerId: string) => {
    const owner = state.users[ownerId];
    return Boolean(owner && hints.includes(compactName(owner.name)));
  };

  let best: { char: Character; score: number } | null = null;
  for (const ch of Object.values(state.characters)) {
    let score = nameScore(sp, ch.name);
    const imageMatch = Boolean(c.icon && ch.image && c.icon === ch.image);
    if (score === 0 && !imageMatch) continue;
    if (imageMatch) score += 50;
    if (ownerHinted(ch.ownerId)) score += 20;
    if (participants.has(ch.ownerId)) score += 10;
    if (c.preferredSystemId && ch.systemId === c.preferredSystemId) score += 5;
    score += Math.min(ch.name.length, 20) / 100;
    if (!best || score > best.score) best = { char: ch, score };
  }
  // 部分一致だけの弱い候補は、ほかの手がかりがなければ採らない
  if (best && best.score >= 55) {
    return { character: best.char, user: state.users[best.char.ownerId] ?? null };
  }

  let bestUser: { user: User; score: number } | null = null;
  for (const u of Object.values(state.users)) {
    let score = Math.max(nameScore(sp, u.name), hints.includes(compactName(u.name)) ? 60 : 0);
    if (score === 0) continue;
    if (participants.has(u.id)) score += 10;
    score += Math.min(u.name.length, 20) / 100;
    if (!bestUser || score > bestUser.score) bestUser = { user: u, score };
  }
  if (bestUser && bestUser.score >= 50) return { character: null, user: bestUser.user };
  if (best) return { character: best.char, user: state.users[best.char.ownerId] ?? null };
  return { character: null, user: null };
}

export interface AvatarResolvers {
  character: (c: Character) => string;
  user: (u: User) => string;
}

export function buildDraft(opts: {
  fileNames: string[];
  channels: Channel[];
  attachLog: Log | null;
  presetTable: string;
  presetScenario: string;
  state: Pick<State, "me" | "characters" | "users" | "tables" | "scenarios">;
  avatars: AvatarResolvers;
}): Draft {
  const { fileNames, channels, attachLog, presetTable, presetScenario, state, avatars } = opts;
  const inferred = channels.length ? inferSystem(channels) : null;
  const guess = inferred ? { id: inferred.id } : null;
  const presetSc = presetScenario ? state.scenarios[presetScenario] : undefined;
  const tableId = attachLog?.tableId ?? presetTable;
  const table = tableId ? state.tables[tableId] : undefined;
  const systemId = attachLog?.systemId ?? presetSc?.systemId ?? guess?.id ?? table?.systemId ?? "general";

  const kinds: Record<string, MsgKind> = {};
  const speakerOrder: string[] = [];
  channels.forEach((ch) =>
    ch.msgs.forEach((m) => {
      if (!kinds[m.sp]) speakerOrder.push(m.sp);
      if (m.kind === "KP" || m.kind === "GM" || m.kind === "SYSTEM") {
        kinds[m.sp] = m.kind;
      } else if (!kinds[m.sp]) {
        kinds[m.sp] = m.kind;
      }
    }),
  );

  const speakerIcons: Record<string, string> = { ...attachLog?.speakerIcons };
  const speakerLinks: Record<string, SpeakerLink> = {};
  const playerMap = new Map<string, string[]>();

  if (attachLog && Object.keys(attachLog.players).length > 0) {
    Object.entries(attachLog.players).forEach(([userId, p]) => {
      if (userId !== state.me) playerMap.set(userId, [...p.characterIds]);
    });
  } else if (table) {
    table.memberIds.filter((m) => m !== state.me).forEach((m) => playerMap.set(m, []));
  }
  const participantIds = [...playerMap.keys(), state.me];
  const prevSelf = attachLog?.players[state.me];
  const selfChars: string[] = [...(prevSelf?.characterIds ?? [])];
  let selfGm = false;
  let selfPl = false;

  for (const sp of speakerOrder) {
    const matched = matchSpeakerToState(sp, state, {
      preferredSystemId: systemId,
      participantIds,
      icon: speakerIcons[sp],
    });
    if (matched.character) {
      const ch = matched.character;
      speakerLinks[sp] = { userId: ch.ownerId, characterId: ch.id };
      if (!speakerIcons[sp]) speakerIcons[sp] = avatars.character(ch);
      if (ch.ownerId !== state.me) {
        const list = playerMap.get(ch.ownerId) ?? [];
        if (!list.includes(ch.id)) list.push(ch.id);
        playerMap.set(ch.ownerId, list);
      } else {
        if (!selfChars.includes(ch.id)) selfChars.push(ch.id);
        selfPl = true;
      }
    } else if (matched.user) {
      const u = matched.user;
      if (kinds[sp] === "PC") {
        // 「GM」「KP」だけの名前は isGenericRoleName で誰にも結び付かないので、ここでは区切りが続く形だけを見る
        if (/^GM[\s:：／/]/i.test(sp)) kinds[sp] = "GM";
        else if (/^KP[\s:：／/]/i.test(sp)) kinds[sp] = "KP";
        else kinds[sp] = "PL";
      }
      speakerLinks[sp] = { userId: u.id };
      if (!speakerIcons[sp]) speakerIcons[sp] = avatars.user(u);
      if (u.id !== state.me && !playerMap.has(u.id)) playerMap.set(u.id, []);
      if (u.id === state.me && (kinds[sp] === "GM" || kinds[sp] === "KP")) selfGm = true;
    }
  }

  const players = Array.from(playerMap.entries()).map(([userId, characterIds]) => ({ userId, characterIds }));
  const derived = deriveSittings(channels);

  return {
    fileNames,
    channels,
    kinds,
    speakerIcons,
    speakerLinks,
    meta: { systemId },
    guess,
    scope: attachLog?.scope ?? "members",
    tableId,
    scenarioId: attachLog?.scenarioId ?? presetScenario,
    newScenario: null,
    players,
    self: {
      played: true,
      role: selfGm ? "GM" : selfPl ? "PL" : (prevSelf?.role ?? "PL"),
      characterIds: selfChars,
    },
    sittings: derived.length > 0 ? derived : (attachLog?.sittings ?? []),
  };
}

/**
 * ログを足した・外したときに作り直した下書き（fresh）へ、利用者がすでに決めたこと（prev）を引き継ぐ。
 * タイトル・システム・シナリオ・卓・共有範囲・参加者はそのまま、発言者ごとの設定は残っている発言者の分だけ残す。
 * 遊んだ時間帯はログの発言時刻から導き直す（導けなければ前の値）
 */
export function carryDraftEdits(prev: Draft, fresh: Draft): Draft {
  const keep = <T>(fromPrev: Record<string, T>, fromFresh: Record<string, T>, keys: string[]) => {
    const out: Record<string, T> = {};
    for (const k of keys) {
      const v = k in fromPrev ? fromPrev[k] : fromFresh[k];
      if (v !== undefined) out[k] = v;
    }
    return out;
  };
  const speakers = Object.keys(fresh.kinds);
  const players = [...prev.players];
  for (const p of fresh.players) if (!players.some((x) => x.userId === p.userId)) players.push(p);
  return {
    ...fresh,
    kinds: keep(prev.kinds, fresh.kinds, speakers),
    speakerIcons: keep(prev.speakerIcons, fresh.speakerIcons, speakers),
    speakerLinks: keep(prev.speakerLinks, fresh.speakerLinks, speakers),
    meta: prev.meta,
    guess: prev.guess,
    scope: prev.scope,
    tableId: prev.tableId,
    scenarioId: prev.scenarioId,
    newScenario: prev.newScenario,
    players,
    self: prev.self,
    sittings: fresh.sittings.length > 0 ? fresh.sittings : prev.sittings,
  };
}
