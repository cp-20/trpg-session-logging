import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { commitLogImport, type CommitLogResult } from "@shared/api/commands";
import { recentSystemIds, systemOptions } from "@shared/lib/system-options";
import { SAMPLE_LOG } from "@shared/data/seed";
import { SYSTEMS } from "@shared/data/systems";
import { directoryToScenario } from "@shared/lib/scenario-directory";
import { useScenarioSearch } from "@shared/lib/use-scenario-directory";
import { sessionTitle } from "@shared/lib/session-scenario";
import { mergeScenarioCandidates, WEB_ORIGIN } from "../lib/scenario-list";
import {
  importLogFromText,
  SUPPORTED_LOG_FORMATS_LABEL,
  UNSUPPORTED_LOG_MESSAGE,
  type ParsedLog,
} from "@shared/lib/importers";
import { buildDraft as buildDraftWith, type Draft } from "@shared/lib/speaker-match";
import {
  deriveSittings,
  nextSittingFields,
  sittingToFields,
  sittingsFromFields,
  type SittingFields,
} from "@shared/lib/sittings";
import { fmtSessionWhen, fmtDur, sessionPlayMinutes, todayStr } from "@shared/lib/time";
import type { Channel, MsgKind, Scope } from "@shared/types";
import { ScreenFrame, ScreenShell } from "../components/ScreenShell";
import {
  AvatarImage,
  PRESET_NPC_ICONS,
  PlayerPicker,
  characterAvatarSrc,
  resolveSpeakerAvatarSrc,
  userAvatarSrc,
} from "../components/identity";
import {
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconClipboard,
  IconFileText,
  IconShare,
  IconUpload,
} from "../components/icons";
import {
  Button,
  Combobox,
  CopyBox,
  DividerList,
  Field,
  FieldError,
  NotFound,
  PageHead,
  PanelHead,
  SCOPE_META,
  ScopePicker,
  Seg,
  Select,
  type ComboboxOption,
  type SelectOption,
  SittingsInput,
  Surface,
  TextField,
} from "../components/ui";
import { pickAndImportLogFile, pickAvatarImageDataUrl } from "../native/file-import";
import { hapticSuccess } from "../native/haptics";
import { shareTextOrUrl } from "../native/native-share";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";

const buildDraft = (opts: Omit<Parameters<typeof buildDraftWith>[0], "avatars">) =>
  buildDraftWith({ ...opts, avatars: { character: characterAvatarSrc, user: userAvatarSrc } });

const ROLE_OPTIONS: readonly SelectOption<MsgKind>[] = [
  { value: "KP", label: "GM" },
  { value: "PC", label: "PC" },
  { value: "PL", label: "PL" },
  { value: "NPC", label: "NPC" },
  { value: "NARRATION", label: "描写" },
  { value: "SYSTEM", label: "システム" },
];

export default function UploadScreen() {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    log?: string;
    table?: string;
    scenario?: string;
    manual?: string;
    fromClipboard?: string;
  }>();

  const attachId = params.log ?? null;
  const presetTable = params.table ?? "";
  const presetScenario = params.scenario ?? "";
  const attachLog = attachId ? state.logs[attachId] : null;

  const [step, setStep] = useState(1);
  const [manual, setManual] = useState(params.manual === "1" && !attachId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<CommitLogResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (attachId && !attachLog) {
    return (
      <ScreenShell>
        <PageHead title="ログを添付" back={{ label: "戻る" }} />
        <NotFound what="添付先のセッション" />
      </ScreenShell>
    );
  }

  async function handleCommit() {
    if (!draft || committing) return;
    // セッションはシナリオの題名で呼ぶので、シナリオは必ず要る
    if (!state.scenarios[draft.scenarioId] && !draft.newScenario?.title.trim()) {
      setError("遊んだシナリオを選ぶか、新しいシナリオを足してください。");
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      const r = await commitLogImport(
        {
          fileName: draft.fileNames.length > 0 ? draft.fileNames.join("、") : null,
          attachId,
          meta: draft.meta,
          channels: draft.channels,
          kinds: draft.kinds,
          speakerIcons: draft.speakerIcons,
          scope: draft.scope,
          tableId: draft.tableId,
          scenarioId: draft.scenarioId,
          newScenario: draft.newScenario,
          // 記録する本人も参加者（役割・キャラはログから推したもの）
          players: [
            ...(draft.self.played
              ? [{ userId: state.me, characterIds: draft.self.characterIds, role: draft.self.role }]
              : []),
            ...draft.players.filter((p) => p.userId !== state.me),
          ],
          sittings: draft.sittings,
        },
        state,
        update,
      );
      if (!r.ok) {
        setError(r.reason ?? "記録できませんでした。入力内容を確認してください。");
        return;
      }
      setResult(r);
      setStep(3);
      hapticSuccess();
    } catch {
      setError("記録できませんでした。入力内容は保持されています。もう一度お試しください。");
    } finally {
      setCommitting(false);
    }
  }

  const stepLabels = [manual ? "日時を入力" : "ログを選ぶ", "内容の確認", attachLog ? "添付" : "記録"];

  return (
    <ScreenFrame>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: step === 2 ? 120 : Math.max(36, insets.bottom + 24),
        }}
      >
        <PageHead
          back={step === 3 ? undefined : { label: "戻る" }}
          title={attachLog ? "ログを添付" : "セッションを記録"}
          sub={
            attachLog ? (
              <Text style={{ fontSize: 13, color: tokens.ink2 }}>
                「{sessionTitle(attachLog, state.scenarios)}」にログを追加し、日時と発言者を読み取ります。
              </Text>
            ) : undefined
          }
        />

        {step < 3 && (
          <View style={styles.stepsRow}>
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const current = step === n;
              const done = step > n;
              return (
                <View key={label} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepDot,
                      done
                        ? { backgroundColor: tokens.primary }
                        : current
                          ? {
                              backgroundColor: tokens.primaryTint,
                              borderWidth: 1,
                              borderColor: tokens.primary,
                            }
                          : { backgroundColor: tokens.surfaceHover },
                    ]}
                  >
                    {done ? (
                      <IconCheck size={14} color={tokens.primaryContent} />
                    ) : (
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: current ? tokens.primary : tokens.ink2,
                        }}
                      >
                        {n}
                      </Text>
                    )}
                  </View>
                  {current && (
                    <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>{label}</Text>
                  )}
                  {i < stepLabels.length - 1 && (
                    <View style={{ width: 20, height: 1, backgroundColor: tokens.border }} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {step === 1 && (
          <Step1
            presetTable={presetTable}
            presetScenario={presetScenario}
            attachLog={attachLog ?? null}
            draft={draft}
            manual={manual}
            fromClipboard={params.fromClipboard === "1"}
            setManual={setManual}
            onDone={(d) => {
              setDraft(d);
              setError(null);
              setStep(2);
            }}
          />
        )}

        {step === 2 && draft && (
          <Step2Review
            draft={draft}
            setDraft={(d) => {
              setDraft(d);
              if (error && (d.scenarioId || d.newScenario?.title.trim())) setError(null);
            }}
            attachId={attachId}
            manual={manual}
            error={error}
          />
        )}

        {step === 3 && (
          <Step3Done
            result={result}
            attachId={attachId}
            scope={draft ? draft.scope : "members"}
            onRestart={() => {
              setDraft(null);
              setResult(null);
              setManual(false);
              setError(null);
              setStep(1);
            }}
          />
        )}
      </ScrollView>

      {step === 2 && draft && (
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: tokens.surface,
              borderTopColor: tokens.border,
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          <Button
            variant="quiet"
            onPress={() => {
              setError(null);
              setStep(1);
            }}
            icon={<IconChevronLeft size={16} color={tokens.ink} />}
          >
            戻る
          </Button>
          <Button
            variant="primary"
            disabled={committing}
            style={{ flex: 1 }}
            onPress={() => void handleCommit()}
          >
            {committing ? "記録中…" : attachId ? "ログを添付する" : "セッションを記録する"}
          </Button>
        </View>
      )}
    </ScreenFrame>
  );
}

function Step1({
  presetTable,
  presetScenario,
  attachLog,
  draft,
  manual,
  fromClipboard,
  setManual,
  onDone,
}: {
  presetTable: string;
  presetScenario: string;
  attachLog: ReturnType<typeof useMobileStore>["state"]["logs"][string] | null;
  draft: Draft | null;
  manual: boolean;
  fromClipboard: boolean;
  setManual: (v: boolean) => void;
  onDone: (d: Draft) => void;
}) {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const [running, setRunning] = useState(false);
  const [parsed, setParsed] = useState<ParsedLog | null>(() =>
    draft?.channels.length
      ? {
          channels: draft.channels,
          kinds: draft.kinds,
          messageCount: draft.channels.reduce((n, c) => n + c.msgs.length, 0),
        }
      : null,
  );
  const [fileInfo, setFileInfo] = useState<string | null>(draft?.fileNames[0] ?? null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromClipboard) return;
    Clipboard.getStringAsync()
      .then((raw) => {
        const res = importLogFromText(raw);
        if (res && res.log.messageCount > 0) {
          setParsed(res.log);
          setFileInfo(res.sourceLabel);
        }
      })
      .catch(() => {});
  }, [fromClipboard]);

  async function pickFile() {
    setRunning(true);
    setError(null);
    try {
      const picked = await pickAndImportLogFile();
      if (!picked) return;
      if (!picked.result || picked.result.log.messageCount === 0) {
        setError(UNSUPPORTED_LOG_MESSAGE);
        return;
      }
      setParsed(picked.result.log);
      setFileInfo(picked.fileName);
    } catch {
      setError("ファイルを読み取れませんでした。対応形式を確認して、もう一度お試しください。");
    } finally {
      setRunning(false);
    }
  }

  async function importFromClipboard() {
    setError(null);
    const clip = await Clipboard.getStringAsync().catch(() => "");
    if (!clip.trim()) {
      setError("クリップボードが空です。");
      return;
    }
    const res = importLogFromText(clip);
    if (!res || res.log.messageCount === 0) {
      setError("クリップボードから読み取れる発言が見つかりませんでした。");
      return;
    }
    setParsed(res.log);
    setFileInfo(res.sourceLabel);
  }

  function handlePasteImport() {
    setError(null);
    const res = importLogFromText(pasteText);
    if (!res || res.log.messageCount === 0) {
      setError("読み取れる発言が見つかりませんでした。");
      return;
    }
    setParsed(res.log);
    setFileInfo(res.sourceLabel);
    setPasteOpen(false);
  }

  function finishSample() {
    const channels = JSON.parse(JSON.stringify(SAMPLE_LOG)) as Channel[];
    onDone(
      buildDraft({
        fileNames: [],
        channels,
        attachLog,
        presetTable,
        presetScenario,
        state,
      }),
    );
  }

  function proceed() {
    if (!parsed) return;
    onDone(
      draft?.channels === parsed.channels
        ? draft
        : buildDraft({
            fileNames: fileInfo ? [fileInfo] : [],
            channels: parsed.channels,
            attachLog,
            presetTable,
            presetScenario,
            state,
          }),
    );
  }

  if (manual && !attachLog) {
    return (
      <ManualForm
        presetTable={presetTable}
        presetScenario={presetScenario}
        initial={draft && draft.channels.length === 0 ? draft : null}
        onBack={() => setManual(false)}
        onNext={onDone}
      />
    );
  }

  if (parsed) {
    const all = parsed.channels.flatMap((c) => c.msgs);
    const speakers = [...new Set(all.map((m) => m.sp))];
    const rolls = all.filter((m) => m.roll).length;
    const secretChannels = parsed.channels.filter((c) => c.secret);
    const derived = deriveSittings(parsed.channels);
    const playMin = sessionPlayMinutes({ sittings: derived });

    return (
      <Surface style={{ padding: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.doneCircle, { backgroundColor: tokens.successTint }]}>
            <IconCheck size={20} color={tokens.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }}>読み取り完了</Text>
            {fileInfo && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{fileInfo}</Text>}
          </View>
          <Button
            size="sm"
            variant="quiet"
            onPress={() => {
              setParsed(null);
              setFileInfo(null);
            }}
          >
            別のログ
          </Button>
        </View>

        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: tokens.border }}>
          <DividerList>
            <SummaryRow label="日時">
              {derived.length > 0
                ? `${fmtSessionWhen({ sittings: derived })}${playMin > 0 ? `（${fmtDur(playMin)}）` : ""}`
                : "ログから読み取れませんでした。次の画面で入力します。"}
            </SummaryRow>
            <SummaryRow label={`発言者 ${speakers.length}人`}>
              {`${speakers.slice(0, 8).join("、")}${speakers.length > 8 ? ` ほか${speakers.length - 8}人` : ""}`}
            </SummaryRow>
            <SummaryRow label="発言">{`${all.length}件（うちダイスロール ${rolls}件）`}</SummaryRow>
            <SummaryRow label={`タブ ${parsed.channels.length}つ`}>
              {`${parsed.channels.map((c) => c.name).join("、")}${
                secretChannels.length > 0
                  ? `\nシークレット ${secretChannels.length}タブも記録し、共有範囲の人だけが読めます。`
                  : ""
              }`}
            </SummaryRow>
          </DividerList>
        </View>

        <View style={{ marginTop: 16 }}>
          <Button variant="primary" fullWidth onPress={proceed}>
            内容と参加者の確認へ進む
          </Button>
        </View>
      </Surface>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Surface style={{ padding: 20 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={[styles.uploadCircle, { backgroundColor: tokens.primaryTint }]}>
            <IconUpload size={24} color={tokens.primary} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink, textAlign: "center" }}>
            ログファイルを選ぶ
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.ink2, textAlign: "center" }}>
            {SUPPORTED_LOG_FORMATS_LABEL}に対応しています。
          </Text>
          <Button
            variant="primary"
            fullWidth
            disabled={running}
            icon={<IconFileText size={18} color={tokens.primaryContent} />}
            onPress={() => void pickFile()}
          >
            {running ? "読み込み中…" : "ファイルを選ぶ"}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={running}
            icon={<IconClipboard size={16} color={tokens.ink} />}
            onPress={() => void importFromClipboard()}
          >
            クリップボードから読み取る
          </Button>
        </View>

        <View
          style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 }}
        >
          <Button size="sm" variant="quiet" onPress={() => setPasteOpen((v) => !v)}>
            テキストを貼り付ける
          </Button>
          <Button size="sm" variant="quiet" onPress={finishSample}>
            サンプルログで試す
          </Button>
        </View>

        {pasteOpen && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: tokens.border,
              marginTop: 14,
              paddingTop: 14,
              gap: 10,
            }}
          >
            <TextField
              multiline
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={"[メイン] 探索者: セリフ\n21:05 探索者: セリフ"}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button size="sm" variant="quiet" onPress={() => setPasteOpen(false)}>
                閉じる
              </Button>
              <Button size="sm" variant="secondary" disabled={!pasteText.trim()} onPress={handlePasteImport}>
                テキストを読み込む
              </Button>
            </View>
          </View>
        )}

        <FieldError text={error} />
      </Surface>

      {!attachLog && (
        <Surface style={{ padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>ログがないセッション</Text>
          <Text style={{ fontSize: 13, color: tokens.ink2, marginTop: 4, marginBottom: 12 }}>
            日時と参加者だけで記録し、ログはあとから添付します。
          </Text>
          <Button
            variant="secondary"
            icon={<IconCalendar size={16} color={tokens.ink} />}
            onPress={() => setManual(true)}
          >
            ログなしで記録する
          </Button>
        </Surface>
      )}
    </View>
  );
}

function SummaryRow({ label, children }: { label: string; children: string }) {
  const { tokens } = useTheme();
  return (
    <View style={{ paddingVertical: 10, gap: 3 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.ink2 }}>{label}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.ink }}>{children}</Text>
    </View>
  );
}

function ManualForm({
  presetTable,
  presetScenario,
  initial,
  onBack,
  onNext,
}: {
  presetTable: string;
  presetScenario: string;
  initial: Draft | null;
  onBack: () => void;
  onNext: (d: Draft) => void;
}) {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const [rows, setRows] = useState<SittingFields[]>(() =>
    initial && initial.sittings.length > 0
      ? initial.sittings.map(sittingToFields)
      : [nextSittingFields([], todayStr())],
  );
  const [tableId, setTableId] = useState(initial?.tableId ?? presetTable);
  const [error, setError] = useState<string | null>(null);

  const myTables = Object.values(state.tables).filter(
    (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
  );
  const table = tableId ? state.tables[tableId] : null;

  function next() {
    const parsed = sittingsFromFields(rows);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const members = table?.memberIds.filter((m) => m !== state.me) ?? [];
    onNext({
      ...(initial ??
        buildDraft({
          fileNames: [],
          channels: [],
          attachLog: null,
          presetTable,
          presetScenario,
          state,
        })),
      meta: { systemId: table?.systemId ?? initial?.meta.systemId ?? "general" },
      tableId,
      players:
        initial?.tableId === tableId
          ? initial.players
          : members.map((m) => ({ userId: m, characterIds: [] })),
      sittings: parsed.sittings,
    });
  }

  return (
    <Surface style={{ padding: 18 }}>
      <PanelHead title="いつ、誰と遊んだか" sub="ログが見つかったら、あとでこのセッションに添付します。" />
      <Field label="遊んだ日時" noMargin>
        <SittingsInput rows={rows} onChange={setRows} />
      </Field>
      <Field label="卓">
        <Combobox
          ariaLabel="卓"
          value={tableId}
          onChange={setTableId}
          options={[
            { value: "", label: "選ばない" },
            ...myTables.map((t) => ({ value: t.id, label: `${t.name}（${t.memberIds.length}人）` })),
          ]}
        />
      </Field>
      <FieldError text={error} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 18 }}>
        <Button variant="quiet" icon={<IconChevronLeft size={16} color={tokens.ink} />} onPress={onBack}>
          ログから記録
        </Button>
        <Button variant="primary" onPress={next}>
          確認へ進む
        </Button>
      </View>
    </Surface>
  );
}

function Step2Review({
  draft,
  setDraft,
  manual,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  attachId?: string | null;
  manual: boolean;
  error: string | null;
}) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const [newScOpen, setNewScOpen] = useState(false);
  /* 共有シナリオ一覧はサーバーで探す。打った言葉で問い合わせ、このシステムのものを先に */
  const [typed, setTyped] = useState("");
  const scSystem = draft.meta.systemId;
  const remoteScenarios = useScenarioSearch({
    q: typed,
    prefer: scSystem && scSystem !== "general" ? [scSystem] : [],
    pageSize: 20,
    origin: WEB_ORIGIN,
  });
  const scenarioOptions = useMemo(
    () =>
      mergeScenarioCandidates(Object.values(state.scenarios), remoteScenarios.items).map((d) => ({
        value: d.id,
        label: d.title,
        hint: d.author,
        keywords: [d.author, d.systemLabel ?? SYSTEMS[d.systemId]?.name ?? "", ...d.tags],
      })),
    [state.scenarios, remoteScenarios.items],
  );
  /** 遊んだ日時。ログの発言時刻から導いた値を入れておき、そのまま直せる */
  const [sittingRows, setSittingRows] = useState<SittingFields[]>(() =>
    draft.sittings.length > 0 ? draft.sittings.map(sittingToFields) : [nextSittingFields([], todayStr())],
  );

  const speakers = useMemo(() => {
    const seen = new Set<string>();
    const list: { sp: string; kind: MsgKind }[] = [];
    draft.channels.forEach((c) =>
      c.msgs.forEach((m) => {
        if (!seen.has(m.sp)) {
          seen.add(m.sp);
          list.push({ sp: m.sp, kind: draft.kinds[m.sp] ?? m.kind });
        }
      }),
    );
    return list;
  }, [draft.channels, draft.kinds]);

  const myTables = Object.values(state.tables).filter(
    (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
  );
  const selectedIds = draft.players.map((p) => p.userId);
  const charList = Object.values(state.characters);
  const userList = Object.values(state.users);

  const linkOptions: ComboboxOption<string>[] = [
    { value: "", label: "結び付けない" },
    ...charList.map((c) => {
      const owner = state.users[c.ownerId];
      return { value: `char:${c.id}`, label: owner ? `${c.name}（${owner.name}）` : c.name };
    }),
    ...userList.map((u) => ({ value: `user:${u.id}`, label: `PL ${u.name}` })),
  ];

  const iconOptions: ComboboxOption<string>[] = [
    { value: "", label: "自動（結び付け先に合わせる）" },
    ...charList.map((c) => ({ value: characterAvatarSrc(c), label: c.name })),
    ...userList.map((u) => ({ value: userAvatarSrc(u), label: `PL ${u.name}` })),
    ...PRESET_NPC_ICONS.map((p) => ({ value: p.src, label: p.label })),
  ];

  function updateLink(sp: string, val: string) {
    const nextLinks = { ...draft.speakerLinks };
    const nextIcons = { ...draft.speakerIcons };
    let nextPlayers = draft.players.map((p) => ({ ...p, characterIds: [...p.characterIds] }));

    if (!val) {
      delete nextLinks[sp];
      setDraft({ ...draft, speakerLinks: nextLinks });
      return;
    }

    if (val.startsWith("char:")) {
      const ch = state.characters[val.slice(5)];
      if (ch) {
        nextLinks[sp] = { userId: ch.ownerId, characterId: ch.id };
        nextIcons[sp] = characterAvatarSrc(ch);
        if (ch.ownerId !== state.me) {
          const hit = nextPlayers.find((p) => p.userId === ch.ownerId);
          if (hit) {
            if (!hit.characterIds.includes(ch.id)) hit.characterIds.push(ch.id);
          } else {
            nextPlayers.push({ userId: ch.ownerId, characterIds: [ch.id] });
          }
        }
      }
    } else if (val.startsWith("user:")) {
      const u = state.users[val.slice(5)];
      if (u) {
        nextLinks[sp] = { userId: u.id };
        nextIcons[sp] = userAvatarSrc(u);
        if (u.id !== state.me && !nextPlayers.some((p) => p.userId === u.id)) {
          nextPlayers = [...nextPlayers, { userId: u.id, characterIds: [] }];
        }
      }
    }
    setDraft({ ...draft, speakerLinks: nextLinks, speakerIcons: nextIcons, players: nextPlayers });
  }

  return (
    <View style={{ gap: 18 }}>
      <Surface style={{ padding: 18 }}>
        <PanelHead title="基本情報" />
        <Field label="シナリオ" noMargin>
          <Combobox
            ariaLabel="シナリオ"
            value={draft.scenarioId}
            onQueryChange={setTyped}
            onChange={(v) => {
              // 共有シナリオ一覧から選んだら、記録に結ぶので手元に写しを置く
              const fromDirectory =
                v && !state.scenarios[v] ? remoteScenarios.items.find((d) => d.id === v) : undefined;
              const sc =
                (v ? state.scenarios[v] : undefined) ??
                (fromDirectory && directoryToScenario(fromDirectory, SYSTEMS));
              if (fromDirectory && sc) update((s) => void (s.scenarios[v] ??= sc));
              setDraft({
                ...draft,
                scenarioId: v,
                newScenario: null,
                meta: { ...draft.meta, systemId: sc?.systemId ?? draft.meta.systemId },
              });
            }}
            options={scenarioOptions}
          />
          <View style={{ marginTop: 8, alignItems: "flex-start" }}>
            <Button size="sm" variant="quiet" onPress={() => setNewScOpen((v) => !v)}>
              {newScOpen ? "登録済みから選ぶ" : "新しいシナリオを足す"}
            </Button>
          </View>
        </Field>

        {newScOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, marginTop: 12, paddingTop: 12 }}>
            <Field label="新しいシナリオ名" noMargin>
              <TextField
                value={draft.newScenario?.title ?? ""}
                onChangeText={(v) =>
                  setDraft({
                    ...draft,
                    scenarioId: "",
                    newScenario: {
                      title: v,
                      author: draft.newScenario?.author ?? "",
                      private: draft.newScenario?.private ?? true,
                    },
                  })
                }
              />
            </Field>
            <Field label="作者（任意）">
              <TextField
                value={draft.newScenario?.author ?? ""}
                onChangeText={(v) =>
                  setDraft({
                    ...draft,
                    newScenario: {
                      title: draft.newScenario?.title ?? "",
                      author: v,
                      private: draft.newScenario?.private ?? true,
                    },
                  })
                }
              />
            </Field>
            {/* 自作のシナリオや事前相談のように、ほかの人が遊ばないものは自分だけにする（P14: 安全側を既定に） */}
            <Field label="このシナリオを選べる人">
              <Seg<"private" | "public">
                size="sm"
                value={draft.newScenario?.private === false ? "public" : "private"}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    scenarioId: "",
                    newScenario: {
                      title: draft.newScenario?.title ?? "",
                      author: draft.newScenario?.author ?? "",
                      private: v === "private",
                    },
                  })
                }
                options={[
                  { v: "private", label: "自分だけ" },
                  { v: "public", label: "ほかの人も選べる" },
                ]}
              />
            </Field>
          </View>
        )}

        <Field label="システム">
          <Combobox
            ariaLabel="システム"
            value={draft.meta.systemId}
            onChange={(v) => setDraft({ ...draft, meta: { ...draft.meta, systemId: v } })}
            options={systemOptions()}
            pinned={recentSystemIds(Object.values(state.logs))}
          />
        </Field>
        <Field label="卓">
          <Combobox
            ariaLabel="卓"
            value={draft.tableId}
            onChange={(v) => setDraft({ ...draft, tableId: v })}
            options={[
              { value: "", label: "選ばない" },
              ...myTables.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </Field>
        <Field label="共有範囲">
          <ScopePicker value={draft.scope} onChange={(v) => setDraft({ ...draft, scope: v })} />
        </Field>
      </Surface>

      {!manual && (
        <Surface style={{ padding: 18 }}>
          <PanelHead title="遊んだ日時" />
          <Field label="遊んだ日時" noMargin>
            <SittingsInput
              rows={sittingRows}
              onChange={(rows) => {
                setSittingRows(rows);
                const parsed = sittingsFromFields(rows);
                setDraft({ ...draft, sittings: parsed.ok ? parsed.sittings : [] });
              }}
            />
          </Field>
        </Surface>
      )}

      {speakers.length > 0 && (
        <Surface style={{ padding: 18 }}>
          <PanelHead title="発言者の割り当て" sub="発言者ごとの役割・キャラクター・アイコンを調整します。" />
          <DividerList>
            {speakers.map(({ sp, kind }) => {
              const link = draft.speakerLinks[sp];
              const linkVal = link?.characterId
                ? `char:${link.characterId}`
                : link?.userId
                  ? `user:${link.userId}`
                  : "";
              const previewSrc = resolveSpeakerAvatarSrc(sp, kind, draft.speakerIcons, state);
              return (
                <View key={sp} style={{ paddingVertical: 12, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <AvatarImage uri={previewSrc} size={36} label={sp} />
                    <Text
                      style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.ink }}
                      numberOfLines={1}
                    >
                      {sp}
                    </Text>
                    <Select
                      size="sm"
                      ariaLabel={`${sp}の役割`}
                      value={kind}
                      onChange={(v) => setDraft({ ...draft, kinds: { ...draft.kinds, [sp]: v } })}
                      options={ROLE_OPTIONS}
                      style={{ width: 112 }}
                    />
                  </View>
                  {(kind === "PC" || kind === "PL") && (
                    <Combobox
                      size="sm"
                      ariaLabel={`${sp}の紐付け`}
                      value={linkVal}
                      onChange={(v) => updateLink(sp, v)}
                      options={linkOptions}
                    />
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Combobox
                      size="sm"
                      ariaLabel={`${sp}のアイコン`}
                      value={draft.speakerIcons[sp] ?? ""}
                      onChange={(v) => {
                        const next = { ...draft.speakerIcons };
                        if (v) next[sp] = v;
                        else delete next[sp];
                        setDraft({ ...draft, speakerIcons: next });
                      }}
                      options={iconOptions}
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={async () => {
                        const uri = await pickAvatarImageDataUrl().catch(() => null);
                        if (uri) {
                          setDraft({ ...draft, speakerIcons: { ...draft.speakerIcons, [sp]: uri } });
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
        </Surface>
      )}

      <Surface style={{ padding: 18 }}>
        <PanelHead title="参加者" />
        <PlayerPicker
          state={state}
          selected={selectedIds}
          exclude={[state.me]}
          onChange={(ids) => {
            const byId = new Map(draft.players.map((p) => [p.userId, p.characterIds]));
            setDraft({
              ...draft,
              players: ids.map((uid2) => ({ userId: uid2, characterIds: byId.get(uid2) ?? [] })),
            });
          }}
        />
      </Surface>

      <FieldError text={error} />
    </View>
  );
}

function Step3Done({
  result,
  attachId,
  scope,
  onRestart,
}: {
  result: CommitLogResult | null;
  attachId: string | null;
  scope: Scope;
  onRestart: () => void;
}) {
  const { tokens } = useTheme();
  const router = useRouter();
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";
  const shareUrl = result?.slug ? `${origin}/share/l/${result.slug}` : "";

  return (
    <Surface style={{ padding: 22 }}>
      <View style={{ alignItems: "center", gap: 10 }}>
        <View style={[styles.doneCircle, { backgroundColor: tokens.successTint }]}>
          <IconCheck size={24} color={tokens.success} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.ink }}>
          {attachId ? "ログを添付しました" : "セッションを記録しました"}
        </Text>
        <Text style={{ fontSize: 13, color: tokens.ink2, textAlign: "center" }}>
          {`共有範囲: ${SCOPE_META[scope].label}`}
        </Text>
      </View>

      {shareUrl !== "" && (
        <View style={{ marginTop: 18, gap: 10 }}>
          <CopyBox text={shareUrl} />
          <Button
            variant="secondary"
            icon={<IconShare size={16} color={tokens.ink} />}
            onPress={() => void shareTextOrUrl("卓譜の記録", "セッションの記録を共有します", shareUrl)}
          >
            共有シートで送る
          </Button>
        </View>
      )}

      <View style={{ gap: 10, marginTop: 20 }}>
        {result?.id && (
          <Button
            variant="primary"
            fullWidth
            onPress={() => router.replace(`/sessions/${result.id}` as never)}
          >
            セッションを開く
          </Button>
        )}
        <Button variant="quiet" fullWidth onPress={onRestart}>
          続けて別のセッションを記録
        </Button>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  doneCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
