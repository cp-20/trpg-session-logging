import {
  createDemoState,
  getTestNav,
  renderWithStore,
  serveScenarioDirectory,
} from "../test/integration-harness";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Scenarios, { ScenarioDetail, ScenarioNew } from "./Scenarios";

// TALTO の共有シナリオ一覧の見本（並びはよく遊ばれている順）
const coc = { systemSlug: "call_of_cthulhu_6th", systemName: "クトゥルフ神話TRPG" };
const TALTO = [
  {
    id: "t_lighthouse",
    title: "灯台守の夜",
    author: "しおかぜ堂",
    ...coc,
    playersMin: 2,
    playersMax: 3,
    hours: 4,
  },
  {
    id: "t_station",
    title: "霧の駅",
    author: "みなと",
    systemSlug: "emoklore",
    systemName: "エモクロアTRPG",
    playersMin: 1,
    playersMax: 1,
    hours: 2,
  },
  {
    id: "t_owned",
    title: "持っている灯台",
    author: "しおかぜ堂",
    ...coc,
    playersMin: 2,
    playersMax: 2,
    hours: 3,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Scenarios + BOOTH URL 自動入力 + 構造化修正申請 結合テスト", () => {
  it("BOOTH URL からシナリオ情報を自動補完して登録でき、別ユーザーからの差分修正提案を作者が承認反映できる", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              kind: "scenario",
              provider: "booth",
              providerLabel: "BOOTH",
              url: "https://booth.pm/ja/items/424242",
              contentHash: "sc_hash_1",
              fetchedAt: "2026-11-20T07:00:00.000Z",
              scenario: {
                title: "夜汽車は霧の中",
                author: "星灯堂",
                systemId: "coc7",
                source: "booth",
                sourceUrl: "https://booth.pm/ja/items/424242",
                tags: ["クローズド", "鉄道"],
                description: "霧の夜汽車を舞台にした短編シナリオ。",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const newView = renderWithStore(<ScenarioNew />, { initialPath: "/scenarios/new" });
    await user.type(screen.getByLabelText(/配布ページのURL/), "https://booth.pm/ja/items/424242");
    await user.click(screen.getByRole("button", { name: "URLから読み込む" }));

    await waitFor(() => expect(screen.getByDisplayValue("夜汽車は霧の中")).toBeInTheDocument());
    expect(screen.getByDisplayValue("星灯堂")).toBeInTheDocument();
    // キーワードは入力欄の中の札（MultiCombobox）として入る
    const keywords = screen.getByRole("list", { name: "選んだキーワード" });
    expect(
      within(keywords)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["クローズド", "鉄道"]);

    await user.click(screen.getByRole("button", { name: "追加する" }));
    await waitFor(() => expect(getTestNav().pathname).toMatch(/^\/scenarios\/sc_/));
    const scId = getTestNav().params.id!;

    const afterCreate = newView.readPersistedState()!;
    newView.unmount();

    // 他ユーザーとしてシナリオに構造化された修正提案を送信
    const asOtherState = createDemoState((s) => {
      s.scenarios = {
        ...s.scenarios,
        [scId]: { ...afterCreate.scenarios[scId]!, claimedBy: "u_mikan", addedByUid: "u_mikan" },
      };
      s.me = "u_sora";
    });

    const reqView = renderWithStore(<ScenarioDetail />, {
      initialPath: `/scenarios/${scId}`,
      params: { id: scId },
      initialState: asOtherState,
    });

    await user.click(screen.getByRole("button", { name: /修正を提案/ }));
    const authorInput = screen.getByLabelText("作者・サークル");
    await user.clear(authorInput);
    await user.type(authorInput, "星灯堂（改訂版）");
    await user.click(screen.getByRole("button", { name: "提案を送る" }));

    const afterReq = reqView.readPersistedState()!;
    expect(afterReq.editRequests.some((r) => r.scenarioId === scId && r.status === "pending")).toBe(true);
    reqView.unmount();

    // 作者本人に戻って差分を確認・承認
    afterReq.me = "u_mikan";
    const authorView = renderWithStore(<ScenarioDetail />, {
      initialPath: `/scenarios/${scId}`,
      params: { id: scId },
      initialState: afterReq,
    });

    await waitFor(() => expect(screen.getByText(/修正の提案が 1 件届いています/)).toBeInTheDocument());
    expect(screen.getByText("星灯堂（改訂版）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "提案を反映" }));

    const afterAccept = authorView.readPersistedState()!;
    expect(afterAccept.scenarios[scId]!.author).toBe("星灯堂（改訂版）");
    expect(afterAccept.editRequests.find((r) => r.scenarioId === scId)?.status).toBe("accepted");
  });

  it("追加は検索で見つからなかったときに出し、追加画面は URL の読み込みが先で手入力は後から開く", async () => {
    const user = userEvent.setup();
    const list = renderWithStore(<Scenarios />, { initialPath: "/scenarios" });
    expect(screen.queryByRole("button", { name: /シナリオを追加/ })).toBeNull();
    await user.type(screen.getByLabelText("シナリオを検索"), "存在しない作品名xyz");
    await user.click(await screen.findByRole("button", { name: /シナリオを追加/ }));
    expect(getTestNav().pathname).toBe("/scenarios/new");
    list.unmount();

    renderWithStore(<ScenarioNew />, { initialPath: "/scenarios/new" });
    expect(screen.getByRole("button", { name: "URLから読み込む" }).className).toContain("btn-primary");
    expect(screen.queryByLabelText("タイトル")).toBeNull();
    expect(screen.queryByRole("button", { name: "追加する" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "手で入力する" }));
    expect(screen.getByLabelText("タイトル")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "URLから読み込む" }).className).not.toContain("btn-primary");
  });

  it("シナリオは共有シナリオ一覧からサーバーで探し、自分が遊んだもの・足したものを先に並べ、選ぶと記録に使える", async () => {
    const user = userEvent.setup();
    await serveScenarioDirectory({ talto: TALTO });
    const mine = createDemoState((s) => {
      s.scenarios = {
        sc_mine: {
          id: "sc_mine",
          title: "持っている灯台",
          author: "しおかぜ堂",
          systemId: "coc6",
          source: "talto",
          sourceUrl: "https://talto.cc/projects/t_owned",
          emoji: "",
          bg: "#fff",
          tags: [],
          addedBy: "user",
          addedByUid: s.me,
        },
      };
      s.logs = {};
    });
    const list = renderWithStore(<Scenarios />, { initialPath: "/scenarios", initialState: mine });
    // 何も打たなくても共有シナリオ一覧から並ぶ（「シナリオを追加」だけにしない）
    expect(await screen.findByRole("link", { name: /灯台守の夜/ })).toBeInTheDocument();
    expect(screen.queryByText("シナリオがまだありません")).toBeNull();
    // 検索はサーバーで。自分が足したものが先で、共有シナリオ一覧の同じ作品は重ねて出さない
    await user.type(screen.getByLabelText("シナリオを検索"), "灯台");
    await waitFor(() => expect(screen.queryByRole("link", { name: /霧の駅/ })).toBeNull());
    await screen.findByRole("link", { name: /灯台守の夜/ });
    const links = screen.getAllByRole("link").map((a) => a.textContent ?? "");
    expect(links.filter((t) => t.includes("持っている灯台"))).toHaveLength(1);
    expect(links.findIndex((t) => t.includes("持っている灯台"))).toBeLessThan(
      links.findIndex((t) => t.includes("灯台守の夜")),
    );
    expect(links.some((t) => t.includes("灯台守の夜") && t.includes("2〜3人") && t.includes("〜4時間"))).toBe(
      true,
    );
    await user.click(screen.getByRole("link", { name: /灯台守の夜/ }));
    expect(getTestNav().pathname).toBe("/scenarios/sc_talto_t_lighthouse");
    list.unmount();

    // 手元に写しのない作品も、共有シナリオ一覧から開いて記録できる。記録に結ぶので手元に写しを置く
    const none = createDemoState((s) => {
      s.scenarios = {};
      s.logs = {};
    });
    const detail = renderWithStore(<ScenarioDetail />, {
      initialPath: "/scenarios/sc_talto_t_lighthouse",
      params: { id: "sc_talto_t_lighthouse" },
      initialState: none,
    });
    expect(await screen.findByRole("heading", { name: "灯台守の夜" })).toBeInTheDocument();
    expect(screen.getByText("2〜3人")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TALTO/ })).toHaveAttribute(
      "href",
      "https://talto.cc/projects/t_lighthouse",
    );
    await user.click(screen.getByRole("button", { name: /このシナリオで記録/ }));
    expect(getTestNav().href).toBe("/upload?scenario=sc_talto_t_lighthouse");
    expect(detail.readPersistedState()!.scenarios.sc_talto_t_lighthouse).toMatchObject({
      title: "灯台守の夜",
      author: "しおかぜ堂",
      systemId: "coc6",
      source: "talto",
    });
  });
});
