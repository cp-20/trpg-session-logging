/**
 * /roll・/choice。データを読まないので、遅らせずにその場で返す。
 * 卓とつないでいないチャンネルでも使える（ダイスは卓譜の記録とは別）。
 */
import { choiceLine, cryptoRandomInt, DiceError, rollCommand, splitChoices, type Render } from "../dice";
import { CHOICE_COMMAND, DICE_OPTION } from "./commands";
import type { DiscordContext } from "./context";
import { EPHEMERAL, notice, plain, type DiscordMessage } from "./messages";

/** Discord の本文は 2000 文字まで */
const CONTENT_LIMIT = 2000;

const DISCORD_RENDER: Render = {
  // 式に出る記号のうち Discord の書式になるのは「*」だけ（打ち消しの「~~」は残す）
  expr: (s) => s.replace(/\*/g, "\\*"),
  text: plain,
  strike: (s) => `~~${s}~~`,
  bold: (s) => `**${s}**`,
};

interface Option {
  name: string;
  value?: string | number | boolean;
}

function fit(lines: string[]): string {
  const out: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > CONTENT_LIMIT - 20) {
      out.push("…（長いので省きました）");
      break;
    }
    out.push(line);
    length += line.length + 1;
  }
  return out.join("\n");
}

export function diceMessage(ctx: DiscordContext, command: string, options: Option[]): DiscordMessage {
  const get = (name: string) => options.find((o) => o.name === name)?.value;
  const rnd = ctx.randomInt ?? cryptoRandomInt;
  try {
    let lines: string[];
    let comment = "";
    if (command === CHOICE_COMMAND) {
      const count = get(DICE_OPTION.COUNT);
      const items = splitChoices(String(get(DICE_OPTION.ITEMS) ?? ""));
      lines = [choiceLine(items, typeof count === "number" ? count : 1, rnd, DISCORD_RENDER).text];
    } else {
      const result = rollCommand(String(get(DICE_OPTION.EXPR) ?? ""), rnd, DISCORD_RENDER);
      lines = result.lines.map((l) => l.text);
      comment = result.comment;
    }
    const secret = get(DICE_OPTION.SECRET) === true;
    return {
      content: fit(comment ? [plain(comment), ...lines] : lines),
      allowed_mentions: { parse: [] },
      ...(secret ? { flags: EPHEMERAL } : {}),
    };
  } catch (error) {
    if (!(error instanceof DiceError)) throw error;
    return notice(`${error.message}\n例: 2d6+3、1d100<=60 目星、4d6kh3、x3 2d6、choice[東,西,南,北]`);
  }
}
