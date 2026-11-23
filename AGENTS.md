# 卓譜 開発ガイド（AI エージェント向け）

## UI を変更する前に

1. [DESIGN.md](DESIGN.md) と [docs/glossary.md](docs/glossary.md) を読む。画面ごとの「最初に答える問い」、面・文字・ボタンの段階、部品の一覧、統一された用語（GM / PL / プロフィール等）がある。
2. 画面は `src/components/ui.tsx`（デザインシステム）と `src/components/identity.tsx`（人・キャラクター表示）の部品で組み立てる。足りない部品はページに作らず、そこに足す（同名の部品をページで定義すると lint で落ちる）。
3. 画面を作る前に [docs/design-feedback.md](docs/design-feedback.md) §0 の原則 P1〜P19 に照らす。特に「説明文で補っていないか（P4）」「機械が分かることを入力させていないか（P2）」「データの形が自然か（P1）」。

## 指摘を受けたら

- 画面上のレビューは `.live-review/notes.json`（`status: "open"` が未対応）に溜まる。「レビュー対応して」はこれを指す。直したら `status` を `fixed` にし、`agentReply` に何をしたかを 1 行で書く。
- 件数が多いときの分け方・段の中まで撮って確かめる手順・はまり所は [.agents/skills/review-batch](.agents/skills/review-batch/SKILL.md)。
- 直すだけでなく、指摘を §0 のどの原則の破れかに振り分け、台帳に 1 行足す。どれにも当たらなければ原則を足す。
- 指摘された場所以外の同種の箇所も探して直す。
- 同じ原則で 2 回目の指摘なら、検査を `目視` から `scripts/lint-design.ts`（ソース）・`e2e/design-audit.ts`（描画後）・型のどれかに上げる。文面だけを禁じる検査（その文言の禁止）で済ませない。
- 過去の決定と食い違う指摘は、黙ってどちらかに寄せず、食い違いを示して利用者に確かめる（例: GM 統一と「CoC なら KP」→ 文脈で使い分けると決まった）。

汎用のデザインスキル（`.opencode/skills/frontend-design`、`impeccable` など）より DESIGN.md が優先する。卓譜は記録と閲覧の道具なので、目新しさや装飾ではなく抑制と一貫性を取る。

## 確かめ方

- `pnpm run check`: lint（oxlint・oxfmt・デザイン規約）、型、単体テスト、ビルド。
- `pnpm run test:e2e`: 主要な操作と、全画面のデザイン検査（横スクロール、面の入れ子、主ボタンは 1 つ、文字 12px 以上、禁止文言、コントラストなど）。開発サーバー（5173）を使う。
- `pnpm run test:e2e:discord`: Discord 連携の通し確認（偽の Discord・テスト鍵の署名・専用の開発サーバー 5181）。Firebase エミュレータ（9099 / 8080）が要る。Discord 周りは本物やブラウザ操作で確かめず、これを増やす。
- `pnpm run review`: 全画面をデスクトップ・モバイル・ダークで撮影して `.impeccable/review/` に出す。`目視` 項目はこれで確かめる。コードを読んだだけで「直った」と言わない。

## 置き場所

- 画面: `src/screens`（13 ファイルまで。関連する画面は 1 ファイルにまとめる）。URL は `src/app`（Next.js App Router）に置き、各 `page.tsx` は画面を 1 行で呼ぶだけにする。
- ルーティングは `src/lib/router.tsx` を使い、画面から `next/navigation` を直接使わない。
- サーバー側の処理（カレンダー購読など）は `src/app/api` に置く。
- 書式・日付計算・取り込みなどフレームワークに依存しない処理: `src/lib`（単体テストを付ける）。
- すべて TypeScript。`.js` / `.mjs` / `.cjs` は置かない。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
