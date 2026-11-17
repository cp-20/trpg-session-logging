import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { IconAlert } from "./icons";
import { Avatar, LogoMark, cx } from "./ui";
import {
  IconSearch, IconListDetails, IconUsersGroup, IconIdBadge, IconBooks, IconSettings,
  IconPlus, IconX,
} from "./icons";
import { SYSTEMS } from "../data/systems";
import { download, todayStr } from "../lib/time";

function SaveBanners() {
  const { saveError, dataCorrupt, otherTabUpdated, retrySave } = useStore();
  const banners: { text: string; kind: "warning" | "error" }[] = [];
  if (otherTabUpdated) banners.push({ text: "別のタブでデータが更新されました。このタブでの変更は保存されていません。", kind: "warning" });
  if (saveError) banners.push({ text: saveError, kind: "error" });
  if (dataCorrupt) banners.push({ text: "保存した記録を読み込めませんでした。元の記録を保護するため、今はサンプルを表示しています。", kind: "error" });
  if (banners.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      {banners.map((b, i) => (
        <div key={i} role="alert" className={`alert alert-${b.kind} text-[12.5px] py-2.5`}>
          <IconAlert width={16} height={16} className="flex-none" />
          <span className="grow">{b.text}</span>
          {saveError && <button className="btn btn-xs" onClick={retrySave}>もう一度保存</button>}
          {dataCorrupt && <button className="btn btn-xs" onClick={() => download(`takufu-backup-${todayStr()}.json`, localStorage.getItem("takufu-state-v4") ?? "")}>元の記録をダウンロード</button>}
          {b.kind === "warning" && (
            <button className="btn btn-xs" onClick={() => location.reload()}>
              再読み込みして最新を反映
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Shell() {
  return (
    <div className="drawer lg:drawer-open">
      <input id="nav-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col min-h-screen">
        {/* モバイル用トップバー */}
        <div className="navbar bg-base-100 border-b border-base-300 lg:hidden sticky top-0 z-30">
          <label htmlFor="nav-drawer" className="btn btn-ghost btn-sm btn-circle" aria-label="メニュー">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          </label>
          <Link to="/sessions" className="flex items-center gap-1.5 font-extrabold text-base px-1"><LogoMark size={18} /> 卓譜</Link>
          <Link to="/settings" className="btn btn-ghost btn-sm btn-circle ml-auto" aria-label="設定">
            <IconSettings width={18} height={18} />
          </Link>
        </div>
        <main className="flex-1 px-4 sm:px-7 py-6 pb-24 lg:pb-10 w-full max-w-5xl mx-auto">
          <SaveBanners />
          <Outlet />
        </main>
      </div>
      <div className="drawer-side z-40">
        <label htmlFor="nav-drawer" className="drawer-overlay" />
        <Sidebar />
      </div>
    </div>
  );
}

function Sidebar() {
  const { state, authUser, cloudStatus } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const me = state.users[state.me];
  const mySessions = Object.values(state.logs).filter((l) => l.ownerId === state.me || l.players[state.me]);
  const myChars = Object.values(state.characters).filter((c) => c.ownerId === state.me);
  const myTables = Object.values(state.tables).filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me);

  /* ページ移動したらドロワーを閉じる（モバイル） */
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const cb = document.getElementById("nav-drawer") as HTMLInputElement | null;
    if (cb) cb.checked = false;
  }, [loc.pathname]);

  const items = [
    { to: "/sessions", label: "セッション", icon: <IconListDetails width={17} height={17} />, count: mySessions.length },
    { to: "/tables", label: "卓", icon: <IconUsersGroup width={17} height={17} />, count: myTables.length },
    { to: "/characters", label: "キャラクター", icon: <IconIdBadge width={17} height={17} />, count: myChars.length },
    { to: "/scenarios", label: "シナリオ", icon: <IconBooks width={17} height={17} /> },
  ];

  return (
    <aside className="bg-base-100 border-r border-base-300 h-full w-60 flex flex-col py-4 px-3 gap-1">
      <Link to="/sessions" className="px-2 pb-2 block">
        <span className="font-extrabold text-lg tracking-tight">卓譜</span>
        {!authUser && <span className="block text-xs text-ink2 mt-1">サンプルでお試し中</span>}
      </Link>
      <GlobalSearch />
      <button className="btn btn-primary btn-sm mt-2 mb-1" onClick={() => nav("/upload")}>
        <IconPlus width={15} height={15} /> セッションを記録
      </button>
      <nav className="flex flex-col gap-0.5">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={({ isActive }) => cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-ink2 hover:bg-base-200", isActive && "bg-primary/10 text-primary")}>
            {it.icon}
            {it.label}
            {it.count != null && <span className="ml-auto badge badge-ghost badge-sm">{it.count}</span>}
          </NavLink>
        ))}
      </nav>

      {myTables.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-bold text-ink2 tracking-wider px-2 mb-1">参加している卓</div>
          {myTables.slice(0, 4).map((t) => (
            <Link key={t.id} to={`/tables/${t.id}`} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-base-content/70 hover:bg-base-200">
              <span className="text-[10px] font-bold" style={{ color: SYSTEMS[t.systemId ?? ""]?.color ?? "#6d7f8f" }}>{SYSTEMS[t.systemId ?? ""]?.short?.slice(0, 2) ?? "卓"}</span>
              <span className="truncate">{t.name}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2 border-t border-base-300">
        {authUser && <p className="text-xs text-ink2 px-2 pb-2" role="status">{cloudStatus === "saved" ? "保存済み" : cloudStatus === "saving" ? "保存中…" : cloudStatus === "error" ? "未同期の記録があります" : ""}</p>}
        <Link to={`/users/${state.me}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-base-200">
          <Avatar u={me} size={28} />
          <span className="leading-tight">
            <b className="text-[12.5px] block">{me.name}</b>
            <span className="text-[10px] text-ink2">マイページ</span>
          </span>
        </Link>
        <Link to="/settings" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] text-ink2 hover:bg-base-200">
          <IconSettings width={15} height={15} /> 設定・連携
        </Link>
      </div>
    </aside>
  );
}

function GlobalSearch() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        wrap.current?.querySelector("input")?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const query = q.trim().toLowerCase();
  const logs = query ? Object.values(state.logs).filter((l) => l.title.toLowerCase().includes(query)).slice(0, 3) : [];
  const scens = query ? Object.values(state.scenarios).filter((s) => (s.title + s.author).toLowerCase().includes(query)).slice(0, 3) : [];
  const chars = query ? Object.values(state.characters).filter((c) => (c.name + state.users[c.ownerId].name).toLowerCase().includes(query)).slice(0, 3) : [];
  const tabs = query ? Object.values(state.tables).filter((t) => t.name.toLowerCase().includes(query)).slice(0, 3) : [];
  const users = query ? Object.values(state.users).filter((u) => u.name.toLowerCase().includes(query)).slice(0, 3) : [];
  const count = logs.length + scens.length + chars.length + tabs.length + users.length;

  const go = (to: string) => {
    nav(to);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative px-0.5" ref={wrap}>
      <label className="input input-bordered input-sm flex items-center gap-2 w-full bg-base-200/60">
        <IconSearch width={15} height={15} className="opacity-40" />
        <input className="grow min-w-0" placeholder="検索 ( / )" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={(e) => {
          const related = e.relatedTarget as Node | null;
          if (related && wrap.current?.contains(related)) return;
          setOpen(false);
        }} onKeyDown={(e) => {
          if (e.key === "Enter" && count > 0) {
            if (logs[0]) go(`/sessions/${logs[0].id}`);
            else if (tabs[0]) go(`/tables/${tabs[0].id}`);
            else if (scens[0]) go(`/scenarios/${scens[0].id}`);
            else if (chars[0]) go(`/characters/${chars[0].id}`);
            else if (users[0]) go(`/users/${users[0].id}`);
          }
        }} />
        {q && (
          <button onClick={() => { setQ(""); setOpen(false); }} aria-label="クリア">
            <IconX width={13} height={13} className="opacity-50" />
          </button>
        )}
      </label>
      {open && query && (
        <div role="listbox" className="absolute top-full mt-1 left-0 right-0 z-50 bg-base-100 border border-base-300 rounded-xl shadow-lg p-1.5 max-h-[60vh] overflow-y-auto">
          {count === 0 && <div className="px-2 py-1.5 text-[11.5px] text-ink2">見つかりません</div>}
          {[
            { label: "セッション", items: logs.map((l) => ({ to: `/sessions/${l.id}`, icon: null, text: l.title, sub: SYSTEMS[l.systemId]?.short })) },
            { label: "卓", items: tabs.map((t) => ({ to: `/tables/${t.id}`, icon: null, text: t.name, sub: `${t.memberIds.length}人` })) },
            { label: "シナリオ", items: scens.map((s) => ({ to: `/scenarios/${s.id}`, icon: null, text: s.title, sub: s.author })) },
            { label: "キャラクター", items: chars.map((c) => ({ to: `/characters/${c.id}`, icon: null, text: c.name, sub: state.users[c.ownerId].name })) },
            { label: "ユーザー", items: users.map((u) => ({ to: `/users/${u.id}`, icon: null, text: u.name, sub: "ユーザー" })) },
          ].map((g) =>
            g.items.length > 0 ? (
              <div key={g.label}>
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-bold text-ink2 tracking-wider">{g.label}</div>
                {g.items.map((it) => (
                  <button key={it.to} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-base-200 text-[13px]" onClick={() => go(it.to)}>
                    <span className="w-4 text-center">{it.icon}</span>
                    <span className="truncate">{it.text}</span>
                    <span className="text-[10.5px] text-ink2 ml-auto">{it.sub}</span>
                  </button>
                ))}
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
