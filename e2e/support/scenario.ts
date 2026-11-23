import { expect, type Page } from "@playwright/test";

/**
 * 記録の画面のシナリオ欄で、共有シナリオ一覧にない名前を打って足す（共有シナリオ一覧に載せない既定のまま）。
 * セッションは名前を持たずシナリオの題名で呼ぶので、記録するにはシナリオが要る
 */
export async function addScenario(page: Page, title: string): Promise<void> {
  const box = page.getByRole("combobox", { name: "シナリオ" });
  await box.click();
  await box.fill(title);
  // 共有シナリオ一覧の答えが届くまでは「追加」を出さない
  await page.getByRole("option", { name: /追加/ }).click();
  await expect(page.getByLabel("シナリオのタイトル")).toHaveValue(title);
}

/** localStorage の記録から、シナリオの題名でセッションを探す（書き込みはデバウンスされるので待つ） */
export async function waitForLogByScenario(page: Page, title: string): Promise<{ id: string; slug: string }> {
  const handle = await page.waitForFunction(
    (t) => {
      const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
      const id = Object.keys(st.logs ?? {}).find((k) => st.scenarios?.[st.logs[k]?.scenarioId]?.title === t);
      return id ? { id, slug: st.logs[id].slug as string } : null;
    },
    title,
    { polling: 250 },
  );
  return (await handle.jsonValue()) as { id: string; slug: string };
}
