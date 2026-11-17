# 卓譜 開発ガイド（AI エージェント向け）

## UI を変更する前に

1. [DESIGN.md](DESIGN.md) を読む。画面ごとの「最初に答える問い」、面・文字・ボタンの段階、部品の一覧がある。
2. 画面は `src/components/ui.tsx`（デザインシステム）と `src/components/identity.tsx`（人・キャラクター表示）の部品で組み立てる。足りない部品はページに作らず、そこに足す（同名の部品をページで定義すると lint で落ちる）。
3. 指摘を受けたら、直すだけでなく [docs/design-feedback.md](docs/design-feedback.md) に 1 行足し、`scripts/lint-design.ts`（ソース）か `e2e/design-audit.ts`（描画後）に検査を足す。指摘された場所以外の同種の箇所も探して直す。

汎用のデザインスキル（`.opencode/skills/frontend-design`、`impeccable` など）より DESIGN.md が優先する。卓譜は記録と閲覧の道具なので、目新しさや装飾ではなく抑制と一貫性を取る。

## 確かめ方

- `pnpm run check`: lint（oxlint・oxfmt・デザイン規約）、型、単体テスト、ビルド。
- `pnpm run test:e2e`: 主要な操作と、全画面のデザイン検査（横スクロール、面の入れ子、主ボタンは 1 つ、文字 12px 以上、禁止文言、コントラストなど）。開発サーバー（5173）を使う。
- `pnpm run review`: 全画面をデスクトップ・モバイル・ダークで撮影して `.impeccable/review/` に出す。`目視` 項目はこれで確かめる。コードを読んだだけで「直った」と言わない。

## 置き場所

- 画面: `src/pages`（13 ファイルまで。関連する画面は 1 ファイルにまとめる）。
- 書式・日付計算・取り込みなどフレームワークに依存しない処理: `src/lib`（単体テストを付ける）。
- すべて TypeScript。`.js` / `.mjs` / `.cjs` は置かない。
