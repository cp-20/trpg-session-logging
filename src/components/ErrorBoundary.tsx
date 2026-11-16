import { Component, type ErrorInfo, type ReactNode } from "react";

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
        <div className="card bg-base-100 border border-base-300 max-w-md w-full px-6 py-7 text-center">
          <div className="text-3xl">😵</div>
          <h1 className="text-lg font-bold mt-2">予期しないエラーが発生しました</h1>
          <p className="text-[11.5px] text-ink2 mt-2 break-all text-left max-h-32 overflow-y-auto bg-base-200/60 rounded-lg p-2">
            {String(this.state.error?.stack ?? this.state.error)}
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
              className="btn btn-ghost btn-sm"
              onClick={() => {
                try {
                  localStorage.removeItem("takufu-state-v4");
                } catch {
                  /* noop */
                }
                location.reload();
              }}
            >
              データをリセットして再読み込み
            </button>
          </div>
          <p className="text-[10.5px] text-ink2 mt-3">このエラーは開発者ログに記録されます（本実装では Sentry を想定）。</p>
        </div>
      </div>
    );
  }
}
