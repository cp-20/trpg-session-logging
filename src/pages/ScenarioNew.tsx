import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { Field, PageHead, Tag } from "../components/ui";
import { SYSTEMS, SYSTEM_LIST, POLICY_HINT } from "../data/systems";
import { uid } from "../lib/time";
import type { Policy } from "../types";

const BG = ["#dcecf5", "#e8e3d6", "#f3e0e6", "#e6e6f0", "#f0e6d2", "#dfe7ee", "#e3efe2"];

export default function ScenarioNew() {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [systemId, setSystemId] = useState("coc7");
  const [source, setSource] = useState<"booth" | "talto" | "url" | "manual">("manual");
  const [sourceUrl, setSourceUrl] = useState("");
  const [policy, setPolicy] = useState<Policy>("unknown");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");

  function save() {
    if (!title.trim()) {
      toast("タイトルを入力してください");
      return;
    }
    const id = "sc_" + uid();
    update((s) => {
      s.scenarios[id] = {
        id,
        title: title.trim(),
        author: author.trim() || "不明",
        systemId,
        source,
        sourceUrl: sourceUrl.trim() || undefined,
        policy,
        emoji: SYSTEMS[systemId]?.short ?? "汎",
        bg: BG[Object.keys(s.scenarios).length % BG.length],
        tags: tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean),
        description: description.trim() || undefined,
        claimedBy: null,
        addedBy: "user",
        addedByUid: s.me,
      };
    });
    toast(`シナリオ「${title.trim()}」を登録しました`);
    nav(`/scenarios/${id}`);
  }

  return (
    <>
      <PageHead back={{ to: "/scenarios", label: "シナリオ" }} title="シナリオを追加" sub="ログがなくてもシナリオ単体で登録できます。あとから卓を立てられます。" />
      <div className="card bg-base-100 border border-base-300 px-5 py-4 max-w-2xl">
        <Field label="タイトル"><input className="input input-bordered input-sm w-full bg-base-100" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 廃校の十三時間目" /></Field>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="作者 / サークル"><input className="input input-bordered input-sm w-full bg-base-100" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="例: しおかぜ堂" /></Field>
          <Field label="システム">
            <select className="select select-bordered select-sm " value={systemId} onChange={(e) => setSystemId(e.target.value)}>
              {SYSTEM_LIST.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="出典">
            <select className="select select-bordered select-sm " value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="manual">自由記述（出典URLなし）</option>
              <option value="booth">BOOTH</option>
              <option value="talto">TALTO</option>
              <option value="url">その他のURL</option>
            </select>
          </Field>
          <Field label="出典URL（わかれば）">
            <input className="input input-bordered input-sm w-full bg-base-100" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://booth.pm/ja/items/…" disabled={source === "manual"} />
          </Field>
        </div>
        <Field label="ログポリシー" hint={POLICY_HINT[policy]}>
          <select className="select select-bordered select-sm " value={policy} onChange={(e) => setPolicy(e.target.value as Policy)}>
            <option value="unknown">未確認（メンバー限定として扱う）</option>
            <option value="members">メンバー限定</option>
            <option value="public">公開ログ可</option>
          </select>
        </Field>
        <Field label="タグ（カンマ区切り）"><input className="input input-bordered input-sm w-full bg-base-100" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例: 学校, 1回完結" /></Field>
        <Field label="ひとこと紹介"><textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn" onClick={() => nav("/scenarios")}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>登録する</button>
        </div>
      </div>
      {Object.keys(state.scenarios).length === 0 && <p className="text-[11px] text-ink2 mt-1">（最初のシナリオです）</p>}
    </>
  );
}
