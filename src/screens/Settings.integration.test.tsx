import { renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Settings, { UserDetail } from "./Settings";
import { parseSavedState } from "../lib/state-schema";

describe("Settings + UserDetail + ThemeSync + Backup 復元結合テスト", () => {
  it("プロフィール編集モーダルで表示名と自己紹介を更新し、永続化データとして復元できる", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<UserDetail />, {
      initialPath: "/users/u_mikan",
      params: { id: "u_mikan" },
    });

    await user.click(screen.getByRole("button", { name: /プロフィールを編集/ }));
    const dialog = await screen.findByRole("dialog", { name: "プロフィールを編集" });
    expect(dialog).toBeInTheDocument();

    const nameInput = screen.getByLabelText("表示名");
    const bioInput = screen.getByLabelText("自己紹介");
    await user.clear(nameInput);
    await user.type(nameInput, "みかん（GM練習中）");
    await user.clear(bioInput);
    await user.type(bioInput, "週末夜に遊んでいます。");

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "みかん（GM練習中）" })).toBeInTheDocument();

    const persisted = view.readPersistedState()!;
    expect(persisted.users.u_mikan?.name).toBe("みかん（GM練習中）");
    expect(persisted.users.u_mikan?.bio).toBe("週末夜に遊んでいます。");
  });

  it("外観テーマの切り替えと JSON バックアップファイルの読み込み復元が連動する", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Settings />, { initialPath: "/settings" });

    await user.click(screen.getByRole("radio", { name: "ダーク" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("takufuDark");
    expect(localStorage.getItem("takufu-theme")).toBe("dark");

    // 記録の読み込み（parseSavedState を通して StoreProvider へ復元）
    const exported = view.readPersistedState()!;
    exported.users.u_mikan!.name = "バックアップ復元後";
    const backupJson = JSON.stringify(exported);
    expect(parseSavedState(backupJson)).not.toBeNull();

    const file = new File([backupJson], "takufu-backup.json", { type: "application/json" });
    const fileInput = screen.getByLabelText("記録を読み込む");
    await user.upload(fileInput, file);

    await waitFor(() => expect(view.readPersistedState()?.users.u_mikan?.name).toBe("バックアップ復元後"));
  });

  it("Google カレンダーの機能を切っている間は、設定に欄を出さない", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_GOOGLE_CALENDAR", "false");
    renderWithStore(<Settings />, { initialPath: "/settings" });
    expect(screen.queryByRole("checkbox", { name: "Google カレンダーの空き時間を使う" })).toBeNull();
  });

  it("Google カレンダーの照らし合わせは既定でオフ。オフにすると取り込んだ時間帯と許可の記録を消す", async () => {
    const user = userEvent.setup();
    // 既定（お試し中・未許可）: オフで、お試し中は押せない
    vi.stubEnv("NEXT_PUBLIC_FEATURE_GOOGLE_CALENDAR", "true");
    const first = renderWithStore(<Settings />, { initialPath: "/settings" });
    const toggle = screen.getByRole("checkbox", { name: "Google カレンダーの空き時間を使う" });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    expect(first.readPersistedState()!.prefs.googleBusy).toBeUndefined();
    first.unmount();

    const view = renderWithStore(<Settings />, {
      initialPath: "/settings",
      mutateState: (s) => {
        s.prefs.googleBusy = {
          consentedAt: "2026-11-20T00:00:00.000Z",
          calendars: [
            { id: "main", name: "自分のカレンダー", on: true },
            { id: "holiday", name: "日本の祝日", on: false },
          ],
          countAllDay: false,
          ranges: [
            { calendarId: "main", start: "2026-11-22T03:00:00.000Z", end: "2026-11-22T04:00:00.000Z" },
          ],
          syncedAt: "2026-11-20T00:00:00.000Z",
        };
      },
    });
    expect(screen.getByText("自分のカレンダー")).toBeInTheDocument();
    const allDay = screen.getByRole("checkbox", { name: "終日の予定も数える" });
    expect(allDay).not.toBeChecked();
    await user.click(allDay);
    expect(view.readPersistedState()!.prefs.googleBusy?.countAllDay).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "Google カレンダーの空き時間を使う" }));
    expect(view.readPersistedState()!.prefs.googleBusy).toBeUndefined();
  });
});
