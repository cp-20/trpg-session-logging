# 卓譜 (Takufu)

TRPGのセッションログ・探索者・卓の記録を管理するWebアプリケーション（Next.js + React + TypeScript + daisyUI + Firebase）。

```sh
pnpm install
cp .env.example .env.local
pnpm run dev            # http://127.0.0.1:5173 （画面にコメントを残すレビューは ?review=1 を一度開く）
```

## 検証・開発コマンド

```sh
pnpm run lint           # oxlint + oxfmt + デザイン/設計ルール検査 (scripts/lint-design.ts)
pnpm run fmt            # oxfmt によるコード整形
pnpm run check          # lint + typecheck + unit test + production build
pnpm run test:e2e       # Playwright E2E テスト
pnpm run review         # 全画面をデスクトップ・モバイル・ダークで撮影し、デザイン検査の結果と .impeccable/review/ に出す
pnpm run gen:data       # モックデータ (src/data/generated.json) の再生成
```

## 運用・デプロイ (`scripts/ops.ts`)

```sh
pnpm run check:firebase # Firebase Auth プロバイダ・許可ドメイン確認
pnpm run deploy:rules   # Firestore ルール (takufu データベース) のデプロイ
pnpm run deploy         # LOLIPOP! Deploy Now (takufu.lolipop-now.app) へソースを送り、クラウドでビルド
```

UI を触るときは [DESIGN.md](DESIGN.md)（規則）と [docs/design-feedback.md](docs/design-feedback.md)（過去の指摘と検査の対応）を、運用は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。
