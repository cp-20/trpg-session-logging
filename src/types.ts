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
}

export interface SystemDef {
  id: string;
  name: string;
  short: string;
  color: string;
  emoji: string;
  stats: { key: string; label: string; max?: number }[];
  growthLabel: string;
  growthNote: string;
  skills: string[];
}

export type Policy = "public" | "members" | "unknown";

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

export interface Log {
  id: string;
  title: string;
  tableId?: string;
  scenarioId?: string;
  systemId: string;
  ownerId: string;
  scope: Scope;
  hasLog: boolean;
  endLabel?: string;
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
}

export interface Prefs {
  hideSelfOnShare: boolean;
}

export interface ScenarioEditRequest {
  id: string;
  scenarioId: string;
  uid: string;
  at: string;
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
  editRequests: ScenarioEditRequest[];
}
