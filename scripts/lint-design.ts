import fs from "node:fs";
import path from "node:path";

interface Violation {
  file: string;
  line: number;
  message: string;
}

const ROOT_DIR = process.cwd();
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git"]);
const JS_EXT_RE = /\.(?:js|mjs|cjs)$/;
const SOURCE_EXT_RE = /\.(?:ts|tsx|css)$/;
const RAW_SELECT_RE = /<select(?![A-Za-z0-9_-])/;
const MICRO_FONT_RE = /text-\[(?:8|9|10|11|12|13|14|15|16)(?:\.\d+)?px\]/;
const REMOVED_POLICY_RE = /\b(?:POLICY_LABEL|POLICY_HINT)\b/;
const MEANINGLESS_ICON_RE = /\b(?:IconSparkles|IconWand)\b/;
const TOAST_CALL_RE = /\btoast\s*\(/;
const MASK_FILTER_RE =
  /filter\(\s*\((?:c|channel)\)\s*=>\s*!(?:c|channel)\.secret\s*\)|mode\s*===\s*"share"\s*&&\s*c\.secret/;
const BANNED_ABBREV_RE = /["'`](?:CoC7|CoC6|SW2\.5|MM)["'`]/;
const BANNED_DURATION_RE = /\bfmtDurShort\b/;
const BANNED_END_LABEL_RE = /\bendLabel\b/;
const NATIVE_FILE_INPUT_RE = /className\s*=\s*"[^"]*\bfile-input\b/;
const HARDCODED_KP_PREFIX_RE = /["'`]KP:/;
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
// 自明な説明（〜できます。）を書かない
const SELF_EVIDENT_RE = /できます。/;
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
  "DateList",
  "TimeRange",
  "Menu",
  "OverflowMenu",
  "HoverCard",
  "StatusPanel",
  "Switch",
  "Toggle",
  "EmptyState",
  "PageHead",
  "SectionTitle",
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
      tokens.every((t) => /^[!a-z0-9:_\-\[\]()/.%#&>~*+]+$/i.test(t)) &&
      tokens.some((t) => t.includes("-") || t === "btn" || t === "card")
    ) {
      out.push(str);
    }
  }
  return out;
}

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

  for (const subDir of ["src", "scripts", "e2e"]) {
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
  for (const subDir of ["src/pages", "src/components"]) {
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
    const isPage = rel.startsWith("src/pages/");
    const isComponentOrPage = rel.startsWith("src/pages/") || rel.startsWith("src/components/");
    const isIconsFile = rel === "src/components/icons.tsx" || rel === "src/components/icons.ts";
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNumber = i + 1;

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

      if (rel.startsWith("src/pages/") && !rel.includes(".test.") && HARDCODED_KP_PREFIX_RE.test(line)) {
        violations.push({
          file: rel,
          line: lineNumber,
          message: 'Hardcoded "KP:" in UI copy is disallowed; use system-neutral "進行:".',
        });
      }

      const isPrimitiveFile = rel === "src/components/ui.tsx" || rel === "src/components/identity.tsx";
      const isTest = rel.includes(".test.");

      if (isComponentOrPage && !isTest) {
        for (const cls of classStrings(line)) {
          const tokens = cls.split(/\s+/);
          if (tokens.includes("btn")) {
            const bad = tokens.filter((t) => /^btn-/.test(t) && !BTN_ALLOWED_MODIFIERS.has(t));
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
        if (
          !isPrimitiveFile &&
          rel.startsWith("src/pages/") &&
          /(?:className|style)=/.test(line) &&
          HEX_COLOR_RE.test(line)
        ) {
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
        if (!isPrimitiveFile && RESERVED_DEF_RE.test(line)) {
          violations.push({
            file: rel,
            line: lineNumber,
            message: `"${RESERVED_DEF_RE.exec(line)![1]}" duplicates a shared primitive; import it from src/components/ui.tsx or identity.tsx (extend it there if needed).`,
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
  const pagesDir = path.join(ROOT_DIR, "src/pages");
  const pageFiles = walkFiles(pagesDir);
  if (pageFiles.length > MAX_PAGE_FILES) {
    violations.push({
      file: toRel(pagesDir),
      line: 1,
      message: `src/pages/ has ${pageFiles.length} files (max ${MAX_PAGE_FILES}); consolidate pages.`,
    });
  }
}

const violations: Violation[] = [];
checkNoJsFiles(violations);
checkNoRawSelect(violations);
checkSrcRules(violations);
checkButtonHoverAndTimelineRules(violations);
checkPagesCohesion(violations);

if (violations.length > 0) {
  for (const v of violations) {
    console.error(`${v.file}:${v.line}: ${v.message}`);
  }
  process.exit(1);
}

console.log("Design & architecture lint passed.");
process.exit(0);
