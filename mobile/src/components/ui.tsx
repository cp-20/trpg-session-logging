import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { getJapaneseHolidayName } from "@shared/lib/holidays";
import { todayStr } from "@shared/lib/format";
import type { Scope, SystemDef } from "@shared/types";
import { hapticImpact, hapticSelection, isReduceMotionEnabled } from "../native/haptics";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";
import { RADII } from "../theme/tokens";
import {
  IconAlert,
  IconBooks,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconFilter,
  IconLink,
  IconLock,
  IconPlus,
  IconUsers,
  IconWifiOff,
  IconWorld,
  IconX,
  type MobileIconProps,
} from "./icons";

export function LogoMark({ size = 22, color }: { size?: number; color?: string }) {
  const { tokens } = useTheme();
  const c = color ?? tokens.primary;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18M3 10.5h18M3 15h18" stroke="${c}" stroke-width="1.5" stroke-linecap="round" opacity="0.55" fill="none"/><circle cx="9" cy="14.2" r="2.5" fill="${c}"/><path d="M11.5 14.2V5.5" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M11.5 5.5l5 1.4" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="16.5" cy="10" r="2.1" fill="${c}"/></svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}

/* ---------- 画面上部バー（全タブ・詳細共通） ---------- */
export function AppTopBar({
  onPressAvatar,
  avatarNode,
}: {
  onPressAvatar: () => void;
  avatarNode: ReactNode;
}) {
  const { tokens } = useTheme();
  const { authUser, showSyncIndicator, isOffline, syncStatus, hasPendingOutbox } = useMobileStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const statusText =
    isOffline && authUser
      ? "オフライン"
      : syncStatus === "error" && authUser
        ? "未同期"
        : showSyncIndicator
          ? "同期中…"
          : authUser && hasPendingOutbox && !showSyncIndicator
            ? ""
            : "";

  return (
    <View
      style={[
        styles.topBar,
        {
          paddingTop: insets.top,
          height: 54 + insets.top,
          backgroundColor: tokens.surface,
          borderBottomColor: tokens.border,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          hapticSelection();
          router.replace("/");
        }}
        accessibilityRole="button"
        accessibilityLabel="卓譜 ホーム"
        style={styles.brandBtn}
      >
        <LogoMark size={22} color={tokens.primary} />
        <Text style={[styles.brandText, { color: tokens.ink }]}>卓譜</Text>
      </Pressable>

      {!authUser && (
        <View style={[styles.demoPill, { backgroundColor: tokens.ground }]}>
          <Text style={[styles.demoPillText, { color: tokens.ink2 }]}>デモ</Text>
        </View>
      )}

      {/* 固定幅の同期状態枠（CLS ゼロ） */}
      <View style={styles.syncSlot} accessibilityLiveRegion="polite">
        {statusText !== "" && (
          <View style={styles.syncSlotInner}>
            {isOffline ? (
              <IconWifiOff size={14} color={tokens.ink2} />
            ) : syncStatus === "error" ? (
              <IconAlert size={14} color={tokens.error} />
            ) : (
              <ActivityIndicator size="small" color={tokens.ink2} />
            )}
            <Text
              numberOfLines={1}
              style={[styles.syncSlotText, { color: syncStatus === "error" ? tokens.error : tokens.ink2 }]}
            >
              {statusText}
            </Text>
          </View>
        )}
      </View>

      <Button
        variant="primary"
        size="sm"
        onPress={() => router.push("/upload")}
        icon={<IconPlus size={16} color={tokens.primaryContent} strokeWidth={2.4} />}
      >
        記録
      </Button>

      <Pressable
        onPress={() => {
          hapticSelection();
          onPressAvatar();
        }}
        accessibilityRole="button"
        accessibilityLabel="設定とアカウント"
        style={styles.avatarHit}
      >
        {avatarNode}
      </Pressable>
    </View>
  );
}

/* ---------- 状態バッジ（例外状態のみ） ---------- */
export function Tag({
  v = "gray",
  children,
}: {
  v?: "ok" | "warn" | "danger" | "accent" | "gray";
  children: ReactNode;
}) {
  const { tokens } = useTheme();
  const borderColor =
    v === "ok"
      ? tokens.success
      : v === "warn"
        ? tokens.warning
        : v === "danger"
          ? tokens.error
          : v === "accent"
            ? tokens.primary
            : tokens.border;
  const textColor =
    v === "ok"
      ? tokens.success
      : v === "warn"
        ? tokens.warning
        : v === "danger"
          ? tokens.error
          : v === "accent"
            ? tokens.primary
            : tokens.ink2;

  return (
    <View style={[styles.tag, { borderColor }]}>
      <Text style={[styles.tagText, { color: textColor }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/* ---------- システム名ラベル（点 + 正式名。省略なし） ---------- */
export function SysBadge({ sys }: { sys: SystemDef | undefined }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.inlineRow}>
      <View style={[styles.sysDot, { backgroundColor: sys?.color ?? tokens.ink3 }]} />
      <Text style={[styles.metaText, { color: tokens.ink2 }]} numberOfLines={1}>
        {sys?.name ?? "汎用・その他"}
      </Text>
    </View>
  );
}

/* ---------- 共有範囲ラベル ---------- */
export const SCOPE_META: Record<
  Scope,
  { label: string; hint: string; Icon: (p: MobileIconProps) => ReactNode }
> = {
  members: { label: "メンバー限定", hint: "参加者と卓のメンバーだけが読めます", Icon: IconLock },
  passed: { label: "プレイした人", hint: "このシナリオを通過した人も読めます", Icon: IconUsers },
  public: { label: "公開", hint: "リンクを知っている人なら誰でも読めます", Icon: IconWorld },
};

export function ScopeLabel({ scope }: { scope: Scope }) {
  const { tokens } = useTheme();
  const meta = SCOPE_META[scope];
  return (
    <View style={styles.inlineRow}>
      <meta.Icon size={14} color={tokens.ink2} />
      <Text style={[styles.metaText, { color: tokens.ink2 }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );
}

/* ---------- 面とリスト（面の中に面を入れない） ---------- */
export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.surface, { backgroundColor: tokens.surface, borderColor: tokens.border }, style]}>
      {children}
    </View>
  );
}

export function DividerList({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <View>
      {items.map((child, idx) => (
        <View
          key={idx}
          style={
            idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border } : undefined
          }
        >
          {child}
        </View>
      ))}
    </View>
  );
}

export function InteractiveRow({
  children,
  onPress,
  onLongPress,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.rowPadding, pressed && { backgroundColor: tokens.surfaceHover }, style]}
    >
      {children}
    </Pressable>
  );
}

/* ---------- ボタン（3段 + アイコン + 危険） ---------- */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  onPress,
  disabled,
  icon,
  children,
  fullWidth,
  accessibilityLabel,
  style,
}: {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  const bg =
    variant === "primary" ? tokens.primary : variant === "quiet" ? tokens.surfaceHover : tokens.surface;
  const textColor =
    variant === "primary" ? tokens.primaryContent : variant === "danger" ? tokens.error : tokens.ink;
  const borderWidth = variant === "secondary" || variant === "danger" ? 1 : 0;
  const borderColor = variant === "danger" ? tokens.error : tokens.border;

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        hapticImpact(variant === "primary" ? "medium" : "light");
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btnBase,
        size === "sm" ? styles.btnSm : styles.btnMd,
        { backgroundColor: bg, borderWidth, borderColor },
        fullWidth && { width: "100%" },
        disabled && { opacity: 0.45 },
        pressed && !disabled && !isReduceMotionEnabled() && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {icon}
      <Text
        style={[styles.btnText, size === "sm" ? { fontSize: 13 } : { fontSize: 14 }, { color: textColor }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  onPress,
  accessibilityLabel,
  children,
  disabled,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        hapticSelection();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.iconBtn,
        pressed && { backgroundColor: tokens.surfaceHover },
        disabled && { opacity: 0.4 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ---------- セグメント切り替え（選択中は浮いた面。主色塗りにしない） ---------- */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { v: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.segTrack, { backgroundColor: tokens.ground, borderColor: tokens.border }]}
    >
      {options.map((opt) => {
        const active = opt.v === value;
        return (
          <Pressable
            key={opt.v}
            disabled={opt.disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: opt.disabled }}
            onPress={() => {
              hapticSelection();
              onChange(opt.v);
            }}
            style={[
              styles.segItem,
              size === "sm"
                ? { minHeight: 34, paddingHorizontal: 10 }
                : { minHeight: 38, paddingHorizontal: 12 },
              active && {
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                borderWidth: 1,
              },
              opt.disabled && { opacity: 0.4 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segText,
                size === "sm" ? { fontSize: 12 } : { fontSize: 13 },
                { color: active ? tokens.ink : tokens.ink2, fontWeight: active ? "700" : "500" },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- ボトムシート ---------- */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={isReduceMotionEnabled() ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <View style={[styles.sheetBackdrop, { backgroundColor: tokens.backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="閉じる" />
        <View
          style={[styles.sheetContainer, { backgroundColor: tokens.surface, borderColor: tokens.border }]}
        >
          <View style={styles.sheetHandleWrap}>
            <View style={[styles.sheetHandle, { backgroundColor: tokens.border }]} />
          </View>
          <View style={[styles.sheetHeader, { borderBottomColor: tokens.border }]}>
            <Text style={[styles.sheetTitle, { color: tokens.ink }]} numberOfLines={2}>
              {title}
            </Text>
            <IconButton onPress={onClose} accessibilityLabel="閉じる">
              <IconX size={20} color={tokens.ink} strokeWidth={2.2} />
            </IconButton>
          </View>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer && (
            <View
              style={[
                styles.sheetFooter,
                {
                  borderTopColor: tokens.border,
                  backgroundColor: tokens.surface,
                  paddingBottom: Math.max(14, insets.bottom),
                },
              ]}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </RNModal>
  );
}

/* ---------- セレクト（ボトムシート選択） ---------- */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  size = "md",
  style,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={ariaLabel ?? current?.label}
        onPress={() => {
          hapticSelection();
          setOpen(true);
        }}
        style={[
          styles.selectTrigger,
          size === "sm" ? { minHeight: 38, paddingHorizontal: 12 } : { minHeight: 44, paddingHorizontal: 14 },
          { backgroundColor: tokens.surface, borderColor: tokens.border },
          disabled && { opacity: 0.45 },
          style,
        ]}
      >
        <Text style={[styles.selectTriggerText, { color: tokens.ink }]} numberOfLines={1}>
          {current?.label ?? ""}
        </Text>
        <IconChevronDown size={16} color={tokens.ink2} />
      </Pressable>

      <BottomSheet visible={open} title={ariaLabel ?? "選択"} onClose={() => setOpen(false)}>
        <DividerList>
          {options.map((opt, idx) => {
            const active = opt.value === value;
            return (
              <Pressable
                key={`${opt.value}-${idx}`}
                onPress={() => {
                  hapticSelection();
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.selectOptionRow,
                  active && { backgroundColor: tokens.primaryTint },
                  pressed && !active && { backgroundColor: tokens.surfaceHover },
                ]}
              >
                <Text
                  style={[
                    styles.selectOptionText,
                    { color: active ? tokens.primary : tokens.ink, fontWeight: active ? "700" : "500" },
                  ]}
                >
                  {opt.label}
                </Text>
                {active && <IconCheck size={18} color={tokens.primary} />}
              </Pressable>
            );
          })}
        </DividerList>
      </BottomSheet>
    </>
  );
}

/* ---------- スイッチ ---------- */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={on}
      disabled={disabled}
      onValueChange={(val) => {
        hapticSelection();
        onChange(val);
      }}
      trackColor={{ false: tokens.border, true: tokens.primary }}
      thumbColor={tokens.primaryContent}
    />
  );
}

/* ---------- 見出し・テキスト入力・フォーム ---------- */
export function PageHead({
  title,
  sub,
  back,
  actions,
  lead,
}: {
  title: string;
  sub?: ReactNode;
  back?: { label: string; onPress?: () => void };
  actions?: ReactNode;
  lead?: ReactNode;
}) {
  const { tokens } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.pageHead}>
      {back && (
        <Pressable
          onPress={() => {
            hapticSelection();
            if (back.onPress) back.onPress();
            else router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${back.label}へ戻る`}
          style={styles.backLink}
        >
          <IconChevronLeft size={17} color={tokens.ink2} />
          <Text style={[styles.backLinkText, { color: tokens.ink2 }]}>{back.label}</Text>
        </Pressable>
      )}
      <View style={styles.pageHeadRow}>
        {lead}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.h1, { color: tokens.ink }]}>{title}</Text>
          {sub && <View style={{ marginTop: 6 }}>{sub}</View>}
        </View>
      </View>
      {actions && <View style={styles.pageHeadActions}>{actions}</View>}
    </View>
  );
}

export function SectionTitle({
  children,
  right,
  sub,
}: {
  children: ReactNode;
  right?: ReactNode;
  sub?: string;
}) {
  const { tokens } = useTheme();
  return (
    <View style={styles.sectionTitleWrap}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.h2, { color: tokens.ink }]}>{children}</Text>
        {sub && <Text style={[styles.subText, { color: tokens.ink2 }]}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export function PanelHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.panelHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.h3, { color: tokens.ink }]}>{title}</Text>
        {sub && <Text style={[styles.subText, { color: tokens.ink2 }]}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export function MetaRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.metaRow, style]}>{children}</View>;
}

export function SettingRow({
  icon,
  title,
  desc,
  children,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingRowHead}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.settingTitle, { color: tokens.ink }]}>{title}</Text>
          {desc && <Text style={[styles.settingDesc, { color: tokens.ink2 }]}>{desc}</Text>}
        </View>
      </View>
      {children && <View style={styles.settingControl}>{children}</View>}
    </View>
  );
}

export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.formRow}>
      <Text style={[styles.formLabel, { color: tokens.ink2 }]}>{label}</Text>
      {children}
    </View>
  );
}

export function Field({
  label,
  hint,
  children,
  noMargin,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  noMargin?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <View style={!noMargin ? { marginTop: 14 } : undefined}>
      <Text style={[styles.fieldLabel, { color: tokens.ink }]}>{label}</Text>
      {children}
      {hint && <Text style={[styles.fieldHint, { color: tokens.ink2 }]}>{hint}</Text>}
    </View>
  );
}

export function FieldError({ text }: { text: string | null | undefined }) {
  const { tokens } = useTheme();
  if (!text) return null;
  return (
    <Text accessibilityRole="alert" style={[styles.fieldError, { color: tokens.error }]}>
      {text}
    </Text>
  );
}

export function TextField({ style, multiline, ...props }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  return (
    <TextInput
      placeholderTextColor={tokens.ink3}
      multiline={multiline}
      {...props}
      style={[
        styles.input,
        multiline && { minHeight: 100, textAlignVertical: "top", paddingTop: 10 },
        { backgroundColor: tokens.surface, borderColor: tokens.border, color: tokens.ink },
        style as never,
      ]}
    />
  );
}

/* ---------- インライン通知（pending / error のみ。成功トーンは型で禁止） ---------- */
export function InlineNotice({ text, tone }: { text: string | null; tone: "pending" | "error" }) {
  const { tokens } = useTheme();
  if (!text) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.noticeBox,
        tone === "error"
          ? { backgroundColor: tokens.errorTint, borderColor: tokens.error }
          : { backgroundColor: tokens.surfaceHover, borderColor: tokens.border },
      ]}
    >
      {tone === "pending" && <ActivityIndicator size="small" color={tokens.ink2} />}
      <Text style={[styles.noticeText, { color: tone === "error" ? tokens.error : tokens.ink2 }]}>
        {text}
      </Text>
    </View>
  );
}

/* ---------- コピーボックス（幅固定・CLS ゼロ） ---------- */
export function CopyBox({ text, note }: { text: string; note?: string }) {
  const { tokens } = useTheme();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    hapticSuccessSafe();
    await Clipboard.setStringAsync(text).catch(() => {});
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View>
      <View style={[styles.copyWrap, { backgroundColor: tokens.ground, borderColor: tokens.border }]}>
        <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.copyCode, { color: tokens.ink2 }]}>
          {text}
        </Text>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => void handleCopy()}
          style={{ width: 112 }}
          icon={
            copied ? (
              <IconCheck size={15} color={tokens.success} />
            ) : (
              <IconLink size={15} color={tokens.ink} />
            )
          }
        >
          {copied ? "コピーした" : "コピー"}
        </Button>
      </View>
      {note && <Text style={[styles.fieldHint, { color: tokens.ink2 }]}>{note}</Text>}
    </View>
  );
}

function hapticSuccessSafe() {
  hapticImpact("light");
}

/* ---------- 日付ブロック・曜日色 ---------- */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function weekdayToneColor(date: string, tokens: ReturnType<typeof useTheme>["tokens"]): string {
  const wd = new Date(`${date}T00:00:00+09:00`).getDay();
  if (wd === 0 || getJapaneseHolidayName(date)) return tokens.error;
  return wd === 6 ? tokens.info : tokens.ink2;
}

export function DateBlock({
  date,
  days = 1,
  showMonth = true,
  muted,
}: {
  date: string;
  days?: number;
  showMonth?: boolean;
  muted?: boolean;
}) {
  const { tokens } = useTheme();
  const [, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(`${date}T00:00:00+09:00`).getDay()];
  return (
    <View style={[styles.dateBlock, muted && { opacity: 0.6 }]}>
      {showMonth && <Text style={[styles.dateSub, { color: tokens.ink2 }]}>{m}月</Text>}
      <Text style={[styles.dateDay, { color: tokens.ink }]}>{d}</Text>
      <Text style={[styles.dateSub, { color: days > 1 ? tokens.ink2 : weekdayToneColor(date, tokens) }]}>
        {days > 1 ? `${days}日間` : wd}
      </Text>
    </View>
  );
}

export function DateList({ dates, setDates }: { dates: string[]; setDates: (d: string[]) => void }) {
  const { tokens } = useTheme();
  function addDate() {
    const last = dates.at(-1) || todayStr();
    const base = new Date(`${last}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + 1);
    setDates([...dates, base.toISOString().slice(0, 10)]);
  }
  return (
    <View style={{ gap: 8 }}>
      {dates.map((d, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TextField
            value={d}
            placeholder="YYYY-MM-DD"
            accessibilityLabel={`実施日 ${i + 1}`}
            onChangeText={(val) => setDates(dates.map((item, idx) => (idx === i ? val : item)))}
            style={{ flex: 1 }}
          />
          {dates.length > 1 && (
            <IconButton
              accessibilityLabel={`実施日 ${i + 1} を削除`}
              onPress={() => setDates(dates.filter((_, idx) => idx !== i))}
            >
              <IconX size={16} color={tokens.ink2} />
            </IconButton>
          )}
        </View>
      ))}
      <View style={{ alignItems: "flex-start" }}>
        <Button size="sm" variant="quiet" onPress={addDate} icon={<IconPlus size={14} color={tokens.ink} />}>
          日を追加
        </Button>
      </View>
    </View>
  );
}

export function TimeRange({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
}) {
  const { tokens } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextField
          value={start}
          onChangeText={setStart}
          placeholder="21:00"
          accessibilityLabel="開始時刻（JST）"
          style={{ width: 92, textAlign: "center" }}
        />
        <Text style={{ color: tokens.ink2, fontSize: 15 }}>〜</Text>
        <TextField
          value={end}
          onChangeText={setEnd}
          placeholder="25:00"
          accessibilityLabel="終了時刻（JST）"
          style={{ width: 92, textAlign: "center" }}
        />
      </View>
      <Text style={[styles.fieldHint, { color: tokens.ink2 }]}>
        日付をまたぐときは 25:30 のように書きます。
      </Text>
    </View>
  );
}

/* ---------- 空状態・見つからない ---------- */
export function EmptyState({
  kind = "first",
  icon,
  title,
  children,
  action,
}: {
  kind?: "first" | "filtered" | "permission";
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { tokens } = useTheme();
  const defaults = {
    first: { icon: <IconBooks size={28} color={tokens.ink3} />, title: "まだ記録がありません" },
    filtered: {
      icon: <IconFilter size={28} color={tokens.ink3} />,
      title: "条件に一致するものがありません",
    },
    permission: {
      icon: <IconLock size={28} color={tokens.ink3} />,
      title: "表示できるものがありません",
    },
  }[kind];

  return (
    <View style={styles.emptyWrap}>
      {icon ?? defaults.icon}
      <Text style={[styles.emptyTitle, { color: tokens.ink }]}>{title ?? defaults.title}</Text>
      {children && <Text style={[styles.emptyBody, { color: tokens.ink2 }]}>{children}</Text>}
      {action && <View style={styles.emptyActions}>{action}</View>}
    </View>
  );
}

export function NotFound({ what }: { what: string }) {
  return (
    <Surface>
      <EmptyState kind="permission" title={`この${what}は見つかりません`}>
        削除されたか、閲覧できる範囲の外にあります。
      </EmptyState>
    </Surface>
  );
}

/* ---------- 暖色ペーパースケルトン（CLS ゼロ） ---------- */
export function WarmSkeleton({ height = 72, lines = 2 }: { height?: number; lines?: number }) {
  const { tokens } = useTheme();
  /* 値は最初の描画で一度だけ作る（ref を描画中に読まない） */
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    if (isReduceMotionEnabled()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Surface style={{ padding: 16, minHeight: height, justifyContent: "center", gap: 10 }}>
      {Array.from({ length: lines }).map((_, idx) => (
        <Animated.View
          key={idx}
          style={{
            height: idx === 0 ? 16 : 12,
            width: idx === 0 ? "62%" : "86%",
            borderRadius: 6,
            backgroundColor: tokens.surfaceHover,
            opacity,
          }}
        />
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: 1,
  },
  brandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingRight: 4,
  },
  brandText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  demoPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  demoPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  syncSlot: {
    flex: 1,
    minWidth: 70,
    alignItems: "flex-end",
    justifyContent: "center",
    height: 28,
  },
  syncSlotInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  syncSlotText: {
    fontSize: 12,
    fontWeight: "500",
  },
  avatarHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    borderWidth: 1,
    borderRadius: RADII.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sysDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metaText: {
    fontSize: 13,
    lineHeight: 18,
  },
  surface: {
    borderWidth: 1,
    borderRadius: RADII.md,
    overflow: "hidden",
  },
  rowPadding: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  btnBase: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADII.sm,
  },
  btnMd: {
    minHeight: 44,
    paddingHorizontal: 16,
  },
  btnSm: {
    minHeight: 36,
    paddingHorizontal: 12,
  },
  btnText: {
    fontWeight: "700",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: RADII.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  segTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderRadius: RADII.sm,
    padding: 3,
    gap: 2,
    alignSelf: "flex-start",
  },
  segItem: {
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  segText: {},
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetContainer: {
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: "90%",
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 8,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetBody: {
    padding: 18,
  },
  sheetFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderRadius: RADII.sm,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  selectOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: RADII.sm,
  },
  selectOptionText: {
    flex: 1,
    fontSize: 15,
  },
  pageHead: {
    marginBottom: 18,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    minHeight: 36,
    marginBottom: 4,
    marginLeft: -4,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: "500",
  },
  pageHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  h1: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  pageHeadActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 10,
  },
  h2: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  h3: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  subText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 4,
  },
  settingRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  settingRowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  settingDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  settingControl: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  formRow: {
    paddingVertical: 10,
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  fieldError: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: RADII.sm,
    minHeight: 44,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  copyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 5,
  },
  copyCode: {
    flex: 1,
    fontSize: 13,
  },
  dateBlock: {
    width: 48,
    alignItems: "center",
  },
  dateDay: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
  },
  dateSub: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    textAlign: "center",
  },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
});
