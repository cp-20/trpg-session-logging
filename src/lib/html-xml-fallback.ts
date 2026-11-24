/**
 * DOMParser が利用できない環境（React Native / Hermes など）向けの軽量 HTML / XML フォールバックパーサー。
 * Web 側では既存の DOMParser 経路を使い、typeof DOMParser === "undefined" のときのみ利用される。
 */

interface LightNode {
  tag: string;
  attrs: Record<string, string>;
  children: (LightNode | string)[];
}

const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeEntities(raw: string): string {
  return raw.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const cp = Number.parseInt(entity.slice(2), 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    if (entity.startsWith("#")) {
      const cp = Number.parseInt(entity.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    switch (entity) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      case "nbsp":
        return " ";
      default:
        return full;
    }
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1]!.toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[key] = decodeEntities(val);
  }
  return attrs;
}

function parseLightTree(input: string, xmlMode: boolean): LightNode {
  const root: LightNode = { tag: "#root", attrs: {}, children: [] };
  const stack: LightNode[] = [root];
  const tagRe =
    /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9_:-]*)([^>]*?)(\/?)>/g;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(input)) !== null) {
    if (match.index > cursor) {
      const text = decodeEntities(input.slice(cursor, match.index));
      if (text) stack[stack.length - 1]!.children.push(text);
    }
    cursor = tagRe.lastIndex;

    // CDATA
    if (match[1] !== undefined) {
      if (match[1]) stack[stack.length - 1]!.children.push(match[1]);
      continue;
    }
    const rawMatch = match[0];
    if (rawMatch.startsWith("<!") || rawMatch.startsWith("<?")) {
      continue;
    }

    const tagName = match[2]!.toLowerCase();
    const attrRaw = match[3]!;
    const selfClosing = match[4] === "/" || (!xmlMode && VOID_HTML_TAGS.has(tagName));
    const isClosing = rawMatch.startsWith("</");

    if (isClosing) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i]!.tag === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    if (!xmlMode && (tagName === "script" || tagName === "style")) {
      const closeRe = new RegExp(`</${tagName}\\s*>`, "i");
      const rest = input.slice(cursor);
      const closeMatch = closeRe.exec(rest);
      if (closeMatch) {
        cursor += closeMatch.index + closeMatch[0].length;
        tagRe.lastIndex = cursor;
      }
      continue;
    }

    if (!xmlMode && tagName === "br") {
      stack[stack.length - 1]!.children.push("\n");
      continue;
    }

    const node: LightNode = { tag: tagName, attrs: parseAttrs(attrRaw), children: [] };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }

  if (cursor < input.length) {
    const tail = decodeEntities(input.slice(cursor));
    if (tail) stack[stack.length - 1]!.children.push(tail);
  }
  return root;
}

function isNode(child: LightNode | string): child is LightNode {
  return typeof child !== "string";
}

function childElements(node: LightNode, tag?: string): LightNode[] {
  return node.children.filter((c): c is LightNode => isNode(c) && (!tag || c.tag === tag));
}

function findAll(node: LightNode, predicate: (el: LightNode) => boolean, out: LightNode[] = []): LightNode[] {
  for (const c of node.children) {
    if (!isNode(c)) continue;
    if (predicate(c)) out.push(c);
    findAll(c, predicate, out);
  }
  return out;
}

function hasClass(node: LightNode, cls: string): boolean {
  const raw = node.attrs.class;
  if (!raw) return false;
  return raw.split(/\s+/).includes(cls);
}

function nodeText(node: LightNode): string {
  let out = "";
  for (const c of node.children) {
    out += typeof c === "string" ? c : nodeText(c);
  }
  return out;
}

export interface FallbackHtmlEntry {
  tab: string;
  sp: string;
  text: string;
  /** 新形式のみ: data-channel と表示名(.channel-name)。同じ data-channel の表示名は共有される */
  dataChannel?: string;
  label?: string;
  /** 新形式(article.message)のみ: <time datetime> の生の文字列 */
  datetime?: string;
  /** 新形式のみ: .roll-result の本文 */
  rollText?: string;
  /** 新形式のみ: .roll-result の判定クラス(success / failure / critical / fumble) */
  rollClass?: string;
  /** 新形式のみ: article.message.system */
  system?: boolean;
}

/** CCFOLIA HTML（生ログ / 旧整形ログ / 新整形ログ）を DOMParser なしで解析する */
export function parseCcfoliaHtmlEntriesFallback(html: string): FallbackHtmlEntry[] {
  const root = parseLightTree(html, false);
  const entries: FallbackHtmlEntry[] = [];
  let chIndex = 0;

  // (0) 新形式: main.message-list > article.message[data-channel]
  const empty: LightNode = { tag: "", attrs: {}, children: [] };
  for (const art of findAll(root, (el) => el.tag === "article" && hasClass(el, "message"))) {
    const first = (cls: string) => findAll(art, (el) => hasClass(el, cls))[0];
    const system = hasClass(art, "system");
    const sp = nodeText(first("speaker") ?? empty).trim();
    const text = nodeText(first("message-text") ?? empty).trim();
    const rollEl = first("roll-result");
    const rollText = rollEl ? nodeText(rollEl).trim() : "";
    if (!text && !rollText) continue;
    const label = nodeText(first("channel-name") ?? empty)
      .trim()
      .replace(/^\[|\]$/g, "");
    const rollClass = rollEl
      ? (rollEl.attrs.class ?? "").split(/\s+/).find((c) => /^(success|failure|critical|fumble)$/.test(c))
      : undefined;
    const datetime = first("timestamp")?.attrs.datetime;
    entries.push({
      tab: label || (art.attrs["data-channel"] ?? "").trim() || "メイン",
      dataChannel: (art.attrs["data-channel"] ?? "").trim(),
      label,
      sp: sp || (system ? "system" : "不明な発言者"),
      text,
      ...(datetime ? { datetime } : {}),
      ...(rollText ? { rollText } : {}),
      ...(rollClass ? { rollClass } : {}),
      ...(system ? { system: true } : {}),
    });
  }
  if (entries.length > 0) return entries;

  // (1) 生ログ: 直下に 3 つ以上の <span> を持つ <p>
  const rawPs = findAll(root, (el) => el.tag === "p" && childElements(el, "span").length >= 3);
  for (const p of rawPs) {
    const spans = childElements(p, "span");
    const tab = nodeText(spans[0]!)
      .trim()
      .replace(/^\[|\]$/g, "");
    const sp = nodeText(spans[1]!).trim();
    const text = spans
      .slice(2)
      .map((s) => nodeText(s))
      .join("\n")
      .trim();
    if (!text) continue;
    entries.push({ tab: tab || `ch${chIndex}`, sp, text });
  }
  if (entries.length > 0) return entries;

  // (2) 旧整形ログ: div.tab > .tabtitle + p.player > b
  for (const tab of findAll(root, (el) => el.tag === "div" && hasClass(el, "tab"))) {
    const titleEl = childElements(tab).find((el) => hasClass(el, "tabtitle"));
    const title = titleEl ? nodeText(titleEl).trim() : "";
    chIndex++;
    for (const row of childElements(tab).filter((el) => el.tag === "p" && hasClass(el, "player"))) {
      const bEl = childElements(row, "b")[0];
      const rawSp = bEl ? nodeText(bEl) : "";
      const sp = rawSp.trim();
      const rowText = nodeText(row);
      const at = rawSp ? rowText.indexOf(rawSp) : -1;
      const text = (at < 0 ? rowText : rowText.slice(0, at) + rowText.slice(at + rawSp.length)).trim();
      if (!sp || !text) continue;
      entries.push({ tab: title || `ch${chIndex}`, sp, text });
    }
  }
  if (entries.length > 0) return entries;

  // (3) 新整形ログ: section.tab > .tabtitle + .player (.speaker-text / .player-message)
  for (const tab of findAll(root, (el) => el.tag === "section" && hasClass(el, "tab"))) {
    const titleEl = childElements(tab).find((el) => hasClass(el, "tabtitle"));
    const title = titleEl ? nodeText(titleEl).trim() : "";
    chIndex++;
    for (const row of findAll(tab, (el) => hasClass(el, "player"))) {
      const spEl = findAll(row, (el) => hasClass(el, "speaker-text"))[0];
      const msgEl = findAll(row, (el) => hasClass(el, "player-message"))[0];
      const sp = spEl ? nodeText(spEl).trim() : "";
      const text = msgEl ? nodeText(msgEl).trim() : "";
      if (!sp || !text) continue;
      entries.push({ tab: title || `ch${chIndex}`, sp, text });
    }
  }

  return entries;
}

export interface FallbackUdonariumChat {
  name: string;
  tab: string;
  time: string | null;
  type: string;
  text: string;
}

/** Udonarium chat.xml を DOMParser なしで解析する */
export function parseUdonariumChatsFallback(xml: string): FallbackUdonariumChat[] {
  const root = parseLightTree(xml.replace(/\r\n?/g, "\n"), true);
  return findAll(root, (el) => el.tag === "chat").map((el) => ({
    name: (el.attrs.name ?? el.attrs.from ?? "").trim(),
    tab: (el.attrs.tab ?? "").trim(),
    time: el.attrs.time ?? el.attrs.timestamp ?? null,
    type: (el.attrs.type ?? "").trim().toLowerCase(),
    text: nodeText(el).trim(),
  }));
}
