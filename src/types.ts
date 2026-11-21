import type { CharacterSheet } from "./lib/sheet";
import type { SessionMedia } from "./lib/session-media";
export type Provider = "google" | "discord" | "x" | "booth" | "talto";
export type AccountStatus = "linked" | "pending" | "none";

export interface LinkedAccount {
  provider: Provider;
  status: AccountStatus;
  externalId?: string;
  verifiedAt?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

export interface User {
  id: string;
  name: string;
  color: string;
  accounts: LinkedAccount[];
  bio?: string;
  email?: string;
  image?: string;
  profilePublic?: boolean;
}

/** システムの値。`carry` は卓をまたいで続く値（SAN など）。HP・MP のように毎回戻るものは付けない */
export interface SystemStatDef {
  key: string;
  label: string;
  max?: number;
  carry?: boolean;
}

export interface SystemDef {
  id: string;
  name: string;
  short: string;
  color: string;
  emoji: string;
  stats: SystemStatDef[];
  growthLabel: string;
  growthNote: string;
  skills: string[];
}

export type Policy = "public" | "passed" | "members" | "unknown";

export type ExternalSyncProvider =
  | "iachara"
  | "charasheet"
  | "ytsheet"
  | "emoklore"
  | "charaeno"
  | "charash"
  | "booth"
  | "talto";

export interface ExternalSyncConfig {
  provider: ExternalSyncProvider;
  url: string;
  lastSyncedAt?: string;
  lastStatus?: "ok" | "error";
  lastError?: string;
  contentHash?: string;
  autoSync: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  author: string;
  systemId: string;
  source: "booth" | "talto" | "url" | "manual";
  sourceUrl?: string;
  policy: Policy;
  emoji: string;
  bg: string;
  tags: string[];
  description?: string;
  claimedBy?: string | null;
  /** カタログ行の由来: system = 取り込み等によるシステム側登録 / user = ユーザーが自由に追加 */
  addedBy: "system" | "user";
  addedByUid?: string;
  /** カタログ上で既知のラン数（この卓での記録の外側） */
  extraRuns?: number;
  externalSync?: ExternalSyncConfig;
}

/** 卓: メンバーグループ。セッションに紐付け、後から日程調整にも使う */
export interface Table {
  id: string;
  name: string;
  systemId?: string;
  ownerId: string;
  memberIds: string[];
  note?: string;
  createdAt: string;
}

export interface Roll {
  cmd: string;
  skill: string;
  dice: string;
  result: string;
  secret?: boolean;
}

export type MsgKind = "PC" | "NPC" | "KP" | "PL" | "GM" | "SYSTEM";
export type MsgType = "text" | "note" | "roll";

export interface Msg {
  id: string;
  /** epoch秒。時刻・日付・セッション長はここから算出する */
  ts: number;
  sp: string;
  kind: MsgKind;
  type: MsgType;
  /** roll のときは null */
  text?: string | null;
  roll?: Roll;
}

export interface Channel {
  id: string;
  name: string;
  secret: boolean;
  msgs: Msg[];
}

export interface LinkState {
  linked: boolean;
  hidden: boolean;
  characterIds: string[];
}

export type Scope = "members" | "passed" | "public";

export interface SessionImpression {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  spoiler: boolean;
}

export interface Log {
  id: string;
  title: string;
  tableId?: string;
  scenarioId?: string;
  systemId: string;
  ownerId: string;
  scope: Scope;
  hasLog: boolean;
  channels: Channel[];
  players: Record<string, LinkState>;
  createdAt: string;
  /** セッション実施日（複数可）。ログからタイムスタンプ経由で算出 or 手入力 */
  dates: string[];
  /** 開始・終了 epoch秒 */
  t0: number;
  t1: number;
  /** 共有リンク用スラッグ */
  slug: string;
  /** 取り込み元ファイル(誠実な表示用) */
  importedFrom?: string;
  /** タイムラインの発言者名(sp)ごとのアイコン画像(data URL または Character/User ID) */
  speakerIcons?: Record<string, string>;
  impressions?: SessionImpression[];
  /** 録画・録音・配信・卓報告・絵など、このセッションに紐付くもの */
  media?: SessionMedia[];
}

export interface SessionStat {
  logId: string;
  date: string;
  title: string;
  scenarioId?: string;
  delta: Record<string, { before: number; after: number }>;
  rolls: Roll[];
  memo: string;
}

export interface GrowthRecord {
  id: string;
  date: string;
  logId?: string;
  skill: string;
  from: number;
  to: number;
  note?: string;
}

export interface CharacterShare {
  enabled: boolean;
  scope: "link" | "private";
  includeProfile: boolean;
  includeStats: boolean;
  includeGrowth: boolean;
  includeSessions: boolean;
}

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  systemId: string;
  color: string;
  /** キャラ画像(data URL)。CCFOLIA等の取り込みで設定される */
  image?: string;
  archetype: string;
  bio: string;
  tags: string[];
  stats: Record<string, number>;
  sessions: SessionStat[];
  growth: GrowthRecord[];
  share: CharacterShare;
  import?: { source: string; importedAt: string };
  externalSync?: ExternalSyncConfig;
  /** 取り込んだキャラシ（汎用形式の JSON）。あるときは名前・能力値・技能はキャラシが正 */
  sheet?: CharacterSheet;
}

export interface Prefs {
  hideSelfOnShare: boolean;
  onboardingDone?: boolean;
  /** 本人が手で入れた「予定のある日」（終日扱い） */
  busyDates?: string[];
  /** カレンダー購読リンクのトークン（作成済みのときだけ） */
  calendarFeedToken?: string;
  /** Google カレンダーの空き時間の照らし合わせ。本人が設定で許可したときだけ存在する */
  googleBusy?: GoogleBusyPrefs;
}

/** Google カレンダーから取り込んだ「予定が入っている時間帯」。件名などは持たない */
export interface BusyRange {
  /** どのカレンダーの時間帯か（カレンダーを外したときに消すため） */
  calendarId: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
}

export interface GoogleBusyPrefs {
  /** 許可した日時（ISO 8601） */
  consentedAt: string;
  /** 照らし合わせに使うカレンダー（名前は設定画面で見分けるためだけに持つ） */
  calendars: { id: string; name: string; on: boolean }[];
  /** 終日の予定も「予定あり」に数える */
  countAllDay: boolean;
  ranges: BusyRange[];
  /** 最後に取り込んだ日時（ISO 8601） */
  syncedAt?: string;
}

export type Availability = "ok" | "maybe" | "ng";

export interface TableEventCandidate {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  responses: Record<string, Availability>;
}

export interface TableEvent {
  id: string;
  tableId?: string;
  scenarioId?: string;
  title: string;
  status?: "confirmed" | "poll";
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMin?: number;
  note?: string;
  responses: Record<string, Availability>;
  candidates?: TableEventCandidate[];
  createdBy: string;
}

export interface ScenarioEditChanges {
  title?: string;
  author?: string;
  systemId?: string;
  sourceUrl?: string;
  tags?: string[];
  description?: string;
}

export interface ScenarioEditRequest {
  id: string;
  scenarioId: string;
  uid: string;
  at: string;
  changes?: ScenarioEditChanges;
  note?: string;
  status: "pending" | "accepted" | "rejected";
}

export interface State {
  me: string;
  entered: boolean;
  prefs: Prefs;
  users: Record<string, User>;
  tables: Record<string, Table>;
  characters: Record<string, Character>;
  scenarios: Record<string, Scenario>;
  logs: Record<string, Log>;
  events: Record<string, TableEvent>;
  editRequests: ScenarioEditRequest[];
}
