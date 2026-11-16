import type { SystemDef } from "../types";

/**
 * システム定義。CoC7 は最優先で手厚く、他システムは共通の枠に落とし込む。
 * UI はこの定義から統計値・成長表現・技能候補を引き受ける。
 */
export const SYSTEMS: Record<string, SystemDef> = {
  coc7: {
    id: "coc7",
    name: "クトゥルフ神話TRPG 7版",
    short: "CoC7",
    color: "#3b5bdb",
    emoji: "🐙",
    stats: [
      { key: "san", label: "SAN", max: 99 },
      { key: "mp", label: "MP", max: 20 },
    ],
    growthLabel: "成長ロール",
    growthNote: "成功した技能を卓後に振って、失敗すれば値が上がります",
    skills: ["目星", "聞き耳", "図書館", "心理学", "回避", "闘争", "追跡", "応急手当", "母国語", "コンピューター", "隠れる", "天文学", "(その他)"],
  },
  coc6: {
    id: "coc6",
    name: "クトゥルフ神話TRPG 6版",
    short: "CoC6",
    color: "#5a63c9",
    emoji: "🐙",
    stats: [
      { key: "san", label: "SAN", max: 99 },
      { key: "mp", label: "MP", max: 20 },
    ],
    growthLabel: "成長ロール",
    growthNote: "成功した技能を卓後に振って、失敗すれば値が上がります",
    skills: ["目星", "聞き耳", "図書館", "心理学", "回避", "闘争", "追跡", "応急手当", "母国語", "(その他)"],
  },
  emoklore: {
    id: "emoklore",
    name: "エモクロアTRPG",
    short: "エモクロア",
    color: "#8a4fbf",
    emoji: "🕯️",
    stats: [
      { key: "von", label: "自分(不可能)", max: 10 },
      { key: "taisyo", label: "対象", max: 10 },
    ],
    growthLabel: "修得",
    growthNote: "セッション報酬で能力を修得します",
    skills: ["神術", "魔術", "近接", "弓術", "知識", "交渉", "運動", "感知", "(その他)"],
  },
  sw25: {
    id: "sw25",
    name: "ソード・ワールド2.5",
    short: "SW2.5",
    color: "#b3541e",
    emoji: "⚔️",
    stats: [
      { key: "hp", label: "HP", max: 40 },
      { key: "mp", label: "MP", max: 30 },
    ],
    growthLabel: "成長",
    growthNote: "経験点を消費して技能Lvを上げます",
    skills: ["冒険者技能", "戦闘技能", "行使", "練技", "賦術", "構術", "射撃", "打撃", "回避", "生命抵抗", "精神抵抗", "(その他)"],
  },
  madamis: {
    id: "madamis",
    name: "マーダーミステリー",
    short: "マダミス",
    color: "#546e7a",
    emoji: "🔪",
    stats: [],
    growthLabel: "体験",
    growthNote: "シナリオ体験の記録として残します",
    skills: [],
  },
  general: {
    id: "general",
    name: "汎用 / その他",
    short: "汎用",
    color: "#6d7f8f",
    emoji: "🎲",
    stats: [],
    growthLabel: "記録",
    growthNote: "自由な記録として残します",
    skills: [],
  },
};

export const SYSTEM_LIST = Object.values(SYSTEMS);

export const POLICY_LABEL: Record<string, string> = {
  public: "公開ログ可",
  members: "メンバー限定",
  unknown: "ポリシー未確認",
};

export const POLICY_HINT: Record<string, string> = {
  public: "作者が公開ログを許可しています。",
  members: "共有はメンバー（紐付けられたアカウント）まで。それ以上は広げられません。",
  unknown: "ログルールが未確認のため、メンバー限定として扱っています。",
};
