import { assembleLogEntries, mapKind, type LogEntry, type ParsedLog } from "./ccfolia-parser";

/**
 * Tekey v2 のチャットログ HTML 書き出しの読み取り。
 *
 * 構造（第三者の変換ツールが読んでいる形）:
 *   <div class="tab-list"><label class="tab-checkbox"><input id="tab1">main</label>…</div>
 *   <div class="chatlog"><div class="tab1 [diceroll]" style="color:#…"><span>…</span><b>名前：</b>本文</div>…</div>
 *
 * 構造が確かに Tekey のものと分かるときだけ読む（P6: 曖昧なものは推測しない）。
 * - タブ一覧と .chatlog の両方があり、全ての発言の tabN がタブ一覧のどれかに結びつくこと
 * - <b> の発言者が無い行が 1 つでもあれば取り込まない
 * 時刻は書かれていない（span の中身は意味が確かめられないので使わない）ので ts は 0、順序は文書順。
 * シークレットはログに書かれていないので、全タブを公開として扱う。
 */

function textWithBreaks(el: Element): string {
  el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return el.textContent;
}

export function parseTekeyLogHtml(html: string): ParsedLog | null {
  if (typeof DOMParser === "undefined") return null;
  if (!/class\s*=\s*["'][^"']*\bchatlog\b/.test(html) || !/tab-checkbox/.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const chatlog = doc.querySelector(".chatlog");
  if (!chatlog) return null;

  const tabNames = new Map<string, string>();
  for (const label of doc.querySelectorAll(".tab-list label.tab-checkbox")) {
    const id = label.querySelector('input[id^="tab"]')?.id;
    if (!id) continue;
    let name = "";
    label.childNodes.forEach((n) => {
      if (n.nodeType === 3) name += n.textContent;
    });
    name = name.trim();
    if (name) tabNames.set(id, name);
  }
  if (tabNames.size === 0) return null;

  const entries: LogEntry[] = [];
  for (const div of chatlog.querySelectorAll(":scope > div")) {
    const clone = div.cloneNode(true) as Element;
    if (!clone.textContent.trim()) continue;
    const tabId = [...div.classList].find((c) => /^tab\d+$/.test(c));
    const channel = tabId ? tabNames.get(tabId) : undefined;
    const b = clone.querySelector(":scope > b");
    const sp = b?.textContent
      .trim()
      .replace(/[:：]$/, "")
      .trim();
    if (!channel || !sp) return null;
    b!.remove();
    clone.querySelector(":scope > span")?.remove();
    const text = textWithBreaks(clone).trim();
    if (!text) continue;
    entries.push({ sp, text, ts: 0, kind: mapKind(sp), type: "text", channel });
  }

  const log = assembleLogEntries(entries);
  if (!log) return null;
  for (const c of log.channels) c.secret = false;
  return log;
}
