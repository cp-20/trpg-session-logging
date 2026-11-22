import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type FlatListProps } from "react-native";
import * as Clipboard from "expo-clipboard";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { identiconDataUri } from "@shared/lib/identicon";
import { fmtDate, fmtDateShort, jstTime, sessionDay } from "@shared/lib/time";
import type { Log, Msg, MsgKind, State } from "@shared/types";
import { hapticImpact, hapticSelection, isReduceMotionEnabled } from "../native/haptics";
import { loadReadingProgress, saveReadingProgress } from "../store/reading-progress";
import { useTheme } from "../theme/ThemeProvider";
import { RADII } from "../theme/tokens";
import { AvatarImage, SpeakerConfigList } from "./identity";
import {
  IconArrowDown,
  IconArrowUp,
  IconBookmark,
  IconCalendarTime,
  IconDice,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconLock,
  IconSearch,
  IconX,
} from "./icons";
import { BottomSheet, Button, IconButton, Seg, Select, Tag, TextField, Toggle } from "./ui";

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 30 };

export interface SpeakerMeta {
  iconUrl: string;
  color: string;
  plName?: string;
  roleLabel: string;
}

/** 誰とも結び付かない発言者の顔。発言者名を種にした既定の画像（GM 側は円印、ほかはコマ）。Web の timeline と同じ */
function speakerFallbackSvg(sp: string, kind: Msg["kind"]): string {
  const isKeeper = kind === "KP" || kind === "GM" || kind === "SYSTEM";
  return identiconDataUri(sp, isKeeper ? "user" : "character");
}

export function resolveSpeakerMeta(sp: string, kind: Msg["kind"], log: Log, state: State): SpeakerMeta {
  const characters = state?.characters ?? {};
  const users = state?.users ?? {};
  const iconRef = log?.speakerIcons?.[sp];
  const charByName = Object.values(characters).find((c) => c.name === sp);
  const charByRef = iconRef ? characters[iconRef] : undefined;
  const matchedChar = charByName ?? charByRef;
  const userByName = Object.values(users).find((u) => u.name === sp);
  const userByRef = iconRef ? users[iconRef] : undefined;
  const matchedUser = userByName ?? userByRef;

  const plName = matchedChar ? users[matchedChar.ownerId]?.name : undefined;
  const color =
    kind === "KP" || kind === "GM" ? "#6b5d50" : (matchedChar?.color ?? matchedUser?.color ?? "#856e5c");

  let iconUrl: string | undefined;
  if (iconRef) {
    if (iconRef.startsWith("data:") || iconRef.startsWith("http")) iconUrl = iconRef;
    else if (characters[iconRef]?.image) iconUrl = characters[iconRef].image;
    else if (users[iconRef]?.image) iconUrl = users[iconRef].image;
  }
  if (!iconUrl && charByName?.image) iconUrl = charByName.image;
  if (!iconUrl && (kind === "KP" || kind === "GM") && log?.ownerId && users[log.ownerId]?.image) {
    iconUrl = users[log.ownerId].image;
  }
  if (!iconUrl && userByName?.image) iconUrl = userByName.image;
  if (!iconUrl) iconUrl = speakerFallbackSvg(sp, kind);

  return { iconUrl, color, plName, roleLabel: kind };
}

const ROLE_LABEL: Record<Msg["kind"], string> = {
  PC: "PC",
  NPC: "NPC",
  ENEMY: "エネミー",
  KP: "GM",
  GM: "GM",
  PL: "PL",
  SYSTEM: "システム",
};

type RollFilter = "all" | "rolls" | "decisive";

type Row = { m: Msg; chName?: string; secret: boolean };

type ReaderItem =
  | { kind: "day"; key: string; date: string }
  | { kind: "note"; key: string; row: Row }
  | { kind: "msg"; key: string; row: Row; grouped: boolean; meta: SpeakerMeta };

function RollResult({ result }: { result: string }) {
  const { tokens } = useTheme();
  if (/クリティカル|スペシャル/.test(result)) return <Tag v="ok">{result}</Tag>;
  if (/ファンブル/.test(result)) return <Tag v="danger">{result}</Tag>;
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "700",
        color: /失敗/.test(result) ? tokens.ink2 : tokens.ink,
      }}
    >
      {result}
    </Text>
  );
}

function SecretMark({ name }: { name: string }) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.secretBadge, { backgroundColor: tokens.warningTint }]}>
      <IconLock size={12} color={tokens.warning} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: tokens.warning }}>シークレット・{name}</Text>
    </View>
  );
}

export function LogReader({
  log,
  state,
  isOwner,
  onUpdateSpeaker,
  headerSlot,
  footerSlot,
}: {
  log: Log;
  state: State;
  isOwner?: boolean;
  onUpdateSpeaker?: {
    speakers: { sp: string; kind: MsgKind }[];
    onRoleChange: (sp: string, kind: MsgKind) => void;
    onIconChange: (sp: string, iconSrc: string) => void;
  };
  headerSlot?: React.ReactElement;
  footerSlot?: React.ReactElement;
}) {
  const { tokens } = useTheme();
  const listRef = useRef<FlatList<ReaderItem>>(null);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [rollFilter, setRollFilter] = useState<RollFilter>("all");
  const [hideSecrets, setHideSecrets] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [keepAwake, setKeepAwake] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [speakerConfigOpen, setSpeakerConfigOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<Row | null>(null);
  const [progress, setProgress] = useState(() => loadReadingProgress(log.id));
  const [resumeBannerDismissed, setResumeBannerDismissed] = useState(false);

  useEffect(() => {
    if (!keepAwake) return;
    void activateKeepAwakeAsync("takufu-reader").catch(() => {});
    return () => {
      void deactivateKeepAwake("takufu-reader").catch(() => {});
    };
  }, [keepAwake]);

  const rows = useMemo(() => {
    const msgs: Row[] = [];
    const needle = query.trim().toLowerCase();
    log.channels.forEach((c) => {
      if (channel !== "all" && c.id !== channel) return;
      c.msgs.forEach((m) => {
        if (rollFilter === "rolls" && !m.roll) return;
        if (
          rollFilter === "decisive" &&
          (!m.roll || !/クリティカル|スペシャル|ファンブル/.test(m.roll.result))
        ) {
          return;
        }
        if (
          needle &&
          !(
            (m.text ?? "").toLowerCase().includes(needle) ||
            m.sp.toLowerCase().includes(needle) ||
            (m.roll?.cmd ?? "").toLowerCase().includes(needle)
          )
        ) {
          return;
        }
        msgs.push({
          m,
          secret: c.secret,
          chName: c.secret || c.name !== "メイン" ? c.name : undefined,
        });
      });
    });
    return msgs.sort((a, b) => a.m.ts - b.m.ts);
  }, [log, channel, query, rollFilter]);

  const speakerMap = useMemo(() => {
    const map = new Map<string, SpeakerMeta>();
    for (const { m } of rows) {
      const key = `${m.kind}:${m.sp}`;
      if (!map.has(key)) {
        map.set(key, resolveSpeakerMeta(m.sp, m.kind, log, state));
      }
    }
    return map;
  }, [rows, log, state]);

  const items = useMemo<ReaderItem[]>(() => {
    const out: ReaderItem[] = [];
    let lastDay = "";
    let prev: Row | null = null;
    for (const row of rows) {
      const { m } = row;
      const d = sessionDay(m.ts);
      if (d !== lastDay) {
        out.push({ kind: "day", key: `day-${d}-${out.length}`, date: d });
        lastDay = d;
        prev = null;
      }
      if (m.type === "note") {
        out.push({ kind: "note", key: m.id, row });
        prev = null;
        continue;
      }
      const grouped =
        prev !== null &&
        prev.m.sp === m.sp &&
        prev.m.kind === m.kind &&
        prev.chName === row.chName &&
        m.ts - prev.m.ts < 5 * 60;
      const meta = speakerMap.get(`${m.kind}:${m.sp}`)!;
      out.push({ kind: "msg", key: m.id, row, grouped, meta });
      prev = row;
    }
    return out;
  }, [rows, speakerMap]);

  const dayIndices = useMemo(() => {
    const out: { date: string; index: number }[] = [];
    items.forEach((it, idx) => {
      if (it.kind === "day") out.push({ date: it.date, index: idx });
    });
    return out;
  }, [items]);

  const jumpToIndex = useCallback(
    (index: number) => {
      if (items.length === 0) return;
      const bounded = Math.max(0, Math.min(items.length - 1, index));
      hapticSelection();
      listRef.current?.scrollToIndex({
        index: bounded,
        animated: !isReduceMotionEnabled(),
        viewPosition: 0.1,
      });
    },
    [items.length],
  );

  const manualMsgId = progress?.manualMsgId;
  const manualIndex = useMemo(() => {
    if (!manualMsgId) return -1;
    return items.findIndex((it) => (it.kind === "msg" || it.kind === "note") && it.row.m.id === manualMsgId);
  }, [items, manualMsgId]);

  const autoMsgId = progress?.autoMsgId;
  const savedAutoIndex = progress?.autoIndex;
  const autoIndex = useMemo(() => {
    if (autoMsgId) {
      const idx = items.findIndex(
        (it) => (it.kind === "msg" || it.kind === "note") && it.row.m.id === autoMsgId,
      );
      if (idx >= 12) return idx;
    }
    if (savedAutoIndex && savedAutoIndex >= 12 && savedAutoIndex < items.length) {
      return savedAutoIndex;
    }
    return -1;
  }, [items, autoMsgId, savedAutoIndex]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logIdRef = useRef(log.id);
  useEffect(() => {
    logIdRef.current = log.id;
  }, [log.id]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: Parameters<NonNullable<FlatListProps<ReaderItem>["onViewableItemsChanged"]>>[0]) => {
      const first = viewableItems[0];
      if (!first || first.index == null || first.index < 5) return;
      const item = first.item as ReaderItem;
      const msgId = item.kind === "msg" || item.kind === "note" ? item.row.m.id : undefined;
      const idx = first.index;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveReadingProgress(logIdRef.current, { autoMsgId: msgId, autoIndex: idx });
      }, 400);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const targetResumeIdx = manualIndex >= 0 ? manualIndex : autoIndex;
  const showResumeBar =
    !resumeBannerDismissed &&
    query.trim() === "" &&
    channel === "all" &&
    rollFilter === "all" &&
    targetResumeIdx >= 0;

  const controlsHeader = (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      {headerSlot}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[styles.searchBar, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <IconSearch size={16} color={tokens.ink3} />
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="本文・発言者で絞り込み…"
            accessibilityLabel="ログを絞り込み"
            style={{ flex: 1, borderWidth: 0, minHeight: 38, paddingHorizontal: 4 }}
          />
          {query !== "" && (
            <IconButton accessibilityLabel="検索をクリア" onPress={() => setQuery("")}>
              <IconX size={15} color={tokens.ink2} />
            </IconButton>
          )}
        </View>
        <IconButton accessibilityLabel="読書メニュー" onPress={() => setOptionsOpen(true)}>
          <IconDots size={20} color={tokens.ink} />
        </IconButton>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Seg<RollFilter>
          size="sm"
          value={rollFilter}
          onChange={setRollFilter}
          options={[
            { v: "all", label: "すべて" },
            { v: "rolls", label: "ダイス" },
            { v: "decisive", label: "決定的な出目" },
          ]}
        />
        {log.channels.length > 1 && (
          <Select
            size="sm"
            ariaLabel="タブで絞り込み"
            value={channel}
            onChange={setChannel}
            style={{ minWidth: 140, flex: 1 }}
            options={[
              { value: "all", label: "すべてのタブ" },
              ...log.channels.map((c) => ({
                value: c.id,
                label: `${c.name}${c.secret ? "（シークレット）" : ""}`,
              })),
            ]}
          />
        )}
      </View>

      {dayIndices.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {dayIndices.map((d, i) => (
            <Button key={d.date} size="sm" variant="quiet" onPress={() => jumpToIndex(d.index)}>
              {`${i + 1}日目（${fmtDateShort(d.date)}）`}
            </Button>
          ))}
        </View>
      )}

      {showResumeBar && (
        <View style={[styles.resumeBar, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <IconBookmark size={16} color={tokens.primary} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: tokens.ink }}>
            {manualIndex >= 0 ? "しおりの位置から読む" : "前回の続きから読む"}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              jumpToIndex(targetResumeIdx);
              setResumeBannerDismissed(true);
            }}
          >
            移動
          </Button>
          <IconButton accessibilityLabel="案内を閉じる" onPress={() => setResumeBannerDismissed(true)}>
            <IconX size={15} color={tokens.ink2} />
          </IconButton>
        </View>
      )}
    </View>
  );

  return (
    <>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.key}
        ListHeaderComponent={controlsHeader}
        ListFooterComponent={footerSlot}
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
            <Text style={{ fontSize: 14, color: tokens.ink2 }}>条件に合う発言はありません</Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 36 }}
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={9}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={handleViewableItemsChanged}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, averageItemLength * index),
            animated: false,
          });
        }}
        renderItem={({ item }) => {
          if (item.kind === "day") {
            return (
              <View style={styles.daySep}>
                <View style={[styles.dayLine, { backgroundColor: tokens.border }]} />
                <View style={styles.dayLabelWrap}>
                  <IconCalendarTime size={14} color={tokens.ink2} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.ink2 }}>
                    {fmtDate(item.date)}
                  </Text>
                </View>
                <View style={[styles.dayLine, { backgroundColor: tokens.border }]} />
              </View>
            );
          }

          if (item.kind === "note") {
            const { m, chName, secret } = item.row;
            const masked = hideSecrets && secret && !revealedIds[m.id];
            return (
              <Pressable
                onLongPress={() => {
                  hapticImpact("light");
                  setActionMsg(item.row);
                }}
                onPress={masked ? () => setRevealedIds((prev) => ({ ...prev, [m.id]: true })) : undefined}
                style={styles.noteLine}
              >
                <View style={[styles.dayLine, { backgroundColor: tokens.border }]} />
                <View style={styles.noteCenter}>
                  <IconFileText size={14} color={tokens.ink3} />
                  <Text style={{ fontSize: 13, color: tokens.ink2, textAlign: "center" }}>
                    {masked ? "シークレット記述（タップで表示）" : m.text}
                  </Text>
                  {secret && chName ? (
                    <SecretMark name={chName} />
                  ) : (
                    chName && <Text style={{ fontSize: 12, color: tokens.ink3 }}>#{chName}</Text>
                  )}
                  <Text style={{ fontSize: 11, color: tokens.ink3, fontVariant: ["tabular-nums"] }}>
                    {jstTime(m.ts)}
                  </Text>
                </View>
                <View style={[styles.dayLine, { backgroundColor: tokens.border }]} />
              </Pressable>
            );
          }

          const { row, grouped, meta } = item;
          const { m, chName, secret } = row;
          const masked = hideSecrets && secret && !revealedIds[m.id];
          const isBookmarked = progress?.manualMsgId === m.id;

          return (
            <Pressable
              onLongPress={() => {
                hapticImpact("light");
                setActionMsg(row);
              }}
              onPress={masked ? () => setRevealedIds((prev) => ({ ...prev, [m.id]: true })) : undefined}
              style={({ pressed }) => [
                styles.msgRow,
                grouped ? { paddingVertical: 3 } : { paddingTop: 10, paddingBottom: 3, marginTop: 4 },
                secret && { backgroundColor: tokens.warningTint },
                isBookmarked && { borderLeftWidth: 3, borderLeftColor: tokens.primary },
                pressed && { backgroundColor: tokens.surfaceHover },
              ]}
            >
              <View style={{ width: 36, alignItems: "center" }}>
                {!grouped && <AvatarImage uri={meta.iconUrl} size={36} label={m.sp} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {!grouped && (
                  <View style={styles.msgHeader}>
                    <Text style={[styles.speakerName, { color: tokens.ink }]} numberOfLines={1}>
                      {m.sp}
                    </Text>
                    <Text style={{ fontSize: 12, color: tokens.ink2 }}>
                      {meta.plName ? `PC · ${meta.plName}` : (ROLE_LABEL[m.kind] ?? meta.roleLabel)}
                    </Text>
                    {secret && chName && <SecretMark name={chName} />}
                    {!secret && chName && <Text style={{ fontSize: 12, color: tokens.ink3 }}>#{chName}</Text>}
                    <Text
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        color: tokens.ink3,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {jstTime(m.ts)}
                    </Text>
                  </View>
                )}

                {masked ? (
                  <Text style={{ fontSize: 14, color: tokens.ink2, paddingVertical: 4 }}>
                    シークレット発言（タップで一時表示）
                  </Text>
                ) : m.type === "roll" && m.roll ? (
                  <View
                    style={[styles.rollBox, { backgroundColor: tokens.surface, borderColor: tokens.border }]}
                  >
                    <IconDice size={15} color={tokens.ink2} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>{m.roll.cmd}</Text>
                    <Text style={{ fontSize: 12, color: tokens.ink2 }}>{m.roll.dice}</Text>
                    <Text style={{ fontSize: 12, color: tokens.ink3 }}>→</Text>
                    <RollResult result={m.roll.result} />
                  </View>
                ) : (
                  <Text style={[styles.msgBody, { color: tokens.ink }]}>{m.text}</Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {/* 発言の長押しメニュー */}
      <BottomSheet
        visible={Boolean(actionMsg)}
        title={actionMsg ? `${actionMsg.m.sp} の発言` : "発言"}
        onClose={() => setActionMsg(null)}
      >
        {actionMsg && (
          <View style={{ gap: 10 }}>
            <Button
              variant="secondary"
              fullWidth
              icon={<IconBookmark size={16} color={tokens.primary} />}
              onPress={() => {
                const next = saveReadingProgress(log.id, {
                  manualMsgId: actionMsg.m.id,
                  manualLabel: `${actionMsg.m.sp} (${jstTime(actionMsg.m.ts)})`,
                });
                setProgress(next);
                setActionMsg(null);
              }}
            >
              ここに しおり を挟む
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onPress={async () => {
                const content = actionMsg.m.roll
                  ? `${actionMsg.m.sp}: ${actionMsg.m.roll.cmd} (${actionMsg.m.roll.dice}) → ${actionMsg.m.roll.result}`
                  : `${actionMsg.m.sp}: ${actionMsg.m.text ?? ""}`;
                await Clipboard.setStringAsync(content).catch(() => {});
                setActionMsg(null);
              }}
            >
              発言をコピー
            </Button>
            <Button
              variant="quiet"
              fullWidth
              onPress={() => {
                setQuery(actionMsg.m.sp);
                setActionMsg(null);
              }}
            >
              この発言者で絞り込む
            </Button>
          </View>
        )}
      </BottomSheet>

      {/* 読書オプションメニュー */}
      <BottomSheet visible={optionsOpen} title="ログの表示と操作" onClose={() => setOptionsOpen(false)}>
        <View style={{ gap: 14 }}>
          <View style={styles.optRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                読書中は画面を消灯しない
              </Text>
              <Text style={{ fontSize: 13, color: tokens.ink2, marginTop: 2 }}>
                セッション中に端末が自動ロックされるのを防ぎます。
              </Text>
            </View>
            <Toggle label="読書中は画面を消灯しない" on={keepAwake} onChange={setKeepAwake} />
          </View>

          <View style={styles.optRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                シークレット発言を伏せる
              </Text>
              <Text style={{ fontSize: 13, color: tokens.ink2, marginTop: 2 }}>
                対面で画面を見せるときに、秘匿タブの本文をタップするまで隠します。
              </Text>
            </View>
            <Toggle
              label="シークレット発言を伏せる"
              on={hideSecrets}
              onChange={(v) => {
                setHideSecrets(v);
                if (!v) setRevealedIds({});
              }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              icon={<IconArrowUp size={15} color={tokens.ink} />}
              onPress={() => {
                setOptionsOpen(false);
                jumpToIndex(0);
              }}
            >
              最初へ
            </Button>
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              icon={<IconArrowDown size={15} color={tokens.ink} />}
              onPress={() => {
                setOptionsOpen(false);
                jumpToIndex(items.length - 1);
              }}
            >
              最後へ
            </Button>
          </View>

          {isOwner && onUpdateSpeaker && onUpdateSpeaker.speakers.length > 0 && (
            <Button
              variant="secondary"
              fullWidth
              icon={
                hideSecrets ? (
                  <IconEye size={16} color={tokens.ink} />
                ) : (
                  <IconEyeOff size={16} color={tokens.ink} />
                )
              }
              onPress={() => {
                setOptionsOpen(false);
                setSpeakerConfigOpen(true);
              }}
            >
              発言者のアイコンと役割
            </Button>
          )}
        </View>
      </BottomSheet>

      {isOwner && onUpdateSpeaker && (
        <BottomSheet
          visible={speakerConfigOpen}
          title="発言者のアイコンと役割"
          onClose={() => setSpeakerConfigOpen(false)}
          footer={
            <Button variant="quiet" onPress={() => setSpeakerConfigOpen(false)}>
              閉じる
            </Button>
          }
        >
          <SpeakerConfigList
            speakers={onUpdateSpeaker.speakers}
            speakerIcons={log.speakerIcons ?? {}}
            state={state}
            onRoleChange={onUpdateSpeaker.onRoleChange}
            onIconChange={onUpdateSpeaker.onIconChange}
          />
        </BottomSheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 10,
    paddingRight: 2,
    gap: 4,
  },
  resumeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 6,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: 28,
    alignItems: "center",
  },
  daySep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 14,
  },
  dayLine: {
    flex: 1,
    height: 1,
  },
  dayLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  noteLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 10,
  },
  noteCenter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    maxWidth: "82%",
  },
  msgRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 8,
    borderRadius: RADII.sm,
  },
  msgHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 2,
  },
  speakerName: {
    fontSize: 14,
    fontWeight: "700",
  },
  msgBody: {
    fontSize: 15,
    lineHeight: 24,
  },
  rollBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 2,
  },
  secretBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
