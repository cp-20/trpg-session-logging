import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, resetData } from "../store";
import { Avatar, CopyBox, Modal, PageHead, ProviderIcon, PROVIDER_LABEL, SectionTitle, Tag, Toggle } from "../components/ui";
import { download, sleep, todayStr, uid } from "../lib/time";
import { isFirebaseConfigured, firebaseStatus } from "../lib/firebase";
import { importPersisted } from "../lib/persisted";
import { createMockVerificationService, type VerificationProvider, type VerificationCode } from "../external";

const verification = createMockVerificationService({ latencyMs: 900 });

/* 外観モード: ダーク / システム設定に従う / ライト の3択(OSの慣習に合わせる) */
type ThemeMode = "dark" | "system" | "light";

export function resolveTheme(mode: ThemeMode): string {
  const dark =
    mode === "dark" ||
    (mode === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? "takufuDark" : "takufu";
}

export function applyTheme(mode: ThemeMode): void {
  localStorage.setItem("takufu-theme", mode);
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

export function currentThemeMode(): ThemeMode {
  const v = localStorage.getItem("takufu-theme");
  return v === "dark" || v === "light" ? v : "system";
}
import type { Provider } from "../types";

export default function Settings() {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const me = state.users[state.me];
  const [oauth, setOauth] = useState<Provider | null>(null);
  const [verify, setVerify] = useState<Provider | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function link(provider: Provider) {
    update((s) => {
      const u = s.users[s.me];
      const ex = u.accounts.find((a) => a.provider === provider);
      if (ex) {
        ex.status = "linked";
        ex.externalId = `${provider.slice(0, 2)}_${uid()}`;
        ex.verifiedAt = todayStr();
      } else {
        u.accounts.push({ provider, status: "linked", externalId: `${provider.slice(0, 2)}_${uid()}`, verifiedAt: todayStr() });
      }
    });
  }

  function unlink(provider: Provider) {
    update((s) => {
      const u = s.users[s.me];
      const ex = u.accounts.find((a) => a.provider === provider);
      if (ex) {
        ex.status = "none";
        ex.externalId = undefined;
        ex.verifiedAt = undefined;
      }
    });
    toast(`${PROVIDER_LABEL[provider]}の連携を解除しました`);
  }

  const status = (p: Provider) => me.accounts.find((a) => a.provider === p)?.status ?? "none";

  return (
    <>
      <PageHead
        title="設定・連携"
        sub="サインイン用の身元と、作者確認用の連携は別物です。パスワードやCookieは保存しません"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => { update((s) => { s.entered = false; }); nav("/"); }}>
            サインアウト
          </button>
        }
      />

      <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-2">
        <div className="flex items-center gap-3">
          <Avatar u={me} size={38} />
          <div className="grow">
            <b className="text-[15px]">{me.name}</b>
            <div className="text-[11.5px] text-ink2">{me.bio ?? "—"}</div>
          </div>
          <a className="btn btn-ghost btn-sm" href={`#/users/${state.me}`}>マイページ</a>
        </div>
      </div>

      <SectionTitle right={<span className="text-[11px] text-base-content/50">識別のためだけに使います。投稿・フォローは行いません</span>}>サインイン</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-2">
        {(["google", "discord", "x"] as Provider[]).map((p) => {
          const acct = me.accounts.find((a) => a.provider === p);
          const linked = acct?.status === "linked";
          const displayName = linked
            ? p === "discord"
              ? `${me.name}#${acct?.externalId?.slice(-4) ?? "0000"}`
              : `${me.name} @ ${PROVIDER_LABEL[p]}`
            : null;
          return (
            <div key={p} className="flex flex-wrap items-center gap-3 py-2.5 border-b border-base-200 last:border-0">
              <ProviderIcon provider={p} size={20} />
              <b className="text-[13.5px] w-20">{PROVIDER_LABEL[p]}</b>
              <span className="text-[12.5px] grow leading-5">
                {linked ? (
                  <>
                    <span className="text-base-content font-medium">{displayName}</span>
                    {acct?.verifiedAt && <span className="text-[11px] text-base-content/50 block">連携日 {acct.verifiedAt}</span>}
                  </>
                ) : (
                  <span className="text-base-content/50">未連携</span>
                )}
              </span>
              {linked ? (
                <button className="btn btn-ghost btn-xs text-error" onClick={() => unlink(p)}>解除</button>
              ) : (
                <button className="btn btn-outline btn-xs" onClick={() => setOauth(p)}>{PROVIDER_LABEL[p]} で連携</button>
              )}
            </div>
          );
        })}
      </div>

      <SectionTitle right={<span className="text-[11px] text-base-content/50">シナリオの所有権申請に使う確認です</span>}>頒布元アカウントの確認</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-2">
        {(["booth", "talto"] as Provider[]).map((p) => (
          <div key={p} className="flex flex-wrap items-center gap-3 py-2.5 border-b border-base-200 last:border-0">
            <ProviderIcon provider={p} size={20} />
            <b className="text-[13.5px] w-20">{PROVIDER_LABEL[p]}</b>
            <span className="text-[11.5px] text-ink2 grow">
              {status(p) === "linked"
                ? `確認済み · ${me.accounts.find((a) => a.provider === p)?.verifiedAt} · 公開ページの文面確認`
                : p === "booth"
                ? "ショップの自己紹介欄に確認コードを置いて確認します"
                : "プロフィールの自己紹介欄に確認コードを置いて確認します"}
            </span>
            {status(p) === "linked" ? (
              <button className="btn btn-ghost btn-xs text-error" onClick={() => unlink(p)}>解除</button>
            ) : (
              <button className="btn btn-xs" onClick={() => setVerify(p)}>確認コードを発行</button>
            )}
          </div>
        ))}
        <p className="text-[11px] text-ink2 py-2 leading-5">
          表示名の一致は所有権の証明になりません。コードは一度きり・約30分で失効します。
          連携を外すと既存の申請は消えずに「確認待ち」へ戻ります。
        </p>
      </div>

      <SectionTitle>表示</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-2 mb-2">
        <div className="flex items-center gap-3 py-2">
          <span className="text-[12.5px] text-base-content/70 grow">
            外観
            <span className="text-[11px] text-ink2 block">「端末に合わせる」は OS のダークモード設定に追従します</span>
          </span>
          <ThemePicker />
        </div>
      </div>

      <SectionTitle>プライバシー</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-2">
        <div className="flex items-center gap-3 py-2 border-b border-base-200 last:border-0">
          <span className="text-[12.5px] text-base-content/70 grow">
            共有ビューに自分の名前を表示しない
            <span className="text-[11px] text-ink2 block">他の人が共有ページやシナリオの記録一覧であなたの名前を見られなくなります</span>
          </span>
          <Toggle
            on={state.prefs.hideSelfOnShare}
            onChange={(v) => {
              update((s) => {
                s.prefs.hideSelfOnShare = v;
                // 参加している全ログで自分の行に反映(共有ページと逆引きから名前が消える)
                Object.values(s.logs).forEach((l) => {
                  if (l.players[s.me]) l.players[s.me].hidden = v;
                });
              });
              toast(v ? "共有ページと逆引きから名前が消えます" : "元に戻しました");
            }}
          />
        </div>
      </div>

      <SectionTitle>データ</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm" onClick={() => { download(`takufu-data-${todayStr()}.json`, JSON.stringify(state, null, 2)); toast("JSONをエクスポートしました"); }}>
            JSONをエクスポート
          </button>
          <button className="btn btn-sm text-error" onClick={() => setConfirmReset(true)}>モックデータをリセット</button>
        </div>
        <p className="text-[11px] text-ink2 mt-2">
          このモックの変更はブラウザの localStorage に保存されます。実データの保存先は Firestore + R2（zstd圧縮）の想定です。
        </p>
        <div className="mt-3 text-[12px] leading-6">
          <span className="font-bold text-[11px] text-ink2 mr-2">Firebase</span>
          {isFirebaseConfigured ? (
            <>
              <Tag v="ok" className="mr-1">接続済み</Tag>
              <code className="text-[11px] bg-base-200 rounded px-1">{firebaseStatus().projectId}</code>
              <span className="text-ink2"> / DB: {firebaseStatus().databaseId}</span>
              <span className="text-[10.5px] text-ink2 block mt-1">※ 現在もデータはモック(localStorage)に保存されています。Firestore への移行は api 層の実装で段階的に行います。</span>
            </>
          ) : (
            <>
              <Tag v="gray" className="mr-1">未設定</Tag>
              <span className="text-ink2">.env.local に VITE_FIREBASE_* を置くと接続します(.env.example 参照)</span>
            </>
          )}
        </div>
      </div>

      <SectionTitle>このアプリについて</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-3 text-[11.5px] text-ink2 leading-6">
        卓譜（Takufu）— 「テーブルの記録」、将棋や囲碁の棋譜に由来。
        <br />
        これは動作確認用のモックです。アップロード・OAuth・外部取得はすべて偽物で、実際には送信されません。
        <br />
        想定構成: Next.js / Firebase Auth（X, Discord）/ Firestore / Cloudflare R2（zstd）/ Workers。
      </div>

      {oauth && <OauthModal provider={oauth} onPick={() => { setOauth(null); link(oauth); toast(`${PROVIDER_LABEL[oauth]}アカウントを連携しました`); }} onClose={() => setOauth(null)} />}
      {verify && <VerifyModal provider={verify} onDone={() => { setVerify(null); link(verify); toast(`${PROVIDER_LABEL[verify]}を確認しました（${todayStr()}）`); }} onClose={() => setVerify(null)} />}

      {confirmReset && (
        <Modal
          title="モックデータをリセットしますか？"
          onClose={() => setConfirmReset(false)}
          foot={
            <>
              <button className="btn" onClick={() => setConfirmReset(false)}>キャンセル</button>
              <button className="btn btn-error" onClick={() => { resetData(); location.reload(); }}>リセット</button>
            </>
          }
        >
          <p className="text-[12px] text-ink2">localStorageの変更履歴を消して、初期サンプルデータに戻します。</p>
        </Modal>
      )}
    </>
  );
}

/* ---------- 外観3択(セグメントコントロール) ---------- */
function ThemePicker() {
  const [mode, setMode] = useState<ThemeMode>(currentThemeMode);

  /* 「システム設定に従う」の間は OS の切り替えに追従する */
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.setAttribute("data-theme", resolveTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const options: [ThemeMode, string][] = [
    ["light", "ライト"],
    ["system", "システムに従う"],
    ["dark", "ダーク"],
  ];
  return (
    <div className="join" role="radiogroup" aria-label="外観">
      {options.map(([v, label]) => (
        <input
          key={v}
          type="radio"
          name="theme-mode"
          value={v}
          aria-label={label}
          className="join-item btn btn-sm px-3"
          checked={mode === v}
          onChange={() => {
            setMode(v);
            applyTheme(v);
          }}
        />
      ))}
    </div>
  );
}

function OauthModal({ provider, onPick, onClose }: { provider: Provider; onPick: () => void; onClose: () => void }) {
  const { state } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const demo = ["u_mikan", "u_sora", "u_kai", "u_hina", "u_rin"];
  return (
    <Modal title={`${PROVIDER_LABEL[provider]} で連携（モック）`} onClose={onClose}>
      <div className="flex items-center gap-2 mb-3 text-[12px] text-ink2">
        <ProviderIcon provider={provider} size={16} />
        <b>{PROVIDER_LABEL[provider]}</b>
        <span className="ml-auto">卓譜 への接続を許可しますか？</span>
      </div>
      <p className="text-[11px] text-ink2 mb-2">デモ用アカウントを選択してください（実際のOAuth同意画面の代わり）。</p>
      {demo.map((id) => {
        const u = state.users[id];
        return (
          <button
            key={id}
            className="flex items-center gap-3 w-full px-2 py-2.5 rounded-xl hover:bg-base-200 text-left border-b border-base-200 last:border-0"
            disabled={!!busy}
            onClick={async () => {
              setBusy(id);
              await sleep(900);
              onPick();
            }}
          >
            <Avatar u={u} size={30} />
            <span className="grow">
              <b className="text-[13.5px]">{u.name}</b>
              <div className="text-[10.5px] text-ink2">{id.replace("u_", "").toLowerCase()}@example.com</div>
            </span>
            <span className="text-[11px] text-ink2">{busy === id ? "接続中…" : "続行 →"}</span>
          </button>
        );
      })}
    </Modal>
  );
}

function VerifyModal({ provider, onDone, onClose }: { provider: Provider; onDone: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<VerificationCode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    verification.createCode(provider as VerificationProvider).then((c) => {
      if (alive) setCode(c);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);
  const place = code?.place ?? "自己紹介欄";
  return (
    <Modal
      title={`${PROVIDER_LABEL[provider]} の文面確認（モック）`}
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>あとで</button>
          <button
            className={busy ? "btn btn-disabled" : "btn btn-primary"}
            disabled={busy}
            onClick={async () => {
              if (!code) return;
              setBusy(true);
              const r = await verification.confirm(provider as VerificationProvider, code.code);
              setBusy(false);
              if (!r.ok) {
                setErr(r.error ?? "確認できませんでした");
                return;
              }
              onDone();
            }}
          >
            {busy ? "公開ページを確認中…" : "置きました。確認する"}
          </button>
        </>
      }
    >
      <ol className="text-[12px] text-base-content/70 pl-5 list-decimal space-y-1.5 my-2">
        <li>下の確認コードをコピーする</li>
        <li>{PROVIDER_LABEL[provider]}の{place}に貼り付ける（公開のままで）</li>
        <li>「確認する」を押すと、卓譜がそのページを確認します</li>
      </ol>
      {code ? <CopyBox text={code.code} note="コードは一度きり・約30分で失効します" /> : <div className="skeleton h-10 w-full" />}
      {err && <p className="text-[11.5px] text-error mt-2">{err}</p>}
      {busy && (
        <p className="text-[11px] text-ink2 mt-2">
          → {provider === "booth" ? "https://example.booth.pm （公開ページを取得中）" : "https://talto.io/users/12345 （公開ページを取得中）"}
        </p>
      )}
    </Modal>
  );
}
