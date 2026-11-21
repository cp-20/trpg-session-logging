"use client";
import type { ReactNode } from "react";
import { StoreProviders } from "../store-providers";

/**
 * 記録（ストア）を使う画面: アプリ本体・共有ページ・ログイン・サンプル開始。
 * ひとつの layout にまとめ、この中を移動しても記録を読み直さない（保存待ちの変更も失わない）。
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return <StoreProviders>{children}</StoreProviders>;
}
