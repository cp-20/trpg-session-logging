import { useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "../lib/router";
import {
  IconChevronRight,
  IconDownload,
  IconLock,
  IconPencil,
  IconSearch,
  IconSettings,
  IconUpload,
} from "../components/icons";
import {
  EmptyState,
  Field,
  FieldError,
  LoadMore,
  Modal,
  NotFound,
  PageHead,
  SectionTitle,
  Seg,
  SettingRow,
  Toggle,
  cx,
  useVisibleCount,
} from "../components/ui";
import { Avatar, ProviderIcon, readAvatarImageFile } from "../components/identity";
import { authErrorMessage, linkXAccount, signOutAccount, unlinkXAccount } from "../lib/auth";
import { parseSavedState } from "../lib/state-schema";
import { LEGAL_LINKS } from "../lib/rights";
import { isFirebaseConfigured } from "../lib/firebase";
import {
  GOOGLE_BUSY_DAYS,
  fetchGoogleBusyRanges,
  listGoogleCalendars,
  requestGoogleCalendarAccess,
} from "../lib/google-calendar";
import { compactBusyRanges } from "../lib/schedule";
import { fmtDate, jstDate, jstTime } from "../lib/format";
import type { GoogleBusyPrefs } from "../types";
import { download, todayStr } from "../lib/time";
import { resetData, useStore } from "../store";
import { CharacterCard } from "./Characters";
import { SessionRow } from "./Sessions";
import { applyTheme, currentThemeMode, type ThemeMode } from "../lib/theme";

export { applyTheme, currentThemeMode, resolveTheme, type ThemeMode } from "../lib/theme";
export { ThemeSync } from "../components/ThemeSync";

export default function Settings() {
  const {
    state,
    update,
    authUser,
    cloudStatus,
    enterDemo,
    exportData,
    importData,
    refreshProfile,
    retrySave,
    saveError,
  } = useStore();
  const nav = useNavigate();
  const me = state.users[state.me]!;
  const [mode, setMode] = useState<ThemeMode>(currentThemeMode);
  const [demoPicker, setDemoPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 成功は画面の変化（連携状態・読み込んだ記録）で伝わるので、エラーだけを出す
  const [backupError, setBackupError] = useState<string | null>(null);

  const x = me.accounts.find((account) => account.provider === "x" && account.status === "linked");
  const google = me.accounts.find((account) => account.provider === "google");
  const discord = me.accounts.find((account) => account.provider === "discord");

  async function connectX(remove = false) {
    setBusy(true);
    setError(null);
    try {
      await (remove ? unlinkXAccount() : linkXAccount());
      refreshProfile();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      if (authUser) await signOutAccount();
      else
        update((s) => {
          s.entered = false;
        });
      nav({ to: "/" });
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const syncText = authUser
    ? cloudStatus === "saved"
      ? "記録はアカウントに保存され、どの端末からでも見られます。"
      : cloudStatus === "saving"
        ? "記録を保存しています…"
        : "まだ保存できていない記録があります。"
    : "お試し中の記録は、このブラウザだけに保存されます。";

  return (
    <div className="max-w-3xl">
      <PageHead title="設定" />

      <SectionTitle>アカウント</SectionTitle>
      <div className="surface list">
        <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
          <Avatar u={me} size={48} />
          <div className="min-w-0 grow">
            <b className="block truncate">{me.name}</b>
            <p className="truncate text-sm text-ink2">
              {authUser ? me.email || google?.displayName : "サンプルデータでお試し中"}
            </p>
          </div>
          <Link className="btn btn-sm" to={`/users/${state.me}`}>
            プロフィール
          </Link>
        </div>
        {!authUser && (
          <SettingRow title="表示する利用者" desc="サンプルの別の利用者になって、見え方を確かめられます。">
            <button className="btn btn-sm" onClick={() => setDemoPicker(true)}>
              デモ利用者を切替
            </button>
          </SettingRow>
        )}
        <SettingRow
          icon={<ProviderIcon provider="google" size={28} />}
          title="Google"
          desc={
            authUser
              ? google?.status === "linked"
                ? google.email || me.email || google.displayName || "連携済み"
                : "連携していません"
              : "サンプルでは未連携"
          }
        >
          {authUser && (
            <span className="text-sm text-ink2">{google?.status === "linked" ? "連携中" : "未連携"}</span>
          )}
        </SettingRow>
        <SettingRow
          icon={<ProviderIcon provider="discord" size={28} />}
          title="Discord"
          desc={
            discord?.status === "linked"
              ? discord.displayName || discord.username || me.name
              : authUser
                ? "連携準備中"
                : "サンプルでは未連携"
          }
        />
        <SettingRow
          icon={<ProviderIcon provider="x" size={28} />}
          title="X"
          desc={authUser ? x?.displayName || (x ? me.name : "連携していません") : "サンプルでは未連携"}
        >
          {authUser && (
            <button className="btn btn-sm" disabled={busy} onClick={() => connectX(Boolean(x))}>
              {busy ? "接続中…" : x ? "連携を解除" : "連携する"}
            </button>
          )}
        </SettingRow>
        <SettingRow title={authUser ? "ログアウト" : "お試しを終える"}>
          <button className="btn btn-sm" disabled={busy} onClick={signOut}>
            {authUser ? "ログアウト" : "最初の画面へ"}
          </button>
        </SettingRow>
      </div>
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <SectionTitle>表示</SectionTitle>
      <div className="surface list">
        <SettingRow title="外観" desc="「端末に合わせる」は OS のライト・ダーク設定に従います。">
          <Seg<ThemeMode>
            ariaLabel="外観"
            value={mode}
            onChange={(value) => {
              setMode(value);
              applyTheme(value);
            }}
            options={[
              { v: "light", label: "ライト" },
              { v: "system", label: "端末に合わせる" },
              { v: "dark", label: "ダーク" },
            ]}
          />
        </SettingRow>
      </div>

      <SectionTitle>プライバシー</SectionTitle>
      <div className="surface list">
        <SettingRow
          title="プロフィールを公開"
          desc="オフにすると、ほかの人からプロフィール・キャラクター・参加セッションが見えなくなります。"
        >
          <Toggle
            label="プロフィールを公開"
            on={me.profilePublic !== false}
            onChange={(value) =>
              update((s) => {
                s.users[s.me]!.profilePublic = value;
              })
            }
          />
        </SettingRow>
        <SettingRow
          title="共有ページで名前を隠す"
          desc="参加したセッションの共有ページに、あなたの名前を出しません。"
        >
          <Toggle
            label="共有ページで名前を隠す"
            on={state.prefs.hideSelfOnShare}
            onChange={(value) =>
              update((s) => {
                s.prefs.hideSelfOnShare = value;
                Object.values(s.logs).forEach((log) => {
                  if (log.players[s.me]) log.players[s.me]!.hidden = value;
                });
              })
            }
          />
        </SettingRow>
      </div>

      <GoogleCalendarSettings />

      <SectionTitle sub={syncText}>データ</SectionTitle>
      <div className="surface list">
        <SettingRow
          title="バックアップ"
          desc="すべての記録を1つのファイルに保存したり、保存したファイルから戻したりします。"
        >
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-sm"
              onClick={() => {
                download(`takufu-data-${todayStr()}.json`, exportData());
              }}
            >
              <IconDownload width={16} height={16} /> 書き出す
            </button>
            <label className="btn btn-sm">
              <IconUpload width={16} height={16} /> 読み込む
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label="記録を読み込む"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setBackupError(null);
                  try {
                    const imported = parseSavedState(await file.text());
                    if (!imported) {
                      setBackupError("卓譜の記録として読み込めませんでした。ファイルを確認してください。");
                      return;
                    }
                    if (authUser && imported.me !== authUser.uid) {
                      setBackupError("このアカウントの記録を選んでください。");
                      return;
                    }
                    importData(imported);
                  } catch {
                    setBackupError("ファイルを読み込めませんでした。もう一度お試しください。");
                  } finally {
                    input.value = "";
                  }
                }}
              />
            </label>
          </div>
        </SettingRow>
        {authUser && saveError && (
          <SettingRow title="保存できていない記録" desc={saveError}>
            <button className="btn btn-sm" onClick={retrySave}>
              もう一度保存
            </button>
          </SettingRow>
        )}
        {!authUser && (
          <SettingRow title="サンプルを初期状態に戻す" desc="このブラウザで加えた変更をすべて消します。">
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmReset(true)}>
              初期状態に戻す
            </button>
          </SettingRow>
        )}
      </div>
      {backupError && (
        <p role="alert" className="mt-2 text-sm text-error">
          {backupError}
        </p>
      )}

      <SectionTitle>このサービスについて</SectionTitle>
      <nav aria-label="このサービスについて" className="surface list">
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="row-interactive flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-bold sm:px-5"
          >
            {l.label}
            <IconChevronRight width={16} height={16} className="text-ink2" aria-hidden />
          </Link>
        ))}
      </nav>

      {demoPicker && (
        <Modal title="表示する利用者" onClose={() => setDemoPicker(false)}>
          <div className="space-y-1">
            {["u_mikan", "u_sora", "u_kai", "u_hina", "u_rin"]
              .filter((id) => state.users[id])
              .map((id) => (
                <button
                  key={id}
                  className={cx(
                    "w-full flex items-center gap-3.5 p-3 text-left rounded-lg transition-colors hover:bg-base-200",
                    id === state.me && "bg-primary/10",
                  )}
                  onClick={() => {
                    enterDemo(id);
                    setDemoPicker(false);
                  }}
                >
                  <Avatar u={state.users[id]!} size={36} />
                  <span className="font-semibold text-sm grow">{state.users[id]!.name}</span>
                  {id === state.me && <span className="text-xs text-primary">表示中</span>}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {confirmReset && (
        <Modal
          title="サンプルを初期状態に戻しますか？"
          onClose={() => setConfirmReset(false)}
          foot={
            <>
              <button className="btn btn-quiet" onClick={() => setConfirmReset(false)}>
                キャンセル
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  resetData();
                  location.reload();
                }}
              >
                初期状態に戻す
              </button>
            </>
          }
        >
          <p className="text-sm leading-7">
            このブラウザで加えた変更が消えます。必要な記録は、先にダウンロードしてください。
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ================= Google カレンダーの空き時間 =================
 * 本人が明示的にオンにしたときだけ読む。オフが既定。
 * 読むのは「予定が入っている時間帯」とカレンダーの名前だけで、予定の件名などは読まない。
 */

type CalendarChoice = GoogleBusyPrefs["calendars"][number];

function CalendarChooser({
  calendars,
  onChange,
}: {
  calendars: CalendarChoice[];
  onChange: (next: CalendarChoice[]) => void;
}) {
  return (
    <ul className="list rounded-box border border-base-300" aria-label="照らし合わせに使うカレンダー">
      {calendars.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
          <Toggle
            label={`${c.name}を使う`}
            on={c.on}
            onChange={(on) => onChange(calendars.map((x) => (x.id === c.id ? { ...x, on } : x)))}
          />
        </li>
      ))}
    </ul>
  );
}

/** 何を読み、何を保存するか。許可の前に必ず見せる */
function GoogleCalendarScope() {
  return (
    <dl className="grid gap-y-3 text-sm leading-relaxed">
      <div>
        <dt className="font-semibold">読み取るもの</dt>
        <dd className="text-ink2">
          カレンダーの名前の一覧と、選んだカレンダーの今日から{GOOGLE_BUSY_DAYS}
          日間の「予定が入っている時間帯」。
        </dd>
      </div>
      <div>
        <dt className="font-semibold">読み取らないもの</dt>
        <dd className="text-ink2">予定のタイトル・説明・場所・参加者。予定の作成や変更もしません。</dd>
      </div>
      <div>
        <dt className="font-semibold">保存するもの</dt>
        <dd className="text-ink2">
          予定が入っている時間帯と、カレンダーの名前。あなたのアカウントにだけ保存し、ほかの人には見せません。Google
          の許可はその場の取り込みにだけ使い、保存しません。オフにすると保存した時間帯を消します。
        </dd>
      </div>
      <div>
        <dt className="font-semibold">使い方</dt>
        <dd className="text-ink2">
          日程調整の候補の時間（開始から長さぶん）と重なるときだけ「自分の予定あり」と出します。同じ日でも時間が重ならなければ出しません。
        </dd>
      </div>
    </dl>
  );
}

function GoogleCalendarSettings() {
  const { state, update, authUser } = useStore();
  const g = state.prefs.googleBusy;
  const available = isFirebaseConfigured && Boolean(authUser);
  const [consent, setConsent] = useState<
    null | { step: "explain" } | { step: "choose"; token: string; calendars: CalendarChoice[] }
  >(null);
  const [choosing, setChoosing] = useState<CalendarChoice[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchAndSave(token: string, calendars: CalendarChoice[], consentedAt: string) {
    const ids = calendars.filter((c) => c.on).map((c) => c.id);
    const ranges = compactBusyRanges(await fetchGoogleBusyRanges(token, ids), Date.now());
    update((s) => {
      s.prefs.googleBusy = {
        consentedAt,
        calendars,
        countAllDay: s.prefs.googleBusy?.countAllDay ?? false,
        ranges,
        syncedAt: new Date().toISOString(),
      };
    });
  }

  async function allow() {
    setWorking(true);
    setError(null);
    try {
      const token = await requestGoogleCalendarAccess();
      const list = await listGoogleCalendars(token);
      // 既定はメインのカレンダーだけ。祝日・誕生日などを数えて「予定あり」が増えないように
      setConsent({
        step: "choose",
        token,
        calendars: list.map((c) => ({ id: c.id, name: c.name, on: c.primary })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google カレンダーに接続できませんでした。");
    } finally {
      setWorking(false);
    }
  }

  async function importChosen() {
    if (consent?.step !== "choose") return;
    setWorking(true);
    setError(null);
    try {
      await fetchAndSave(consent.token, consent.calendars, new Date().toISOString());
      setConsent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google カレンダーの予定を取得できませんでした。");
    } finally {
      setWorking(false);
    }
  }

  /** 取り込み直す（カレンダーの選択を変えたときも） */
  async function resync(calendars: CalendarChoice[]) {
    if (!g) return;
    setWorking(true);
    setError(null);
    try {
      const token = await requestGoogleCalendarAccess();
      await fetchAndSave(token, calendars, g.consentedAt);
      setChoosing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google カレンダーの予定を取得できませんでした。");
    } finally {
      setWorking(false);
    }
  }

  function saveChoice(calendars: CalendarChoice[]) {
    if (!g) return;
    const fetched = new Set(g.ranges.map((r) => r.calendarId));
    const wasOn = new Set(g.calendars.filter((c) => c.on).map((c) => c.id));
    const added = calendars.some((c) => c.on && !wasOn.has(c.id) && !fetched.has(c.id));
    if (added) {
      void resync(calendars);
      return;
    }
    const on = new Set(calendars.filter((c) => c.on).map((c) => c.id));
    update((s) => {
      const cur = s.prefs.googleBusy;
      if (!cur) return;
      cur.calendars = calendars;
      cur.ranges = cur.ranges.filter((r) => on.has(r.calendarId));
    });
    setChoosing(null);
  }

  function turnOff() {
    update((s) => {
      delete s.prefs.googleBusy;
    });
  }

  const onNames = g?.calendars.filter((c) => c.on).map((c) => c.name) ?? [];
  const syncedMs = g?.syncedAt ? Date.parse(g.syncedAt) : NaN;
  const syncedLabel = Number.isFinite(syncedMs)
    ? `${fmtDate(jstDate(syncedMs / 1000))} ${jstTime(syncedMs / 1000)}`
    : null;

  return (
    // SectionTitle は先頭の子だと上の余白が消えるので、区画の余白はここで持つ
    <section id="google-calendar" aria-labelledby="settings-google-calendar" className="mt-10">
      <SectionTitle>
        <span id="settings-google-calendar">カレンダー</span>
      </SectionTitle>
      <div className="surface list">
        <SettingRow
          icon={<ProviderIcon provider="google" size={28} />}
          title="Google カレンダーの空き時間を使う"
          desc={
            g
              ? "日程調整の候補と時間が重なると「自分の予定あり」と出します。オフにすると取り込んだ時間帯を消します。"
              : !available
                ? "お試し中は使えません（ログインが必要）。オンにするまで Google カレンダーは読み取りません。"
                : "日程調整の候補と自分の予定が重なるかを確かめます。オンにすると、読み取る内容の説明が先に出ます。"
          }
        >
          <Toggle
            label="Google カレンダーの空き時間を使う"
            on={Boolean(g)}
            disabled={!available && !g}
            onChange={(on) => {
              setError(null);
              if (on) setConsent({ step: "explain" });
              else turnOff();
            }}
          />
        </SettingRow>
        {g && (
          <>
            <SettingRow
              title="使うカレンダー"
              desc={onNames.length > 0 ? onNames.join("、") : "選んでいません"}
            >
              <button type="button" className="btn btn-sm" onClick={() => setChoosing(g.calendars)}>
                選ぶ
              </button>
            </SettingRow>
            <SettingRow
              title="終日の予定も数える"
              desc="オフのときは、旅行や記念日のような終日の予定では「自分の予定あり」と出しません。"
            >
              <Toggle
                label="終日の予定も数える"
                on={g.countAllDay}
                onChange={(on) =>
                  update((s) => {
                    if (s.prefs.googleBusy) s.prefs.googleBusy.countAllDay = on;
                  })
                }
              />
            </SettingRow>
            <SettingRow
              title="取り込み直す"
              desc={
                syncedLabel
                  ? `最後に取り込んだのは ${syncedLabel}。予定を変えたら取り込み直してください。`
                  : undefined
              }
            >
              <button
                type="button"
                className="btn btn-sm"
                disabled={working || !available}
                onClick={() => void resync(g.calendars)}
              >
                {working ? "取り込み中…" : "取り込み直す"}
              </button>
            </SettingRow>
          </>
        )}
      </div>
      {error && !consent && !choosing && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      {consent && (
        <Modal
          title="Google カレンダーの空き時間を使う"
          onClose={() => setConsent(null)}
          foot={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setConsent(null)}>
                キャンセル
              </button>
              {consent.step === "explain" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={working}
                  onClick={() => void allow()}
                >
                  {working ? "接続中…" : "Google で許可する"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={working || !consent.calendars.some((c) => c.on)}
                  onClick={() => void importChosen()}
                >
                  {working ? "取り込み中…" : "このカレンダーで使う"}
                </button>
              )}
            </>
          }
        >
          {consent.step === "explain" ? (
            <GoogleCalendarScope />
          ) : (
            <>
              <p className="mb-3 text-sm text-ink2">
                照らし合わせに使うカレンダーを選んでください。祝日や誕生日のカレンダーを入れると、遊べる日まで「予定あり」になります。
              </p>
              <CalendarChooser
                calendars={consent.calendars}
                onChange={(calendars) => setConsent({ ...consent, calendars })}
              />
            </>
          )}
          <FieldError text={error} />
        </Modal>
      )}

      {choosing && (
        <Modal
          title="使うカレンダー"
          onClose={() => setChoosing(null)}
          foot={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setChoosing(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={working || !choosing.some((c) => c.on)}
                onClick={() => saveChoice(choosing)}
              >
                保存
              </button>
            </>
          }
        >
          <CalendarChooser calendars={choosing} onChange={setChoosing} />
          <FieldError text={error} />
        </Modal>
      )}
    </section>
  );
}

/* ================= ユーザー詳細ページ ================= */
const USER_CHAR_PAGE = 6;
const USER_CHAR_STEP = 12;
const USER_LOG_PAGE = 10;
const USER_LOG_STEP = 20;

export function UserDetail() {
  const { id } = useParams<{ id?: string }>();
  /* 別の人のページへ移ったら、編集中の内容・検索・表示件数をすべて最初に戻す */
  return <UserDetailView key={id ?? ""} id={id} />;
}

function UserDetailView({ id }: { id: string | undefined }) {
  const { state, update } = useStore();
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [imageDraft, setImageDraft] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [charQ, setCharQ] = useState("");
  const deferredCharQ = useDeferredValue(charQ);
  const [charCount, setCharCount] = useVisibleCount(USER_CHAR_PAGE, [deferredCharQ]);
  const [logCount, setLogCount] = useState(USER_LOG_PAGE);

  const user = state.users[id ?? ""];
  const chars = useMemo(
    () => (user ? Object.values(state.characters).filter((c) => c.ownerId === user.id) : []),
    [user, state.characters],
  );
  const filteredChars = useMemo(() => {
    const q = deferredCharQ.trim().toLowerCase();
    if (!q) return chars;
    return chars.filter((c) => (c.name + c.archetype + c.tags.join()).toLowerCase().includes(q));
  }, [chars, deferredCharQ]);
  const logs = useMemo(
    () =>
      user
        ? Object.values(state.logs)
            .filter((l) => l.ownerId === user.id || l.players[user.id])
            .sort((a, b) => b.t0 - a.t0)
        : [],
    [user, state.logs],
  );
  const isMe = user?.id === state.me;
  const together = useMemo(
    () => (isMe || !user ? [] : logs.filter((l) => l.players[state.me] || l.ownerId === state.me)),
    [isMe, user, logs, state.me],
  );
  const shownLogs = isMe ? logs : together.length > 0 ? together : logs;

  if (!user) return <NotFound what="ユーザー" />;

  if (!isMe && user.profilePublic === false) {
    return (
      <div className="max-w-4xl">
        <PageHead lead={<Avatar u={user} size={64} />} title={user.name} />
        <div className="surface">
          <EmptyState kind="permission" title="プロフィールは非公開です" />
        </div>
      </div>
    );
  }

  const shownChars = filteredChars.slice(0, charCount);
  const visibleLogs = shownLogs.slice(0, logCount);

  return (
    <div className="max-w-4xl">
      <PageHead
        lead={<Avatar u={user} size={64} />}
        title={user.name}
        sub={
          <>
            {user.bio && (
              <p data-user-content className="text-base-content">
                {user.bio}
              </p>
            )}
            {isMe && user.profilePublic === false && (
              <p className="mt-1 inline-flex items-center gap-1">
                <IconLock width={14} height={14} aria-hidden /> プロフィールは非公開です
              </p>
            )}
          </>
        }
        actions={
          isMe ? (
            <>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setNameDraft(user.name);
                  setBioDraft(user.bio ?? "");
                  setImageDraft(user.image ?? "");
                  setImageError(null);
                  setProfileError(null);
                  setEditingProfile(true);
                }}
              >
                <IconPencil width={16} height={16} /> プロフィールを編集
              </button>
              <Link className="btn" to="/settings">
                <IconSettings width={16} height={16} /> 設定
              </Link>
            </>
          ) : undefined
        }
      />

      {isMe && editingProfile && (
        <Modal
          title="プロフィールを編集"
          onClose={() => setEditingProfile(false)}
          foot={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setEditingProfile(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const trimmedName = nameDraft.trim();
                  if (!trimmedName) {
                    setProfileError("表示名を入力してください");
                    return;
                  }
                  update((s) => {
                    const target = s.users[s.me]!;
                    target.name = trimmedName;
                    target.bio = bioDraft.trim() || undefined;
                    target.image = imageDraft || undefined;
                  });
                  setEditingProfile(false);
                }}
              >
                保存
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar u={{ ...user, image: imageDraft || undefined }} size={56} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn btn-sm cursor-pointer">
                  画像を選ぶ
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="プロフィール画像を選ぶ"
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      setImageError(null);
                      try {
                        const compressed = await readAvatarImageFile(file, {
                          maxSize: 128,
                          maxChars: 3800,
                        });
                        setImageDraft(compressed);
                      } catch (err) {
                        setImageError(err instanceof Error ? err.message : "画像を読み込めませんでした");
                      } finally {
                        input.value = "";
                      }
                    }}
                  />
                </label>
                {imageDraft && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setImageDraft("");
                      setImageError(null);
                    }}
                  >
                    初期アイコンに戻す
                  </button>
                )}
              </div>
            </div>
            <FieldError text={imageError} />

            <Field label="表示名" noMargin>
              <input
                id="user-name-input"
                className={cx("input w-full", profileError && "input-error")}
                aria-invalid={profileError ? "true" : undefined}
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  if (profileError) setProfileError(null);
                }}
              />
              <FieldError text={profileError} />
            </Field>

            <Field label="自己紹介" noMargin>
              <textarea
                id="user-bio-input"
                className="textarea w-full text-sm leading-relaxed"
                rows={3}
                placeholder="好きなシステムや遊ぶ時間帯など"
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      <SectionTitle
        right={
          chars.length > USER_CHAR_PAGE ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="input input-sm flex w-44 items-center gap-1.5">
                <IconSearch width={14} height={14} className="shrink-0 opacity-50" aria-hidden />
                <input
                  type="search"
                  className="min-w-0 grow"
                  placeholder="キャラを検索"
                  aria-label="キャラクターを検索"
                  value={charQ}
                  onChange={(e) => setCharQ(e.target.value)}
                />
              </label>
              {isMe && (
                <Link className="btn btn-quiet btn-sm" to="/characters">
                  すべて見る
                </Link>
              )}
            </div>
          ) : undefined
        }
      >
        キャラクター
      </SectionTitle>
      {chars.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind="first"
            title={isMe ? "キャラクターはまだいません" : "公開しているキャラクターはいません"}
            action={
              isMe ? (
                <Link className="btn" to="/characters">
                  キャラクターを取り込む
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : filteredChars.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind="filtered"
            action={
              <button type="button" className="btn btn-sm" onClick={() => setCharQ("")}>
                検索を解除
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shownChars.map((c) => (
              <CharacterCard key={c.id} c={c} />
            ))}
          </div>
          <LoadMore
            shown={shownChars.length}
            total={filteredChars.length}
            step={USER_CHAR_STEP}
            onMore={() => setCharCount((n) => n + USER_CHAR_STEP)}
          />
        </>
      )}

      <SectionTitle
        right={
          isMe && shownLogs.length > USER_LOG_PAGE ? (
            <Link className="btn btn-quiet btn-sm" to="/sessions">
              すべて見る
            </Link>
          ) : undefined
        }
      >
        {isMe ? "参加したセッション" : together.length > 0 ? "一緒に遊んだセッション" : "参加したセッション"}
      </SectionTitle>
      {shownLogs.length === 0 ? (
        <div className="surface">
          <EmptyState kind="first" title="セッションはまだありません" />
        </div>
      ) : (
        <>
          <div className="surface list">
            {visibleLogs.map((l) => (
              <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} showKp={false} />
            ))}
          </div>
          <LoadMore
            shown={visibleLogs.length}
            total={shownLogs.length}
            step={USER_LOG_STEP}
            onMore={() => setLogCount((n) => n + USER_LOG_STEP)}
          />
        </>
      )}
    </div>
  );
}
