import { getTestNav, renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Tables, { TableDetail } from "./Tables";
import { JoinTable } from "./Entry";
import { DEMO_INVITE_TOKEN } from "../data/seed";

describe("Tables + TableDetail + 招待リンク + PollDetailModal 結合テスト", () => {
  it("卓名だけで卓を作成し、詳細画面で日程調整を直接開いて確定できる", async () => {
    const user = userEvent.setup();
    const listView = renderWithStore(<Tables />, { initialPath: "/tables" });

    await user.click(screen.getByRole("button", { name: /卓を作成/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // メンバーは名前で探して足さない（P14）。作成後に招待リンクで招く
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByLabelText("参加者を検索")).toBeNull();

    await user.type(screen.getByLabelText("卓名"), "深夜探索同好会");
    await user.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => expect(getTestNav().pathname).toMatch(/^\/tables\/t_/));
    const tableId = getTestNav().params.id!;

    const afterTableCreate = listView.readPersistedState()!;
    expect(afterTableCreate.tables[tableId]?.memberIds).toContain("u_mikan");
    listView.unmount();

    // その卓に日程調整イベントを追加した状態で TableDetail を開き、その場で PollDetailModal → 確定
    afterTableCreate.events.ev_table_poll = {
      id: "ev_table_poll",
      tableId,
      title: "第1話顔合わせ",
      status: "poll",
      date: "2026-12-12",
      startTime: "21:00",
      endTime: "24:00",
      responses: {},
      candidates: [
        { id: "c1", date: "2026-12-12", startTime: "21:00", endTime: "24:00", responses: { u_mikan: "ok" } },
      ],
      createdBy: "u_mikan",
    };

    const detailView = renderWithStore(<TableDetail />, {
      initialPath: `/tables/${tableId}`,
      params: { id: tableId },
      initialState: afterTableCreate,
    });

    await user.click(screen.getByRole("button", { name: /第1話顔合わせ/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /で確定/ }));
    await user.click(screen.getByRole("button", { name: "確定する" }));

    const saved = detailView.readPersistedState()!;
    expect(saved.events.ev_table_poll?.status).toBe("confirmed");
  });

  it("作成者は招待リンクを作って無効にでき、リンクを開いた人は卓の顔ぶれを見て参加できる", async () => {
    const user = userEvent.setup();
    const owner = renderWithStore(<TableDetail />, {
      initialPath: "/tables/t_shiosai",
      params: { id: "t_shiosai" },
    });
    // 名前で探す欄はない
    expect(screen.queryByLabelText("参加者を検索")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "30日間" }));
    await user.click(screen.getByRole("button", { name: "招待リンクを作る" }));
    await waitFor(() => expect(screen.getByText(/\/join\//)).toBeInTheDocument());
    const invite = owner.readPersistedState()!.tables.t_shiosai!.invite!;
    expect(invite.token.length).toBeGreaterThanOrEqual(32);
    expect(Date.parse(invite.expiresAt!) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    await user.click(screen.getByRole("button", { name: "無効にする" }));
    await waitFor(() => expect(owner.readPersistedState()!.tables.t_shiosai!.invite).toBeUndefined());
    owner.unmount();

    // 夜祭班（みかんはメンバーでない）の見本の招待
    const joinView = renderWithStore(<JoinTable />, {
      initialPath: `/join/${DEMO_INVITE_TOKEN}`,
      params: { token: DEMO_INVITE_TOKEN },
    });
    expect(screen.getByRole("heading", { level: 1, name: "夜祭班" })).toBeInTheDocument();
    expect(screen.getByText("@sasa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "この卓に参加する" }));
    await waitFor(() => expect(getTestNav().pathname).toBe("/tables/t_yomatsuri"));
    expect(joinView.readPersistedState()!.tables.t_yomatsuri!.memberIds).toContain("u_mikan");
  });
});
