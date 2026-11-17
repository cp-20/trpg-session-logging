import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "../lib/router";
import { Controller, useForm } from "react-hook-form";
import { useStore } from "../store";
import {
  CopyBox,
  EmptyState,
  Field,
  Modal,
  NotFound,
  PageHead,
  SectionTitle,
  Select,
  SysBadge,
  cx,
} from "../components/ui";
import { CharAvatar } from "../components/identity";
import { SYSTEMS } from "../data/systems";
import { fmtDate, fmtDateShort, todayStr, uid } from "../lib/time";
import type { Character, GrowthRecord, SessionStat } from "../types";
import { currentStat } from "./Characters";
import { IconTrendingUp, IconPencil, IconShare, IconPlus, IconHistory } from "../components/icons";

export default function CharacterDetail() {
  const { id } = useParams<{ id?: string }>();
  const { state } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);

  const c = state.characters[id ?? ""];
  if (!c) return <NotFound what="キャラクター" />;
  const sys = SYSTEMS[c.systemId];
  const isMine = c.ownerId === state.me;
  const owner = state.users[c.ownerId];
  const sessions = [...c.sessions].sort((a, b) => b.date.localeCompare(a.date));
  const sessionLogIds = new Set(c.sessions.map((s) => s.logId));
  const looseGrowth = c.growth
    .filter((g) => !g.logId || !sessionLogIds.has(g.logId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const firstDate = sessions.at(-1)?.date;

  /* 同卓したキャラクター */
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

  // 能力値はキャラシートと記録から分かるものだけ。セッション数などの集計は出さない
  const statCells: { label: string; value: ReactNode }[] = (sys?.stats ?? []).map((st) => ({
    label: st.label,
    value: (
      <>
        {currentStat(c, st.key) ?? "-"}
        {st.max && <span className="text-sm font-medium text-ink3"> / {st.max}</span>}
      </>
    ),
  }));

  return (
    <>
      <PageHead
        back={isMine ? { to: "/characters", label: "キャラクター" } : undefined}
        lead={<CharAvatar c={c} size={80} />}
        title={c.name}
        sub={
          <div className="meta">
            {c.archetype && <span>{c.archetype}</span>}
            <SysBadge sys={sys} />
            {!isMine && owner && (
              <Link to={`/users/${c.ownerId}`} className="link-hover">
                {owner.name}のキャラクター
              </Link>
            )}
          </div>
        }
        actions={
          isMine ? (
            <>
              <button className="btn" onClick={() => setEditOpen(true)}>
                <IconPencil width={16} height={16} /> 編集
              </button>
              <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
                <IconShare width={16} height={16} /> 共有
              </button>
            </>
          ) : undefined
        }
      />

      {(c.bio || c.tags.length > 0) && (
        <div className="mb-6 max-w-3xl">
          {c.bio && (
            <p data-user-content className="whitespace-pre-wrap text-sm leading-relaxed sm:text-base">
              {c.bio}
            </p>
          )}
          {c.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink2">
              {c.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
        </div>
      )}

      {statCells.length > 0 && (
        <dl className="surface flex flex-wrap">
          {statCells.map((cell, i) => (
            <div
              key={cell.label}
              className={cx(
                "min-w-24 flex-1 px-4 py-3.5 sm:px-5 sm:py-4",
                i > 0 && "border-l border-base-300",
              )}
            >
              <dt className="eyebrow">{cell.label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{cell.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <SectionTitle
        sub={firstDate ? `${fmtDate(firstDate)}から` : undefined}
        right={
          isMine ? (
            <button className="btn btn-sm" onClick={() => setGrowthOpen(true)}>
              <IconPlus width={14} height={14} /> {sys?.growthLabel ?? "成長"}を記録
            </button>
          ) : undefined
        }
      >
        これまでのセッション
      </SectionTitle>
      {sessions.length === 0 && looseGrowth.length === 0 ? (
        <div className="surface">
          <EmptyState kind="first" title="まだセッションに参加していません">
            セッションを記録するときに、参加者としてこのキャラクターを選ぶとここに並びます。
          </EmptyState>
        </div>
      ) : (
        <ol className="surface list">
          {sessions.map((s) => {
            const log = state.logs[s.logId];
            const glist = c.growth.filter((g) => g.logId === s.logId);
            const body = (
              <>
                <time className="w-14 shrink-0 pt-0.5 text-sm tabular-nums text-ink2" dateTime={s.date}>
                  {fmtDateShort(s.date)}
                  {s.date.slice(0, 4) !== String(new Date().getFullYear()) && (
                    <span className="block text-xs text-ink3">{s.date.slice(0, 4)}</span>
                  )}
                </time>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold leading-snug">{s.title}</h3>
                  <Changes s={s} sysStats={sys?.stats ?? []} growth={glist} />
                  {s.memo.trim() && (
                    <p data-user-content className="mt-1.5 text-sm leading-relaxed text-ink2">
                      {s.memo}
                    </p>
                  )}
                  {!log && <p className="mt-1 text-xs text-ink3">記録は削除されています</p>}
                </div>
              </>
            );
            return (
              <li key={s.logId}>
                {log ? (
                  <Link to={`/sessions/${s.logId}`} className="row-interactive flex gap-4 px-4 py-4 sm:px-5">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-4 px-4 py-4 sm:px-5">{body}</div>
                )}
              </li>
            );
          })}
          {looseGrowth.length > 0 && (
            <li className="px-4 py-4 sm:px-5">
              <h3 className="eyebrow mb-1.5">セッション外の{sys?.growthLabel ?? "成長"}</h3>
              <ul className="space-y-1">
                {looseGrowth.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-3 text-sm tabular-nums">
                    <span className="w-14 text-ink2">{fmtDateShort(g.date)}</span>
                    <GrowthLine g={g} />
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ol>
      )}

      {coCharEntries.length > 0 && (
        <>
          <SectionTitle>一緒に遊んだキャラクター</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {coCharEntries.map(([cid]) => {
              const cc = state.characters[cid]!;
              return (
                <Link
                  key={cid}
                  to={`/characters/${cid}`}
                  className="card-interactive flex-row items-center gap-3 px-3.5 py-3"
                >
                  <CharAvatar c={cc} size={40} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{cc.name}</b>
                    <span className="block truncate text-xs text-ink2">
                      {state.users[cc.ownerId]?.name ?? cc.archetype}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {editOpen && <EditCharModal key={c.id} c={c} onClose={() => setEditOpen(false)} />}
      {shareOpen && <ShareCharModal key={c.id} c={c} onClose={() => setShareOpen(false)} />}
      {growthOpen && <AddGrowthModal key={c.id} c={c} onClose={() => setGrowthOpen(false)} />}
    </>
  );
}

function GrowthLine({ g }: { g: GrowthRecord }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <IconTrendingUp width={14} height={14} className="shrink-0 text-success" aria-hidden />
      <b className="font-semibold">{g.skill}</b>
      <span className="text-ink2">
        {g.from}→<b className="text-success">{g.to}</b>
      </span>
      {g.note && <span className="text-xs text-ink3">{g.note}</span>}
    </span>
  );
}

/** そのセッションでの能力値の増減と成長をまとめて1行に並べる */
function Changes({
  s,
  sysStats,
  growth,
}: {
  s: SessionStat;
  sysStats: { key: string; label: string }[];
  growth: GrowthRecord[];
}) {
  const deltas = Object.entries(s.delta).flatMap(([k, d]) => {
    const def = sysStats.find((x) => x.key === k);
    return def ? [{ k, label: def.label, ...d, diff: d.after - d.before }] : [];
  });
  if (deltas.length === 0 && growth.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
      {deltas.map((d) => (
        <span key={d.k}>
          <b className="font-semibold">{d.label}</b>{" "}
          <span className="text-ink2">
            {d.before}→{d.after}
          </span>{" "}
          <span className={cx("font-semibold", d.diff < 0 ? "text-error" : "text-success")}>
            {d.diff > 0 ? `+${d.diff}` : d.diff === 0 ? "±0" : `−${-d.diff}`}
          </span>
        </span>
      ))}
      {growth.map((g) => (
        <GrowthLine key={g.id} g={g} />
      ))}
    </div>
  );
}

interface EditCharFormValues {
  name: string;
  archetype: string;
  bio: string;
  tags: string;
  color: string;
  stats: Record<string, number>;
}

function EditCharModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EditCharFormValues>({
    mode: "onChange",
    defaultValues: {
      name: c.name,
      archetype: c.archetype,
      bio: c.bio,
      tags: c.tags.join(", "),
      color: c.color,
      stats: { ...c.stats },
    },
  });

  function onSubmit(values: EditCharFormValues) {
    update((s) => {
      const ch = s.characters[c.id];
      ch.name = values.name.trim();
      ch.archetype = values.archetype.trim();
      ch.bio = values.bio.trim();
      ch.tags = values.tags
        .split(/[,、]/)
        .map((t) => t.trim())
        .filter(Boolean);
      ch.color = values.color;
      ch.stats = values.stats;
    });
    onClose();
  }

  return (
    <Modal
      title="キャラクターを編集"
      onClose={onClose}
      wide
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid}
            onClick={handleSubmit(onSubmit)}
          >
            保存
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="名前">
            <input
              className={cx("input input-bordered w-full", errors.name && "input-error")}
              aria-invalid={errors.name ? "true" : undefined}
              {...register("name", {
                validate: (v) => v.trim().length > 0 || "名前を入力してください",
              })}
            />
            {errors.name?.message && (
              <p role="alert" className="text-xs text-error mt-1">
                {errors.name.message}
              </p>
            )}
          </Field>
          <Field label="職業など">
            <input className="input input-bordered w-full" {...register("archetype")} />
          </Field>
          <Field label="テーマ色">
            <input
              type="color"
              className="h-10 w-16 cursor-pointer rounded-lg border border-base-300 bg-base-100 p-1"
              {...register("color")}
            />
          </Field>
          <Field label="タグ（カンマ区切り）">
            <input className="input input-bordered w-full" {...register("tags")} />
          </Field>
        </div>
        <Field label="ひとこと紹介">
          <textarea className="textarea textarea-bordered w-full text-sm" {...register("bio")} />
        </Field>
        {sys.stats.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-x-4">
            {sys.stats.map((st) => (
              <Field key={st.key} label={`${st.label}${st.max ? `（最大${st.max}）` : ""}`}>
                <input
                  type="number"
                  className="input input-bordered w-full"
                  {...register(`stats.${st.key}`, { valueAsNumber: true })}
                />
              </Field>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm text-ink2">
          システム: <SysBadge sys={sys} />
        </p>
      </form>
    </Modal>
  );
}

function ShareCharModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  const url = `${location.origin}/share/c/${c.id}`;
  const set = (key: keyof Character["share"], value: boolean) =>
    update((s) => {
      (s.characters[c.id].share as unknown as Record<string, boolean>)[key] = value;
    });
  const parts: [keyof Character["share"], string][] = [
    ["includeProfile", "プロフィール（職業・紹介・タグ）"],
    ["includeStats", `現在の${(sys?.stats ?? []).map((x) => x.label).join("・") || "能力値"}`],
    ["includeSessions", "参加したセッション"],
    ["includeGrowth", `${sys?.growthLabel ?? "成長"}の履歴`],
  ];
  return (
    <Modal
      title={`${c.name}を共有`}
      onClose={onClose}
      foot={
        <>
          {c.share.enabled && (
            <Link className="btn" to={`/share/c/${c.id}`}>
              共有ページを見る
            </Link>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            完了
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <b className="block text-sm">リンクを知っている人に公開</b>
          <p className="mt-0.5 text-sm text-ink2">
            {c.share.enabled
              ? "このリンクを知っている人は、下で選んだ内容を見られます。"
              : "オフのあいだは、あなた以外は見られません。"}
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary mt-0.5"
          aria-label="リンクを知っている人に公開"
          checked={c.share.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
      </div>
      {c.share.enabled && (
        <>
          <div className="mt-4">
            <CopyBox text={url} />
          </div>
          <fieldset className="mt-5">
            <legend className="eyebrow mb-1">共有ページに載せる内容</legend>
            <div className="list">
              {parts.map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 py-2.5">
                  <span className="grow text-sm">{label}</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={c.share[key] as boolean}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </Modal>
  );
}

interface AddGrowthFormValues {
  logId: string;
  skill: string;
  custom: string;
  gFrom: number;
  gTo: number;
  gDate: string;
  gNote: string;
}

function AddGrowthModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const { update } = useStore();
  const sys = SYSTEMS[c.systemId];
  const recent = [...c.sessions].sort((a, b) => b.date.localeCompare(a.date));
  const {
    register,
    control,
    watch,
    getValues,
    setValue,
    trigger,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<AddGrowthFormValues>({
    mode: "onChange",
    defaultValues: {
      logId: recent[0]?.logId ?? "",
      skill: sys.skills[0] ?? "__custom__",
      custom: "",
      gFrom: 0,
      gTo: 0,
      gDate: recent[0]?.date ?? todayStr(),
      gNote: "",
    },
  });

  const skill = watch("skill");

  function onSubmit(values: AddGrowthFormValues) {
    const skillName = values.skill === "__custom__" ? values.custom : values.skill;
    update((s) => {
      s.characters[c.id].growth.push({
        id: "g_" + uid(),
        date: values.gDate || todayStr(),
        logId: values.logId || undefined,
        skill: skillName.trim(),
        from: values.gFrom,
        to: values.gTo,
        note: values.gNote.trim() || undefined,
      });
    });
    onClose();
  }

  return (
    <Modal
      title={`${sys.growthLabel}を記録`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid}
            onClick={handleSubmit(onSubmit)}
          >
            記録
          </button>
        </>
      }
    >
      <p className="text-sm text-ink2 flex items-start gap-1.5">
        <IconHistory width={16} height={16} className="mt-0.5 shrink-0" aria-hidden /> {sys.growthNote}
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        {recent.length > 0 && (
          <Field label="どのセッションのあとか">
            <Controller
              name="logId"
              control={control}
              render={({ field }) => (
                <Select
                  ariaLabel="どのセッションのあとか"
                  className="w-full"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    const hit = recent.find((r) => r.logId === v);
                    if (hit) setValue("gDate", hit.date);
                  }}
                  options={[
                    ...recent.map((r) => ({ value: r.logId, label: `${fmtDateShort(r.date)} ${r.title}` })),
                    { value: "", label: "セッションに紐付けない" },
                  ]}
                />
              )}
            />
          </Field>
        )}
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="技能 / 能力">
            <Controller
              name="skill"
              control={control}
              render={({ field }) => (
                <Select
                  ariaLabel="技能 / 能力"
                  className="w-full"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    void trigger("custom");
                  }}
                  options={[
                    ...sys.skills.map((s) => ({ value: s, label: s })),
                    { value: "__custom__", label: "自由入力…" },
                  ]}
                />
              )}
            />
          </Field>
          <Field label={skill === "__custom__" ? "技能名（自由入力）" : "補足"}>
            {skill === "__custom__" ? (
              <>
                <input
                  className={cx("input input-bordered w-full", errors.custom && "input-error")}
                  aria-invalid={errors.custom ? "true" : undefined}
                  placeholder="例: 銃構築"
                  {...register("custom", {
                    validate: (v) =>
                      getValues("skill") !== "__custom__" ||
                      v.trim().length > 0 ||
                      "技能名を入力してください",
                  })}
                />
                {errors.custom?.message && (
                  <p role="alert" className="text-xs text-error mt-1">
                    {errors.custom.message}
                  </p>
                )}
              </>
            ) : (
              <input
                className="input input-bordered w-full"
                placeholder="例: クリティカルの余韻で"
                {...register("gNote")}
              />
            )}
          </Field>
        </div>
        {skill === "__custom__" && (
          <Field label="補足">
            <input className="input input-bordered w-full" {...register("gNote")} />
          </Field>
        )}
        <div className="grid sm:grid-cols-3 gap-x-4">
          <Field label="前の値">
            <input
              type="number"
              className="input input-bordered w-full"
              {...register("gFrom", {
                valueAsNumber: true,
                onChange: () => {
                  void trigger("gTo");
                },
              })}
            />
          </Field>
          <Field label="新しい値">
            <input
              type="number"
              className={cx("input input-bordered w-full", errors.gTo && "input-error")}
              aria-invalid={errors.gTo ? "true" : undefined}
              {...register("gTo", {
                valueAsNumber: true,
                validate: (v) =>
                  (!Number.isNaN(v) && v > getValues("gFrom")) || "前の値より大きい数値を入力してください",
              })}
            />
            {errors.gTo?.message && (
              <p role="alert" className="text-xs text-error mt-1">
                {errors.gTo.message}
              </p>
            )}
          </Field>
          <Field label="日付">
            <input type="date" className="input input-bordered w-full" {...register("gDate")} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
