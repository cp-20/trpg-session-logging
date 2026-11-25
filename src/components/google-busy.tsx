/**
 * Google カレンダーの空き時間の照らし合わせ。設定（/settings）とカレンダー連携（/calendar）で同じものを使う。
 * 本人が明示的にオンにしたときだけ読む。オフが既定。
 * 読むのは「予定が入っている時間帯」とカレンダーの名前だけで、予定の件名などは読まない。
 */
import { useState } from "react";
import { IconCheck, IconX } from "./icons";
import { ProviderIcon } from "./identity";
import { FieldError, Modal, SettingRow, Toggle, cx } from "./ui";
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
import { useStore } from "../store";
import { userFacingError } from "../lib/user-error";

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

/** 何を読み、何を読まないか。許可の前に必ず見せる（開いて読む案内なので data-guide） */
export function GoogleCalendarScope() {
  const reads = ["カレンダーの名前", `予定が入っている時間帯（今日から${GOOGLE_BUSY_DAYS}日）`];
  const skips = ["予定のタイトル・説明・場所・参加者", "予定の作成・変更"];
  return (
    <div data-guide className="grid gap-5 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="eyebrow">読み取るもの</h3>
          <ul className="mt-2 space-y-1.5">
            {reads.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <IconCheck width={16} height={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="eyebrow">読み取らないもの</h3>
          <ul className="mt-2 space-y-1.5">
            {skips.map((t) => (
              <li key={t} className="flex items-start gap-2 text-ink2">
                <IconX width={16} height={16} className="mt-0.5 shrink-0" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-ink2">取り込んだ時間帯はあなたにだけ見え、オフにすると消します。</p>
    </div>
  );
}

/**
 * 設定の行と、許可・カレンダー選択のダイアログ。
 * frame="surface" は画面の面として、"plain" はダイアログの中（面を入れ子にしない）で使う。
 */
export function GoogleBusySettings({ frame = "surface" }: { frame?: "surface" | "plain" }) {
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

  /** 失敗したときの文は lib/google-calendar が「次に何をすればよいか」まで書いて返す */
  async function run(task: () => Promise<void>) {
    setWorking(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(userFacingError(e, "Google カレンダーを読めませんでした。もう一度お試しください。"));
    } finally {
      setWorking(false);
    }
  }

  const allow = () =>
    run(async () => {
      const token = await requestGoogleCalendarAccess();
      const list = await listGoogleCalendars(token);
      // 既定はメインのカレンダーだけ。祝日・誕生日などを数えて「予定あり」が増えないように
      setConsent({
        step: "choose",
        token,
        calendars: list.map((c) => ({ id: c.id, name: c.name, on: c.primary })),
      });
    });

  const importChosen = () =>
    run(async () => {
      if (consent?.step !== "choose") return;
      await fetchAndSave(consent.token, consent.calendars, new Date().toISOString());
      setConsent(null);
    });

  /** 取り込み直す（カレンダーの選択を変えたときも） */
  const resync = (calendars: CalendarChoice[]) =>
    run(async () => {
      if (!g) return;
      const token = await requestGoogleCalendarAccess();
      await fetchAndSave(token, calendars, g.consentedAt);
      setChoosing(null);
    });

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
    <>
      <div className={cx("list", frame === "surface" ? "surface" : "rounded-box border border-base-300")}>
        <SettingRow
          icon={<ProviderIcon provider="google" size={28} />}
          title="Google カレンダーの空き時間を使う"
          desc={
            g || available
              ? "カレンダーと日程調整の自分の列に、予定のある時間を出します。"
              : "ログインすると使えます。"
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
            <SettingRow title="終日の予定も数える">
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
            <SettingRow title="最後に取り込んだ日時" desc={syncedLabel ?? "まだ取り込んでいません"}>
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
          title={consent.step === "explain" ? "Google カレンダーの空き時間を使う" : "使うカレンダーを選ぶ"}
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
                  {working ? "確認中…" : "Google で許可する"}
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
                祝日・誕生日のカレンダーを入れると、空いている日も「予定あり」になります。
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
    </>
  );
}
