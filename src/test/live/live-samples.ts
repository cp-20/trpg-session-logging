/**
 * 公開一覧から拾えないものだけ、ここに固定の見本を置く（*.live.test.ts が使う）。
 * 実在の公開ページの ID だけを持ち、中身（名前・本文）は持たない。消されたら同じ探し方で差し替える。
 */

/**
 * 冒険窓口: 持ち主が「外部ツールからの参照」を許したキャラクターだけ API で読める（ほかは 404）。
 * 探し方: https://lhrpg.com/lhz/search の「登録数ランキング」から pc?id= をたどり、/lhz/api/{id}.json が 200 のもの
 */
export const LHRPG_PC_IDS = [112, 4972];

/** キャラエノの開発者向け文書（公開 API の出力例として 6 版・7 版の ID が載る）。ここから見本を拾う */
export const CHARAENO_DEVELOPER_DOC =
  "https://gist.githubusercontent.com/ysakasin/567e44da06fe879a36536b0ee2049b9a/raw";

/**
 * キャラッシュ: 公開キャラクターの一覧が無いので、開発者向けページ（https://charash.jp/developers）の
 * 公式の見本（/api/v1/characters/{id} と同じ形式）を、取り込みの読み取りに通す
 */
export const CHARASH_SAMPLES = ["coc6", "coc7", "emoklore"] as const;

/** いあきゃら: 公開のタグ一覧（閲覧ページと同じ API）から拾うときのタグ */
export const IACHARA_TAG = "サンプル";

/** 関連するもの（動画・投稿）の見本。長く残っている公開のもの */
export const MEDIA_SAMPLES = {
  youtube: ["https://www.youtube.com/watch?v=jNQXAC9IVRw", "https://youtu.be/jNQXAC9IVRw"],
  niconico: ["https://www.nicovideo.jp/watch/sm9", "https://nico.ms/sm9"],
  fusetter: [
    "https://fusetter.com/tw/3PRQbftj",
    "https://fusetter.com/tw/7haTFvmO",
    "https://fusetter.com/tw/AWHYP",
  ],
  x: ["https://x.com/jack/status/20", "https://twitter.com/jack/status/20"],
} as const;
