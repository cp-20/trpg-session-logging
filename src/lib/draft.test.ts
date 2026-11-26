import { describe, expect, it } from "vitest";
import { produceDraft } from "./draft";

describe("produceDraft (構造共有 Copy-on-Write)", () => {
  it("変更がない場合は元の参照をそのまま返し、プリミティブやインスタンスはそのまま通過する", () => {
    let seenPrimitive: unknown;
    expect(
      produceDraft(42, (v) => {
        seenPrimitive = v;
      }),
    ).toBe(42);
    expect(seenPrimitive).toBe(42);
    expect(produceDraft(null, () => {})).toBeNull();
    const d = new Date("2026-11-20T00:00:00Z");
    expect(produceDraft(d, () => {})).toBe(d);

    const base = { a: 1, nested: { b: 2 }, list: [1, 2, 3], fn: () => 7 };
    let leakedNested: { b: number } | undefined;
    const next = produceDraft(base, (draft) => {
      void draft.nested.b;
      expect(draft.fn()).toBe(7);
      leakedNested = draft.nested;
      draft.a = 1;
      draft.list.length = 3; // Array length 同値代入はコピーしない
    });
    expect(next).toBe(base);
    expect(next.nested).toBe(base.nested);
    expect(next.list).toBe(base.list);
    // Proxy は produceDraft 終了後に revoke されるため、外部に漏れた Proxy 参照からの読み取りは TypeError
    expect(() => leakedNested!.b).toThrow(TypeError);
  });

  it("Object.create(null)・プロトタイプ非所有オブジェクト・Object.freeze・defineProperty を正しく扱う", () => {
    const nullProto = Object.assign(Object.create(null) as Record<string, unknown>, {
      x: 1,
      nested: { k: "v" },
    });
    const nullNext = produceDraft(nullProto, (draft) => {
      (draft.nested as { k: string }).k = "w";
    });
    expect(nullNext).not.toBe(nullProto);
    expect(nullNext.nested).toEqual({ k: "w" });
    expect(nullProto.nested).toEqual({ k: "v" });

    // プロトタイプ上のオブジェクトと関数は子ドラフト化せず元参照のまま
    const protoMeta = { shared: 1 };
    const withProto = Object.create({ protoMeta, getMeta: () => protoMeta }) as {
      own: { x: number };
      protoMeta: { shared: number };
      getMeta: () => { shared: number };
    };
    withProto.own = { x: 1 };
    produceDraft(withProto, (draft) => {
      expect(draft.protoMeta).toBe(protoMeta);
      expect(draft.getMeta()).toBe(protoMeta);
    });

    // 存在しないプロパティの delete は変更を起こさず元参照のまま
    const unmodBase = { a: 1 } as Record<string, unknown>;
    const unchangedOnMissingDelete = produceDraft(unmodBase, (draft) => {
      delete draft.notHere;
    });
    expect(unchangedOnMissingDelete).toBe(unmodBase);

    // Object.freeze（非拡張）入力でもドラフト更新できる
    const frozen = Object.freeze({ count: 1, tag: "a" });
    const thawedNext = produceDraft(frozen, (draft) => {
      (draft as { count: number }).count = 2;
    });
    expect(thawedNext.count).toBe(2);
    expect(frozen.count).toBe(1);
  });

  it("in / ownKeys / getOwnPropertyDescriptor / defineProperty と代理オブジェクトの破棄を正しく扱う", () => {
    const objBase: Record<string, unknown> = {
      a: { v: 1 },
      b: { n: 2 },
      keep: 10,
      extra: { q: 3 },
    };
    let leakedListItem: unknown;
    const nextArrHolder: unknown[] = [];
    const definedNext = produceDraft(objBase, (draft) => {
      expect("a" in draft).toBe(true);
      expect("missing" in draft).toBe(false);
      // 存在しない descriptor
      expect(Object.getOwnPropertyDescriptor(draft, "missing")).toBeUndefined();

      // 子を変更してから親ごと上書きしても古い子ドラフトが返らない
      (draft.b as { n: number }).n = 20;
      draft.b = { n: 99 };
      expect((draft.b as { n: number }).n).toBe(99);

      // 削除後の再読み取りも undefined
      void draft.extra;
      delete draft.extra;
      expect(draft.extra).toBeUndefined();

      Object.defineProperty(draft, "cloned", {
        value: draft.a,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(draft, "computed", {
        get: () => 55,
        enumerable: true,
        configurable: true,
      });
      nextArrHolder.push(1, draft.a);
      leakedListItem = nextArrHolder[1];
      draft.list = nextArrHolder;
      delete draft.keep;
      expect(Object.keys(draft).sort()).toEqual(["a", "b", "cloned", "computed", "list"]);
    });
    expect(definedNext.cloned).toEqual({ v: 1 });
    expect(definedNext.computed).toBe(55);
    expect(definedNext.list).toEqual([1, { v: 1 }]);
    expect(definedNext.list === nextArrHolder).toBe(false);
    expect(nextArrHolder[0]).toBe(1);
    expect(() => (leakedListItem as { v: number }).v).toThrow(TypeError);
    expect("keep" in definedNext).toBe(false);
  });

  it("変更されたパスだけを複製し、未変更のサブツリーは元の参照を保つ", () => {
    const base = {
      events: {
        e1: { title: "A", responses: { u1: "ok" } },
        e2: { title: "B", responses: { u1: "maybe" } },
      },
      logs: {
        l1: { title: "ログ1", channels: [{ msgs: [{ text: "hello" }] }] },
      },
      users: { u1: { name: "みかん" } },
    };

    const next = produceDraft(base, (d) => {
      d.events.e1.responses.u1 = "ng";
    });

    expect(next).not.toBe(base);
    expect(next.events).not.toBe(base.events);
    expect(next.events.e1).not.toBe(base.events.e1);
    expect(next.events.e1.responses.u1).toBe("ng");
    expect(base.events.e1.responses.u1).toBe("ok");

    expect(next.events.e2).toBe(base.events.e2);
    expect(next.logs).toBe(base.logs);
    expect(next.users).toBe(base.users);
  });

  it("配列の push / splice / sort / truncation と循環参照を含む代入でも安全に動く", () => {
    const base = {
      items: [
        { id: "b", n: 2 },
        { id: "a", n: 1 },
      ],
      trimMe: [1, 2, 3, 4],
      untouched: { ok: true },
    };

    const circ: Record<string, unknown> = { label: "loop" };
    circ.self = circ;

    const next = produceDraft(base, (d) => {
      d.items.push({ id: "c", n: 3 });
      d.items[0]!.n = 20;
      d.items.sort((x, y) => x.id.localeCompare(y.id));
      d.trimMe.length = 2;
      (d as Record<string, unknown>).circ = circ;
    });

    expect(next.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(next.items.find((i) => i.id === "b")?.n).toBe(20);
    expect(next.trimMe).toEqual([1, 2]);
    expect(base.items).toHaveLength(2);
    expect(base.trimMe).toEqual([1, 2, 3, 4]);
    expect(next.untouched).toBe(base.untouched);
    expect((next as Record<string, unknown>).circ).toBe(circ);
  });

  it("delete 演算子とスプレッド再代入でドラフト Proxy が結果に残らない", () => {
    const base = {
      users: {
        u1: { id: "u1", name: "みかん", accounts: [{ provider: "google" }] },
      } as Record<string, { id: string; name: string; accounts: { provider: string }[]; note?: string }>,
      logs: {
        l1: { id: "l1", speakerIcons: { A: "x" } as Record<string, string> | undefined },
      },
    };

    const next = produceDraft(base, (d) => {
      d.users.u1 = { ...d.users.u1!, name: "そら" };
      delete d.logs.l1.speakerIcons;
    });

    expect(next.users.u1!.name).toBe("そら");
    expect(next.users.u1!.accounts[0]!.provider).toBe("google");
    expect(next.users.u1!.accounts).toBe(base.users.u1!.accounts);
    expect("speakerIcons" in next.logs.l1).toBe(false);
    expect(base.logs.l1.speakerIcons).toEqual({ A: "x" });
  });

  it("同じネストを複数回辿ったり参照を保持して更新しても取りこぼさない", () => {
    const base = {
      logs: {
        l1: {
          channels: [{ msgs: [{ sp: "A", kind: "PC" }] }],
        },
      },
    };
    const next = produceDraft(base, (d) => {
      const ch = d.logs.l1.channels[0]!;
      ch.msgs[0]!.kind = "GM";
      d.logs.l1.channels.forEach((c) => {
        c.msgs.forEach((m) => {
          if (m.sp === "A") m.sp = "B";
        });
      });
      ch.msgs.push({ sp: "C", kind: "NPC" });
    });
    expect(next.logs.l1.channels[0]!.msgs).toEqual([
      { sp: "B", kind: "GM" },
      { sp: "C", kind: "NPC" },
    ]);
    expect(base.logs.l1.channels[0]!.msgs).toEqual([{ sp: "A", kind: "PC" }]);
  });

  it("クラスインスタンス・同値配列長/未定義キー・重複マーク・循環配列とオブジェクト・defineProperty・遅延Proxy回収を検証する", () => {
    class Box {
      x: number;
      constructor(x: number) {
        this.x = x;
      }
    }
    const rootBox = new Box(1);
    expect(
      produceDraft(rootBox, (b) => {
        b.x = 2;
      }),
    ).toBe(rootBox);
    expect(rootBox.x).toBe(2);

    // ネストされたカスタムクラスインスタンスは Draft 化されない
    const boxHolder = { box: new Box(10), plain: { n: 1 } };
    const nextBox = produceDraft(boxHolder, (d) => {
      expect(d.box instanceof Box).toBe(true);
      d.box.x = 20;
    });
    expect(nextBox).toBe(boxHolder);
    expect(nextBox.box.x).toBe(20);

    // 配列 length の同値代入はコピーせず、未定義キーへの undefined 代入は新しい所有キーを作る
    const arr = [1, 2];
    expect(
      produceDraft(arr, (d) => {
        d.length = 2;
      }),
    ).toBe(arr);

    const undefTarget: Record<string, unknown> = {};
    const withUndefKey = produceDraft(undefTarget, (d) => {
      d.missing = undefined;
    });
    expect(withUndefKey).not.toBe(undefTarget);
    expect("missing" in withUndefKey).toBe(true);
    expect("missing" in undefTarget).toBe(false);

    // 子の旧参照を後から変更しても親へ再代入された値を上書きしない (state.modified ガード)
    const oldChildBase = { a: { x: 1, y: 0 } };
    const overwriteNext = produceDraft(oldChildBase, (d) => {
      const oldProxy = d.a;
      oldProxy.x = 2;
      d.a = { x: 99, y: 99 };
      oldProxy.y = 55;
      expect(d.a.x).toBe(99);
    });
    expect(overwriteNext.a).toEqual({ x: 99, y: 99 });

    // getDraftState の非オブジェクト / null 分岐と循環配列・循環オブジェクトの unwrap
    const lateArr: unknown[] = [];
    const lateObj: Record<string, unknown> = { plain: 1, nil: null };
    const complexBase = {
      a: { v: 1 },
      b: { v: 2 },
      nested: { holder: lateArr, objHolder: lateObj },
      rootHolder: [] as unknown[],
    };
    const rootLateArr: unknown[] = [];
    const complexNext = produceDraft(complexBase, (d) => {
      (d as Record<string, unknown>).nil = null;
      (d as Record<string, unknown>).num = 123;
      (d as Record<string, unknown>).fn = () => 7;

      const cycArr: unknown[] = [1, d.a];
      cycArr.push(cycArr);
      (d as Record<string, unknown>).cycArr = cycArr;

      const cycObj: Record<string, unknown> = { ok: true, ref: d.b };
      cycObj.self = cycObj;
      (d as Record<string, unknown>).cycObj = cycObj;

      // 代入後に Proxy を紛れ込ませることで finalize() 内の再帰と unwrapAssignedValue を通す
      const h1: unknown[] = [];
      const h2: unknown[] = [];
      d.rootHolder = h1;
      d.nested.holder = h2;
      h1.push(d.a);
      h2.push(d.b);

      // ネスト側のみの defineProperty と既存 child proxy の破棄
      void d.nested.objHolder.plain;
      Object.defineProperty(d.nested, "objHolder", {
        value: { replaced: true, ref: d.a },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      expect(d.nested.objHolder.replaced).toBe(true);
    });
    void complexNext.rootHolder;
    void rootLateArr;
    const rec = complexNext as Record<string, unknown>;
    expect(rec.nil).toBeNull();
    expect(rec.num).toBe(123);
    expect((rec.cycArr as unknown[])[1]).toEqual({ v: 1 });
    expect((rec.cycArr as unknown[])[2]).toBe(rec.cycArr);
    expect((rec.cycObj as Record<string, unknown>).ref).toEqual({ v: 2 });
    expect((rec.cycObj as Record<string, unknown>).self).toBe(rec.cycObj);
    expect(complexNext.rootHolder).toEqual([{ v: 1 }]);
    expect(complexNext.nested.holder).toEqual([{ v: 2 }]);
    expect(complexNext.nested.objHolder).toEqual({ replaced: true, ref: { v: 1 } });

    // ルートでの非列挙 defineProperty 単体変更と nested のみの defineProperty markChanged 検証
    const defOnlyBase = { nested: { a: 1 }, keep: { z: 9 } };
    const defOnlyNext = produceDraft(defOnlyBase, (d) => {
      Object.defineProperty(d.nested, "extra", {
        value: d.keep,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    });
    expect(defOnlyNext).not.toBe(defOnlyBase);
    expect(defOnlyNext.nested).not.toBe(defOnlyBase.nested);
    const hiddenDesc = Object.getOwnPropertyDescriptor(defOnlyNext.nested, "extra");
    expect(hiddenDesc?.enumerable).toBe(false);
    expect(hiddenDesc?.value).toEqual({ z: 9 });
  });
});
