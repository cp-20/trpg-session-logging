import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="surface w-full max-w-md px-6 py-10 text-center">
        <h1 className="text-lg font-bold">ページが見つかりません</h1>
        <p className="mt-2 text-sm text-ink2">URL が変わったか、削除された可能性があります。</p>
        <Link href="/" className="btn btn-primary mt-6">
          ホームへ
        </Link>
      </div>
    </main>
  );
}
