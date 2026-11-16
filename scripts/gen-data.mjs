/**
 * 卓譜 モックデータ生成スクリプト
 *   node scripts/gen-data.mjs  →  src/data/generated.json
 *
 * - 実際に近いボリューム: ユーザー12 / 卓8 / キャラ16 / シナリオ12 / セッション16
 * - セッションは3〜6.5時間。複数日にまたがる卓もある
 * - メッセージには epoch 秒のタイムスタンプを付け、日付・開始・終了はそこから算出できる形で残す
 * - ダイスロールは発言と独立した行(type:"roll")として生成する
 * - 乱数はシード固定（mulberry32）で毎回同じデータになる
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "generated.json");

/* ---------- 乱数 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261115);
const ri = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;

/* ---------- JST ---------- */
const JST = 9 * 3600;
function jstEpoch(date, time) {
  const [h, m] = time.split(":").map(Number);
  return Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000) + h * 3600 + m * 60 - JST;
}
function jstDate(ts) {
  const d = new Date((ts + JST) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function nextDay(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- ユーザー ---------- */
const users = [
  { id: "u_mikan",  name: "みかん",  color: "#5348c8", bio: "KPとPLの両方。継続探索者を伸ばすのが好き。", accounts: [{ provider: "google", status: "linked", externalId: "go_10823457", verifiedAt: "2026-08-01" }, { provider: "discord", status: "linked", externalId: "328915401", verifiedAt: "2026-08-01" }] },
  { id: "u_sora",   name: "そら",    color: "#178a5b", bio: "5年目のCoC PL。卓後の感想文が得意。", accounts: [{ provider: "discord", status: "linked", externalId: "55190233", verifiedAt: "2026-08-20" }] },
  { id: "u_kai",    name: "カイ",    color: "#c2762c", accounts: [{ provider: "discord", status: "linked", externalId: "88120199", verifiedAt: "2026-08-20" }] },
  { id: "u_hina",   name: "ひな",    color: "#c23b4b", accounts: [{ provider: "x", status: "linked", externalId: "hina_xz", verifiedAt: "2026-09-12" }] },
  { id: "u_rin",    name: "りん",    color: "#2f8fa3", accounts: [{ provider: "google", status: "linked", externalId: "go_60213371", verifiedAt: "2026-10-02" }] },
  { id: "u_natsu",  name: "なつ",    color: "#d1893a", accounts: [{ provider: "discord", status: "linked", externalId: "77322190", verifiedAt: "2026-09-01" }] },
  { id: "u_makoto", name: "まこと",  color: "#3f7f5f", accounts: [{ provider: "google", status: "linked", externalId: "go_55201998", verifiedAt: "2026-10-12" }] },
  { id: "u_aoi",    name: "あおい",  color: "#b03a68", bio: "マダミスをよく主催する。", accounts: [{ provider: "x", status: "linked", externalId: "aoi_mm", verifiedAt: "2026-10-15" }] },
  { id: "u_yura",   name: "由良",    color: "#7a6ea0", accounts: [{ provider: "discord", status: "linked", externalId: "44102288", verifiedAt: "2026-10-20" }] },
  { id: "u_yashimo", name: "夜霜",   color: "#555b6e", bio: "KP。廃校ものをよく回す。", accounts: [{ provider: "x", status: "linked", externalId: "yashimo_kp", verifiedAt: "2026-07-30" }] },
  { id: "u_sasa",   name: "佐々",    color: "#7a6ea0", bio: "SWとエモクロアのKP。", accounts: [{ provider: "discord", status: "linked", externalId: "99012345", verifiedAt: "2026-08-11" }] },
  { id: "u_toma",   name: "灯馬",    color: "#4d6a8f", bio: "初心者向けCoCを月1で回す。", accounts: [{ provider: "google", status: "linked", externalId: "go_77810023", verifiedAt: "2026-09-05" }] },
];

/* ---------- システム ---------- */
const SYS = {
  coc7: { skills: [["目星", 70], ["聞き耳", 60], ["図書館", 65], ["心理学", 60], ["回避", 50], ["闘争", 55], ["追跡", 55], ["応急手当", 60], ["母国語", 75], ["コンピューター", 50], ["隠れる", 45], ["投擲", 40], ["説明", 60]] },
};

/* ---------- 卓 ---------- */
const tables = [
  { id: "t_haikou",  name: "廃校部",            systemId: "coc7",     ownerId: "u_yashimo", memberIds: ["u_yashimo", "u_mikan", "u_sora", "u_kai", "u_hina"], note: "隔週土曜の夜。学校ものを中心に回す卓。" },
  { id: "t_shiosai", name: "潮騒の会",          systemId: "coc7",     ownerId: "u_mikan",   memberIds: ["u_mikan", "u_sora", "u_rin", "u_natsu"], note: "港町シリーズを進行中。全3回の継続キャンペーン。" },
  { id: "t_ougonto", name: "黄金亭の冒険者",    systemId: "sw25",     ownerId: "u_sasa",    memberIds: ["u_sasa", "u_mikan", "u_kai", "u_hina"], note: "SW2.5の継続パーティ。月1ペース。" },
  { id: "t_yomatsuri", name: "夜祭班",          systemId: "emoklore", ownerId: "u_sasa",    memberIds: ["u_sasa", "u_sora", "u_aoi"], note: "エモクロア。神民たちの夜祭シリーズ。" },
  { id: "t_madamis", name: "マダミス研究会",    systemId: "madamis",  ownerId: "u_aoi",     memberIds: ["u_aoi", "u_sora", "u_mikan", "u_hina"], note: "月2でマダミス。初心者歓迎。" },
  { id: "t_nyuumon", name: "CoC入門実験団",     systemId: "coc7",     ownerId: "u_toma",    memberIds: ["u_toma", "u_makoto", "u_natsu", "u_yura"], note: "初参加向けの1回完結卓。" },
  { id: "t_keizoku", name: "継続探索者の間",    systemId: "coc7",     ownerId: "u_mikan",   memberIds: ["u_mikan", "u_sora", "u_kai", "u_rin", "u_hina", "u_makoto"], note: "継続探索者で色々なシナリオを渡り歩く卓。" },
  { id: "t_zatsu",   name: "ボイセ雑談卓",      systemId: "general",  ownerId: "u_kai",     memberIds: ["u_kai", "u_natsu", "u_yura"], note: "音声のゆるい卓。ログは残さないことも多い。" },
];

/* ---------- シナリオ ---------- */
const scenarios = [
  { id: "sc_kankyo", title: "廃校の十三時間目", author: "しおかぜ堂", systemId: "coc7", source: "booth", sourceUrl: "https://booth.pm/ja/items/4710900", policy: "members", emoji: "🏫", bg: "#e8e3d6", tags: ["学校", "1〜2回"], extraRuns: 4, description: "一夜で十三時間目を迎える学校もの。", claimedBy: null, addedBy: "system" },
  { id: "sc_abyss", title: "深淵の呼び声", author: "夜霜サークル", systemId: "coc7", source: "booth", sourceUrl: "https://booth.pm/ja/items/4821337", policy: "public", emoji: "🌊", bg: "#dcecf5", tags: ["港町", "全3回"], extraRuns: 9, description: "港町に沈んだものを追う3回シリーズ。", claimedBy: "u_yashimo", addedBy: "system" },
  { id: "sc_hitori", title: "「ねえ、いい子にしてて」", author: "自由記述（未登録）", systemId: "coc7", source: "manual", policy: "unknown", emoji: "💬", bg: "#e6e6f0", tags: ["学校", "自作"], description: "KPの自作。カタログには自由記述で登録。", claimedBy: null, addedBy: "user", addedByUid: "u_yashimo" },
  { id: "sc_amamiya", title: "雨宮家の食卓", author: "神隠し工房", systemId: "coc7", source: "booth", sourceUrl: "https://booth.pm/ja/items/4501922", policy: "public", emoji: "🍚", bg: "#efe8da", tags: ["家常", "会話系"], description: "食卓をめぐる静かな怪異。", claimedBy: null, addedBy: "system" },
  { id: "sc_tsukiyuki", title: "月長石の夢路", author: "月読堂", systemId: "coc7", source: "talto", sourceUrl: "https://talto.io/works/19220", policy: "members", emoji: "🌙", bg: "#e2e4f0", tags: ["夢", "音楽"], description: "夢と現実を往復するシナリオ。", claimedBy: null, addedBy: "system" },
  { id: "sc_kyouen", title: "狂宴は儂の隣で", author: "泡沫フィルム", systemId: "emoklore", source: "talto", sourceUrl: "https://talto.io/works/20113", policy: "public", emoji: "🎭", bg: "#f3e0e6", tags: ["夜祭", "神様"], extraRuns: 18, description: "夜祭の行列を追う、神民と共闘のシナリオ。", claimedBy: null, addedBy: "system" },
  { id: "sc_oudan", title: "王都の黄金亭", author: "泡沫フィルム", systemId: "sw25", source: "talto", sourceUrl: "https://talto.io/works/18842", policy: "public", emoji: "🍺", bg: "#f0e6d2", tags: ["王道", "1回完結"], description: "酒場から始まる、軽めの依頼もの。", claimedBy: null, addedBy: "system" },
  { id: "sc_kaze", title: "風来の旅路", author: "しおかぜ堂", systemId: "sw25", source: "booth", sourceUrl: "https://booth.pm/ja/items/4630221", policy: "members", emoji: "🗺️", bg: "#e3efe2", tags: ["旅", "継続"], description: "登録済み。まだこの卓では回していない。", claimedBy: null, addedBy: "system" },
  { id: "sc_ameya", title: "雨の夜の館で", author: "自由記述（未登録）", systemId: "madamis", source: "manual", policy: "unknown", emoji: "🌧️", bg: "#dfe7ee", tags: ["マダミス", "7人"], description: "雨の夜、屋敷に閉じ込められた7人。", claimedBy: null, addedBy: "user", addedByUid: "u_aoi" },
  { id: "sc_meicha", title: "銘茶と殺意", author: "自由記述（未登録）", systemId: "madamis", source: "manual", policy: "unknown", emoji: "🍵", bg: "#e2ecdc", tags: ["マダミス", "和風"], description: "茶会を舞台にしたマーダーミステリー。", claimedBy: null, addedBy: "user", addedByUid: "u_aoi" },
  { id: "sc_shino", title: "篠鳴りの宿", author: "夜霜サークル", systemId: "coc7", source: "booth", sourceUrl: "https://booth.pm/ja/items/4910880", policy: "unknown", emoji: "🏮", bg: "#ece0d2", tags: ["旅館", "怪異"], description: "山あいの宿で泊まる恐怖。", claimedBy: "u_yashimo", addedBy: "system" },
  { id: "sc_yukimi", title: "雪見の二人", author: "月読堂", systemId: "coc7", source: "talto", sourceUrl: "https://talto.io/works/20500", policy: "public", emoji: "⛄", bg: "#e8f0f5", tags: ["冬", "2人"], description: "雪の降る夜、ふたりきりのシナリオ。", claimedBy: null, addedBy: "system" },
];

/* ---------- キャラクター ---------- */
const charsDef = [
  ["ch_towa",    "u_mikan",  "遠沢澄花", "coc7", "#5348c8", "継続探索者（ジャーナリスト）", "事件現場でつい口ずさむ。歌っていた探偵。", ["継続", "歌"], { san: 45, mp: 12 }],
  ["ch_rei",     "u_sora",   "白瀬怜",   "coc7", "#178a5b", "継続探索者（元看護師）", "静かだが、闇に強い。", ["継続", "医療"], { san: 55, mp: 13 }],
  ["ch_yuzuki",  "u_kai",    "如月柚希", "coc7", "#c2762c", "継続探索者（大学生）", "直感と逃足だけは自信がある。", ["継続", "学生"], { san: 42, mp: 10 }],
  ["ch_nami",    "u_hina",   "波多乃波音", "coc7", "#3a7ca5", "継続探索者（イラストレーター）", "耳で絵を描く。", ["継続", "創作"], { san: 52, mp: 11 }],
  ["ch_mio",     "u_rin",    "灯堂澪",   "coc7", "#946bb8", "継続探索者（書店員）", "海の匂いが好き。それだけの話だった。", ["継続", "海"], { san: 49, mp: 12 }],
  ["ch_natsu",   "u_natsu",  "桐生那津", "coc7", "#d1893a", "新規探索者（カメラマン）", "シャッターを切るのが仕事。", ["新規", "写真"], { san: 58, mp: 11 }],
  ["ch_makoto",  "u_makoto", "天城誠",   "coc7", "#3f7f5f", "継続探索者（医学生）", "血を見るのは慣れている。", ["継続", "医学"], { san: 53, mp: 10 }],
  ["ch_kei",     "u_yura",   "由良見景", "coc7", "#7a6ea0", "新規探索者（同人作家）", "資料集めが止まらない。", ["新規", "執筆"], { san: 62, mp: 12 }],
  ["ch_meiko",   "u_aoi",    "九条迷子", "coc7", "#b03a68", "継続探索者（占い師）", "ORIZURU の折り鶴を持ち歩く。", ["継続", "占い"], { san: 47, mp: 13 }],
  ["ch_himiko",  "u_sora",   "卑弥子",   "emoklore", "#8a4fbf", "神民（巫）", "目を借りるのが得意。", ["巫", "神術"], { von: 4, taisyo: 6 }],
  ["ch_rinko",   "u_aoi",    "燐光",     "emoklore", "#5b8d7a", "神民（灯守）", "灯を絶やさない。", ["灯守", "感知"], { von: 7, taisyo: 5 }],
  ["ch_akantha", "u_mikan",  "アカンタ", "sw25", "#b3541e", "エルフの射手", "酒には弱い。", ["射手", "継続"], { hp: 32, mp: 18 }],
  ["ch_grin",    "u_hina",   "グリン",   "sw25", "#6b8e23", "ドワーフの神官", "鉄と麦の信仰。", ["神官", "継続"], { hp: 38, mp: 16 }],
  ["ch_suya",    "u_natsu",  "錫夜",     "sw25", "#7f8ea3", "魔動物使い", "パートナーの名は『壺』。", ["魔動物", "新規"], { hp: 28, mp: 20 }],
  ["ch_kuro",    "u_sora",   "黒沢玖",   "madamis", "#546e7a", "容疑者（歌手）", "今日の歌は、あなたのため。", ["歌手"], {}],
  ["ch_jun",     "u_aoi",    "白鳥润",   "madamis", "#c98a9d", "客（茶人）", "今日一杯は、最後にするつもりだった。", ["茶人"], {}],
];

/* ---------- セッション定義 ---------- */
const KP = "KP";
const sessions = [
  { id: "s01", title: "廃校の十三時間目 — 通し",     tableId: "t_haikou",  scenarioId: "sc_kankyo",  systemId: "coc7",     ownerId: "u_yashimo", dates: ["2026-09-12"], start: "13:00", scope: "members", hasLog: true,  size: 58, scenes: 6, secret: true,  endLabel: "正常END「卒業式」" },
  { id: "s02", title: "深淵の呼び声 — 第1陣",       tableId: "t_shiosai", scenarioId: "sc_abyss",   systemId: "coc7",     ownerId: "u_mikan",   dates: ["2026-09-26"], start: "20:30", scope: "public",  hasLog: true,  size: 62, scenes: 6, secret: true,  endLabel: "正常END「寄港」" },
  { id: "s03", title: "深淵の呼び声 — 第2陣",       tableId: "t_shiosai", scenarioId: "sc_abyss",   systemId: "coc7",     ownerId: "u_mikan",   dates: ["2026-10-10"], start: "20:00", scope: "public",  hasLog: true,  size: 66, scenes: 7, secret: true,  endLabel: "正常END「退潮」" },
  { id: "s04", title: "王都の黄金亭",               tableId: "t_ougonto", scenarioId: "sc_oudan",   systemId: "sw25",     ownerId: "u_sasa",    dates: ["2026-09-20"], start: "19:00", scope: "members", hasLog: true,  size: 48, scenes: 5, secret: false, endLabel: "正常END「銀貨の行方」" },
  { id: "s05", title: "「ねえ、いい子にしてて」",   tableId: "t_haikou",  scenarioId: "sc_hitori",  systemId: "coc7",     ownerId: "u_yashimo", dates: ["2026-10-24"], start: "21:00", scope: "members", hasLog: true,  size: 56, scenes: 6, secret: true,  endLabel: "正常END「後夜祭」" },
  { id: "s06", title: "雨宮家の食卓",               tableId: "t_nyuumon", scenarioId: "sc_amamiya", systemId: "coc7",     ownerId: "u_toma",    dates: ["2026-10-17"], start: "19:30", scope: "members", hasLog: true,  size: 52, scenes: 5, secret: true,  endLabel: "正常END「おかわり」" },
  { id: "s07", title: "狂宴は儂の隣で",             tableId: "t_yomatsuri", scenarioId: "sc_kyouen", systemId: "emoklore", ownerId: "u_sasa",   dates: ["2026-10-31"], start: "20:30", scope: "public",  hasLog: true,  size: 50, scenes: 5, secret: false, endLabel: "正常END「宴のあと」" },
  { id: "s08", title: "深淵の呼び声 — 第3陣・完結", tableId: "t_shiosai", scenarioId: "sc_abyss",   systemId: "coc7",     ownerId: "u_mikan",   dates: ["2026-11-07"], start: "20:00", scope: "members", hasLog: true,  size: 72, scenes: 8, secret: true,  endLabel: "BAD END「海の聲」", multiday: true },
  { id: "s09", title: "月長石の夢路",               tableId: "t_nyuumon", scenarioId: "sc_tsukiyuki", systemId: "coc7",   ownerId: "u_toma",    dates: ["2026-11-03"], start: "21:00", scope: "members", hasLog: true,  size: 46, scenes: 4, secret: false, endLabel: "正常END「目覚まし時計」" },
  { id: "s10", title: "廃校の十三時間目 — 後夜祭",  tableId: "t_haikou",  scenarioId: "sc_kankyo",  systemId: "coc7",     ownerId: "u_yashimo", dates: ["2026-11-14", "2026-11-15"], start: "21:00", scope: "members", hasLog: true, size: 60, scenes: 6, secret: true, endLabel: "正常END「新しい朝」", multiday: true },
  { id: "s11", title: "雨の夜の館で",               tableId: "t_madamis", scenarioId: "sc_ameya",   systemId: "madamis",  ownerId: "u_aoi",     dates: ["2026-10-30"], start: "19:00", scope: "passed",  hasLog: false, players: ["u_aoi", "u_sora", "u_mikan", "u_hina"] },
  { id: "s12", title: "銘茶と殺意",                 tableId: "t_madamis", scenarioId: "sc_meicha",  systemId: "madamis",  ownerId: "u_aoi",     dates: ["2026-11-13"], start: "19:30", scope: "members", hasLog: false, players: ["u_aoi", "u_sora", "u_hina", "u_rin"] },
  { id: "s13", title: "王都の黄金亭 — 二周目",      tableId: "t_ougonto", scenarioId: "sc_oudan",   systemId: "sw25",     ownerId: "u_sasa",    dates: ["2026-11-06"], start: "19:00", scope: "members", hasLog: false, players: ["u_sasa", "u_mikan", "u_kai", "u_hina"] },
  { id: "s14", title: "風来の旅路 — 旅立ちの回",    tableId: "t_ougonto", scenarioId: "sc_kaze",    systemId: "sw25",     ownerId: "u_sasa",    dates: ["2026-11-05"], start: "20:00", scope: "members", hasLog: false, players: ["u_sasa", "u_mikan", "u_natsu"] },
  { id: "s15", title: "雪見の二人",                 tableId: "t_keizoku", scenarioId: "sc_yukimi",  systemId: "coc7",     ownerId: "u_mikan",   dates: ["2026-11-01"], start: "21:30", scope: "passed",  hasLog: true,  size: 34, scenes: 3, secret: false, endLabel: "正常END「雪どけ」" },
  { id: "s16", title: "廃校部 談話会",              tableId: "t_haikou",  scenarioId: null,         systemId: "coc7",     ownerId: "u_yashimo", dates: ["2026-11-15"], start: "21:00", scope: "members", hasLog: false, players: ["u_yashimo", "u_mikan", "u_sora", "u_kai", "u_hina"] },
];

/* ---------- テキストプール ---------- */
const POOL = {
  coc7: {
    intro: [
      "——月のない夜だった。集合時刻より5分早く着いたのは、私が一番だった。",
      "——当日。受付に人影はない。机の上に、番号札だけが並んでいる。",
      "——現場に向かう車中、ラジオだけが流れていた。天気予報は、雨。",
    ],
    kp: [
      "扉を開けた瞬間、匂いで分かった。ここは長いあいだ人の気配を知らない。",
      "廊下の電球が、通り過ぎるたびに1個ずつ消えていく。",
      "そこにあったはずの扉が、ない。戻って数えても、ない。",
      "床に、湿った足跡。歩幅からして、誰かが逆立ちして歩いたようにも見える。",
      "『いらっしゃい』と、誰かの声がする。玄関の方から。",
      "窓の外に、立っている影。2つ。3つ。数えるのをやめた。",
      "階段の下から、水の音。この建物に水脈はないはずだが。",
      "手帳の最後のページに、見覚えのない文字で、あなたの名前が書かれている。",
      "時計の針だけが、逆に回り始める。",
      "誰かが、歌っている。旋律は聞いたことがあるのに、思い出せない。",
      "配付物の裏に、手書きの一行。『ごめんね。いい子にしててね』",
      "天井の染みが、ゆっくりと形を変える。人の顔の形に。",
      "「ここから先は、戻れなくても仕方ないと思ってね」と、案内人は笑う。",
      "黒板に、今日の日付が書かれている。あと十三時間、ある。",
      "契約書を渡される。差出人の欄は、あなたの字で埋まっていた。",
      "写真を撮る。現像すると、1枚だけ余分な写真が混じっていた。",
    ],
    pc: [
      "「……静かすぎるな。慎重に行こう」",
      "「この手がかり、一つ前の現場と繋がってる気がする」",
      "「わたしが先に見てくる。何かあったら呼んで」",
      "「……悪くない場所だ。ただ、『人』の気配がしない」",
      "「メモした。あとで『そら』さんと照合しよう」",
      "「勝手に決めないで。私たちにも、選ぶ権利はあるはずだ」",
      "「やけに手際がいいな、この気配。……怖いな、むしろ」",
      "「 San を削る前に、一度落ち着かせて。深呼吸、深呼吸……」",
      "「この写真、載せたらまずいやつでは？」",
      "「みんなの分も、生きて帰る。約束する」",
      "「……踏んではいけない。わかる、この床、わかる」",
      "「だめだ、ここは明後日の方向に逃げよう。即座に」",
      "「灯りは保存。予備は私が持つ」",
      "「この建物、明らかに私たちを迎える準備ができてるよね？」",
    ],
    chat: [
      "トイレ休憩3分お願いします",
      "戻ります（コーヒー注ぎ中）",
      "今の判断、いいと思う！",
      "ダイス……また君か",
      "（メモ）あとで感想文書きます",
      "この卓、本当に毎回画になるなあ",
      "お腹すいた（深夜枠あるある）",
      "SAN足りてます？（聞いてない）",
      "次回、いつにしましょうか",
      "KP、今日も最高でした",
    ],
    secret: [
      "【シークレット】この部屋の本名を、PL全員にだけ告げる。PCにはまだ知らせないこと。",
      "【シークレット】ここで1度だけ、目的の目標を hint する。失敗したら再提示はしない。",
      "【シークレット】もし全員がこの選択肢を選んだら、以下の分岐へ移る。",
      "【シークレット】この場面のSAN損失は、他の場面と重複しない。",
      "【シークレット】このNPCの本音。PLには最後まで明かさない。",
    ],
    end: [
      "——END。みんな、無事に帰れた。……はず。",
      "——END。朝が来る。その朝を、あなたは覚えていない。",
      "——END。記録はここまで。あなたの記憶は、まだ続いている。",
    ],
  },
  sw25: {
    intro: ["——王都の酒場「黄金亭」。昼下がりの依頼は、消えた銀貨の行方。", "——旅路の途中。野営地の火を囲みながら、地図を広げる。"],
    kp: [
      "軒先の看板が、風で鳴る。『本日の推し：煮込み』",
      "依頼人の手には、割れた鍵束。部屋の鍵は、まだ残っている。",
      "「銀貨はね、返せばいいってもんじゃないんだよ」と、老人は笑う。",
      "屋根の上に、影。止まったまま、こちらを見ている。",
      "衛兵が通り過ぎる。足音が、2人分多い。",
      "地図の赤い丸の位置には、何もない。はずだった。",
      "パーティ wallet から、銀貨が1枚減っている。誰のでもない。",
      "「宿は取ってある」と言った男の顔を、誰も覚えていない。",
    ],
    pc: [
      "「めんどくさい依頼だな。……受けるか」",
      "「請求書はちゃんと、あの店に回してくれよ」",
      "「銀貨の行方より、この男の『顔』の行方が知りたい」",
      "「パーティで割り勘しよう。命の他は」",
      "「威嚇射撃！ ……じゃなくて、威嚇宣告！」",
      "「罠は私が見る。みんなは道を空けて」",
    ],
    chat: ["休憩10分いいですか？", "経験点、今日でいくつでしたっけ？", "次の買い物、大盾にしようかな", "KP、罠が辛い（褒め言葉）"],
    secret: ["【シークレット】銀貨の出どころ。ここでだけ、全員に告げる。", "【シークレット】依頼人の本当の目的。"],
    end: ["——END。銀貨は、最初から君のポケットにあった。", "——END。宿の看板の灯が、消れるまで。"],
  },
  emoklore: {
    intro: ["——夜祭の通り。面を着けた行列が、鐘に合わせて歩いている。"],
    kp: [
      "行列の先頭に、面のない神がいる。それでも『笑っている』とわかる。",
      "屋台の縁日から、子どもの笑い声。時刻は丑三つ時だが。",
      "「宴に参加しない者は、宴の皿になる」と、囃子方が歌う。",
      "鐘が鳴る。あなたの胸のうちでも、鐘が鳴る。",
    ],
    pc: [
      "「目を借ります。行列の先に、何がいるのか」",
      "「神様だって、挨拶くらいはするでしょう？」",
      "「灯は絶やさない。それが今の私の神務です」",
      "「縁に招かれたなら、ちゃんと挨拶して帰りましょう」",
    ],
    chat: ["休憩5分お願いします", "神術の指定、これで合ってます？", "この神様、いい味出してる"],
    secret: ["【シークレット】宴の主の真名。ここでだけ、全員に告げる。"],
    end: ["——END。宴のあと。灯りは、まだ消えない。"],
  },
  madamis: {
    intro: ["——雨の夜、屋敷に7人が集まった。"],
    kp: ["夜通し続く雨。屋敷の時計は、0時を指したまま。"],
    pc: ["「ですから、私は雨宿りに来ただけで……」", "「疑うなら、ちゃんと理由を挙げてくださいね」"],
    chat: ["配役表、確認しました", "休憩5分！"],
    secret: [],
    end: [],
  },
};

const KP_POOLS = { coc7: POOL.coc7, sw25: POOL.sw25, emoklore: POOL.emoklore, madamis: POOL.madamis };

function rollResult(roll, target) {
  if (roll <= 5) return "クリティカル";
  if (roll >= 96) return "ファンブル";
  if (roll <= Math.floor(target / 5)) return "スペシャル";
  if (roll <= target) return "成功";
  return "失敗";
}

/* ---------- メッセージ生成 ---------- */
function genMessages(s) {
  const pool = KP_POOLS[s.systemId];
  const sysSkills = SYS.coc7.skills;
  const table = tables.find((t) => t.id === s.tableId);
  const members = table ? table.memberIds.filter((u) => u !== s.ownerId) : ["u_mikan", "u_sora"];
  const kpName = users.find((u) => u.id === s.ownerId).name;

  const charsByUser = {};
  charsDef.forEach(([, owner, name]) => (charsByUser[owner] ??= []).push(name));

  let ts = jstEpoch(s.dates[0], s.start);
  let dayIdx = 0;
  const msgs = { main: [], info: [], chat: [], secret: [] };
  const seq = [];
  const t = (ch, sp, kind, type, text, roll) => seq.push({ ch, sp, kind, type, text, roll, ts: 0, day: 0 });

  /* 導入 */
  t("main", kpName, KP, "text", pool.intro[0] ?? "——始まる。");
  if (chance(0.7)) t("main", kpName, KP, "text", pick(pool.kp));

  /* シーンループ */
  const sceneCount = s.scenes ?? 5;
  for (let sc = 0; sc < sceneCount; sc++) {
    t("main", kpName, KP, "text", pick(pool.kp));
    if (chance(0.4)) t("main", kpName, KP, "text", pick(pool.kp));
    const speakers = [...members].sort(() => rng() - 0.5).slice(0, ri(1, Math.min(2, members.length)));
    speakers.forEach((uid) => {
      const cname = charsByUser[uid]?.[0] ?? users.find((u) => u.id === uid).name;
      t("main", cname, "PC", "text", pick(pool.pc));
      /* ロール（独立行） */
      const nRolls = chance(0.55) ? ri(1, 2) : 0;
      for (let r = 0; r < nRolls; r++) {
        const [skill, target] = pick(sysSkills);
        const roll = ri(1, 100);
        t("main", cname, "PC", "roll", null, { cmd: `CC<=${target} ${skill}`, skill, dice: String(roll), result: rollResult(roll, target) });
      }
      if (chance(0.3)) t("main", cname, "PC", "text", pick(pool.pc));
    });
    if (chance(0.35)) {
      /* SANチェック */
      const c = members[Math.floor(rng() * members.length)];
      const cname = charsByUser[c]?.[0] ?? users.find((u) => u.id === c).name;
      const sanRoll = ri(1, 6);
      t("main", kpName, KP, "text", "（SANチェック 1/1D6）どうぞ。");
      t("main", cname, "PC", "roll", null, { cmd: "SAN 0/1D6", skill: "SANチェック", dice: `1D6→${sanRoll}`, result: `SAN−${sanRoll}` });
      t("main", cname, "PC", "text", pick(pool.pc));
    }
    if (chance(0.45)) t("main", kpName, KP, "note", "◆ シーン終了。");
    if (chance(0.3)) t("chat", pick(users).name, "PL", "text", pick(pool.chat));
    if (s.secret && chance(0.5)) t("secret", kpName, KP, "text", pick(pool.secret));
  }

  /* 中盤の秘密・情報 */
  t("info", kpName, KP, "text", "【導入】時刻と場所だけ共有します。その他は口頭で。");
  if (chance(0.8)) t("info", kpName, KP, "text", "【探索情報】現場の見取り図を共有します（ログ内では省略）。");

  /* 終盤 */
  t("main", kpName, KP, "text", pick(pool.kp));
  members.slice(0, 2).forEach((uid) => {
    const cname = charsByUser[uid]?.[0] ?? users.find((u) => u.id === uid).name;
    const [skill, target] = pick(sysSkills);
    const roll = ri(1, 100);
    t("main", cname, "PC", "roll", null, { cmd: `CC<=${target} ${skill}`, skill, dice: String(roll), result: rollResult(roll, target) });
    t("main", cname, "PC", "text", pick(pool.pc));
  });
  t("chat", pick(users).name, "PL", "text", pick(pool.chat));
  t("main", kpName, KP, "note", `——END「${(s.endLabel ?? "").replace(/^正常END|BAD END/, "").trim() || "END"}」。`);

  /* マルチデイ: 途中で翌日に跨る */
  const totalCount = seq.length;
  const target = Math.max(s.size ?? 50, totalCount + ri(4, 12));
  /* 足りない分を中盤に水増し挿入 */
  while (seq.length < target) {
    const i = ri(1, Math.max(1, seq.length - 3));
    if (chance(0.5)) {
      const uid = pick(members);
      const cname = charsByUser[uid]?.[0] ?? users.find((u) => u.id === uid).name;
      seq.splice(i, 0, { ch: "main", sp: cname, kind: "PC", type: "text", text: pick(pool.pc), roll: null, ts: 0, day: 0 });
    } else {
      seq.splice(i, 0, { ch: "main", sp: kpName, kind: KP, type: "text", text: pick(pool.kp), roll: null, ts: 0, day: 0 });
    }
  }

  /* タイムスタンプ付与: 前半→後半、複数日は途中で翌晩へ */
  const isMulti = !!s.multiday;
  const halfway = Math.floor(seq.length * 0.55);
  seq.forEach((m, i) => {
    if (isMulti && i === halfway) {
      dayIdx = 1;
      ts = jstEpoch(s.dates[1] ?? nextDay(s.dates[0]), "20:30");
    }
    ts += ri(120, 420);
    m.ts = ts;
    m.day = dayIdx;
  });

  /* チャンネルへ分配 */
  const mk = (arr) => arr.map((m, i) => ({ ...m, id: `${s.id}-${m.ch}-${i}` }));
  const channels = [{ id: "main", name: "メイン", secret: false, msgs: mk(seq.filter((m) => m.ch === "main")) }];
  const infoMsgs = mk(seq.filter((m) => m.ch === "info"));
  if (infoMsgs.length) channels.push({ id: "info", name: "情報", secret: false, msgs: infoMsgs });
  const chatMsgs = mk(seq.filter((m) => m.ch === "chat"));
  if (chatMsgs.length) channels.push({ id: "chat", name: "チャット", secret: false, msgs: chatMsgs });
  const secretMsgs = mk(seq.filter((m) => m.ch === "secret"));
  if (secretMsgs.length) channels.push({ id: "secret", name: "タブ3", secret: true, msgs: secretMsgs });

  return channels;
}

/* ---------- セッション構築 ---------- */
const logs = {};
for (const s of sessions) {
  const table = tables.find((t) => t.id === s.tableId);
  const memberIds = s.players ?? (table ? table.memberIds : []);
  const players = {};
  memberIds.forEach((u) => {
    players[u] = { linked: u !== "u_yura" || s.ownerId === "u_toma", hidden: false, characterIds: [] };
  });

  let channels = [];
  let dates = s.dates;
  let t0, t1;
  if (s.hasLog) {
    channels = genMessages(s);
    const all = channels.flatMap((c) => c.msgs.map((m) => m.ts)).sort((a, b) => a - b);
    t0 = all[0];
    t1 = all[all.length - 1];
    dates = [...new Set(all.map((x) => new Date((x + JST - 6 * 3600) * 1000).toISOString().slice(0, 10)))];
  } else {
    t0 = jstEpoch(s.dates[0], s.start);
    t1 = t0 + ri(3, 6) * 3600 + ri(0, 59) * 60;
  }

  logs[s.id] = {
    id: s.id,
    title: s.title,
    tableId: s.tableId,
    scenarioId: s.scenarioId ?? undefined,
    systemId: s.systemId,
    ownerId: s.ownerId,
    scope: s.scope,
    hasLog: s.hasLog,
    endLabel: s.hasLog ? s.endLabel : undefined,
    channels,
    players,
    createdAt: new Date((t1 + JST) * 1000).toISOString().slice(0, 19),
    dates,
    t0,
    t1,
  };
}

/* ---------- キャラクター構築 ---------- */
const characters = {};
const byName = {};
charsDef.forEach(([, owner, name]) => (byName[name] = owner));

charsDef.forEach(([id, owner, name, systemId, color, archetype, bio, tags, stats]) => {
  const sessionsStat = [];
  const growth = [];
  Object.values(logs)
    .filter((l) => l.hasLog)
    .sort((a, b) => a.t0 - b.t0)
    .forEach((l) => {
      const p = l.players[owner];
      if (!p || !p.linked) return;
      if (l.systemId !== systemId) return;
      const rolls = [];
      l.channels.forEach((c) => c.msgs.forEach((m) => {
        if (m.type === "roll" && m.sp === name && m.roll) rolls.push(m.roll);
      }));
      if (rolls.length === 0 && systemId !== "madamis") return;
      const date = l.dates[0];
      const delta = {};
      if (systemId === "coc7") {
        const before = stats.san + sessionsStat.reduce((a, s) => a + (s.delta.san ? s.delta.san.after - s.delta.san.before : 0), 0) + ri(0, 3);
        const loss = rolls.some((r) => r.result.startsWith("SAN−")) ? ri(2, 6) : ri(0, 2);
        delta.san = { before, after: Math.max(8, before - loss) };
      } else if (systemId === "emoklore") {
        delta.von = { before: stats.von, after: Math.max(0, stats.von - ri(0, 2)) };
      } else if (systemId === "sw25") {
        delta.hp = { before: stats.hp, after: Math.max(8, stats.hp - ri(5, 14)) };
      }
      sessionsStat.push({
        logId: l.id,
        date,
        title: l.title,
        scenarioId: l.scenarioId,
        rolls,
        delta,
        memo: pick([
          "終始冷静だったが、最後の場面で手が震えた。",
          "正直な申告が功を奏した。",
          "逃げ足だけは評価された。",
          "記録と発言の合致が、後のヒントになった。",
          "席を外した間に大きな展開があった（要聞き直し）。",
        ]),
      });
      /* 成長 */
      const okRolls = rolls.filter((r) => r.result === "成功" || r.result === "スペシャル");
      if (okRolls.length && chance(0.55)) {
        const r = pick(okRolls);
        const dayAfter = nextDay(date);
        const from = r.skill === "SANチェック" ? 50 : ri(50, 70);
        growth.push({ id: `g_${id}_${growth.length}`, date: dayAfter, logId: l.id, skill: r.skill === "SANチェック" ? "正気度境界" : r.skill, from, to: from + ri(5, 9), note: pick(["卓後の自習で", "成功の余韻で", "KP推奨の練習で", "記録を見返して"]) });
      }
    });
  if (systemId === "emoklore" && sessionsStat.length) {
    growth.push({ id: `g_${id}_emo`, date: sessionsStat[0].date, logId: sessionsStat[0].logId, skill: "神術:加護", from: 0, to: 1, note: "セッション報酬で修得" });
  }
  if (systemId === "sw25" && sessionsStat.length) {
    growth.push({ id: `g_${id}_sw`, date: sessionsStat[0].date, logId: sessionsStat[0].logId, skill: "射撃(Lv)", from: 2, to: 3, note: "経験点1290を投入" });
  }
  /* 成長を日付順に */
  growth.sort((a, b) => a.date.localeCompare(b.date));
  /* 最終statsはSAN系のみ反映（デモ用の簡易整合） */
  const finalStats = { ...stats };
  if (systemId === "coc7" && sessionsStat.length) {
    const last = sessionsStat.at(-1);
    finalStats.san = last.delta.san.after;
  }
  characters[id] = {
    id, ownerId: owner, name, systemId, color, archetype, bio, tags,
    stats: finalStats,
    sessions: sessionsStat,
    growth,
    share: { enabled: true, scope: "link", includeProfile: true, includeStats: true, includeGrowth: true, includeSessions: true },
    import: { source: pick(["CCFOLIA キャラクターJSON", "いあきゃら .txt", "キャラクター保管所 URL", "手入力"]), importedAt: "2026-09-05" },
  };
});

/* セッションのplayersにキャラクターを付ける */
Object.values(logs).forEach((l) => {
  Object.entries(l.players).forEach(([uid, p]) => {
    if (!p.linked) return;
    const mine = Object.values(characters).filter((c) => c.ownerId === uid && c.systemId === l.systemId);
    p.characterIds = mine.slice(0, 1).map((c) => c.id);
  });
});

/* ---------- 出力 ---------- */
const out = {
  users,
  tables,
  scenarios,
  logs,
  characters,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
const msgCount = Object.values(logs).reduce((a, l) => a + l.channels.reduce((x, c) => x + c.msgs.length, 0), 0);
console.log(`generated.json written: users=${users.length} tables=${tables.length} chars=${Object.keys(characters).length} scenarios=${scenarios.length} logs=${Object.keys(logs).length} msgs=${msgCount}`);
