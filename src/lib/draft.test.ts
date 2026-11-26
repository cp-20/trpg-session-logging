import { describe, expect, it } from "vitest";
import { produceDraft } from "./draft";

class Box {
  x: number;
  constructor(x: number) {
    this.x = x;
  }
}

describe("produceDraft (構造共有 Copy-on-Write)", () => {
  describe("変更がないとき", () => {
    it("プリミティブはそのままレシピに渡して返す", () => {
      let seenPrimitive: unknown;

      const result = produceDraft(42, (v) => {
        seenPrimitive = v;
      });

      expect(result).toBe(42);
      expect(seenPrimitive).toBe(42);
    });

    it("null と Date インスタンスは元の参照のまま返す", () => {
      const d = new Date("2026-11-20T00:00:00Z");

      expect(produceDraft(null, () => {})).toBeNull();
      expect(produceDraft(d, () => {})).toBe(d);
    });

    it("同値の代入や読み取りだけなら元の参照をそのまま返す", () => {
      const base = { a: 1, nested: { b: 2 }, list: [1, 2, 3], fn: () => 7 };

      const next = produceDraft(base, (draft) => {
        void draft.nested.b;
        expect(draft.fn()).toBe(7);
        draft.a = 1;
        draft.list.length = 3; // Array length 同値代入はコピーしない
      });

      expect(next).toBe(base);
      expect(next.nested).toBe(base.nested);
      expect(next.list).toBe(base.list);
    });

    it("produceDraft 終了後に外へ漏れたドラフトを読むと TypeError になる", () => {
      const base = { nested: { b: 2 } };
      let leakedNested: { b: number } | undefined;

      produceDraft(base, (draft) => {
        leakedNested = draft.nested;
      });

      // Proxy は終了後に revoke される
      expect(() => leakedNested!.b).toThrow(TypeError);
    });
  });

  describe("特殊なオブジェクト", () => {
    it("Object.create(null) のオブジェクトでも子を変更して新しい参照を返し、元は変えない", () => {
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
    });

    it("プロトタイプ上のオブジェクトと関数は子ドラフト化せず元参照のまま返す", () => {
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
    });

    it("存在しないプロパティの delete は変更とみなさず元参照のまま返す", () => {
      const unmodBase = { a: 1 } as Record<string, unknown>;

      const result = produceDraft(unmodBase, (draft) => {
        delete draft.notHere;
      });

      expect(result).toBe(unmodBase);
    });

    it("Object.freeze した入力でもドラフトを更新でき、元は変わらない", () => {
      const frozen = Object.freeze({ count: 1, tag: "a" });

      const thawedNext = produceDraft(frozen, (draft) => {
        (draft as { count: number }).count = 2;
      });

      expect(thawedNext.count).toBe(2);
      expect(frozen.count).toBe(1);
    });
  });

  describe("Proxy トラップ", () => {
    const makeBase = (): Record<string, unknown> => ({
      a: { v: 1 },
      b: { n: 2 },
      keep: 10,
      extra: { q: 3 },
    });

    it("in 演算子と getOwnPropertyDescriptor は存在の有無を答える", () => {
      produceDraft(makeBase(), (draft) => {
        expect("a" in draft).toBe(true);
        expect("missing" in draft).toBe(false);
        expect(Object.getOwnPropertyDescriptor(draft, "missing")).toBeUndefined();
      });
    });

    it("子を変更してから親ごと上書きしても古い子ドラフトが返らない", () => {
      produceDraft(makeBase(), (draft) => {
        (draft.b as { n: number }).n = 20;
        draft.b = { n: 99 };

        expect((draft.b as { n: number }).n).toBe(99);
      });
    });

    it("削除後の再読み取りは undefined になる", () => {
      produceDraft(makeBase(), (draft) => {
        void draft.extra;
        delete draft.extra;

        expect(draft.extra).toBeUndefined();
      });
    });

    it("defineProperty で足した値とゲッターが結果に残る", () => {
      const next = produceDraft(makeBase(), (draft) => {
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
      });

      expect(next.cloned).toEqual({ v: 1 });
      expect(next.computed).toBe(55);
    });

    it("ownKeys は削除したキーを除き、足したキーを含める", () => {
      produceDraft(makeBase(), (draft) => {
        Object.defineProperty(draft, "cloned", {
          value: 1,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(draft, "computed", {
          get: () => 55,
          enumerable: true,
          configurable: true,
        });
        draft.list = [];
        delete draft.keep;
        delete draft.extra;

        expect(Object.keys(draft).sort()).toEqual(["a", "b", "cloned", "computed", "list"]);
      });
    });

    it("削除したキーは結果に含まれない", () => {
      const next = produceDraft(makeBase(), (draft) => {
        delete draft.keep;
      });

      expect("keep" in next).toBe(false);
    });

    it("ドラフトを含む配列を代入すると、結果ではドラフトが実体に置き換わる", () => {
      const holder: unknown[] = [];

      const next = produceDraft(makeBase(), (draft) => {
        holder.push(1, draft.a);
        draft.list = holder;
      });

      expect(next.list).toEqual([1, { v: 1 }]);
      expect(next.list === holder).toBe(false);
      expect(holder[0]).toBe(1);
    });

    it("代入した配列に混ざったドラフトは終了後に破棄されて TypeError になる", () => {
      const holder: unknown[] = [];
      let leakedListItem: unknown;

      produceDraft(makeBase(), (draft) => {
        holder.push(1, draft.a);
        leakedListItem = holder[1];
        draft.list = holder;
      });

      expect(() => (leakedListItem as { v: number }).v).toThrow(TypeError);
    });
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

  describe("配列の更新と循環参照", () => {
    const makeBase = () => ({
      items: [
        { id: "b", n: 2 },
        { id: "a", n: 1 },
      ],
      trimMe: [1, 2, 3, 4],
      untouched: { ok: true },
    });

    it("push・要素の変更・sort を反映し、元の配列は変えない", () => {
      const base = makeBase();

      const next = produceDraft(base, (d) => {
        d.items.push({ id: "c", n: 3 });
        d.items[0]!.n = 20;
        d.items.sort((x, y) => x.id.localeCompare(y.id));
      });

      expect(next.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
      expect(next.items.find((i) => i.id === "b")?.n).toBe(20);
      expect(base.items).toHaveLength(2);
    });

    it("length への代入で配列を切り詰め、元の配列は変えない", () => {
      const base = makeBase();

      const next = produceDraft(base, (d) => {
        d.trimMe.length = 2;
      });

      expect(next.trimMe).toEqual([1, 2]);
      expect(base.trimMe).toEqual([1, 2, 3, 4]);
    });

    it("触らなかったサブツリーは元の参照を保つ", () => {
      const base = makeBase();

      const next = produceDraft(base, (d) => {
        d.trimMe.length = 2;
      });

      expect(next.untouched).toBe(base.untouched);
    });

    it("循環参照を含む値を代入しても同じ循環のまま保持する", () => {
      const circ: Record<string, unknown> = { label: "loop" };
      circ.self = circ;

      const next = produceDraft(makeBase(), (d) => {
        (d as Record<string, unknown>).circ = circ;
      });

      expect((next as Record<string, unknown>).circ).toBe(circ);
    });
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

  describe("クラスインスタンス", () => {
    it("ルートのクラスインスタンスは複製せず元の参照を変更して返す", () => {
      const rootBox = new Box(1);

      const result = produceDraft(rootBox, (b) => {
        b.x = 2;
      });

      expect(result).toBe(rootBox);
      expect(rootBox.x).toBe(2);
    });

    it("ネストされたカスタムクラスインスタンスは Draft 化されない", () => {
      const boxHolder = { box: new Box(10), plain: { n: 1 } };

      const nextBox = produceDraft(boxHolder, (d) => {
        expect(d.box instanceof Box).toBe(true);
        d.box.x = 20;
      });

      expect(nextBox).toBe(boxHolder);
      expect(nextBox.box.x).toBe(20);
    });
  });

  describe("同値代入と未定義キー", () => {
    it("配列 length の同値代入はコピーせず元参照のまま返す", () => {
      const arr = [1, 2];

      const result = produceDraft(arr, (d) => {
        d.length = 2;
      });

      expect(result).toBe(arr);
    });

    it("未定義キーへの undefined 代入は新しい所有キーを作る", () => {
      const undefTarget: Record<string, unknown> = {};

      const withUndefKey = produceDraft(undefTarget, (d) => {
        d.missing = undefined;
      });

      expect(withUndefKey).not.toBe(undefTarget);
      expect("missing" in withUndefKey).toBe(true);
      expect("missing" in undefTarget).toBe(false);
    });
  });

  it("子の旧参照を後から変更しても親へ再代入された値を上書きしない", () => {
    const oldChildBase = { a: { x: 1, y: 0 } };

    const overwriteNext = produceDraft(oldChildBase, (d) => {
      const oldProxy = d.a;
      oldProxy.x = 2;
      d.a = { x: 99, y: 99 };
      oldProxy.y = 55;
      expect(d.a.x).toBe(99);
    });

    expect(overwriteNext.a).toEqual({ x: 99, y: 99 });
  });

  describe("代入された値の中のドラフトの展開", () => {
    type Rec = Record<string, unknown>;
    const makeBase = () => ({
      a: { v: 1 },
      b: { v: 2 },
      nested: { holder: [] as unknown[], objHolder: { plain: 1, nil: null } as Rec },
      rootHolder: [] as unknown[],
    });

    it("null・数値・関数の代入はそのまま残す", () => {
      const next = produceDraft(makeBase(), (d) => {
        (d as Rec).nil = null;
        (d as Rec).num = 123;
        (d as Rec).fn = () => 7;
      });

      const rec = next as Rec;
      expect(rec.nil).toBeNull();
      expect(rec.num).toBe(123);
    });

    it("循環配列に混ざったドラフトを実体にしても循環を保つ", () => {
      const next = produceDraft(makeBase(), (d) => {
        const cycArr: unknown[] = [1, d.a];
        cycArr.push(cycArr);
        (d as Rec).cycArr = cycArr;
      });

      const rec = next as Rec;
      expect((rec.cycArr as unknown[])[1]).toEqual({ v: 1 });
      expect((rec.cycArr as unknown[])[2]).toBe(rec.cycArr);
    });

    it("循環オブジェクトに混ざったドラフトを実体にしても循環を保つ", () => {
      const next = produceDraft(makeBase(), (d) => {
        const cycObj: Rec = { ok: true, ref: d.b };
        cycObj.self = cycObj;
        (d as Rec).cycObj = cycObj;
      });

      const rec = next as Rec;
      expect((rec.cycObj as Rec).ref).toEqual({ v: 2 });
      expect((rec.cycObj as Rec).self).toBe(rec.cycObj);
    });

    it("代入した後に配列へ紛れ込ませたドラフトも実体にする", () => {
      const next = produceDraft(makeBase(), (d) => {
        const h1: unknown[] = [];
        const h2: unknown[] = [];
        d.rootHolder = h1;
        d.nested.holder = h2;
        h1.push(d.a);
        h2.push(d.b);
      });

      expect(next.rootHolder).toEqual([{ v: 1 }]);
      expect(next.nested.holder).toEqual([{ v: 2 }]);
    });

    it("ネスト側だけの defineProperty でも既存の子ドラフトを破棄して値を置き換える", () => {
      const next = produceDraft(makeBase(), (d) => {
        void d.nested.objHolder.plain;
        Object.defineProperty(d.nested, "objHolder", {
          value: { replaced: true, ref: d.a },
          enumerable: true,
          configurable: true,
          writable: true,
        });
        expect(d.nested.objHolder.replaced).toBe(true);
      });

      expect(next.nested.objHolder).toEqual({ replaced: true, ref: { v: 1 } });
    });
  });

  it("ネストへの非列挙 defineProperty だけでも変更として複製し、値を保つ", () => {
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
