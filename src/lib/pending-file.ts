/** ルート間でログファイルを受け渡すための一時置き場（同一ページセッション内のみ） */
export function setPendingFile(f: File | null) {
  (window as unknown as { __takufuPendingFile?: File }).__takufuPendingFile = f;
}

export function takePendingFile(): File | null {
  const w = window as unknown as { __takufuPendingFile?: File };
  const f = w.__takufuPendingFile ?? null;
  w.__takufuPendingFile = null;
  return f;
}
