import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { CharAvatar, Empty, NotFound, Tag, rollCls } from "../components/ui";
import { SYSTEMS } from "../data/systems";
import { fmtDate } from "../lib/time";
import { IconDice, IconTrendingUp, IconUsersGroup } from "../components/icons";

export default function ShareChar() {
  const { id } = useParams();
  const { state } = useStore();
  const c = state.characters[id ?? ""];
  if (!c) return <NotFound what="キャラクター" />;
  const sys = SYSTEMS[c.systemId];
  const owner = state.users[c.ownerId];
  const isOwner = state.entered && c.ownerId === state.me;
  const share = c.share;

  if (!share.enabled && !isOwner) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="card bg-base-100 border border-base-300">
          <Empty>このキャラクターのカルテは非公開です。所有者に共有リンクを発行してもらってください。</Empty>
          <div className="text-center text-[11px] text-ink2 pb-5">卓譜 — takufu.app</div>
        </div>
      </div>
    );
  }

  const sessions = [...c.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const growth = [...c.growth].sort((a, b) => a.date.localeCompare(b.date));
  const sanKey = sys?.stats[0]?.key;
  const sanNow = sanKey ? sessions.map((s) => s.delta[sanKey]?.after).filter((n) => n != null).at(-1) : undefined;
  const growthTotal = growth.reduce((a, g) => a + (g.to - g.from), 0);

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-16">
      {isOwner && (
        <div className="bg-base-100 border border-base-300 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3">
          <span className="text-[11.5px] text-ink2">🔍 所有者プレビュー</span>
          {!share.enabled && <Tag v="warn">非公開（このリンクは他人には見えません）</Tag>}
        </div>
      )}

      {/* メインカード */}
      <div className="card bg-base-100 border border-base-300 px-6 py-7 text-center mb-4">
        <div className="flex justify-center"><CharAvatar c={c} size={84} /></div>
        <h1 className="text-2xl font-extrabold mt-3">{c.name}</h1>
        <p className="text-[12.5px] text-ink2 mt-0.5">{c.archetype}</p>
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          <Tag v="gray">{sys?.emoji} {sys?.short}</Tag>
          <Tag v="gray">所有: {owner.name}</Tag>
          {share.includeProfile && c.tags.map((t) => (
            <Tag key={t} v="accent">{t}</Tag>
          ))}
        </div>
        {share.includeProfile && c.bio && <p className="text-[13px] text-base-content/75 mt-4">{c.bio}</p>}

        {share.includeStats && sys?.stats.length > 0 && (
          <div className="flex flex-wrap justify-center items-end gap-x-8 gap-y-3 mt-6">
            {sys.stats.map((st) => (
              <div key={st.key} className="text-center">
                <div className="text-[10.5px] font-extrabold text-ink2">{st.label}</div>
                <div className="text-2xl font-extrabold">
                  {st.key === "san" && sanNow != null ? sanNow : (c.stats[st.key] ?? "—")}
                  {st.max && <span className="text-[11px] font-semibold text-ink2"> / {st.max}</span>}
                </div>
              </div>
            ))}
            <div className="text-center">
              <div className="text-[10.5px] font-extrabold text-ink2">参加セッション</div>
              <div className="text-2xl font-extrabold">{sessions.length}</div>
            </div>
            <div className="text-center">
              <div className="text-[10.5px] font-extrabold text-ink2">{sys.growthLabel}</div>
              <div className="text-2xl font-extrabold text-success">{growth.length}<span className="text-[11px] font-semibold text-ink2 ml-0.5">回 +{growthTotal}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* セッション履歴 */}
      {share.includeSessions && sessions.length > 0 && (
        <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
          <div className="text-[11px] font-extrabold text-ink2 mb-2">セッション履歴</div>
          {sessions.map((s) => (
            <div key={s.logId} className="py-2.5 border-b border-base-200 last:border-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10.5px] text-ink2 w-16">{fmtDate(s.date)}</span>
                <b className="text-[13px]">{s.title}</b>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(s.delta).map(([k, d]) => {
                  const def = sys?.stats.find((x) => x.key === k);
                  const diff = d.after - d.before;
                  return (
                    <Tag key={k} v={diff < 0 ? "danger" : "ok"}>
                      {def?.label ?? k} {d.before}→{d.after}
                    </Tag>
                  );
                })}
                {s.rolls.slice(0, 3).map((r, i) => (
                  <Tag key={i} v={/クリティカル/.test(r.result) ? "ok" : /ファンブル/.test(r.result) ? "danger" : "gray"}>
                    <IconDice width={10} height={10} /> {r.skill} {rollCls(r.result) ? r.result : ""}
                  </Tag>
                ))}
                {s.rolls.length > 3 && <span className="text-[10.5px] text-ink2 self-center">ほか {s.rolls.length - 3}件</span>}
              </div>
              {s.logId && state.logs[s.logId]?.scope === "public" ? (
                <a className="text-[11px] link mt-1 inline-block" href={`#/share/l/${s.logId}`}>公開ログを開く →</a>
              ) : s.logId && state.logs[s.logId] ? (
                <span className="text-[11px] text-ink2 mt-1 inline-block">メンバー限定のログ</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* 成長 */}
      {share.includeGrowth && growth.length > 0 && (
        <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
          <div className="text-[11px] font-extrabold text-ink2 mb-1.5">{sys?.growthLabel}の履歴</div>
          {growth.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-[12.5px] py-1.5 border-b border-base-200 last:border-0">
              <IconTrendingUp width={14} height={14} className="text-success flex-none" />
              <b>{g.skill}</b>
              <span className="text-ink2">{g.from} → <b className="text-success">{g.to}</b></span>
              <span className="text-[10.5px] text-ink2 ml-auto">{fmtDate(g.date)}{g.note && ` · ${g.note}`}</span>
            </div>
          ))}
        </div>
      )}

      {!share.includeSessions && !share.includeGrowth && (
        <div className="card bg-base-100 border border-base-300 mb-4">
          <p className="text-[11.5px] text-ink2 text-center py-3">共有範囲の設定により、履歴は非公開です。</p>
        </div>
      )}

      <div className="text-center text-[11px] text-ink2 border-t border-base-300 pt-4">
        <IconUsersGroup width={13} height={13} className="inline mr-1 opacity-60" />
        卓譜 探索者カルテ · 共有リンクから閲覧されています · <a href="#/sessions" className="link">takufu.app</a>
      </div>
    </div>
  );
}
