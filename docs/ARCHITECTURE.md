# 卓譜 アーキテクチャ決定記録

Kimi K3.1 Pro に「アーキテクチャ」「ライブラリ・テスト」「情報設計」の3観点で相談した結果の意思決定(2026-11)。
アーキテクト案とライブラリ担当案には意図的な対立があり、以下のようにすり合わせた。

## 現在のスタック

- Vite + React 19 + TypeScript + Tailwind 3 + daisyUI 4（テーマ `takufu` / `takufuDark`）+ TanStack Router（履歴ベース）
- 状態: Context（`src/store.tsx`）+ localStorage / Firestore 永続化（zod による復元検証）
- UI: `src/components/ui.tsx`（デザインシステム）と `src/components/identity.tsx`（人・キャラクター表示）。規則は DESIGN.md
- テスト: Vitest（+RTL）/ Playwright（e2e、`e2e/design-audit.ts` による全画面のデザイン検査を含む）
- 以下の記録は 2026-11 前半時点の判断。ルーターとスモーク検査の記述は当時のもの

## 採用したもの

| 決定 | 根拠 |
|---|---|
| **CCFOLIA ログの tolerant パーサー(`lib/ccfolia-parser.ts`)** | 実ファイルを解析してそのまま保存する(サンプル構造と実記録を混在させない)。チャンネル混線防止(チャンネル単位でソート)、secret ヒューリスティック、roll/note 復元。フィクスチャ+E2Eで検証 |
| **招待→自己紐付けフロー(`/invite/:id`)** | PLがログインして発言者を引き受ける/発言者なしで参加(同意書なし、あとから解除可能)。E2Eで永続化まで検証 |
| 共有ゲート判定を純関数化(`lib/share-gate.ts`) | 両案一致。UI/サーバーで契約を共有しテスト可能に。**viewerId は未認証で null**(匿名は public のみ閲覧可) |
| セッション区間組み立てを純関数化(`buildSessionRange` + `sessionClock`) | QuickSession/EditLog/シナリオ作成の共通ロジック。**複数日の二重加算バグを修正** |
| zod を localStorage 復元境界に導入(`looseObject`) | ライブラリ担当案。未知キーは保持(前方互換)、不整合は seed へフォールバック。**復元に失敗した既存データは自動上書きしない**(persist を止めて警告バナー) |
| localStorage 書き込みのデバウンス+unloadフラッシュ | アーキテクトの指摘(全文 stringify の同期コスト)に対する最小修正。**storage イベントで他タブ更新を検知 → 保存停止+再読み込み案内**(単一 writer 化) |
| Upload 確定を非同期ユースケース関数化(`api/commands.ts` commitLogImport) | アーキテクト案の核心を Store 永続化のまま採用。**結果は snapshot から同期計算し apply で一括適用**(Promise成功=結果確定)。添付時の hidden 維持・添付先不在の失敗返却も実装 |
| 共有リンクを slug ベースに | アーキテクト案(実 URL と表示 URL の不一致を解消)。ハッシュ付き現在オリジンURLを表示 |
| 情報設計Top5(一覧最優先・作成入口分岐・共有モーダル集約・絵文字→SVG・空状態3種) | デザイン担当案 |
| 保存状態の可視化(保存失敗バナー/破損バナー/別タブ更新バナー)+ JSON エクスポート/インポート | Sol レビュー(P0: 保存失敗が黙ってデータ消失) |
| 認可(未認証=匿名は public のみ / 非所有者は共有・編集・参加者管理を非表示 / members・unknown ポリシーでは passed も禁止) | Sol レビュー(P0) |
| シナリオ詳細の集計を閲覧者から見えるログに限定 | Sol レビュー(一覧・集計にも可視性契約) |

## 先送りしたもの(本番 API 実装と同時に判断)

| 項目 | 再開条件 |
|---|---|
| IndexedDB への移行(メタデータ/Log本文の分離) | Firestore+R2 の実装開始時。契約(Log=`SessionMeta`+`LogContent`)の確定が先行タスク。現状は types.ts の Log に暫定集約)
| TanStack Query | 非同期 API 層が実在してから。同期 localStorage の上には載せない(3重管理になる) |
| AuthGateway 抽象 | Firebase Auth 実装時。BOOTH/TALTO 文面確認はログインと別 API として切り出す |
| BrowserRouter + `/l/:slug` | OGP/Worker による共有認可を実装するホスト(Vercel/Workers)で SPA rewrite を用意できるとき |
| zod の外部形式パーサー適用 | CCFOLIA JSON / いあきゃら の実パーサー実装時 |
| MSW | 実 HTTP(BOOTH/TALTO取得)実装時。Firestore は Emulator 推奨 |

## テスト戦略

| レイヤー | 対象 |
|---|---|
| Unit (Vitest) | `lib/time.ts`(sessionDay 6時区切り/複数日/実プレイ時間/buildSessionRange 往復一致)、`lib/system-guess.ts`、`lib/share-gate.ts` |
| Component (Vitest+RTL) | `ShareLog`(ゲートと自己申告)、`SessionTimeline`(share で secret/note を除外、own では表示、絞り込み) |
| E2E (Playwright) | 作成→永続化→scope 変更→別ユーザー→自己申告ゲート解除(`e2e/session-share.spec.ts`)。デバウンス保存のデータロスを検出した実績あり |
| Smoke (scripts/smoke.mjs) | 全ルート巡回・白画面/コンソールエラー検出・モバイル幅。広く浅い回帰 |

CI では E2E をビルド成果物(preview: 4178)に対して実行(`playwright.config.ts`、`process.env.CI`)。ローカルは dev(5173)を再利用。
Node は jsdom の要件(24系)に合わせること。

## 将来のディレクトリ構成(アーキテクト案・参考)

```
src/
  app/        # routes。(store)/ の中だけが記録（ストア）と Firebase を読む。providers.tsx（全画面）/ store-providers.tsx（記録を使う画面）
  domain/     # models / share-policy(純関数)
  api/        # contracts / errors / create-api / mock/(IndexedDB) / firebase/ / logs/(codec+object-store)
  auth/       # gateway / mock-auth / firebase-auth / account-verification
  features/   # sessions / upload / share / tables / characters / scenarios / settings (hooks + pages)
  components/ # ui / timeline(Read Model を受ける)
  workers/    # ccfolia-parser / log-codec
  lib/        # time / id
  data/       # systems(静的マスタ)
```

ページから直接見えるのは `features/*/hooks` と表示用型のみ。`api/mock`・Firestore・R2 を import しないルールにする。

## 運用上の注意

- 共有の秘匿は最終的にサーバー側(Worker/Rules)で行う。クライアントの投影フィルタは UI の便宜でしかない
- `edit`/`remove` には将来 `revision`(expectedRevision)を導入し conflict を返す。無条件リトライは network 系のみ
- モックのリセット: Settings「モックデータをリセット」(localStorage key `takufu-state-v4`)

## パフォーマンス・スケーラビリティ設計（2026-11-20 強化）

- **構造共有イミュータブル更新（`src/lib/draft.ts`）**: `update(fn)` は `JSON.parse(JSON.stringify(...))` ではなく Proxy ベースの Copy-on-Write (`produceDraft`) を使い、変更したパスだけ新しいオブジェクトを作る。これにより `WeakMap` キャッシュ（`sessionPlayMinutes` / `currentStat` / `lastPlayed`）や `React.memo` が未変更レコードに対してそのまま効く
- **Context 分割と署名ベースの差分クラウド同期（`src/store.tsx` / `src/workspace.tsx`）**: `StateCtx` と `SyncStatusCtx` を分け、`saving`/`saved` の変化で一覧全体を再描画しない。保存時は JSON 全文比較ではなくログ件数・文字列長等の軽量署名で変更チャンクだけを書き出し、チャンク削除・書き込みは並列バッチ（concurrency=3）で実行する
- **IndexedDB オーバーフローとマニフェスト先行検証（`src/lib/local-db.ts` / `src/lib/state-schema.ts`）**: `localStorage` の安全上限（3.5MB）を超える大容量ワークスペースは IndexedDB へ逃がす。クラウド同期では先に軽いマニフェストだけを取得し、`revision` がローカルと一致していればチャンク群のダウンロードをスキップする
- **初期バンドル分割**: `src/data/seed.ts`（`generated.json` 約 544KB）と `src/lib/cloud-state.ts` を `src/store.tsx` / `src/workspace.tsx` / `src/screens/Upload.tsx` から動的 `import()` に分離し、通常ルート（ログイン済み起動など）の初期 JS チャンクから除外する
- **公開ページはサーバーで描画（2026-11-22）**: 記録（ストア）と Firebase は `src/app/(store)/layout.tsx`（アプリ本体・共有ページ・`/signin`・`/demo`）の中だけで読み込む。LP・規約・ご意見（`src/screens/Landing.tsx`）とルートの layout / `BaseProviders` はストアを読まないので、HTML に本文が入り、JS に Firebase が載らない（`lint-design` で import を禁止）。ヘッダーの「ログイン / ホームを開く」は端末の目印（`src/lib/entered-hint.ts`）で切り替え、サンプルの開始は `/demo` で行う。LP から記録を使う画面へのリンクは `prefetch={false}`。ストアが外れるとき（公開ページへの移動）は保存待ちの変更を書き出す
- **LP の書体は LP の文字だけ（2026-11-22）**: 見出し（Dela Gothic One）と本文（Noto Sans JP 可変、400〜700）を、LP のソースに出る文字と横書きで使う OpenType 機能だけに絞った 2 ファイル（計約 145KB）にする（`pnpm run fonts:lp` = `scripts/subset-lp-fonts.ts`。要 python3 の fonttools・brotli）。ファイル名に中身のハッシュを入れて 1 年キャッシュ（`next.config.ts`）、`preload` と `@font-face` は LP の HTML に入る。代わりの候補は端末の書体だけにして、読み込み中に Noto の分割ファイルを呼ばない。文言を変えて作り直し忘れると単体テスト（`src/lib/lp-font-chars.test.ts`）が落ちる
- **UI 段階描画と遅延検索**: 長大なタイムライン（`SessionTimeline`）は `useDeferredValue` + 150 行単位の段階描画（`IntersectionObserver` + 「続きの発言を表示」ボタン、日付ジャンプ時は該当行まで自動展開）、一覧画面（Sessions / Tables / Characters / CharacterDetail / Scenarios / ScenarioDetail / UserDetail）は `LoadMore` で段階表示する
