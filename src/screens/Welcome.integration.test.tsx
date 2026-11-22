import { getTestNav, renderWithStore } from "../test/integration-harness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { Welcome } from "./Entry";

function withoutHandle() {
  const s = seedState();
  s.entered = true;
  delete s.users[s.me]!.handle;
  s.prefs.onboardingDone = false;
  return s;
}

describe("はじめの設定（/welcome）", () => {
  it("ID は飛ばせず、使えない ID・使われている ID では進めない。表示名とアイコンは飛ばせる", async () => {
    const user = userEvent.setup();
    const view = renderWithStore(<Welcome />, { initialPath: "/welcome", initialState: withoutHandle() });

    expect(screen.getByRole("heading", { level: 1, name: "ユーザー ID を決めましょう" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "スキップ" })).toBeNull();
    const input = screen.getByRole("textbox", { name: "ユーザー ID" });
    const submit = screen.getByRole("button", { name: "この ID にする" });

    await user.clear(input);
    await user.type(input, "Ab");
    expect(document.getElementById("welcome-handle-status")).toHaveTextContent("3文字以上");
    expect(submit).toBeDisabled();

    await user.clear(input);
    await user.type(input, "sora");
    expect(document.getElementById("welcome-handle-status")).toHaveTextContent("ほかの人が使っています");
    expect(submit).toBeDisabled();

    await user.clear(input);
    await user.type(input, "@Mikan_Kp");
    expect(document.getElementById("welcome-handle-status")).toHaveTextContent("/users/mikan_kp");
    await user.click(submit);

    expect(screen.getByRole("heading", { level: 1, name: "表示名を決めましょう" })).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: "表示名" });
    await user.clear(name);
    await user.type(name, "みかん KP");
    await user.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("heading", { level: 1, name: "アイコンを選びましょう" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "スキップ" }));

    const done = await screen.findByRole("dialog");
    expect(done).toHaveTextContent("@mikan_kp");
    const saved = view.readPersistedState()!;
    expect(saved.users[saved.me]).toMatchObject({ handle: "mikan_kp", name: "みかん KP", image: "" });
    expect(saved.prefs.onboardingDone).toBe(true);

    await user.click(screen.getByRole("link", { name: "ホームを開く" }));
    await waitFor(() => expect(getTestNav().pathname).toBe("/home"));
  });

  it("ID がすでにある人は表示名から始まり、ID の欄は出ない", () => {
    const s = seedState();
    s.entered = true;
    renderWithStore(<Welcome />, { initialPath: "/welcome", initialState: s });
    expect(screen.getByRole("heading", { level: 1, name: "表示名を決めましょう" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "ユーザー ID" })).toBeNull();
    expect(screen.queryByRole("button", { name: "戻る" })).toBeNull();
  });
});
