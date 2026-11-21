"use client";
/**
 * 画面から使うルーティングの窓口。Next.js（App Router）の上に、画面側が必要とする
 * 最小限の形（Link / useNavigate / useParams / useSearchParam / usePathname）だけを置く。
 * 画面は next/navigation を直接 import せず、ここを使う。
 */
import NextLink from "next/link";
import {
  useParams as useNextParams,
  usePathname as useNextPathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useCallback } from "react";

export function Link({
  to,
  replace,
  prefetch,
  children,
  ...rest
}: {
  to: string;
  replace?: boolean;
  /** false: 先読みしない（公開ページから記録を使う画面へのリンク。Firebase の JS を先に落とさない） */
  prefetch?: boolean;
  children?: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <NextLink href={to} replace={replace} prefetch={prefetch} {...rest}>
      {children}
    </NextLink>
  );
}

/** nav({ to: "/sessions", search: { tab: "log" }, replace: true }) */
export function useNavigate() {
  const router = useRouter();
  const pathname = useNextPathname();
  return useCallback(
    ({ to, search, replace }: { to?: string; search?: Record<string, string>; replace?: boolean }) => {
      let href = to ?? pathname;
      if (search) {
        const qs = new URLSearchParams(search).toString();
        href = `${href.split("?")[0]}${qs ? `?${qs}` : ""}`;
      }
      if (replace) router.replace(href, { scroll: false });
      else router.push(href);
    },
    [router, pathname],
  );
}

export function useParams<T extends Record<string, string | undefined>>(): T {
  return (useNextParams() ?? {}) as T;
}

export function useSearchParam(name: string): string | null {
  return useSearchParams()?.get(name) ?? null;
}

export function useSearchString(): string {
  const s = useSearchParams()?.toString() ?? "";
  return s ? `?${s}` : "";
}

export function usePathname(): string {
  return useNextPathname() ?? "/";
}
