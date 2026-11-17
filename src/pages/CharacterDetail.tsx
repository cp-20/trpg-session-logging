import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, CharAvatar, Empty, Field, Modal, NotFound, PageHead, SectionTitle, Tag, CopyBox, cx } from "../components/ui";
import { SYSTEMS } from "../data/systems";
import { fmtDate, todayStr, uid } from "../lib/time";
import type { Character, GrowthRecord } from "../types";
import { IconTrendingUp, IconPencil, IconShare, IconDice, IconPlus, IconBrain, IconHistory, IconWand, IconUsersGroup, IconBooks } from "../components/icons";

export default function CharacterDetail() {
  const { id } = useParams();
  const { state } = useStore();

  const c = state.characters[id ?? ""];
  if (!c) return <NotFound what="キャラクター" />;
  const sys = SYSTEMS[c.systemId];
  const isMine = c.ownerId === state.me;
  const sessions = [...c.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const growthTotal = c.growth.reduce((a, g) => a + (g.to - g.from), 0);
  const sanKey = sys?.stats[0]?.key;
  const sanNow = sanKey ? c.sessions.map((s) => s.delta[sanKey]?.after).filter((n) => n != null).at(-1) : undefined;

  /* 関連 */
  const scenarios = new Map<string, number>();
  const coChars: Record<string, number> = {};
  const users: Record<string, number> = {};
  c.sessions.forEach((s) => {
    if (s.scenarioId) scenarios.set(s.scenarioId, (scenarios.get(s.scenarioId) ?? 0) + 1);
    const log = state.logs[s.logId];
    if (!log) return;
    Object.entries(log.players).forEach(([u, p]) => {
      if (u === c.ownerId) return;
      users[u] = (users[u] ?? 0) + 1;
      p.characterIds.forEach((cid) => {
        if (cid === c.id) return;
        coChars[cid] = (coChars[cid] ?? 0) + 1;
      });
    });
  });

  return (
    <>
      <PageHead
        back={{ to: "/characters", label: "キャラクター" }}
        title={c.name}
        sub={<>{c.archetype} · {sys?.name} · 所有: {state.users[c.ownerId].name}{c.import && c.import.source !== "手入力" && <> · <IconWand width={11} height={11} className="inline" /> {c.import.source} から取り込み</>}</>}
        actions={
          <>
            {isMine && <button className="btn btn-ghost btn-sm" onClick={() => useEdit(c)}><IconPencil width={15} height={15} /> 編集</button>}
            <button className="btn btn-primary btn-sm" onClick={() => useShare(c)}><IconShare width={15} height={15} /> 共有する</button>
          </>
        }
      />

      {/* 現在値サマリー(名前・bioはページ見出しとプロフィールに集約) */}
      <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          {sys?.stats.map((st) => (
            <div key={st.key} className="min-w-20 text-center">
              <div className="text-[10.5px] font-extrabold text-ink2">{st.label}</div>
              <div className="text-2xl font-extrabold leading-tight">
                {st.key === "san" && sanNow != null ? sanNow : (c.stats[st.key] ?? "—")}
                {st.max && <span className="text-[11px] font-semibold text-ink2"> / {st.max}</span>}
              </div>
            </div>
          ))}
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-[10.5px] font-extrabold text-ink2">参加セッション</div>
              <div className="text-2xl font-extrabold">{c.sessions.length}</div>
            </div>
            <div className="text-center">
              <div className="text-[10.5px] font-extrabold text-ink2">{sys?.growthLabel}</div>
              <div className="text-2xl font-extrabold text-success">{c.growth.length}<span className="text-[11px] font-semibold text-ink2 ml-0.5">回 +{growthTotal}</span></div>
            </div>
          </div>
        </div>

      </div>

      {/* セッション時系列（成長もここに統合） */}
      <SectionTitle
        right={
          isMine ? (
            <button className="btn btn-ghost btn-xs" onClick={() => useAddGrowth(c)}>
              <IconPlus width={12} height={12} /> {sys?.growthLabel}を記録
            </button>
          ) : undefined
        }
      >
        セッション時系列
      </SectionTitle>
      {sessions.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty >
            参加セッションがまだありません。
            <p className="text-[11.5px] text-ink2 mt-1">ログの参加者リンクから自動で積み上がります。</p>
          </Empty>
        </div>
      ) : (
        <div className="tl">
          {sessions.map((s) => {
            const log = state.logs[s.logId];
            const glist = c.growth.filter((g) => g.logId === s.logId);
            return (
              <div key={s.logId} className="tlitem">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[13.5px]">{s.title}</b>
                  <span className="text-[11px] text-ink2">{fmtDate(s.date)}</span>
                  {log ? (
                    <button className="btn btn-ghost btn-xs" onClick={() => (location.hash = `/sessions/${s.logId}`)}>セッションを見る</button>
                  ) : (
                    <Tag v="gray" className="!badge-xs">セッション削除済み</Tag>
                  )}
                </div>
                {/* 統計値の変化 */}
                {Object.entries(s.delta).map(([k, d]) => {
                  const def = sys?.stats.find((x) => x.key === k);
                  const diff = d.after - d.before;
                  return def ? (
                    <div key={k} className="mt-1.5">
                      <Tag v={diff < 0 ? "danger" : "ok"}>{def?.label ?? k} {d.before}→{d.after}（{diff > 0 ? "+" : ""}{diff}）</Tag>
                    </div>
                  ) : null;
                })}
                {/* ロール */}
                {s.rolls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <IconDice width={13} height={13} className="self-center opacity-40" />
                    {s.rolls.slice(0, 4).map((r, i) => (
                      <Tag key={i} v={/クリティカル/.test(r.result) ? "ok" : /ファンブル/.test(r.result) ? "danger" : /SAN/.test(r.result) ? "gray" : "gray"}>
                        {r.skill} {r.result}
                      </Tag>
                    ))}
                    {s.rolls.length > 4 && <span className="text-[10.5px] text-ink2 self-center">ほか {s.rolls.length - 4}件</span>}
                  </div>
                )}
                {/* 成長（このセッションに紐づくもの） */}
                {glist.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 mt-1.5 text-[12px]">
                    <IconTrendingUp width={14} height={14} className="text-success" />
                    <b>{g.skill}</b>
                    <span className="text-ink2">{g.from} → <b className="text-success">{g.to}</b></span>
                    <span className="text-[10.5px] text-ink2">{sys?.growthLabel} · {g.note ?? ""}</span>
                  </div>
                ))}
                <div className="text-[11.5px] text-ink2 mt-1">{s.memo}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* プロフィール */}
      <SectionTitle>プロフィール</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-3">
        <p className="text-[12.5px] text-base-content/70">{c.bio || <span className="text-ink2">紹介文はまだありません</span>}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {c.tags.map((t) => (
            <Tag key={t} v="gray">{t}</Tag>
          ))}
        </div>
        {c.import && <p className="text-[10.5px] text-ink2 mt-2"><IconWand width={11} height={11} className="inline mr-1" />{c.import.source} から取り込み（{c.import.importedAt}）</p>}
      </div>

      {/* 関連 */}
      <SectionTitle right={<span className="text-[11px] text-ink2">クリックで辿れます</span>}>関連</SectionTitle>
      <div className="grid">
        <div className="card bg-base-100 border border-base-300 px-4 py-3">
          <div className="text-[11px] font-extrabold text-ink2 mb-2 flex items-center gap-1.5"><IconBooks width={13} height={13} /> 出演シナリオ</div>
          {scenarios.size === 0 && <p className="text-[11.5px] text-ink2">まだありません</p>}
          {[...scenarios.entries()].map(([scid, n]) => {
            const sc = state.scenarios[scid];
            return (
              <a key={scid} href={`#/scenarios/${scid}`} className="flex items-center gap-2 py-1.5 border-b border-base-200 last:border-0 hover:bg-base-200/40 rounded px-1">

                <span className="text-[12.5px] truncate">{sc.title}</span>
                <span className="text-[10.5px] text-ink2 ml-auto">{n}回</span>
              </a>
            );
          })}
        </div>
        <div className="card bg-base-100 border border-base-300 px-4 py-3">
          <div className="text-[11px] font-extrabold text-ink2 mb-2">同卓したキャラクター</div>
          {Object.keys(coChars).length === 0 && <p className="text-[11.5px] text-ink2">まだありません</p>}
          {Object.entries(coChars)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([cid, n]) => {
              const cc = state.characters[cid];
              return (
                <a key={cid} href={`#/characters/${cid}`} className="flex items-center gap-2 py-1.5 border-b border-base-200 last:border-0 hover:bg-base-200/40 rounded px-1">
                  <CharAvatar c={cc} size={22} />
                  <span className="text-[12.5px] truncate">{cc.name}</span>
                  <span className="text-[10.5px] text-ink2 ml-auto">{n}回</span>
                </a>
              );
            })}
        </div>
        <div className="card bg-base-100 border border-base-300 px-4 py-3">
          <div className="text-[11px] font-extrabold text-ink2 mb-2 flex items-center gap-1.5"><IconUsersGroup width={13} height={13} /> 一緒に遊んだ人</div>
          {Object.keys(users).length === 0 && <p className="text-[11.5px] text-ink2">まだありません</p>}
          {Object.entries(users)
            .sort((a, b) => b[1] - a[1])
            .map(([u, n]) => (
              <a key={u} href={`#/users/${u}`} className="flex items-center gap-2 py-1.5 border-b border-base-200 last:border-0 hover:bg-base-200/40 rounded px-1">
                <Avatar u={state.users[u]} size={22} />
                <span className="text-[12.5px]">{state.users[u].name}</span>
                <span className="text-[10.5px] text-ink2 ml-auto">{n}回</span>
              </a>
            ))}
        </div>
      </div>

      {/* モーダル（URL同期せず簡易にステートで管理） */}
      <CharModals key={c.id} c={c} />
    </>
  );
}

/* ---------- モーダル管理 ---------- */
let openEdit: ((c: Character) => void) | null = null;
let openShare: ((c: Character) => void) | null = null;
let openGrowth: ((c: Character) => void) | null = null;
function useEdit(c: Character) {
  openEdit?.(c);
}
function useShare(c: Character) {
  openShare?.(c);
}
function useAddGrowth(c: Character) {
  openGrowth?.(c);
}

function CharModals({ c }: { c: Character }) {
  const { state, update, toast } = useStore();
  const sys = SYSTEMS[c.systemId];
  const [edit, setEdit] = useState<Character | null>(null);
  const [share, setShare] = useState<Character | null>(null);
  const [growth, setGrowth] = useState<Character | null>(null);
  openEdit = setEdit;
  openShare = setShare;
  openGrowth = setGrowth;

  /* 編集 */
  const [name, setName] = useState(c.name);
  const [archetype, setArchetype] = useState(c.archetype);
  const [bio, setBio] = useState(c.bio);
  const [tags, setTags] = useState(c.tags.join(", "));
  const [color, setColor] = useState(c.color);
  const [stats, setStats] = useState<Record<string, number>>({ ...c.stats });

  /* 成長 */
  const [skill, setSkill] = useState(sys.skills[0] ?? "");
  const [custom, setCustom] = useState("");
  const [gFrom, setGFrom] = useState(0);
  const [gTo, setGTo] = useState(0);
  const [gDate, setGDate] = useState(c.sessions.at(-1)?.date ?? todayStr());
  const [gNote, setGNote] = useState("");
  const skillName = skill === "__custom__" ? custom : skill;

  function saveEdit() {
    update((s) => {
      const ch = s.characters[c.id];
      ch.name = name.trim() || ch.name;
      ch.archetype = archetype.trim();
      ch.bio = bio.trim();
      ch.tags = tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean);
      ch.color = color;
      ch.stats = stats;
    });
    toast("キャラクターを更新しました");
    setEdit(null);
  }
  function saveGrowth() {
    if (!skillName.trim() || gTo <= gFrom) {
      toast("技能名と上昇値を確認してください");
      return;
    }
    update((s) => {
      s.characters[c.id].growth.push({ id: "g_" + uid(), date: gDate || todayStr(), logId: c.sessions.at(-1)?.logId, skill: skillName.trim(), from: gFrom, to: gTo, note: gNote.trim() || undefined });
    });
    toast(`${skillName} ${gFrom}→${gTo} を記録しました`);
    setGrowth(null);
  }

  return (
    <>
      {edit && (
        <Modal
          title="キャラクターを編集"
          onClose={() => setEdit(null)}
          wide
          foot={
            <>
              <button className="btn" onClick={() => setEdit(null)}>キャンセル</button>
              <button className="btn btn-primary" onClick={saveEdit}>保存</button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="名前"><input className="input input-bordered input-sm w-full bg-base-100" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="型 / 職業など"><input className="input input-bordered input-sm w-full bg-base-100" value={archetype} onChange={(e) => setArchetype(e.target.value)} /></Field>
            <Field label="ラベル色"><input type="color" className="w-16" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
            <Field label="タグ（カンマ区切り）"><input className="input input-bordered input-sm w-full bg-base-100" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          </div>
          <Field label="ひとこと紹介"><textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
          {sys.stats.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-x-4">
              {sys.stats.map((st) => (
                <Field key={st.key} label={`${st.label}${st.max ? `（最大${st.max}）` : ""}`}>
                  <input type="number" className="input input-bordered input-sm w-full bg-base-100" value={stats[st.key] ?? 0} onChange={(e) => setStats({ ...stats, [st.key]: +e.target.value })} />
                </Field>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink2 mt-2">システム: {sys.name}（変更はできません。別システムのキャラは新しく登録してください）</p>
        </Modal>
      )}

      {share && (
        <Modal
          title="キャラクターを共有"
          onClose={() => setShare(null)}
          foot={
            <>
              <a className="btn" href={`#/share/c/${c.id}`}>プレビューを開く</a>
              <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(`https://takufu.app/c/${c.id}`).catch(() => {}); toast("共有リンクをコピーしました"); }}>リンクをコピー</button>
            </>
          }
        >
          <p className="text-[11.5px] text-ink2 mb-2">
            プロフィール・{sys.growthLabel}・セッション履歴が紐付いたカルテを1枚のページとして共有します。閲覧者はそこからシナリオや同卓を辿れます。
          </p>
          <button className={cx("btn btn-sm mb-2", c.share.enabled ? "btn-primary" : "")} onClick={() => update((s) => { s.characters[c.id].share.enabled = !s.characters[c.id].share.enabled; })}>
            {c.share.enabled ? "✓ リンクを知る人に公開中" : "非公開"}
          </button>
          {[
            ["現在の統計値（SANなど）を含める", "includeStats"],
            [`${sys.growthLabel}の履歴を含める`, "includeGrowth"],
            ["セッション履歴を含める", "includeSessions"],
            ["プロフィール（型・紹介・タグ）を含める", "includeProfile"],
          ].map(([label, key]) => (
            <div key={key} className="flex items-center gap-3 py-2 border-b border-base-200 last:border-0">
              <span className="text-[12px] text-ink2 grow">{label}</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={c.share[key as keyof Character["share"]] as boolean}
                onChange={(e) => update((s) => {
                  (s.characters[c.id].share as unknown as Record<string, boolean>)[key] = e.target.checked;
                })}
              />
            </div>
          ))}
          <div className="mt-3">
            <CopyBox text={`https://takufu.app/c/${c.id}`} />
          </div>
        </Modal>
      )}

      {growth && (
        <Modal
          title={`${sys.growthLabel}を記録`}
          onClose={() => setGrowth(null)}
          foot={
            <>
              <button className="btn" onClick={() => setGrowth(null)}>キャンセル</button>
              <button className="btn btn-primary" onClick={saveGrowth}>記録</button>
            </>
          }
        >
          <p className="text-[11px] text-ink2 mb-1 flex items-center gap-1.5"><IconHistory width={13} height={13} /> {sys.growthNote}</p>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="技能 / 能力">
              <select className="select select-bordered select-sm " value={skill} onChange={(e) => setSkill(e.target.value)}>
                {sys.skills.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="__custom__">自由入力…</option>
              </select>
            </Field>
            <Field label={skill === "__custom__" ? "技能名（自由入力）" : "補足"}>
              {skill === "__custom__" ? (
                <input className="input input-bordered input-sm w-full bg-base-100" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="例: 銃構築" />
              ) : (
                <input className="input input-bordered input-sm w-full bg-base-100" value={gNote} onChange={(e) => setGNote(e.target.value)} placeholder="例: クリティカルの余韻で" />
              )}
            </Field>
          </div>
          {skill === "__custom__" && (
            <Field label="補足"><input className="input input-bordered input-sm w-full bg-base-100" value={gNote} onChange={(e) => setGNote(e.target.value)} /></Field>
          )}
          <div className="grid sm:grid-cols-3 gap-x-4">
            <Field label="前の値"><input type="number" className="input input-bordered input-sm w-full bg-base-100" value={gFrom} onChange={(e) => setGFrom(+e.target.value)} /></Field>
            <Field label="新しい値"><input type="number" className="input input-bordered input-sm w-full bg-base-100" value={gTo} onChange={(e) => setGTo(+e.target.value)} /></Field>
            <Field label="日付"><input type="date" className="input input-bordered input-sm w-full bg-base-100" value={gDate} onChange={(e) => setGDate(e.target.value)} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- 型ヘルパ ---------- */
type GrowthRec = GrowthRecord;
