---
name: review-batch
description: 卓譜で「レビュー対応して」と言われたとき（.live-review/notes.json の open が多数）の進め方。指摘の振り分け・並行作業の分け方・画面の段の中まで撮って確かめる手順・過去にはまった所。
---

# レビュー対応のまとめ方（卓譜）

AGENTS.md「指摘を受けたら」と docs/design-feedback.md §0 が規則。ここは手順とはまり所。

## 1. 読む

```bash
python3 -c "import json;[print(json.dumps(n,ensure_ascii=False)) for n in json.load(open('.live-review/notes.json')) if n['status']=='open']"
```

- 指摘は `route`・`selector`・`elementText` で**どの要素に付いたか**を確かめてから一般化する。
  過去に「カーソルっぽいの紛らわしい」（検索欄に付いた指摘）をサイドバーの現在地の印のことだと取り違えて消し、
  あとで「なくさないで」と言われた。
- 同じ根の指摘をまとめる（幅 3 件、高さ 3 件など）。根が共通部品なら部品を直す（Combobox の高さは全画面の問題だった）。
- 過去の決定（DESIGN.md・台帳・lint）と食い違うものは、黙って寄せず食い違いを示す。直したら最後の報告で必ず触れる
  （例: 「翌」→ 25:00。持ち方は変えず書き方だけ変えた）。

## 2. 分ける

- ファイルが重ならない塊（取り込みの解析・シナリオの目録・生成画像・関連するもの）はサブエージェントに渡す。
  ui.tsx・identity.tsx・styles.css を触る塊は自分でやる（同時に書くとぶつかる）。
- サブエージェントには「触ってよいファイル」「build・e2e・`pnpm run check` は走らせない」「コミットしない」を書く。
- 作業ツリーには別のセッションの変更（モバイルなど）が混ざっていることがある。`git diff` で見てから触り、消さない。
  台帳の原則の番号（P17 など）も別のセッションが足していることがあるので、足す前に最新を読む。

## 3. 確かめる

1. 単体テスト（`src/lib` の純粋関数を先に書く）→ `pnpm run lint`・`pnpm run typecheck`。
2. 段の中の画面は `scripts/shots.ts` を雛形に撮って Read で見る。サンプルは `/demo` で入り、
   状態は localStorage の `takufu-state-v4` を書き換えて作る（初めての人: `s.logs = {}; s.characters = {}; s.tables = {};`、
   はじめの設定: `delete s.users[s.me].handle; s.prefs.onboardingDone = false;`）。書き換えは入って 800ms 待ってから。
3. 高さ・幅は目で見るより測る（`getBoundingClientRect`）。そのうえで `e2e/design-audit.ts` に検査を足す。
4. 最後に `pnpm run check` と `pnpm run test:e2e`。

## 4. はまり所

- `src/styles.css` の `.input` などは層の外にあるので、Tailwind の `bg-transparent` などの utility より後勝ちする。
  `.input` を借りて見た目だけ合わせるときは、面と枠を `style` で消す。
- `.input` の外枠（label・div）の中に入力欄やボタンを入れると、中身の行の高さ（daisyUI の `.input-sm` は line-height 2rem）に上下の余白が足されて 36/40px を超える。styles.css の `.input:has(> input, > button) { padding-block: 0 }` で全体を直した。高さの食い違いは `audit:control-height-parity` が拾う。
- `src/lib/lp-font-chars.test.ts` は Landing.tsx の文字（コメントも）を見る。Landing.tsx に新しい漢字を書くと落ちる。
- 完了の演出はモーダルが開く動き（300ms）と重なると見えない。`--dur-slow` のあとから始める。
- 返事は notes.json の `status: "fixed"` と 1 行の `agentReply`。対応しないもの・確認待ちは `open` のまま理由を書く。
