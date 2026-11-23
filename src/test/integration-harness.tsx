import { useSyncExternalStore } from "react";
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { seedState } from "../data/seed";
import { parseSavedState } from "../lib/state-schema";
import { StoreProvider } from "../store";
import type { Scenario, State } from "../types";
import { SYSTEMS } from "../data/systems";
import {
  memoryScenarioStore,
  sharedScenarioDoc,
  taltoToDirectory,
  toDirectoryDoc,
} from "../lib/scenario-directory";
import type { TaltoCatalogEntry } from "../lib/talto-scenarios";

type NavState = {
  href: string;
  pathname: string;
  search: string;
  params: Record<string, string>;
};

const listeners = new Set<() => void>();

function extractParams(pathname: string, explicit?: Record<string, string>): Record<string, string> {
  if (explicit) return explicit;
  const m = pathname.match(/^\/(?:characters|tables|scenarios|users|sessions|invite)\/([^/?#]+)$/);
  if (m && m[1] !== "new") return { id: decodeURIComponent(m[1]!) };
  const s = pathname.match(/^\/share\/l\/([^/?#]+)$/);
  if (s) return { slug: decodeURIComponent(s[1]!) };
  const sc = pathname.match(/^\/share\/c\/([^/?#]+)$/);
  if (sc) return { id: decodeURIComponent(sc[1]!) };
  return {};
}

function parseHref(href: string, explicitParams?: Record<string, string>): NavState {
  const [rawPath, rawSearch] = href.split("?");
  const pathname = rawPath || "/";
  const search = rawSearch ? rawSearch.split("#")[0]! : "";
  return {
    href: search ? `${pathname}?${search}` : pathname,
    pathname,
    search,
    params: extractParams(pathname, explicitParams),
  };
}

let currentNav: NavState = parseHref("/");

export function resetTestNav(href = "/", explicitParams?: Record<string, string>): void {
  currentNav = parseHref(href, explicitParams);
  for (const l of listeners) l();
}

export function getTestNav(): NavState {
  return currentNav;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 外部境界である Next.js ルータのみテスト用にメモリ内実装へ差し替える（アプリ内の Store / ロジックはすべて実物）
vi.mock("next/navigation", () => ({
  usePathname: () =>
    useSyncExternalStore(
      subscribe,
      () => currentNav.pathname,
      () => currentNav.pathname,
    ),
  useSearchParams: () => {
    const search = useSyncExternalStore(
      subscribe,
      () => currentNav.search,
      () => currentNav.search,
    );
    return new URLSearchParams(search);
  },
  useParams: () =>
    useSyncExternalStore(
      subscribe,
      () => currentNav.params,
      () => currentNav.params,
    ),
  useRouter: () => ({
    push: (href: string) => resetTestNav(href),
    replace: (href: string) => resetTestNav(href),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  }),
}));

vi.mock("next/link", () => ({
  default: function MockNextLink({
    href,
    replace,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    replace?: boolean;
    children?: ReactNode;
  } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
    void replace;
    return (
      <a
        href={href}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) {
            e.preventDefault();
            resetTestNav(href);
          }
        }}
        {...rest}
      >
        {children}
      </a>
    );
  },
}));

export function ensureJsdomGlobals(): void {
  if (typeof window === "undefined") return;
  window.scrollTo = () => {};
  if (!window.matchMedia) {
    window.matchMedia = () =>
      ({
        matches: false,
        media: "",
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

export function createDemoState(mutator?: (s: State) => void): State {
  const s = structuredClone(seedState());
  s.entered = true;
  mutator?.(s);
  return s;
}

export interface FeatureRenderResult extends RenderResult {
  getNav: () => NavState;
  readPersistedState: () => State | null;
}

export function renderWithStore(
  ui: ReactElement,
  opts: {
    initialPath?: string;
    params?: Record<string, string>;
    initialState?: State;
    mutateState?: (s: State) => void;
  } = {},
): FeatureRenderResult {
  ensureJsdomGlobals();
  localStorage.clear();
  resetTestNav(opts.initialPath ?? "/", opts.params);
  const initialState = opts.initialState ?? createDemoState(opts.mutateState);
  localStorage.setItem("takufu-state-v4", JSON.stringify(initialState));

  const rendered = render(<StoreProvider initialState={initialState}>{ui}</StoreProvider>);
  return {
    ...rendered,
    getNav: getTestNav,
    readPersistedState: () => {
      window.dispatchEvent(new Event("pagehide"));
      const raw = localStorage.getItem("takufu-state-v4");
      return raw ? parseSavedState(raw) : null;
    },
  };
}

/**
 * シナリオの共有シナリオ一覧の API（/api/scenarios）を、本物の処理（src/app/api/scenarios/route.ts）と記憶の中の共有シナリオ一覧で答える。
 * 共有シナリオ一覧は TALTO の見本（よく遊ばれている順）と、利用者が足したもの。ほかの URL は rest に渡す（渡さなければ 404）
 */
export async function serveScenarioDirectory({
  talto = [],
  shared = [],
  rest,
}: {
  talto?: TaltoCatalogEntry[];
  shared?: Scenario[];
  rest?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} = {}) {
  const { GET } = await import("../app/api/scenarios/route");
  const { setScenarioStoreForTest } = await import("../server/scenario-directory");
  const docs = [
    ...talto.map((e, i) => toDirectoryDoc(taltoToDirectory(e, SYSTEMS), i, SYSTEMS)),
    ...shared.map((sc) => sharedScenarioDoc(sc, sc.addedByUid ?? "someone")),
  ];
  setScenarioStoreForTest(memoryScenarioStore(docs));
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/scenarios")) return GET(new Request(`http://test${url}`));
    return rest ? rest(input, init) : new Response("Not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
