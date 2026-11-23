import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { SYSTEMS } from "@shared/data/systems";
import { recentSystemIds, systemOptions } from "@shared/lib/system-options";
import { uid } from "@shared/lib/time";
import type { Scenario } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { Button, Combobox, Field, FieldError, PageHead, Surface, TextField } from "../../components/ui";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { DEFAULT_SCENARIO_BG } from "../../theme/tokens";

function sourceFromUrl(url: string): Scenario["source"] {
  const u = url.trim();
  if (!u) return "manual";
  if (/booth\.pm/.test(u)) return "booth";
  if (/talto\.cc/.test(u)) return "talto";
  return "url";
}

export default function NewScenarioScreen() {
  const { state, update } = useMobileStore();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [systemId, setSystemId] = useState("coc7");
  const [sourceUrl, setSourceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    const id = `sc_${uid()}`;
    update((s) => {
      s.scenarios[id] = {
        id,
        title: title.trim(),
        author: author.trim(),
        systemId,
        source: sourceFromUrl(sourceUrl),
        sourceUrl: sourceUrl.trim() || undefined,
        emoji: SYSTEMS[systemId]?.emoji ?? "汎用",
        bg: DEFAULT_SCENARIO_BG,
        tags: [],
        description: description.trim() || undefined,
        claimedBy: null,
        addedBy: "user",
        addedByUid: s.me,
      };
    });
    hapticSuccess();
    router.replace(`/scenarios/${id}` as never);
  }

  return (
    <ScreenShell>
      <PageHead title="シナリオを追加" back={{ label: "シナリオ" }} />
      <Surface style={{ padding: 18 }}>
        <Field label="タイトル" noMargin>
          <TextField
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setError(null);
            }}
            placeholder="例: 廃校の十三時間目"
          />
          <FieldError text={error} />
        </Field>
        <Field label="作者（任意）">
          <TextField value={author} onChangeText={setAuthor} />
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
        <Field label="配布ページ URL（任意）">
          <TextField value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://booth.pm/..." />
        </Field>
        <Field label="概要（任意）">
          <TextField multiline value={description} onChangeText={setDescription} />
        </Field>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="quiet" onPress={() => router.back()}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={save}>
            追加する
          </Button>
        </View>
      </Surface>
    </ScreenShell>
  );
}
