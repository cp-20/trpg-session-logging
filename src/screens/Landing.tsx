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
  IconCalendar,
  IconDice,
  IconCharacter,
  IconLock,
  IconPlayerPlay,
  IconSearch,
  IconShare,
} from "../components/icons";
import { features } from "../lib/features";
import { DICETOUS_COMMONS, FEEDBACK_PATH, OSS_LICENSES } from "../lib/rights";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind } from "../lib/feedback-kinds";

/** 規約・ポリシーの制定日。改定したら更新する */
const LEGAL_UPDATED = "2026年11月26日";

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
      <footer className="border-t border-base-300 bg-base-100">
        <div
          className={`mx-auto flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-xs text-ink2 sm:px-6 ${headWidth}`}
        >
          <span>卓譜</span>
          <LegalLinks />
          <span className="basis-full">
            クトゥルフ神話TRPG・ソード・ワールド2.5・エモクロアTRPG の二次創作物を含みます。権利表記は
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
 * 卓報告ポスター。X の #卓報告 に流れてくるもの（卓報告・ログの名台詞・ダイス・SAN・録画・立ち絵・次の日程）を
 * タイルにして貼り、それが卓譜の 1 ページに集まるところを見せる。中身はすべてサンプルの卓「深淵の呼び声」から。
 * 動くのはタイルの帯だけ（prefers-reduced-motion で止まる）。色・書体は styles.css の .pst-* に閉じる。
 */

function Portrait({ name, file, size = 40 }: { name: string; file: string; size?: number }) {
  return <img src={`/lp/${file}.svg`} alt={name} width={size} height={size} className="pst-portrait" />;
}

const TILES_A: ReactNode[] = [
  <div key="report" className="pst-tile pst-tile-report">
    <div className="pst-tile-tag">#卓報告</div>
    <div className="pst-display pst-tile-title">深淵の呼び声 第一夜</div>
    <div className="pst-tile-meta">クトゥルフ神話TRPG 7版 / 9月26日 / 4時間23分</div>
    <div className="mt-3 flex items-center gap-1.5">
      <Portrait name="白瀬怜" file="rei" size={34} />
      <Portrait name="灯堂澪" file="mio" size={34} />
      <Portrait name="桐生那津" file="natsu" size={34} />
      <span className="pst-tile-meta ml-1.5">GM みかん</span>
    </div>
    <div className="pst-stamp">全員生還</div>
  </div>,
  <div key="crit" className="pst-tile pst-tile-dice">
    <div className="pst-tile-meta flex items-center gap-1.5">
      <IconDice width={16} height={16} aria-hidden /> CC&lt;=70 目星
    </div>
    <div className="pst-display pst-dice-num">04</div>
    <div className="pst-band pst-band-crit">クリティカル</div>
  </div>,
  <div key="quote" className="pst-tile pst-tile-quote">
    <div className="flex items-center gap-2">
      <Portrait name="みかん" file="mikan" size={30} />
      <span className="text-sm font-bold">灯台守・源造</span>
      <span className="pst-tile-meta">NPC</span>
    </div>
    <p className="pst-quote">「霧が出る晩は、沖の鐘の音が浜まで聞こえてくるんだ」</p>
  </div>,
  <div key="san" className="pst-tile pst-tile-san">
    <div className="pst-tile-meta">白瀬怜 / SAN チェック</div>
    <div className="flex items-baseline gap-3">
      <span className="pst-display pst-san-from">53→50</span>
      <span className="pst-display pst-san-loss">−3</span>
    </div>
  </div>,
  <div key="rec" className="pst-tile pst-tile-rec">
    <span className="pst-play" aria-hidden>
      <IconPlayerPlay width={18} height={18} />
    </span>
    <div>
      <div className="pst-tile-meta pst-on-dark">録画 Part1</div>
      <div className="text-base font-bold">1:30:00 灯台の地下</div>
    </div>
  </div>,
];

const TILES_B: ReactNode[] = [
  <div key="portrait" className="pst-tile pst-tile-portrait">
    <Portrait name="遠沢澄花" file="towa" size={88} />
    <div>
      <div className="pst-display pst-tile-title">遠沢澄花</div>
      <div className="pst-tile-meta">通過 5 卓 / SAN 61</div>
      <div className="pst-tile-meta">キャラエノと同期</div>
    </div>
  </div>,
  <div key="fumble" className="pst-tile pst-tile-dice">
    <div className="pst-tile-meta flex items-center gap-1.5">
      <IconDice width={16} height={16} aria-hidden /> CC&lt;=60 心理学
    </div>
    <div className="pst-display pst-dice-num">98</div>
    <div className="pst-band pst-band-fumble">ファンブル</div>
  </div>,
  <div key="poll" className="pst-tile pst-tile-poll">
    <div className="pst-tile-meta">次回の日程</div>
    <div className="pst-display pst-tile-title">11/29（土）21:00</div>
    <div className="pst-poll-row" aria-label="みかん ◯ そら ◯ りん ◯ なつ ◯">
      <span>◯</span>
      <span>◯</span>
      <span>◯</span>
      <span>◯</span>
    </div>
  </div>,
  <div key="secret" className="pst-tile pst-tile-secret">
    <div className="pst-tile-meta flex items-center gap-1.5 pst-on-dark">
      <IconLock width={14} height={14} aria-hidden /> 秘匿 HO2 / そらだけ
    </div>
    <p className="pst-quote">「あなたにだけ、鐘の音が三度聞こえた」</p>
  </div>,
  <div key="growth" className="pst-tile pst-tile-growth">
    <div className="pst-tile-meta">成長</div>
    <div className="pst-growth">
      <span>目星</span>
      <b>65→72</b>
      <span>心理学</span>
      <b>45→51</b>
      <span>クトゥルフ神話</span>
      <b>0→7</b>
    </div>
  </div>,
];

/** 流れるタイルの帯。継ぎ目なく回すため 2 周ぶん並べ、2 周目は読み上げから外す */
function TileRow({ tiles, reverse }: { tiles: ReactNode[]; reverse?: boolean }) {
  return (
    <div className={cx("pst-row", reverse && "is-reverse")}>
      <div className="pst-row-track">
        {tiles}
        <div className="contents" aria-hidden>
          {tiles}
        </div>
      </div>
    </div>
  );
}

const SYSTEMS = [
  "クトゥルフ神話TRPG 6版",
  "クトゥルフ神話TRPG 7版",
  "エモクロアTRPG",
  "ソード・ワールド2.5",
  "マーダーミステリー",
  "汎用",
];

const SOURCES = [
  "CCFOLIA",
  "キャラエノ",
  "いあきゃら",
  "キャラクター保管所",
  "ゆとシートⅡ",
  "キャラッシュ",
  "YouTube",
  "ニコニコ",
  "Twitch",
  "ふせったー",
  "pixiv",
  "Google カレンダー",
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

export default function Landing() {
  return (
    <PublicFrame poster>
      <LpFonts />
      <section aria-labelledby="lp-title" className="pst-hero">
        <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
          <h1 id="lp-title" className="pst-display pst-h1">
            卓が終わったら、
            <br />
            ぜんぶここ。
          </h1>
          <p className="pst-lead mt-6">
            CCFOLIA のログ、探索者の成長、録画や感想、次の日程まで、
            <br className="hidden sm:inline" />
            TRPG のセッション記録をひとつのページにまとめる無料アプリです。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link prefetch={false} to="/home" className="pst-btn pst-btn-solid">
              使ってみる
            </Link>
            <Link prefetch={false} to="/demo" className="pst-btn pst-btn-line">
              サンプルデータをそのまま見る
            </Link>
          </div>
        </div>
        <div
          className="pst-wall"
          role="img"
          aria-label="卓報告・ダイス・名台詞・SAN・録画・立ち絵・日程のタイル"
        >
          <TileRow tiles={TILES_A} />
          <TileRow tiles={TILES_B} reverse />
        </div>
      </section>

      <section aria-labelledby="lp-page" className="pst-light">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 id="lp-page" className="pst-display pst-h2">
            ぜんぶ、
            <br className="sm:hidden" />
            ひとつのページに集まる。
          </h2>
          <p className="pst-body mt-5">
            CCFOLIA の HTML や ZIP
            を入れると、発言・ダイス・秘匿タブを読みやすく整理します。録画や探索者の変化も同じページに並びます。
          </p>
          <SessionSheet />
        </div>
      </section>

      <section aria-labelledby="lp-features" className="pst-light pst-section-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 id="lp-features" className="pst-display pst-h2">
            卓譜でできること
          </h2>
          <div className="pst-spec-grid mt-10">
            <article className="pst-spec">
              <div className="pst-spec-head">
                <IconSearch width={20} height={20} aria-hidden />
                <h3 className="pst-spec-title">ログを読む・探す</h3>
              </div>
              <p className="pst-spec-desc">
                CCFOLIA
                のログを取り込むと、発言者・ダイス・チャンネルごとに見やすく整理します。秘匿タブは許可された人だけに表示し、全文検索やダイスだけの抽出にも対応しています。
              </p>
              <div className="pst-spec-sample" aria-hidden="true">
                <span className="pst-log-dice">
                  <IconDice width={14} height={14} aria-hidden /> CC&lt;=70 目星 <b>04</b>
                  <span className="pst-band pst-band-crit pst-band-sm">クリティカル</span>
                </span>
              </div>
            </article>

            <article className="pst-spec">
              <div className="pst-spec-head">
                <IconCharacter width={20} height={20} aria-hidden />
                <h3 className="pst-spec-title">探索者の歩みを残す</h3>
              </div>
              <p className="pst-spec-desc">
                キャラシの URL から取り込みます。卓ごとの SAN
                や技能の変化が積み上がり、キャラシサイトとも自動同期します。
              </p>
              <div className="pst-spec-sample" aria-hidden="true">
                <Portrait name="" file="towa" size={28} />
                <span className="text-sm font-bold">遠沢澄花</span>
                <span className="pst-tile-meta">SAN 61 / キャラエノ同期</span>
              </div>
            </article>

            <article className="pst-spec">
              <div className="pst-spec-head">
                <IconPlayerPlay width={20} height={20} aria-hidden />
                <h3 className="pst-spec-title">録画・感想・絵をつなぐ</h3>
              </div>
              <p className="pst-spec-desc">
                録画・配信アーカイブ・リプレイ動画・卓報告・ふせったー・イラストをセッションに紐付けます。ものごとの共有範囲とネタバレ設定、目次つきで、ログの時刻を押すと録画のその場面が開きます。
              </p>
              <div className="pst-spec-sample" aria-hidden="true">
                <span className="pst-mini-time">23:41</span>
                <span className="text-sm font-bold">録画 Part1 / 1:30:00 灯台の地下</span>
              </div>
            </article>

            <article className="pst-spec">
              <div className="pst-spec-head">
                <IconCalendar width={20} height={20} aria-hidden />
                <h3 className="pst-spec-title">日程調整から共有まで</h3>
              </div>
              <p className="pst-spec-desc">
                卓メンバーでの日程調整、カレンダー購読、許可したときだけの Google
                カレンダーとの空き時間の照合に対応しています。共有範囲はメンバー限定・通過した人・公開から選べ、未通過の人にはネタバレを伏せます。X
                用の卓報告カードも作れます。
              </p>
              <div className="pst-spec-sample" aria-hidden="true">
                <IconLock width={16} height={16} aria-hidden />
                <span className="text-sm font-bold">通過した人だけに公開</span>
                <span className="pst-tile-meta">未通過の人には本文を伏せる</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="lp-sources" className="pst-hero">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="lp-sources" className="pst-display pst-h2 pst-on-dark">
            いつものシステムと道具で、そのまま。
          </h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="pst-group-label">対応システム</h3>
              <ul className="pst-pill-list mt-4" aria-label="対応システム">
                {SYSTEMS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="pst-group-label">取り込み・連携</h3>
              <ul className="pst-pill-list mt-4" aria-label="取り込める場所">
                {SOURCES.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="lp-cta" className="pst-yellow">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <h2 id="lp-cta" className="pst-display pst-h2">
            次の卓報告は、卓譜で。
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link prefetch={false} to="/home" className="pst-btn pst-btn-ink">
              使ってみる
            </Link>
            <Link prefetch={false} to="/demo" className="pst-btn pst-btn-ink-line">
              サンプルの卓を開く
            </Link>
          </div>
          <p className="pst-fine mt-8">
            卓譜は、TRPG
            を遊んでいる個人が作っている非公式のツールです。無料で、広告もありません。不具合や要望は
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

/** タイルが集まった先の、セッションのページ（サンプルの卓から作った作例） */
function SessionSheet() {
  const [filter, setFilter] = useState<"all" | "dice" | "secret">("all");

  return (
    <div className="pst-sheet mt-12">
      <div className="pst-sheet-head">
        <div className="min-w-0">
          <div className="pst-display pst-sheet-title">深淵の呼び声 第一夜</div>
          <div className="pst-tile-meta">クトゥルフ神話TRPG 7版 / 9月26日（土）20:34–00:57 / 潮騒の会</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Portrait name="みかん" file="mikan" size={32} />
          <Portrait name="白瀬怜" file="rei" size={32} />
          <Portrait name="灯堂澪" file="mio" size={32} />
          <Portrait name="桐生那津" file="natsu" size={32} />
        </div>
      </div>
      <div className="pst-sheet-body">
        <div className="pst-sheet-log">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="pst-sheet-label mb-0">ログ</div>
            <div className="pst-filter-row" role="group" aria-label="ログの表示切り替え">
              <button
                type="button"
                className={cx("pst-filter-btn", filter === "all" && "is-active")}
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                すべて
              </button>
              <button
                type="button"
                className={cx("pst-filter-btn", filter === "dice" && "is-active")}
                aria-pressed={filter === "dice"}
                onClick={() => setFilter("dice")}
              >
                ダイスだけ
              </button>
              <button
                type="button"
                className={cx("pst-filter-btn", filter === "secret" && "is-active")}
                aria-pressed={filter === "secret"}
                onClick={() => setFilter("secret")}
              >
                秘匿タブ
              </button>
            </div>
          </div>

          {filter === "all" && (
            <>
              <div className="pst-log-line">
                <span className="pst-log-time">21:03</span>
                <Portrait name="白瀬怜" file="rei" size={28} />
                <p>
                  <b>白瀬怜</b>「灯台の地下を調べます。足跡が残っていないか、よく見て」
                </p>
              </div>
              <div className="pst-log-line">
                <span className="pst-log-time">21:04</span>
                <span className="pst-log-dice">
                  <IconDice width={14} height={14} aria-hidden /> CC&lt;=70 目星 <b>04</b>
                  <span className="pst-band pst-band-crit pst-band-sm">クリティカル</span>
                </span>
              </div>
              <div className="pst-log-line is-marked">
                <span className="pst-log-time">23:41</span>
                <Portrait name="白瀬怜" file="rei" size={28} />
                <p>
                  <b>白瀬怜</b>「……この扉、内側から開けられてる」
                </p>
              </div>
              <div className="pst-note">時刻を押すと、録画のこの場面へ</div>
            </>
          )}

          {filter === "dice" && (
            <>
              <div className="pst-log-line">
                <span className="pst-log-time">21:04</span>
                <span className="pst-log-dice">
                  <IconDice width={14} height={14} aria-hidden /> CC&lt;=70 目星 <b>04</b>
                  <span className="pst-band pst-band-crit pst-band-sm">クリティカル</span>
                </span>
              </div>
              <div className="pst-log-line">
                <span className="pst-log-time">22:18</span>
                <span className="pst-log-dice">
                  <IconDice width={14} height={14} aria-hidden /> CC&lt;=60 心理学 <b>98</b>
                  <span className="pst-band pst-band-fumble pst-band-sm">ファンブル</span>
                </span>
              </div>
              <div className="pst-log-line">
                <span className="pst-log-time">23:42</span>
                <span className="pst-log-dice">
                  <IconDice width={14} height={14} aria-hidden /> 1D100&lt;=53 SAN チェック <b>68</b>
                  <span className="pst-loss-text font-bold">53→50 (−3)</span>
                </span>
              </div>
            </>
          )}

          {filter === "secret" && (
            <>
              <div className="pst-log-line is-secret">
                <span className="pst-log-time">22:05</span>
                <div>
                  <div className="pst-tile-meta pst-on-dark flex items-center gap-1">
                    <IconLock width={13} height={13} aria-hidden /> 秘匿 HO2 / 許可されたメンバーだけ表示
                  </div>
                  <p className="mt-1">
                    <b>GM みかん</b>「あなたにだけ、鐘の音が三度聞こえた」
                  </p>
                </div>
              </div>
              <div className="pst-log-line">
                <span className="pst-log-time">22:06</span>
                <Portrait name="灯堂澪" file="mio" size={28} />
                <p>
                  <b>灯堂澪</b>「……今のは、ほかの二人には聞こえていないんですね」
                </p>
              </div>
            </>
          )}
        </div>
        <div className="pst-sheet-side">
          <div>
            <div className="pst-sheet-label">関連するもの</div>
            <div className="pst-tile-rec pst-rec-inline">
              <span className="pst-play" aria-hidden>
                <IconPlayerPlay width={16} height={16} />
              </span>
              <div>
                <div className="pst-tile-meta pst-on-dark">録画 / 目次 4</div>
                <div className="text-sm font-bold">1:30:00 灯台の地下</div>
              </div>
            </div>
          </div>
          <div>
            <div className="pst-sheet-label">探索者の変化</div>
            <div className="pst-growth">
              <span>白瀬怜 SAN</span>
              <b className="pst-loss-text">53→50 (−3)</b>
              <span>灯堂澪 図書館</span>
              <b>70→76 (+6)</b>
            </div>
          </div>
          <div>
            <div className="pst-sheet-label flex items-center gap-1.5">
              <IconShare width={14} height={14} aria-hidden /> 共有とネタバレ配慮
            </div>
            <p className="text-sm leading-relaxed">
              <b>通過した人</b>だけに公開します。未通過の人には本文を伏せます。X
              用の卓報告カードもここから作れます。
            </p>
          </div>
        </div>
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
        <p>
          運営者は、予告なく本サービスの内容を変更し、または提供を中断・終了することがあります。大切な記録は、設定画面の「バックアップ」から書き出して保管してください。
        </p>
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
          記録はアカウントがある間保存します。アカウントや記録の削除を希望する場合は、下記の窓口に連絡してください。サンプルデータで試した内容は、その端末のブラウザにだけ保存されます。
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
