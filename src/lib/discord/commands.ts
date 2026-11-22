/**
 * Discord に登録するスラッシュコマンド（scripts/discord.ts register が送る）。
 * scripts から node で直に読むので、ほかのモジュールを読み込まない
 */
export const COMMAND_NAME = "卓譜";
export const SUB = { LINK: "つなぐ", UNLINK: "はずす", POLLS: "日程", CHARACTERS: "キャラ" } as const;
export const VOICE_OPTION = "ボイス";
export const SHOW_OPTION = "みんなに見せる";

const SUBCOMMAND = 1;
const BOOLEAN = 5;
const CHANNEL = 7;
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
] as const;
