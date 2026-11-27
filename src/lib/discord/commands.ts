/**
 * Discord に登録するスラッシュコマンド（scripts/discord.ts register が送る）。
 * scripts から node で直に読むので、ほかのモジュールを読み込まない。
 * 名前は英字で、何をするかを表す（親の「/卓譜」の下にまとめると、何ができるのか名前から分からない）。
 * 打つときに日本語入力へ切り替えずに済む。説明と項目名は日本語
 */
export const CMD = {
  LINK: "connect",
  UNLINK: "disconnect",
  POLLS: "schedule",
  CHARACTERS: "characters",
  ROLL: "roll",
  CHOICE: "choice",
} as const;
export const VOICE_OPTION = "ボイス";
export const SHOW_OPTION = "みんなに見せる";
export const DICE_OPTION = { EXPR: "式", ITEMS: "候補", COUNT: "個数", SECRET: "自分だけ" } as const;

const BOOLEAN = 5;
const INTEGER = 4;
const CHANNEL = 7;
const STRING = 3;
const GUILD_VOICE = 2;

/** サーバーに入れたときだけ（DM では使わない） */
const IN_GUILD = { type: 1, contexts: [0], integration_types: [0] } as const;

export const COMMANDS = [
  {
    ...IN_GUILD,
    name: CMD.LINK,
    description: "このチャンネルを卓譜の卓とつなぎます（チャンネルの管理の権限が要ります）",
    options: [
      {
        type: CHANNEL,
        name: VOICE_OPTION,
        description: "予定を Discord のイベントにするときのボイスチャンネル",
        channel_types: [GUILD_VOICE],
        required: false,
      },
    ],
  },
  { ...IN_GUILD, name: CMD.UNLINK, description: "このチャンネルと卓譜の卓のつながりを外します" },
  { ...IN_GUILD, name: CMD.POLLS, description: "この卓の、回答を受け付けている日程調整" },
  {
    ...IN_GUILD,
    name: CMD.CHARACTERS,
    description: "卓譜で自分が公開しているキャラクター",
    options: [
      { type: BOOLEAN, name: SHOW_OPTION, description: "チャンネルのみんなに見せます", required: false },
    ],
  },
  {
    ...IN_GUILD,
    name: CMD.ROLL,
    description: "ダイスを振ります（2d6+3、1d100<=60 目星、4d6kh3、x3 2d6、choice[A,B,C]）",
    options: [
      {
        type: STRING,
        name: DICE_OPTION.EXPR,
        description: "例: 2d6+3、1d100<=60 目星",
        required: true,
        max_length: 200,
      },
      { type: BOOLEAN, name: DICE_OPTION.SECRET, description: "結果を自分だけに見せます", required: false },
    ],
  },
  {
    ...IN_GUILD,
    name: CMD.CHOICE,
    description: "候補から選びます",
    options: [
      {
        type: STRING,
        name: DICE_OPTION.ITEMS,
        description: "「,」か空白で区切った候補（例: 東 西 南 北）",
        required: true,
        max_length: 1000,
      },
      {
        type: INTEGER,
        name: DICE_OPTION.COUNT,
        description: "重ならないように選ぶ数（既定は 1）",
        required: false,
        min_value: 1,
        max_value: 100,
      },
      { type: BOOLEAN, name: DICE_OPTION.SECRET, description: "結果を自分だけに見せます", required: false },
    ],
  },
] as const;
