# 卓譜 クリティカルユーザージャーニー（CUJ）定義

卓譜の品質保証は、利用者の主要価値を体現する 7 本の **クリティカルユーザージャーニー（CUJ）** を軸に設計している。すべての CUJ は **結合テスト（`src/**/*.integration.test.*`）** と **E2E テスト（`e2e/*.spec.ts`）** の双方で継続検証される。

| ID | ジャーニー名 | 主な利用者価値 | E2E | 結合テスト |
|---|---|---|---|---|
| **CUJ-1** | オンボーディングとホーム把握 | デモ／アカウントに入り、返事待ち・予定・直近セッション・自分のキャラを即座に把握して移動できる | `e2e/layout.spec.ts`, `e2e/calendar-tables-scenarios.spec.ts` | `src/test/integration-harness.tsx` |
| **CUJ-2** | 多様なキャラシート取り込みと外部 URL 継続同期 | いあきゃら・キャラ保管所・ゆとシートⅡの URL や、複数ファイル / ZIP / テキストから探索者を取り込み、再同期で能力値変化と成長記録を非破壊反映できる | `e2e/character-import.spec.ts`, `e2e/bootstrap-import.spec.ts` | `src/screens/Characters.integration.test.tsx`, `src/app/api/import/external/route.integration.test.ts` |
| **CUJ-3** | マルチソースログ記録と通過履歴一括ブートストラップ | CCFOLIA / Discord / Udonarium / HTML ログの取り込みから発言者紐付け・共有公開範囲・タイムライン閲覧ができ、CSV / TSV / Markdown 表の過去履歴も一括取り込みできる | `e2e/recording.spec.ts`, `e2e/upload-real.spec.ts`, `e2e/session-share.spec.ts`, `e2e/bootstrap-import.spec.ts` | `src/screens/Upload.integration.test.tsx`, `src/screens/ShareLog.test.tsx` |
| **CUJ-4** | 卓作成・日程調整・カレンダー購読 | 自分固定メンバー付きで卓を作り、日程調整候補作成・一括回答・確定から予定反映とカレンダー配信データ生成まで完結できる | `e2e/calendar-tables-scenarios.spec.ts` | `src/screens/Tables.integration.test.tsx`, `src/screens/Calendar.integration.test.tsx` |
| **CUJ-5** | シナリオ登録（配布URL読込）・共同編集・ネタバレ制御 | BOOTH / TALTO URL からシナリオ情報を自動補完して登録でき、未通過者からの構造化修正提案を作者が差分で承認でき、ネタバレゲートが守られる | `e2e/bootstrap-import.spec.ts`, `e2e/calendar-tables-scenarios.spec.ts` | `src/screens/Scenarios.integration.test.tsx` |
| **CUJ-6** | プロフィール編集・外観設定・バックアップ復元 | モーダルでの表示名・自己紹介更新、ライト/ダークテーマ同期、記録エクスポート／再読み込み復元がリロードを跨いで保たれる | `e2e/calendar-tables-scenarios.spec.ts` | `src/screens/Settings.integration.test.tsx` |
| **CUJ-7** | アクセシビリティ（キーボード完結・拡大耐性・フォーカス表示） | スキップリンク・矢印キー操作（Select/Seg/Menu/Calendar）・Modal フォーカストラップ＆復帰・全操作要素の明瞭なフォーカス輪郭・320px/200%拡大で崩れと重なりが出ない | `e2e/a11y.spec.ts` | `src/components/*.tsx` + `@axe-core/playwright` |

## 結合テストと単体テストの境界方針

1. **純粋モジュール（`src/lib/*`, `src/api/commands.ts`）**: 依存ゼロ〜極小で切り出し、Vitest + StrykerJS による徹底的なミューテーションテストで境界値・分岐・セキュリティ検査を鍛える。
2. **機能結合テスト（`src/**/*.integration.test.*`）**: 外部境界（`fetch`, `next/navigation` ルータ、DNS、Firebase/Emulator）だけをテストダブルに置き換え、`StoreProvider` + `produceDraft` + `RestoredStateSchema` + コマンド + パーサー + 画面コンポーネントをすべて実物で結合して検証する。
3. **E2E テスト（`e2e/*.spec.ts`）**: 本番ビルド済み standalone サーバーに対し、実ブラウザ（Chromium）で CUJ と WCAG 2.1 AA / レイアウト検査を実行する（外部スクレイピング対象 URL への実ネットワーク接続のみ `/api/import/external` で決定論的モック可）。
