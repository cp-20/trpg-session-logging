/**
 * Discord に登録するスラッシュコマンド（scripts/discord.ts register が送る）。
 * scripts から node で直に読むので、ほかのモジュールを読み込まない
 */
export const COMMAND_NAME = "卓譜";
export const SUB = { LINK: "つなぐ", UNLINK: "はずす", POLLS: "日程", CHARACTERS: "キャラ" } as const;
export const VOICE_OPTION = "ボイス";
export const SHOW_OPTION = "みんなに見せる";
/** ダイスは打つ回数が多いので、日本語入力に切り替えずに打てる名前にする（BCDice の書き方に合わせる） */
export const ROLL_COMMAND = "roll";
export const CHOICE_COMMAND = "choice";
export const DICE_OPTION = { EXPR: "式", ITEMS: "候補", COUNT: "個数", SECRET: "自分だけ" } as const;

const SUBCOMMAND = 1;
const BOOLEAN = 5;
const INTEGER = 4;
const CHANNEL = 7;
const STRING = 3;
const GUILD_VOICE = 2;

export const COMMANDS = [
  {
    name: COMMAND_NAME,
    type: 1,
    description: "卓譜の日程調整・予定・キャラクター",
    // サーバーに入れたときだけ（DM では使わない）
    contexts: [0],
    integration_types: [0],
    options: [
      {
        type: SUBCOMMAND,
        name: SUB.LINK,
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
      { type: SUBCOMMAND, name: SUB.UNLINK, description: "このチャンネルと卓のつながりを外します" },
      { type: SUBCOMMAND, name: SUB.POLLS, description: "この卓の回答を受け付けている日程調整" },
      {
        type: SUBCOMMAND,
        name: SUB.CHARACTERS,
        description: "自分が公開しているキャラクター",
        options: [
          { type: BOOLEAN, name: SHOW_OPTION, description: "チャンネルのみんなに見せます", required: false },
        ],
      },
    ],
  },
  {
    name: ROLL_COMMAND,
    type: 1,
    description: "ダイスを振ります（2d6+3、1d100<=60 目星、4d6kh3、x3 2d6、choice[A,B,C]）",
    contexts: [0],
    integration_types: [0],
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
    name: CHOICE_COMMAND,
    type: 1,
    description: "候補から選びます",
    contexts: [0],
    integration_types: [0],
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
