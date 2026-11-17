import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { CharAvatar, Empty, Field, Modal, PageHead, Seg, Tag } from "../components/ui";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { uid, todayStr } from "../lib/time";
import { parseCcfoliaCharacterJson, parseCcfoliaCharacterZip, toCharacterFields } from "../lib/ccfolia-character";
import type { Character } from "../types";
import { IconWand, IconPlus } from "../components/icons";

export default function Characters() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [sys, setSys] = useState("all");
  const [wizard, setWizard] = useState(false);
  const [manual, setManual] = useState(false);

  const list = useMemo(() => {
    let list = Object.values(state.characters);
    if (scope === "mine") list = list.filter((c) => c.ownerId === state.me);
    if (sys !== "all") list = list.filter((c) => c.systemId === sys);
    if (q.trim()) list = list.filter((c) => (c.name + c.archetype).includes(q.trim()));
    return list.sort((a, b) => (b.sessions.at(-1)?.date ?? "").localeCompare(a.sessions.at(-1)?.date ?? ""));
  }, [state.characters, state.me, q, scope, sys]);

  return (
    <>
      <PageHead
        title="キャラクター"
        sub="セッションをまたいで育つ、あなたのキャラクター"
        actions={
          <>
            <button className="btn btn-primary btn-sm" onClick={() => setWizard(true)}>
              <IconWand width={15} height={15} /> キャラシートを取り込む
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setManual(true)}>
              <IconPlus width={15} height={15} /> 手入力
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="search" className="input input-bordered input-sm w-48 bg-base-100" placeholder="名前・職業で絞り込み…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg<"mine" | "all"> value={scope} onChange={setScope} options={[{ v: "mine", label: "自分のキャラ" }, { v: "all", label: "全員" }]} />
        <select className="select select-bordered select-sm " value={sys} onChange={(e) => setSys(e.target.value)}>
          <option value="all">全部のシステム</option>
          {SYSTEM_LIST.map((s) => (
            <option key={s.id} value={s.id}>{s.short}</option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty >
            キャラクターがまだ登録されていません。「キャラシートを取り込む」から登録できます。
          </Empty>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((c) => (
            <a key={c.id} href={`#/characters/${c.id}`} className="card bg-base-100 border border-base-300 px-4 py-3.5 hover:border-primary/50">
              <div className="flex items-center gap-3">
                <CharAvatar c={c} size={42} />
                <div className="flex-1 min-w-0">
                  <b className="text-[14.5px] block truncate">{c.name}</b>
                  <div className="text-[11px] text-ink2 truncate">{c.archetype}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <Tag v="gray">{SYSTEMS[c.systemId]?.short}</Tag>
                <span className="text-[11px] text-ink2 self-center">参加 {c.sessions.length}卓</span>
                {c.growth.length > 0 && <Tag v="ok">{SYSTEMS[c.systemId]?.growthLabel} {c.growth.length}</Tag>}
              </div>
              <div className="text-[10.5px] text-ink2 mt-2">
                最終参加: {c.sessions.at(-1)?.date ?? "—"} · {state.users[c.ownerId].name}
                {c.import && c.import.source !== "手入力" && <> · 取り込み: {c.import.source}</>}
              </div>
            </a>
          ))}
        </div>
      )}

      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
      {manual && <NewCharModal onClose={() => setManual(false)} />}
    </>
  );
}

/* ================= キャラクター取り込み ================= */
function ImportWizard({ onClose }: { onClose: () => void }) {
  const { update, toast } = useStore();
  const nav = useNavigate();
  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Character> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function showParsed(parsed: ReturnType<typeof parseCcfoliaCharacterJson>) {
    if (!parsed) {
      setError("キャラクターを読み取れませんでした。ココフォリアのキャラクターコマをコピーしたJSON、またはキャラクターを書き出したZIPを選んでください。");
      return;
    }
    setError(null);
    setPreview(toCharacterFields(parsed, "general"));
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("20MB以下のキャラクターファイルを選んでください。");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      if (/\.zip$/i.test(file.name)) {
        showParsed(await parseCcfoliaCharacterZip(file));
      } else {
        const text = await file.text();
        setPasted(text);
        showParsed(parseCcfoliaCharacterJson(text));
      }
    } catch {
      setError("ファイルを読み取れませんでした。書き出し直したファイルでお試しください。");
    } finally {
      setParsing(false);
    }
  }

  function save() {
    if (!preview?.name?.trim()) {
      setError("キャラクターの名前を入力してください。");
      return;
    }
    const id = "ch_" + uid();
    update((state) => {
      state.characters[id] = {
        id, ownerId: state.me, name: preview.name!.trim(), systemId: preview.systemId ?? "general",
        color: preview.color ?? "#0e7490", image: preview.image, archetype: preview.archetype?.trim() ?? "",
        bio: preview.bio?.trim() ?? "", tags: [], stats: { ...preview.stats }, sessions: [], growth: [],
        share: { enabled: false, scope: "private", includeProfile: true, includeStats: true, includeGrowth: true, includeSessions: true },
        import: { source: "CCFOLIA", importedAt: todayStr() },
      };
    });
    toast(`「${preview.name.trim()}」を取り込みました`);
    onClose();
    nav(`/characters/${id}`);
  }

  return (
    <Modal title="キャラシートを取り込む" onClose={onClose} wide foot={
      preview ? <><button className="btn" onClick={() => { setPreview(null); setError(null); }}>戻る</button><button className="btn btn-primary" onClick={save}>取り込む</button></> :
      <><button className="btn" onClick={onClose}>キャンセル</button><button className="btn btn-primary" disabled={parsing || !pasted.trim()} onClick={() => showParsed(parseCcfoliaCharacterJson(pasted))}>内容を確認</button></>
    }>
      {!preview ? <>
        <p className="text-sm text-base-content/70 mb-4">ココフォリアのキャラクターコマを「クリップボードにコピー」して貼り付けます。</p>
        <Field label="キャラクターJSON"><textarea className="textarea textarea-bordered w-full bg-base-100 text-sm" rows={6} value={pasted} onChange={(event) => { setPasted(event.target.value); setError(null); }} placeholder={'{"kind":"character","data":{"name":"…"}}'} /></Field>
        <div className="mt-5 pt-4 border-t border-base-300"><label className="block text-sm font-semibold mb-2" htmlFor="character-file">ファイルから取り込む</label><input id="character-file" type="file" className="file-input file-input-bordered file-input-sm w-full" accept=".json,.zip" disabled={parsing} onChange={(event) => { readFile(event.target.files?.[0]); event.target.value = ""; }} /><p className="text-xs text-base-content/70 mt-2">キャラクターのJSON・ZIPに対応しています。</p></div>
        {parsing && <p role="status" className="flex items-center gap-2 text-sm mt-3"><span className="loading loading-spinner loading-sm" />読み込み中…</p>}
      </> : <>
        <h2 className="text-base font-semibold mb-3">取り込む内容</h2>
        {preview.image && <img src={preview.image} alt="取り込んだキャラクター画像" className="rounded-full object-cover w-20 h-20 mb-4" referrerPolicy="no-referrer" />}
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="名前"><input className="input input-bordered input-sm w-full bg-base-100" value={preview.name ?? ""} onChange={(event) => setPreview({ ...preview, name: event.target.value })} /></Field>
          <Field label="システム"><select className="select select-bordered select-sm w-full bg-base-100" value={preview.systemId ?? "general"} onChange={(event) => setPreview({ ...preview, systemId: event.target.value })}>{SYSTEM_LIST.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></Field>
          <Field label="職業など"><input className="input input-bordered input-sm w-full bg-base-100" value={preview.archetype ?? ""} onChange={(event) => setPreview({ ...preview, archetype: event.target.value })} /></Field>
        </div>
        <Field label="紹介・メモ"><textarea className="textarea textarea-bordered w-full bg-base-100 text-sm" rows={4} value={preview.bio ?? ""} onChange={(event) => setPreview({ ...preview, bio: event.target.value })} /></Field>
        {Object.keys(preview.stats ?? {}).length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold mb-2">ステータス</h3><dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">{Object.entries(preview.stats ?? {}).map(([key, value]) => <div key={key} className="flex justify-between gap-2 border-b border-base-300 pb-1"><dt>{SYSTEMS[preview.systemId ?? "general"]?.stats.find((stat) => stat.key === key)?.label ?? key.toUpperCase()}</dt><dd className="tabular-nums">{value}</dd></div>)}</dl></div>}
      </>}
      {error && <p role="alert" className="text-sm text-error mt-3">{error}</p>}
    </Modal>
  );
}

/* ---------- 手入力 ---------- */
function NewCharModal({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [systemId, setSystemId] = useState("coc7");
  const [archetype, setArchetype] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");
  const [color, setColor] = useState("#5348c8");

  function save() {
    if (!name.trim()) {
      toast("名前を入力してください");
      return;
    }
    const id = "ch_" + uid();
    update((s) => {
      const stats: Record<string, number> = {};
      s.characters[id] = {
        id,
        ownerId: s.me,
        name: name.trim(),
        systemId,
        color,
        archetype: archetype.trim() || (SYSTEMS[systemId].short + "のキャラクター"),
        bio: bio.trim(),
        tags: tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean),
        stats,
        sessions: [],
        growth: [],
        share: { enabled: false, scope: "private", includeProfile: true, includeStats: true, includeGrowth: true, includeSessions: true },
        import: { source: "手入力", importedAt: new Date().toISOString().slice(0, 10) },
      };
    });
    toast(`「${name.trim()}」を登録しました`);
    onClose();
    nav(`/characters/${id}`);
  }

  return (
    <Modal
      title="キャラクターを手入力で登録"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>登録する</button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="名前"><input className="input input-bordered input-sm w-full bg-base-100" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 遠沢澄花" /></Field>
        <Field label="システム">
          <select className="select select-bordered select-sm " value={systemId} onChange={(e) => setSystemId(e.target.value)}>
            {SYSTEM_LIST.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="職業など"><input className="input input-bordered input-sm w-full bg-base-100" value={archetype} onChange={(e) => setArchetype(e.target.value)} /></Field>
        <Field label="ラベル色"><input type="color" className="w-16" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <Field label="ひとこと紹介"><textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
      <Field label="タグ（カンマ区切り）"><input className="input input-bordered input-sm w-full bg-base-100" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例: 継続, 学生" /></Field>
    </Modal>
  );
}
