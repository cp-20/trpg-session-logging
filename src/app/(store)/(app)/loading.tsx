"use client";
import { PageLoading } from "../../../components/ui";

/** 画面の切り替え中（先読みが済んでいないとき）。枠（Shell）は残したまま、中身の所に出す */
export default function Loading() {
  return <PageLoading />;
}
