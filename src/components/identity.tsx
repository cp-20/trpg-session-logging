/**
 * 人・キャラクター・発言者の表示（顔アイコン、顔の重なり、ブランドアイコン、参加者の選択）。
 */
import { memo, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
const boothIconUrl = "/booth-icon.png";
const taltoIconUrl = "/talto-icon.png";
import { identiconDataUri } from "../lib/identicon";
import { memberCandidates } from "../lib/people";
import { speakerRoleOptions } from "../lib/roles";
import type { Character, MsgKind, Provider, State, User } from "../types";
import {
  IconBrandX,
  IconChevronDown,
  IconDiscord,
  IconGoogle,
  IconUpload,
  IconUserPlus,
  IconX,
} from "./icons";
import { Combobox, Select, SysBadge, cx } from "./ui";
import { Link } from "../lib/router";
import { SYSTEMS } from "../data/systems";
import { fmtDateShort } from "../lib/time";
import { carriedValues, lastPlayed } from "../lib/character-growth";
import type { ComboboxOption } from "./ui";
import { userFacingError } from "../lib/user-error";

/* ---------- NPC の見本の顔（選べるプリセット） ---------- */
const portraitUriCache = new Map<string, string>();

function setBoundedUriCache(cache: Map<string, string>, key: string, value: string): string {
  if (cache.size >= 500) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function fallbackPortraitDataUri(name: string, color: string, seedId = ""): string {
  const cacheKey = `${name}\0${color}\0${seedId}`;
  const hit = portraitUriCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const idx = hashName(name) % 4;
  const hairColors = ["#3a2820", "#282320", "#593828", "#42322b"];
  const bgColors = ["#f3e3d3", "#e5ece2", "#ebe2d5", "#f0deda"];
  const hair = hairColors[idx]!;
  const bg = bgColors[idx]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-seed="${seedId}">
    <rect width="100" height="100" rx="50" fill="${bg}"/>
    <circle cx="50" cy="40" r="26" fill="${hair}"/>
    <path d="M18 98 C20 74 34 68 50 68 C66 68 80 74 82 98 Z" fill="${color}"/>
    <path d="M42 68 L50 80 L58 68 Z" fill="#fbf6ef"/>
    <ellipse cx="50" cy="46" rx="19" ry="20" fill="#f5dcc4"/>
    <circle cx="42" cy="46" r="2.3" fill="#2c221d"/>
    <circle cx="58" cy="46" r="2.3" fill="#2c221d"/>
    <path d="M46 55 Q50 57.5 54 55" stroke="#8c5843" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M25 39 C30 20 70 20 75 39 C66 29 56 28 50 34 C44 28 34 29 25 39 Z" fill="${hair}"/>
  </svg>`;
  return setBoundedUriCache(
    portraitUriCache,
    cacheKey,
    `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim().replace(/\s+/g, " "))}`,
  );
}

export const PRESET_NPC_ICONS: readonly { id: string; label: string; src: string }[] = [
  {
    id: "npc-butler",
    label: "NPC: 案内人・執事",
    src: fallbackPortraitDataUri("案内人", "#4b433b", "npc-butler"),
  },
  {
    id: "npc-scholar",
    label: "NPC: 教授・研究者",
    src: fallbackPortraitDataUri("教授", "#5c6848", "npc-scholar"),
  },
  {
    id: "npc-detective",
    label: "NPC: 探偵・協力者",
    src: fallbackPortraitDataUri("探偵", "#a45332", "npc-detective"),
  },
  {
    id: "npc-mystery",
    label: "NPC: 謎の人物",
    src: fallbackPortraitDataUri("謎の人物", "#5b4868", "npc-mystery"),
  },
];

/** 人の顔。画像がなければ、変わらない ID から作った人の姿（src/lib/identicon.ts）。頭文字は使わない */
export function userAvatarSrc(u: User): string {
  return u.image || identiconDataUri(u.handle ?? u.id, "user");
}

/** キャラクターの顔。画像がなければ、ID から作った人の姿（和柄の地） */
export function characterAvatarSrc(c: Character): string {
  return c.image || identiconDataUri(c.id, "character");
}

export function resolveSpeakerAvatarSrc(
  sp: string,
  kind: MsgKind,
  speakerIcons: Record<string, string> | undefined,
  state: Pick<State, "characters" | "users">,
  indexes?: { charByName: Map<string, Character>; userByName: Map<string, User> },
): string {
  const explicit = speakerIcons?.[sp];
  if (explicit) return explicit;
  const matchedChar = indexes
    ? indexes.charByName.get(sp)
    : Object.values(state.characters).find((c) => c.name === sp);
  if (matchedChar) return characterAvatarSrc(matchedChar);
  const matchedUser = indexes
    ? indexes.userByName.get(sp)
    : Object.values(state.users).find((u) => u.name === sp);
  if (matchedUser) return userAvatarSrc(matchedUser);
  // 誰とも結び付かない発言者は、ログの中で変わらない発言者名を種にする
  if (kind === "KP" || kind === "GM") return identiconDataUri(sp, "user");
  return identiconDataUri(sp, "character");
}

/* ---------- アバター ---------- */
export function Avatar({ u, size = 32 }: { u: User; size?: number }) {
  const src = userAvatarSrc(u);
  return (
    <img
      src={src}
      alt={u.name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="rounded-full object-cover shrink-0 border border-base-300/80 bg-base-200"
      style={{ width: size, height: size }}
    />
  );
}

export function CharAvatar({ c, size = 44 }: { c: Character; size?: number }) {
  const src = characterAvatarSrc(c);
  return (
    <img
      src={src}
      alt={c.name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="rounded-full object-cover shrink-0 border border-base-300/80 bg-base-200"
      style={{ width: size, height: size }}
    />
  );
}

/* ---------- ブランドアイコン ---------- */
export function ProviderIcon({ provider, size = 20 }: { provider: Provider; size?: number }) {
  const glyph = Math.round(size * 0.58);
  const chip = (bg: string, children: ReactNode, border?: string) => (
    <span
      className="inline-flex items-center justify-center flex-none shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: bg,
        border,
        overflow: "hidden",
      }}
    >
      {children}
    </span>
  );
  if (provider === "google") {
    return chip("#ffffff", <IconGoogle width={glyph} height={glyph} />, "1px solid rgba(128,128,128,.3)");
  }
  if (provider === "discord") {
    return chip("#5865F2", <IconDiscord width={glyph} height={glyph} style={{ color: "#fff" }} />);
  }
  if (provider === "x") {
    return chip(
      "#000000",
      <IconBrandX width={glyph} height={glyph} style={{ color: "#fff" }} />,
      "1px solid rgba(128,128,128,.45)",
    );
  }
  if (provider === "booth") {
    return (
      <img
        src={boothIconUrl}
        alt=""
        width={size}
        height={size}
        className="object-cover flex-none shrink-0 rounded-full"
      />
    );
  }
  return (
    <img
      src={taltoIconUrl}
      alt=""
      width={size}
      height={size}
      className="object-cover flex-none shrink-0 rounded-full"
    />
  );
}

/* ---------- 参加者の選択 ----------
 * 人を名前で検索させない（P14）。候補は自分の卓のメンバー（`memberCandidates`）か、呼び出し側が渡す quickIds だけ。
 * 卓にいない人は、卓の招待リンクで加わってもらう
 */
export function PlayerPicker({
  state,
  selected,
  onChange,
  quickIds,
  quickLabel = "卓のメンバー",
  otherLabel = "ほかの卓の人を追加",
  fixedIds,
  fixedLabel = "自分",
  exclude,
  tableId,
}: {
  state: State;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** ボタンで並べる候補（省略時は tableId の卓のメンバー） */
  quickIds?: string[];
  quickLabel?: string;
  /** 卓にいない人（自分のほかの卓のメンバー）を足す欄の名前 */
  otherLabel?: string;
  /** 外せない固定メンバー（卓作成者本人など）をリスト先頭に表示する */
  fixedIds?: string[];
  fixedLabel?: string;
  exclude?: string[];
  tableId?: string;
  /** @deprecated 名前の検索はやめた（P14）。渡しても使わない */
  placeholder?: string;
}) {
  const blockedIds = useMemo(() => {
    const s = new Set<string>(selected);
    for (const id of fixedIds ?? []) s.add(id);
    for (const id of exclude ?? []) s.add(id);
    return s;
  }, [selected, fixedIds, exclude]);

  const quick = useMemo(
    () =>
      (quickIds ?? (tableId ? (state.tables[tableId]?.memberIds ?? []) : [])).filter(
        (id) => state.users[id] && !blockedIds.has(id),
      ),
    [quickIds, state, tableId, blockedIds],
  );
  /* この卓にいない人は、どの卓の人かを見出しにして選ぶ。だれの並びか分からないボタンを並べない（P5） */
  const others = useMemo<ComboboxOption[]>(() => {
    const listed = new Set([...quick, ...blockedIds, state.me]);
    return memberCandidates(state, tableId)
      .filter((id) => state.users[id] && !listed.has(id))
      .map((id) => ({
        value: id,
        label: state.users[id]!.name,
        hint: state.users[id]!.handle ? `@${state.users[id]!.handle}` : undefined,
        group: Object.values(state.tables).find(
          (t) => t.id !== tableId && t.memberIds.includes(id) && t.memberIds.includes(state.me),
        )?.name,
      }))
      .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "", "ja"));
  }, [state, tableId, quick, blockedIds]);
  const fixedUsers = useMemo(
    () => (fixedIds ?? []).map((id) => state.users[id]).filter((u): u is User => Boolean(u)),
    [fixedIds, state.users],
  );
  const selectedUsers = useMemo(
    () =>
      selected
        .filter((id) => !(fixedIds ?? []).includes(id))
        .map((id) => state.users[id])
        .filter((u): u is User => Boolean(u)),
    [selected, fixedIds, state.users],
  );

  return (
    <div>
      {quick.length > 0 && (
        <div role="group" aria-label={quickLabel}>
          <div className="mb-1.5 text-xs font-semibold text-ink2">{quickLabel}</div>
          <div className="flex flex-wrap gap-2">
            {quick.map((id) => {
              const u = state.users[id]!;
              return (
                <button
                  key={id}
                  type="button"
                  className="btn btn-sm gap-2 font-medium"
                  aria-label={`${u.name}を追加`}
                  onClick={() => onChange([...selected, id])}
                >
                  <Avatar u={u} size={20} />
                  <span>{u.name}</span>
                  <IconUserPlus width={14} height={14} className="opacity-60" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <Combobox
          size="sm"
          ariaLabel={otherLabel}
          className={cx("w-full sm:max-w-sm", quick.length > 0 && "mt-3")}
          value=""
          onChange={(id) => id && onChange([...selected, id])}
          options={others}
          placeholder={otherLabel}
        />
      )}

      {(fixedUsers.length > 0 || selectedUsers.length > 0) && (
        <ul
          className={cx(
            "list rounded-box border border-base-300",
            quick.length + others.length > 0 && "mt-3",
          )}
        >
          {fixedUsers.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2 pl-3 pr-3">
              <Avatar u={u} size={26} />
              <span className="grow text-sm font-semibold">{u.name}</span>
              <span className="text-xs text-ink2">{fixedLabel}</span>
            </li>
          ))}
          {selectedUsers.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
              <Avatar u={u} size={26} />
              <span className="grow text-sm font-semibold">{u.name}</span>
              <button
                type="button"
                aria-label={`${u.name}を参加者から外す`}
                className="icon-btn"
                onClick={() => onChange(selected.filter((x) => x !== u.id))}
              >
                <IconX width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 人の名前と ID（@handle）。名前で探させない代わりに、同じ名前の人を ID で見分ける */
export function UserName({ u, className }: { u: User; className?: string }) {
  return (
    <span className={cx("min-w-0", className)}>
      <span className="truncate font-semibold">{u.name}</span>
      {u.handle && <span className="ml-1.5 truncate text-sm font-normal text-ink2">@{u.handle}</span>}
    </span>
  );
}

/**
 * 画像の欄（人・卓の画像）。いまの画像を 1 つだけ見せ、選ぶとその場で置き換える（前の画像に戻す手順は持たない）。
 * 画像そのものを押しても選べる。上げた画像は正方形に切り抜いて縮める。value が空なら生成画像
 */
export function ImageUploadField({
  value,
  onChange,
  render,
  label,
  maxChars = 3800,
  choices = [],
}: {
  value: string;
  onChange: (next: string) => void;
  /** その画像での見た目（"" なら生成画像） */
  render: (image: string) => ReactNode;
  /** 欄の名前（読み上げ用）。例: 「アイコン」 */
  label: string;
  maxChars?: number;
  /** 上げる代わりに使える画像（Google の画像など） */
  choices?: readonly { value: string; label: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const others = choices.filter((c) => c.value !== value);
  return (
    <div>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="relative shrink-0 rounded-2xl transition-opacity hover:opacity-80"
          onClick={() => inputRef.current?.click()}
        >
          {render(value)}
        </button>
        <div className="flex flex-wrap gap-2">
          <label className="btn btn-sm cursor-pointer">
            <IconUpload width={16} height={16} aria-hidden />
            画像を変更
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`${label}の画像を変更`}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                setError(null);
                try {
                  onChange(await readAvatarImageFile(file, { maxSize: 128, maxChars }));
                } catch (err) {
                  setError(userFacingError(err, "画像を読み込めませんでした。"));
                } finally {
                  input.value = "";
                }
              }}
            />
          </label>
          {others.map((c) => (
            <button
              key={c.value}
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setError(null);
                onChange(c.value);
              }}
            >
              {c.label}の画像を使う
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- 発言者の役割・アイコン設定（Upload / SessionDetail 共用） ---------- */
function renderCompressedSquare(
  img: HTMLImageElement,
  sizePx: number,
  mime: string,
  quality: number,
): string {
  const size = Math.min(img.width, img.height);
  const sx = Math.max(0, (img.width - size) / 2);
  const sy = Math.max(0, (img.height - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, sx, sy, size, size, 0, 0, sizePx, sizePx);
  return canvas.toDataURL(mime, quality);
}

export function readAvatarImageFile(
  file: File,
  opts?: { maxSize?: number; maxChars?: number },
): Promise<string> {
  const targetMax = opts?.maxSize ?? 160;
  const maxChars = opts?.maxChars;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み込めませんでした"));
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      if (!raw || file.type === "image/svg+xml" || typeof Image === "undefined") {
        if (maxChars && raw.length > maxChars) {
          reject(new Error("画像データのサイズ上限を超えています"));
          return;
        }
        resolve(raw);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const attempts: { size: number; mime: string; q: number }[] = [
            { size: targetMax, mime: "image/webp", q: 0.82 },
            { size: targetMax, mime: "image/jpeg", q: 0.78 },
            { size: Math.min(targetMax, 112), mime: "image/webp", q: 0.7 },
            { size: Math.min(targetMax, 96), mime: "image/jpeg", q: 0.65 },
            { size: 72, mime: "image/jpeg", q: 0.52 },
          ];
          for (const a of attempts) {
            const url = renderCompressedSquare(img, a.size, a.mime, a.q);
            if (!url) continue;
            if (!maxChars || url.length <= maxChars) {
              resolve(url);
              return;
            }
          }
          if (maxChars) {
            reject(new Error("画像の容量が大きすぎます"));
            return;
          }
          resolve(renderCompressedSquare(img, targetMax, "image/webp", 0.82) || raw);
        } catch {
          if (maxChars && raw.length > maxChars) {
            reject(new Error("画像の変換に失敗しました"));
            return;
          }
          resolve(raw);
        }
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

/** 登場人物でない発言者（場面の描写・ツールのシステムメッセージ）を分ける。顔もキャラクターも割り当てない */
export function splitCharacterSpeakers<T extends { kind: MsgKind }>(
  speakers: readonly T[],
): { characters: T[]; others: T[] } {
  const other = (k: MsgKind) => k === "NARRATION" || k === "SYSTEM";
  return {
    characters: speakers.filter((s) => !other(s.kind)),
    others: speakers.filter((s) => other(s.kind)),
  };
}

/** 描写・システムの発言者。自明なので畳んでおき、推定が外れたときだけ開いて役割を直す */
export function OtherSpeakers({
  systemId,
  speakers,
  onRoleChange,
}: {
  systemId: string | undefined;
  speakers: readonly { sp: string; kind: MsgKind }[];
  onRoleChange: (sp: string, kind: MsgKind) => void;
}) {
  if (speakers.length === 0) return null;
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-ink2 hover:text-base-content">
        <IconChevronDown
          width={16}
          height={16}
          className="-rotate-90 transition-transform group-open:rotate-0"
          aria-hidden
        />
        描写・システム
      </summary>
      <ul className="list mt-1">
        {speakers.map(({ sp, kind }) => (
          <li key={sp} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{sp}</span>
            <Select
              size="sm"
              ariaLabel={`${sp}の役割`}
              className="w-[6.5rem]"
              value={kind}
              onChange={(v) => onRoleChange(sp, v)}
              options={speakerRoleOptions(systemId, kind)}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SpeakerConfigGrid({
  systemId,
  speakers,
  speakerIcons,
  state,
  onRoleChange,
  onIconChange,
}: {
  /** このセッションのシステム。役割はそのシステムの言葉で出す（CoC なら KP） */
  systemId: string | undefined;
  speakers: { sp: string; kind: MsgKind }[];
  speakerIcons: Record<string, string>;
  state: Pick<State, "characters" | "users">;
  onRoleChange: (sp: string, kind: MsgKind) => void;
  onIconChange: (sp: string, iconSrc: string) => void;
}) {
  const indexes = useMemo(() => {
    const charByName = new Map<string, Character>();
    for (const c of Object.values(state.characters)) {
      if (!charByName.has(c.name)) charByName.set(c.name, c);
    }
    const userByName = new Map<string, User>();
    for (const u of Object.values(state.users)) {
      if (!userByName.has(u.name)) userByName.set(u.name, u);
    }
    return { charByName, userByName };
  }, [state.characters, state.users]);

  const baseIconOptions = useMemo<ComboboxOption[]>(() => {
    return [
      { value: "", label: "自動（キャラ・PLに連動）" },
      ...Object.values(state.characters).map((c) => ({
        value: characterAvatarSrc(c),
        label: `キャラ: ${c.name}`,
      })),
      ...Object.values(state.users).map((u) => ({
        value: userAvatarSrc(u),
        label: `PL: ${u.name}`,
      })),
      ...PRESET_NPC_ICONS.map((p) => ({
        value: p.src,
        label: p.label,
      })),
    ];
  }, [state.characters, state.users]);

  const { characters, others } = splitCharacterSpeakers(speakers);
  const knownValues = useMemo(() => new Set(baseIconOptions.map((o) => o.value)), [baseIconOptions]);

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {characters.map(({ sp, kind }) => {
        const currentExplicit = speakerIcons[sp] ?? "";
        const previewSrc = resolveSpeakerAvatarSrc(sp, kind, speakerIcons, state, indexes);
        const options =
          currentExplicit && !knownValues.has(currentExplicit)
            ? [...baseIconOptions, { value: currentExplicit, label: "カスタム画像" }]
            : baseIconOptions;

        return (
          <div
            key={sp}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-base-300/80 bg-base-200/35"
          >
            <img
              src={previewSrc}
              alt={sp}
              width={36}
              height={36}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="rounded-full object-cover shrink-0 border border-base-300/80 bg-base-200"
              style={{ width: 36, height: 36 }}
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <b className="text-sm truncate flex-1 min-w-0">{sp}</b>
                <Select
                  size="sm"
                  ariaLabel={`${sp}の役割`}
                  className="w-24 shrink-0"
                  value={kind}
                  onChange={(v) => onRoleChange(sp, v)}
                  options={speakerRoleOptions(systemId, kind)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Combobox
                  size="sm"
                  ariaLabel={`${sp}のアイコン`}
                  className="flex-1 min-w-0"
                  value={currentExplicit}
                  onChange={(v) => onIconChange(sp, v)}
                  options={options}
                />
                <label className="btn btn-sm px-2.5 cursor-pointer shrink-0" aria-label={`${sp}の画像を選ぶ`}>
                  <IconUpload width={14} height={14} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const dataUrl = await readAvatarImageFile(file);
                        if (dataUrl) onIconChange(sp, dataUrl);
                      } catch {
                        /* ignore unreadable image */
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        );
      })}
      {others.length > 0 && (
        <div className="sm:col-span-2">
          <OtherSpeakers systemId={systemId} speakers={others} onRoleChange={onRoleChange} />
        </div>
      )}
    </div>
  );
}

/** 顔アイコンの重なり。人数が多いときは +N を添える */
export function AvatarStack({
  people,
  size = 22,
  max = 5,
}: {
  people: ({ kind: "user"; user: User } | { kind: "char"; char: Character })[];
  size?: number;
  max?: number;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      <span className="flex -space-x-1.5">
        {shown.map((p) => (
          <span key={p.kind === "user" ? p.user.id : p.char.id} className="rounded-full ring-2 ring-base-100">
            {p.kind === "user" ? <Avatar u={p.user} size={size} /> : <CharAvatar c={p.char} size={size} />}
          </span>
        ))}
      </span>
      {people.length > max && <span className="ml-1.5 text-xs text-ink2">+{people.length - max}</span>}
    </span>
  );
}

/**
 * Google のログインボタン。Google のブランドガイドライン（developers.google.com/identity/branding-guidelines）の
 * 独自ボタンの指定どおりに作る: 白（ダークでは黒）の地・灰の枠・Google Sans Medium 14/20・G は公式の画像を 20px、
 * 左 12px / G と文字の間 10px / 右 12px。色や G を変えない。見た目は styles.css の .gsi-btn。
 */
export function GoogleSignInButton({
  onClick,
  busy,
  disabled,
  className,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <>
      {/* ボタンの「Google」の字だけ Google Sans で出す（日本語は本文の書体） */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&text=Google&display=swap"
        precedence="default"
      />
      <button
        type="button"
        className={cx("gsi-btn", className)}
        onClick={onClick}
        disabled={disabled || busy}
      >
        <img src="/google-g.png" width={20} height={20} alt="" aria-hidden />
        <span>{busy ? "ログイン中…" : "Google でログイン"}</span>
      </button>
    </>
  );
}

/** 顔を主役にしたキャラクターカード。一覧とユーザーページで共通に使う */
export const CharacterCard = memo(function CharacterCard({ c }: { c: Character }) {
  const sys = SYSTEMS[c.systemId];
  const last = lastPlayed(c);
  /* カードには卓をまたいで続く値（SAN など）だけを出す。続かない値（HP・幸運・共鳴など）は出さない */
  const stats = carriedValues(c);
  return (
    <Link to={`/characters/${c.id}`} className="card-interactive overflow-hidden p-0">
      <div className="flex items-start gap-4 p-4">
        <CharAvatar c={c} size={72} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-snug">{c.name}</h3>
          {c.archetype && <p className="truncate text-sm text-ink2">{c.archetype}</p>}
          <div className="meta mt-2 text-xs">
            <SysBadge sys={sys} />
          </div>
          <div className="meta mt-1 text-xs tabular-nums">
            {stats.map((st) => (
              <span key={st.key}>
                {st.label} <b className="text-base-content">{st.value}</b>
              </span>
            ))}
            <span>{last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
});
