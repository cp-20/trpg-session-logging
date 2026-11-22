import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS, SYSTEM_LIST, carriedStats } from "@shared/data/systems";
import { recentSystemIds, systemOptions } from "@shared/lib/system-options";
import { toCharacterFields, type ParsedCharacter } from "@shared/lib/importers";
import {
  SHEET_SITES,
  bioFromMemo,
  describeSheetUrl,
  extractArchetypeFromMemo,
} from "@shared/lib/external-sync";
import { currentCarriedValue } from "@shared/lib/character-growth";
import { fmtDateShort, todayStr, uid } from "@shared/lib/time";
import type { Character, ExternalSyncConfig, ExternalSyncProvider } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { CharAvatar } from "../../components/identity";
import { IconFileText, IconPlus, IconSearch, IconX } from "../../components/icons";
import {
  BottomSheet,
  Button,
  Combobox,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  InteractiveRow,
  MetaRow,
  PageHead,
  Surface,
  SysBadge,
  TextField,
} from "../../components/ui";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { DEFAULT_ENTITY_COLOR, RADII } from "../../theme/tokens";

/** 卓をまたいで続く値（SAN など）の今の値。セッションの記録とキャラシのうち新しいほう */
export function currentStat(c: Character, key: string): number | undefined {
  return currentCarriedValue(c, key);
}

export function lastPlayed(c: Character): string | undefined {
  return c.sessions.reduce<string | undefined>((max, s) => (!max || s.date > max ? s.date : max), undefined);
}

export default function CharactersScreen() {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");
  /* ホームでコピーしたキャラシの URL を開いたときは、その URL で取り込みを始める */
  const { sheetUrl } = useLocalSearchParams<{ sheetUrl?: string }>();
  const [importOpen, setImportOpen] = useState(Boolean(sheetUrl));
  const [manualOpen, setManualOpen] = useState(false);

  const myChars = useMemo(
    () => Object.values(state.characters).filter((c) => c.ownerId === state.me),
    [state.characters, state.me],
  );
  const usedSystems = useMemo(() => new Set(myChars.map((c) => c.systemId)), [myChars]);

  const list = useMemo(() => {
    let items = myChars;
    if (sys !== "all") items = items.filter((c) => c.systemId === sys);
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      items = items.filter((c) => (c.name + c.archetype + c.tags.join()).toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => (lastPlayed(b) ?? "").localeCompare(lastPlayed(a) ?? ""));
  }, [myChars, q, sys]);

  const actions = (
    <>
      <Button
        variant="primary"
        icon={<IconFileText size={16} color={tokens.primaryContent} />}
        onPress={() => setImportOpen(true)}
      >
        キャラシから取り込む
      </Button>
      <Button
        variant="secondary"
        icon={<IconPlus size={16} color={tokens.ink} />}
        onPress={() => setManualOpen(true)}
      >
        キャラシなしで作る
      </Button>
    </>
  );

  return (
    <ScreenShell>
      <PageHead title="キャラクター" actions={myChars.length > 0 ? actions : undefined} />

      {myChars.length === 0 ? (
        <Surface>
          <EmptyState kind="first" title="キャラシの URL から取り込めます" action={actions}>
            {SHEET_SITES.map((x) => x.label).join("　")}
          </EmptyState>
        </Surface>
      ) : (
        <>
          {myChars.length > 4 && (
            <View style={{ gap: 8, marginBottom: 16 }}>
              <View
                style={[styles.searchWrap, { backgroundColor: tokens.surface, borderColor: tokens.border }]}
              >
                <IconSearch size={16} color={tokens.ink3} />
                <TextField
                  value={q}
                  onChangeText={setQ}
                  placeholder="名前・職業・タグで検索"
                  accessibilityLabel="キャラクターを検索"
                  style={{ flex: 1, borderWidth: 0, minHeight: 40, paddingHorizontal: 4 }}
                />
                {q !== "" && (
                  <IconButton accessibilityLabel="検索をクリア" onPress={() => setQ("")}>
                    <IconX size={15} color={tokens.ink2} />
                  </IconButton>
                )}
              </View>
              {usedSystems.size > 1 && (
                <Combobox
                  ariaLabel="システムで絞り込む"
                  value={sys}
                  onChange={setSys}
                  options={[
                    { value: "all", label: "すべてのシステム" },
                    ...systemOptions(SYSTEM_LIST.filter((x) => usedSystems.has(x.id))),
                  ]}
                />
              )}
            </View>
          )}

          {list.length === 0 ? (
            <Surface>
              <EmptyState
                kind="filtered"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setQ("");
                      setSys("all");
                    }}
                  >
                    絞り込みを解除
                  </Button>
                }
              />
            </Surface>
          ) : (
            <Surface>
              <DividerList>
                {list.map((c) => {
                  const sdef = SYSTEMS[c.systemId];
                  const last = lastPlayed(c);
                  const stats = carriedStats(sdef).filter((st) => currentStat(c, st.key) != null);
                  return (
                    <InteractiveRow
                      key={c.id}
                      onPress={() => router.push(`/characters/${c.id}` as never)}
                      accessibilityLabel={c.name}
                    >
                      <View style={styles.cardRow}>
                        <CharAvatar c={c} size={64} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }}
                            numberOfLines={1}
                          >
                            {c.name}
                          </Text>
                          {c.archetype !== "" && (
                            <Text
                              style={{ fontSize: 13, color: tokens.ink2, marginTop: 1 }}
                              numberOfLines={1}
                            >
                              {c.archetype}
                            </Text>
                          )}
                          <MetaRow style={{ marginTop: 6 }}>
                            <SysBadge sys={sdef} />
                          </MetaRow>
                          <MetaRow style={{ marginTop: 3 }}>
                            {stats.map((st) => (
                              <Text
                                key={st.key}
                                style={{ fontSize: 12, color: tokens.ink2, fontVariant: ["tabular-nums"] }}
                              >
                                {st.label}{" "}
                                <Text style={{ fontWeight: "700", color: tokens.ink }}>
                                  {currentStat(c, st.key)}
                                </Text>
                              </Text>
                            ))}
                            <Text style={{ fontSize: 12, color: tokens.ink2 }}>
                              {last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}
                            </Text>
                          </MetaRow>
                        </View>
                      </View>
                    </InteractiveRow>
                  );
                })}
              </DividerList>
            </Surface>
          )}
        </>
      )}

      {importOpen && (
        <ImportCharacterSheet initialUrl={sheetUrl ?? ""} onClose={() => setImportOpen(false)} />
      )}
      {manualOpen && <NewCharacterSheet onClose={() => setManualOpen(false)} />}
    </ScreenShell>
  );
}

type ExternalSheetResponse = {
  ok: boolean;
  kind?: string;
  provider?: ExternalSyncProvider;
  providerLabel?: string;
  url?: string;
  contentHash?: string;
  fetchedAt?: string;
  character?: ParsedCharacter;
  error?: string;
};

/** キャラシの URL を卓譜のサーバー経由で読む（P6: URL から読める構造化データだけ） */
async function requestExternalSheet(url: string): Promise<ExternalSheetResponse> {
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";
  try {
    const res = await fetch(`${origin}/api/import/external`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = (await res.json()) as ExternalSheetResponse;
    if (!res.ok || !data.ok || data.kind !== "character" || !data.character) {
      return { ok: false, error: data.error ?? "キャラシを読み込めませんでした。" };
    }
    return data;
  } catch {
    return { ok: false, error: "キャラシのサイトと通信できませんでした。" };
  }
}

/** キャラシの URL から取り込む。名前・能力値はキャラシのままなので入力欄にしない（P3） */
function ImportCharacterSheet({ initialUrl, onClose }: { initialUrl: string; onClose: () => void }) {
  const { tokens } = useTheme();
  const { update } = useMobileStore();
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<{
    fields: Partial<Character>;
    sync: ExternalSyncConfig;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const site = describeSheetUrl(url);

  async function load() {
    if (site.state === "invalid") {
      setError(site.message);
      return;
    }
    if (site.state !== "ok" || parsing) return;
    setParsing(true);
    setError(null);
    const data = await requestExternalSheet(site.url);
    setParsing(false);
    if (!data.ok || !data.character || !data.provider) {
      setError(data.error ?? "キャラシを読み込めませんでした。");
      return;
    }
    const fields = toCharacterFields(data.character, "general");
    const sheetUrl = data.url ?? site.url;
    setPreview({
      label: data.providerLabel ?? site.label,
      fields: {
        ...fields,
        bio: bioFromMemo(data.character.memo),
        archetype: extractArchetypeFromMemo(data.character.memo),
        ...(fields.sheet ? { sheet: { ...fields.sheet, url: sheetUrl, fetchedAt: data.fetchedAt } } : {}),
      },
      sync: {
        provider: data.provider,
        url: sheetUrl,
        lastSyncedAt: data.fetchedAt ?? new Date().toISOString(),
        lastStatus: "ok",
        contentHash: data.contentHash,
        autoSync: true,
      },
    });
  }

  function save() {
    if (!preview?.fields.name?.trim()) return;
    const { fields, sync, label } = preview;
    const id = `ch_${uid()}`;
    update((state) => {
      state.characters[id] = {
        id,
        ownerId: state.me,
        name: fields.name!.trim(),
        systemId: fields.systemId ?? "general",
        color: fields.color ?? DEFAULT_ENTITY_COLOR,
        image: fields.image,
        archetype: fields.archetype?.trim() ?? "",
        bio: fields.bio?.trim() ?? "",
        tags: [],
        stats: { ...fields.stats },
        sessions: [],
        growth: [],
        share: {
          enabled: false,
          scope: "private",
          includeProfile: true,
          includeStats: true,
          includeGrowth: true,
          includeSessions: true,
        },
        import: { source: label, importedAt: todayStr() },
        externalSync: sync,
        ...(fields.sheet ? { sheet: fields.sheet } : {}),
      };
    });
    hapticSuccess();
    onClose();
    router.push(`/characters/${id}` as never);
  }

  return (
    <BottomSheet
      visible
      title="キャラシから取り込む"
      onClose={onClose}
      footer={
        preview ? (
          <>
            <Button variant="quiet" onPress={() => setPreview(null)}>
              戻る
            </Button>
            <Button variant="primary" onPress={save}>
              取り込む
            </Button>
          </>
        ) : (
          <>
            <Button variant="quiet" onPress={onClose}>
              キャンセル
            </Button>
            <Button variant="primary" disabled={parsing || !url.trim()} onPress={() => void load()}>
              {parsing ? "読み込み中…" : "読み込む"}
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <View style={{ gap: 8 }}>
          <Field label="キャラシの URL" noMargin>
            <TextField
              value={url}
              keyboardType="url"
              autoCapitalize="none"
              onChangeText={(v) => {
                setUrl(v);
                setError(null);
              }}
              placeholder="https://charaeno.com/7th/…"
            />
          </Field>
          <Text style={{ fontSize: 12, color: tokens.ink2 }}>
            {site.state === "ok" ? site.label : SHEET_SITES.map((x) => x.label).join("　")}
          </Text>
          <FieldError text={error} />
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.ink }}>{preview.fields.name}</Text>
          <MetaRow>
            {preview.fields.archetype ? (
              <Text style={{ fontSize: 13, color: tokens.ink2 }}>{preview.fields.archetype}</Text>
            ) : null}
            <SysBadge sys={SYSTEMS[preview.fields.systemId ?? "general"]} />
            <Text style={{ fontSize: 13, color: tokens.ink2 }}>{preview.label}</Text>
          </MetaRow>
        </View>
      )}
    </BottomSheet>
  );
}

function NewCharacterSheet({ onClose }: { onClose: () => void }) {
  const { state, update } = useMobileStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState("");
  const [systemId, setSystemId] = useState("coc7");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    const id = `ch_${uid()}`;
    update((s) => {
      s.characters[id] = {
        id,
        ownerId: s.me,
        name: name.trim(),
        systemId,
        color: DEFAULT_ENTITY_COLOR,
        archetype: archetype.trim(),
        bio: bio.trim(),
        tags: [],
        stats: {},
        sessions: [],
        growth: [],
        share: {
          enabled: false,
          scope: "private",
          includeProfile: true,
          includeStats: true,
          includeGrowth: true,
          includeSessions: true,
        },
      };
    });
    hapticSuccess();
    onClose();
    router.push(`/characters/${id}` as never);
  }

  return (
    <BottomSheet
      visible
      title="キャラクターを手入力"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={save}>
            登録する
          </Button>
        </>
      }
    >
      <Field label="名前" noMargin>
        <TextField
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder="例: 遠沢澄花"
        />
        <FieldError text={error} />
      </Field>
      <Field label="システム">
        <Combobox
          ariaLabel="システム"
          value={systemId}
          onChange={setSystemId}
          options={systemOptions()}
          pinned={recentSystemIds(Object.values(state.logs))}
        />
      </Field>
      <Field label="職業・肩書（任意）">
        <TextField value={archetype} onChangeText={setArchetype} placeholder="例: 地方紙記者" />
      </Field>
      <Field label="メモ・プロフィール（任意）">
        <TextField multiline value={bio} onChangeText={setBio} />
      </Field>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 10,
    paddingRight: 2,
    gap: 4,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
});
