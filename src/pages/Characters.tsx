import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useStore } from "../store";
import { EmptyState, Field, Modal, PageHead, Select, SysBadge, cx } from "../components/ui";
import { CharAvatar } from "../components/identity";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { fmtDateShort, uid, todayStr } from "../lib/time";
import {
  importCharacterFromFile,
  importCharacterFromText,
  toCharacterFields,
  type CharacterImportResult,
} from "../lib/importers";
import type { Character } from "../types";
import { IconFileText, IconPlus, IconSearch, IconUpload } from "../components/icons";

/** セッション記録での最新値を優先し、なければキャラシートの値を返す */
export function currentStat(c: Character, key: string): number | undefined {
  const latest = [...c.sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => s.delta[key]?.after)
    .filter((n): n is number => n != null)
    .at(-1);
  return latest ?? c.stats[key];
}

function lastPlayed(c: Character): string | undefined {
  return c.sessions.reduce<string | undefined>((max, s) => (!max || s.date > max ? s.date : max), undefined);
}

/** 顔を主役にしたキャラクターカード。一覧とユーザーページで共通に使う */
export function CharacterCard({ c }: { c: Character }) {
  const sys = SYSTEMS[c.systemId];
  const last = lastPlayed(c);
  const stats = (sys?.stats ?? []).filter((st) => currentStat(c, st.key) != null);
  return (
    <Link to={`/characters/${c.id}` as never} className="card-interactive flex-row items-start gap-4 p-4">
      <CharAvatar c={c} size={72} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-bold leading-snug">{c.name}</h3>
        {c.archetype && <p className="truncate text-sm text-ink2">{c.archetype}</p>}
        <div className="meta mt-2 text-xs">
          <SysBadge sys={sys} />
        </div>
        <div className="meta mt-1 text-xs tabular-nums">
          {stats.map((st) => (
            <span key={st.key}>
              {st.label} <b className="text-base-content">{currentStat(c, st.key)}</b>
            </span>
          ))}
          <span>{last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Characters() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");
  const [wizard, setWizard] = useState(false);
  const [manual, setManual] = useState(false);

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
      <button className="btn btn-primary" onClick={() => setWizard(true)}>
        <IconFileText width={16} height={16} /> キャラシートを取り込む
      </button>
      <button className="btn" onClick={() => setManual(true)}>
        <IconPlus width={16} height={16} /> 手入力
      </button>
    </>
  );

  return (
    <>
      <PageHead title="キャラクター" actions={myChars.length > 0 ? actions : undefined} />

      {myChars.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind="first"
            title="キャラクターを登録しましょう"
            action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
          >
            CCFOLIA・いあきゃら・キャラクター保管所・Udonarium のデータから取り込めます。
          </EmptyState>
        </div>
      ) : (
        <>
          {myChars.length > 4 && (
            <div className="mb-5 flex flex-col gap-2 sm:flex-row">
              <label className="input flex flex-1 items-center gap-2">
                <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
                <input
                  type="search"
                  className="min-w-0 grow"
                  placeholder="名前・職業・タグで検索"
                  aria-label="キャラクターを検索"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              {usedSystems.size > 1 && (
                <Select
                  ariaLabel="システムで絞り込む"
                  value={sys}
                  onChange={setSys}
                  className="sm:w-60"
                  options={[
                    { value: "all", label: "すべてのシステム" },
                    ...SYSTEM_LIST.filter((x) => usedSystems.has(x.id)).map((x) => ({
                      value: x.id,
                      label: x.name,
                    })),
                  ]}
                />
              )}
            </div>
          )}
          {list.length === 0 ? (
            <div className="surface">
              <EmptyState
                kind="filtered"
                action={
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setQ("");
                      setSys("all");
                    }}
                  >
                    絞り込みを解除
                  </button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <CharacterCard key={c.id} c={c} />
              ))}
            </div>
          )}
        </>
      )}

      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
      {manual && <NewCharModal onClose={() => setManual(false)} />}
    </>
  );
}

/* ================= キャラクター取り込み ================= */
function ImportWizard({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const nav = useNavigate();
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Character> | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("取り込み");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function showParsed(result: CharacterImportResult | null) {
    if (!result) {
      setError(
        "キャラクターを読み取れませんでした。CCFOLIA（JSON / ZIP）・いあきゃら（テキスト）・キャラクター保管所（JSON）・Udonarium（XML / ZIP）の形式をお確かめください。",
      );
      return;
    }
    setError(null);
    setSourceLabel(result.sourceLabel);
    setPreview(toCharacterFields(result.character, "general"));
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
      showParsed(await importCharacterFromFile(file));
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
        id,
        ownerId: state.me,
        name: preview.name!.trim(),
        systemId: preview.systemId ?? "general",
        color: preview.color ?? "#0e7490",
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
    onClose();
    nav({ to: `/characters/${id}` as never });
  }

  return (
    <Modal
      title="キャラシートを取り込む"
      onClose={onClose}
      wide
      foot={
        preview ? (
          <>
            <button
              className="btn btn-quiet"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              戻る
            </button>
            <button className="btn btn-primary" onClick={save}>
              取り込む
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-quiet" onClick={onClose}>
              キャンセル
            </button>
            <button
              className="btn btn-primary"
              disabled={parsing || !pasted.trim()}
              onClick={() => showParsed(importCharacterFromText(pasted))}
            >
              内容を確認
            </button>
          </>
        )
      }
    >
      {!preview ? (
        <>
          <label
            htmlFor="character-file"
            className={cx("drop block cursor-pointer !py-7", dragging && "hot", parsing && "opacity-60")}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) setFileName(file.name);
              readFile(file);
            }}
          >
            <IconUpload width={24} height={24} className="mx-auto text-ink2" aria-hidden />
            <span className="mt-2 block font-bold">ファイルを選ぶ・ここにドロップ</span>
            <span className="mt-1 block text-xs text-ink2">
              {fileName ?? "CCFOLIA・キャラクター保管所（.json / .zip）、Udonarium（.xml / .zip）"}
            </span>
            <input
              id="character-file"
              type="file"
              className="sr-only"
              accept=".json,.txt,.xml,.zip"
              disabled={parsing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setFileName(file.name);
                readFile(file);
                event.target.value = "";
              }}
            />
          </label>
          {parsing && (
            <p role="status" className="flex items-center gap-2 text-sm mt-3">
              <span className="loading loading-spinner loading-sm" />
              読み込み中…
            </p>
          )}
          <div className="my-4 flex items-center gap-3 text-xs text-ink2" aria-hidden>
            <span className="h-px flex-1 bg-base-300" />
            または貼り付け
            <span className="h-px flex-1 bg-base-300" />
          </div>
          <Field label="キャラクターデータ（JSON / テキスト / XML）" noMargin>
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              rows={5}
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setError(null);
              }}
              placeholder="CCFOLIAのコマ出力、いあきゃらのテキスト出力などを貼り付け"
            />
          </Field>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink2">
            {sourceLabel}から読み取りました。登録前に内容を確認してください。
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {preview.image && (
              <img
                src={preview.image}
                alt="取り込んだキャラクター画像"
                className="size-20 shrink-0 rounded-full border border-base-300 object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="grid flex-1 gap-x-4 sm:grid-cols-2">
              <Field label="名前" noMargin>
                <input
                  className="input input-bordered w-full"
                  value={preview.name ?? ""}
                  onChange={(event) => setPreview({ ...preview, name: event.target.value })}
                />
              </Field>
              <div className="mt-4 sm:mt-0">
                <Field label="職業など" noMargin>
                  <input
                    className="input input-bordered w-full"
                    value={preview.archetype ?? ""}
                    onChange={(event) => setPreview({ ...preview, archetype: event.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="システム">
                  <Select
                    ariaLabel="システム"
                    className="w-full"
                    value={preview.systemId ?? "general"}
                    onChange={(v) => setPreview({ ...preview, systemId: v })}
                    options={SYSTEM_LIST.map((system) => ({ value: system.id, label: system.name }))}
                  />
                </Field>
              </div>
            </div>
          </div>
          <Field label="紹介・メモ">
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              rows={3}
              value={preview.bio ?? ""}
              onChange={(event) => setPreview({ ...preview, bio: event.target.value })}
            />
          </Field>
          {Object.keys(preview.stats ?? {}).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2">ステータス</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                {Object.entries(preview.stats ?? {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 border-b border-base-300 pb-1">
                    <dt>
                      {SYSTEMS[preview.systemId ?? "general"]?.stats.find((stat) => stat.key === key)
                        ?.label ?? key.toUpperCase()}
                    </dt>
                    <dd className="tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-error mt-3">
          {error}
        </p>
      )}
    </Modal>
  );
}

/* ---------- 手入力 ---------- */
interface NewCharFormValues {
  name: string;
  systemId: string;
  archetype: string;
  bio: string;
  tags: string;
  color: string;
}

function NewCharModal({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const nav = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<NewCharFormValues>({
    mode: "onChange",
    defaultValues: {
      name: "",
      systemId: "coc7",
      archetype: "",
      bio: "",
      tags: "",
      color: "#5348c8",
    },
  });

  function onSubmit(values: NewCharFormValues) {
    const id = "ch_" + uid();
    update((s) => {
      const stats: Record<string, number> = {};
      s.characters[id] = {
        id,
        ownerId: s.me,
        name: values.name.trim(),
        systemId: values.systemId,
        color: values.color,
        archetype:
          values.archetype.trim() || `${SYSTEMS[values.systemId]?.name ?? "汎用・その他"}のキャラクター`,
        bio: values.bio.trim(),
        tags: values.tags
          .split(/[,、]/)
          .map((t) => t.trim())
          .filter(Boolean),
        stats,
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
        import: { source: "手入力", importedAt: new Date().toISOString().slice(0, 10) },
      };
    });
    onClose();
    nav({ to: `/characters/${id}` as never });
  }

  return (
    <Modal
      title="キャラクターを登録"
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
            登録する
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
              placeholder="例: 遠沢澄花"
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
          <Field label="システム">
            <Controller
              name="systemId"
              control={control}
              render={({ field }) => (
                <Select
                  ariaLabel="システム"
                  className="w-full"
                  value={field.value}
                  onChange={field.onChange}
                  options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
                />
              )}
            />
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
        </div>
        <Field label="ひとこと紹介">
          <textarea className="textarea textarea-bordered w-full text-sm" {...register("bio")} />
        </Field>
        <Field label="タグ（カンマ区切り）">
          <input className="input input-bordered w-full" placeholder="例: 継続, 学生" {...register("tags")} />
        </Field>
      </form>
    </Modal>
  );
}
