/**
 * ログの発言者が PC・NPC・描写のどれかの推定（ヒューリスティック）。CCFOLIA のログには区別が無いので、発言の様子から推す。
 * 外れることはある（取り込み画面で直せる）。手がかり:
 * - 名前が人物でない: 「9号車/探索箇所」「S1 悩める銀剣料理人」「前回のあらすじ」 → 描写（登場人物ではない）
 * - 振らずに数回だけ、長い地の文を流す: 「ボダレル平原」「今日も元気に出かけよう」 → 描写
 * - 伏せ字「？？？」は正体を隠した登場人物 → NPC
 * - 名前が量産の形: 「蛇人間A」「動く屍3」「支配された人間(1)」「蛇人間×2」 → NPC（よく喋る・振るなら PC のまま）
 * - よく喋るか、よく技能を振る → PC。技能ロールの多い卓で、振るのに技能を一度も振らない（攻撃だけ）なら NPC
 * - CoC の正気度ロールを振る → PC 寄り
 */
import type { Msg, MsgKind } from "../types";

/** 人物でない名前（場所・場面の見出し・あらすじ） */
const LABEL_NAME =
  /探索(?:箇所|場所)|[/／]|^(?:S|OP|ED|MD|CL|Scene|シーン)\s*[0-9０-９]+\s+\S|あらすじ|^(?:BGM|SE|情報|描写|導入|場面)$/i;
/** 伏せ字の名前（正体を隠した登場人物） */
const HIDDEN_NAME = /^[?？]+$/;
/** 量産の NPC の名前（末尾の記号・番号） */
const MOB_NAME = /(?:[A-ZＡ-Ｚ]|[0-9０-９]+|[(（][0-9０-９]+[)）]|[×xX][0-9０-９]+)$/;
const SAN_ROLL = /SAN|正気度/i;

/** 末尾のふりがな「 (ひきもと　ゆうさく)」を落とす（「砲撃魚B (アーティラリーフィッシュ)」の B を見るため） */
function baseName(sp: string): string {
  return sp.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim() || sp;
}

interface Stat {
  msgs: number;
  /** 地の文らしい発言（長いか複数行で、台詞の括弧で始まらない）の数 */
  prose: number;
  rolls: number;
  skillRolls: number;
  san: number;
}

/** 地の文らしいか: 長いか複数行で、台詞の括弧（「『（）で始まらない */
function isProse(text: string): boolean {
  const t = text.trim();
  if (/^[「『（(“"]/.test(t)) return false;
  return t.length >= 60 || t.split("\n").filter((l) => l.trim()).length >= 3;
}

/**
 * kind が PC と推されている発言者のうち、NPC か描写らしい発言者の種類を返す（PC のままの発言者は入れない）。
 * msgs は全チャンネルの発言。KP・GM・system などの発言者は数に入れない。
 */
export function inferSpeakerKinds(msgs: readonly Msg[]): Map<string, Extract<MsgKind, "NPC" | "NARRATION">> {
  const stats = new Map<string, Stat>();
  for (const m of msgs) {
    if (m.kind !== "PC") continue;
    const s = stats.get(m.sp) ?? { msgs: 0, prose: 0, rolls: 0, skillRolls: 0, san: 0 };
    s.msgs++;
    if (isProse(m.text ?? "")) s.prose++;
    if (m.roll) s.rolls++;
    if (m.roll?.skill) s.skillRolls++;
    if (m.roll && SAN_ROLL.test(`${m.roll.cmd} ${m.roll.skill}`)) s.san++;
    stats.set(m.sp, s);
  }
  const out = new Map<string, Extract<MsgKind, "NPC" | "NARRATION">>();
  /* 遊び手が 1 人しかいなければ比べようがない */
  if (stats.size <= 1) return out;
  const all = [...stats.values()];
  const maxMsgs = Math.max(...all.map((s) => s.msgs));
  const maxSkill = Math.max(...all.map((s) => s.skillRolls));
  /* 技能ロールで遊ぶ卓か（CoC など）。そうでなければ技能の有無は手がかりにしない */
  const skillTable = maxSkill >= 10;

  for (const [sp, s] of stats) {
    const name = baseName(sp);
    /* ダイスを振るなら登場人物（「S２」のような名前の人物もいる） */
    if (s.rolls === 0 && (LABEL_NAME.test(name) || (s.msgs <= 3 && s.prose === s.msgs))) {
      out.set(sp, "NARRATION");
      continue;
    }
    if (HIDDEN_NAME.test(name)) {
      out.set(sp, "NPC");
      continue;
    }
    const talk = s.msgs / maxMsgs;
    const skill = maxSkill > 0 ? s.skillRolls / maxSkill : 0;
    const presence = Math.max(talk, skill);
    const mob = MOB_NAME.test(name);
    const pc = (() => {
      if (mob) return presence >= 0.5;
      if (s.san > 0) return presence >= 0.2;
      /* 振るのに技能を一度も振らない（攻撃・ダメージだけ）のは敵 */
      if (skillTable && s.rolls >= 5 && s.skillRolls === 0) return false;
      /* よく喋る遊び手は、技能をあまり振らなくても PC */
      if (talk >= 0.4) return true;
      if (skillTable) return skill >= 0.15 && presence >= 0.18;
      return presence >= 0.18;
    })();
    if (!pc) out.set(sp, "NPC");
  }
  return out;
}
