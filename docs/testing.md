# テストの書き方

卓譜のテストは「仕様を読める形で残す」ためのもの。落ちたときにテスト名だけで何が壊れたか分かることを目指す。

## 種類と置き場所

| 種類 | 置き場所 | 環境 | コマンド |
| --- | --- | --- | --- |
| 純粋なロジック | `src/lib/**/x.test.ts`（対象の隣） | node | `pnpm test` |
| DOM を使うロジック | 同上、先頭に `// @vitest-environment jsdom` | jsdom | `pnpm test` |
| 画面・部品 | `src/**/x.test.tsx`、通しは `*.integration.test.tsx`（`src/test/integration-harness.tsx`） | jsdom | `pnpm test` |
| API の route | `src/app/api/**/route.test.ts`（`Request` を渡して状態・本文を確かめる） | node | `pnpm test` |
| Firestore ルール | `src/test/rules/*.rules-spec.ts`（`@firebase/rules-unit-testing`） | エミュレータ | `pnpm run test:rules` |
| SDK とルールの通し | `*.emulator.test.ts` | エミュレータ | `pnpm run test:emulator` |
| 画面の通し・デザイン検査 | `e2e/*.spec.ts` | ブラウザ | `pnpm run test:e2e` |
| 外部サービスとの契約（本物） | `src/test/live/*.live.test.ts` | node・本物のネット | `pnpm run test:live` |
| テストの強さ | `stryker.config.json` の `mutate` | node | `pnpm run test:mutation` |

`*.emulator.test.ts` は `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true` のときだけ動き、`pnpm test` では skip になる（エミュレータが無いと接続待ちで止まるため）。`pnpm run test:emulator` がエミュレータを立ててこの変数を付けて動かす。

## 本物の外部サービスでの確認（`pnpm run test:live`）

キャラシ・シナリオ・関連するものの取り込みが、相手のサイトの今の形で動くかを本物に繋いで確かめる。`pnpm test`・`pnpm run check`・CI には入れない（相手の都合で落ちる・相手に問い合わせが行く）。取り込みの読み取りを直したとき、相手のサイトが変わった疑いがあるとき、リリースの前に手元で動かす。

- **入口は画面と同じ。** キャラシ・シナリオは `handleExternalImport`（`parseExternalUrl` → `fetchUrls` → `parseExternalResponse`）、関連するものは `handleMediaPreview` を、本物の相手に対して呼ぶ。
- **見本はその場で拾う。** 保管所・ゆとシート・倉庫はシステムごとの公開一覧、いあきゃらは公開のタグ一覧、キャラエノは開発者向け文書の出力例、BOOTH は検索、TALTO は公開 API の新着から拾う。拾えないもの（冒険窓口・ふせったー・動画・X・キャラッシュの公式見本）だけを `src/test/live/live-samples.ts` に置く。実在の名前や本文はリポジトリに入れない。
- **書きかけの見本で落ちない。** 1 システムにつき候補を 3 件まで見て、期待を満たすものが 1 つあれば通す（`expectSomeCharacter`）。読み取りの誤りなら、どの候補でも落ちる。
- **相手に迷惑をかけない。** 同じホストへは 1 本ずつ・1.2 秒あけて送り（`politely`）、ファイルも 1 つずつ動かす。User-Agent は `TakufuLiveTest/1.0 (+https://takufu.app)`。
- **落ちたら根本の原因を直す。** サイトの形が変わった・システムの対応が違うなら読み取りを直し、その形を再現した **作った見本** で単体テスト（`pnpm test`）を足す。本物のキャラシは置かない。
- 対象外: Discord（`pnpm run test:e2e:discord` の偽サーバー、本番の設定は `node scripts/discord.ts setup-check --url https://takufu.app`）、Firebase（`node scripts/ops.ts firebase`）、ココフォリア・ユドナリウム・Tekey のログ（ファイルの読み込みで通信しない。`src/lib/__fixtures__` の作った見本で確かめる）。

## 書き方

- **名前は仕様を日本語で。** 「〜のとき〜を返す」「〜なら拒む」。`works`・`テスト1`・「A・B・C を検証する」は書かない。並べるなら `it.each` で 1 行ずつ名前を付ける。
- **1 テスト 1 関心。** 準備（Arrange）・実行（Act）・確認（Assert）を空行で分ける。確認が別々の振る舞いにまたがったら分ける。
- **振る舞いを確かめる。** 戻り値・画面に出るもの・HTTP の状態と本文で確かめる。内部の関数を何回呼んだかは、外から見える結果が無いときだけ。
- **期待は正確に。** `toBeTruthy` / `toBeFalsy` やスナップショットは使わない（lint で落ちる）。値が分かっているなら `toBe` / `toEqual`、一部だけなら `toMatchObject`。
- **時刻と乱数は固定する。** 現在時刻に依存するなら `vi.useFakeTimers()` + `vi.setSystemTime(...)`（`afterEach` で `vi.useRealTimers()`）か、時刻を引数で渡す。月末・日付の境目・タイムゾーンで落ちないこと。
- **テスト同士を独立させる。** 書き換えるデータは `beforeEach` か各テストの中で作る（`structuredClone` / 作る関数）。`vi.stubGlobal` / `vi.stubEnv` は自動で戻る設定。`vi.spyOn` は `mockRestore` するか `afterEach(vi.restoreAllMocks)`。
- **外部は境界で偽物に。** `fetch`・DNS・Firebase はモジュールの境界で `vi.mock` / `vi.fn` にする。本物の Discord・Google には繋がない（Discord は `pnpm run test:e2e:discord` の偽サーバー）。
- **skip には理由を書く。** `it.skip` / `todo` はすぐ上のコメントに「なぜ・いつ戻すか」を書く。条件で飛ばすなら `it.skipIf(条件)`。`.only` は残さない（lint で落ちる）。
- **見つけたバグ** は、直すなら別のコミットで、直さないなら `it.fails` と理由のコメントで残す。

## 機械的な検査

`pnpm run lint` の `scripts/lint-tests.ts`（規則は `src/lib/test-lint.ts`）が次を落とす: `.only`、理由のない skip / todo、スナップショット、`toBeTruthy` / `toBeFalsy`、jsdom を宣言せずに DOM を使う `*.test.ts`（node では DOMParser が無く、フォールバックの経路を黙って試してしまう）。
