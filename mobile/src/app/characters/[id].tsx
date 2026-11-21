import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS } from "@shared/data/systems";
import { fmtDate, fmtDateShort, todayStr, uid } from "@shared/lib/time";
import type { Character, GrowthRecord, SessionStat } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { CharAvatar } from "../../components/identity";
import { IconHistory, IconPencil, IconPlus, IconShare, IconTrendingUp } from "../../components/icons";
import {
  BottomSheet,
  Button,
  CopyBox,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  InteractiveRow,
  MetaRow,
  NotFound,
  PageHead,
  SectionTitle,
  Select,
  Surface,
  SysBadge,
  TextField,
  Toggle,
} from "../../components/ui";
import { pickAvatarImageDataUrl } from "../../native/file-import";
import { hapticSuccess } from "../../native/haptics";
import { shareTextOrUrl } from "../../native/native-share";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { currentStat } from "../(tabs)/characters";

export default function CharacterDetailScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);

  const c = state.characters[id ?? ""];
  if (!c) {
    return (
      <ScreenShell>
        <PageHead title="キャラクター" back={{ label: "キャラクター" }} />
        <NotFound what="キャラクター" />
      </ScreenShell>
    );
  }

  const sys = SYSTEMS[c.systemId];
  const isMine = c.ownerId === state.me;
  const owner = state.users[c.ownerId];
  const sessions = [...c.sessions].sort((a, b) => b.date.localeCompare(a.date));
  const sessionLogIds = new Set(c.sessions.map((s) => s.logId));
  const looseGrowth = c.growth
    .filter((g) => !g.logId || !sessionLogIds.has(g.logId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const firstDate = sessions.at(-1)?.date;

  const coChars: Record<string, number> = {};
  c.sessions.forEach((s) => {
    const log = state.logs[s.logId];
    if (!log) return;
    Object.entries(log.players).forEach(([u, p]) => {
      if (u === c.ownerId) return;
      p.characterIds.forEach((cid) => {
        if (cid === c.id) return;
        coChars[cid] = (coChars[cid] ?? 0) + 1;
      });
    });
  });
  const coCharEntries = Object.entries(coChars)
    .filter(([cid]) => Boolean(state.characters[cid]))
    .sort((a, b) => b[1] - a[1]);

  const statCells = (sys?.stats ?? []).map((st) => ({
    label: st.label,
    val: currentStat(c, st.key),
    max: st.max,
  }));

  async function pickPortrait() {
    if (!isMine) return;
    try {
      const dataUrl = await pickAvatarImageDataUrl();
      if (!dataUrl) return;
      update((s) => {
        if (s.characters[c.id]) s.characters[c.id]!.image = dataUrl;
      });
      hapticSuccess();
    } catch {
      /* ignore */
    }
  }

  return (
    <ScreenShell>
      <PageHead
        back={isMine ? { label: "キャラクター" } : undefined}
        lead={
          <Pressable
            disabled={!isMine}
            onPress={() => void pickPortrait()}
            accessibilityLabel={isMine ? "キャラクター画像を変更" : c.name}
          >
            <CharAvatar c={c} size={76} />
          </Pressable>
        }
        title={c.name}
        sub={
          <MetaRow>
            {c.archetype !== "" && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{c.archetype}</Text>}
            <SysBadge sys={sys} />
            {!isMine && owner && (
              <Pressable onPress={() => router.push(`/users/${c.ownerId}` as never)}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.primary }}>
                  {owner.name}のキャラクター
                </Text>
              </Pressable>
            )}
          </MetaRow>
        }
        actions={
          isMine ? (
            <>
              <Button
                variant="secondary"
                icon={<IconPencil size={16} color={tokens.ink} />}
                onPress={() => setEditOpen(true)}
              >
                編集
              </Button>
              <Button
                variant="primary"
                icon={<IconShare size={16} color={tokens.primaryContent} />}
                onPress={() => setShareOpen(true)}
              >
                共有
              </Button>
            </>
          ) : undefined
        }
      />

      {(c.bio !== "" || c.tags.length > 0) && (
        <View style={{ marginBottom: 20, gap: 6 }}>
          {c.bio !== "" && <Text style={{ fontSize: 15, lineHeight: 23, color: tokens.ink }}>{c.bio}</Text>}
          {c.tags.length > 0 && (
            <MetaRow>
              {c.tags.map((t) => (
                <Text key={t} style={{ fontSize: 13, color: tokens.ink2 }}>
                  #{t}
                </Text>
              ))}
            </MetaRow>
          )}
        </View>
      )}

      {statCells.length > 0 && (
        <Surface style={{ marginBottom: 24 }}>
          <View style={styles.statStrip}>
            {statCells.map((cell, i) => (
              <View
                key={cell.label}
                style={[styles.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: tokens.border }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: tokens.ink2 }}>{cell.label}</Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: tokens.ink,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {cell.val ?? "-"}
                  {cell.max ? (
                    <Text
                      style={{ fontSize: 13, fontWeight: "500", color: tokens.ink3 }}
                    >{` / ${cell.max}`}</Text>
                  ) : null}
                </Text>
              </View>
            ))}
          </View>
        </Surface>
      )}

      <View style={{ gap: 24 }}>
        <View>
          <SectionTitle
            sub={firstDate ? `${fmtDate(firstDate)}から` : undefined}
            right={
              isMine ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<IconPlus size={14} color={tokens.ink} />}
                  onPress={() => setGrowthOpen(true)}
                >
                  {`${sys?.growthLabel ?? "成長"}を記録`}
                </Button>
              ) : undefined
            }
          >
            これまでのセッション
          </SectionTitle>

          {sessions.length === 0 && looseGrowth.length === 0 ? (
            <Surface>
              <EmptyState kind="first" title="まだセッションに参加していません">
                セッションを記録するときに、参加者としてこのキャラクターを選ぶとここに並びます。
              </EmptyState>
            </Surface>
          ) : (
            <Surface>
              <DividerList>
                {sessions.map((s) => {
                  const log = state.logs[s.logId];
                  const glist = c.growth.filter((g) => g.logId === s.logId);
                  const rowBody = (
                    <View style={styles.sessionRow}>
                      <View style={{ width: 52 }}>
                        <Text style={{ fontSize: 13, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                          {fmtDateShort(s.date)}
                        </Text>
                        {s.date.slice(0, 4) !== String(new Date().getFullYear()) && (
                          <Text style={{ fontSize: 11, color: tokens.ink3 }}>{s.date.slice(0, 4)}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>{s.title}</Text>
                        <ChangesRow s={s} sysStats={sys?.stats ?? []} growth={glist} />
                        {s.memo.trim() !== "" && (
                          <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.ink2 }}>{s.memo}</Text>
                        )}
                        {!log && (
                          <Text style={{ fontSize: 12, color: tokens.ink3 }}>記録は削除されています</Text>
                        )}
                      </View>
                    </View>
                  );
                  return log ? (
                    <InteractiveRow
                      key={s.logId}
                      onPress={() => router.push(`/sessions/${s.logId}` as never)}
                      accessibilityLabel={s.title}
                    >
                      {rowBody}
                    </InteractiveRow>
                  ) : (
                    <View key={s.logId} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                      {rowBody}
                    </View>
                  );
                })}
                {looseGrowth.length > 0 && (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.ink2 }}>
                      {`セッション外の${sys?.growthLabel ?? "成長"}`}
                    </Text>
                    {looseGrowth.map((g) => (
                      <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            color: tokens.ink2,
                            width: 52,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {fmtDateShort(g.date)}
                        </Text>
                        <GrowthLine g={g} />
                      </View>
                    ))}
                  </View>
                )}
              </DividerList>
            </Surface>
          )}
        </View>

        {coCharEntries.length > 0 && (
          <View>
            <SectionTitle>一緒に遊んだキャラクター</SectionTitle>
            <Surface>
              <DividerList>
                {coCharEntries.map(([cid]) => {
                  const cc = state.characters[cid]!;
                  return (
                    <InteractiveRow
                      key={cid}
                      onPress={() => router.push(`/characters/${cid}` as never)}
                      accessibilityLabel={cc.name}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <CharAvatar c={cc} size={40} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                            {cc.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: tokens.ink2 }}>
                            {state.users[cc.ownerId]?.name ?? cc.archetype}
                          </Text>
                        </View>
                      </View>
                    </InteractiveRow>
                  );
                })}
              </DividerList>
            </Surface>
          </View>
        )}
      </View>

      {editOpen && <EditCharSheet c={c} onClose={() => setEditOpen(false)} />}
      {shareOpen && <ShareCharSheet c={c} onClose={() => setShareOpen(false)} />}
      {growthOpen && <AddGrowthSheet c={c} onClose={() => setGrowthOpen(false)} />}
    </ScreenShell>
  );
}

function GrowthLine({ g }: { g: GrowthRecord }) {
  const { tokens } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
      <IconTrendingUp size={14} color={tokens.success} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>{g.skill}</Text>
      <Text style={{ fontSize: 13, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
        {g.from}→<Text style={{ fontWeight: "700", color: tokens.success }}>{g.to}</Text>
      </Text>
      {g.note && <Text style={{ fontSize: 12, color: tokens.ink3 }}>{g.note}</Text>}
    </View>
  );
}

function ChangesRow({
  s,
  sysStats,
  growth,
}: {
  s: SessionStat;
  sysStats: { key: string; label: string }[];
  growth: GrowthRecord[];
}) {
  const { tokens } = useTheme();
  const deltas = Object.entries(s.delta).flatMap(([k, d]) => {
    const def = sysStats.find((x) => x.key === k);
    return def ? [{ k, label: def.label, ...d, diff: d.after - d.before }] : [];
  });
  if (deltas.length === 0 && growth.length === 0) return null;

  return (
    <MetaRow>
      {deltas.map((d) => (
        <Text key={d.k} style={{ fontSize: 13, fontVariant: ["tabular-nums"] }}>
          <Text style={{ fontWeight: "700", color: tokens.ink }}>{d.label} </Text>
          <Text style={{ color: tokens.ink2 }}>{`${d.before}→${d.after} `}</Text>
          <Text style={{ fontWeight: "700", color: d.diff < 0 ? tokens.error : tokens.success }}>
            {d.diff > 0 ? `+${d.diff}` : d.diff === 0 ? "±0" : `−${-d.diff}`}
          </Text>
        </Text>
      ))}
      {growth.map((g) => (
        <GrowthLine key={g.id} g={g} />
      ))}
    </MetaRow>
  );
}

function EditCharSheet({ c, onClose }: { c: Character; onClose: () => void }) {
  const { tokens } = useTheme();
  const { update } = useMobileStore();
  const sys = SYSTEMS[c.systemId];
  const [name, setName] = useState(c.name);
  const [archetype, setArchetype] = useState(c.archetype);
  const [bio, setBio] = useState(c.bio);
  const [tags, setTags] = useState(c.tags.join(", "));
  const [stats, setStats] = useState<Record<string, string>>(() =>
    Object.fromEntries((sys?.stats ?? []).map((st) => [st.key, String(c.stats[st.key] ?? "")])),
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    update((s) => {
      const ch = s.characters[c.id];
      if (!ch) return;
      ch.name = name.trim();
      ch.archetype = archetype.trim();
      ch.bio = bio.trim();
      ch.tags = tags
        .split(/[,、]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const nextStats = { ...ch.stats };
      for (const st of sys?.stats ?? []) {
        const n = Number(stats[st.key]);
        if (stats[st.key]?.trim() && Number.isFinite(n)) nextStats[st.key] = n;
      }
      ch.stats = nextStats;
    });
    hapticSuccess();
    onClose();
  }

  return (
    <BottomSheet
      visible
      title="キャラクターを編集"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={save}>
            保存
          </Button>
        </>
      }
    >
      <Field label="名前" noMargin>
        <TextField value={name} onChangeText={setName} />
        <FieldError text={error} />
      </Field>
      <Field label="職業など">
        <TextField value={archetype} onChangeText={setArchetype} />
      </Field>
      <Field label="タグ（カンマ区切り）">
        <TextField value={tags} onChangeText={setTags} />
      </Field>
      <Field label="ひとこと紹介">
        <TextField multiline value={bio} onChangeText={setBio} />
      </Field>
      {(sys?.stats ?? []).map((st) => (
        <Field key={st.key} label={`${st.label}${st.max ? `（最大${st.max}）` : ""}`}>
          <TextField
            keyboardType="numeric"
            value={stats[st.key] ?? ""}
            onChangeText={(v) => setStats((prev) => ({ ...prev, [st.key]: v }))}
          />
        </Field>
      ))}
      <View style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 12, color: tokens.ink2 }}>システム</Text>
        <SysBadge sys={sys} />
      </View>
    </BottomSheet>
  );
}

function ShareCharSheet({ c, onClose }: { c: Character; onClose: () => void }) {
  const { tokens } = useTheme();
  const { update } = useMobileStore();
  const router = useRouter();
  const sys = SYSTEMS[c.systemId];
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";
  const url = `${origin}/share/c/${c.id}`;

  const setField = (key: keyof Character["share"], val: boolean) =>
    update((s) => {
      const target = s.characters[c.id];
      if (!target) return;
      (target.share as unknown as Record<string, boolean>)[key] = val;
    });

  const parts: [keyof Character["share"], string][] = [
    ["includeProfile", "プロフィール（職業・紹介・タグ）"],
    ["includeStats", `現在の${(sys?.stats ?? []).map((x) => x.label).join("・") || "能力値"}`],
    ["includeSessions", "参加したセッション"],
    ["includeGrowth", `${sys?.growthLabel ?? "成長"}の履歴`],
  ];

  return (
    <BottomSheet
      visible
      title={`${c.name}を共有`}
      onClose={onClose}
      footer={
        <>
          {c.share.enabled && (
            <Button
              variant="secondary"
              onPress={() => {
                onClose();
                router.push(`/share/c/${c.id}` as never);
              }}
            >
              共有ページを見る
            </Button>
          )}
          <Button variant="primary" onPress={onClose}>
            完了
          </Button>
        </>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
              リンクを知っている人に公開
            </Text>
            <Text style={{ fontSize: 13, color: tokens.ink2, marginTop: 2 }}>
              {c.share.enabled
                ? "このリンクを知っている人は、下で選んだ内容を見られます。"
                : "オフのあいだは、あなた以外は見られません。"}
            </Text>
          </View>
          <Toggle
            label="リンクを知っている人に公開"
            on={c.share.enabled}
            onChange={(v) => setField("enabled", v)}
          />
        </View>

        {c.share.enabled && (
          <>
            <CopyBox text={url} />
            <Button
              variant="secondary"
              icon={<IconShare size={16} color={tokens.ink} />}
              onPress={() => void shareTextOrUrl(c.name, `${c.name}のキャラクターシート`, url)}
            >
              共有シートで送る
            </Button>
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.ink2 }}>
                共有ページに載せる内容
              </Text>
              {parts.map(([key, label]) => (
                <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: tokens.ink }}>{label}</Text>
                  <Toggle label={label} on={Boolean(c.share[key])} onChange={(v) => setField(key, v)} />
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function AddGrowthSheet({ c, onClose }: { c: Character; onClose: () => void }) {
  const { tokens } = useTheme();
  const { update } = useMobileStore();
  const sys = SYSTEMS[c.systemId];
  const recent = [...c.sessions].sort((a, b) => b.date.localeCompare(a.date));

  const [logId, setLogId] = useState(recent[0]?.logId ?? "");
  const [skill, setSkill] = useState(sys?.skills[0] ?? "__custom__");
  const [custom, setCustom] = useState("");
  const [gFrom, setGFrom] = useState("0");
  const [gTo, setGTo] = useState("0");
  const [gDate, setGDate] = useState(recent[0]?.date ?? todayStr());
  const [gNote, setGNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const skillName = skill === "__custom__" ? custom.trim() : skill;
    if (!skillName) {
      setError("技能名を入力してください");
      return;
    }
    const fromVal = Number(gFrom);
    const toVal = Number(gTo);
    if (!Number.isFinite(fromVal) || !Number.isFinite(toVal) || toVal <= fromVal) {
      setError("前の値より大きい数値を入力してください");
      return;
    }
    update((s) => {
      s.characters[c.id]?.growth.push({
        id: `g_${uid()}`,
        date: gDate || todayStr(),
        logId: logId || undefined,
        skill: skillName,
        from: fromVal,
        to: toVal,
        note: gNote.trim() || undefined,
      });
    });
    hapticSuccess();
    onClose();
  }

  return (
    <BottomSheet
      visible
      title={`${sys?.growthLabel ?? "成長"}を記録`}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={save}>
            記録
          </Button>
        </>
      }
    >
      {sys?.growthNote && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
          <IconHistory size={16} color={tokens.ink2} />
          <Text style={{ flex: 1, fontSize: 13, color: tokens.ink2 }}>{sys.growthNote}</Text>
        </View>
      )}
      {recent.length > 0 && (
        <Field label="どのセッションのあとか" noMargin>
          <Select
            ariaLabel="どのセッションのあとか"
            value={logId}
            onChange={(v) => {
              setLogId(v);
              const hit = recent.find((r) => r.logId === v);
              if (hit) setGDate(hit.date);
            }}
            options={[
              ...recent.map((r) => ({ value: r.logId, label: `${fmtDateShort(r.date)} ${r.title}` })),
              { value: "", label: "セッションに紐付けない" },
            ]}
          />
        </Field>
      )}
      <Field label="技能 / 能力">
        <Select
          ariaLabel="技能 / 能力"
          value={skill}
          onChange={setSkill}
          options={[
            ...(sys?.skills ?? []).map((s) => ({ value: s, label: s })),
            { value: "__custom__", label: "自由入力…" },
          ]}
        />
      </Field>
      {skill === "__custom__" && (
        <Field label="技能名（自由入力）">
          <TextField value={custom} onChangeText={setCustom} placeholder="例: 銃構築" />
        </Field>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="前の値">
            <TextField keyboardType="numeric" value={gFrom} onChangeText={setGFrom} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="新しい値">
            <TextField keyboardType="numeric" value={gTo} onChangeText={setGTo} />
          </Field>
        </View>
      </View>
      <Field label="日付">
        <TextField value={gDate} onChangeText={setGDate} placeholder="YYYY-MM-DD" />
      </Field>
      <Field label="補足（任意）">
        <TextField value={gNote} onChangeText={setGNote} placeholder="例: クリティカルの余韻で" />
      </Field>
      <FieldError text={error} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  statStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
});
