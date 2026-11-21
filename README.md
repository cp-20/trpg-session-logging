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

## モバイルアプリ (`mobile/` · Expo)

iOS / Android 向けのネイティブクライアントを `mobile/` に同梱している。SQLite による即座の起動、3-Way マージ付きのバックグラウンド同期・オフライン送信キュー、端末カレンダー連携、クリップボード/ファイル/画像からのワンタップ取り込み、仮想化ログリーダー（しおり・画面消灯防止・対面の秘匿伏せ表示）、ローカル通知、生体認証ロック、感想カード PNG 書き出しと共有シートを備えている。

```sh
pnpm run mobile:device  # 実機テスト用サーバー起動 (WSL2 対応トンネル + Expo Go)
pnpm run mobile:start   # Expo 開発サーバー起動 (実機 Expo Go / Dev Client 向け)
pnpm run mobile:ios     # iOS シミュレータビルド & 起動
pnpm run mobile:android # Android エミュレータビルド & 起動
pnpm run mobile:typecheck
pnpm run mobile:export  # iOS / Android 本番バンドル書き出し検証
```

## 運用・デプロイ (`scripts/ops.ts`)

```sh
pnpm run check:firebase # Firebase Auth プロバイダ・許可ドメイン確認
pnpm run deploy:rules   # Firestore ルール (takufu データベース) のデプロイ
pnpm run deploy         # LOLIPOP! Deploy Now (takufu.lolipop-now.app) へソースを送り、クラウドでビルド
```

UI を触るときは [DESIGN.md](DESIGN.md)（規則）と [docs/design-feedback.md](docs/design-feedback.md)（過去の指摘と検査の対応）を、運用は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。
