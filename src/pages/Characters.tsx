import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { CharAvatar, Empty, Field, Modal, PageHead, Seg, Tag } from "../components/ui";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { uid, sleep } from "../lib/time";
import type { Character } from "../types";
import { IconWand, IconPlus, IconCheck, IconDice } from "../components/icons";

/* ---------- 取り込みソース ---------- */
const IMPORT_SOURCES = [
  { id: "ccfolia", label: "CCFOLIA キャラクターJSON", desc: "キャラクターコマの「クリップボードにコピー」から取得したJSON。", icon: undefined },
  { id: "iakyr", label: "いあきゃら (.txt)", desc: "「キャラ出力 → ファイルに出力」で書き出したテキスト。", icon: undefined },
  { id: "hokansho", label: "キャラクター保管所", desc: "シートURL（または .js JSON）から読み込みます。", icon: undefined },
  { id: "charaeno", label: "Charaeno (.txt)", desc: "テキスト書き出しを解析します。", icon: undefined },
  { id: "manual", label: "手入力", desc: "ゼロから入力します。", icon: "✍️" },
];

export default function Characters() {
  const { state } = useStore();
  const nav = useNavigate();
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
        <input type="search" className="input input-bordered input-sm w-48 bg-base-100" placeholder="名前・型で絞り込み…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg<"mine" | "all"> value={scope} onChange={setScope} options={[{ v: "mine", label: "自分のキャラ" }, { v: "all", label: "全員" }]} />
        <select className="select select-bordered select-sm " value={sys} onChange={(e) => setSys(e.target.value)}>
          <option value="all">全部のシステム</option>
          {SYSTEM_LIST.map((s) => (
            <option key={s.id} value={s.id}>{s.emoji} {s.short}</option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty >
            キャラクターがいません。ほとんどの方はキャラシートツールをお持ちです——
            <b>取り込み</b>から CCFOLIA JSON・いあきゃら・保管所を読み込むのがおすすめです。
          </Empty>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((c) => (
            <div key={c.id} className="card bg-base-100 border border-base-300 px-4 py-3.5 cursor-pointer hover:border-primary/50" onClick={() => nav(`/characters/${c.id}`)}>
              <div className="flex items-center gap-3">
                <CharAvatar c={c} size={42} />
                <div className="flex-1 min-w-0">
                  <b className="text-[14.5px] block truncate">{c.name}</b>
                  <div className="text-[11px] text-ink2 truncate">{c.archetype}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <Tag v="gray">{SYSTEMS[c.systemId]?.emoji} {SYSTEMS[c.systemId]?.short}</Tag>
                <span className="text-[11px] text-ink2 self-center">参加 {c.sessions.length}卓</span>
                {c.growth.length > 0 && <Tag v="ok">{SYSTEMS[c.systemId]?.growthLabel} {c.growth.length}</Tag>}
              </div>
              <div className="text-[10.5px] text-ink2 mt-2">
                最終参加: {c.sessions.at(-1)?.date ?? "—"} · {state.users[c.ownerId].name}
                {c.import && c.import.source !== "手入力" && <> · 取り込み: {c.import.source}</>}
              </div>
            </div>
          ))}
        </div>
      )}

      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
      {manual && <NewCharModal onClose={() => setManual(false)} />}
    </>
  );
}

/* ================= 取り込みウィザード ================= */
function ImportWizard({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Character> | null>(null);

  function parse() {
    if (source === "manual") {
      setPreview({});
      setStep(3);
      return;
    }
    if (!pasted.trim()) {
      toast("URLまたはJSON/テキストを貼り付けてください");
      return;
    }
    setParsing(true);
    /* モック解析: 実際にはパーサーが走る想定 */
    setTimeout(() => {
      /* 貼り付けられたテキストから名前っぽいものを抜くだけの疑似処理 */
      const nameMatch = pasted.match(/"name"\s*:\s*"([^"]+)"/) ?? pasted.match(/名前[：:]\s*(\S+)/);
      const sysMatch = Object.values(SYSTEMS).find((s) => pasted.includes(s.short))?.id ?? "coc7";
      setPreview({
        name: nameMatch?.[1] ?? "取り込んだキャラクター",
        systemId: sysMatch,
        archetype: "",
        bio: "",
        tags: [],
        stats: sysMatch === "coc7" ? { san: 55, mp: 12 } : {},
      });
      setParsing(false);
      setStep(3);
    }, 1100);
  }

  function save() {
    const id = "ch_" + uid();
    update((s) => {
      const sysId = preview.systemId ?? "coc7";
      const stats: Record<string, number> = { ...(preview.stats ?? {}) };
      if (Object.keys(stats).length === 0) {
        SYSTEMS[sysId].stats.forEach((st) => (stats[st.key] = Math.round((st.max ?? 10) * 0.6)));
      }
      s.characters[id] = {
        id,
        ownerId: s.me,
        name: preview.name?.trim() || "名前未設定",
        systemId: sysId,
        color: "#5348c8",
        archetype: preview.archetype?.trim() || (SYSTEMS[sysId].short + "のキャラクター"),
        bio: preview.bio?.trim() ?? "",
        tags: preview.tags ?? [],
        stats,
        sessions: [],
        growth: [],
        share: { enabled: false, scope: "link", includeProfile: true, includeStats: true, includeGrowth: true, includeSessions: true },
        import: { source: IMPORT_SOURCES.find((x) => x.id === source)?.label ?? "手入力", importedAt: new Date().toISOString().slice(0, 10) },
      };
    });
    toast(`「${preview.name?.trim() || "名前未設定"}」を取り込みました`);
    onClose();
    nav(`/characters/${id}`);
  }

  return (
    <Modal
      title="キャラシートを取り込む"
      onClose={onClose}
      wide
      foot={
        step === 1 ? undefined : step === 2 ? (
          <>
            <button className="btn" onClick={() => setStep(1)}>← ソース選択</button>
            <button className={cx2("btn btn-primary", parsing && "loading")} onClick={parse} disabled={parsing}>
              {parsing ? "解析中…" : "解析する"}
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setStep(2)}>← 戻る</button>
            <button className="btn btn-primary" onClick={save}>取り込む</button>
          </>
        )
      }
    >
      {step === 1 && (
        <>
          <p className="text-[11.5px] text-ink2 mb-3">
            すでにキャラシートをお持ちなら、そのまま取り込めます。打ち直す必要はありません。
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {IMPORT_SOURCES.map((s) => (
              <button key={s.id} className="card bg-base-200/50 border border-base-300 px-4 py-3 text-left hover:border-primary/60" onClick={() => { setSource(s.id); setStep(2); }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{s.icon}</span>
                  <b className="text-[13.5px]">{s.label}</b>
                </div>
                <p className="text-[11px] text-ink2 mt-1 leading-5">{s.desc}</p>
              </button>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{IMPORT_SOURCES.find((s) => s.id === source)?.icon}</span>
            <b className="text-[13.5px]">{IMPORT_SOURCES.find((s) => s.id === source)?.label}</b>
          </div>
          {source === "hokansho" ? (
            <Field label="シートURL（またはJSON）" hint="例: https://charasheet.vampire-blood.net/123456.html（.js に置き換えたJSONも読めます）">
              <textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://charasheet.vampire-blood.net/…" />
            </Field>
          ) : source === "manual" ? (
            <p className="text-[12px] text-ink2">「解析する」を押すと入力フォームに進みます。</p>
          ) : (
            <Field label={source === "iakyr" || source === "charaeno" ? "テキストを貼り付け（またはファイル選択）" : "JSONを貼り付け"}>
              <textarea className="textarea textarea-bordered w-full bg-base-100 text-[12px] font-mono" rows={7} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={source === "ccfolia" ? '{"kind":"character","data":{"name":"…"}}' : "キャラ名：…"} />
            </Field>
          )}
          {(source === "iakyr" || source === "charaeno" || source === "ccfolia") && (
            <label className="btn btn-sm mt-2">
              ファイルを選ぶ
              <input
                type="file"
                accept=".txt,.json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPasted((await f.text()).slice(0, 2000));
                }}
              />
            </label>
          )}
          <p className="text-[11px] text-ink2 mt-2">
            ※ モックでは解析結果のサンプルを表示します。実際にはパーサーが名前・ステータス・技能を取り込みます。
          </p>
        </>
      )}
      {step === 3 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Tag v="ok"><IconCheck width={12} height={12} /> 解析プレビュー</Tag>
            <span className="text-[11px] text-ink2">{IMPORT_SOURCES.find((s) => s.id === source)?.label} から</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="名前">
              <input className="input input-bordered input-sm w-full bg-base-100" value={preview.name ?? ""} onChange={(e) => setPreview({ ...preview, name: e.target.value })} />
            </Field>
            <Field label="システム">
              <select className="select select-bordered select-sm " value={preview.systemId ?? "coc7"} onChange={(e) => setPreview({ ...preview, systemId: e.target.value })}>
                {SYSTEM_LIST.map((s) => (
                  <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="型 / 職業など">
              <input className="input input-bordered input-sm w-full bg-base-100" value={preview.archetype ?? ""} onChange={(e) => setPreview({ ...preview, archetype: e.target.value })} placeholder="例: 継続探索者（大学生）" />
            </Field>
            <Field label="ひとこと紹介">
              <input className="input input-bordered input-sm w-full bg-base-100" value={preview.bio ?? ""} onChange={(e) => setPreview({ ...preview, bio: e.target.value })} />
            </Field>
          </div>
          <div className="card bg-base-200/50 px-3 py-2.5 mt-3 text-[12px] text-base-content/70">
            <div className="flex items-center gap-2 mb-1 text-[11px] font-bold text-ink2"><IconDice width={13} height={13} /> 解析された統計値（編集は取り込み後もできます）</div>
            {(preview.stats && Object.entries(preview.stats).length > 0
              ? Object.entries(preview.stats)
              : Object.entries({ 値: "—" })
            ).map(([k, v]) => (
              <span key={k} className="badge badge-ghost badge-sm mr-1.5">{k}: {v as string}</span>
            ))}
          </div>
        </>
      )}
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
      SYSTEMS[systemId].stats.forEach((st) => (stats[st.key] = Math.round((st.max ?? 10) * 0.6)));
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
        share: { enabled: false, scope: "link", includeProfile: true, includeStats: true, includeGrowth: true, includeSessions: true },
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
              <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="型 / 職業など"><input className="input input-bordered input-sm w-full bg-base-100" value={archetype} onChange={(e) => setArchetype(e.target.value)} /></Field>
        <Field label="ラベル色"><input type="color" className="w-16" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <Field label="ひとこと紹介"><textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
      <Field label="タグ（カンマ区切り）"><input className="input input-bordered input-sm w-full bg-base-100" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例: 継続, 学生" /></Field>
    </Modal>
  );
}

function cx2(...a: (string | false | undefined)[]) {
  return a.filter(Boolean).join(" ");
}
