/**
 * 人・キャラクター・発言者の表示（顔アイコン、顔の重なり、ブランドアイコン、参加者の選択）。
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
const boothIconUrl = "/booth-icon.png";
const taltoIconUrl = "/talto-icon.png";
import type { Character, MsgKind, Provider, State, User } from "../types";
import { IconBrandX, IconDiscord, IconGoogle, IconSearch, IconUpload, IconUserPlus, IconX } from "./icons";
import { Select } from "./ui";
import type { SelectOption } from "./ui";

/* ---------- 暖色系フォールバックエンブレム・ポートレート生成 ---------- */
function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function fallbackUserEmblemDataUri(name: string, color: string, seedId = ""): string {
  const idx = hashName(name) % 4;
  const bgs = ["#f3e3d3", "#e5ece2", "#ebe2d5", "#f0deda"];
  const bg = bgs[idx]!;
  const glyph =
    idx === 0
      ? `<polygon points="50,20 76,35 76,65 50,80 24,65 24,35" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round"/><polygon points="50,24 68,54 32,54" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><line x1="50" y1="20" x2="50" y2="24" stroke="${color}" stroke-width="2.2"/><line x1="24" y1="35" x2="32" y2="54" stroke="${color}" stroke-width="2.2"/><line x1="76" y1="35" x2="68" y2="54" stroke="${color}" stroke-width="2.2"/><line x1="50" y1="80" x2="32" y2="54" stroke="${color}" stroke-width="2.2"/><line x1="50" y1="80" x2="68" y2="54" stroke="${color}" stroke-width="2.2"/>`
      : idx === 1
        ? `<circle cx="50" cy="50" r="24" fill="none" stroke="${color}" stroke-width="2.5"/><polygon points="50,21 56,44 79,50 56,56 50,79 44,56 21,50 44,44" fill="${color}" fill-opacity="0.85"/><circle cx="50" cy="50" r="4" fill="${bg}"/>`
        : idx === 2
          ? `<path d="M50 22 L64 46 L56 70 L44 70 L36 46 Z" fill="${color}" fill-opacity="0.9"/><line x1="50" y1="22" x2="50" y2="50" stroke="${bg}" stroke-width="2.4" stroke-linecap="round"/><circle cx="50" cy="52" r="3.5" fill="${bg}"/><rect x="41" y="70" width="18" height="7" rx="2" fill="${color}"/>`
          : `<rect x="28" y="34" width="44" height="34" rx="4" fill="none" stroke="${color}" stroke-width="3"/><line x1="50" y1="34" x2="50" y2="68" stroke="${color}" stroke-width="2.5"/><path d="M35 44h9M35 52h9M56 44h9M56 52h9" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-seed="${seedId}">
    <rect width="100" height="100" rx="50" fill="${bg}"/>
    <circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="1.5"/>
    ${glyph}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim().replace(/\s+/g, " "))}`;
}

function fallbackPortraitDataUri(name: string, color: string, seedId = ""): string {
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
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim().replace(/\s+/g, " "))}`;
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

export function userAvatarSrc(u: User): string {
  return u.image || fallbackUserEmblemDataUri(u.name, u.color || "#b84724", u.id);
}

export function characterAvatarSrc(c: Character): string {
  return c.image || fallbackPortraitDataUri(c.name, c.color || "#b84a27", c.id);
}

export function resolveSpeakerAvatarSrc(
  sp: string,
  kind: MsgKind,
  speakerIcons: Record<string, string> | undefined,
  state: Pick<State, "characters" | "users">,
): string {
  const explicit = speakerIcons?.[sp];
  if (explicit) return explicit;
  const matchedChar = Object.values(state.characters).find((c) => c.name === sp);
  if (matchedChar) return characterAvatarSrc(matchedChar);
  const matchedUser = Object.values(state.users).find((u) => u.name === sp);
  if (matchedUser) return userAvatarSrc(matchedUser);
  if (kind === "KP" || kind === "GM") return fallbackUserEmblemDataUri(sp, "#6b5d50");
  return fallbackPortraitDataUri(sp, "#856e5c");
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

/* ---------- 参加者検索ピッカー ---------- */
export function PlayerPicker({
  state,
  selected,
  onChange,
  quickIds,
  quickLabel = "よく一緒に遊ぶメンバー",
  exclude,
  placeholder = "ユーザー名で検索…",
}: {
  state: State;
  selected: string[];
  onChange: (ids: string[]) => void;
  quickIds?: string[];
  quickLabel?: string;
  exclude?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const all = Object.values(state.users).filter((u) => !exclude?.includes(u.id) && !selected.includes(u.id));
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? all.filter((u) => u.name.toLowerCase().includes(query)).slice(0, 8) : [];
  }, [q, all]);
  const quick = (quickIds ?? []).filter(
    (id) => state.users[id] && !selected.includes(id) && !exclude?.includes(id),
  );

  return (
    <div>
      <label className="input input-bordered flex items-center gap-2.5 w-full bg-base-100 h-10">
        <IconSearch width={16} height={16} className="opacity-45" />
        <input
          aria-label="参加者を検索"
          className="grow min-w-0 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
      </label>

      {quick.length > 0 && !q && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-ink2 mb-1.5">{quickLabel}</div>
          <div className="flex flex-wrap gap-2">
            {quick.map((id) => {
              const u = state.users[id]!;
              return (
                <button
                  key={id}
                  type="button"
                  className="btn btn-quiet btn-sm gap-2 font-medium"
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

      {q && (
        <div className="mt-2 border border-base-300 rounded-xl bg-base-100 shadow-sm divide-y divide-base-200 max-h-60 overflow-y-auto">
          {results.length === 0 && (
            <div className="px-4 py-3 text-sm text-ink2">該当するユーザーが見つかりません</div>
          )}
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left row-interactive"
              onClick={() => {
                onChange([...selected, u.id]);
                setQ("");
              }}
            >
              <Avatar u={u} size={28} />
              <span className="text-sm font-semibold grow">{u.name}</span>
              <span className="text-xs text-primary font-semibold">追加</span>
            </button>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <ul className="list mt-3 rounded-box border border-base-300">
          {selected
            .filter((id) => state.users[id])
            .map((id) => {
              const u = state.users[id]!;
              return (
                <li key={id} className="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
                  <Avatar u={u} size={26} />
                  <span className="grow text-sm font-semibold">{u.name}</span>
                  <button
                    type="button"
                    aria-label={`${u.name}を参加者から外す`}
                    className="icon-btn"
                    onClick={() => onChange(selected.filter((x) => x !== id))}
                  >
                    <IconX width={16} height={16} />
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

/* ---------- 発言者の役割・アイコン設定（Upload / SessionDetail 共用） ---------- */
export function readAvatarImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み込めませんでした"));
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      if (!raw || file.type === "image/svg+xml" || typeof Image === "undefined") {
        resolve(raw);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const max = 160;
          const size = Math.min(img.width, img.height);
          const sx = Math.max(0, (img.width - size) / 2);
          const sy = Math.max(0, (img.height - size) / 2);
          const canvas = document.createElement("canvas");
          canvas.width = max;
          canvas.height = max;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(raw);
            return;
          }
          ctx.drawImage(img, sx, sy, size, size, 0, 0, max, max);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

const ROLE_OPTIONS: readonly SelectOption<MsgKind>[] = [
  { value: "PC", label: "PC" },
  { value: "KP", label: "KP" },
  { value: "NPC", label: "NPC" },
  { value: "PL", label: "PL" },
  { value: "GM", label: "GM" },
  { value: "SYSTEM", label: "SYSTEM" },
];

export function SpeakerConfigGrid({
  speakers,
  speakerIcons,
  state,
  onRoleChange,
  onIconChange,
}: {
  speakers: { sp: string; kind: MsgKind }[];
  speakerIcons: Record<string, string>;
  state: Pick<State, "characters" | "users">;
  onRoleChange: (sp: string, kind: MsgKind) => void;
  onIconChange: (sp: string, iconSrc: string) => void;
}) {
  const baseIconOptions = useMemo<SelectOption<string>[]>(() => {
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

  const knownValues = useMemo(() => new Set(baseIconOptions.map((o) => o.value)), [baseIconOptions]);

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {speakers.map(({ sp, kind }) => {
        const currentExplicit = speakerIcons[sp] ?? "";
        const previewSrc = resolveSpeakerAvatarSrc(sp, kind, speakerIcons, state);
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
                  options={ROLE_OPTIONS}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Select
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
