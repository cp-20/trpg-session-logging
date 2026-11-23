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
  "/home",
  "/sessions",
  "/sessions/s02",
  "/sessions/s02?tab=log",
  "/sessions/s10",
  "/sessions/s10?tab=log",
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
  "/users/sora",
  "/settings",
  // Discord のチャンネルと卓をつなぐ（サンプルではログインを求める）
  "/tables/discord?code=demo",
  // 卓の招待（サンプルの夜祭班。src/data/seed.ts の DEMO_INVITE_TOKEN）
  "/join/demoinvite0000000000000000000000yomatsuri",
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
  "共有範囲の初期値",
  "は自動で入ります",
  "いつ遊ぶか・メモ",
  " — ",
  "——",
  "取り込み元:",
  "開いたときに自動で同期",
  "サインイン",
  "サインアウト",
  // 用語集の「避ける表現」（ソースは lint:glossary でも見る）
  "目録",
  "カルテ",
  "実施日",
  "公開範囲",
  "プレイした人",
  "自由記述（未登録）",
  "未リンク",
  "セッションのタイトル",
];

export interface AuditIssue {
  rule: string;
  detail: string;
}

export async function enterDemo(page: Page): Promise<void> {
  // サンプルを始める（LP のボタンの行き先。LP からの導線は public-pages で確かめる）
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);
  await page.getByRole("navigation", { name: "メイン" }).first().waitFor();
}

export async function auditPage(
  page: Page,
  opts: { dark?: boolean; explanationBudget?: boolean } = {},
): Promise<AuditIssue[]> {
  const banned = BANNED_VISIBLE_TEXT.map((b) => (typeof b === "string" ? { s: b } : { r: b.source }));
  const issues = await page.evaluate(
    ({ banned, dark, ...opts }) => {
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
      // code は URL などの値をそのまま見せる所（購読リンクの末尾の .ics など）なので文言として数えない
      clone.querySelectorAll("[data-user-content], code, script, style").forEach((el) => el.remove());
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

      // 10. サイドバー下部のプロフィール行と設定アイコンボタンの高さを揃える（デスクトップのみ）
      if (innerWidth >= 1024) {
        const profileLink = document.querySelector('aside a[href^="/users/"]');
        const settingsLink = document.querySelector('aside a[href="/settings"]');
        if (profileLink && settingsLink && visible(profileLink) && visible(settingsLink)) {
          const diff = Math.abs(
            profileLink.getBoundingClientRect().height - settingsLink.getBoundingClientRect().height,
          );
          if (diff > 2) {
            out.push({
              rule: "sidebar-footer-height-parity",
              detail: `height diff ${diff.toFixed(1)}px`,
            });
          }
        }
      }
      // 10b. サイドバーの現在地には左端の短い印を出す（「左端のちょこっとした border なくさないで」2026-11-22。
      // 一度キャレットと取り違えて消した）
      if (innerWidth >= 1024) {
        const current = document.querySelector('aside nav[aria-label="メイン"] a[aria-current="page"]');
        if (current && visible(current) && !current.querySelector("[data-nav-current-mark]")) {
          out.push({ rule: "nav-current-mark", detail: describe(current) });
        }
      }
      // 11. アクセシビリティ基本構造（スキップリンク・フォーカスリング・主要ランドマーク）
      if (document.querySelector('nav[aria-label="メイン"]')) {
        const skip = document.querySelector('a[href="#main-content"]');
        const targetMain = document.querySelector("main#main-content");
        if (!skip || !targetMain) {
          out.push({
            rule: "a11y-skip-link",
            detail: "Missing skip-to-main link (#main-content) or main#main-content landmark",
          });
        }
      }
      // 12. 影を使わない（DESIGN.md §3）。浮かぶ層（.popover）と、枠として描く ring・内側の影は除く
      const castsShadow = (value: string) =>
        value !== "none" &&
        value.split(/,(?![^(]*\))/).some((layer) => {
          if (/\binset\b/.test(layer)) return false;
          const lengths = (
            layer.replace(/(?:rgba?|oklch|oklab|color-mix|var)\([^)]*\)/g, "").match(/-?[\d.]+px/g) ?? []
          ).map(parseFloat);
          const [x = 0, y = 0, blur = 0] = lengths;
          return x !== 0 || y !== 0 || blur !== 0;
        });
      for (const el of main.querySelectorAll("*")) {
        if (el.closest(".popover") || !visible(el)) continue;
        if (castsShadow(getComputedStyle(el).boxShadow)) {
          out.push({ rule: "no-shadow", detail: describe(el) });
          break;
        }
      }

      // 13. 行のホバー背景の角丸は .list の端の行だけ（途中の行が丸いとホバーの面だけ角が欠けて見える）
      for (const row of main.querySelectorAll(".list .row-interactive")) {
        const list = row.closest(".list")!;
        const items = [...list.children];
        const idx = items.findIndex((c) => c === row || c.contains(row));
        const cs = getComputedStyle(row);
        const topRounded = parseFloat(cs.borderTopLeftRadius) > 0;
        const bottomRounded = parseFloat(cs.borderBottomLeftRadius) > 0;
        if ((topRounded && idx > 0) || (bottomRounded && idx < items.length - 1)) {
          out.push({ rule: "row-hover-radius", detail: describe(row) });
          break;
        }
      }

      // 文章として読ませる要素（利用者の書いた内容・規約などの読み物・開いて読むガイドは除く）
      const PROSE_EXEMPT =
        "[data-user-content], [data-prose], [data-guide], script, style, button, a, label, h1, h2, h3, h4, table";
      // 文字を直接持つ要素から、インライン要素をたどって文のまとまり（ブロック）を得る。
      // ブロックの文はそのブロックに直接属する文字だけで作る（中の見出しやボタンの文字は数えない）
      const blockText = new Map<Element, string>();
      // main の中に描かれたダイアログを二重に数えない（同じ文が 2 文に見える）
      const roots = [
        main,
        ...[...document.querySelectorAll("[role=dialog]")].filter((d) => !main.contains(d)),
      ];
      for (const root of roots) {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          let el = n.parentElement;
          if (!n.textContent?.trim() || !el || el.closest(PROSE_EXEMPT)) continue;
          while (el.parentElement && getComputedStyle(el).display.startsWith("inline")) el = el.parentElement;
          if (el.closest(PROSE_EXEMPT) || !visible(el)) continue;
          blockText.set(el, (blockText.get(el) ?? "") + n.textContent);
        }
      }
      const textBlocks = [...blockText]
        .map(([el, raw]) => ({ el, text: raw.replace(/\s+/g, " ").trim() }))
        .filter((b) => b.text.length > 0);

      // 14. 説明文で UI を補わない（P4）。説明は 1 段落 1 文・60 字まで。長い案内は開いて読む [data-guide] に入れる
      if (opts.explanationBudget) {
        for (const { el, text } of textBlocks) {
          const sentences = text.split("。").filter((s) => s.trim()).length;
          const prose = /[。、]/.test(text);
          if (sentences > 1 || (prose && text.length > 60)) {
            out.push({
              rule: "explanation-budget",
              detail: `${describe(el)} (${sentences}文 ${text.length}字)`,
            });
          }
        }
      }

      // 15. 文体は敬体（P12）。「。」で終わる文は「です・ます」で終える。ボタンの一時表示に「済み」を使わない
      const POLITE_END = /(?:ます|です|ません|ました|でした|ましょう|ください)[。！？]?$/;
      for (const { el, text } of textBlocks) {
        for (const s of text.split(/(?<=。)/)) {
          const t = s.trim();
          if (t.endsWith("。") && !POLITE_END.test(t.replace(/（[^）]*）。$/, "。"))) {
            out.push({ rule: "polite-form", detail: `${describe(el)} 「${t.slice(-12)}」` });
            break;
          }
        }
      }
      for (const el of [...document.querySelectorAll("button")].filter(visible)) {
        if (/(?:コピー|送信|保存|追加|登録)済み$/.test((el.textContent ?? "").trim())) {
          out.push({ rule: "polite-form", detail: describe(el) });
        }
      }

      // 16. 操作の中のアイコンの線は、描画後の太さで 1.75px 以上（P13。細いプラスが 2 回指摘された。1.53px でも細いと言われた）。
      // stroke-width は viewBox の単位なので、描画の大きさとの比で実際の太さに直す
      for (const svg of document.querySelectorAll<SVGSVGElement>(
        "button svg, a svg, [role=tab] svg, [role=option] svg",
      )) {
        // ブランドマーク（LogoMark など data-brand）は UI のアイコンではないので測らない
        if (!visible(svg) || svg.closest("[data-user-content], [data-brand]")) continue;
        const stroked = [svg, ...svg.querySelectorAll("path, line, circle, rect, polyline")].find(
          (el) => getComputedStyle(el).stroke !== "none",
        );
        if (!stroked) continue;
        const cs = getComputedStyle(stroked);
        const vb = svg.viewBox.baseVal;
        const scale = vb && vb.width ? svg.getBoundingClientRect().width / vb.width : 1;
        const vectorFixed = cs.getPropertyValue("vector-effect") === "non-scaling-stroke";
        const px = parseFloat(cs.strokeWidth) * (vectorFixed ? 1 : scale);
        if (Number.isFinite(px) && px < 1.75) {
          out.push({
            rule: "icon-stroke",
            detail: `${describe(svg.closest("button, a, [role]")!)} ${px.toFixed(2)}px`,
          });
          break;
        }
      }

      // 17. 文字の入力位置（キャレット）に見える細い色付きの縦棒を置かない（/scenarios の検索欄「カーソルっぽいの出てるの紛らわしい」）。
      // 灰色の区切り線は対象外（彩度のある色だけ）。サイドバーの現在地の短い印（data-nav-current-mark）は
      // 入力欄から離れた nav の端にあり、利用者が残すよう求めたもの（2026-11-22）なので対象外
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (
          el.hasAttribute("data-nav-current-mark") ||
          el.childElementCount > 0 ||
          (el.textContent ?? "").trim() !== "" ||
          el.closest("[data-user-content]")
        ) {
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.width > 4 || r.height < 10 || r.height > 32 || !visible(el)) continue;
        const m = getComputedStyle(el)
          .backgroundColor.match(/[\d.]+/g)
          ?.map(Number);
        if (!m || (m[3] ?? 1) < 0.5) continue;
        if (Math.max(m[0]!, m[1]!, m[2]!) - Math.min(m[0]!, m[1]!, m[2]!) < 60) continue;
        out.push({
          rule: "caret-like-bar",
          detail: `${describe(el.parentElement ?? el)} ${r.width}×${r.height}px`,
        });
        break;
      }

      // 18. 本文の列にそろえる（P13: 「卓譜へようこそ」の注意書きの幅が下の設定と合っていなかった）。
      // main の直下に並ぶ塊（画面の本文と、枠が差し込む注意書きなど）は、左端と幅が同じでなければならない
      const blocks = [...main.children].filter(
        (el) => visible(el) && getComputedStyle(el).position !== "fixed" && !inDialog(el),
      );
      if (blocks.length > 1) {
        const [first, ...rest] = blocks.map((el) => ({ el, r: el.getBoundingClientRect() }));
        const off = rest.find(
          (b) => Math.abs(b.r.left - first!.r.left) > 1 || Math.abs(b.r.width - first!.r.width) > 1,
        );
        if (off) {
          out.push({
            rule: "column-align",
            detail: `${describe(first!.el)} ${Math.round(first!.r.width)}px / ${describe(off.el)} ${Math.round(off.r.width)}px`,
          });
        }
      }
      // 18b. 画面の幅は画面によって変えない（P13: 「画面によって幅が違うとがたがたする」/upload・/signin、2026-11-22）。
      // アプリの本文は枠（main）の幅いっぱいを使い、画面ごとに max-w で狭めたり中央に寄せたりしない。
      // 公開ページのヘッダー・フッターの中身は常に max-w-6xl（72rem）。単一の用件の面（ログインの面など）は中で中央に置いてよい
      if (innerWidth >= 1024) {
        const ms = getComputedStyle(main);
        const inner = main.clientWidth - parseFloat(ms.paddingLeft) - parseFloat(ms.paddingRight);
        const page = [...main.children].find((el) => visible(el) && !inDialog(el));
        if (main.closest("[data-app-shell]") && page) {
          const w = page.getBoundingClientRect().width;
          if (Math.abs(w - inner) > 1) {
            out.push({
              rule: "page-width",
              detail: `${describe(page)} ${Math.round(w)}px / 枠 ${Math.round(inner)}px`,
            });
          }
        }
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        for (const bar of document.querySelectorAll("body > div > header > div, body > div > footer > div")) {
          if (!visible(bar) || bar.closest("[data-app-shell]")) continue;
          const want = Math.min(72 * rem, document.documentElement.clientWidth);
          const w = bar.getBoundingClientRect().width;
          if (Math.abs(w - want) > 1) {
            out.push({
              rule: "page-width",
              detail: `${bar.parentElement!.tagName.toLowerCase()} ${Math.round(w)}px`,
            });
            break;
          }
        }
      }
      // 19. 隣り合うボタンの見かけの大きさをそろえる（P13: 塗りの「共有」の隣で、枠の薄い「編集」が小さく見えた）。
      // 同じ行に並ぶボタンは描画の高さが同じで、塗りのないボタンも枠の縁が地から見分けられる（1.3:1 以上）こと
      const pageBg = (el: Element): number[] => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const c = rgb(getComputedStyle(p).backgroundColor);
          if (c[3] > 0.9) return c;
        }
        return rgb(getComputedStyle(document.body).backgroundColor);
      };
      const blend = (fg: number[], bg: number[]) =>
        fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!));
      const groups = new Set<Element>();
      for (const btn of document.querySelectorAll(".btn"))
        if (btn.parentElement) groups.add(btn.parentElement);
      parity: for (const g of groups) {
        const btns = [...g.children].filter((el) => el.matches(".btn") && visible(el));
        if (btns.length < 2) continue;
        const rects = btns.map((b) => b.getBoundingClientRect());
        for (let i = 1; i < btns.length; i++) {
          if (Math.abs(rects[i]!.top - rects[0]!.top) > 2) continue;
          if (Math.abs(rects[i]!.height - rects[0]!.height) > 1) {
            out.push({
              rule: "button-parity",
              detail: `${describe(btns[0]!)} / ${describe(btns[i]!)} の高さ`,
            });
            break parity;
          }
        }
        if (!btns.some((b) => b.matches(".btn-primary"))) continue;
        for (const b of btns) {
          if (b.matches(".btn-primary, .btn-quiet")) continue;
          const cs = getComputedStyle(b);
          const ground = pageBg(b);
          const face = blend(rgb(cs.backgroundColor), ground);
          const edge = blend(rgb(cs.borderTopColor), face);
          const ratio = Math.max(contrast(face, ground), contrast(edge, ground));
          if (ratio < 1.3) {
            out.push({ rule: "button-parity", detail: `${describe(b)} の縁 ${ratio.toFixed(2)}:1` });
            break parity;
          }
        }
      }

      // 19b. 横に並ぶ入力欄・選択・ボタンの高さをそろえる（P13 の 3 回目: 日程調整の「時間・分」、記録の参加者の
      // 「名前・役割」の左右で高さが違った、2026-11-22）。見かけで隣り合う（縦に半分以上重なり、間が 48px 未満）
      // 操作部品どうしは、描画の高さが 1px 以内でそろうこと。部品の中の部品（入力欄の中の消すボタンなど）は外側だけを見る
      {
        const CONTROL = ".input, .btn, [role=radiogroup]";
        const controls = [...document.querySelectorAll(CONTROL)]
          .filter((el) => visible(el) && !el.parentElement?.closest(CONTROL) && !el.matches(".icon-btn"))
          .map((el) => ({ el, r: el.getBoundingClientRect() }));
        pairs: for (let i = 0; i < controls.length; i++) {
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i]!;
            const b = controls[j]!;
            const overlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            const gap = Math.max(a.r.left, b.r.left) - Math.min(a.r.right, b.r.right);
            if (overlap < Math.min(a.r.height, b.r.height) / 2 || gap < 0 || gap >= 48) continue;
            if (Math.abs(a.r.height - b.r.height) > 1) {
              out.push({
                rule: "control-height-parity",
                detail: `${describe(a.el)} ${Math.round(a.r.height)}px / ${describe(b.el)} ${Math.round(b.r.height)}px`,
              });
              break pairs;
            }
          }
        }
      }
      // 20. 行のホバーの面は、行の見かけの範囲と一致させる（P13: キャラクターの歩みの行で、左の線と点を外して
      // ホバーの面が欠けて見えた）。面（.surface）の中の角の無い行は面の左右の端まで届くこと。
      // 四隅を丸めた行（目次の行など）はそれ自体が 1 つの面なので対象外
      for (const row of main.querySelectorAll(".surface .row-interactive")) {
        if (!visible(row) || inDialog(row)) continue;
        const rs = getComputedStyle(row);
        const radii = [
          rs.borderTopLeftRadius,
          rs.borderTopRightRadius,
          rs.borderBottomLeftRadius,
          rs.borderBottomRightRadius,
        ];
        if (radii.every((v) => parseFloat(v) > 0)) continue;
        const surface = row.closest(".surface")!;
        const s = surface.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        const bw = parseFloat(getComputedStyle(surface).borderLeftWidth) || 0;
        if (r.left - (s.left + bw) > 1.5 || s.right - bw - r.right > 1.5) {
          out.push({ rule: "row-hover-bounds", detail: describe(row) });
          break;
        }
      }
      return out;
    },
    { banned, dark: Boolean(opts.dark), explanationBudget: opts.explanationBudget ?? true },
  );
  return issues;
}
