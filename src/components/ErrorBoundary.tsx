import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 控えの書き出しに要るもの（Firebase Auth を含む）は、押したときに読む。
 * この部品はすべての画面（LP・規約も）を包むので、ここで静的に import すると公開ページの JS に Firebase が載る
 */
async function downloadBackup() {
  const [{ download, todayStr }, { getTakufuAuth }, { backupLocalCopy }] = await Promise.all([
    import("../lib/time"),
    import("../lib/auth"),
    import("../lib/local-copy"),
  ]);
  // 今の人の控えだけ（共用の端末で、ほかのアカウントの記録まで書き出さない）
  const backup = backupLocalCopy(localStorage, getTakufuAuth()?.currentUser?.uid ?? null);
  download(`takufu-backup-${todayStr()}.json`, JSON.stringify(backup, null, 2));
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 画面全体を包む ErrorBoundary。
 * レンダリング中の例外を捕捉し、白画面の代わりに復帰手段(再読み込み/データリセット)を出す。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-base-200">
        <div className="surface max-w-md w-full px-6 py-7 text-center">
          <h1 className="text-lg font-bold mt-2">画面を表示できませんでした</h1>
          <p className="text-sm text-ink2 mt-3 leading-7">
            再読み込みして、もう一度お試しください。保存した記録は削除されません。
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                this.setState({ error: null });
                location.reload();
              }}
            >
              再読み込み
            </button>
            <button className="btn btn-sm" onClick={() => void downloadBackup().catch(() => {})}>
              記録をダウンロード
            </button>
          </div>
        </div>
      </div>
    );
  }
}
