import fs from "node:fs";
import path from "node:path";

interface Violation {
  file: string;
  line: number;
  message: string;
}

const ROOT_DIR = process.cwd();
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".next", ".expo"]);
const JS_EXT_RE = /\.(?:js|mjs|cjs)$/;
const SOURCE_EXT_RE = /\.(?:ts|tsx|css)$/;
const RAW_SELECT_RE = /<select(?![A-Za-z0-9_-])/;
const MICRO_FONT_RE = /text-\[(?:8|9|10|11|12|13|14|15|16)(?:\.\d+)?px\]/;
const REMOVED_POLICY_RE = /\b(?:POLICY_LABEL|POLICY_HINT)\b/;
// 「予定のある日」を手で入れる機能はやめた（2026-11-22）。照らし合わせは許可した Google カレンダーの時間帯だけ。
// 古い保存データから消す移行（state-schema）だけが名前を使ってよい
const REMOVED_MANUAL_BUSY_RE = /\bprefs\??\.busyDates\b|\bbusyDates\?\s*:/;
const isBusyMigration = (rel: string) => /^src\/lib\/state-schema(?:\.test)?\.ts$/.test(rel);
const MEANINGLESS_ICON_RE = /\b(?:IconSparkles|IconWand)\b/;
const TOAST_CALL_RE = /\btoast\s*\(/;
// 文字色の不透明度が 0.65 未満だと base-200 上で 4.5:1 を割る（2026-11-21 axe で発見）
const LOW_ALPHA_TEXT_RE = /\btext-(?:base-content|neutral)\/(?:[0-5]?\d|6[0-4])\b/;
const MASK_FILTER_RE =
  /filter\(\s*\((?:c|channel)\)\s*=>\s*!(?:c|channel)\.secret\s*\)|mode\s*===\s*"share"\s*&&\s*c\.secret/;
const BANNED_ABBREV_RE = /["'`](?:CoC7|CoC6|SW2\.5|MM)["'`]/;
const BANNED_DURATION_RE = /\bfmtDurShort\b/;
const BANNED_END_LABEL_RE = /\bendLabel\b/;
const NATIVE_FILE_INPUT_RE = /className\s*=\s*"[^"]*\bfile-input\b/;
const HARDCODED_KP_PREFIX_RE = /["'`]KP:/;
// GM/進行役は用語集通り「GM」に統一する（「進行中」などの一般語は除外）
const ROLE_SHINKOU_RE =
  /["'`]進行(?:（|\(|\s*\$\{|<)|>進行<\/|label:\s*["'`]進行["'`]|:\s*["'`]進行["'`]|"進行"\s*[,)]/;
// 読み込んでいるウェイトは 400/500/700 だけ。800/900 は合成され太さが揃わない
const HEAVY_WEIGHT_RE = /\bfont-(?:extrabold|black)\b/;
// 状態は IconCheck などのアイコンで示す。文字のチェックマークや絵文字は使わない
const GLYPH_DECORATION_RE = /[✓✔]|\p{Extended_Pictographic}/u;
// ボタンは DESIGN.md の段階（主・副・低・危険）だけ。daisyUI の他の色や形は使わない
const BTN_ALLOWED_MODIFIERS = new Set([
  "btn-primary",
  "btn-quiet",
  "btn-danger",
  "btn-sm",
  "btn-xs",
  "btn-square",
  "btn-block",
]);
// ボタンの色を個別に上書きしない（段階の見た目を崩す）
const BTN_COLOR_OVERRIDE_RE =
  /\b(?:bg|text|border)-(?:primary|secondary|accent|neutral|error|success|warning|info|base-\d+|base-content|\[)/;
// 枠つき丸型の小札（chip）。情報は .meta の文字か、本当の例外状態の Tag で出す
const CHIP_RE = /^(?=.*\brounded-full\b)(?=.*\bborder\b)(?=.*\b(?:px|pl|pr)-)/;
// 面は .surface（DESIGN.md §3）。daisyUI の .card を直接使わない
const RAW_CARD_RE = /(?:^|\s)card(?:\s|$)/;
// 色はテーマのトークンで。画面に直接 16 進の色を書かない
const HEX_COLOR_RE = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;
// 利用者向けの文に技術用語（ファイル形式名）を出さない
const JARGON_COPY_RE =
  /[ぁ-んァ-ヶ一-龠][^"'`<>{}]*\.ics\b|\.ics\b[^"'`<>{}]*[ぁ-んァ-ヶ一-龠]|\biCalendar\b|\bwebcal\b(?![:/])/;
// 影は使わない。面の区別は背景色と枠で付ける（ホバーも同じ）。浮かぶ層は styles.css の .popover だけが影を持つ
const SHADOW_CLASS_RE = /^(?:[a-z0-9-]+:)*!?(?:shadow|drop-shadow)(?:-|$)/;
const SHADOW_STYLE_RE = /\bboxShadow\s*:/;
// 日付・数値の入力は DateInput / NumberInput（ポインタ端末の暦、標準の上下ボタンを出さない）
const RAW_DATE_NUMBER_INPUT_RE = /type=["'{`]+(?:date|number)["'`}]/;
// 増減は fmtDelta / StatChange で「(−3)」「(+7)」と書く。"+${n}" を画面ごとに組み立てない
const ADHOC_DELTA_RE = /`\+\$\{|["']\+["']\s*\+|["']\u2212["']\s*\+|`\u2212\$\{|`−\$\{/;
// 左だけの帯（border-l-2 以上 / border-l-[2px] など）で種類を示さない。地の色や印（SecretMark など）、文字色で示す
const SIDE_STRIPE_RE = /(?:^|\s|")border-l-(?:[2-8]|\[\d+px\])(?=\s|"|$)/;
// 自明な説明（〜できます。）を書かない
const SELF_EVIDENT_RE = /できます。/;
// 操作の一時表示も敬体（P12。「コピーした」→「コピーしました」、2026-11-21・11-22 に再発）
const PLAIN_DONE_RE = /["'`>](?:コピー|保存|送信|追加|登録|作成|削除)した["'`<]/;
// 共通部品と同じ役割の部品を画面側で作らない（ui.tsx / identity.tsx にあるものを使う）
const RESERVED_PRIMITIVES = [
  "DateBlock",
  "DayBlock",
  "AvatarStack",
  "MemberStack",
  "FieldError",
  "SettingRow",
  "FormRow",
  "PanelHead",
  "SittingsInput",
  "ScopePicker",
  "Seal",
  "Menu",
  "OverflowMenu",
  "HoverCard",
  "StatusPanel",
  "Switch",
  "Toggle",
  "EmptyState",
  "PageHead",
  "SectionTitle",
  "SplitLayout",
  "StatBar",
  "Modal",
  "Select",
  "Seg",
];
const RESERVED_DEF_RE = new RegExp(
  `^\\s*(?:export\\s+)?(?:function|const)\\s+(${RESERVED_PRIMITIVES.join("|")})\\b`,
);

/**
 * 1 行に含まれるクラス列らしき文字列を取り出す。
 * cx(...) が複数行にまたがっても拾えるよう、className 以外の文字列リテラルも対象にする
 * （空白区切りのトークンがすべて Tailwind/daisyUI 風の識別子であるものだけ）。
 */
function classStrings(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/"([^"]*)"|`([^`$]*)`/g)) {
    const str = (m[1] ?? m[2] ?? "").trim();
    if (!str) continue;
    const tokens = str.split(/\s+/);
    if (
      tokens.every((t) => /^[!a-z0-9:_\-[\]()/.%#&>~*+]+$/i.test(t)) &&
      tokens.some((t) => t.includes("-") || t === "btn" || t === "card")
    ) {
      out.push(str);
    }
  }
  return out;
}

// 画面は src/lib/router.tsx 経由でルーティングする（Next.js への依存を 1 か所に閉じる）
const NEXT_NAV_IMPORT_RE = /from\s+"next\/(?:navigation|link|router)"/;

// 主要ナビはサイドバーと下部タブ。ドロワーには戻さない
const DRAWER_NAV_RE = /\b(?:drawer-toggle|drawer-side|lg:drawer-open)\b/;

const AI_SLOP_PATTERNS = [
  " \u2014 ",
  "\u2014\u2014",
  "セッションをまたいで育つ",
  "いつものメンバーと、遊んだセッション",
  "遊んだ時間を、",
  " -> ",
  "取り込み: CCFOLIA",
  "のロール形式を検出",
  "などの表記を検出",
  "ログから推定",
  "シークレットタブとシナリオ本文を含めません",
  "シークレットタブ・シナリオ本文",
  "共有から除外",
  "港町キャンペーン全3話を進行中",
  "公開範囲と注意事項を確認のうえ進行します",
  "セッション後の成長ロール",
  "進行メモ",
  "ログ未添付",
  "ログはあとから追加できます",
  "タイムラインのアイコンと役割を調整できます",
  "保存した画像をXの投稿に添付できます。",
  "✓ 反映しました",
  "✓ 更新しました",
  "✓ 保存しました",
  "✓ アイコンを反映しました",
  "✓ 感想を追加しました",
  "✓ 公開範囲を変更しました",
  "公開設定を反映しました",
  "共有範囲の初期値",
  "は自動で入ります",
  "いつ遊ぶか・メモ",
  "マイページ",
];

const MAX_PAGE_FILES = 13;

function toRel(absPath: string): string {
  return path.relative(ROOT_DIR, absPath) || ".";
}

function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkNoJsFiles(violations: Violation[]): void {
  if (fs.existsSync(ROOT_DIR)) {
    for (const entry of fs.readdirSync(ROOT_DIR, { withFileTypes: true })) {
      if (entry.isFile() && JS_EXT_RE.test(entry.name)) {
        violations.push({
          file: entry.name,
          line: 1,
          message: "JavaScript files (.js/.mjs/.cjs) are disallowed; use TypeScript (.ts/.tsx).",
        });
      }
    }
  }

  const mobileDir = path.join(ROOT_DIR, "mobile");
  if (fs.existsSync(mobileDir)) {
    for (const entry of fs.readdirSync(mobileDir, { withFileTypes: true })) {
      if (entry.isFile() && JS_EXT_RE.test(entry.name)) {
        violations.push({
          file: path.posix.join("mobile", entry.name),
          line: 1,
          message: "JavaScript files (.js/.mjs/.cjs) are disallowed; use TypeScript (.ts/.tsx).",
        });
      }
    }
  }

  for (const subDir of ["src", "scripts", "e2e", "mobile/src"]) {
    for (const filePath of walkFiles(path.join(ROOT_DIR, subDir))) {
      if (JS_EXT_RE.test(filePath)) {
        violations.push({
          file: toRel(filePath),
          line: 1,
          message: "JavaScript files (.js/.mjs/.cjs) are disallowed; use TypeScript (.ts/.tsx).",
        });
      }
    }
  }
}

function checkNoRawSelect(violations: Violation[]): void {
  for (const subDir of ["src/screens", "src/components", "src/app"]) {
    for (const filePath of walkFiles(path.join(ROOT_DIR, subDir))) {
      if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) {
        continue;
      }
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (RAW_SELECT_RE.test(lines[i]!)) {
          violations.push({
            file: toRel(filePath),
            line: i + 1,
            message: "Raw <select> element is disallowed; use <Select> from src/components/ui.tsx.",
          });
        }
      }
    }
  }
}

function checkSrcRules(violations: Violation[]): void {
  for (const filePath of walkFiles(path.join(ROOT_DIR, "src"))) {
    if (!SOURCE_EXT_RE.test(filePath)) {
      continue;
    }
    const rel = toRel(filePath);
    const isPage = rel.startsWith("src/screens/") || rel.startsWith("src/app/");
    const isComponentOrPage = isPage || rel.startsWith("src/components/");
    const isIconsFile = rel === "src/components/icons.tsx" || rel === "src/components/icons.ts";
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNumber = i + 1;

      if (LOW_ALPHA_TEXT_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Text opacity below /65 fails 4.5:1 contrast on base-200; use text-ink2 / text-ink3 instead.",
        });
      }

      if (MICRO_FONT_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Microscopic arbitrary px font class is disallowed; use Tailwind text-* scale.",
        });
      }

      if (REMOVED_POLICY_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Reference to removed POLICY_LABEL or POLICY_HINT is disallowed.",
        });
      }
      if (!isBusyMigration(rel) && REMOVED_MANUAL_BUSY_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Manual busy days (prefs.busyDates) were removed; use the consented Google busy ranges (googleBusy).",
        });
      }

      if (isComponentOrPage && !isIconsFile && MEANINGLESS_ICON_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Meaningless AI decoration icon (IconSparkles / IconWand) is disallowed.",
        });
      }

      if (isPage && TOAST_CALL_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Floating toast() call in page is disallowed; display validation errors and optimistic status inline on screen.",
        });
      }

      if (
        isPage &&
        line.includes("btn-ghost") &&
        !line.includes("btn-circle") &&
        !line.includes("btn-square")
      ) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Text buttons must not use borderless btn-ghost; use bordered/subtle-fill secondary button (btn / btn-outline) so button outlines are visible.",
        });
      }

      if (MASK_FILTER_RE.test(line) && !rel.includes("__tests__")) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Log masking (filtering out secret channels) is disallowed; include all channels and control access via scope.",
        });
      }

      if (BANNED_DURATION_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "fmtDurShort is disallowed; use unified fmtDur (e.g. 3時間2分) everywhere.",
        });
      }

      if (BANNED_END_LABEL_RE.test(line) && !rel.includes("test")) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "endLabel is disallowed; ending labels were removed to minimize manual input.",
        });
      }

      if (isComponentOrPage && BANNED_ABBREV_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Abbreviated system names (CoC7, CoC6, SW2.5, MM) are disallowed in UI; use full system.name.",
        });
      }

      if (isComponentOrPage && NATIVE_FILE_INPUT_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            'Native .file-input (renders OS English "Choose File") is disallowed; use <label> wrapping <input type="file" className="sr-only" />.',
        });
      }

      if (isPage && !rel.includes(".test.") && HARDCODED_KP_PREFIX_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: 'Hardcoded "KP:" in UI copy is disallowed; use system-neutral "GM:".',
        });
      }

      if (isComponentOrPage && !rel.includes(".test.") && ROLE_SHINKOU_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: 'Role label "進行" is disallowed in UI; use unified "GM" (docs/glossary.md).',
        });
      }

      if (rel.startsWith("src/screens/") && !rel.includes(".test.") && line.includes("h-[3px]")) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Decorative h-[3px] card top strip is disallowed; keep surfaces neutral.",
        });
      }

      const isPrimitiveFile = rel === "src/components/ui.tsx" || rel === "src/components/identity.tsx";
      const isTest = rel.includes(".test.");

      if (isComponentOrPage && !isTest) {
        for (const cls of classStrings(line)) {
          const tokens = cls.split(/\s+/);
          if (tokens.includes("btn")) {
            const bad = tokens.filter((t) => t.startsWith("btn-") && !BTN_ALLOWED_MODIFIERS.has(t));
            if (bad.length) {
              violations.push({
                file: rel,
                line: lineNumber,
                message: `Button modifiers ${bad.join(", ")} are outside the 3-tier system; use btn / btn-primary / btn-quiet / btn-danger.`,
              });
            }
            if (BTN_COLOR_OVERRIDE_RE.test(cls)) {
              violations.push({
                file: rel,
                line: lineNumber,
                message:
                  "Do not override button colors with utilities; pick a tier (btn / btn-primary / btn-quiet / btn-danger).",
              });
            }
          }
          if (CHIP_RE.test(cls)) {
            violations.push({
              file: rel,
              line: lineNumber,
              message:
                "Chip UI (rounded-full + border + padding) is disallowed; show metadata as .meta text, or a Tag for a genuine exception state.",
            });
          }
          if (RAW_CARD_RE.test(cls)) {
            violations.push({
              file: rel,
              line: lineNumber,
              message:
                'Use the "surface" class (or card-interactive for clickable cards) instead of daisyUI "card".',
            });
          }
        }
        if (!isPrimitiveFile && isPage && /(?:className|style)=/.test(line) && HEX_COLOR_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Hardcoded hex color in page markup; use theme tokens (text-*/bg-*/border-* or oklch(var(--…))).",
          });
        }
        if (JARGON_COPY_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Technical jargon (.ics / iCalendar / webcal) in user-facing copy; describe what the user does instead.",
          });
        }
        if (SELF_EVIDENT_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Self-evident explanation (〜できます。) is disallowed; let the control speak for itself.",
          });
        }
        if (PLAIN_DONE_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: "Plain-form status text (〜した); use the polite form (〜しました) — P12.",
          });
        }
        if (!isPrimitiveFile && RESERVED_DEF_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: `"${RESERVED_DEF_RE.exec(line)![1]}" duplicates a shared primitive; import it from src/components/ui.tsx or identity.tsx (extend it there if needed).`,
          });
        }
      }

      if (
        (rel.startsWith("src/screens/") || rel.startsWith("src/components/")) &&
        NEXT_NAV_IMPORT_RE.test(line)
      ) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Screens and components must route through src/lib/router.tsx, not next/navigation or next/link directly.",
        });
      }

      if (isComponentOrPage && !rel.includes(".test.")) {
        const shadowTokens = classStrings(line)
          .flatMap((cls) => cls.split(/\s+/))
          .filter((t) => SHADOW_CLASS_RE.test(t));
        if (shadowTokens.length > 0 || SHADOW_STYLE_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: `Shadows (${shadowTokens.join(", ") || "boxShadow"}) are disallowed; separate surfaces with background color and borders. Floating layers use the .popover class.`,
          });
        }
        const isUiFile = rel === "src/components/ui.tsx";
        if (!isUiFile && RAW_DATE_NUMBER_INPUT_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              'Raw <input type="date|number"> is disallowed; use DateInput / NumberInput from src/components/ui.tsx.',
          });
        }
        if (!isUiFile && ADHOC_DELTA_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              'Hand-built stat delta ("+" + n) is disallowed; use StatChange or fmtDelta so deltas read "(−3)" / "(+7)".',
          });
        }
        if (SIDE_STRIPE_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Left-border stripes (border-l-2 and up / border-l-[Npx]) are disallowed; mark a kind with a tinted background, text color or a label.",
          });
        }
      }

      if (HEAVY_WEIGHT_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "font-extrabold / font-black is disallowed; use font-bold (only 400/500/700 are loaded).",
        });
      }

      if (
        isComponentOrPage &&
        filePath.endsWith(".tsx") &&
        /\boutline-none\b/.test(line) &&
        !/focus-visible:(?:outline|ring)/.test(line)
      ) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "outline-none without focus-visible replacement hides keyboard focus ring.",
        });
      }

      if (isComponentOrPage && !rel.includes(".test.") && GLYPH_DECORATION_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Checkmark glyphs and emoji are disallowed in UI; use an icon component (e.g. IconCheck).",
        });
      }

      if (isComponentOrPage && DRAWER_NAV_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Drawer navigation is disallowed; primary navigation is the sidebar (desktop) and bottom tab bar (mobile).",
        });
      }

      for (const pattern of AI_SLOP_PATTERNS) {
        if (line.includes(pattern)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: `Disallowed copy/jargon pattern "${pattern}" found.`,
          });
        }
      }
    }

    // Check native DOM title= attributes on lowercase JSX elements (<img, <button, <span, <a, <div)
    if (isComponentOrPage && filePath.endsWith(".tsx")) {
      const content = fs.readFileSync(filePath, "utf8");
      const tagRegex = /<([a-z][a-z0-9]*)\b[^>]*?\btitle\s*=\s*(?:\{[^}]+\}|"[^"]*")[^>]*?>/gs;
      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(content)) !== null) {
        const before = content.slice(0, match.index);
        const lineNum = before.split(/\r?\n/).length;
        violations.push({
          file: rel,
          line: lineNum,
          message: `Native HTML title= attribute on <${match[1]}> is disallowed; use visible labels or aria-label.`,
        });
      }
    }
  }
}

function checkButtonHoverAndTimelineRules(violations: Violation[]): void {
  const cssPath = path.join(ROOT_DIR, "src/styles.css");
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, "utf8");
    if (!css.includes(".btn-outline:hover")) {
      violations.push({
        file: "src/styles.css",
        line: 1,
        message:
          "src/styles.css must define explicit .btn-outline:hover rules to prevent black/white color inversion.",
      });
    }
    for (const m of css.matchAll(/\.text-ink[23]\s*\{\s*color:\s*oklch\(var\(--bc\)\s*\/\s*([\d.]+)\)/g)) {
      if (Number(m[1]) < 0.65) {
        violations.push({
          file: "src/styles.css",
          line: 1,
          message: `text-ink2/ink3 opacity ${m[1]} is below 0.65 and fails 4.5:1 contrast.`,
        });
      }
    }
    if (!css.includes("scrollbar-gutter: stable")) {
      violations.push({
        file: "src/styles.css",
        line: 1,
        message: "src/styles.css must define scrollbar-gutter: stable on html to prevent layout shift.",
      });
    }
    if (!css.includes(":focus-visible")) {
      violations.push({
        file: "src/styles.css",
        line: 1,
        message: "src/styles.css must define :focus-visible outline rules for keyboard accessibility.",
      });
    }
    // 影は .popover（浮かぶ層）だけ。カード・面・ホバーには使わない
    let selector = "";
    css.split(/\r?\n/).forEach((cssLine, idx) => {
      const open = /^([^{}]+)\{\s*$/.exec(cssLine.trim());
      if (open) selector = open[1]!.trim();
      const shadow = /box-shadow\s*:\s*([^;]+);/.exec(cssLine);
      if (shadow && shadow[1]!.trim() !== "none" && !/\.popover\b/.test(selector)) {
        violations.push({
          file: "src/styles.css",
          line: idx + 1,
          message: `box-shadow on "${selector}" is disallowed; only .popover (floating layers) may cast a shadow.`,
        });
      }
    });
    if (!css.includes(".skip-link")) {
      violations.push({
        file: "src/styles.css",
        line: 1,
        message: "src/styles.css must define .skip-link styles.",
      });
    }
  }

  const shellPath = path.join(ROOT_DIR, "src/components/shell.tsx");
  if (fs.existsSync(shellPath)) {
    const sh = fs.readFileSync(shellPath, "utf8");
    if (!sh.includes('href="#main-content"') || !sh.includes('id="main-content"')) {
      violations.push({
        file: "src/components/shell.tsx",
        line: 1,
        message: "src/components/shell.tsx must provide skip-to-main link (#main-content) and landmark id.",
      });
    }
  }

  const timelinePath = path.join(ROOT_DIR, "src/components/timeline.tsx");
  if (fs.existsSync(timelinePath)) {
    const tl = fs.readFileSync(timelinePath, "utf8");
    if (!tl.includes("<img")) {
      violations.push({
        file: "src/components/timeline.tsx",
        line: 1,
        message: "src/components/timeline.tsx must render speaker avatar <img> elements in timeline rows.",
      });
    }
  }

  const genPath = path.join(ROOT_DIR, "src/data/generated.json");
  if (fs.existsSync(genPath)) {
    const data = JSON.parse(fs.readFileSync(genPath, "utf8")) as {
      logs?: Record<
        string,
        {
          id: string;
          hasLog?: boolean;
          ownerId: string;
          speakerIcons?: Record<string, string>;
          players?: Record<string, { characterIds?: string[] }>;
        }
      >;
    };
    for (const log of Object.values(data.logs ?? {})) {
      if (log.hasLog && (!log.speakerIcons || Object.keys(log.speakerIcons).length === 0)) {
        violations.push({
          file: "src/data/generated.json",
          line: 1,
          message: `Log ${log.id} with hasLog=true is missing speakerIcons in generated.json.`,
        });
      }
      const kpPlayer = log.players?.[log.ownerId];
      if (kpPlayer?.characterIds && kpPlayer.characterIds.length > 0) {
        violations.push({
          file: "src/data/generated.json",
          line: 1,
          message: `Log ${log.id} assigns PC characterIds to KP (ownerId=${log.ownerId}) in generated.json.`,
        });
      }
    }
  }
}

function checkPagesCohesion(violations: Violation[]): void {
  const pagesDir = path.join(ROOT_DIR, "src/screens");
  const pageFiles = walkFiles(pagesDir).filter((f) => !f.includes(".test."));
  if (pageFiles.length > MAX_PAGE_FILES) {
    violations.push({
      file: toRel(pagesDir),
      line: 1,
      message: `src/screens/ has ${pageFiles.length} files (max ${MAX_PAGE_FILES}); consolidate screens.`,
    });
  }
}

function checkMobileSrcRules(violations: Violation[]): void {
  for (const filePath of walkFiles(path.join(ROOT_DIR, "mobile/src"))) {
    if (!SOURCE_EXT_RE.test(filePath)) {
      continue;
    }
    const rel = toRel(filePath);
    const isTest = rel.includes(".test.");
    const isScreen = rel.startsWith("mobile/src/app/");
    const isComponentOrScreen = isScreen || rel.startsWith("mobile/src/components/");
    const isIconsFile = rel === "mobile/src/components/icons.tsx";
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNumber = i + 1;

      if (REMOVED_POLICY_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Reference to removed POLICY_LABEL or POLICY_HINT is disallowed.",
        });
      }
      if (!isBusyMigration(rel) && REMOVED_MANUAL_BUSY_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Manual busy days (prefs.busyDates) were removed; use the consented Google busy ranges (googleBusy).",
        });
      }

      if (MASK_FILTER_RE.test(line) && !isTest) {
        violations.push({
          file: rel,
          line: lineNumber,
          message:
            "Log masking (filtering out secret channels) is disallowed; include all channels and control access via scope.",
        });
      }

      if (BANNED_DURATION_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "fmtDurShort is disallowed; use unified fmtDur (e.g. 3時間2分) everywhere.",
        });
      }

      if (BANNED_END_LABEL_RE.test(line) && !isTest) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "endLabel is disallowed; ending labels were removed to minimize manual input.",
        });
      }

      if (isComponentOrScreen && !isIconsFile && MEANINGLESS_ICON_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: "Meaningless AI decoration icon (IconSparkles / IconWand) is disallowed.",
        });
      }

      if (!isTest) {
        if (isComponentOrScreen && BANNED_ABBREV_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Abbreviated system names (CoC7, CoC6, SW2.5, MM) are disallowed in UI; use full system.name.",
          });
        }

        if (isScreen && HARDCODED_KP_PREFIX_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: 'Hardcoded "KP:" in UI copy is disallowed; use system-neutral "GM:".',
          });
        }

        if (isComponentOrScreen && ROLE_SHINKOU_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: 'Role label "進行" is disallowed in UI; use unified "GM" (docs/glossary.md).',
          });
        }

        if (isScreen && TOAST_CALL_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Floating toast() call in page is disallowed; display validation errors and optimistic status inline on screen.",
          });
        }

        if (isScreen && HEX_COLOR_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: "Hardcoded hex color in mobile screen; use useTokens() theme tokens.",
          });
        }

        if (isComponentOrScreen && JARGON_COPY_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Technical jargon (.ics / iCalendar / webcal) in user-facing copy; describe what the user does instead.",
          });
        }

        if (isComponentOrScreen && SELF_EVIDENT_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Self-evident explanation (〜できます。) is disallowed; let the control speak for itself.",
          });
        }
        if (isComponentOrScreen && PLAIN_DONE_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: "Plain-form status text (〜した); use the polite form (〜しました) — P12.",
          });
        }

        if (isComponentOrScreen && !isIconsFile && GLYPH_DECORATION_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message:
              "Checkmark glyphs and emoji are disallowed in UI; use an icon component (e.g. IconCheck).",
          });
        }

        for (const pattern of AI_SLOP_PATTERNS) {
          if (line.includes(pattern)) {
            violations.push({
              file: rel,
              line: lineNumber,
              message: `Disallowed copy/jargon pattern "${pattern}" found.`,
            });
          }
        }
      }
    }
  }
}

/**
 * 「選んでいる」見た目（is-active）は、押せる部品の状態にだけ付ける。飾りの見本に付けると、
 * どれが選べてどれを選んでいるのか分からなくなる（LP の指摘）。同じタグに aria-pressed 等が必要。
 * 問い合わせは /feedback（Discord に届くフォーム）に集め、リポジトリの Issues へは案内しない。
 */
function checkSelectedStateAndContact(violations: Violation[]): void {
  for (const subDir of ["src/screens", "src/components", "src/lib", "src/app"]) {
    for (const filePath of walkFiles(path.join(ROOT_DIR, subDir))) {
      if (!/\.tsx?$/.test(filePath) || /\.test\.tsx?$/.test(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8");
      const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;
      for (const m of text.matchAll(/is-active/g)) {
        if (!filePath.endsWith(".tsx")) break;
        const tagStart = text.lastIndexOf("<", m.index);
        const tag = text.slice(tagStart, m.index + 400);
        if (!/aria-(pressed|checked|current|selected)/.test(tag)) {
          violations.push({
            file: toRel(filePath),
            line: lineOf(m.index),
            message:
              "is-active (selected look) only on interactive controls with aria-pressed/checked/current/selected; decorative samples must not look selectable.",
          });
        }
      }
      // 文字を含む要素を透明度で薄くすると、小さい文字がコントラスト基準を割る（過ぎた日付で起きた）。
      // 色（text-ink2 など）で控えめにする。処理中の一時的な表示（busy / parsing）は除く
      text.split("\n").forEach((line, i) => {
        if (
          /<(div|span|p|li|a|button)\b/.test(line) &&
          /\bopacity-[1-6]0\b/.test(line) &&
          !/busy|parsing/.test(line)
        ) {
          violations.push({
            file: toRel(filePath),
            line: i + 1,
            message:
              "Do not dim text containers with opacity below 70; use text-ink2/text-ink3 so contrast holds.",
          });
        }
      });
      // ボタンの並びを <label> の Field で包むと、最初のボタンがラベル全体を名前に取る
      for (const m of text.matchAll(/<Field\b[^>]*>\s*<(Seg|Toggle)\b/g)) {
        if (!/\bgroup\b/.test(m[0].slice(0, m[0].indexOf(">")))) {
          violations.push({
            file: toRel(filePath),
            line: lineOf(m.index),
            message: `<${m[1]}> inside <Field> needs the group prop (a <label> would rename the first button).`,
          });
        }
      }
      for (const m of text.matchAll(/github\.com\/cp-20/g)) {
        violations.push({
          file: toRel(filePath),
          line: lineOf(m.index),
          message:
            "Do not send users to the GitHub repository; link the feedback form (FEEDBACK_PATH) instead.",
        });
      }
    }
  }
}

/**
 * 公開ページ（Landing.tsx: LP・規約・ご意見）はサーバーで描画し、記録と Firebase を読み込まない。
 * ここから store・Firebase・zod を読むと、LP の JS に数百 KB が載る（LP の速度の指摘）。
 */
function checkPublicPagesStayLight(violations: Violation[]): void {
  // ルートの layout と BaseProviders もすべての画面に載るので同じ扱い
  for (const rel of ["src/screens/Landing.tsx", "src/app/layout.tsx", "src/app/providers.tsx"]) {
    const lines = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8").split(/\r?\n/);
    // ルートの layout はアプリ本体の書体（@fontsource の Noto）を読むので、@fontsource は Landing だけで禁止
    const banned = new RegExp(
      `(from |import )"(\\.\\.?/store|\\.\\.?/workspace|\\./store-providers|\\.\\./lib/(auth|firebase|cloud-state|feedback)|firebase/[^"]*|zod${rel.endsWith("Landing.tsx") ? '|@fontsource[^"]*' : ""})"`,
    );
    lines.forEach((line, i) => {
      if (banned.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          message:
            "Public pages must not import the store, Firebase, zod or @fontsource (keeps the LP server-rendered and light); put sign-in flows in Entry.tsx.",
        });
      }
    });
  }
}

/** ファイル全体の文字位置から行番号を出す（複数行にまたがる正規表現の検査用） */
function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function uiSourceFiles(): string[] {
  return ["src/screens", "src/components", "src/app", "mobile/src/app", "mobile/src/components"].flatMap(
    (d) => walkFiles(path.join(ROOT_DIR, d)).filter((f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\./.test(f)),
  );
}

// 多い・増えうる選択肢（システム・技能・シナリオ・人・キャラクター・卓）。これを Select の options に使わない（P7）
const GROWING_OPTIONS_RE =
  /SYSTEM_LIST|\bSYSTEMS\b|systemOptions|\bskills?\b|[sS]cenario|[uU]sers\b|userList|\bpeople\b|\bmembers\b|[cC]hars\b|[cC]haracters\b|charList|[lL]inkOptions|[iI]conOptions|[tT]ables\b|[tT]ableOptions|sysOptions|\brecent\b/;

/**
 * lint:combobox-for-growing-options
 * 多い・増えうる選択肢を Select（決まった少数のための部品）で選ばせない。Combobox / MultiCombobox を使う
 */
function checkComboboxForGrowingOptions(violations: Violation[]): void {
  for (const filePath of uiSourceFiles()) {
    const rel = toRel(filePath);
    const text = fs.readFileSync(filePath, "utf8");
    for (const m of text.matchAll(/<Select\b/g)) {
      const start = m.index ?? 0;
      const end = text.indexOf("/>", start);
      const tag = text.slice(start, end < 0 ? undefined : end);
      const opts = /\boptions=\{([\s\S]*)$/.exec(tag)?.[1] ?? "";
      if (GROWING_OPTIONS_RE.test(opts)) {
        violations.push({
          file: rel,
          line: lineAt(text, start),
          message:
            "combobox-for-growing-options: options derive from a growing list (systems/skills/scenarios/users/characters/tables); use <Combobox> (or <MultiCombobox>) instead of <Select>.",
        });
      }
    }
  }
}

// 複数の値をカンマ・読点区切りの文字で受けさせる文言
const COMMA_COPY_RE = /カンマ|コンマ|[「『][,，、][」』]\s*(?:で|区切)|[,，、]\s*区切り|読点(?:か|で|区切)/;
// フォームの値をカンマ・読点で分ける（values.tags.split(/[,、]/) など。改行をまたいでも拾う）
const COMMA_SPLIT_RE =
  /\b(?:values|getValues\([^)]*\)|watch\([^)]*\)|field\.value|form\.\w+)(?:\??\.\w+)*\s*\??\.split\(\s*(?:["'`][,，、]["'`]|\/\[?[^/\]\n]*[,，、][^/\n]*\/)/g;

/**
 * lint:comma-separated-input
 * 複数の値（タグ・キーワード）をカンマ区切りの文字入力で受けない。MultiCombobox を使う
 */
function checkCommaSeparatedInput(violations: Violation[]): void {
  for (const filePath of uiSourceFiles()) {
    const rel = toRel(filePath);
    if (rel.startsWith("src/app/api/")) continue;
    const text = fs.readFileSync(filePath, "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
      if (COMMA_COPY_RE.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          message:
            "comma-separated-input: UI copy asks for comma-separated values; use <MultiCombobox> (tokens) instead of a text field.",
        });
      }
    });
    for (const m of text.matchAll(COMMA_SPLIT_RE)) {
      violations.push({
        file: rel,
        line: lineAt(text, m.index ?? 0),
        message:
          "comma-separated-input: a form value is split on commas; keep multiple values as string[] and edit them with <MultiCombobox>.",
      });
    }
  }
}

// 頭文字の文字アイコン（name[0]・charAt(0)・slice(0, 1)・Array.from(name)[0] など）
const LETTER_AVATAR_RES = [
  // 複数形（fileNames[0] など配列の先頭）は名前の頭文字ではないので除く
  /\b\w*[nN]ame(?!s\b)\w*(?:\??\.trim\(\))?\??\.(?:charAt\(0\)|slice\(0,\s*1\)|substring\(0,\s*1\)|at\(0\))/,
  /\b\w*[nN]ame(?!s\b)\w*(?:\.trim\(\))?\[0\]/,
  /Array\.from\(\s*[\w.?]*[nN]ame[\w.?()]*\)\??\[0\]/,
  /\[\.\.\.[^\]]*[nN]ame[^\]]*\]\??\[0\]/,
];

/**
 * lint:letter-avatar
 * 人・卓・キャラを頭文字で示さない（P9）。画像がなければ src/lib/identicon.ts の生成画像を使う
 */
function checkLetterAvatar(violations: Violation[]): void {
  const files = [
    ...walkFiles(path.join(ROOT_DIR, "src/components")),
    ...walkFiles(path.join(ROOT_DIR, "src/screens")),
    ...walkFiles(path.join(ROOT_DIR, "mobile/src/components")),
    ...walkFiles(path.join(ROOT_DIR, "mobile/src/app")),
  ].filter((f) => f.endsWith(".tsx") && !/\.(?:test|spec)\./.test(f));
  for (const filePath of files) {
    const rel = toRel(filePath);
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        if (LETTER_AVATAR_RES.some((re) => re.test(line))) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "letter-avatar: initial-letter avatars are disallowed; fall back to identiconDataUri(id, kind) from src/lib/identicon.ts.",
          });
        }
      });
  }
}

// 遊んだ時間帯は Log.sittings（開始・終了の日時の並び）で持つ（P1）。古い持ち方と 30 時間制の時刻を書かない
const LEGACY_SCHEDULE_FIELD_RE = /(?<!\.)\.(?:dates|t0|t1)\b/;
const LEGACY_SCHEDULE_API_RE =
  /\b(?:buildSessionRange|sessionClock|remapChannelTimestamps|deriveSessionFromMessages|DateList|TimeRange)\b/;
// 24:00〜33:59 のような 30 時間制の時刻（「1:30:00」のような経過時間は除く）と、その書き方の案内
const THIRTY_HOUR_CLOCK_RE = /(?<![\d:])(?:2[4-9]|3[0-3])[:：][0-5]\d(?![:\d])|日付をまたぐときは/;

function scheduleSourceFiles(): string[] {
  return ["src", "mobile/src"].flatMap((d) =>
    walkFiles(path.join(ROOT_DIR, d)).filter(
      (f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\./.test(f) && !f.endsWith("/lib/sittings.ts"),
    ),
  );
}

/**
 * lint:unnatural-model（P1）
 * データの形が不自然だと UI も不自然になる。遊んだ時間帯は「実施日の一覧 + 初日の開始 + 最終日の終了（25:30）」ではなく
 * 集まりの並び（Log.sittings: 開始・終了の日時）で持ち、入力は日付と時刻（終了が翌日なら「翌」）で受ける
 */
function checkUnnaturalModel(violations: Violation[]): void {
  for (const filePath of scheduleSourceFiles()) {
    const rel = toRel(filePath);
    const isUi = /^(?:src\/(?:screens|components|app)|mobile\/src\/(?:app|components))\//.test(rel);
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        if (LEGACY_SCHEDULE_FIELD_RE.test(line) || LEGACY_SCHEDULE_API_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "unnatural-model: a session's time is Log.sittings (start/end datetimes). Use sessionStart / sessionDays / fmtSessionWhen / SittingsInput from src/lib/sittings.ts instead of dates / t0 / t1.",
          });
        }
        if (isUi && THIRTY_HOUR_CLOCK_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "unnatural-model: do not ask for 30-hour clock times (25:30). Take a date and HH:MM times; an end before the start ends the next day (SittingsInput shows 「翌」).",
          });
        }
      });
  }
}

// 取り込みをやめた形式（P6）を、取り込める形式として画面に書く・その読み取りを戻す
const DROPPED_IMPORT_COPY_RE =
  /Discord[^"'`]{0,12}(?:JSON|テキスト|ログ)|[・、]テキスト(?:のログ|ログ)|テキストログ|どどんとふ|Tekey|通過履歴を(?:まとめて)?取り込|CSV[・／/]TSV|Markdown\s*表/;
const DROPPED_IMPORT_CODE_RE =
  /\b(?:parseDiscordLog\w*|parsePlainTextLog|parseGenericHtmlLog|parsePlayHistory|commitPlayHistoryImport|historyRowEpochs)\b|lib\/history-import/;

/**
 * lint:dropped-import（P6）
 * ログの取り込みは機械が確実に読める形式（CCFOLIA・Udonarium）だけ。Discord・テキストログ・どどんとふ・通過履歴の表は読まない
 */
function checkDroppedImport(violations: Violation[]): void {
  const files = ["src", "mobile/src"].flatMap((d) =>
    walkFiles(path.join(ROOT_DIR, d)).filter((f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\./.test(f)),
  );
  for (const filePath of files) {
    const rel = toRel(filePath);
    const isUi = /^(?:src\/(?:screens|components|app)|mobile\/src\/(?:app|components))\//.test(rel);
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        if (isUi && DROPPED_IMPORT_COPY_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "dropped-import: Discord / plain-text / どどんとふ logs and history tables are not imported (P6). List only CCFOLIA and Udonarium (SUPPORTED_LOG_FORMATS_LABEL).",
          });
        }
        if (DROPPED_IMPORT_CODE_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "dropped-import: free-form log / history-table parsers were removed (P6); do not bring them back.",
          });
        }
      });
  }
}

/**
 * lint:dropped-character-import（P6・P3）
 * キャラクターはキャラシの URL からだけ取り込む。コマ出力・ファイル・テキストの貼り付けからは読まない
 * （「ファイル・コマから読む」は機能ごとやめた。いあきゃらも閲覧 URL から API の JSON を読む parseIacharaSheet だけにし、
 *  駒出力・テキストを読む parseIacharaText / parseIacharaResponse は戻さない）
 */
const DROPPED_CHARACTER_COPY_RE = /駒出力|ファイル・コマ|コマ・キャラシ|コマから読む|コマ出力を貼り付け/;
const DROPPED_CHARACTER_CODE_RE =
  /\b(?:importCharactersFromFiles|importCharactersFromText|importCharacterFromFile|importCharacterFromText|parseIacharaText|parseIacharaResponse|parseCcfoliaCharacter\w*|parseUdonariumCharacter\w*|sheetFromCcfolia|pickAndImportCharacterFile)\b/;

function checkDroppedCharacterImport(violations: Violation[]): void {
  const files = ["src", "mobile/src"].flatMap((d) =>
    walkFiles(path.join(ROOT_DIR, d)).filter((f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\./.test(f)),
  );
  for (const filePath of files) {
    const rel = toRel(filePath);
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        if (DROPPED_CHARACTER_COPY_RE.test(line) || DROPPED_CHARACTER_CODE_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "dropped-character-import: characters come only from a character-sheet URL (P6). Do not bring back file / koma (ココフォリア駒出力) / pasted-text import.",
          });
        }
      });
  }
}

/**
 * lint:people-safety（P14・P15）
 * - 人を名前で検索させない（「ユーザー名で検索」・利用者の名前での絞り込み）。卓へは招待リンクで招く
 * - ユーザー ID（handle）を書き換える処理は、はじめの設定（Entry.tsx・アプリの welcome.tsx）と取り込み（lib/people.ts）・サンプルだけ
 * - 常設の「卓譜へようこそ」の注意書き（OnboardingBanner）を戻さない。初めての人は /welcome で設定する
 */
const PEOPLE_SEARCH_RES = [
  /ユーザー名で検索|名前で検索|参加者を検索|該当するユーザー/,
  /\b(?:u|user|person|member)\.name(?:\.toLowerCase\(\))?\.includes\(/,
];
const WELCOME_NOTICE_RE = /卓譜へようこそ|OnboardingBanner|OnboardingNotice/;
const HANDLE_WRITE_RE = /\.handle\s*=(?!=)/;
const HANDLE_WRITERS = new Set([
  "src/screens/Entry.tsx",
  "mobile/src/app/welcome.tsx",
  "src/lib/people.ts",
  "src/data/seed.ts",
]);

function checkPeopleSafety(violations: Violation[]): void {
  const files = [
    ...["src/screens", "src/components", "src/app", "src/lib", "src/data"].flatMap((d) =>
      walkFiles(path.join(ROOT_DIR, d)),
    ),
    ...walkFiles(path.join(ROOT_DIR, "mobile/src")),
  ].filter((f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\./.test(f));
  for (const filePath of files) {
    const rel = toRel(filePath);
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        if (PEOPLE_SEARCH_RES.some((re) => re.test(line))) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "people-safety: do not let people search users by name (P14); add members through table invite links and pick participants from table members (memberCandidates).",
          });
        }
        if (WELCOME_NOTICE_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "people-safety: no standing welcome notice (P15); first-time setup lives in the /welcome onboarding (Welcome in src/screens/Entry.tsx).",
          });
        }
        if (HANDLE_WRITE_RE.test(line) && !HANDLE_WRITERS.has(rel)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "people-safety: user IDs (handle) are immutable once set (P14); only the onboarding (Entry.tsx, mobile welcome.tsx) and lib/people.ts may write them.",
          });
        }
      });
  }
}

/**
 * lint:raw-delta
 * セッションの増減（SessionStat.delta）をそのまま並べない。卓をまたいで続かない値（HP・MP・幸運・共鳴）が混ざる（P3）。
 * src/lib/character-growth.ts の carriedDeltas を通す
 */
function checkRawDelta(violations: Violation[]): void {
  for (const filePath of uiSourceFiles()) {
    const rel = toRel(filePath);
    const text = fs.readFileSync(filePath, "utf8");
    for (const m of text.matchAll(/Object\.(?:entries|keys|values)\(\s*[\w.?]*\.delta\b/g)) {
      violations.push({
        file: rel,
        line: lineAt(text, m.index ?? 0),
        message:
          "raw-delta: show session stat changes through carriedDeltas() so non-carried values (HP/MP/luck) never appear.",
      });
    }
  }
}

/**
 * lint:raw-error-message
 * 捕まえた例外の message を画面に出さない。Firebase の内部の文（"false for 'create' @ L73"）が漏れる（P5）。
 * src/lib/user-error.ts の userFacingError(error, fallback) を通し、詳しいことは console に残す
 */
const RAW_ERROR_MESSAGE_RE =
  /(?<![\w.?])(?:e|err|error|cause|reason)\.message\b|\binstanceof Error \?|\bString\((?:e|err|error|cause)\)/;
function checkRawErrorMessage(violations: Violation[]): void {
  const files = [
    ...["src/screens", "src/components", "src/app"].flatMap((d) => walkFiles(path.join(ROOT_DIR, d))),
    path.join(ROOT_DIR, "src/store.tsx"),
    path.join(ROOT_DIR, "src/workspace.tsx"),
    path.join(ROOT_DIR, "src/lib/auth.ts"),
    ...walkFiles(path.join(ROOT_DIR, "mobile/src")),
  ].filter(
    (f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\./.test(f) && !f.includes(`${path.sep}api${path.sep}`),
  );
  for (const filePath of files) {
    const rel = toRel(filePath);
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line) || /console\.(?:error|warn|log)/.test(line)) return;
        if (RAW_ERROR_MESSAGE_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message:
              "raw-error-message: never show a caught error's message (Firebase internals leak, P5); use userFacingError(error, fallback) from src/lib/user-error.ts and log details with console.error.",
          });
        }
      });
  }
}

/**
 * lint:scope-picker
 * 共有範囲は ScopePicker だけで選ばせる。シナリオの方針で保存できない範囲（firestore.rules validShare）を
 * 選べてしまう選択肢を、画面ごとに作らない（P3・P16）
 */
const ADHOC_SCOPE_OPTIONS_RE = /\[\s*"members",\s*"passed",\s*"public"\s*\]|\bv:\s*"passed"/;
function checkScopePicker(violations: Violation[]): void {
  for (const filePath of uiSourceFiles()) {
    const rel = toRel(filePath);
    if (rel === "src/components/ui.tsx" || rel === "mobile/src/components/ui.tsx") continue;
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (ADHOC_SCOPE_OPTIONS_RE.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            message: "scope-picker: choose share scope only with ScopePicker (lib/share-scope).",
          });
        }
      });
  }
}

const violations: Violation[] = [];
checkNoJsFiles(violations);
checkNoRawSelect(violations);
checkSrcRules(violations);
checkMobileSrcRules(violations);
checkButtonHoverAndTimelineRules(violations);
checkPagesCohesion(violations);
checkSelectedStateAndContact(violations);
checkPublicPagesStayLight(violations);
checkComboboxForGrowingOptions(violations);
checkCommaSeparatedInput(violations);
checkLetterAvatar(violations);
checkUnnaturalModel(violations);
checkDroppedImport(violations);
checkDroppedCharacterImport(violations);
checkPeopleSafety(violations);
checkRawDelta(violations);
checkRawErrorMessage(violations);
checkScopePicker(violations);

if (violations.length > 0) {
  for (const v of violations) {
    console.error(`${v.file}:${v.line}: ${v.message}`);
  }
  process.exit(1);
}

console.log("Design & architecture lint passed.");
process.exit(0);
