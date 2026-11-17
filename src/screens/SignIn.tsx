import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { useNavigate } from "../lib/router";
import { useStore } from "../store";
import { LogoMark } from "../components/ui";
import { ProviderIcon } from "../components/identity";
import { IconFileText, IconIdBadge, IconLock } from "../components/icons";
import { signInWithGoogle, authErrorMessage } from "../lib/auth";
import { isFirebaseConfigured } from "../lib/firebase";

/** 卓譜で何ができるかを、具体的な操作で3つだけ示す */
const POINTS: { Icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string }[] = [
  {
    Icon: IconFileText,
    title: "ログを取り込んで記録",
    body: "CCFOLIA・Udonarium・テキストのログから、日時と発言者を読み取ります。",
  },
  {
    Icon: IconIdBadge,
    title: "探索者ごとの履歴",
    body: "参加したセッションと成長の記録を、キャラクターごとに並べます。",
  },
  {
    Icon: IconLock,
    title: "共有範囲はセッションごと",
    body: "メンバー限定・プレイした人・公開から選んで、リンクで共有します。",
  },
];

export default function SignIn() {
  const { enterDemo } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
      <div className="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <section aria-labelledby="signin-title">
          <div className="flex items-center gap-2.5 text-primary">
            <LogoMark size={32} />
            <h1 id="signin-title" className="text-2xl font-bold tracking-tight text-base-content">
              卓譜
            </h1>
          </div>
          <p className="mt-4 text-lg font-bold leading-relaxed sm:text-xl">
            TRPGのセッションログ・探索者・卓の記録をまとめて残します。
          </p>
          <ul className="mt-8 hidden space-y-5 sm:block">
            {POINTS.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-base-100 text-primary ring-1 ring-base-300">
                  <Icon width={18} height={18} aria-hidden />
                </span>
                <span>
                  <b className="block text-sm">{title}</b>
                  <span className="text-sm leading-relaxed text-ink2">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="サインイン" className="surface p-6 sm:p-7">
          <h2 className="text-base font-bold">はじめる</h2>
          <p className="mt-1 text-sm text-ink2">記録はアカウントに保存され、どの端末からでも開けます。</p>
          <button
            className="btn btn-primary mt-5 w-full"
            disabled={busy || !isFirebaseConfigured}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await signInWithGoogle();
              } catch (cause) {
                setError(authErrorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <span className="loading loading-spinner loading-xs" aria-hidden="true" />
            ) : (
              <ProviderIcon provider="google" size={22} />
            )}
            {busy ? "サインイン中…" : "Google でサインイン"}
          </button>
          {error && (
            <p className="mt-3 text-sm leading-6 text-error" role="alert">
              {error}
            </p>
          )}
          {!isFirebaseConfigured && (
            <p className="mt-3 text-sm text-ink2">サインインは準備中です。サンプルデータでお試しください。</p>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-ink3" aria-hidden>
            <span className="h-px flex-1 bg-base-300" />
            または
            <span className="h-px flex-1 bg-base-300" />
          </div>

          <button
            className="btn w-full"
            disabled={busy}
            onClick={() => {
              enterDemo();
              nav({ to: "/" });
            }}
          >
            サンプルデータをそのまま見る
          </button>
          <p className="mt-2 text-xs leading-relaxed text-ink2">
            登録は不要です。変更はこのブラウザにだけ保存されます。
          </p>
        </section>
      </div>
    </main>
  );
}
