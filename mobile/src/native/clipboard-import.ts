import * as Clipboard from "expo-clipboard";
import {
  importCharacterFromText,
  importLogFromText,
  type CharacterImportResult,
  type LogImportResult,
} from "@shared/lib/importers";

export type ClipboardSuggestion =
  | { kind: "invite"; token: string; url: string }
  | { kind: "shareLog"; slug: string; url: string }
  | { kind: "shareCharacter"; id: string; url: string }
  | {
      kind: "character";
      result: CharacterImportResult;
      previewName: string;
      sourceLabel: string;
    }
  | {
      kind: "log";
      result: LogImportResult;
      messageCount: number;
      sourceLabel: string;
    };

const INVITE_URL_RE = /(?:takufu:\/\/invite\/|https?:\/\/[^/\s]+\/invite\/)([A-Za-z0-9_-]+)/i;
const SHARE_LOG_URL_RE = /(?:takufu:\/\/share\/l\/|https?:\/\/[^/\s]+\/share\/l\/)([A-Za-z0-9_-]+)/i;
const SHARE_CHAR_URL_RE = /(?:takufu:\/\/share\/c\/|https?:\/\/[^/\s]+\/share\/c\/)([A-Za-z0-9_-]+)/i;

/**
 * クリップボード文字列から「卓譜でそのまま取り込める内容」を判別する純粋関数。
 */
export function classifyClipboardContent(raw: string): ClipboardSuggestion | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const inviteMatch = INVITE_URL_RE.exec(trimmed);
  if (inviteMatch?.[1]) {
    return { kind: "invite", token: inviteMatch[1], url: trimmed };
  }
  const shareLogMatch = SHARE_LOG_URL_RE.exec(trimmed);
  if (shareLogMatch?.[1]) {
    return { kind: "shareLog", slug: shareLogMatch[1], url: trimmed };
  }
  const shareCharMatch = SHARE_CHAR_URL_RE.exec(trimmed);
  if (shareCharMatch?.[1]) {
    return { kind: "shareCharacter", id: shareCharMatch[1], url: trimmed };
  }

  const charRes = importCharacterFromText(trimmed);
  if (charRes) {
    return {
      kind: "character",
      result: charRes,
      previewName: charRes.character.name,
      sourceLabel: charRes.sourceLabel,
    };
  }

  const logRes = importLogFromText(trimmed);
  if (logRes && logRes.log.messageCount > 0) {
    return {
      kind: "log",
      result: logRes,
      messageCount: logRes.log.messageCount,
      sourceLabel: logRes.sourceLabel,
    };
  }

  return null;
}

export async function readClipboardSuggestion(): Promise<{
  raw: string;
  suggestion: ClipboardSuggestion;
} | null> {
  try {
    const hasText = await Clipboard.hasStringAsync();
    if (!hasText) return null;
    const raw = await Clipboard.getStringAsync();
    const suggestion = classifyClipboardContent(raw);
    return suggestion ? { raw, suggestion } : null;
  } catch {
    return null;
  }
}
