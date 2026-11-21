import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { SvgXml } from "react-native-svg";
import type { Character, MsgKind, Provider, State, User } from "@shared/types";
import { pickAvatarImageDataUrl } from "../native/file-import";
import { hapticSelection } from "../native/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { RADII } from "../theme/tokens";
import { IconBrandX, IconDiscord, IconGoogle, IconSearch, IconUpload, IconUserPlus, IconX } from "./icons";
import { Button, DividerList, IconButton, Select, TextField, type SelectOption } from "./ui";

const boothIcon = require("../../assets/booth-icon.png");
const taltoIcon = require("../../assets/talto-icon.png");

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
      ? `<polygon points="50,20 76,35 76,65 50,80 24,65 24,35" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round"/><polygon points="50,24 68,54 32,54" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`
      : idx === 1
        ? `<circle cx="50" cy="50" r="24" fill="none" stroke="${color}" stroke-width="2.5"/><polygon points="50,21 56,44 79,50 56,56 50,79 44,56 21,50 44,44" fill="${color}" fill-opacity="0.85"/><circle cx="50" cy="50" r="4" fill="${bg}"/>`
        : idx === 2
          ? `<path d="M50 22 L64 46 L56 70 L44 70 L36 46 Z" fill="${color}" fill-opacity="0.9"/><rect x="41" y="70" width="18" height="7" rx="2" fill="${color}"/>`
          : `<rect x="28" y="34" width="44" height="34" rx="4" fill="none" stroke="${color}" stroke-width="3"/><line x1="50" y1="34" x2="50" y2="68" stroke="${color}" stroke-width="2.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-seed="${seedId}"><rect width="100" height="100" rx="50" fill="${bg}"/><circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="1.5"/>${glyph}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function fallbackPortraitDataUri(name: string, color: string, seedId = ""): string {
  const idx = hashName(name) % 4;
  const hairColors = ["#3a2820", "#282320", "#593828", "#42322b"];
  const bgColors = ["#f3e3d3", "#e5ece2", "#ebe2d5", "#f0deda"];
  const hair = hairColors[idx]!;
  const bg = bgColors[idx]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-seed="${seedId}"><rect width="100" height="100" rx="50" fill="${bg}"/><circle cx="50" cy="40" r="26" fill="${hair}"/><path d="M18 98 C20 74 34 68 50 68 C66 68 80 74 82 98 Z" fill="${color}"/><path d="M42 68 L50 80 L58 68 Z" fill="#fbf6ef"/><ellipse cx="50" cy="46" rx="19" ry="20" fill="#f5dcc4"/><circle cx="42" cy="46" r="2.3" fill="#2c221d"/><circle cx="58" cy="46" r="2.3" fill="#2c221d"/><path d="M46 55 Q50 57.5 54 55" stroke="#8c5843" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M25 39 C30 20 70 20 75 39 C66 29 56 28 50 34 C44 28 34 29 25 39 Z" fill="${hair}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

export function AvatarImage({ uri, size, label }: { uri: string; size: number; label?: string }) {
  const { tokens } = useTheme();
  const isSvgUri = uri.startsWith("data:image/svg+xml;utf8,");

  return (
    <View
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: tokens.border,
        backgroundColor: tokens.ground,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isSvgUri ? (
        <SvgXml
          xml={decodeURIComponent(uri.slice("data:image/svg+xml;utf8,".length))}
          width={size}
          height={size}
        />
      ) : (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={120} />
      )}
    </View>
  );
}

export function Avatar({ u, size = 32 }: { u: User; size?: number }) {
  return <AvatarImage uri={userAvatarSrc(u)} size={size} label={u.name} />;
}

export function CharAvatar({ c, size = 44 }: { c: Character; size?: number }) {
  return <AvatarImage uri={characterAvatarSrc(c)} size={size} label={c.name} />;
}

export function ProviderIcon({ provider, size = 20 }: { provider: Provider; size?: number }) {
  const { tokens } = useTheme();
  const glyph = Math.round(size * 0.58);
  if (provider === "booth") {
    return (
      <Image
        source={boothIcon}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  if (provider === "talto") {
    return (
      <Image
        source={taltoIcon}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  if (provider === "google") {
    return (
      <View
        style={[
          styles.providerCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            borderWidth: 1,
          },
        ]}
      >
        <IconGoogle size={glyph} />
      </View>
    );
  }
  if (provider === "discord") {
    return (
      <View
        style={[
          styles.providerCircle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: "#5865F2" },
        ]}
      >
        <IconDiscord size={glyph} color="#ffffff" />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.providerCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: "#000000" },
      ]}
    >
      <IconBrandX size={glyph} color="#ffffff" />
    </View>
  );
}

export function AvatarStack({
  people,
  size = 24,
  max = 5,
}: {
  people: ({ kind: "user"; user: User } | { kind: "char"; char: Character })[];
  size?: number;
  max?: number;
}) {
  const { tokens } = useTheme();
  if (people.length === 0) return null;
  const shown = people.slice(0, max);

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {shown.map((p, idx) => (
          <View
            key={p.kind === "user" ? p.user.id : p.char.id}
            style={{
              marginLeft: idx === 0 ? 0 : -6,
              borderRadius: (size + 4) / 2,
              borderWidth: 2,
              borderColor: tokens.surface,
            }}
          >
            {p.kind === "user" ? <Avatar u={p.user} size={size} /> : <CharAvatar c={p.char} size={size} />}
          </View>
        ))}
      </View>
      {people.length > max && (
        <Text style={{ marginLeft: 6, fontSize: 12, color: tokens.ink2 }}>+{people.length - max}</Text>
      )}
    </View>
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
  const { tokens } = useTheme();
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
    <View style={{ gap: 10 }}>
      <View style={[styles.searchInputWrap, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
        <IconSearch size={16} color={tokens.ink3} />
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder={placeholder}
          accessibilityLabel="参加者を検索"
          style={{ flex: 1, borderWidth: 0, minHeight: 40, paddingHorizontal: 4 }}
        />
      </View>

      {quick.length > 0 && !q && (
        <View>
          <Text style={[styles.quickLabel, { color: tokens.ink2 }]}>{quickLabel}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quick.map((id) => {
              const u = state.users[id]!;
              return (
                <Button
                  key={id}
                  size="sm"
                  variant="quiet"
                  onPress={() => onChange([...selected, id])}
                  icon={<Avatar u={u} size={20} />}
                >
                  {u.name}
                </Button>
              );
            })}
          </View>
        </View>
      )}

      {q.trim() !== "" && (
        <View style={[styles.resultBox, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          {results.length === 0 ? (
            <Text style={{ padding: 12, fontSize: 14, color: tokens.ink2 }}>
              該当するユーザーが見つかりません
            </Text>
          ) : (
            <DividerList>
              {results.map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => {
                    hapticSelection();
                    onChange([...selected, u.id]);
                    setQ("");
                  }}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    pressed && { backgroundColor: tokens.surfaceHover },
                  ]}
                >
                  <Avatar u={u} size={28} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.ink }}>
                    {u.name}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <IconUserPlus size={14} color={tokens.primary} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.primary }}>追加</Text>
                  </View>
                </Pressable>
              ))}
            </DividerList>
          )}
        </View>
      )}

      {selected.length > 0 && (
        <View style={[styles.resultBox, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <DividerList>
            {selected
              .filter((id) => state.users[id])
              .map((id) => {
                const u = state.users[id]!;
                return (
                  <View key={id} style={styles.selectedRow}>
                    <Avatar u={u} size={26} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.ink }}>
                      {u.name}
                    </Text>
                    <IconButton
                      accessibilityLabel={`${u.name}を参加者から外す`}
                      onPress={() => onChange(selected.filter((x) => x !== id))}
                    >
                      <IconX size={16} color={tokens.ink2} />
                    </IconButton>
                  </View>
                );
              })}
          </DividerList>
        </View>
      )}
    </View>
  );
}

/* ---------- 発言者の役割・アイコン設定 ---------- */
const ROLE_OPTIONS: readonly SelectOption<MsgKind>[] = [
  { value: "PC", label: "PC" },
  { value: "KP", label: "GM" },
  { value: "NPC", label: "NPC" },
  { value: "PL", label: "PL" },
  { value: "GM", label: "GM" },
  { value: "SYSTEM", label: "システム" },
];

export function SpeakerConfigList({
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
  const { tokens } = useTheme();
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
    <DividerList>
      {speakers.map(({ sp, kind }) => {
        const currentExplicit = speakerIcons[sp] ?? "";
        const previewSrc = resolveSpeakerAvatarSrc(sp, kind, speakerIcons, state);
        const options =
          currentExplicit && !knownValues.has(currentExplicit)
            ? [...baseIconOptions, { value: currentExplicit, label: "端末から選んだ画像" }]
            : baseIconOptions;

        return (
          <View key={sp} style={{ paddingVertical: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AvatarImage uri={previewSrc} size={36} label={sp} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                {sp}
              </Text>
              <Select
                size="sm"
                ariaLabel={`${sp}の役割`}
                value={kind}
                onChange={(v) => onRoleChange(sp, v)}
                options={ROLE_OPTIONS}
                style={{ width: 112 }}
              />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Select
                size="sm"
                ariaLabel={`${sp}のアイコン`}
                value={currentExplicit}
                onChange={(v) => onIconChange(sp, v)}
                options={options}
                style={{ flex: 1 }}
              />
              <Button
                size="sm"
                variant="secondary"
                accessibilityLabel={`${sp}の画像を選ぶ`}
                icon={<IconUpload size={14} color={tokens.ink} />}
                onPress={async () => {
                  try {
                    const dataUrl = await pickAvatarImageDataUrl();
                    if (dataUrl) onIconChange(sp, dataUrl);
                  } catch {
                    /* ignore cancelled/denied */
                  }
                }}
              >
                画像
              </Button>
            </View>
          </View>
        );
      })}
    </DividerList>
  );
}

const styles = StyleSheet.create({
  providerCircle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  resultBox: {
    borderWidth: 1,
    borderRadius: RADII.md,
    overflow: "hidden",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 6,
  },
});
