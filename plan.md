# 卓譜 (Takufu): TRPGセッション・ログアプリの計画

KPがCCFOLIAのログを一度アップロードして卓に紐付け、各プレイヤーが自分のキャラクターを添付できる無料アプリです。ログ、キャラクター、シナリオ、ユーザーのハブであり、カタログ、インポート、アカウント連携、作者による所有権の申請を備え、Hankyōへ進む最初の一歩です。

On this page

[要点](#bottom "要点")[ポジショニング](#position "ポジショニング")[無料ツールではなくこのアプリを選ぶ理由](#compare "無料ツールではなくこのアプリを選ぶ理由")[MVPの範囲](#scope "MVPの範囲")[ユーザーの流れ](#flows "ユーザーの流れ")[シナリオカタログ：入手元と利用条件](#catalog "シナリオカタログ：入手元と利用条件")[インポート：実際の形式](#imports "インポート：実際の形式")[アカウント連携と確認方法](#accounts "アカウント連携と確認方法")[シナリオ所有権の申請](#claims "シナリオ所有権の申請")[データモデル](#data "データモデル")[アーキテクチャ](#arch "アーキテクチャ")[グロースの循環](#growth "グロースの循環")Show all 17

## 要点

より優れたフォーマッタを作るのではなく、卓の記録が残り、プレイのすべてがつながる場所を作る。

無料のフォーマッタ（ろぐしあたー、サザノノ）はすでにCCFOLIAのJSONを読めますが、単一ファイルで、1台の端末に留まります。卓譜は、共有され、残る記録であり、それを取り巻くハブです。KPによる一度のアップロード、そのログからプレイヤーアカウントへの任意の紐付け（記入する同意フォームはありません）、ユーザーに帰属しセッションをまたいで使えるキャラクター、検索と逆引きができるシナリオカタログ、他アプリからのインポート。共有リンクは、作者のログルールが分かっているときはそのルールに従います。作者は、その作品を頒布しているBOOTHショップやTALTOのページを連携し、カタログ上のシナリオの所有権を申請できます。シークレットタブとシナリオ本文の行は、既定では非表示です。プレイヤーはいつでも、ログから自分の紐付けを外したり、自分を非表示にしたりできます。

プレイヤーの同意は任意であり、利用の前提ではありません。誰かが使う前にすべてのPLへ承認を求めると手間が大きすぎるため、KPは待たずにプレイヤーアカウントを付けられます。プライバシーは、既定の設定と、いつでも外せる導線で守ります。必須のチェックリストでは管理しません。

仮称は卓譜です（「テーブルの記録」。将棋や囲碁の棋譜に由来します）。検索した範囲では、この名前を使っているTRPG製品は見つかりませんでした。計画の作成日は2026年11月15日（JST）です。同日、同意を必須の関門にしない形へ改め、すべてのユーザーが自分のキャラクターを紐付けられるようにし、逆引きできるシナリオカタログを加え、アプリをインポートのハブとして扱うよう直しました。同日夜、ログの保存をgzipからzstdへ変更し、Discord、BOOTH、X、TALTO、pixivなどのアカウント連携と、頒布元アカウントの連携によるシナリオ所有権の申請を追加しています。日本語はこの版から、翻訳モデルを使わず計画として書き直しています。

## ポジショニング

想定ユーザー

CCFOLIAでCoC 6/7、エモクロア、その他の同人シナリオを遊ぶKPとPL。中心はテキストセッション（テキセ）で、ダイスにCCFOLIAを使うボイスセッション（ボイセ）も含みます。継続探索者を演じるプレイヤーが核です。2025年に約800人のCoCプレイヤーを対象にした調査では、約80%が継続探索者を演じたいと答えています。

誰が誰を連れてくるか

HTMLまたはJSONのログを書き出せるのはルームマスターだけです（CCFOLIA v1.37の注記）。したがって、最初に獲得すべきなのはKPです。アップロード1回につき、3〜5人のプレイヤーを招待できます。プレイヤーは、自分のキャラクターを紐付けたり、関心のあるシナリオを検索したりして、自分から来ることもあります。

中心の仕事

セッション後に「この卓のログを安全な場所に置き、全員へ届け、シナリオのネタバレや誰かを困らせることなく見せたい」。いまKPはDiscordでHTMLファイルを回し、各プレイヤーがローカルのフォーマッタで開いています。

二つ目の仕事（プレイヤー）

「自分の探索者の物語をすべて見たい」。どのシナリオをパスしたか、SANの推移、クリティカル、死にかけた場面。いまその履歴は、キャラクターシートの「探索者の履歴」へ手入力されています。

三つ目の仕事（全員）

「情報を一箇所にまとめたい」。ログ、キャラクター、シナリオ、ユーザー、そして後にはアイテムが互いを指しているべきです。いあきゃらやキャラクター保管所にすでにあるデータは、打ち直すのではなく取り込みたいものです。

JSONだからできること

発言ごとの時刻（セッション時間、シーンごとの時間）、壊れやすいHTML解析に頼らない構造化ロール（クリティカル、ファンブル、シークレット）、タブ単位のプライバシーのための`channel`、シナリオ本文だと分かる`note`行（自動で非表示にし、Hankyō向けに指紋を取れます）。

Hankyōへのつなぎ

すべてのログにシナリオIDとENDラベルを付けられます。ノート行の指紋とロールの要約は、ネタバレのないラン記録として残します。頒布元アカウントを連携してシナリオの所有権を申請した作者が、のちにその統計の宛先になります。作者への共有は、アップロードとも申請とも別の、後から入れる、既定ではオフの任意項目です。

### 無料ツールではなくこのアプリを選ぶ理由

機能ろぐしあたーサザノノクリファン率チェッカーころログtakulog卓譜CCFOLIA JSONの読み込み可可不可（HTML/TXT）HTMLインポート（ベータ）不可（手入力）可端末をまたいだログの保存不可、ローカルのみこの端末、ファイルの受け渡し不可可ログではなく記録可ログへのプレイヤー紐付け不可不可不可可（ボイステーブル）不可可。KPは同意書なしで紐付け可能ログをまたいだ、ユーザー帰属のキャラクター不可不可不可ボイスのプロフィール手動可。どのユーザーも自分のキャラクターを紐付け可能検索と逆引きができるシナリオカタログ不可不可不可不可不可可（表示範囲内）他アプリからのインポートCCFOLIA / critical-stageのログCCFOLIAのログHTML/TXTファイルCCFOLIA HTML、いあきゃら / Charaeno `.txt`手動初回リリースではCCFOLIAのログとキャラクターJSON、いあきゃらのテキスト、保管所のJSON作者のログルールに従う不可不可不可不可不可可連携した頒布元アカウントでシナリオの所有権を申請不可不可不可不可不可可（アカウント確認後）シナリオ本文とシークレットタブの自動非表示手動で非表示行単位の手動マスキング該当なし該当なし該当なし可、既定で非表示セッションをまたいだ探索者の履歴不可不可ファイルを一度集計し、保存しないボイスのキャラクタープロフィール手動紐付けたキャラクターから自動見栄えのよい整形とPDF強い強い不可リプレイ小説不可基本のみ。あとは受け渡し価格無料無料無料¥0〜¥1,480/月不明無料、サポーター ¥300

KPへの伝え方は「ファイルの代わりにリンク一つ。誰のシークレットタブも漏れない」。PLへの伝え方は「あなたのための、探索者の物語のすべて」。整形は、すでに好まれているツールへ意図して任せます。

ころログの動向には注意が必要です。

すでに参加メンバー全員と卓を共有し、ダイス分析やキャラクタープロフィールを出し、ベータではCCFOLIAのHTMLを取り込んでいます。ボイスが先行し、AIの利用時間に応じて課金されます。卓譜の強みは、テキストログ、セッションをまたぐユーザー所有のキャラクター、シナリオカタログ、作者ルールです。まずはこれらを実装します。同意を必須にして勝とうとはしません。

## MVPの範囲

以下の6週間の一人体制が、公開版の切り出しです。ログは第1週からzstdで保存します（あとから差し替える作業にはしません）。すべてのシナリオサイトからの自動取り込み、Udonariumところログのインポート、ハブ上の独立したアイテム、pixiv連携、サークルの共同所有者の招待は後日とし、その旨を明記します。

必須（1〜4週目）導入予定（第4〜6週）以降

機能内容と目的CCFOLIA JSONパーサー（v1.37形式）`text` / `note` / `system`、`channel`、`createdAt`、`extend.roll` を読みます。アップロード前にブラウザ上で動かします。旧形式のCCFOLIA HTMLパーサー既存ログの多くはv1.37より前です。ロールのフラグはBCDiceの結果文字列から組み立て直します。確認と伏せ字の画面シークレットタブ、シークレットロール、シナリオ本文の`note`行は既定で非表示です。KPは任意の行や発言者を非表示にでき、必要なら再表示もできますが、共有は非表示の既定から始まります。KPによるプレイヤーアカウントの紐付け書き出しにはプレイヤーIDはなく、キャラクターの`name`と`color`だけです。KPは招待するか、すでに知っているアカウントを付けます。同意フォームは不要です。紐付けられたユーザーには通知が行き、あとから紐付け解除や非表示ができます。どのユーザーでも、自分のキャラクターを紐付けられるキャラクターは一つのログではなく、ユーザーに属します。所有者（またはKP。あとで所有者が付け替えられる場合）が発言者へ付けます。同じキャラクターを後続のログでも使えます。メンバー限定の閲覧と、共有範囲の既定紐付けられたメンバーはログを読めます。既定の共有範囲はメンバー限定（KPと紐付けられたアカウント）です。公開はKPが付けるまでオフで、シナリオのログポリシーが禁じている場合は付けられません。3つの範囲を持つ共有リンクメンバー、そのシナリオをプレイした人（自己申告）、または公開。既知のログルールがあるときは、各リンクはそのルールで上限が決まります。不明なポリシーはメンバー限定として扱います。マイログのライブラリ自分が回した、紐付けられた、またはキャラクターを付けたすべてのログを、シナリオ、システム、キャラクター、日付で探せます。紐付け解除、非表示、削除、報告ユーザーはいつでも自分の紐付けを外したり、自分を非表示にしたりできます（共有ページとシナリオの逆引きから名前が消えます）。アップロードした人はログを削除できます。誰でも削除を求めて報告できます。アカウント削除は、所有キャラクターとアップロードにも波及します。

## ユーザーの流れ

1.  1
    
    1\. アップロード（KP）
    
    `{room}_log.json`（または旧HTML）をドロップします。ブラウザ内で解析します。シナリオ（BOOTHやTALTOのURL、または自由記述）を検索または貼り、システムを選び、セッション日を入れます。この時点では、まだ端末の外には何も出しません。
    
2.  2
    
    2\. 確認と伏せ字（KP）
    
    チャンネルはメイン、情報、チャット、シークレットにまとめます。シークレットタブ、`secret: true` のロール、`note`行は最初から非表示です。発言者にはPC、NPC、KPのラベルを付けます。KPが確定したあとだけ、伏せ字済みのログをアップロードします。完全なログは、KPが非公開コピーの保管を選ばない限り、端末に残ります。
    
3.  3
    
    3\. 人とキャラクターの紐付け
    
    KPは既知のアカウントを発言者に付けるか、卓のDiscordに招待リンクを一つ投稿できます。各ユーザーはあとからサインインし、発言者を引き受け、自分が持つキャラクターを付ける（または取り込む）こともできます。紐付けは任意です。ログを使う前に書く同意書はありません。
    
4.  4
    
    4\. リンクの共有
    
    既定の範囲はメンバー限定です。KPは「すでにプレイした人」または公開へ広げられますが、シナリオのログポリシーを超えることはできません。作者が公開ログを禁じている場合、公開の選択肢は灰色表示になり、ポリシーの出典を示します。非表示の行、シークレットタブ、非表示または紐付け解除したユーザーは、共有ビューから外れます。
    
5.  5
    
    5\. マイログと探索者カルテ
    
    自分が回した、または紐付けられたすべての卓が、絞り込み付きで並びます。所有する各キャラクターには、セッションの時系列が出ます。
    
6.  6
    
    6\. 紐付け解除、非表示、または削除
    
    ユーザーはいつでも、自分を非表示にする（共有ページと逆引きからは消えますが、KPには見えます）か、完全に紐付けを外せます。KPはログ全体を削除できます。報告ボタンで削除手続きが始まります。保存オブジェクトの削除は24時間以内に完了します。
    
7.  7
    
    7\. シナリオを探す
    
    誰でもカタログを検索できます。シナリオを開くと、各ログの共有範囲で閲覧が許されているログとユーザーだけが表示されます。
    
8.  8
    
    8\. 外部アカウントの連携
    
    アカウント設定から、DiscordまたはXを公式OAuthでつなぐか、BOOTHショップやTALTOプロフィールの文面確認を始めます。確認コードには有効期限があります。卓譜は、ユーザーが指定した公開URLだけを、ログイン用のCookieなしで取得します。連携はあとから外せます。
    
9.  9
    
    9\. シナリオの所有権申請（作者）
    
    ソースURLが、連携済みの頒布元アカウントと一致するカタログページで、申請します。その後、ログポリシーの設定と、タイトル、作者、システム、出典メタデータの編集ができます。不当な申請は誰でも報告でき、運用者が確認するまで凍結します。
    

## シナリオカタログ：入手元と利用条件

カタログに保存するのはメタデータです（タイトル、作者、システム、ストアやWikiのURL、分かっている場合はログポリシー）。シナリオ本文や有料ファイルは保存しません。ユーザーはカタログを検索し、ログにシナリオを付け、シナリオから公開されているランやユーザーを逆引きします。

BOOTH、TALTO、しなポケ、scenarchの公式公開APIは見つかりませんでした。この計画では、いま許されている方法を優先し、それ以外は後日またはリスクありとします。

ソース初回リリースで現実的なもの公式APIまたはフィード規約の要約判断ユーザーが貼ったURL、または入力したタイトルKPまたはプレイヤーがBOOTH、TALTO、その他のURLを貼ります。卓譜はその公開ページ1件からタイトルと作者を取るか、URLとユーザーが確認したタイトルを保存します。該当なし（ユーザー起点）公開ページのみ。ログイン用のCookie、購入ライブラリ、限定公開のTALTO作品は使いません。推奨。まずこれを実装します。BOOTHの公開アイテムTRPG関連カテゴリの公開アイテムページ（タイトル、ショップ、価格、タグ、URL）を、遅く、丁寧に巡回します。製品ファイル、ウィッシュリスト、購入履歴は対象にしません。公式の公開APIは見つかりませんでした。第三者製ライブラリはありますが、非公式です。2025年10月10日、BOOTHは常識の範囲での公開情報の取得を認め、第三者の検索・推薦アプリを歓迎する一方、過度な負荷、損害、非公開データは引き続き禁ずると発表しました。ガイドライン本文が改訂されるまでの当面の扱いであり、BOOTHが変更する可能性があります。低速で、公開アイテムのみ、メタデータのみなら、現時点では許容されます。公開前にガイドラインを再確認します。第1週ではなく、第5〜6週から始めます。TALTO一括クロールはしません。ユーザーが貼った公開URL 1件からタイトルと作者を取るか、その方が安全と判断すれば取得せずに保存します。限定公開や非公開の作品は取得しません。公式APIもサイトマップも見つかりませんでした。TALTOはココフォリア株式会社が運営しています。利用規約にスクレイピングという語はありません。ただし、他のユーザー情報の収集、サービスへの過度な負荷、運用の妨害、リバースエンジニアリング、およびTALTOが許さない限りの商用利用は禁じられています。一括取り込みはリスクがあります。カタログの巡回の前に、TALTOへ書面で問い合わせます。それまでは、ユーザー投稿のURLのみです。しなポケ、scenarch、Scenario Tuker、TRPGシナリオWiki6週間のカタログには含めません。後日、タイトルとリンクのみ、かつサイトの利用規約とライセンスが許す場合に限ります。シナリオ本文やカバー画像のコピーはしません。今回の確認では公式APIは見つかりませんでした。しなポケの利用規約は、説明文や画像の無断再利用と、サービスの妨害や過度な負荷を禁じています。他のWikiや索引は、ここでは再確認を完了していません。後日、ライセンスと利用規約の確認後、または運営者への問い合わせ後です。ユーザーが貼ったリンクは、いまも問題ありません。Xハッシュタグやプロフィールのスクレイピングはしません。ユーザーが投稿URLを貼ることはできます。費用が見合う場合、後日公式APIクライアントを置くことはあり得ます。公式X API。有料で、独自の開発者ポリシーがあります。Xの利用規約は、公開API以外でのスクレイピングや自動アクセスを禁じています。スクレイピングはしません。公式APIのみ、かつ後日のみです。

シナリオページの逆引きでは、非表示または紐付けのない人は使いません。共有範囲のうえでそのランが見えないログも出しません。「N回プレイ済み」の件数は、作者のポリシーが件数自体を許す場合に限り、メンバー限定のランを名前なしで含められます。

## インポート：実際の形式

ハブは、ユーザーがすでに持っているデータを持ち込めてこそ役に立ちます。初回リリースでは、ユーザー自身が書き出したファイルをアップロードまたは貼り付けます。卓譜は他サービスにログインせず、非公開のライブラリも取得しません。

ソース実際の書き出しまたはインターフェース卓譜が取り込むもの時期CCFOLIAのメッセージログ公式のHTMLまたはJSON書き出し（`{room}_log.json`、v1.37の`MessageData`）。書き出せるのはルームマスターのみです。PROでは、10万件を超えるメッセージの書き出しをzipに分割します。セッションログ（すでに必須）。必須CCFOLIAのキャラクタークリップボードJSON文書化されているClipboard API（v1.19以降のベータ）：`{"kind":"character","data":{...}}`。`name`、`memo`、`status`、`params`、`commands`、`color`などを含みます。多くのシートツールに、これを出す「CCFOLIA用にコピー」があります。ユーザーが所有し、のちに発言者へ付けるキャラクター。アイコンは依頼制作であることが多いため、画像は既定では含めません。導入予定CCFOLIAのルームデータルームの公式ZIPの書き出しと読み込み。共有できるルームデータZIPの書き出しはPRO機能です。音源は含まれません。文脈としてのルーム内容（マップ、駒）。セッションの記録自体には必須ではありません。後日いあきゃら公式の「キャラ出力」→「ファイルに出力」が、オフライン保存用のテキスト（`.txt`）を出します。公式FANBOXの3月の更新で確認でき、ころログの入力としても使われています。シートツールからのCCFOLIAクリップボードコピーも一般的です。卓譜キャラクターの探索者欄（名前、SAN、スキル、あれば探索者の履歴）。導入予定キャラクター保管所公式のJSON（およびJSONP）インターフェース：シートURLの`.html`を`.js`に置き換えます（例：`https://charasheet.vampire-blood.net/100.js`）。公開のWebインターフェースとして文書化されています。XMLはありません。利用規約は、このJSONを自身のバックアップとして保存するよう案内しています。URL、またはユーザーが貼ったJSONからのキャラクター。ユーザーに使う権限があるシートのみです。導入予定Charaenoテキスト書き出し（`.txt`）。ころログの入力として挙げられています。レイアウトが解析できれば、いあきゃらのテキストと同じ経路です。初回のパーサーが間に合わなければ後日。手間が小さければ導入予定。ろぐしあたーブラウザでCCFOLIAまたはcritical-stageのHTML/JSONを読みます。編集したログを再読み込みできるHTMLとして保存し、Markdown、プレーンテキスト、xlsx、PDFを書き出せます。サーバー側APIはありません。元のCCFOLIA書き出しを優先します。保存済みのHTML / Markdown / テキストは、後日の予備とします。後日（HTML/Markdown/テキスト）。CCFOLIAの元ファイルはすでに必須です。Udonariumルームのzipに`chat.xml`が含まれます。キャラクター駒の書き出しは、XMLと画像を含むzipです。チャットタブのzipには`chat_`という接頭辞が付きます。CCFOLIAが安定したあとのログ（`chat.xml`）とキャラクター（XML zip）。後日ころログプライバシーポリシーと利用規約では、設定画面からデータを書き出せ、音声や生成テキストをダウンロードできるとあります。その設定エクスポートの正確なファイル形式は、確認したページには書かれていませんでした。すでに受け付けている入力は、CCFOLIA HTML、いあきゃら / Charaeno `.txt`です。ユーザーがダウンロードした書き出しのみ、かつ形式の確認後のみです。ころログをスクレイピングしません。後日、形式未確認

## アカウント連携と確認方法

サインインとアカウント連携は近いですが、同じではありません。卓譜のアカウントは、すでにXまたはDiscordで作れます。そのアカウントへ、さらに別の身元を付けることもでき、作者がシナリオの所有権を申請するときに使うのは、後者の連携です。卓譜はBOOTH、TALTO、pixivのパスワードを求めず、これらのサイトのログイン用Cookieも保存しません。

サービス公式の認証があるか卓譜での確認方法時期Discordあります。公式OAuth2の認可コード付与です。スコープは`identify`で足ります。`GET https://discord.com/api/v10/users/@me`が使え、安定したユーザーIDが返ります。Discordのアプリケーションを登録し、公式の認可URLへ送り、トークンエンドポイントでコードを交換し、DiscordのユーザーIDを`linkedAccounts`に保存します。Discordでサインインしている場合、その身元はすでに連携済みです。導入予定Xあります。Firebase Authenticationの公式Twitter/Xプロバイダ（`TwitterAuthProvider`、プロバイダIDは`twitter.com`）は、Xの開発者アプリの認証情報（APIキーとAPIシークレット）を使い、公式のOAuth 1.0aアクセス・トークンとシークレットを返します。すでにFirebaseユーザーであれば、`linkWithPopup` / `linkWithRedirect`でXを付けられます。のちにX公式APIへ、OAuth 2.0のAuthorization Code + PKCEで直接問い合わせることもできますが、APIの提供範囲と料金は変わりやすく、第1週に再確認が必要です。すでに使う予定のFirebaseプロバイダを優先します。公式のコールバックから得たXのユーザーIDを保存します。Xのプロフィールをスクレイピングせず、非公式のエンドポイントも使いません。導入予定BOOTH公式OAuthも、公開の開発者APIも見つかりませんでした。BOOTHへのログインはpixiv経由で、こちらも第三者向けOAuthとしては提供されていません。ショップページは公開されています。公式ヘルプにショップの案内があり、ショップ紹介は公開のショップトップに出せます。文面による確認です。ユーザーは公開ショップのURL（例：`https://example.booth.pm`）を指定します。卓譜は短い、一度きりの確認コード（と卓譜のプロフィールURL）を出します。ユーザーはそれを、そのショップの公開欄に置きます。卓譜はログイン用Cookieなしで、その公開ページだけを取得し、コードがあるときだけ連携を認めます。あとから申請に使う外部IDは、ショップのサブドメインです。導入予定TALTO公式OAuthも、公開の開発者APIも見つかりませんでした。公式ヘルプでは、アカウントでプロフィールを設定できるとあります。公開のユーザーページ（例：`/users/{id}`）にはプロフィール文と、その人が投稿した作品が出ます。ユーザーが指定した公開プロフィールページに対する、同じ文面確認です。外部IDはURL内のTALTOユーザーIDです。公開プロフィールのみで、限定公開や非公開のページ、ログイン用Cookieは使いません。導入予定pixiv公式の、第三者向け公開OAuthや開発者APIは見つかりませんでした。コミュニティ文書にある非公式のモバイルOAuthは使いません。公開プロフィールには自己紹介があります。後日、ユーザーが指定した公開プロフィールへの、同じ文面確認です。非公式APIも、pixivのログイン用Cookieも使いません。後日その他公式OAuthがあるサービスではそれを使います。なければ、ユーザーが指定した公開プロフィールURL 1件への文面確認です。データモデルに汎用の枠を用意し、のちの公式連携を、大きな移行なしで足せるようにします。後日

文面確認に共通する規則です。コードはランダムで、一度きりで、短時間（おおよそ30分）で失効します。卓譜は、ユーザーが送った公開URLだけを、遅く、そのコードを探すためだけに取得します。表示名は証拠にしません。成功後、ユーザーはページからコードを消して構いません。卓譜は`verifiedAt`と正規の外部IDを残します。最初の申請や紛争の前など、機微な操作の前には再確認を求められます。連携はユーザーが外せます。外した場合、既存の申請は静かに消さず、確認待ちにします。

## シナリオ所有権の申請

カタログの行は、同じ表示名を入力するのではなく、それを頒布しているアカウントを操作できることを示して申請します。

1.  1
    
    頒布元アカウントを連携する
    
    作者は、そのサービスに応じた確認方法で、BOOTHショップまたはTALTOユーザーを連携します。
    
2.  2
    
    一致するカタログの行を申請する
    
    `sourceUrl`がそのショップまたはユーザーに属するシナリオ（同じホストとショップサブドメイン、または同じTALTOユーザーID）で、申請します。
    
3.  3
    
    ポリシーとメタデータを編集する
    
    卓譜は`claimedByUid`、`claimedViaAccountId`、`claimedAt`を記録し、`authorVerified`を真にします。申請者は`logPolicy`の設定と、タイトル、作者、システム、出典メタデータの編集ができ、のちにこのアカウントをHankyōに使えます。
    
4.  4
    
    照合できない行は自動申請できない
    
    自由記述のタイトルだけ、または連携アカウントに照合できないURLだけの行は、自動では申請できません。作者は先に正しいURLを付けるか、運用者へ人手の確認を依頼します。
    

サークルと共同作者

BOOTHショップもTALTOユーザーも、何人かで書いた作品でも、多くの場合アカウントは一つです。最初に成功した申請者が主たる所有者になります。共同所有者の招待（他の卓譜ユーザーを、ショップ確認のやり直しなしで招くこと）は後日とし、6週間の切り出しを小さく保ちます。それまでは、ログルールを決めるのは主たる所有者です。編集権限が必要な共同作者は、すでにショップを共有している場合にその卓譜アカウントを共有するか、共同所有者の招待を待ちます。招待は委任であり、ショップを操作できることの二度目の独立した証明にはしません。

紛争となりすまし

誰でも申請を報告できます。報告されると申請は凍結され、運用者が見るまでポリシーとメタデータは変えられません。メンバー限定の既定は維持し、争われているポリシーを静かに広げません。報告者と申請者は、ショップへ新たに置いたコード、説明、ショップ所有者にしかできない変更などを証拠として付けられます。ショップが譲渡または乗っ取られた場合、新しい管理者が同じURLで文面確認をやり直し、紛争を開けます。表示名の一致を所有権とはみなしません。文面確認はOAuthより弱い方法です。確認の時点で、その公開ページを編集できたことしか示しません。対策は、URLの完全な一致、短い寿命のコード、Cookieを使わないこと、申請前の任意の再確認、申請と紛争の監査、そして人手の確認待ち（最初の数か月は運用者本人）です。申請は、公開ログやHankyōへの同意ではありません。Hankyō向けの作者の任意項目は、別の、後から入れる、既定ではオフの操作のままです。

## データモデル

エンティティ主なフィールド保存先備考usersuid, displayName, plan, createdAtFirestoreFirebase Auth（XおよびDiscordでのサインイン）。外部の身元は`linkedAccounts`に置きます。logslogId, ownerUid, title, system, scenarioId?, startedAt, endedAt, sourceFormat, messageCount, channels\[\], status (draft / members / shared), shareScope (members / passed / public), endLabel?Firestoreセッション長は最初と最後の`createdAt`から計算します。既定の`shareScope`は`members`です。log blob（伏せ字済み）messages\[\]: i, t, ch, speakerId, type, text, roll, noteRefR2、zstd圧縮したJSONメンバーと共有リンクが読む内容です。メモ本文は`noteRef`に置き換えます。シークレットタブの行は、KPが再表示しない限り含めません。生のzstdフレームとして保存し、`customMetadata.compression = zstd`を付けます。オブジェクトにHTTPの`Content-Encoding: zstd`は付けません（「アーキテクチャ」を参照）。log blob（非公開、任意）元の全メッセージR2、所有者専用キー、こちらもzstd既定はオフです。KPは、自分用であってもシナリオ本文を保存するには、明示的に選ぶ必要があります。noteRefshash（正規化したテキストのSHA-256）, length, t, order伏せ字済みblob内、およびruns内シナリオ本文を隠しつつ、のちに作者のシーンと照合できる分量を残します。speakersspeakerId, logId, name, color, kind (pc / npc / kp / unknown), characterId?, linkedUserId?Firestoreのサブコレクション書き出しが持つ身元は名前だけです。紐付けは卓譜側で追加します。participantslogId, uid, role, linkedBy (kp / self), characterIds\[\], hiddenAt?, unlinkedAt?Firestoreいまの状態を速く見るためのものです。紐付けは同意ではありません。非表示または紐付け解除したユーザーは、共有と逆引きから外れます。shareEventslogId, uid, action (link, unlink, hide, unhide, report), atFirestore、追記のみ誰が付き、誰が外れたかの任意の監査です。同意の記録ではありません。sharesslug, logId, scope, createdBy, expiresAt, revokedAtFirestore閲覧のたびに再確認し、許可済みとしてキャッシュしません。非表示および紐付け解除したユーザーは、読み取り時に除きます。scenariosscenarioId, title, author, source (booth / talto / url / manual / other), sourceUrl, system, logPolicy, policySourceUrl, authorVerified, ingestMethod, claimedByUid?, claimedViaAccountId?, claimedAt?, claimStatus (unclaimed / claimed / disputed / revoked)Firestoreポリシーの初期値はunknownで、メンバー限定として扱います。カタログの行はメタデータのみです。申請は、`sourceUrl`が連携済みの頒布元アカウントと一致するときだけ通ります。linkedAccountsaccountId, uid, provider (discord / x / booth / talto / pixiv / other), externalId, profileUrl, displayName, method (oauth / profile\_text), status (pending / verified / revoked), verifiedAt, lastCheckedAt, proofNonce?, proofExpiresAt?Firestore(provider, externalId)で一意にし、同じ頒布元アカウントを二人の卓譜ユーザーが持てないようにします。OAuthトークンを残す場合は、この文書ではなく秘密情報として保存します。確認用のnonceは、成功または期限切れのあと削除します。claimEventsscenarioId, uid, action (claim, unclaim, dispute, resolve, revoke), at, note?Firestore、追記のみ所有権の変更の監査です。同意の記録ではありません。scenarioCoOwners（後日）scenarioId, uid, invitedBy, acceptedAtFirestore主たる申請者からの委任です。ショップ確認の二度目の証明ではありません。characterscharId, ownerUid, name, system, sheetUrl, importSource, importPayloadRef?Firestoreユーザーに属し、ログをまたいで再利用します。characterSessionscharId, logId, speakerId, sanStart, sanEnd, rolls, crits, fumbles, growthCandidates, outcomeFirestore探索者カルテの土台です。items（後日）itemId, ownerUid?, characterId?, logId?, name, qty, notesFirestore中核のハブが動いたあとの、独立した所持品です。取り込み済みのシートに、アイテムに似た欄がすでに入っていることもあります。runs（Hankyōの種）runId, scenarioId, logId, endLabel, durationMin, noteRefs\[\], rollSummary, authorShareAllowedFirestore設計上、ネタバレはありません。のちの任意項目がオンのときだけ、作者に見せます。逆引きでもこれを使い、共有範囲で絞ります。

// 正規化したメッセージ（CCFOLIA MessageData、v1.37の書き出しより）
type Msg = {
  i: number;                 // ログ内の順序
  t: number;                 // createdAt（秒）
  ch: string;                // チャンネルID
  speakerId: string;         // name+color -> スピーカー
  type: "text" | "note" | "system";
  text: string | null;       // 伏せ字済みblobでは type === "note" のとき null
  noteRef?: { hash: string; len: number };
  roll?: {
    cmd: string;             // 例: "CC<=70 目星"（テキストより）
    skill?: string;          // 解析したスキル名
    target?: number;
    result: string;          // extend.roll.result
    dice: { faces: number; value: number }\[\];
    success: boolean; failure: boolean;
    critical: boolean; fumble: boolean;
    secret: boolean;         // 共有では既定で非表示
  };
};

type ShareScope = "members" | "passed" | "public";

// 既定の shareScope = "members"
// 実効の共有範囲 = KPの指定とシナリオポリシーのうち、狭い方
// 非表示または紐付けのないユーザーは、共有ビューと逆引きから除きます

Copy

チャンネルの規則：発言者が多くても2人で、main、info、chatのいずれでもないチャンネルは、シークレットタブとして扱います。メンバービューと共有ビューでは既定で非表示です。KPは確認画面で再表示できます。書き出しにタブメンバーの一覧がないため、これはヒューリスティックです。

## アーキテクチャ

書き出しまたは取り込み

ブラウザのパーサーWeb Worker。伏せ字とzstd圧縮

Next.js アプリdicespec.appと同じ構成とホスト

Firebase AuthXおよびDiscord

Firestoreメタデータ、紐付け、カタログ、連携

Cloudflare R2zstd圧縮したログ

Worker署名付き読み取り、OGカード、共有確認

取り込みジョブ公開BOOTHメタデータのみ

伏せ字済みzstd

署名付きアップロード

共有範囲と非表示

シナリオメタデータ

dicespec.appからの再利用

Next.js、Firebase AuthとFirestoreルール、Stripe（サポータープランは後日）、Sentry、Cloudflare Workers。BCDiceの知見は、旧HTMLのロール解析とスキル抽出の土台になります。

gzipではなくzstd

R2上のログは初回アップロードから生のzstdフレームで、`customMetadata.compression = zstd`を付けます。オブジェクトにHTTPの`Content-Encoding: zstd`は付けません。Compression Streams APIの`zstd`は、現行のChrome、Edge、Safariでは提供されておらず、Firefoxは設定の裏のデコードのみで、約8MB超で失敗した報告もあります。公式zstdのWASMビルドをWeb Workerで使い、第1週に固定します。公式のWorkers `fetch`の文書が自動処理とするのはgzipとbrotliだけです。zstdのContent-Encodingに関するworkerd PR 6836は2026年6月30日時点で未マージでした。OGカードのためにJSONが必要なWorkerは、同じWASMでプロセス内解凍するか、第1週に確認できた場合のみ`node:zlib`のzstdを使います（公式zlib文書はいまもgzip、deflate、Brotliと書いています）。ブラウザのHTTP `Content-Encoding: zstd`（Chrome 123以降、Firefox 126以降、Safariは限定的）は別の機能であり、非公開ログの方式にはしません。第1週に実ログでzstdとgzipを比べます。

プライバシーを既定にする

解析と伏せ字はブラウザ内で行います。アップロードするのは伏せ字済みのログだけです。R2のオブジェクトは非公開で、読み取りはすべて、共有範囲と非表示／紐付け解除を先に見るWorkerを通します。キャラクター画像は依頼作品が多いため、KPまたは所有者が残さない限り削除します。カタログの取り込みでも文面確認でも、ログイン用のCookieは使わず、シナリオファイルも保存しません。

削除と離脱

ログを削除すると、待ち行列のWorkerジョブでFirestoreの文書とR2オブジェクトが削除されます（R2の削除は無料です）。非表示または紐付け解除は、各共有リンクの次回の読み取りで反映されます。アカウントを削除すると、アップロードと所有キャラクターが削除されます。他者のログにあるその人の行には「unlinked PL」と付き、公開ビューと逆引きから外れます。

制限

1回のアップロードあたり20MB、ユーザーごとの1日上限、実行可能ファイルや画像のみのアップロードは不可。BOOTH取り込みを有効にした場合、リクエストのあいだに少なくとも1秒空け、BOOTHから要請があったときやガイドラインが変わったときはすぐ止められます。文面確認の取得も、同じ間隔を守ります。

規模（目安）保存ログ数R2の容量月額費用ベータ1000.1 GB¥0（無料枠）小規模な公開1,0001 GB¥0のR2。Firestoreも無料枠内の見込み軌道に乗った段階10,00010 GBR2はおよそ¥0〜¥200。Workersの有料プランでおよそ¥800が掛かる可能性あり

この表は、画像なしの伏せ字済み・zstd圧縮ログ1件あたり約1MBと置いています。第1週に実ログで確かめる見積もりです。zstdはgzipよりやや小さくなる見込みですが、測定するまで表の数字は変えません。R2の料金はCloudflareの料金ページによります。10GB月まで無料、以降は1GB月あたり$0.015、送信（egress）は無料です。WorkersとFirestoreの数字は本日再確認していません。カタログのメタデータは、ログに比べごくわずかです。

## グロースの循環

KKPがログをアップロード

任意でPLを連携キャラクターの紐付けも後から

探索者カルテが増える再訪のきっかけ

Xに卓報告カード#卓報告、共有ページへ

閲閲覧者や今後のKP

シナリオページの公開ラン逆引き

作者がそれに気づく

卓を回す

シナリオID

-   アップロード1回で卓全体を集められますが、KPがログを使えるようになるまで、サインアップは必須ではありません。アカウントを作る理由は、キャラクターを持つため、カルテを完成させるため、シナリオページに出るためです。
-   継続探索のPLが、次のKPを連れてきます。カルテは、一緒に遊んだKPがすべてアップロードして初めて完成し、PL自身も同じキャラクターを付けられます。
-   卓報告カードにはシナリオ名とリンクが入ります。#卓報告の投稿はすでに習慣なので、このカードは既存の儀式に加わります。
-   各シナリオページでは、見えるランの数、長さの中央値、（許される場合の）ENDの分布を集計します。これがHankyōの公開側であり、作者が登録する理由になります。
-   連携したBOOTHショップやTALTOアカウントでシナリオを申請し、卓譜でログルールを決めた作者は、KPが共有前に確認する場所をそこへ移します。フォーマッタを使ったことのないKPも流れ込みます。
-   インポートでカルテ作成の手間が下がるため、すでにいあきゃらや保管所を使っているプレイヤーにも、卓譜を試す理由ができます。

## 収益化の道筋

段階内容価格この価格にした理由0\. 公開MVPの機能はすべて無料。アップロード、ライブラリ、プレイヤーとキャラクターの紐付け、共有リンク、カタログ検索、初回のインポート、基本のカルテ、アカウント連携と所有権の申請。¥0整形はBOOTHで¥100のチップとして売られています。無料であることが、卓譜が無料ツールに勝る点であり、ランを集める手段です。1\. サポーター（2〜3ヶ月目）共有ページでの高解像度キャラクター画像、テーマ、探索者カルテPDF、キャンペーンのまとめ、先行機能。¥300/月 または ¥3,000/年いあきゃらのFANBOX段階は¥300と¥500。ころログの入門プランは¥400。CCFOLIA PROは¥500。これらの下に価格を抑えます。2\. Hankyō Author Pro（3ヶ月目以降）ランのダッシュボード。ENDの分布、シーンごとの時間、到達したシーン、ロールとSANの統計、任意で許された引用。1つのシナリオの最初の10ランまでは無料。1サークルあたり ¥500/月 または ¥4,800/年調査によります。同人作家の多くは収入が少ないため、サークル単位で付けます。BOOTHページ向けの無料ランバッジが告知になります。3\. 任意印刷向けのログ本書き出し、または既存の製本ツールへの案内。書き出し1件あたり（未定）需要は未確認です。サポーターから要望が出たときだけ試します。

目安であり、予測ではありません。アクティブユーザー2,000人、サポーター率3%なら、月に60 × ¥300 = ¥18,000です。作家サークル50（¥500）で¥25,000が加わります。Hankyōにデータが揃うまで収益は控えめなので、費用はゼロに近い水準を保つ必要があります。

## ロードマップ、公開、指標

週節目完了の条件1パーサーとローカルプレビュー、zstdの実装自分のJSONとHTMLログが解析できる。チャンネル、シークレットロール、ノート、スキルを分類できる。実ログのサイズを、無圧縮、gzip、zstdで測る。WASMのzstdライブラリを固定し、Workerが試料のblobを解凍できる。2認証、アップロード、ライブラリ、メンバー閲覧、伏せ字の既定、削除、報告ログがzstdのオブジェクトとしてR2を往復する（オブジェクトに`Content-Encoding`は付けない）。Firestoreルールを試す。閲覧側はブラウザで解凍する。共有ビューでは、シークレットタブとノートが既定で非表示のまま。3プレイヤー紐付け、キャラクターの所有、共有の既定、紐付け解除／非表示、シナリオ選択KPが同意の手順なしで2人のプレイヤーを紐付ける。そのプレイヤー（と3人目のユーザー）が自分のキャラクターを付ける。既定の共有はメンバー限定。紐付け解除と非表示で、共有ページがすぐ更新される。シナリオを検索またはURLの貼り付けで選べる。4探索者カルテ、ダイス統計、初回のインポート所有キャラクター1体について、3つ以上のログにまたがってSANとロール履歴が積まれる。CCFOLIAのキャラクターJSON、いあきゃらの`.txt`、保管所のURLまたはJSONが、それぞれキャラクターを作る。55卓のクローズドベータ、プライバシーポリシー、利用規約、Sentry、BOOTHカタログの開始、アカウント連携5人のKPが実際のセッションをアップロードする。すべての不具合を振り分ける。プライバシーポリシーに、同意フォームなしの紐付け、紐付け解除／非表示、外部アカウントの確認方法を書く。ユーザーは公式OAuthでDiscordとXを、文面確認でBOOTHショップやTALTOプロフィールを連携できる。公開BOOTHの取り込みを緩やかに始め、止められる。6一般公開、卓報告カード、逆引き、最初の所有権申請公開の投稿が出る。シナリオページには、見えるランとユーザーだけが並ぶ。最初の作者が、確認済みの頒布元アカウントでカタログの行を申請し、ログポリシーを設定している。報告された申請を凍結し、人手で見られる。

1.  1
    
    X
    
    アップロード → キャラクター連携 → カード共有の30秒の画面録画を含む公開スレッド。自分の卓から#卓報告でカードを出し、KPがログの共有方法を尋ねている場へ返信します。
    
2.  2
    
    BOOTH
    
    卓譜の説明とリンクを載せた無料アイテム。これにより「ログ整形」や「ココフォリア」の検索に出ます。ベータの作者には、カタログの行を申請してもらうか、アカウントができるまではシナリオページへ「log rules: 卓譜」の一行を足してもらいます。
    
3.  3
    
    Discordのコミュニティ
    
    CoCおよびエモクロアのプレイヤーサーバーや募集サーバー（これから特定します。ここでは確認済みのものはありません）。オープン卓を回しているKPに案内します。同意の回り待ちなしで、一人が複数のプレイヤーを招けるためです。
    
4.  4
    
    作者
    
    すでにログルールに言及しているBOOTHのCoC作者20人へDMし、確認済みの頒布元アカウントでポリシーを申請するよう依頼します。Hankyōの聞き取りもここから始めます。
    

指標（公開後30日間）目標重要性アップロードされたログ数150KPからの基本的な流入1ログあたりの連携ユーザー数（中央値）2人以上同意フォームなしで、卓全体の循環が動いていることの証明2つ以上のログで連携されたキャラクター数30ユーザー所有のキャラクターがフックになっていること2回目のアップロードをしたKP35%獲得したユーザーの定着インポートの利用（ファイルまたはURLから作られたキャラクター）40ハブがログの置き場以上であること3回以上のランが見えているシナリオ15作者に見せ、逆引きを試すのに足りる密度ポリシー確認済みの作者10Hankyōの導線確認済みの頒布元アカウントで申請されたシナリオ10入力したポリシーだけでなく、申請の経路が使えること確認済みの外部アカウントを1つ以上持つユーザー40身元の層が、サインイン以外にも使えていること

これらの目標は、一人での公開に対する判断であり、業界の基準値ではありません。ログあたりの連携ユーザーが1人を下回ったままなら、何より先に、招待と自分からの紐付けの手順を簡単にする必要があります。同意は必須の手順ではないため、同意完了の指標は置きません。

## リスクと対策

リスク対策`note`行のシナリオ本文（作者の著作権、ネタバレ）既定では保存しません。ハッシュとしてだけ出します。非公開コピーは任意で、所有者だけが読めます。KPから求められても、公開はしません。シークレットタブの漏洩（ルームマスターの書き出しに、入っていなかったタブが含まれる）メンバービューと共有ビューでは既定で非表示にします。確認画面でKPに警告します。再表示は、確認画面での意図した操作であり、プレイヤーを紐付けた副作用ではありません。APPIのもとでの個人情報（同意フォームなしの紐付けを含む）ハンドルが実在の人物と結びつくと個人情報になり、アカウント制はその可能性を高めます。KPは、そのユーザーの事前の同意なしにログへユーザーを付けられ、これは解消済みではなく、残るリスクです。対策は、この目的を平易な言葉で書いた公開プライバシーポリシー、紐付けたユーザーへの通知、共有範囲の既定を公開ではなくメンバー限定にすること、ユーザーがすぐ紐付け解除や非表示にでき、逆引きからも外れること、必要なデータだけを保存すること、削除と開示の求めに従うこと、紐付け、解除、非表示、報告の短い監査を残すことです。法的な確認は勧めた方がよく、ここでは行っていません。紐付けは、公開共有やHankyōへの同意とはみなしません。カタログの取り込みと、第三者の利用規約ユーザーが貼ったURLを優先します。BOOTHは公開メタデータのみ、ゆっくり、2025年10月10日の告知が有効なあいだだけです。書面の許可なくTALTOを一括クロールしません。Xのスクレイピングもしません。シナリオ本文や有料ファイルは使いません。取り込みジョブには停止スイッチがあります。CCFOLIAの利用規約ユーザー自身の公式書き出しだけを使います。CCFOLIAのスクレイピング、リバースエンジニアリング、CCFOLIAロゴの使用はせず、「非公式」と明記します。CCFOLIAのFAQでは、規約内の活動はおおむね問題ないとされています。キャラクター絵とアイコン（多くは依頼制作）既定ではアップロードしません。サポーター向けの画像保管では、アップロードした人が権利を持っていることの確認を求めます。作家向けの削除フォームを用意します。作者のルールが公開ログを禁じている登録内容で強制します。ポリシーが不明ならメンバー限定です。作者は、確認済みの頒布元アカウントでシナリオを申請し、ポリシーを設定できます。聞かれていない紐付けに、プレイヤーが不満を持つ通知に加え、ワンクリックで非表示または紐付け解除ができます。紐付け時に、相手へ通知が行くことをKPに伝えます。報告と削除も使えます。ころログやCCFOLIAが同じ機能を足すユーザー所有のキャラクター、シナリオカタログ、作者ルールを早く実装します。フォーマッタの補完に留まります。Hankyōのデータが、いちばん厚い防御になります。始まりの難しさ：KPがアップロードしないアップロードを1分以内に終え、その前の同意手続きを不要にします。ファイルの回し合いより良い結果（リンク、カード、カルテ、インポート）を出します。まずは自分の卓で使います。共有ログを通じた嫌がらせやドクシング報告ボタン、速い削除、参加者がすぐ非表示または紐付け解除できるようにします。公開共有は既定でオフです。一人での運用範囲を小さくし、後日の項目は後日のままにし、マネージドサービス、Sentryの警告、すでに回している毎日のSentry確認を使います。ブラウザとWorkersにおけるzstd対応の不足ログにはCompression Streams APIも、HTTPの`Content-Encoding: zstd`も使いません。ブラウザとWorkerにWASMの実装を載せます。保存するのは、独自メタデータ付きの生zstdフレームだけです。ネイティブAPIは第1週と、公開前に再確認します。頒布元アカウントのなりすましOAuthの身元は公式のコールバックから得ます。文面確認は、表示名ではなく、その公開ショップまたはプロフィールURLへの、短い寿命のコードを求めます。報告があれば申請を凍結します。最初の申請の前に再確認を求められます。BOOTH、TALTO、pixivのトークンやログイン用Cookieは保存しません。OAuthより弱い証明（BOOTH、TALTO、pixiv）製品とプライバシーポリシーで、その弱さをそのまま書きます。申請を始める日から紛争の待ち行列を置きます。共同所有者の招待は後日にし、最初の切り出しでサークルを独立に確認済みとは言いません。ショップの譲渡、乗っ取り、ページに残ったコードコードには期限があります。新しい管理者は、同じURLで文面確認をやり直し、紛争を開けます。運用者は申請を取り消せます。

## 確認したこと

-   CCFOLIAの文書で確認済み：JSONの型は`text` / `note` / `system`。`note`はシナリオ本文から送られた行を意味します。ロールフラグに`secret`があり、プレイヤーIDはなく、画像はデータURLです。PROでは10万件を超えるメッセージがZIPに分割されて書き出されます。公式のキャラクタークリップボードJSONは`{"kind":"character","data":{...}}`です（Clipboard API、ベータ、v1.19）。ルームデータはZIPで書き出され、共有できるルームデータZIPの書き出しはPROの機能です。音源は省かれます。
-   確認済み：ログを書き出すのはルームマスターだけです（v1.37の注記）。全件の書き出しには、マスターが入っていなかったシークレットタブも出ます（FAQ）。
-   確認済み：ろぐしあたーとサザノノはCCFOLIAのJSONを読み、ローカルで処理します。ろぐしあたーはcritical-stageのHTML/JSONも読み、再読み込みできるHTMLを保存し、Markdown、テキスト、xlsx、PDFを書き出せます。Log Adventure Editorの共有リンクは30日で期限切れになります。
-   確認済み：ころログは卓のメンバーと共有し、CCFOLIAのHTMLに加えていあきゃら / Charaenoの`.txt`を取り込み、ダイス分析とキャラクタープロフィールがあります。料金は¥0〜¥1,480です。設定画面から書き出せますが、この改訂で開いたページには、正確な書き出し形式は書かれていませんでした。
-   確認済み：いあきゃらはキャラ出力からテキストファイルの書き出しを出しています。キャラクター保管所は`{id}.js`の公開JSONインターフェースを案内し、ユーザーにそのJSONをバックアップとして残すよう述べています。
-   確認済み：Udonariumのログは`chat.xml`にあり、キャラクターはXMLと画像を含むZIPで書き出されます。
-   確認済み：2025年10月10日、BOOTHは第三者の検索や推薦のために、常識の範囲での公開情報の取得を認めると発表しました。過度な負荷と非公開データの利用は引き続き禁じています。BOOTH、TALTO、しなポケ、scenarchの公式APIは見つかりませんでした。TALTOの規約は、許可がない限り、他ユーザーの情報収集、過度な負荷、商用利用を禁じています。Xは公式API以外でのスクレイピングを禁じています。
-   確認済み：クリファン率チェッカーはブラウザ内で複数のHTML/TXTを集計します。takulogはセッションを手入力で記録します。
-   確認済み：Compression Streams APIの`zstd`は、いまのChrome、Edge、Safariでは提供されていません。Firefoxには設定の裏にデコードのみがあります（caniuse、WHATWG compressionのissue 54。2026年7月14日時点で未解決）。HTTPの`Content-Encoding: zstd`は別の機能で、現行のChromeとFirefoxでは広く使え、Safariは版によって限られます（caniuse）。公式のWorkers `fetch`の文書が自動処理として挙げるのはgzipとbrotliだけです。zstdのContent-Encoding解凍に関するworkerdのプルリクエスト6836は、2026年6月30日時点で未マージでした。R2オブジェクトには`httpMetadata.contentEncoding`と`customMetadata`を付けられます。公式のWorkers `node:zlib`の文書はいまもgzip、deflate、Brotliと書いています。zstdのバインディングは2026年初頭のworkerdで議論されマージされていますが、前提にせず第1週に試します。
-   確認済み：Discordは公式OAuth2の認可コード付与と、`GET /users/@me`用の`identify`スコープを文書化しています。Firebaseは公式のTwitter/Xサインイン（`TwitterAuthProvider`）と、アカウント連携（`linkWithPopup`、`linkWithCredential`）を文書化しています。DiscordはFirebaseの標準プロバイダではないため、Discordのサインインと連携はDiscord自身のOAuthのあと、Firebaseユーザーへ結びます。BOOTHとTALTOの公式OAuthおよび公開開発者APIは見つかりませんでした。TALTOのヘルプは、アカウントでプロフィールを設定できると述べ、公開ユーザーページにはプロフィール文と投稿作品が出ます。BOOTHの公式ヘルプにはショップの案内があり、ショップページは公開です。pixivの公式の第三者向けOAuthは見つかりませんでした。
-   未確認：CCFOLIAの状態変更`system`メッセージの形式（SANの追跡に必要）、実際のログサイズ、takulogの価格、ころログの設定エクスポートの正確な形式、特定のDiscordサーバー、2025年10月10日の発表以降にBOOTHのガイドライン本文が完全に書き直されたかどうか、直接`users/me`を呼ぶ場合の現行のX API料金、本番のWorkersが`node:zlib`のzstdを出すかどうか。これらは第1週に確認し、カタログの取り込みを始める前にBOOTHを改めて確認します。

## 出典

[

CCFOLIA Export Message Logs JSON

docs.ccfolia.com

](https://docs.ccfolia.com/developer-api/message-logs-json "CCFOLIA Export Message Logs JSON")

[

CCFOLIA Clipboard API (character JSON)

docs.ccfolia.com

](https://docs.ccfolia.com/developer-api/clipboard-api "CCFOLIA Clipboard API (character JSON)")

[

CCFOLIA room data (ZIP import/export)

docs.ccfolia.com

](https://docs.ccfolia.com/gm-only/room-option/room-settings/room-data "CCFOLIA room data (ZIP import/export)")

[

CCFOLIA v1.37 release notes

docs.ccfolia.com · 2026-09-07

](https://docs.ccfolia.com/update/v1.37 "CCFOLIA v1.37 release notes")

[

CCFOLIA FAQ (secret tabs, commercial use)

docs.ccfolia.com

](https://docs.ccfolia.com/information/faq "CCFOLIA FAQ (secret tabs, commercial use)")

[

CCFOLIA terms of service

ccfolia.com

](https://ccfolia.com/termsOfService.html "CCFOLIA terms of service")

[

BOOTH announcement: scraping guideline review

booth.pm · 2025-10-10

](https://booth.pm/announcements/863 "BOOTH announcement: scraping guideline review")

[

TALTO terms of service

talto.cc

](https://talto.cc/terms "TALTO terms of service")

[

キャラクター保管所 JSON interface

charasheet.vampire-blood.net

](https://charasheet.vampire-blood.net/help/webif "キャラクター保管所 JSON interface")

[

キャラクター保管所 terms

charasheet.vampire-blood.net

](https://charasheet.vampire-blood.net/help/kiyaku "キャラクター保管所 terms")

[

いあきゃら official site

iachara.com

](https://iachara.com/ "いあきゃら official site")

[

いあきゃら March update (text export)

iachara.fanbox.cc

](https://iachara.fanbox.cc/posts/7550696 "いあきゃら March update (text export)")

[

ろぐしあたー

misosiru714.github.io

](https://misosiru714.github.io/log-theater/ "ろぐしあたー")

[

サザノノ log formatter

sazano123.com

](https://sazano123.com/trpg/88526.html "サザノノ log formatter")

[

Log Adventure Editor

log-adventure-editor.exp.jp

](https://log-adventure-editor.exp.jp/Log-Adventure-Editor_web.html "Log Adventure Editor")

[

クリファン率チェッカー

crifanchige.com

](https://crifanchige.com/ "クリファン率チェッカー")

[

ころログ features and plans

corolog.com

](https://corolog.com/plans "ころログ features and plans")

[

ころログ guide (inputs and downloads)

corolog.com

](https://corolog.com/guide "ころログ guide (inputs and downloads)")

[

ころログ privacy policy (settings export)

corolog.com

](https://corolog.com/privacy "ころログ privacy policy (settings export)")

[

takulog

takulog.app

](https://takulog.app/ "takulog")

[

しなポケ terms

shina-poke.com

](https://shina-poke.com/terms-of-use-and-privacy-policy "しなポケ terms")

[

caniuse: CompressionStream zstd

caniuse.com

](https://caniuse.com/mdn-api_compressionstream_compressionstream_zstd "caniuse: CompressionStream zstd")

[

caniuse: HTTP Content-Encoding zstd

caniuse.com

](https://caniuse.com/zstd "caniuse: HTTP Content-Encoding zstd")

[

WHATWG Compression: zstd support (issue 54)

github.com · 2026-07-14

](https://github.com/whatwg/compression/issues/54 "WHATWG Compression: zstd support (issue 54)")

[

Cloudflare Workers fetch: Accept-Encoding

developers.cloudflare.com

](https://developers.cloudflare.com/workers/runtime-apis/fetch/ "Cloudflare Workers fetch: Accept-Encoding")

[

workerd PR 6836: zstd content-encoding decompression

github.com · 2026-06-30

](https://github.com/cloudflare/workerd/pull/6836 "workerd PR 6836: zstd content-encoding decompression")

[

Cloudflare Workers node:zlib

developers.cloudflare.com

](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/ "Cloudflare Workers node:zlib")

[

Cloudflare R2 Workers API (HTTP metadata)

developers.cloudflare.com

](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ "Cloudflare R2 Workers API (HTTP metadata)")

[

Discord OAuth2

docs.discord.com

](https://docs.discord.com/developers/topics/oauth2 "Discord OAuth2")

[

Firebase: authenticate with Twitter/X

firebase.google.com

](https://firebase.google.com/docs/auth/web/twitter-login "Firebase: authenticate with Twitter/X")

[

Firebase: link multiple auth providers

firebase.google.com

](https://firebase.google.com/docs/auth/web/account-linking "Firebase: link multiple auth providers")

[

TALTO help (accounts and profiles)

talto.cc

](https://talto.cc/help "TALTO help (accounts and profiles)")

[

BOOTH help: about shops

booth.pixiv.help

](https://booth.pixiv.help/hc/ja/sections/115000543414-%E3%82%B7%E3%83%A7%E3%83%83%E3%83%97%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6 "BOOTH help: about shops")

[

Cloudflare R2 pricing

developers.cloudflare.com

](https://developers.cloudflare.com/r2/pricing/ "Cloudflare R2 pricing")

[

APPI FAQ: identifying a specific individual

ppc.go.jp

](https://www.ppc.go.jp/all_faq_index/faq1-q1-1/ "APPI FAQ: identifying a specific individual")

[

Earlier research: landscape and Hankyō

cursor.com

](https://cursor.com/canvas/store-a50ffcc4-e7e0-42ba-8eb3-59c4e97d85ab/5a30499d-33e4-467d-a51a-e49cdde40611 "Earlier research: landscape and Hankyō")

