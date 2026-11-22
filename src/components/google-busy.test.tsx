import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleCalendarScope } from "./google-busy";

describe("GoogleCalendarScope（許可の前に出す説明）", () => {
  // 2026-11-22「冗長すぎ、簡潔に、箇条書きで」: 読むもの・読まないものを短い項目で並べ、文は 1 つだけ
  it("読み取るもの・読み取らないものを箇条書きにし、開いて読む案内（data-guide）にする", () => {
    const { container } = render(<GoogleCalendarScope />);
    expect(container.querySelector("[data-guide]")).not.toBeNull();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    const reads = within(lists[0]!)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(reads.join()).toContain("予定が入っている時間帯");
    const skips = within(lists[1]!)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(skips.join()).toContain("予定のタイトル");
    for (const item of [...reads, ...skips]) {
      expect(item!.length).toBeLessThanOrEqual(24);
      expect(item).not.toContain("。");
    }
    const prose = [...container.querySelectorAll("p")].map((p) => p.textContent ?? "");
    expect(prose).toHaveLength(1);
    expect(prose[0]!.split("。").filter(Boolean)).toHaveLength(1);
  });
});
