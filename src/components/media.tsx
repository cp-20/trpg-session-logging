/**
 * セッションに紐付く「関連するもの」（録画・録音・配信・リプレイ動画・卓報告・感想・絵など）の一覧と追加・編集。
 * 判定や見せる範囲の決まりは src/lib/session-media.ts。
 *
 * 見せ方:
 * - 再生できるもの（録画・配信・リプレイ動画）は大きな再生面・パート・目次を持つカードにする。目次を押すとその位置から再生する。
 * - それ以外（卓報告・感想・絵など）は、種類の印・タイトル・見せる範囲を 1 行に並べた一覧にする。
 * - ネタバレは未通過の人にだけ伏せる（サムネイルはぼかし、タイトルは種類名に置き換える）。
 */
import { useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  IconBook,
  IconBooks,
  IconBroadcast,
  IconEye,
  IconFileText,
  IconLayoutList,
  IconLink,
  IconLock,
  IconMessageCircle,
  IconMicrophone,
  IconMovie,
  IconNotes,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconTrophy,
  IconUsers,
  IconVideo,
  IconWorld,
} from "./icons";
import { Combobox, DateInput, Field, Menu, Modal, SectionTitle, Seg, Select, Toggle, cx } from "./ui";
import { todayStr, uid } from "../lib/format";
import {
  MEDIA_KINDS,
  MEDIA_KIND_MAP,
  MEDIA_SCOPE_LABEL,
  detectMediaLink,
  embedAt,
  expiryState,
  formatChapters,
  formatClock,
  mediaThumbnail,
  parseChapters,
  shouldHideSpoiler,
  urlAt,
  visibleMedia,
  type MediaKind,
  type MediaScope,
  type MediaViewer,
  type SessionMedia,
} from "../lib/session-media";
import type { Log, State } from "../types";
import { sessionStart, sessionDays } from "../lib/sittings";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const KIND_ICON: Record<MediaKind, Icon> = {
  recording: IconVideo,
  audio: IconMicrophone,
  stream: IconBroadcast,
  replay: IconMovie,
  log: IconFileText,
  transcript: IconLayoutList,
  photo: IconPhoto,
  report: IconNotes,
  impression: IconMessageCircle,
  trophy: IconTrophy,
  art: IconPalette,
  comic: IconBooks,
  story: IconBook,
  other: IconLink,
};

const SCOPE_ICON: Record<MediaScope, Icon> = {
  self: IconLock,
  people: IconLock,
  members: IconUsers,
  passed: IconEye,
  public: IconWorld,
};

const SCOPE_OPTIONS = (Object.keys(MEDIA_SCOPE_LABEL) as MediaScope[]).map((value) => ({
  value,
  label: MEDIA_SCOPE_LABEL[value],
}));
const KIND_OPTIONS = MEDIA_KINDS.map((d) => ({ value: d.kind, label: d.label }));

/** epoch 秒 → 日本時間の YYYY-MM-DD と HH:MM */
function jstParts(epoch: number): { date: string; time: string } {
  const d = new Date((epoch + 9 * 3600) * 1000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}
function jstEpoch(date: string, time: string): number | undefined {
  if (!date || !/^\d{1,2}:\d{2}$/.test(time)) return undefined;
  const ms = Date.parse(`${date}T${time.padStart(5, "0")}:00+09:00`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function participantIds(log: Log): string[] {
  return [log.ownerId, ...Object.keys(log.players).filter((id) => id !== log.ownerId)];
}

/* ---------- 共通の小物 ---------- */
function ScopeMeta({ m, state }: { m: SessionMedia; state: State }) {
  const Icon = SCOPE_ICON[m.scope];
  const who =
    m.scope === "people"
      ? (m.audience ?? [])
          .map((id) => state.users[id]?.name)
          .filter(Boolean)
          .join("・")
      : "";
  return (
    <span className="inline-flex items-center gap-1">
      <Icon width={13} height={13} aria-hidden />
      {m.scope === "people" && who ? `${who} だけ` : MEDIA_SCOPE_LABEL[m.scope]}
    </span>
  );
}

function ExpiryMeta({ m }: { m: SessionMedia }) {
  const e = expiryState(m, todayStr());
  if (e === "expired") return <span className="text-error">置き場所の期限切れ</span>;
  if (e === "soon") return <span className="text-error">{m.expiresAt} に消えます</span>;
  return null;
}

function ItemMenu({
  m,
  label,
  onEdit,
  onDelete,
}: {
  m: SessionMedia;
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      label={`${m.title || label} の操作`}
      items={[
        { label: "編集", icon: <IconPencil width={16} height={16} />, onSelect: onEdit },
        { label: "削除", icon: <IconTrash width={16} height={16} />, danger: true, onSelect: onDelete },
      ]}
    />
  );
}

interface ItemProps {
  m: SessionMedia;
  state: State;
  viewer: MediaViewer;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/* ---------- 再生できるもの（録画・録音・配信・リプレイ動画） ---------- */
function PlayableCard({ m, state, viewer, canEdit, onEdit, onDelete }: ItemProps) {
  const def = MEDIA_KIND_MAP[m.kind];
  const KindIcon = KIND_ICON[m.kind];
  const parts = [
    ...(m.url ? [{ url: m.url, label: undefined as string | undefined }] : []),
    ...(m.parts ?? []),
  ];
  const [part, setPart] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [playingAt, setPlayingAt] = useState<number | null>(null);
  const hidden = shouldHideSpoiler(m, viewer) && !revealed;
  const current = parts[part];
  const link = current ? detectMediaLink(current.url) : null;
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbFailed ? undefined : mediaThumbnail(current?.url);
  const chapters = (m.chapters ?? []).filter((c) => (c.part ?? 1) === part + 1);
  const title = hidden ? `${def.label}（ネタバレを含みます）` : m.title || link?.label || def.label;
  const pov = m.povUserId ? state.users[m.povUserId]?.name : undefined;

  function play(at: number) {
    if (link?.embedUrl) setPlayingAt(at);
    else if (current) window.open(urlAt(current.url, at), "_blank", "noopener,noreferrer");
  }

  return (
    <article className="surface overflow-hidden" data-media-kind={m.kind}>
      {(link?.embedUrl || thumb) && (
        <div className="relative aspect-video bg-base-200">
          {playingAt !== null && link?.embedUrl ? (
            <iframe
              key={`${part}-${playingAt}`}
              src={embedAt(link.embedUrl, playingAt)}
              aria-label={title}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className="group absolute inset-0 flex size-full items-center justify-center"
              onClick={() => (hidden ? setRevealed(true) : play(0))}
              aria-label={hidden ? "ネタバレを表示する" : `${title} を再生`}
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                  onLoad={(e) => {
                    // 存在しない動画は YouTube が 120px 幅の灰色の画像を返すので、それもアイコンに戻す
                    if (e.currentTarget.naturalWidth <= 120) setThumbFailed(true);
                  }}
                  className={cx("absolute inset-0 size-full object-cover", hidden && "scale-110 blur-xl")}
                />
              ) : (
                <KindIcon width={56} height={56} className="text-ink2" aria-hidden />
              )}
              <span className="media-play relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold">
                {hidden ? (
                  "ネタバレを表示する"
                ) : (
                  <>
                    <IconPlayerPlay width={18} height={18} aria-hidden />
                    {parts.length > 1 ? `Part${part + 1} を再生` : "再生"}
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="media-kind-mark" aria-hidden>
            <KindIcon width={18} height={18} />
          </span>
          <div className="min-w-0 flex-1">
            {current && !hidden ? (
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="break-words text-base font-bold underline-offset-2 hover:underline"
                data-user-content
              >
                {title}
              </a>
            ) : (
              <span className="break-words text-base font-bold" data-user-content>
                {title}
              </span>
            )}
            <div className="meta mt-1 text-xs">
              <span>{def.label}</span>
              {link && link.service !== "web" && <span>{link.label}</span>}
              {pov && <span>{pov} の視点</span>}
              <ScopeMeta m={m} state={state} />
              <ExpiryMeta m={m} />
            </div>
          </div>
          {hidden && !(link?.embedUrl || thumb) && (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRevealed(true)}>
              表示する
            </button>
          )}
          {canEdit && <ItemMenu m={m} label={def.label} onEdit={onEdit} onDelete={onDelete} />}
        </div>

        {!hidden && parts.length > 1 && (
          <div className="mt-3">
            <Seg
              ariaLabel="パート"
              size="sm"
              value={String(part)}
              options={parts.map((p, i) => ({ v: String(i), label: p.label || `Part${i + 1}` }))}
              onChange={(v) => {
                setPart(Number(v));
                setPlayingAt(null);
              }}
            />
          </div>
        )}

        {!hidden && chapters.length > 0 && (
          <ol className="mt-3 max-h-64 overflow-y-auto border-t border-base-300 pt-2" aria-label="目次">
            {chapters.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => play(c.at)}
                  className="row-interactive flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm"
                >
                  <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-primary">
                    {formatClock(c.at)}
                  </span>
                  <span className="min-w-0 flex-1" data-user-content>
                    {c.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {!hidden && (m.credits || m.note) && (
          <div className="mt-3 space-y-1 text-sm" data-user-content>
            {m.credits && <p className="text-xs text-ink2">{m.credits}</p>}
            {m.note && <p className="whitespace-pre-wrap leading-relaxed">{m.note}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------- それ以外（1 行の一覧） ---------- */
function LinkRow({ m, state, viewer, canEdit, onEdit, onDelete }: ItemProps) {
  const def = MEDIA_KIND_MAP[m.kind];
  const KindIcon = KIND_ICON[m.kind];
  const [revealed, setRevealed] = useState(false);
  const hidden = shouldHideSpoiler(m, viewer) && !revealed;
  const link = m.url ? detectMediaLink(m.url) : null;
  const title = hidden ? `ネタバレを含む${def.label}` : m.title || link?.label || def.label;

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5" data-media-kind={m.kind}>
      <span className="media-kind-mark" aria-hidden>
        <KindIcon width={18} height={18} />
      </span>
      <div className="min-w-0 flex-1">
        {m.url && !hidden ? (
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className="break-words text-sm font-bold underline-offset-2 hover:underline"
            data-user-content
          >
            {title}
          </a>
        ) : (
          <span className={cx("break-words text-sm font-bold", hidden && "text-ink2")} data-user-content>
            {title}
          </span>
        )}
        <div className="meta mt-0.5 text-xs">
          {!hidden && <span>{def.label}</span>}
          {link && link.service !== "web" && <span>{link.label}</span>}
          {!hidden && m.credits && <span data-user-content>{m.credits}</span>}
          <ScopeMeta m={m} state={state} />
          <ExpiryMeta m={m} />
        </div>
        {!hidden && m.note && (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed" data-user-content>
            {m.note}
          </p>
        )}
      </div>
      {hidden && (
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRevealed(true)}>
          表示する
        </button>
      )}
      {canEdit && <ItemMenu m={m} label={def.label} onEdit={onEdit} onDelete={onDelete} />}
    </li>
  );
}

/* ---------- 追加・編集 ---------- */
interface Draft {
  url: string;
  kind: MediaKind;
  kindTouched: boolean;
  title: string;
  scope: MediaScope;
  audience: string[];
  povUserId: string;
  spoiler: boolean;
  parts: string;
  chapters: string;
  startDate: string;
  startTime: string;
  expiresAt: string;
  credits: string;
  note: string;
  consent: boolean;
}

function toDraft(m: SessionMedia | null, log: Log): Draft {
  const start = m?.startedAt ?? (sessionStart(log) || undefined);
  const parts = start ? jstParts(start) : { date: sessionDays(log)[0] ?? "", time: "" };
  return {
    url: m?.url ?? "",
    kind: m?.kind ?? "recording",
    kindTouched: Boolean(m),
    title: m?.title ?? "",
    scope: m?.scope ?? "members",
    audience: m?.audience ?? [],
    povUserId: m?.povUserId ?? "",
    spoiler: m?.spoiler ?? true,
    parts: (m?.parts ?? []).map((p) => (p.label ? `${p.label} ${p.url}` : p.url)).join("\n"),
    chapters: formatChapters(m?.chapters),
    startDate: parts.date,
    startTime: m?.startedAt ? parts.time : "",
    expiresAt: m?.expiresAt ?? "",
    credits: m?.credits ?? "",
    note: m?.note ?? "",
    consent: m?.consent ?? false,
  };
}

function parseParts(text: string): { url: string; label?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*(https?:\/\/\S+)$/);
      if (!m) return null;
      return m[1] ? { url: m[2]!, label: m[1] } : { url: m[2]! };
    })
    .filter((p): p is { url: string; label?: string } => p !== null);
}

function MediaEditor({
  log,
  state,
  initial,
  onSave,
  onClose,
}: {
  log: Log;
  state: State;
  initial: SessionMedia | null;
  onSave: (m: SessionMedia) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(initial, log));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const detected = d.url ? detectMediaLink(d.url) : null;
  const def = MEDIA_KIND_MAP[d.kind];
  const people = participantIds(log).filter((id) => state.users[id]);

  function save() {
    if (d.url && !detected) return setError("URL は https:// から始まる形で入れてください。");
    if (!d.url && !d.title.trim()) return setError("URL かタイトルのどちらかを入れてください。");
    if (def.needsConsent && d.scope !== "self" && !d.consent)
      return setError("録画・録音・配信を共有するには、同卓者全員の了承が要ります。");
    if (d.scope === "people" && d.audience.length === 0) return setError("見られる人を選んでください。");
    const startedAt = def.timed ? jstEpoch(d.startDate, d.startTime) : undefined;
    const chapters = def.timed ? parseChapters(d.chapters) : [];
    const parts = parseParts(d.parts);
    const m: SessionMedia = {
      id: initial?.id ?? uid("md_"),
      kind: d.kind,
      title: d.title.trim(),
      ...(d.url ? { url: d.url.trim() } : {}),
      ...(parts.length ? { parts } : {}),
      spoiler: d.spoiler,
      scope: d.scope,
      ...(d.scope === "people" ? { audience: d.audience } : {}),
      ...(d.povUserId ? { povUserId: d.povUserId } : {}),
      ...(d.credits.trim() ? { credits: d.credits.trim() } : {}),
      ...(d.note.trim() ? { note: d.note.trim() } : {}),
      ...(chapters.length ? { chapters } : {}),
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(d.expiresAt ? { expiresAt: d.expiresAt } : {}),
      ...(def.needsConsent ? { consent: d.consent } : {}),
      addedBy: initial?.addedBy ?? state.me,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onSave(m);
  }

  return (
    <Modal
      title={initial ? "関連するものを編集" : "関連するものを追加"}
      onClose={onClose}
      wide
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {initial ? "保存" : "追加"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="URL"
          hint="YouTube・Google ドライブ・ふせったー・pixiv など。手元にしかないものは空でかまいません"
        >
          <input
            className="input input-bordered w-full"
            inputMode="url"
            placeholder="https://"
            value={d.url}
            onChange={(e) => {
              const url = e.target.value;
              const hit = detectMediaLink(url);
              setD((cur) => ({ ...cur, url, ...(hit && !cur.kindTouched ? { kind: hit.kindHint } : {}) }));
            }}
          />
        </Field>
        {detected && detected.service !== "web" && (
          <p className="-mt-2 text-xs text-ink2">{detected.label} のリンクです。</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="種類">
            <Select
              value={d.kind}
              options={KIND_OPTIONS}
              onChange={(kind) => setD((cur) => ({ ...cur, kind, kindTouched: true }))}
              className="w-full"
            />
          </Field>
          <Field label="タイトル">
            <input
              className="input input-bordered w-full"
              placeholder={detected?.label ?? def.label}
              value={d.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="見られる人">
            <Select
              value={d.scope}
              options={SCOPE_OPTIONS}
              onChange={(v) => set("scope", v)}
              className="w-full"
            />
          </Field>
          <Field label="誰の視点か" hint="秘匿 HO の視点録画など">
            <Combobox
              ariaLabel="誰の視点か"
              value={d.povUserId}
              options={[
                { value: "", label: "指定しない" },
                ...people.map((id) => ({ value: id, label: state.users[id]!.name })),
              ]}
              onChange={(v) => set("povUserId", v)}
              className="w-full"
            />
          </Field>
        </div>
        {d.scope === "people" && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">見られる人を選ぶ</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {people.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={d.audience.includes(id)}
                    onChange={(e) =>
                      set(
                        "audience",
                        e.target.checked ? [...d.audience, id] : d.audience.filter((x) => x !== id),
                      )
                    }
                  />
                  {state.users[id]!.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Toggle on={d.spoiler} onChange={(v) => set("spoiler", v)} label="ネタバレを含む" showLabel />

        {def.timed && (
          <>
            <Field
              label="パート"
              hint="2 本目以降の URL を 1 行に 1 つ。「Part2 https://…」のように名前を付けても構いません"
            >
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={d.parts}
                onChange={(e) => set("parts", e.target.value)}
              />
            </Field>
            <Field
              label="目次"
              hint="「0:00 導入」「1:23:45 戦闘」のように 1 行に 1 つ。パートが変わるところに「Part2」の行を入れます"
            >
              <textarea
                className="textarea textarea-bordered w-full font-mono text-sm"
                rows={4}
                value={d.chapters}
                onChange={(e) => set("chapters", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="録画を始めた日">
                <DateInput
                  value={d.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className="w-full"
                />
              </Field>
              <Field label="録画を始めた時刻" hint="入れると、ログの発言から録画のその場面を開けます">
                <input
                  className="input input-bordered w-full tabular-nums"
                  inputMode="numeric"
                  placeholder="21:00"
                  value={d.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="置き場所の期限" hint="ギガファイル便など、消える置き場所のとき">
            <DateInput
              value={d.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="クレジット" hint="描いた人・編集した人など">
            <input
              className="input input-bordered w-full"
              value={d.credits}
              onChange={(e) => set("credits", e.target.value)}
            />
          </Field>
        </div>
        <Field label="メモ">
          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            value={d.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        {def.needsConsent && (
          <label className="flex items-start gap-2.5 text-sm leading-relaxed">
            <input
              type="checkbox"
              className="checkbox checkbox-sm mt-0.5"
              checked={d.consent}
              onChange={(e) => set("consent", e.target.checked)}
            />
            同卓者全員から、記録すること・選んだ範囲に共有することの了承を得ています。
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
/* ---------- セクション ---------- */
export function SessionMediaSection({
  log,
  state,
  viewer,
  editable,
  onChange,
  className,
}: {
  className?: string;
  log: Log;
  state: State;
  viewer: MediaViewer;
  /** 追加・編集できるか（自分の記録として持っているとき） */
  editable: boolean;
  onChange?: (media: SessionMedia[]) => void;
}) {
  const [editing, setEditing] = useState<SessionMedia | null | "new">(null);
  const items = useMemo(() => visibleMedia(log.media, viewer), [log.media, viewer]);
  if (!editable && items.length === 0) return null;
  const all = log.media ?? [];
  const canEditItem = (m: SessionMedia) => editable && (m.addedBy === state.me || log.ownerId === state.me);
  const playable = items.filter((m) => MEDIA_KIND_MAP[m.kind].timed);
  const others = items.filter((m) => !MEDIA_KIND_MAP[m.kind].timed);
  const itemProps = (m: SessionMedia): ItemProps => ({
    m,
    state,
    viewer,
    canEdit: canEditItem(m),
    onEdit: () => setEditing(m),
    onDelete: () => onChange?.(all.filter((x) => x.id !== m.id)),
  });

  return (
    <section aria-labelledby={`media-${log.id}`} className={className}>
      <SectionTitle
        right={
          editable && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing("new")}>
              <IconPlus width={16} height={16} /> 追加
            </button>
          )
        }
      >
        <span id={`media-${log.id}`}>関連するもの</span>
      </SectionTitle>
      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="media-empty flex w-full items-center gap-4 rounded-box px-5 py-5 text-left"
        >
          <span className="flex shrink-0 -space-x-1.5 text-ink2" aria-hidden>
            {[IconVideo, IconNotes, IconPalette].map((I, i) => (
              <span key={i} className="media-kind-mark">
                <I width={18} height={18} />
              </span>
            ))}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">録画・配信・卓報告・感想・イラストを紐付ける</span>
            <span className="mt-0.5 block text-xs text-ink2">
              置き場所の URL
              を貼るだけ。目次を付けた録画は、ログの発言時刻からその場面を開けるようになります。
            </span>
          </span>
        </button>
      ) : (
        <div className="space-y-4">
          {playable.map((m) => (
            <PlayableCard key={m.id} {...itemProps(m)} />
          ))}
          {others.length > 0 && (
            <ul className="surface list">
              {others.map((m) => (
                <LinkRow key={m.id} {...itemProps(m)} />
              ))}
            </ul>
          )}
        </div>
      )}
      {editing && (
        <MediaEditor
          log={log}
          state={state}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            const exists = all.some((x) => x.id === m.id);
            onChange?.(exists ? all.map((x) => (x.id === m.id ? m : x)) : [...all, m]);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

/** ログの発言時刻から、その場面を開ける録画のリンク（見てよいものだけ） */
export function recordingLinksAt(
  log: Log,
  epochSec: number,
  viewer: MediaViewer,
): { id: string; title: string; href: string }[] {
  return visibleMedia(log.media, viewer)
    .filter((m) => MEDIA_KIND_MAP[m.kind].timed && m.url && m.startedAt !== undefined)
    .flatMap((m) => {
      const off = epochSec - m.startedAt!;
      if (off < 0 || off > 16 * 3600) return [];
      return [{ id: m.id, title: m.title || MEDIA_KIND_MAP[m.kind].label, href: urlAt(m.url!, off) }];
    });
}
