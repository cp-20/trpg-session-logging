import { renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { jstEpoch } from "../lib/format";
import Upload from "./Upload";

/** Udonarium の chat.xml（time は epoch ミリ秒） */
const chatXml = (rows: [tab: string, name: string, time: number, text: string][]) =>
  `<chat-tab-list>${rows
    .map(
      ([tab, name, time, text]) =>
        `<chat tab="${tab}" name="${name}" timestamp="${time * 1000}">${text}</chat>`,
    )
    .join("")}</chat-tab-list>`;

const day1 = jstEpoch("2026-11-07", "21:00");
const day2 = jstEpoch("2026-11-14", "21:00");

describe("Upload: ログの取り込みから記録まで", () => {
  it("日ごとのログを 2 つ選ぶと 1 つのセッションにまとまり、遊んだ日時が 2 回になる", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Upload />, { initialPath: "/upload" });

    const first = new File(
      [
        chatXml([
          ["main", "KP", day1, "始めます"],
          ["main", "遠沢澄花", day1 + 3600, "目星"],
          ["main", "KP", day1 + 3 * 3600, "今日はここまで"],
        ]),
      ],
      "day1.xml",
    );
    const second = new File(
      [
        chatXml([
          ["main", "KP", day2, "再開します"],
          ["main", "KP", day1 + 3 * 3600, "今日はここまで"], // 前のファイルと重なった発言
          ["情報", "KP", day2 + 600, "資料"],
          ["main", "遠沢澄花", day2 + 2 * 3600, "生還"],
        ]),
      ],
      "day2.xml",
    );
    await user.upload(screen.getByLabelText("ログファイルを選ぶ"), [first, second]);

    await waitFor(() => expect(screen.getByLabelText("タイトル")).toBeInTheDocument());
    expect(screen.getByText("day1.xml")).toBeInTheDocument();
    expect(screen.getByText("day2.xml")).toBeInTheDocument();
    // 遊んだ日時はログの時刻から 2 回分入っている。終わりは同じ日
    expect(screen.getByLabelText("1回目の日付")).toHaveValue("2026/11/07");
    expect(screen.getByLabelText("2回目の日付")).toHaveValue("2026/11/14");
    expect(screen.getByLabelText("2回目の開始時刻")).toHaveValue("21:00");
    expect(screen.getByLabelText("2回目の終了時刻")).toHaveValue("23:00");

    await user.type(screen.getByLabelText("タイトル"), "廃校夜話テスト卓");
    await user.click(screen.getAllByRole("button", { name: "記録する" })[0]!);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "セッションを記録しました" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "セッションを開く" })).toBeInTheDocument();

    const persisted = view.readPersistedState()!;
    const created = Object.values(persisted.logs).find((l) => l.title === "廃校夜話テスト卓")!;
    expect(created.hasLog).toBe(true);
    expect(created.sittings).toEqual([
      { start: day1, end: day1 + 3 * 3600 },
      { start: day2, end: day2 + 2 * 3600 },
    ]);
    // 同じ名前のタブは 1 つに、重なった発言は 1 つに
    expect(created.channels.map((c) => c.name)).toEqual(["メイン", "情報"]);
    expect(created.channels.flatMap((c) => c.msgs)).toHaveLength(6);
    expect(created.importedFrom).toBe("day1.xml、day2.xml");
    // 記録した本人は参加者。KP の発言者が本人でなければ PL
    expect(created.players[view.readPersistedState()!.me]).toMatchObject({ linked: true, role: "PL" });
  });

  it("構造化されていないファイルは読まず、何を選べばよいかを伝える", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithStore(<Upload />, { initialPath: "/upload" });
    await user.upload(
      screen.getByLabelText("ログファイルを選ぶ"),
      new File(["[2026/11/08 21:05] 花子\nやあ"], "discord.txt"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("「discord.txt」を読み取れませんでした。");
    expect(screen.queryByLabelText("タイトル")).toBeNull();
  });

  it("ログなしでは日時を入れて記録し、日をまたぐ終わりは翌日として残る", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Upload />, { initialPath: "/upload?manual=1" });
    await user.type(screen.getByLabelText("タイトル"), "日時だけの卓");
    const date = screen.getByLabelText("日付");
    await user.clear(date);
    await user.type(date, "2026/10/17");
    const start = screen.getByLabelText("開始時刻");
    await user.clear(start);
    await user.type(start, "21:00");
    const end = screen.getByLabelText(/終了時刻/);
    await user.clear(end);
    await user.type(end, "2:30");
    expect(screen.getByLabelText("終了時刻（翌日）")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "記録する" })[0]!);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "セッションを記録しました" })).toBeInTheDocument(),
    );
    const created = Object.values(view.readPersistedState()!.logs).find((l) => l.title === "日時だけの卓")!;
    expect(created.hasLog).toBe(false);
    expect(Object.keys(created.players)).toContain(view.readPersistedState()!.me);
    expect(created.sittings).toEqual([
      { start: jstEpoch("2026-10-17", "21:00"), end: jstEpoch("2026-10-18", "02:30") },
    ]);
  });
});
