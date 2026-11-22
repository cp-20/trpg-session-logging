import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox, CompletionModal, MultiCombobox } from "./ui";
import type { ComboboxOption } from "./ui";

const SYSTEMS: ComboboxOption[] = [
  { value: "coc7", label: "クトゥルフ神話TRPG 7版", keywords: ["CoC"] },
  { value: "sw25", label: "ソード・ワールド2.5" },
  { value: "dx", label: "ダブルクロス2nd,3rd", keywords: ["DoubleCross"] },
  ...Array.from({ length: 300 }, (_, i) => ({ value: `g${i}`, label: `汎用システム${i}` })),
];

function Single({ onCreate }: { onCreate?: (t: string) => void }) {
  const [v, setV] = useState("coc7");
  return (
    <>
      <Combobox ariaLabel="システム" value={v} onChange={setV} options={SYSTEMS} onCreate={onCreate} />
      <output data-testid="value">{v}</output>
    </>
  );
}

describe("Combobox", () => {
  it("ARIA の combobox として振る舞い、入力で絞り込んで Enter で選ぶ", async () => {
    const user = userEvent.setup();
    render(<Single />);
    const input = screen.getByRole("combobox", { name: "システム" });
    expect(input).toHaveValue("クトゥルフ神話TRPG 7版");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    // 開いた直後は選んでいるものがいまの候補
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: /クトゥルフ/ }).id,
    );
    await user.type(input, "doublecross");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("dx");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("ダブルクロス2nd,3rd");
  });

  it("全角・カタカナの違いを無視し、描く候補を絞って残りの数を出す", async () => {
    const user = userEvent.setup();
    render(<Single />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(50);
    expect(screen.getByText(/ほか \d+ 件/)).toBeInTheDocument();
    await user.type(input, "そーど");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["ソード・ワールド2.5"]);
  });

  it("↑↓・Home・End で動き、Escape で閉じて元の値に戻す", async () => {
    const user = userEvent.setup();
    render(<Single />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{End}");
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[options.length - 1]!.id);
    await user.keyboard("{Home}{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]!.id);
    await user.type(input, "ソード");
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("クトゥルフ神話TRPG 7版");
    expect(screen.getByTestId("value")).toHaveTextContent("coc7");
  });

  it("IME の変換中は絞り込まず、変換確定の Enter で選ばない", async () => {
    render(<Single />);
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "そ" } });
    // 変換中は前の並び（すべて）のまま
    expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229, isComposing: true });
    expect(screen.getByTestId("value")).toHaveTextContent("coc7");
    fireEvent.change(input, { target: { value: "ソード" } });
    fireEvent.compositionEnd(input);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["ソード・ワールド2.5"]);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("value")).toHaveTextContent("sw25");
  });

  it("一致する名前がないとき「追加」を出す", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<Single onCreate={onCreate} />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "銃構築");
    expect(screen.getByRole("option", { name: "「銃構築」を追加" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onCreate).toHaveBeenCalledWith("銃構築");
  });

  it("pinned は入力が空のときだけ見出しつきで先頭に出す", async () => {
    const user = userEvent.setup();
    render(
      <Combobox ariaLabel="システム" value="coc7" onChange={() => {}} options={SYSTEMS} pinned={["sw25"]} />,
    );
    await user.click(screen.getByRole("combobox"));
    const groups = screen.getAllByRole("group");
    expect(groups[0]).toHaveAccessibleName("最近使ったもの");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("ソード・ワールド2.5");
  });
});

function Multi() {
  const [values, setValues] = useState<string[]>(["ホラー"]);
  return (
    <MultiCombobox
      ariaLabel="タグ"
      values={values}
      onChange={setValues}
      options={[
        { value: "ホラー", label: "ホラー" },
        { value: "クローズド", label: "クローズド" },
        { value: "継続", label: "継続" },
      ]}
    />
  );
}

describe("MultiCombobox", () => {
  const tokens = () =>
    screen.queryByRole("list", { name: "選んだタグ" })
      ? Array.from(screen.getByRole("list", { name: "選んだタグ" }).querySelectorAll("li")).map(
          (li) => li.textContent,
        )
      : [];

  it("選ぶと札が増え、選んだものは候補から消え、読み上げで知らせる", async () => {
    const user = userEvent.setup();
    render(<Multi />);
    const input = screen.getByRole("combobox", { name: "タグ" });
    await user.click(input);
    expect(screen.queryByRole("option", { name: "ホラー" })).toBeNull();
    await user.type(input, "くろーず");
    await user.keyboard("{Enter}");
    expect(tokens()).toEqual(["ホラー", "クローズド"]);
    expect(input).toHaveValue("");
    expect(screen.getByText("「クローズド」を追加しました")).toBeInTheDocument();
  });

  it("新しい名前を追加でき、同じ名前は 2 回足さない。カンマで分けない", async () => {
    const user = userEvent.setup();
    render(<Multi />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "学校, 夜");
    await user.keyboard("{Enter}");
    expect(tokens()).toEqual(["ホラー", "学校, 夜"]);
    await user.type(input, "ほらー");
    expect(screen.queryByRole("option", { name: /を追加/ })).toBeNull();
  });

  it("空の入力欄で Backspace を押すと最後の札を外し、× でも外せる", async () => {
    const user = userEvent.setup();
    render(<Multi />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "継続{Enter}");
    expect(tokens()).toEqual(["ホラー", "継続"]);
    await user.keyboard("{Backspace}");
    expect(tokens()).toEqual(["ホラー"]);
    expect(screen.getByText("「継続」を外しました")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ホラーを外す" }));
    expect(tokens()).toEqual([]);
  });

  it("← で札へ移り、Delete で外して入力欄に戻る", async () => {
    const user = userEvent.setup();
    render(<Multi />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "ホラーを外す" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(input).toHaveFocus();
  });
});

describe("CompletionModal", () => {
  it("主操作にフォーカスし、副操作と閉じるを持つ", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const share = vi.fn();
    render(
      <CompletionModal
        title="セッションを記録しました"
        primary={{ label: "セッションを見る", onClick: () => {} }}
        secondary={[{ label: "共有する", onClick: share }]}
        onClose={onClose}
      >
        深淵の呼び声・3時間2分
      </CompletionModal>,
    );
    const dialog = screen.getByRole("dialog", { name: "セッションを記録しました" });
    expect(dialog).toHaveAccessibleDescription("深淵の呼び声・3時間2分");
    expect(screen.getByRole("button", { name: "セッションを見る" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "共有する" }));
    expect(share).toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
