import { renderWithStore, serveScenarioDirectory } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
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

/** シナリオの欄で探して選ぶ（手元の写しにある作品） */
async function pickScenario(user: ReturnType<typeof userEvent.setup>, title: string) {
  const box = screen.getByRole("combobox", { name: "シナリオ" });
  await user.click(box);
  await user.type(box, title);
  await user.click(
    (await screen.findAllByRole("option")).find(
      (o) => o.textContent?.includes(title) && !o.textContent.includes("追加"),
    )!,
  );
}

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

    await waitFor(() => expect(screen.getByRole("combobox", { name: "シナリオ" })).toBeInTheDocument());
    expect(screen.getByText("day1.xml")).toBeInTheDocument();
    expect(screen.getByText("day2.xml")).toBeInTheDocument();
    // 遊んだ日時はログの時刻から 2 回分入っている。終わりは同じ日
    expect(screen.getByLabelText("1回目の日付")).toHaveValue("2026/11/07");
    expect(screen.getByLabelText("2回目の日付")).toHaveValue("2026/11/14");
    expect(screen.getByLabelText("2回目の開始時刻")).toHaveValue("21:00");
    expect(screen.getByLabelText("2回目の終了時刻")).toHaveValue("23:00");

    // シナリオを選ばずに記録しようとすると、シナリオを求める（セッションはシナリオの題名で呼ぶ）
    await user.click(screen.getAllByRole("button", { name: "記録する" })[0]!);
    expect(
      await screen.findByText("遊んだシナリオを選ぶか、名前を打って追加してください。"),
    ).toBeInTheDocument();
    await pickScenario(user, "深淵の呼び声");
    await user.click(screen.getAllByRole("button", { name: "記録する" })[0]!);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "セッションを記録しました" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "セッションを開く" })).toBeInTheDocument();

    const persisted = view.readPersistedState()!;
    const created = Object.values(persisted.logs).find((l) => l.importedFrom === "day1.xml、day2.xml")!;
    expect(persisted.scenarios[created.scenarioId]?.title).toBe("深淵の呼び声");
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
    expect(screen.queryByRole("combobox", { name: "シナリオ" })).toBeNull();
  });

  it("ログなしでは日時を入れて記録し、日をまたぐ終わり（26:30）は翌日として残る", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Upload />, { initialPath: "/upload?manual=1" });
    await pickScenario(user, "深淵の呼び声");
    const date = screen.getByLabelText("日付");
    await user.clear(date);
    await user.type(date, "2026/10/17");
    const start = screen.getByLabelText("開始時刻");
    await user.clear(start);
    await user.type(start, "21:00");
    const end = screen.getByLabelText(/終了時刻/);
    await user.clear(end);
    await user.type(end, "2:30");
    await user.tab();
    // 開始より前の終わりは、欄を離れると 24 を足した書き方（26:30）にそろう
    expect(end).toHaveValue("26:30");
    await user.click(screen.getAllByRole("button", { name: "記録する" })[0]!);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "セッションを記録しました" })).toBeInTheDocument(),
    );
    const created = Object.values(view.readPersistedState()!.logs).find(
      (l) => l.sittings[0]?.start === jstEpoch("2026-10-17", "21:00"),
    )!;
    expect(created.hasLog).toBe(false);
    expect(Object.keys(created.players)).toContain(view.readPersistedState()!.me);
    expect(created.sittings).toEqual([
      { start: jstEpoch("2026-10-17", "21:00"), end: jstEpoch("2026-10-18", "02:30") },
    ]);
  });

  it("シナリオ欄は打った言葉で共有シナリオ一覧をサーバーで探し、選ぶと記録に結ぶ写しを手元に置く", async () => {
    const user = userEvent.setup();
    await serveScenarioDirectory({
      talto: [
        {
          id: "t_far",
          title: "遠い灯台のうた",
          author: "しおかぜ堂",
          systemSlug: "call_of_cthulhu_6th",
          systemName: "クトゥルフ神話TRPG",
          playersMin: 2,
          playersMax: 3,
          hours: 4,
        },
      ],
    });
    const view = renderWithStore(<Upload />, { initialPath: "/upload?manual=1" });
    const field = screen.getByRole("combobox", { name: "シナリオ" });
    await user.click(field);
    await user.type(field, "遠い灯台");
    await user.click(await screen.findByRole("option", { name: /遠い灯台のうた/ }));
    expect(view.readPersistedState()!.scenarios.sc_talto_t_far).toMatchObject({
      title: "遠い灯台のうた",
      systemId: "coc6",
      source: "talto",
    });
    expect(field).toHaveValue("遠い灯台のうた");
  });
});
