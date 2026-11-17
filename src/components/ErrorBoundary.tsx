import { Component, type ErrorInfo, type ReactNode } from "react";
import { download, todayStr } from "../lib/time";

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
            <button
              className="btn btn-sm"
              onClick={() => {
                try {
                  const backup = Object.fromEntries(
                    Object.keys(localStorage)
                      .filter((key) => key === "takufu-state-v4" || key.startsWith("takufu-cloud-"))
                      .map((key) => [key, localStorage.getItem(key)]),
                  );
                  download(`takufu-backup-${todayStr()}.json`, JSON.stringify(backup, null, 2));
                } catch {
                  /* noop */
                }
              }}
            >
              記録をダウンロード
            </button>
          </div>
        </div>
      </div>
    );
  }
}
