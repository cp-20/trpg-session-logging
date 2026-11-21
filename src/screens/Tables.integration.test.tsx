import { getTestNav, renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Tables, { TableDetail } from "./Tables";

describe("Tables + PlayerPicker(fixedIds) + TableDetail + PollDetailModal 結合テスト", () => {
  it("自分を固定行として含んだ卓を作成し、詳細画面で日程調整を直接開いて確定できる", async () => {
    const user = userEvent.setup();
    const listView = renderWithStore(<Tables />, { initialPath: "/tables" });

    await user.click(screen.getByRole("button", { name: /卓を作成/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // 自分は常に先頭固定行（「自分」表記、チェックボックスなし）
    expect(screen.getByText("自分")).toBeInTheDocument();

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
});
