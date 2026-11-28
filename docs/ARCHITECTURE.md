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
- **Context 分割と公開の署名（`src/store.tsx` / `src/lib/publish-signature.ts`）**: `StateCtx` と `SyncStatusCtx` を分け、`saving`/`saved` の変化で一覧全体を再描画しない。共有ページは、署名（中身の指紋と、載る人・シナリオ）が前に公開したときと違うものだけを公開し直す
- **記録の分割保存（`src/lib/workspace-parts.ts` / `src/lib/cloud-state.ts`）**: 記録一式を、基本（人・卓・シナリオ・予定・設定）とセッション 1 件ずつ・キャラクター 1 件ずつの部品に分ける。`users/{uid}/workspace/manifest`（見出し）が `{ revision, parts: { "log:<id>": "<版>.<切れ端の数>.<指紋>" } }` を持ち、部品の中身は `users/{uid}/revisions/{版}/chunks/{0000…}`（12 万字ずつ、1 部品 2,400 万字まで、部品は 8,000 個まで）。保存は指紋の変わった部品だけを新しい版に書き、見出しをトランザクションでまとめて切り替え、置き換えた版を消す。読み込みは端末の控えと指紋の同じ部品を読まない。見出しの `revision` が手元と違えば保存を断る（競合の単位は記録全体）。切り替えの応答が失われたときは見出しを読み直し、切り替わっていないと確かめられた場合だけ書きかけを消す
- **IndexedDB オーバーフローとマニフェスト先行検証（`src/lib/local-db.ts` / `src/lib/state-schema.ts`）**: `localStorage` の安全上限（3.5MB）を超える大容量ワークスペースは IndexedDB へ逃がす。クラウド同期では先に見出しだけを取得し、`revision` がローカルと一致していれば部品を読まない
- **初期バンドル分割**: `src/data/seed.ts`（`generated.json` 約 544KB）と `src/lib/cloud-state.ts` を `src/store.tsx` / `src/workspace.tsx` / `src/screens/Upload.tsx` から動的 `import()` に分離し、通常ルート（ログイン済み起動など）の初期 JS チャンクから除外する
- **公開ページはサーバーで描画（2026-11-22）**: 記録（ストア）と Firebase は `src/app/(store)/layout.tsx`（アプリ本体・共有ページ・`/signin`・`/demo`）の中だけで読み込む。LP・規約・ご意見（`src/screens/Landing.tsx`）とルートの layout / `BaseProviders` はストアを読まないので、HTML に本文が入り、JS に Firebase が載らない（`lint-design` で import を禁止）。ヘッダーの「ログイン / ホームを開く」は端末の目印（`src/lib/entered-hint.ts`）で切り替え、サンプルの開始は `/demo` で行う。LP から記録を使う画面へのリンクは `prefetch={false}`。ストアが外れるとき（公開ページへの移動）は保存待ちの変更を書き出す
- **LP の書体は LP の文字だけ（2026-11-22）**: 見出し（Dela Gothic One）と本文（Noto Sans JP 可変、400〜700）を、LP のソースに出る文字と横書きで使う OpenType 機能だけに絞った 2 ファイル（計約 145KB）にする（`pnpm run fonts:lp` = `scripts/subset-lp-fonts.ts`。要 python3 の fonttools・brotli）。ファイル名に中身のハッシュを入れて 1 年キャッシュ（`next.config.ts`）、`preload` と `@font-face` は LP の HTML に入る。代わりの候補は端末の書体だけにして、読み込み中に Noto の分割ファイルを呼ばない。文言を変えて作り直し忘れると単体テスト（`src/lib/lp-font-chars.test.ts`）が落ちる
- **UI 段階描画と遅延検索**: 長大なタイムライン（`SessionTimeline`）は `useDeferredValue` + 150 行単位の段階描画（`IntersectionObserver` + 「続きの発言を表示」ボタン、日付ジャンプ時は該当行まで自動展開）、一覧画面（Sessions / Tables / Characters / CharacterDetail / Scenarios / ScenarioDetail / UserDetail）は `LoadMore` で段階表示する
- **体感の速さの調整（2026-11-28）**: 計測は `pnpm exec next analyze -o` と `next analyze export --route <route>`（モジュールごとの gzip サイズ）。最初に読む JS（gzip）は LP 532→230KB、ログイン 624→347KB、ホーム 724→371KB、セッション詳細 644→369KB、共有ページ 668→393KB
  - **控えを先に出す（`src/workspace.tsx`）**: ログインした人の端末に前回の控えと版があれば、Firestore の見出しを待たずに描画し、照合は後ろで行う。版が同じならそのまま。違えば控えの画面を外し（保存待ちは端末へ書き出される）、未同期の変更を退避してから読み直す。照合が済むまでは `cloudHold` でクラウドへ書かない。見出しを読めなければ控えのまま使い、保存は版の照合に任せる
  - **最初の JS から外したもの**: Firestore の SDK（`src/lib/firestore.ts` に分け、`auth` → `firebase.ts` から読まない）、Sentry の SDK（`src/lib/sentry-client.ts` が手の空いたときに読み、それまでの例外は溜めて送る）、ErrorBoundary の書き出し用の Firebase Auth、体験版の見本（何も始めていない人は `guestState()`。見本は `enterDemo` で読む）。再び載らないよう `lint-design` が静的 import をたどって検査する（公開ページ・アプリの起動）
  - **画面の切り替えを待たせない**: `[id]` の画面は `generateStaticParams() → []` の layout で静的な殻にし、一覧のリンクの先読みで殻まで読む（動的なままだと開くたびにサーバーの応答を待つ）。先読みが済んでいないときは `(app)/loading.tsx`。待ちの印（`PageLoading`）は 0.4 秒たってから現れる。記録を使う画面の HTML は、Firestore・ログインのサーバーへ `preconnect` する
  - **共有ページ**: 誰にでも見せてよい記録・キャラクターは、題名と OG 画像のためにサーバーが読んだもの（`src/server/shared-pages.ts`、React の `cache` で 1 回）を page から `initial`（Promise。page は待たずに HTML を返し、中身は届きしだい流れる。画面は `use` で待つ）で渡し、ブラウザでは Firestore を読まない
  - **長いログ**: 発言の行（`MessageRow`）は中身を自分で作り（`children` を受けない）、発言者の情報は中身が同じなら前の物を使い回す。記録のどこかが変わっても行の `memo` が効く。行は `content-visibility: auto` で画面の外を描かない
  - **見送ったもの**: React Compiler（`reactCompiler: true`）は入れていない。E2E は通るが、最初に読む JS が gzip で 15〜30KB 増える（LP 290→306KB、ホーム 421→450KB）。記録の更新は操作のときだけで、重かったログの行は手で memo を効かせたので、操作の遅さを測って要ると分かってから入れる。入れ直すときは E2E を本番ビルド（`CI=1 pnpm run test:e2e`）で通す
  - **同じものを指す URL への置き換えは `replaceUrlInPlace`（`src/lib/router.tsx`）**: 古い uid の URL → ID の URL を `nav` で置き換えると、Next.js は `[id]` が変わったとして画面を作り直し、その間に開いた編集が消えていた（表示の直後に押すと開かない）。`history.replaceState` なら作り直さない
  - **起動の検証**: 発言は数万件になるので、`state-schema.ts` は発言 1 件を zod ではなく手で確かめる（6 万件で zod の上乗せ 55ms → 数 ms）
