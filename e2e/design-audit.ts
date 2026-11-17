/**
 * 描画後の画面に対するデザイン検査。ソースの lint（scripts/lint-design.ts）では見えない、
 * 実際のレイアウト・色・文言を確かめる。E2E（e2e/layout.spec.ts）と
 * スクリーンショット付きレビュー（node scripts/ops.ts review）の両方から使う。
 *
 * ここに足す検査は「過去に指摘された悪いデザインが再発したら必ず落ちる」ものに限る。
 * 指摘との対応は docs/design-feedback.md を参照。
 */
import type { Page } from "@playwright/test";

/** デモ環境で巡回する画面 */
export const AUDIT_ROUTES = [
  "/sessions",
  "/sessions/s02",
  "/sessions/s02?tab=log",
  "/calendar",
  "/tables",
  "/tables/t_haikou",
  "/upload",
  "/characters",
  "/characters/ch_towa",
  "/scenarios",
  "/scenarios/sc_kankyo",
  "/scenarios/new",
  "/users/u_sora",
  "/settings",
] as const;

/** 画面に出てはいけない文言（技術用語・自明な説明・成功の念押し・内部事情） */
export const BANNED_VISIBLE_TEXT: readonly (string | RegExp)[] = [
  /\.ics\b/,
  /iCalendar/,
  "できます。",
  "✓",
  "しました。",
  "反映しました",
  "更新しました",
  "保存しました",
  "を検出",
  "ログから推定",
  "進行メモ",
  "KP:",
  " — ",
  "——",
];

export interface AuditIssue {
  rule: string;
  detail: string;
}

export async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click();
  await page.waitForURL(/\/sessions/);
}

export async function auditPage(page: Page, opts: { dark?: boolean } = {}): Promise<AuditIssue[]> {
  const banned = BANNED_VISIBLE_TEXT.map((b) => (typeof b === "string" ? { s: b } : { r: b.source }));
  const issues = await page.evaluate(
    ({ banned, dark }) => {
      const out: { rule: string; detail: string }[] = [];
      const main = document.querySelector("main") ?? document.body;
      const inDialog = (el: Element) => Boolean(el.closest("[role=dialog]"));
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      const describe = (el: Element) =>
        `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}"`;

      // CSS の色を RGB に変換する（oklch なども canvas に描いて読む）
      const ctx = document.createElement("canvas").getContext("2d")!;
      const rgb = (css: string): [number, number, number, number] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const contrast = (a: number[], b: number[]) => {
        const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (l1! + 0.05) / (l2! + 0.05);
      };

      // 1. 横スクロール
      const over = document.documentElement.scrollWidth - innerWidth;
      if (over > 0) out.push({ rule: "no-horizontal-overflow", detail: `${over}px` });

      // 2. 面の入れ子（DESIGN.md §3）
      const surfaces = [...main.querySelectorAll(".surface, .card, .card-interactive")].filter(
        (el) => !inDialog(el) && visible(el),
      );
      for (const el of surfaces) {
        const parent = el.parentElement?.closest(".surface, .card, .card-interactive");
        if (parent && main.contains(parent)) {
          out.push({ rule: "no-nested-surface", detail: describe(el) });
        }
      }

      // 3. 主ボタンは 1 画面に 1 つ（ダイアログの中は別）
      const primaries = [...main.querySelectorAll(".btn-primary")].filter(
        (el) => !inDialog(el) && visible(el),
      );
      if (primaries.length > 1) {
        out.push({
          rule: "single-primary-action",
          detail: primaries.map((el) => (el.textContent ?? "").trim()).join(" / "),
        });
      }

      // 4. ネイティブ要素・ツールチップ
      if (document.querySelector("[title]"))
        out.push({ rule: "no-native-title", detail: describe(document.querySelector("[title]")!) });
      if (document.querySelector("select")) out.push({ rule: "no-native-select", detail: "select" });

      // 5. 小さすぎる文字（12px 未満）
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const tiny = new Set<string>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim();
        const el = n.parentElement;
        if (!text || !el || !visible(el)) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) tiny.add(text.slice(0, 20));
      }
      if (tiny.size) out.push({ rule: "min-font-size-12", detail: [...tiny].slice(0, 5).join(" / ") });

      // 6. 画面に出してはいけない文言（ログ本文・感想など利用者が書いた内容 [data-user-content] は除く）
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[data-user-content], script, style").forEach((el) => el.remove());
      const text = clone.textContent ?? "";
      for (const b of banned) {
        const hit = "s" in b ? text.includes(b.s!) : new RegExp(b.r!).test(text);
        if (hit) out.push({ rule: "banned-copy", detail: "s" in b ? b.s! : b.r! });
      }

      // 7. ボタン文字のコントラスト（4.5:1 以上）
      for (const el of [...document.querySelectorAll(".btn")].filter(visible)) {
        const cs = getComputedStyle(el);
        const bg = rgb(cs.backgroundColor);
        if (bg[3] < 0.9) continue;
        const ratio = contrast(rgb(cs.color), bg);
        if (ratio < 4.5) {
          out.push({ rule: "button-contrast", detail: `${describe(el)} ${ratio.toFixed(2)}:1` });
          break;
        }
      }

      // 8. ダークモードで純白に近い文字を使わない（長文で眩しい）
      if (dark) {
        const body = rgb(getComputedStyle(document.body).color);
        if (lum(body) > 0.8)
          out.push({ rule: "dark-mode-soft-text", detail: getComputedStyle(document.body).color });
      }

      // 9. 押せる部品の大きさ（ボタンは高さ 28px 以上）
      for (const el of [...main.querySelectorAll("button, .btn, .icon-btn")].filter(visible)) {
        const h = el.getBoundingClientRect().height;
        if (el.matches(".btn, .icon-btn") && h < 28) {
          out.push({ rule: "min-target-size", detail: `${describe(el)} ${Math.round(h)}px` });
          break;
        }
      }
      return out;
    },
    { banned, dark: Boolean(opts.dark) },
  );
  return issues;
}
