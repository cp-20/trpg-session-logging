/**
 * シナリオを足すときの入力（シナリオの追加・記録の途中の両方で使う）。
 * 配布ページの URL から読み込めるものは読み込み（P2）、残りを手で足す。
 */
import type { ExternalSyncConfig, ExternalSyncProvider, Scenario } from "../types";
import type { ImportedScenario } from "./external-sync";
import { cleanTags } from "./tags";

export interface NewScenarioInput {
  title: string;
  author: string;
  /** 共有範囲。true ならセッションと同じ、false なら全員。省くと URL の有無で決める（newScenarioIsPrivate） */
  private?: boolean;
  sourceUrl?: string;
  tags?: string[];
  description?: string;
  externalSync?: ExternalSyncConfig;
}

/** 配布ページの URL から配布元を判定する */
export function sourceFromUrl(url: string): Scenario["source"] {
  const u = url.trim();
  if (!u) return "manual";
  if (/booth\.pm/.test(u)) return "booth";
  if (/talto\.cc/.test(u)) return "talto";
  return "url";
}

/**
 * 共有範囲の既定。配布ページのあるものはだれでも遊べるので全員、ないもの（自作・事前相談など）は
 * 安全側のセッションと同じ（P14）。選んだあとはそれに従う
 */
export function newScenarioIsPrivate(s: Pick<NewScenarioInput, "private" | "sourceUrl">): boolean {
  return s.private ?? !s.sourceUrl?.trim();
}

/** 足すシナリオの欄のうち、題名・作者・システム以外 */
export function newScenarioExtras(
  s: NewScenarioInput,
): Pick<Scenario, "source" | "sourceUrl" | "tags" | "description" | "externalSync" | "private"> {
  const sourceUrl = s.sourceUrl?.trim();
  const description = s.description?.trim();
  return {
    source: sourceFromUrl(sourceUrl ?? ""),
    tags: cleanTags(s.tags ?? []),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(description ? { description } : {}),
    ...(s.externalSync && sourceUrl ? { externalSync: s.externalSync } : {}),
    ...(newScenarioIsPrivate(s) ? { private: true } : {}),
  };
}

export type ScenarioPageResult =
  | { ok: true; scenario: ImportedScenario; sync: ExternalSyncConfig }
  | { ok: false; error: string };

/** 配布ページ（BOOTH・TALTO）を読み、題名・作者・概要などを取り出す */
export async function fetchScenarioPage(rawUrl: string): Promise<ScenarioPageResult> {
  try {
    const res = await fetch("/api/import/external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: rawUrl }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      kind?: string;
      provider?: ExternalSyncProvider;
      url?: string;
      contentHash?: string;
      fetchedAt?: string;
      scenario?: ImportedScenario;
      error?: string;
    };
    if (!res.ok || !data.ok || data.kind !== "scenario" || !data.scenario || !data.provider)
      return { ok: false, error: data.error ?? "シナリオページの情報を読み取れませんでした。" };
    return {
      ok: true,
      scenario: data.scenario,
      sync: {
        provider: data.provider,
        url: data.url ?? rawUrl,
        lastSyncedAt: data.fetchedAt ?? new Date().toISOString(),
        lastStatus: "ok",
        contentHash: data.contentHash,
        autoSync: false,
      },
    };
  } catch {
    return { ok: false, error: "配布ページの情報を読み込めませんでした。URL をお確かめください。" };
  }
}
