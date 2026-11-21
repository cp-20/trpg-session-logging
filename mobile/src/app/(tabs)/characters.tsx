import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SYSTEMS, SYSTEM_LIST } from "@shared/data/systems";
import {
  importCharacterFromText,
  toCharacterFields,
  type CharacterImportResult,
} from "@shared/lib/importers";
import { fmtDateShort, todayStr, uid } from "@shared/lib/time";
import type { Character } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { CharAvatar } from "../../components/identity";
import { IconClipboard, IconFileText, IconPlus, IconSearch, IconUpload, IconX } from "../../components/icons";
import {
  BottomSheet,
  Button,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  InteractiveRow,
  MetaRow,
  PageHead,
  Select,
  Surface,
  SysBadge,
  TextField,
} from "../../components/ui";
import { pickAndImportCharacterFile } from "../../native/file-import";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { DEFAULT_ENTITY_COLOR, RADII } from "../../theme/tokens";

export function currentStat(c: Character, key: string): number | undefined {
  const latest = [...c.sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => s.delta[key]?.after)
    .filter((n): n is number => n != null)
    .at(-1);
  return latest ?? c.stats[key];
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
  const [importOpen, setImportOpen] = useState(false);
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
        キャラシートを取り込む
      </Button>
      <Button
        variant="secondary"
        icon={<IconPlus size={16} color={tokens.ink} />}
        onPress={() => setManualOpen(true)}
      >
        手入力
      </Button>
    </>
  );

  return (
    <ScreenShell>
      <PageHead title="キャラクター" actions={myChars.length > 0 ? actions : undefined} />

      {myChars.length === 0 ? (
        <Surface>
          <EmptyState kind="first" title="キャラクターを登録しましょう" action={actions}>
            CCFOLIA・いあきゃら・キャラクター保管所・Udonarium のデータから取り込めます。
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
                <Select
                  ariaLabel="システムで絞り込む"
                  value={sys}
                  onChange={setSys}
                  options={[
                    { value: "all", label: "すべてのシステム" },
                    ...SYSTEM_LIST.filter((x) => usedSystems.has(x.id)).map((x) => ({
                      value: x.id,
                      label: x.name,
                    })),
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
                  const stats = (sdef?.stats ?? []).filter((st) => currentStat(c, st.key) != null);
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

      {importOpen && <ImportCharacterSheet onClose={() => setImportOpen(false)} />}
      {manualOpen && <NewCharacterSheet onClose={() => setManualOpen(false)} />}
    </ScreenShell>
  );
}

function ImportCharacterSheet({ onClose }: { onClose: () => void }) {
  const { tokens } = useTheme();
  const { update } = useMobileStore();
  const router = useRouter();
  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Character> | null>(null);
  const [sourceLabel, setSourceLabel] = useState("取り込み");
  const [error, setError] = useState<string | null>(null);

  function showParsed(result: CharacterImportResult | null) {
    if (!result) {
      setError(
        "キャラクターを読み取れませんでした。CCFOLIA（JSON / ZIP）・いあきゃら（テキスト）・キャラクター保管所（JSON）・Udonarium（XML / ZIP）をお確かめください。",
      );
      return;
    }
    setError(null);
    setSourceLabel(result.sourceLabel);
    setPreview(toCharacterFields(result.character, "general"));
  }

  async function pickFile() {
    setParsing(true);
    setError(null);
    try {
      const res = await pickAndImportCharacterFile();
      if (res) showParsed(res.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ファイルを読み取れませんでした。");
    } finally {
      setParsing(false);
    }
  }

  async function pasteFromClipboard() {
    setError(null);
    const clip = await Clipboard.getStringAsync().catch(() => "");
    if (!clip.trim()) {
      setError("クリップボードが空です。");
      return;
    }
    setPasted(clip);
    showParsed(importCharacterFromText(clip));
  }

  function save() {
    if (!preview?.name?.trim()) {
      setError("キャラクターの名前を入力してください。");
      return;
    }
    const id = `ch_${uid()}`;
    update((state) => {
      state.characters[id] = {
        id,
        ownerId: state.me,
        name: preview.name!.trim(),
        systemId: preview.systemId ?? "general",
        color: preview.color ?? DEFAULT_ENTITY_COLOR,
        image: preview.image,
        archetype: preview.archetype?.trim() ?? "",
        bio: preview.bio?.trim() ?? "",
        tags: [],
        stats: { ...preview.stats },
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
        import: { source: sourceLabel, importedAt: todayStr() },
      };
    });
    hapticSuccess();
    onClose();
    router.push(`/characters/${id}` as never);
  }

  return (
    <BottomSheet
      visible
      title="キャラシートを取り込む"
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
            <Button
              variant="primary"
              disabled={parsing || !pasted.trim()}
              onPress={() => showParsed(importCharacterFromText(pasted))}
            >
              内容を確認
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              disabled={parsing}
              icon={<IconClipboard size={16} color={tokens.ink} />}
              onPress={() => void pasteFromClipboard()}
            >
              クリップボードから読む
            </Button>
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              disabled={parsing}
              icon={<IconUpload size={16} color={tokens.ink} />}
              onPress={() => void pickFile()}
            >
              {parsing ? "読込中…" : "ファイルを選ぶ"}
            </Button>
          </View>
          <Field label="キャラクターデータ（JSON / テキスト / XML）" noMargin>
            <TextField
              multiline
              value={pasted}
              onChangeText={(v) => {
                setPasted(v);
                setError(null);
              }}
              placeholder="CCFOLIAのコマ出力、いあきゃらのテキスト出力などを貼り付け"
            />
          </Field>
          <FieldError text={error} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, color: tokens.ink2 }}>
            {sourceLabel}から読み取りました。登録前に内容を確認してください。
          </Text>
          <Field label="名前" noMargin>
            <TextField
              value={preview.name ?? ""}
              onChangeText={(v) => setPreview((prev) => ({ ...prev, name: v }))}
            />
          </Field>
          <Field label="システム">
            <Select
              ariaLabel="システム"
              value={preview.systemId ?? "general"}
              onChange={(v) => setPreview((prev) => ({ ...prev, systemId: v }))}
              options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
          <Field label="肩書・職業（任意）">
            <TextField
              value={preview.archetype ?? ""}
              onChangeText={(v) => setPreview((prev) => ({ ...prev, archetype: v }))}
            />
          </Field>
          <FieldError text={error} />
        </View>
      )}
    </BottomSheet>
  );
}

function NewCharacterSheet({ onClose }: { onClose: () => void }) {
  const { update } = useMobileStore();
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
        <Select
          ariaLabel="システム"
          value={systemId}
          onChange={setSystemId}
          options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
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
