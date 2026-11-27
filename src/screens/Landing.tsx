"use client";
/**
 * ログインしていなくても開ける公開ページ: LP（/）・ライセンス（/licenses）・利用規約（/terms）・プライバシーポリシー（/privacy）・ご意見（/feedback）。
 * 記録（ストア）と Firebase は読み込まない（サーバーで描画し、JS を軽く保つ）。ログイン・サンプル開始は Entry.tsx。
 */
import { useState } from "react";
import { preload } from "react-dom";
import type { FormEvent, ReactNode } from "react";
import { Link } from "../lib/router";
import { useEnteredHint } from "../lib/entered-hint";
import { LP_FONT_FILES } from "../data/lp-fonts";
import { Field, FieldError, LegalLinks, LogoMark, RightsNotice, Seg, cx } from "../components/ui";
import {
  IconDice,
  IconDiscord,
  IconEye,
  IconEyeOff,
  IconLink,
  IconLock,
  IconPlayerPlay,
  IconUsers,
} from "../components/icons";
import { features } from "../lib/features";
import { DICETOUS_COMMONS, FEEDBACK_PATH, OSS_LICENSES } from "../lib/rights";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind } from "../lib/feedback-kinds";

/** 規約・ポリシーの制定日。改定したら更新する */
const LEGAL_UPDATED = "2026年11月27日";

/* ---------- 公開ページの外枠（ヘッダーとフッター） ---------- */
/** 公開ページから記録を使う画面（/signin・/demo・/home）へのリンクは prefetch={false}（先読みで Firebase を落とさない） */
export function PublicFrame({
  children,
  width = "max-w-5xl",
  hideLogin,
  poster,
}: {
  children: ReactNode;
  width?: string;
  /** ログイン画面そのものでは、ヘッダーのログインへのリンクを出さない */
  hideLogin?: boolean;
  /** LP: ヘッダーをポスターの地（柿色）に乗せ、本文の幅と余白は各帯が持つ */
  poster?: boolean;
}) {
  // 公開ページは記録（ストア）を読まずにサーバーで描画する。使い始めているかは端末の目印で見る
  const entered = useEnteredHint();
  const headWidth = "max-w-6xl";
  return (
    <div className={cx("flex min-h-screen flex-col bg-base-200", poster && "pst-root")}>
      <header className={poster ? "pst-header" : "border-b border-base-300 bg-base-100"}>
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 ${headWidth}`}>
          <Link
            to="/"
            className={cx("flex items-center gap-2", poster ? "pst-logo" : "text-primary")}
            aria-label="卓譜 トップ"
          >
            <LogoMark size={22} on={poster ? "var(--pst-field)" : undefined} />
            <span className={cx("font-bold tracking-tight", !poster && "text-base-content")}>卓譜</span>
          </Link>
          <span className="ml-auto" />
          {entered ? (
            <Link
              prefetch={false}
              to="/home"
              className={poster ? "pst-btn pst-btn-sm pst-btn-line" : "btn btn-sm"}
            >
              ホームを開く
            </Link>
          ) : (
            !hideLogin && (
              <Link
                prefetch={false}
                to="/signin"
                className={poster ? "pst-btn pst-btn-sm pst-btn-line" : "btn btn-sm btn-quiet"}
              >
                ログイン
              </Link>
            )
          )}
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={poster ? "w-full grow" : `mx-auto w-full grow px-4 pb-16 pt-10 sm:px-6 ${width}`}
      >
        {children}
      </main>
      <footer className={poster ? "pst-footer" : "border-t border-base-300 bg-base-100"}>
        <div
          className={`mx-auto flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-xs text-ink2 sm:px-6 ${headWidth}`}
        >
          <span>卓譜</span>
          <LegalLinks />
          <span className="basis-full">
            クトゥルフ神話TRPG・ソード・ワールド2.5・エモクロアTRPG などの二次創作物を含みます。権利表記は
            <Link to="/licenses" className="underline underline-offset-2 hover:text-base-content">
              ライセンス・権利表記
            </Link>
            にまとめています。
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ================= LP（/） =================
 * 柿色の地に極太の見出しで「卓報告ポスター」の声を出し、中身はアプリと同じ紙と墨の作例で見せる。
 * 流れ: ヒーロー（卓報告のタイル）→ セッションのページの作例（押して試せる）→ 3 つの仕事 → 取り込み元 → はじめる前に → 締め。
 * 中身はすべてサンプルの卓「深淵の呼び声」から。同じ例を節ごとに繰り返さない。色・書体は styles.css の .pst-* に閉じる。
 */

function Portrait({ name, file, size = 40 }: { name: string; file: string; size?: number }) {
  return <img src={`/lp/${file}.svg`} alt={name} width={size} height={size} className="pst-portrait" />;
}

/** 日程の返事の印（◯ △ ×）。文字の ◯ は細くて読めないので線で描く */
function Mark({ v }: { v: "yes" | "maybe" | "no" }) {
  const label = v === "yes" ? "参加" : v === "maybe" ? "未定" : "不参加";
  return (
    <svg
      viewBox="0 0 20 20"
      width={18}
      height={18}
      role="img"
      aria-label={label}
      className={`pst-mark is-${v}`}
    >
      {v === "yes" && <circle cx="10" cy="10" r="6.5" />}
      {v === "maybe" && <path d="M10 3.5 L16.5 15.5 H3.5 Z" />}
      {v === "no" && <path d="M4.5 4.5 L15.5 15.5 M15.5 4.5 L4.5 15.5" />}
    </svg>
  );
}

/** ヒーローの右: X の #卓報告 に流れてくるもの。卓が終わったあとに散らばるものの代表 */
function ReportStack() {
  return (
    <div className="pst-stack" aria-hidden="true">
      <div className="pst-stack-col">
        <div className="pst-tile pst-tile-report">
          <div className="pst-tile-tag">#卓報告</div>
          <div className="pst-display pst-tile-title">深淵の呼び声</div>
          <div className="pst-tile-meta">
            <span className="whitespace-nowrap">クトゥルフ神話TRPG 7版</span>{" "}
            <span className="whitespace-nowrap">9月26日（土）</span>
          </div>
          {/* 卓報告カードは人の画像を載せない（src/lib/report-card.ts）。見本も名前だけにそろえる */}
          <div className="pst-tile-meta mt-3">
            <span className="whitespace-nowrap">KP みかん</span>{" "}
            <span className="whitespace-nowrap">PC 白瀬怜・灯堂澪・桐生那津</span>
          </div>
        </div>
        <div className="pst-tile pst-tile-quote">
          <div className="flex items-center gap-2">
            <Portrait name="" file="natsu" size={28} />
            <span className="text-sm font-bold">桐生那津</span>
          </div>
          <p className="pst-quote">「……この写真、もう一人写ってる」</p>
        </div>
      </div>
      <div className="pst-stack-col">
        <div className="pst-tile pst-tile-dice">
          <div className="pst-tile-meta flex items-center gap-1.5">
            <IconDice width={16} height={16} aria-hidden /> CC&lt;=70 目星
          </div>
          <div className="pst-display pst-dice-num">04</div>
          <div className="pst-band pst-band-crit">クリティカル</div>
        </div>
        <div className="pst-tile pst-tile-san">
          <div className="pst-tile-meta whitespace-nowrap">白瀬怜の SAN</div>
          <div className="pst-display pst-san-loss">−3</div>
          <div className="pst-display pst-san-from">53→50</div>
        </div>
      </div>
    </div>
  );
}

/** 取り込み元。種類ごとに 1 行（押せる部品に見える枠つきの札にはしない）。実装と食い違わないことを Landing.test.ts で確かめる */
export const LP_SOURCES: { what: string; from: string[] }[] = [
  { what: "ログ", from: ["CCFOLIA（HTML・JSON・ZIP）", "ユドナリウム（ZIP）", "Tekey（HTML）"] },
  {
    what: "キャラシ",
    from: [
      "キャラエノ",
      "キャラッシュ",
      "いあきゃら",
      "キャラクター保管所",
      "ゆとシートⅡ",
      "キャラクターシート倉庫",
      "冒険窓口",
    ],
  },
  { what: "録画・配信", from: ["YouTube", "ニコニコ"] },
  { what: "感想・絵", from: ["ふせったー", "X"] },
  { what: "Discord", from: ["日程の返事", "予定の告知", "前日のお知らせ", "記録の投稿"] },
];

/** はじめる前の心配を口にする人（サンプルの卓の顔ぶれ） */
const FAQ_ASKERS = ["mio", "mikan", "natsu", "rei", "towa", "kasumi"] as const;

/**
 * キャラシの能力値・技能・特技表まで表示するシステム（src/data/systems.ts の詳しい定義）。
 * LP は systems.ts を読まない（JS を軽く保つ）ので名前を写し、Landing.test.ts が定義と突き合わせる
 */
export const LP_DETAILED_SYSTEMS = [
  "クトゥルフ神話TRPG 7版",
  "クトゥルフ神話TRPG 6版",
  "エモクロアTRPG",
  "ソード・ワールド2.5",
  "ソード・ワールド2.0",
  "ダブルクロス2nd,3rd",
  "シノビガミ",
  "インセイン",
  "ネクロニカ",
  "アリアンロッドRPG",
  "ログ・ホライズンTRPG",
  "神我狩",
  "ナイトウィザード The 3rd Edition",
  "ゴブリンスレイヤーTRPG",
  "マギカロギア",
  "キルデスビジネス",
  "銀剣のステラナイツ",
  "サタスペ",
  "フタリソウサ",
  "グランクレストRPG",
  "マモノスクランブル",
  "キズナバレット",
] as const;

/** はじめる前の心配。答えは実装どおりのことだけを書く */
const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "秘匿タブは、ほかの PL に見られませんか？",
    a: "セッションごとに「自分だけ」か「共有範囲の人にも見せる」かを選べます。「自分だけ」にすると、記録した人の手元にだけ残ります。",
  },
  {
    q: "記録したら、すぐ誰でも読める状態になりますか？",
    a: "なりません。はじめは「メンバー限定」で、参加者と卓のメンバーだけが読めます。共有範囲を広げる前に、同卓者に確かめてください。",
  },
  {
    q: "卓が終わったあと、入力に手間はかかりますか？",
    a: "日付・所要時間・発言者・ダイスはログから読み取ります。選ぶのは、遊んだシナリオと参加者だけです。",
  },
  {
    q: "スマホだけでも読めますか？",
    a: "ブラウザで開く Web アプリなので、インストールは要りません。共有リンクはスマホでそのまま読めます。",
  },
  {
    q: "お金はかかりますか？",
    a: "無料です。広告もありません。",
  },
  {
    q: "クトゥルフ神話TRPG 以外でも使えますか？",
    a: (
      <>
        BCDice が対応するシステムすべてで使えます。シノビガミやダブルクロスなど {LP_DETAILED_SYSTEMS.length}{" "}
        のシステムは、キャラシの能力値や技能・特技表まで表示します。
        <details className="pst-systems">
          <summary>表示するシステムを見る</summary>
          <ul className="pst-system-list">
            {LP_DETAILED_SYSTEMS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      </>
    ),
  },
];

/**
 * LP の書体（LP に出る文字だけに絞ったもの。ファイル名に中身のハッシュ）。
 * サーバーで描画した HTML の head で先に読み始め、@font-face もここで出す。
 */
const LP_FONT_FACE = `@font-face{font-family:"Takufu LP Display";src:url(${LP_FONT_FILES.display}) format("woff2");font-weight:400;font-display:swap}@font-face{font-family:"Takufu LP Sans";src:url(${LP_FONT_FILES.sans}) format("woff2");font-weight:400 700;font-display:swap}`;

function LpFonts() {
  for (const href of Object.values(LP_FONT_FILES)) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return (
    <style href="lp-fonts" precedence="default">
      {LP_FONT_FACE}
    </style>
  );
}

/** 始める操作。ヒーローと締めで同じ文言・同じ並び */
function StartLinks() {
  return (
    <div className="pst-actions">
      <Link prefetch={false} to="/home" className="pst-btn pst-btn-solid">
        使ってみる
      </Link>
      <Link prefetch={false} to="/demo" className="pst-btn pst-btn-line">
        サンプルの卓を開く
      </Link>
    </div>
  );
}

export default function Landing() {
  return (
    <PublicFrame poster>
      <LpFonts />
      <section aria-labelledby="lp-title" className="pst-hero">
        <div className="pst-hero-grid mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pst-hero-copy">
            <h1 id="lp-title" className="pst-display pst-h1">
              <span className="whitespace-nowrap">卓が終わったら、</span>
              <br />
              <span className="whitespace-nowrap">ぜんぶここ。</span>
            </h1>
            <p className="pst-lead">
              CCFOLIA やユドナリウムのログを入れるだけで、TRPG
              のセッションがダイスも秘匿タブも、録画や感想まで{" "}
              <span className="whitespace-nowrap">1 ページに</span>
              まとまります。同卓者にはリンクひとつで渡せます。
            </p>
            <StartLinks />
            <p className="pst-assure">
              無料・広告なしで、記録ははじめメンバー限定です。サンプルの卓はログインせずに開けます。
            </p>
          </div>
          <ReportStack />
        </div>
      </section>

      <section aria-labelledby="lp-page" className="pst-stage">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SessionSheet />
          <div className="pst-caption-grid">
            <h2 id="lp-page" className="pst-display pst-h2">
              ログも録画も、
              <br />
              <span className="whitespace-nowrap">キャラも、</span>
              <br />
              <span className="whitespace-nowrap">1 ページに。</span>
            </h2>
            <div className="pst-caption">
              <h3 className="pst-h3">HTML を配らず、リンクひとつ</h3>
              <p className="pst-body">
                Discord に HTML
                を貼る代わりに、共有リンクを送るだけです。整形ツールに通し直す手間も要りません。
              </p>
            </div>
            <div className="pst-caption">
              <h3 className="pst-h3">録画も感想も、同じページに</h3>
              <p className="pst-body">
                YouTube・ニコニコの録画は、ログの時刻からその場面が開きます。ふせったーや X
                の感想も、ここに並びます。
              </p>
            </div>
            <div className="pst-caption">
              <h3 className="pst-h3">キャラもシナリオも、つながる</h3>
              <p className="pst-body">
                探索者のページにはこの卓の SAN や成長が、シナリオのページには通過した卓が並びます。
              </p>
            </div>
          </div>
          <p className="pst-try">
            <Link prefetch={false} to="/demo" className="pst-try-link">
              ログインせずに、サンプルの卓で触ってみる
            </Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="lp-report" className="pst-light pst-rule-top">
        <div className="pst-report mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="pst-report-text">
            <h2 id="lp-report" className="pst-display pst-h2">
              #卓報告 は、
              <br />
              <span className="whitespace-nowrap">ネタバレなしの</span>
              <br />
              <span className="whitespace-nowrap">1 枚で。</span>
            </h2>
            <p className="pst-body">
              記録したセッションから、X
              に貼る卓報告カードを作ります。載せるのはシナリオ名・システム・日付と、PC と PL の顔ぶれです。SAN
              や HP、エンディングは載せません。
            </p>
            <p className="pst-body">スマホでは、画像のまま X やほかのアプリに渡せます。</p>
          </div>
          <figure className="pst-report-card">
            <img
              src="/lp/report-card.png"
              alt="卓報告カードの見本: 深淵の呼び声、クトゥルフ神話TRPG 7版、KP みかんと PC 3 人の顔ぶれ"
              width={1200}
              height={675}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section aria-labelledby="lp-jobs" className="pst-light pst-rule-top">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <h2 id="lp-jobs" className="pst-display pst-h2">
            卓の前後の手間も、
            <br className="sm:hidden" />
            ここで片づく。
          </h2>
          <div className="pst-jobs">
            <article className="pst-job">
              <div className="pst-job-text">
                <p className="pst-pain">
                  ログや感想を共有したいけれど、まだ通過していないフォロワーに中身が見えてしまうのが気になります。
                </p>
                <h3 className="pst-h3-lg">未通過の人には、伏せたまま</h3>
                <p className="pst-body">
                  共有範囲を「通過した人」にすると、リンクを開いた人に通過済みかを尋ねます。ログインして通過済みと答えるまで、題名もシステムも見せません。
                </p>
              </div>
              <div className="pst-mat">
                <ScopeFigure />
              </div>
            </article>
            <article className="pst-job">
              <div className="pst-job-text">
                <p className="pst-pain">
                  継続探索者の通過歴や SAN・成長を、毎回キャラシに手で書き足しています。
                </p>
                <h3 className="pst-h3-lg">継続探索者の歩みが、ログとつながる</h3>
                <p className="pst-body">
                  キャラシの URL から取り込むと、セッションごとの SAN
                  や成長がログと結び付いて残ります。遊んだシナリオは、通過済みとして一覧にまとまります。
                </p>
              </div>
              <div className="pst-mat">
                <KarteFigure />
              </div>
            </article>
            <article className="pst-job">
              <div className="pst-job-text">
                <p className="pst-pain">
                  日程を調整ツールで集めて、決まったら Discord で告知し直しています。
                </p>
                <h3 className="pst-h3-lg">日程調整も Discord への告知も、卓の中で</h3>
                <p className="pst-body">
                  候補日にメンバーが ◯ △ × で答えます。決まった予定と前日のお知らせは、卓とつないだ Discord
                  チャンネルに届きます。返事も、Discord の ◯ △ × のボタンから送れます。
                </p>
              </div>
              <div className="pst-mat">
                <PollFigure />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="lp-sources" className="pst-light pst-rule-top">
        <div className="pst-sources mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <h2 id="lp-sources" className="pst-display pst-h2">
            いつもの道具に、
            <br />
            足すだけ。
          </h2>
          <dl className="pst-source-list">
            {LP_SOURCES.map((s) => (
              <div key={s.what} className="pst-source-row">
                <dt>{s.what}</dt>
                <dd>
                  {s.from.map((f) => (
                    <span key={f} className="pst-source-item">
                      {f}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="lp-faq" className="pst-light pst-rule-top">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <h2 id="lp-faq" className="pst-display pst-h2">
            はじめる前に
          </h2>
          <div className="pst-faq">
            {FAQ.map((f, i) => (
              <div key={f.q} className="pst-qa">
                <div className="pst-q">
                  <Portrait name="" file={FAQ_ASKERS[i % FAQ_ASKERS.length]!} size={36} />
                  <h3 className="pst-h3">{f.q}</h3>
                </div>
                <div className="pst-a">
                  <LogoMark size={28} />
                  <div className="pst-body">{f.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="lp-cta" className="pst-ink">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 id="lp-cta" className="pst-display pst-h2">
            次の卓から、
            <br className="sm:hidden" />
            卓譜に残そう。
          </h2>
          <StartLinks />
          <p className="pst-fine">
            卓譜は、個人が作っている非公式の TRPG 向け Web アプリです。不具合や要望は
            <Link to={FEEDBACK_PATH} className="underline underline-offset-2">
              ご意見フォーム
            </Link>
            からお寄せください。
          </p>
        </div>
      </section>
    </PublicFrame>
  );
}

/* ---------- セッションのページの作例（押して試せる） ---------- */

type LogFilter = "all" | "dice" | "secret";
type Chapter = "intro" | "basement" | "bell";

const SHEET_CAST = [
  { name: "白瀬怜", file: "rei", pl: "そら", change: "SAN 53→50 (−3)", tone: "loss" },
  { name: "灯堂澪", file: "mio", pl: "りん", change: "SAN 51→47 (−4)", tone: "loss" },
  { name: "桐生那津", file: "natsu", pl: "なつ", change: "写真術 +7", tone: "gain" },
] as const;

const CHAPTERS: { id: Chapter; at: string; title: string }[] = [
  { id: "intro", at: "0:00:00", title: "導入 灯台のある村" },
  { id: "basement", at: "1:30:00", title: "灯台の地下" },
  { id: "bell", at: "3:12:40", title: "三度目の鐘" },
];

function DiceRoll({
  cmd,
  skill,
  value,
  result,
  tone,
}: {
  cmd: string;
  skill: string;
  value: string;
  result: string;
  tone: "crit" | "fumble" | "loss" | "plain";
}) {
  return (
    <span className="pst-roll">
      <IconDice width={15} height={15} aria-hidden />
      <span className="font-bold">
        {cmd}【{skill}】
      </span>
      <span className="pst-roll-value">→ {value}</span>
      <span className={cx("pst-roll-result", `is-${tone}`)}>{result}</span>
    </span>
  );
}

function LogLine({
  time,
  chapter,
  current,
  onTime,
  who,
  file,
  role,
  secret,
  children,
}: {
  time: string;
  /** この発言の時刻から開く録画の場面 */
  chapter?: Chapter;
  current?: Chapter;
  onTime?: (c: Chapter) => void;
  who: string;
  file: string;
  role: string;
  secret?: boolean;
  children: ReactNode;
}) {
  const linked = chapter && onTime;
  return (
    <div className={cx("pst-line", secret && "is-secret", linked && current === chapter && "is-current")}>
      <Portrait name="" file={file} size={36} />
      <div className="min-w-0 grow">
        <div className="pst-line-head">
          <b>{who}</b>
          <span className="pst-line-role">{role}</span>
          {linked ? (
            <button
              type="button"
              className="pst-line-time is-link"
              aria-pressed={current === chapter}
              aria-label={`${time} の場面を録画で開く`}
              onClick={() => onTime(chapter)}
            >
              {time}
            </button>
          ) : (
            <span className="pst-line-time">{time}</span>
          )}
        </div>
        <div className="pst-line-body">{children}</div>
      </div>
    </div>
  );
}

function SessionSheet() {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [chapter, setChapter] = useState<Chapter>("basement");
  const FILTERS: { v: LogFilter; label: string }[] = [
    { v: "all", label: "すべて" },
    { v: "dice", label: "ダイスだけ" },
    { v: "secret", label: "秘匿タブ" },
  ];

  return (
    <figure className="pst-sheet" aria-label="セッションのページの作例（サンプルの卓）">
      <div className="pst-sheet-head">
        <div className="min-w-0">
          <div className="pst-sheet-crumb">セッション</div>
          <div className="pst-sheet-title">深淵の呼び声</div>
          <div className="pst-sheet-meta">
            <span>9月26日（土）20:34〜24:57</span>
            <span>4時間23分</span>
            <span className="pst-sys">クトゥルフ神話TRPG 7版</span>
            <span>潮騒の会</span>
            <span className="inline-flex items-center gap-1">
              <IconUsers width={14} height={14} aria-hidden /> 通過した人
            </span>
          </div>
        </div>
        <div className="pst-sheet-people" aria-label="参加者">
          <Portrait name="みかん（KP）" file="mikan" size={34} />
          <Portrait name="白瀬怜" file="rei" size={34} />
          <Portrait name="灯堂澪" file="mio" size={34} />
          <Portrait name="桐生那津" file="natsu" size={34} />
        </div>
      </div>

      <div className="pst-sheet-body">
        <div className="pst-sheet-log">
          <div className="pst-sheet-bar">
            <div className="pst-sheet-label">
              ログ <span className="pst-count">54行</span>
            </div>
            <div className="pst-filter-row" role="group" aria-label="ログの表示切り替え">
              {FILTERS.map((f) => (
                <button
                  key={f.v}
                  type="button"
                  className={cx("pst-filter-btn", filter === f.v && "is-active")}
                  aria-pressed={filter === f.v}
                  onClick={() => setFilter(f.v)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pst-lines" data-user-content>
            {filter === "all" && (
              <>
                <LogLine
                  time="20:47"
                  chapter="intro"
                  current={chapter}
                  onTime={setChapter}
                  who="灯台守・源造"
                  file="mikan"
                  role="NPC"
                >
                  「霧が出る晩は、沖の鐘の音が浜まで聞こえてくるんだ」
                </LogLine>
                <LogLine
                  time="22:03"
                  chapter="basement"
                  current={chapter}
                  onTime={setChapter}
                  who="白瀬怜"
                  file="rei"
                  role="PC・そら"
                >
                  「灯台の地下を調べます。足跡が残っていないか、よく見て」
                </LogLine>
                <LogLine time="22:04" who="白瀬怜" file="rei" role="PC・そら">
                  <DiceRoll cmd="CC<=70" skill="目星" value="04" result="クリティカル" tone="crit" />
                </LogLine>
                <LogLine time="22:05" who="桐生那津" file="natsu" role="PC・なつ">
                  「足跡、二人分ある。片方は……裸足？」
                </LogLine>
                <LogLine time="22:18" who="灯堂澪" file="mio" role="PC・りん">
                  <DiceRoll cmd="CC<=60" skill="心理学" value="98" result="ファンブル" tone="fumble" />
                </LogLine>
                <LogLine
                  time="23:41"
                  chapter="bell"
                  current={chapter}
                  onTime={setChapter}
                  who="灯堂澪"
                  file="mio"
                  role="PC・りん"
                >
                  「……この扉、内側から開けられてる」
                </LogLine>
              </>
            )}
            {filter === "dice" && (
              <>
                <LogLine time="22:04" who="白瀬怜" file="rei" role="PC・そら">
                  <DiceRoll cmd="CC<=70" skill="目星" value="04" result="クリティカル" tone="crit" />
                </LogLine>
                <LogLine time="22:18" who="灯堂澪" file="mio" role="PC・りん">
                  <DiceRoll cmd="CC<=60" skill="心理学" value="98" result="ファンブル" tone="fumble" />
                </LogLine>
                <LogLine time="23:42" who="白瀬怜" file="rei" role="PC・そら">
                  <DiceRoll cmd="CC<=53" skill="SAN" value="68" result="SAN 53→50 (−3)" tone="loss" />
                </LogLine>
                <LogLine time="23:50" who="桐生那津" file="natsu" role="PC・なつ">
                  <DiceRoll cmd="CC<=45" skill="写真術" value="31" result="成功" tone="plain" />
                </LogLine>
              </>
            )}
            {filter === "secret" && (
              <>
                <LogLine time="22:05" who="みかん" file="mikan" role="KP・秘匿 HO2" secret>
                  「あなたにだけ、鐘の音が三度聞こえた」
                </LogLine>
                <LogLine time="22:06" who="灯堂澪" file="mio" role="PC・りん" secret>
                  「……今のは、ほかの二人には聞こえていないんですね」
                </LogLine>
                <LogLine time="22:07" who="みかん" file="mikan" role="KP・秘匿 HO2" secret>
                  「ええ。鐘のことは、まだ誰にも話さないでください」
                </LogLine>
              </>
            )}
          </div>
        </div>

        <div className="pst-sheet-side">
          <div>
            <div className="pst-sheet-label">録画 YouTube</div>
            <div className="pst-rec">
              <ol className="pst-rec-list">
                {CHAPTERS.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cx(chapter === c.id && "is-current")}
                      aria-pressed={chapter === c.id}
                      onClick={() => setChapter(c.id)}
                    >
                      <span className="pst-rec-play" aria-hidden>
                        <IconPlayerPlay width={12} height={12} />
                      </span>
                      <span className="pst-rec-at">{c.at}</span>
                      <span className="min-w-0 truncate">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div>
            <div className="pst-sheet-label">探索者</div>
            <ul className="pst-cast">
              {SHEET_CAST.map((c) => (
                <li key={c.name}>
                  <Portrait name="" file={c.file} size={32} />
                  <span className="min-w-0 grow">
                    <b>{c.name}</b>
                    <span className="pst-cast-pl">PL {c.pl}</span>
                  </span>
                  <span className={cx("pst-cast-change", c.tone === "loss" ? "pst-loss" : "pst-gain")}>
                    {c.change}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="pst-sheet-label">感想・絵</div>
            <ul className="pst-links">
              <li>
                <span className="pst-link-service">ふせったー</span>
                <b>深淵の呼び声 感想（ネタバレ）</b>
                <span className="pst-cast-pl">そら</span>
              </li>
              <li>
                <span className="pst-link-service">X</span>
                <b>「鐘の音、まだ耳に残ってる」</b>
                <span className="pst-cast-pl">りん</span>
              </li>
            </ul>
          </div>
          <div>
            <div className="pst-sheet-label">シナリオ</div>
            <div className="pst-scenario">
              <b>深淵の呼び声</b>
              <span className="pst-cast-pl">このシナリオのセッション 3</span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ---------- 3 つの仕事の作例 ---------- */

/**
 * 同じ共有リンクを、通過した人と未通過の人が開いたときの見え方。
 * 未通過の人の側は、共有ページ（ShareLog.tsx の RemoteShare）が出す鍵の案内そのまま: 題名・システムも出さない
 */
function ScopeFigure() {
  return (
    <div className="pst-scope" aria-hidden="true">
      <div className="pst-scope-url">
        <IconLink width={14} height={14} />
        <span className="min-w-0 truncate">takufu.app/share/l/…</span>
        <span className="pst-scope-same">同じリンク</span>
      </div>
      <div className="pst-split">
        <div>
          <div className="pst-pane-label">
            <IconEye width={14} height={14} /> 通過した人が開くと
          </div>
          <div className="pst-figure pst-share">
            <div className="pst-tile-meta pst-sys">クトゥルフ神話TRPG 7版</div>
            <div className="pst-mini-title mt-1">深淵の呼び声</div>
            <div className="pst-tile-meta">9月26日（土）・4時間23分</div>
            <div className="pst-share-cast">
              <Portrait name="" file="mikan" size={24} />
              <Portrait name="" file="rei" size={24} />
              <Portrait name="" file="mio" size={24} />
              <Portrait name="" file="natsu" size={24} />
            </div>
            <div className="pst-mini-line">
              <Portrait name="" file="mio" size={24} />
              <span>「……この扉、内側から開けられてる」</span>
            </div>
            <div className="pst-mini-line">
              <Portrait name="" file="rei" size={24} />
              <span>
                <DiceRoll cmd="CC<=70" skill="目星" value="04" result="クリティカル" tone="crit" />
              </span>
            </div>
          </div>
        </div>
        <div>
          <div className="pst-pane-label">
            <IconEyeOff width={14} height={14} /> 未通過の人には
          </div>
          <div className="pst-figure pst-share is-gated">
            <IconLock width={22} height={22} />
            <b>通過した人に共有された記録です</b>
            <span>このシナリオを通過済みなら、記録を開けます。</span>
            <span className="pst-gate-btn">通過済みなので開く</span>
          </div>
        </div>
      </div>
      <dl className="pst-scope-legend">
        <div>
          <dt>未通過の人に見えないもの</dt>
          <dd>題名・システム・日付・顔ぶれ・ログ・録画・感想</dd>
        </div>
        <div>
          <dt>X や Discord に貼ったとき</dt>
          <dd>リンクの見出しにも、題名は出ません</dd>
        </div>
      </dl>
    </div>
  );
}

function KarteFigure() {
  const rows = [
    {
      date: "11月8日",
      title: "鏡の館の晩餐",
      change: "SAN 66→61 (−5)",
      tone: "loss",
      growth: "目星 65→72 (+7)",
    },
    {
      date: "10月4日",
      title: "雨夜の古書店",
      change: "SAN 70→66 (−4)",
      tone: "loss",
      growth: "心理学 45→51 (+6)",
    },
    {
      date: "8月30日",
      title: "はじまりの手紙",
      change: "SAN (±0)",
      tone: "plain",
      growth: "図書館 70→75 (+5)",
    },
  ] as const;
  return (
    <div className="pst-figure" aria-hidden="true">
      <div className="pst-karte-head">
        <Portrait name="" file="towa" size={52} />
        <div className="min-w-0">
          <div className="pst-mini-title">遠沢澄花</div>
          <div className="pst-tile-meta">地方紙記者・キャラエノと同期</div>
        </div>
        <div className="pst-karte-san">
          <span className="pst-tile-meta">SAN</span>
          <b>61</b>
        </div>
      </div>
      <ol className="pst-karte">
        {rows.map((r) => (
          <li key={r.title}>
            <span className="pst-karte-date">{r.date}</span>
            <span className="pst-karte-title">{r.title}</span>
            <span className={cx("pst-karte-change", r.tone === "loss" && "pst-loss")}>{r.change}</span>
            <span className="pst-karte-growth">{r.growth}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PollFigure() {
  const people = ["mikan", "rei", "mio", "natsu"];
  const rows: { day: string; marks: ("yes" | "maybe" | "no")[]; chosen?: boolean }[] = [
    { day: "11月29日（土）21:00〜", marks: ["yes", "yes", "yes", "yes"], chosen: true },
    { day: "11月30日（日）20:00〜", marks: ["yes", "maybe", "no", "yes"] },
    { day: "12月6日（土）21:00〜", marks: ["yes", "yes", "maybe", "no"] },
  ];
  return (
    <div className="pst-figure" aria-hidden="true">
      <div className="pst-mini-title">深淵の呼び声 第二夜の日程</div>
      <table className="pst-poll">
        <thead>
          <tr>
            <th />
            {people.map((p) => (
              <th key={p}>
                <Portrait name="" file={p} size={26} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day} className={cx(r.chosen && "is-chosen")}>
              <th scope="row">
                {r.day}
                {r.chosen && <span className="pst-chosen">決定</span>}
              </th>
              {r.marks.map((m, i) => (
                <td key={i}>
                  <Mark v={m} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pst-discord">
        <IconDiscord width={16} height={16} />
        <span>決まった予定が、卓の Discord チャンネルにも届きます</span>
      </div>
    </div>
  );
}

/* ================= ライセンス・規約 ================= */
function LegalArticle({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <PublicFrame width="max-w-3xl">
      <article className="text-sm leading-7">
        <h1 className="text-2xl font-bold sm:text-[1.75rem]">{title}</h1>
        {updated && <p className="mt-1 text-sm text-ink2">制定: {updated}</p>}
        <div className="mt-8">{children}</div>
      </article>
    </PublicFrame>
  );
}

function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-base font-bold sm:text-lg">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-primary"
    >
      {children}
    </a>
  );
}

function ContactNote() {
  return (
    <p>
      <Link to={FEEDBACK_PATH} className="underline underline-offset-2 hover:text-primary">
        ご意見・不具合の報告
      </Link>
      のフォームで受け付けます。送った内容は運営者だけが読み、公開されません。返事が必要な場合は、連絡先の欄に返信先を書いてください。
    </p>
  );
}

/* ================= ご意見・不具合の報告（/feedback） ================= */

type FeedbackStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; text: string };

/** 開く前にいた画面（?from= か、同じサイトの参照元）。フォーム自身は除く */
function feedbackFromPage(fromParam: string | null): string {
  if (fromParam?.startsWith("/")) return fromParam;
  if (typeof document === "undefined" || !document.referrer) return "";
  try {
    const ref = new URL(document.referrer);
    if (ref.origin !== window.location.origin || ref.pathname === FEEDBACK_PATH) return "";
    return ref.pathname + ref.search;
  } catch {
    return "";
  }
}

export function Feedback() {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FeedbackStatus>({ kind: "idle" });
  const [bodyError, setBodyError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setBodyError("内容を書いてください。");
      return;
    }
    setBodyError(null);
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          body,
          contact,
          website,
          page: feedbackFromPage(new URLSearchParams(window.location.search).get("from")),
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setStatus({
          kind: "error",
          text: json?.error ?? "送れませんでした。時間をおいてもう一度送ってください。",
        });
        return;
      }
      setStatus({ kind: "sent" });
    } catch {
      setStatus({ kind: "error", text: "通信できませんでした。接続を確かめてもう一度送ってください。" });
    }
  }

  if (status.kind === "sent") {
    return (
      <PublicFrame width="max-w-2xl">
        <h1 className="text-2xl font-bold sm:text-[1.75rem]">送りました</h1>
        <p className="mt-3 text-sm leading-7">
          ありがとうございます。いただいた内容は運営者が読んで、改善に使います。連絡先を書いた場合は、必要に応じてそちらに返事をします。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setBody("");
              setStatus({ kind: "idle" });
            }}
          >
            続けて送る
          </button>
          <Link to="/" className="btn btn-quiet">
            トップへ戻る
          </Link>
        </div>
      </PublicFrame>
    );
  }

  const sending = status.kind === "sending";
  return (
    <PublicFrame width="max-w-2xl">
      <h1 className="text-2xl font-bold sm:text-[1.75rem]">ご意見・不具合の報告</h1>
      <p className="mt-3 text-sm leading-7 text-ink2">
        不具合、ほしい機能、使いにくいところ、記録の削除や権利についての依頼を受け付けます。送った内容は運営者だけが読み、公開されません。
      </p>
      <form className="surface mt-6 p-5 sm:p-6" onSubmit={submit} noValidate>
        <Field label="種類" noMargin group>
          <div className="flex">
            <Seg<FeedbackKind>
              value={kind}
              onChange={setKind}
              options={FEEDBACK_KINDS.map((k) => ({ v: k.v, label: k.label }))}
            />
          </div>
        </Field>
        <Field
          label="内容"
          hint={
            kind === "bug"
              ? "どの画面で、何をしたら、どうなったかを書いてください。ログの本文や他の人の個人情報は書かないでください。"
              : `${FEEDBACK_LIMITS.body} 文字まで`
          }
        >
          <textarea
            className="textarea textarea-bordered min-h-40 w-full text-base leading-7"
            value={body}
            maxLength={FEEDBACK_LIMITS.body}
            aria-invalid={bodyError ? true : undefined}
            aria-describedby={bodyError ? "feedback-body-error" : undefined}
            onChange={(e) => {
              setBody(e.target.value);
              if (bodyError && e.target.value.trim()) setBodyError(null);
            }}
          />
        </Field>
        <FieldError id="feedback-body-error" text={bodyError} />
        <Field
          label="連絡先（任意）"
          hint="返事がほしいときだけ（X の ID、Discord のユーザー名、メールアドレスなど）"
        >
          <input
            className="input input-bordered w-full"
            value={contact}
            maxLength={FEEDBACK_LIMITS.contact}
            autoComplete="off"
            onChange={(e) => setContact(e.target.value)}
          />
        </Field>
        {/* ボット除け。人には見えず、読み上げにも出ない */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            ウェブサイト
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>
        {status.kind === "error" && (
          <p role="alert" className="mt-4 text-sm text-error">
            {status.text}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? "送っています…" : "送る"}
          </button>
        </div>
      </form>
    </PublicFrame>
  );
}

export function Licenses() {
  return (
    <LegalArticle title="ライセンス・権利表記">
      <Clause title="TRPG システムの権利表記">
        <p>
          卓譜は、次の TRPG
          システムの記録を扱うために用語やデータの形式を利用しています。各システムの権利者が定める二次創作ガイドラインに従い、権利表記を行います。
        </p>
      </Clause>
      <div className="surface mt-4 p-5">
        <RightsNotice className="text-sm" />
      </div>

      <Clause title="卓譜のダイスタス・コモンズ">
        <p>
          エモクロアTRPG
          の二次創作ガイドラインに基づき、卓譜を利用・改変・配信する条件を次のとおり定めます。卓譜を使ってできたもの（配信や動画など）に、卓譜の名前を書く必要はありません。
        </p>
        <Bullets
          items={[
            "クレジット表示: 不要",
            "改変利用: 許可",
            "公演利用（配信・動画など）: 許可（収益化してもよい）",
            <>
              営利利用: 許諾制です。{DICETOUS_COMMONS.contactLabel}は{" "}
              <Link
                to={DICETOUS_COMMONS.contactUrl}
                className="underline underline-offset-2 hover:text-primary"
              >
                ご意見フォーム
              </Link>
              からお寄せください。
            </>,
          ]}
        />
      </Clause>

      <Clause title="記録やキャラクターの権利">
        <p>
          ログ・キャラクター・画像などの記録の権利は、書いた人や描いた人にあります。キャラクターシートやシナリオの情報は、取り込み元のサービスと作者のものです。
        </p>
      </Clause>

      <Clause title="オープンソースソフトウェア">
        <p>卓譜は次のオープンソースソフトウェアと素材を利用しています。</p>
        <div className="surface list mt-3">
          {OSS_LICENSES.map((o) => (
            <div
              key={o.name}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
            >
              <ExternalLink href={o.url}>{o.name}</ExternalLink>
              <span className="text-xs text-ink2">{o.license}</span>
            </div>
          ))}
        </div>
      </Clause>
    </LegalArticle>
  );
}

export function Terms() {
  return (
    <LegalArticle title="利用規約" updated={LEGAL_UPDATED}>
      <Clause title="第1条 適用">
        <p>
          この規約は、卓譜（以下「本サービス」）を利用するときの条件を定めるものです。利用者は、本サービスを利用した時点でこの規約に同意したものとみなします。
        </p>
      </Clause>
      <Clause title="第2条 運営者">
        <p>本サービスは個人（以下「運営者」）が運営しています。</p>
      </Clause>
      <Clause title="第3条 アカウント">
        <Bullets
          items={[
            "本サービスには Google アカウントでログインします。ログインせずにサンプルデータで試す場合、内容はその端末のブラウザにだけ保存されます。",
            "利用者は自分のアカウントを自分の責任で管理してください。第三者に使わせてはいけません。",
          ]}
        />
      </Clause>
      <Clause title="第4条 記録の権利と扱い">
        <Bullets
          items={[
            "利用者が入力・取り込みした記録（セッション、ログ、キャラクター、シナリオ、画像など）の権利は、利用者または元の権利者にあります。",
            "運営者は、本サービスの提供・保守・不具合の調査に必要な範囲でのみ記録を扱います。それ以外の目的で使ったり、利用者の許可なく公開したりはしません。",
            "利用者が共有範囲を設定して公開した記録は、その範囲の人が閲覧します。",
          ]}
        />
      </Clause>
      <Clause title="第5条 同卓者への配慮">
        <Bullets
          items={[
            "ログには、他の参加者の発言・名前・キャラクターが含まれます。記録や共有の前に、同卓者の了解を得てください。",
            "共有範囲は、同卓者の意向とシナリオのネタバレに配慮して選んでください。",
            "セッションの共有範囲を広げる前に、シナリオの作者が定めるリプレイやログの公開・共有に関する規約を、ご自身で確認してください。卓譜はシナリオごとの共有方針を扱わず、選んだ範囲どおりに共有します。",
            "同卓者から記録の削除や非公開を求められた場合は、速やかに対応してください。",
          ]}
        />
      </Clause>
      <Clause title="第6条 外部サービスとの連携">
        <Bullets
          items={[
            "本サービスは、キャラクターシートのサイト、シナリオの販売サイト、Google カレンダーなどと連携します。連携先の利用規約も守ってください。",
            "外部サイトからの取り込みは、利用者が指定した URL のページだけを取得します。本サービスが外部サイトを巡回して一括で取得することはありません。",
          ]}
        />
      </Clause>
      <Clause title="第7条 TRPG 作品の権利">
        <p>
          各 TRPG
          システムやシナリオの権利は、それぞれの権利者にあります。ルールブックやシナリオの本文・図表を、引用の範囲を超えて本サービスに載せないでください。権利表記は
          <Link to="/licenses" className="underline underline-offset-2 hover:text-primary">
            ライセンス・権利表記
          </Link>
          にあります。
        </p>
      </Clause>
      <Clause title="第8条 禁止事項">
        <p>利用者は、次のことをしてはいけません。</p>
        <Bullets
          items={[
            "法令や公序良俗に反すること",
            "他人の著作権・プライバシー・名誉などの権利を侵害すること",
            "同卓者の同意なく、その人の個人情報や秘匿情報を公開すること",
            "不正アクセス、本サービスへの過度な負荷、自動化された大量の取得",
            "他人になりすますこと、本サービスや TRPG の権利者の公式であるかのように見せること",
            "その他、運営者が不適切と判断すること",
          ]}
        />
      </Clause>
      <Clause title="第9条 サービスの変更・停止">
        <p>運営者は、予告なく本サービスの内容を変更し、または提供を中断・終了することがあります。</p>
      </Clause>
      <Clause title="第10条 記録の削除">
        <p>
          運営者は、この規約に反する記録や、権利者・同卓者から正当な申し出があった記録を、利用者に断らずに非公開または削除することがあります。
        </p>
      </Clause>
      <Clause title="第11条 免責">
        <p>
          本サービスは無償で、現状のまま提供します。運営者は、本サービスの利用によって生じた損害（記録の消失を含む）について、運営者の故意または重大な過失による場合を除き、責任を負いません。
        </p>
      </Clause>
      <Clause title="第12条 規約の変更">
        <p>
          運営者は、必要に応じてこの規約を変更します。変更後の規約はこのページに掲載した時点から効力を持ちます。利用者に不利な変更をするときは、事前に本サービス上で知らせます。
        </p>
      </Clause>
      <Clause title="第13条 準拠法・管轄">
        <p>
          この規約は日本法に従って解釈します。本サービスに関する紛争は、運営者の住所地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </Clause>
      <Clause title="お問い合わせ">
        <ContactNote />
      </Clause>
    </LegalArticle>
  );
}

export function Privacy() {
  return (
    <LegalArticle title="プライバシーポリシー" updated={LEGAL_UPDATED}>
      <p>卓譜（以下「本サービス」）が利用者の情報をどう取得し、どう使うかを定めます。</p>
      <Clause title="1. 取得する情報">
        <Bullets
          items={[
            "Google アカウントの情報: 表示名、メールアドレス、プロフィール画像、Google のユーザー ID（ログイン時）",
            "X アカウントの情報: X のユーザー ID、表示名、プロフィール画像（設定で X を連携した場合のみ）",
            "Discord アカウントの情報: 設定で Discord を連携した場合だけ、Discord のユーザー ID・ユーザー名・表示名を取得します。連携に使う Discord の許可は名前を読むことだけで、読んだあとはすぐに取り消して保存しません",
            "卓とつないだ Discord のサーバー・チャンネルの ID と名前（卓を作った人が Discord でつないだ場合のみ）と、そこに投稿したメッセージ・イベントの ID",
            "利用者が決めた卓譜のユーザー ID: プロフィールの URL になり、ほかの利用者にも見えます。一度決めると変えられません",
            "利用者が入力・取り込みした記録: セッション、ログ（同卓者の発言や名前を含む）、キャラクター、シナリオ、卓、予定、日程調整の回答、画像",
            ...(features.googleCalendar
              ? [
                  "Google カレンダーの空き時間: 設定で許可した場合のみ、カレンダーの一覧（名前と、メインのカレンダーかどうか）と、選んだカレンダーに予定が入っている時間帯（開始と終了だけ、今日から 90 日先まで）を読みます。予定の件名・内容・場所・参加者は読みません。読み取りに使う許可は空き時間とカレンダー一覧の閲覧だけで、予定を書き換えることはありません",
                ]
              : []),
            "外部サイトから取り込むために利用者が指定した URL と、その取得結果",
            "ご意見・不具合の報告フォームに書いた内容: 種類、本文、任意の連絡先、フォームを開く前の画面の URL",
            "端末内の保存領域（localStorage・IndexedDB）: 記録の控え、表示の設定、ログイン状態",
          ]}
        />
        <p>
          卓報告カードを作るとき、カードに載せる題名・システム・日付・名前・アイコン画像を本サービスのサーバーに送り、画像にして返します。サーバーには残しません。
        </p>
        <p>広告や行動分析のための Cookie・計測ツールは使っていません。</p>
      </Clause>
      <Clause title="2. 利用目的">
        <Bullets
          items={[
            "本サービスを提供し、記録を端末間で同期するため",
            "利用者が設定した共有範囲に従って、共有ページを表示するため",
            "日程調整で、予定が重なる候補日を知らせるため",
            "卓とつないだ Discord のチャンネルで、日程調整に回答してもらい、決まった予定と前日のお知らせを届けるため",
            "不具合の調査、不正な利用の防止、お問い合わせへの対応のため",
          ]}
        />
      </Clause>
      <Clause title="3. 第三者への提供">
        <p>次の場合を除き、利用者の情報を第三者に提供しません。</p>
        <Bullets
          items={[
            "利用者が共有範囲を設定して公開した記録を、その範囲の人が閲覧する場合",
            "利用者が発行したカレンダー購読 URL を通じて、予定が読まれる場合",
            "卓の招待リンクを開いた人が、卓の名前とメンバーの表示名・ユーザー ID を見る場合",
            "卓を Discord のチャンネルとつないだ場合: その卓の日程調整（題名・候補日・回答の数）と決まった予定を、そのチャンネルに投稿します。セッションの記録は、記録した人が選んだときだけ投稿し、題名などは公開の共有ページに出る範囲だけを載せます",
            "法令に基づく場合",
          ]}
        />
      </Clause>
      <Clause title="4. 利用している外部サービス">
        <p>本サービスは、次の外部サービスを通じて情報を保存・送信します。</p>
        <Bullets
          items={[
            <>
              Google（Firebase Authentication・Cloud Firestore）: ログインと記録の保存に使います。
              <ExternalLink href="https://policies.google.com/privacy">
                Google のプライバシーポリシー
              </ExternalLink>
            </>,
            "Google Fonts: ログイン画面の「Google でログイン」ボタンの書体（Google Sans）を読み込むとき、ブラウザが Google のサーバーにアクセスします",
            ...(features.googleCalendar
              ? [
                  "Google カレンダー API: 許可した場合だけ、空き時間とカレンダー一覧を読み取ります。読み取った時間帯は自分の記録の中にだけ保存し、他の利用者には見せず、日程調整の回答やカレンダー購読にも含めません。設定をオフにすると、保存した時間帯とカレンダーの一覧を消します",
                ]
              : []),
            <>
              GMO ペパボ（LOLIPOP! Deploy Now）: 本サービスの配信に使います。アクセス時の IP
              アドレスなどが記録されることがあります。
              <ExternalLink href="https://pepabo.com/privacy/">GMO ペパボのプライバシーポリシー</ExternalLink>
            </>,
            <>
              Sentry（Functional Software, Inc.、米国）:
              不具合を直すために、画面やサーバーで起きたエラーの内容と、そのときのページの URL・ブラウザと OS
              の種類と、サーバーの警告・エラーの記録を送ります。IP
              アドレス・Cookie・入力した記録の中身は送りません。
              <ExternalLink href="https://sentry.io/privacy/">Sentry のプライバシーポリシー</ExternalLink>
            </>,
            "キャラクターシート・シナリオのサイト: 利用者が URL を指定して取り込むとき、本サービスのサーバーがそのページを取得します。利用者のアカウント情報は送りません",
            "YouTube・ニコニコ・ふせったー・X: セッションの「関連するもの」に貼った URL の題名や本文の頭を出すとき、本サービスのサーバーがそのサービスに問い合わせます。送るのは貼った URL から取り出した ID だけで、利用者のアカウント情報は送りません",
            "X: 卓報告の投稿画面を開くとき、投稿文と共有ページの URL を X に渡します",
            <>
              Discord: ご意見・不具合の報告フォームの内容を、運営者だけが読む Discord
              のチャンネルに送ります。卓を Discord
              とつないだ場合は、卓譜のボットが上に書いた範囲の日程調整・予定・記録をそのチャンネルに投稿し、Discord
              のイベントを作ります。
              <ExternalLink href="https://discord.com/privacy">Discord のプライバシーポリシー</ExternalLink>
            </>,
          ]}
        />
      </Clause>
      <Clause title="5. 保存期間と削除">
        <p>
          記録はアカウントがある間保存します。共有の招待を受け取って参加すると、そのセッションの記録（ログ、参加者の表示名、シナリオ）の写しが、参加した人の記録にも保存されます。共有を止めたり参加者を外したりしても、すでに保存された写しは、その人の記録に残ります。アカウントや記録の削除を希望する場合は、下記の窓口に連絡してください。サンプルデータで試した内容は、その端末のブラウザにだけ保存されます。
        </p>
      </Clause>
      <Clause title="6. 安全管理">
        <p>
          記録は、本人と共有範囲で許可された人だけが読めるようにアクセスを制限して保存します。共有ページの URL
          を知っている人は、共有範囲の条件を満たす限り閲覧が可能です。
        </p>
      </Clause>
      <Clause title="7. 開示・訂正・削除の請求">
        <p>
          自分の情報の開示・訂正・削除・利用停止を求める場合は、下記の窓口に連絡してください。本人確認のうえ対応します。
        </p>
      </Clause>
      <Clause title="8. 改定">
        <p>このポリシーを変更するときは、このページで知らせます。重要な変更は本サービス上でも知らせます。</p>
      </Clause>
      <Clause title="お問い合わせ">
        <ContactNote />
      </Clause>
    </LegalArticle>
  );
}
