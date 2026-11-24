import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { SvgXml } from "react-native-svg";
import type { Character, MsgKind, Provider, State, Table, User } from "@shared/types";
import { identiconDataUri } from "@shared/lib/identicon";
import { memberCandidates } from "@shared/lib/people";
import { pickAvatarImageDataUrl } from "../native/file-import";
import { hapticSelection } from "../native/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { RADII } from "../theme/tokens";
import { IconBrandX, IconDiscord, IconGoogle, IconUpload, IconX } from "./icons";
import {
  Button,
  Combobox,
  DividerList,
  IconButton,
  Select,
  type ComboboxOption,
  type SelectOption,
} from "./ui";

const boothIcon = require("../../assets/booth-icon.png");
const taltoIcon = require("../../assets/talto-icon.png");
const googleG = require("../../assets/google-g.png");

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
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

/** 人の顔。画像がなければ、変わらない ID から作った人の姿（@shared/lib/identicon）。頭文字は使わない（P9） */
export function userAvatarSrc(u: Pick<User, "id" | "handle" | "image">): string {
  return u.image || identiconDataUri(u.handle ?? u.id, "user");
}

/** キャラクターの顔。画像がなければキャラクター ID から作った人の姿（和柄の地） */
export function characterAvatarSrc(c: Pick<Character, "id" | "image">): string {
  return c.image || identiconDataUri(c.id, "character");
}

/** 卓の印。画像がなければ卓 ID から作った角印（和柄とダイスの目） */
export function tableMarkSrc(t: Pick<Table, "id" | "image">): string {
  return t.image || identiconDataUri(t.id, "table");
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
  if (kind === "KP" || kind === "GM") return identiconDataUri(sp, "user");
  return identiconDataUri(sp, "character");
}

export function AvatarImage({
  uri,
  size,
  label,
  shape = "circle",
}: {
  uri: string;
  size: number;
  label?: string;
  shape?: "circle" | "square";
}) {
  const { tokens } = useTheme();
  const isSvgUri = uri.startsWith("data:image/svg+xml;utf8,");

  return (
    <View
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "auto" : "no-hide-descendants"}
      style={{
        width: size,
        height: size,
        borderRadius: shape === "circle" ? size / 2 : Math.max(4, Math.round(size * 0.19)),
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

/** 卓の印（角の丸い四角。顔の代わりに卓を見分ける）。読み上げでは卓名が隣にあるので隠す */
export function TableMark({ table, size = 20 }: { table: Pick<Table, "id" | "image">; size?: number }) {
  return <AvatarImage uri={tableMarkSrc(table)} size={size} shape="square" />;
}

/*
 * Google のログインボタン。Google のブランドガイドライン（developers.google.com/identity/branding-guidelines）の
 * 独自ボタンの指定どおりに作る（Web の GoogleSignInButton と同じ）: 白（ダークでは黒）の地・灰の枠・
 * 14/20 の Medium・G は公式の画像を 20px、左右 12px / G と文字の間 10px。色や G を変えない。
 * この色はテーマのトークンではなく Google の指定値なので、ここにだけ書く。
 */
const GSI_COLORS = {
  light: { bg: "#FFFFFF", bgPressed: "#EBEBEB", border: "#747775", text: "#1F1F1F" },
  dark: { bg: "#131314", bgPressed: "#2A2A2B", border: "#8E918F", text: "#E3E3E3" },
} as const;

export function GoogleSignInButton({
  onPress,
  busy,
  disabled,
}: {
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { isDark } = useTheme();
  const c = isDark ? GSI_COLORS.dark : GSI_COLORS.light;
  const inactive = disabled || busy;
  const label = busy ? "ログイン中…" : "Google でログイン";
  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        hapticSelection();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.gsiButton,
        { backgroundColor: pressed ? c.bgPressed : c.bg, borderColor: c.border, opacity: inactive ? 0.6 : 1 },
      ]}
    >
      <Image source={googleG} style={styles.gsiLogo} contentFit="contain" />
      <Text style={[styles.gsiText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
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

/* ---------- 参加者の選択 ----------
 * 人を名前で検索させない（P14）。候補は自分の卓のメンバー（memberCandidates）か、呼び出し側が渡す quickIds だけ
 */
export function PlayerPicker({
  state,
  selected,
  onChange,
  quickIds,
  quickLabel = "卓のメンバー",
  exclude,
  tableId,
}: {
  state: State;
  selected: string[];
  onChange: (ids: string[]) => void;
  quickIds?: string[];
  quickLabel?: string;
  exclude?: string[];
  tableId?: string;
  /** @deprecated 名前の検索はやめた（P14）。渡しても使わない */
  placeholder?: string;
}) {
  const { tokens } = useTheme();
  const quick = useMemo(
    () =>
      (quickIds ?? memberCandidates(state, tableId)).filter(
        (id) => state.users[id] && !selected.includes(id) && !exclude?.includes(id),
      ),
    [quickIds, state, tableId, selected, exclude],
  );

  return (
    <View style={{ gap: 10 }}>
      {quick.length > 0 && (
        <View>
          <Text style={[styles.quickLabel, { color: tokens.ink2 }]}>{quickLabel}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quick.map((id) => {
              const u = state.users[id]!;
              return (
                <Button
                  key={id}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    hapticSelection();
                    onChange([...selected, id]);
                  }}
                  icon={<Avatar u={u} size={20} />}
                >
                  {u.name}
                </Button>
              );
            })}
          </View>
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
  { value: "NARRATION", label: "描写" },
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
  const baseIconOptions = useMemo<ComboboxOption<string>[]>(() => {
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
        const iconOptions =
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
              <Combobox
                size="sm"
                ariaLabel={`${sp}のアイコン`}
                value={currentExplicit}
                onChange={(v) => onIconChange(sp, v)}
                options={iconOptions}
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
  gsiButton: {
    height: 44,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  gsiLogo: { width: 20, height: 20 },
  gsiText: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  providerCircle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 6,
  },
});
