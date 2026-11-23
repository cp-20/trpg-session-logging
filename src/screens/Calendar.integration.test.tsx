import { createDemoState, renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Calendar from "./Calendar";
import { buildFeedIcs } from "../lib/calendar-feed";
import { todayStr } from "../lib/format";

describe("Calendar + schedule + ics 結合テスト", () => {
  it("日程調整の開始 → 候補日で確定 → ICS 配信生成まで結合で反映される", async () => {
    const user = userEvent.setup();
    const initialState = createDemoState((s) => {
      // 既存の返事待ちは片付け、このテストの調整だけを狙い撃ちやすくする
      s.events = {};
    });
    const view = renderWithStore(<Calendar />, {
      initialPath: "/calendar",
      initialState,
    });

    await user.click(screen.getByRole("button", { name: /日程調整をはじめる/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const titleInput = screen.getByLabelText("タイトル");
    await user.type(titleInput, "新章イントロ相談");
    await user.click(screen.getByRole("button", { name: "日程調整を作成" }));

    await waitFor(() => expect(screen.getAllByText("新章イントロ相談").length).toBeGreaterThan(0));

    // 暦の候補（凡例なしで「候補」と分かる）から PollDetailModal を開き、1つ目の候補で確定する
    await user.click(screen.getAllByRole("button", { name: "候補 新章イントロ相談" })[0]!);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const confirmTrigger = screen.getAllByRole("button", { name: /で確定/ })[0]!;
    await user.click(confirmTrigger);
    await user.click(screen.getByRole("button", { name: "確定する" }));

    const saved = view.readPersistedState()!;
    const confirmed = Object.values(saved.events).find((e) => e.title === "新章イントロ相談");
    expect(confirmed).toBeDefined();
    expect(confirmed!.status).toBe("confirmed");

    // 確定した予定から生成される ICS カレンダーにそのまま載ることを確認
    const ics = buildFeedIcs(saved, todayStr());
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toMatch(/SUMMARY:.*新章イントロ相談/);
  });

  it("他メンバーが立てた未回答の日程調整で「未回答をすべて◯」を押すと全候補に◯が付いて永続化される", async () => {
    const user = userEvent.setup();
    const initialState = createDemoState((s) => {
      s.events = {
        ev_other_poll: {
          id: "ev_other_poll",
          tableId: Object.keys(s.tables)[0],
          title: "未回答一括テスト",
          status: "poll",
          date: "2026-12-19",
          startTime: "21:00",
          endTime: "24:00",
          responses: {},
          candidates: [
            { id: "c1", date: "2026-12-19", startTime: "21:00", endTime: "24:00", responses: {} },
            { id: "c2", date: "2026-12-20", startTime: "21:00", endTime: "24:00", responses: {} },
          ],
          createdBy: "u_sasa",
        },
      };
    });
    const view = renderWithStore(<Calendar />, {
      initialPath: "/calendar",
      initialState,
    });

    // カードは閲覧だけ。返事は「回答する」から開く回答画面で行い、保存するまで書き込まない
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await user.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /未回答をすべて◯/ }));
    expect(
      view.readPersistedState()!.events.ev_other_poll?.candidates?.[0]?.responses.u_mikan,
    ).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "回答を保存" }));

    const saved = view.readPersistedState()!;
    const updatedPoll = saved.events.ev_other_poll;
    expect(updatedPoll?.candidates).toHaveLength(2);
    expect(updatedPoll?.candidates?.every((c) => c.responses.u_mikan === "ok")).toBe(true);
  });

  it("日程調整は閲覧が既定で、候補は開始だけを出す。作った人は編集で長さを 1 か所で変えられる", async () => {
    const user = userEvent.setup();
    const tableId = "t_haikou";
    const initialState = createDemoState((s) => {
      s.events = {
        ev_mine: {
          id: "ev_mine",
          tableId,
          title: "編集テスト",
          status: "poll",
          date: "2026-12-19",
          startTime: "21:00",
          endTime: "24:00",
          durationMin: 180,
          responses: {},
          candidates: [
            {
              id: "c1",
              date: "2026-12-19",
              startTime: "21:00",
              endTime: "24:00",
              responses: { u_mikan: "ok", u_sora: "ok" },
            },
            {
              id: "c2",
              date: "2026-12-20",
              startTime: "20:00",
              endTime: "23:00",
              responses: { u_mikan: "ok", u_sora: "ng" },
            },
          ],
          createdBy: "u_mikan",
        },
      };
    });
    const view = renderWithStore(<Calendar />, { initialPath: "/calendar", initialState });

    await user.click(screen.getByRole("button", { name: /^編集テスト/ }));
    const dialog = await screen.findByRole("dialog");
    // 閲覧: 返事の選択肢は出さず、候補は開始だけ・長さは 1 つだけ
    expect(dialog.querySelector('[role="radiogroup"]')).toBeNull();
    expect(dialog.textContent).toContain("所要時間3時間");
    expect(dialog.textContent).not.toContain("21:00–24:00");

    await user.click(screen.getByRole("button", { name: "編集" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "日程調整を編集" })).toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: "4時間" }));
    const start2 = screen.getByLabelText("候補開始時刻 2");
    await user.clear(start2);
    await user.type(start2, "21:00");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const ev = view.readPersistedState()!.events.ev_mine!;
    expect(ev.durationMin).toBe(240);
    expect(ev.candidates!.map((c) => [c.startTime, c.endTime])).toEqual([
      ["21:00", "25:00"],
      ["21:00", "25:00"],
    ]);
    // 日時を変えなかった候補の回答は残り、変えた候補の回答は消える
    expect(ev.candidates![0]!.responses).toEqual({ u_mikan: "ok", u_sora: "ok" });
    expect(ev.candidates![1]!.responses).toEqual({});
  });
});
