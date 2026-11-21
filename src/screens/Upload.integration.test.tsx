import { getTestNav, renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Upload from "./Upload";

describe("Upload + importers + history-import + commit コマンド結合テスト", () => {
  it("Discord テキストログの貼り付けから参加者設定・コミットまで結合で動作する", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Upload />, { initialPath: "/upload" });

    await user.click(screen.getByRole("button", { name: "テキストを貼り付ける" }));
    const pasteBox = screen.getByLabelText("ログテキストを貼り付け");
    await user.click(pasteBox);
    await user.paste(`[2026/11/10 21:00] KP: 佐々
廃校の前から始めます。

[2026/11/10 21:05] 遠沢澄花
1D100<=70 (CC<=70) ＞ 24 ＞ 成功`);

    await user.click(screen.getByRole("button", { name: "テキストを読み込む" }));

    await waitFor(() => expect(screen.getByLabelText("タイトル")).toBeInTheDocument());
    const titleInput = screen.getByLabelText("タイトル") as HTMLInputElement;
    await user.clear(titleInput);
    await user.type(titleInput, "廃校夜話テスト卓");

    await user.click(screen.getAllByRole("button", { name: "記録する" })[0]!);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "セッションを記録しました" })).toBeInTheDocument(),
    );

    const persisted = view.readPersistedState()!;
    const created = Object.values(persisted.logs).find((l) => l.title === "廃校夜話テスト卓");
    expect(created).toBeDefined();
    expect(created!.hasLog).toBe(true);
    expect(created!.dates).toEqual(["2026-11-10"]);
    expect(created!.channels.flatMap((c) => c.msgs)).toHaveLength(2);
  });

  it("通過履歴（CSV 表）から複数セッション・シナリオ・キャラを一括取り込みできる", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Upload />, { initialPath: "/upload" });

    await user.click(screen.getByRole("button", { name: /通過履歴を取り込む/ }));

    const csvInput = screen.getByLabelText(/表データ/);
    await user.click(csvInput);
    await user.paste(`日付,シナリオ,システム,キャラ,時間,メモ
2026-08-14,海も枯れるまで,CoC7,月見里 葵,5時間,生還
2026-09-20,新約・きさらぎ駅,エモクロア,月見里 葵,3時間,エンディングA`);

    await user.click(screen.getByRole("button", { name: "内容を確認" }));
    await waitFor(() => expect(screen.getByText(/2件の通過記録を読み取りました/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "2件を取り込む" }));

    await waitFor(() => expect(getTestNav().pathname).toBe("/sessions"));
    const persisted = view.readPersistedState()!;
    expect(Object.values(persisted.logs).some((l) => l.title === "海も枯れるまで")).toBe(true);
    expect(Object.values(persisted.logs).some((l) => l.title === "新約・きさらぎ駅")).toBe(true);
    expect(Object.values(persisted.scenarios).some((s) => s.title === "海も枯れるまで")).toBe(true);

    const aoi = Object.values(persisted.characters).find((c) => c.name === "月見里 葵");
    expect(aoi).toBeDefined();
    expect(aoi!.sessions).toHaveLength(2);
  });
});
