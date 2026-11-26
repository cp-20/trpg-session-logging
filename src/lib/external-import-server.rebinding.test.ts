import { describe, expect, it } from "vitest";
import { handleExternalImport, publicOnlyLookup } from "./external-import-server";

const lookupWith = (lookup: ReturnType<typeof publicOnlyLookup>, all: boolean) =>
  new Promise<{ error: unknown; result: unknown }>((resolve) => {
    (lookup as unknown as (h: string, o: object, cb: (e: unknown, r?: unknown) => void) => void)(
      "sheet.example",
      { all },
      (error, result) => resolve({ error, result }),
    );
  });

describe("publicOnlyLookup（接続に使う名前解決）", () => {
  it("公開のアドレスだけなら、そのアドレスで接続させる", async () => {
    const lookup = publicOnlyLookup(async () => [
      { address: "93.184.216.34" },
      { address: "2606:2800:220:1::1" },
    ]);
    expect(await lookupWith(lookup, true)).toEqual({
      error: null,
      result: [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1::1", family: 6 },
      ],
    });
  });

  it("内部のアドレスが 1 つでも混じれば接続させない", async () => {
    const lookup = publicOnlyLookup(async () => [
      { address: "93.184.216.34" },
      { address: "169.254.169.254" },
    ]);
    const { error } = await lookupWith(lookup, true);
    expect(error).toMatchObject({ code: "EADDRNOTALLOWED" });
  });
});

describe("DNS rebinding", () => {
  it("確かめたときは公開のアドレスでも、接続のときに内部へ向けられたら取得しない", async () => {
    let calls = 0;
    // 1 回目（宛先の確かめ）は公開のアドレス、2 回目（接続）からは手元のアドレスを返す名前
    const rebinding = async () => [{ address: ++calls === 1 ? "93.184.216.34" : "127.0.0.1" }];

    const result = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      { lookupAll: rebinding, timeoutMs: 2000 },
    );

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
