import type { Channel, SystemDef } from "../types";

export const SYSTEMS: Record<string, SystemDef> = {
  coc7: {
    id: "coc7",
    name: "クトゥルフ神話TRPG 7版",
    short: "クトゥルフ神話TRPG 7版",
    color: "#3f5e78",
    emoji: "CoC7",
    stats: [
      { key: "san", label: "SAN", max: 99 },
      { key: "mp", label: "MP", max: 20 },
    ],
    growthLabel: "成長ロール",
    growthNote: "成功した技能を卓後に振って、失敗すれば値が上がります",
    skills: [
      "目星",
      "聞き耳",
      "図書館",
      "心理学",
      "回避",
      "闘争",
      "追跡",
      "応急手当",
      "精神分析",
      "母国語",
      "コンピューター",
      "隠れる",
      "天文学",
    ],
  },
  coc6: {
    id: "coc6",
    name: "クトゥルフ神話TRPG 6版",
    short: "クトゥルフ神話TRPG 6版",
    color: "#4e5b7c",
    emoji: "CoC6",
    stats: [
      { key: "san", label: "SAN", max: 99 },
      { key: "mp", label: "MP", max: 20 },
    ],
    growthLabel: "成長ロール",
    growthNote: "成功した技能を卓後に振って、失敗すれば値が上がります",
    skills: [
      "目星",
      "聞き耳",
      "図書館",
      "心理学",
      "回避",
      "こぶし",
      "追跡",
      "応急手当",
      "精神分析",
      "母国語",
    ],
  },
  emoklore: {
    id: "emoklore",
    name: "エモクロアTRPG",
    short: "エモクロアTRPG",
    color: "#854c68",
    emoji: "エモ",
    stats: [
      { key: "von", label: "共鳴", max: 10 },
      { key: "taisyo", label: "対象", max: 10 },
    ],
    growthLabel: "修得",
    growthNote: "セッション報酬で能力を修得します",
    skills: ["神術", "魔術", "近接", "弓術", "知識", "交渉", "運動", "感知"],
  },
  sw25: {
    id: "sw25",
    name: "ソード・ワールド2.5",
    short: "ソード・ワールド2.5",
    color: "#a85224",
    emoji: "SW",
    stats: [
      { key: "hp", label: "HP", max: 40 },
      { key: "mp", label: "MP", max: 30 },
    ],
    growthLabel: "成長",
    growthNote: "経験点を消費して技能Lvを上げます",
    skills: [
      "冒険者技能",
      "戦闘技能",
      "行使",
      "練技",
      "賦術",
      "射撃",
      "打撃",
      "回避",
      "生命抵抗",
      "精神抵抗",
    ],
  },
  madamis: {
    id: "madamis",
    name: "マーダーミステリー",
    short: "マーダーミステリー",
    color: "#5c554e",
    emoji: "MM",
    stats: [],
    growthLabel: "体験",
    growthNote: "シナリオ体験の記録として残します",
    skills: [],
  },
  general: {
    id: "general",
    name: "汎用・その他",
    short: "汎用・その他",
    color: "#6b5d50",
    emoji: "汎用",
    stats: [],
    growthLabel: "記録",
    growthNote: "自由な記録として残します",
    skills: [],
  },
};

export const SYSTEM_LIST = Object.values(SYSTEMS);

/**
 * ログのロール形式・テキストからシステムを自動推定する。
 */
export function inferSystem(channels: Channel[]): { id: string } | null {
  let coc = 0;
  let emo = 0;
  let sw = 0;
  channels.forEach((c) =>
    c.msgs.forEach((m) => {
      const t = `${m.roll?.cmd ?? ""} ${m.roll?.skill ?? ""} ${m.text ?? ""}`;
      if (/CC<=|CBR|SANチェック|SAN ?\d*D\d/.test(t)) coc++;
      if (/結合|自分:不可能|神術|修得/.test(t)) emo++;
      if (/2D6/.test(t)) sw++;
    }),
  );
  if (emo > 0 && emo >= coc) return { id: "emoklore" };
  if (coc > 0) return { id: "coc7" };
  if (sw > 0) return { id: "sw25" };
  return null;
}
