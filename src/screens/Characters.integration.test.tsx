import { createDemoState, getTestNav, renderWithStore } from "../test/integration-harness";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Characters from "./Characters";
import CharacterDetail from "./CharacterDetail";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Characters + ImportWizard + CharacterDetail 結合テスト", () => {
  it("外部 URL 取り込み → Store 保存 → 詳細画面での継続同期で成長記録と永続化が連動する", async () => {
    const user = userEvent.setup();
    let syncCall = 0;
    const nowIso = new Date().toISOString();

    const fetchMock = vi.fn(async () => {
      syncCall++;
      const payload =
        syncCall === 1
          ? {
              ok: true,
              kind: "character",
              provider: "charaeno",
              providerLabel: "キャラエノ",
              url: "https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac",
              fetchedAt: nowIso,
              contentHash: "hash_v1",
              character: {
                name: "天海 詩織",
                systemId: "coc7",
                memo: "職業: 図書館司書\n落ち着いた司書。",
                stats: { san: 65, hp: 11, mp: 13, 図書館: 60 },
              },
            }
          : {
              ok: true,
              kind: "character",
              provider: "charaeno",
              providerLabel: "キャラエノ",
              url: "https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac",
              fetchedAt: new Date(Date.now() + 60_000).toISOString(),
              contentHash: "hash_v2",
              character: {
                name: "天海 詩織",
                systemId: "coc7",
                memo: "職業: 図書館司書\n落ち着いた司書。",
                stats: { san: 58, hp: 11, mp: 13, 図書館: 70 },
              },
            };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = renderWithStore(<Characters />, { initialPath: "/characters" });

    await user.click(screen.getByRole("button", { name: /キャラシから取り込む/ }));
    const urlInput = screen.getByPlaceholderText("https://charaeno.com/7th/…");
    await user.type(urlInput, "https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac");
    expect(screen.getByText("キャラエノ")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "読み込む" }));

    // 名前・職業はキャラシが正なので入力欄にせず、そのまま見せる
    await waitFor(() => expect(screen.getByRole("heading", { name: "天海 詩織" })).toBeInTheDocument());
    expect(screen.getByText("図書館司書")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("天海 詩織")).toBeNull();

    await user.click(screen.getByRole("button", { name: "取り込む" }));

    await waitFor(() => expect(getTestNav().pathname).toMatch(/^\/characters\/ch_/));
    const createdId = getTestNav().params.id!;

    // localStorage へ実ストア + スキーマ検証互換形式で永続化されていることを確認
    const savedBeforeSync = view.readPersistedState();
    expect(savedBeforeSync?.characters[createdId]?.externalSync).toMatchObject({
      provider: "charaeno",
      url: "https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac",
      autoSync: true,
      contentHash: "hash_v1",
    });

    // 詳細画面へ切り替えて既存のセッション記録を持たせ、再同期がセッションを壊さず成長履歴を追記することを検証
    view.unmount();
    const stateWithSession = createDemoState((s) => {
      const ch = savedBeforeSync!.characters[createdId]!;
      ch.sessions.push({
        logId: "s01",
        date: "2026-11-01",
        title: "初参加セッション",
        delta: {},
        rolls: [],
        memo: "生還",
      });
      s.characters[createdId] = ch;
    });

    const detailView = renderWithStore(<CharacterDetail />, {
      initialPath: `/characters/${createdId}`,
      params: { id: createdId },
      initialState: stateWithSession,
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(screen.getByText(/SAN 65→58/)).toBeInTheDocument());
    /* 上がった技能は成長として自動で残り、前の同期のあとに遊んだセッションに結ばれる（手で打たせない） */
    expect(screen.getByText("成長ロールを記録しました")).toBeInTheDocument();
    const savedAfterSync = detailView.readPersistedState()!;
    const updatedChar = savedAfterSync.characters[createdId]!;
    expect(updatedChar.stats.san).toBe(58);
    expect(updatedChar.sessions).toHaveLength(1);
    expect(updatedChar.sessions[0]!.title).toBe("初参加セッション");
    expect(updatedChar.growth).toEqual([
      expect.objectContaining({ skill: "図書館", from: 60, to: 70, logId: "s01", date: "2026-11-01" }),
    ]);
    expect(updatedChar.externalSync?.contentHash).toBe("hash_v2");
  });

  it("キャラシと結び付いたキャラは、前の更新から 1 日たっていれば開いたときに読み直し、名前は編集できない", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            kind: "character",
            provider: "charaeno",
            url: "https://charaeno.com/7th/Tq3kZ8vX1pLm0aYb7RcWe",
            fetchedAt: new Date().toISOString(),
            contentHash: "fresh",
            character: { name: "遠沢澄花", systemId: "coc7", memo: "職業: 地方紙記者", stats: { san: 40 } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const stale = createDemoState((s) => {
      const ch = s.characters.ch_towa!;
      ch.externalSync = { ...ch.externalSync!, autoSync: true, lastSyncedAt: "2026-01-01T00:00:00.000Z" };
    });
    renderWithStore(<CharacterDetail />, {
      initialPath: "/characters/ch_towa",
      params: { id: "ch_towa" },
      initialState: stale,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "更新" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /編集/ }));
    expect(screen.queryByLabelText("名前")).toBeNull();
    expect(within(screen.getByRole("dialog")).queryByLabelText("SAN")).toBeNull();
    expect(screen.getByRole("link", { name: /名前・能力値をキャラエノで直す/ })).toHaveAttribute(
      "href",
      "https://charaeno.com/7th/Tq3kZ8vX1pLm0aYb7RcWe",
    );
    expect(screen.getByLabelText("ひとこと紹介")).toBeInTheDocument();
  });

  it("更新して 1 日たっていなければ、開いても読み直さない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fresh = createDemoState((s) => {
      const ch = s.characters.ch_towa!;
      ch.externalSync = { ...ch.externalSync!, autoSync: true, lastSyncedAt: new Date().toISOString() };
    });
    renderWithStore(<CharacterDetail />, {
      initialPath: "/characters/ch_towa",
      params: { id: "ch_towa" },
      initialState: fresh,
    });
    expect(await screen.findByRole("heading", { name: "キャラシ" })).toBeInTheDocument();
    expect(screen.getByText("図書館")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("キャラシと結び付いたキャラには成長を手で記録する入口がない", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const fresh = createDemoState((s) => {
      const ch = s.characters.ch_towa!;
      ch.externalSync = { ...ch.externalSync!, lastSyncedAt: new Date().toISOString() };
    });
    renderWithStore(<CharacterDetail />, {
      initialPath: "/characters/ch_towa",
      params: { id: "ch_towa" },
      initialState: fresh,
    });
    expect(await screen.findByRole("heading", { name: "キャラシ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /を記録/ })).toBeNull();
  });

  it("キャラシのないキャラは、セッション・技能・新しい値だけで成長を記録し、前の値と日付は埋まる", async () => {
    const user = userEvent.setup();
    const state = createDemoState((s) => {
      const ch = s.characters.ch_towa!;
      delete ch.externalSync;
      delete ch.sheet;
      ch.growth = [
        {
          id: "g0",
          logId: ch.sessions[0]!.logId,
          date: ch.sessions[0]!.date,
          skill: "目星",
          from: 60,
          to: 65,
        },
      ];
    });
    const latest = [...state.characters.ch_towa!.sessions].sort((a, b) => b.date.localeCompare(a.date))[0]!;
    const view = renderWithStore(<CharacterDetail />, {
      initialPath: "/characters/ch_towa",
      params: { id: "ch_towa" },
      initialState: state,
    });
    await user.click(screen.getByRole("button", { name: "成長ロールを記録" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toHaveTextContent("セッションに紐付けない");
    expect(screen.queryByLabelText("日付")).toBeNull();
    expect(screen.queryByLabelText("補足")).toBeNull();
    expect(screen.queryByLabelText("前の値")).toBeNull();
    expect(dialog).toHaveTextContent("65");
    await user.type(screen.getByLabelText("新しい値"), "70");
    await user.click(screen.getByRole("button", { name: "記録" }));
    const saved = view.readPersistedState()!.characters.ch_towa!;
    expect(saved.growth.at(-1)).toMatchObject({
      skill: "目星",
      from: 65,
      to: 70,
      logId: latest.logId,
      date: latest.date,
    });
  });
});
