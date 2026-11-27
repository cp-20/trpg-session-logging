/**
 * サイトごと・システムごとのキャラシの読み取りの一覧。sheet-sources.ts（シートを作る）と
 * importers.ts（名前・システム・続く値を取り込む）が、サイトの道やシステムの印でここから引く。
 * id は卓譜のシステム ID（BCDice の ID。BCDice に無いものは general と label）。
 */
import type { GameSheetParts } from "../sheet";
import { arianrhod2eFromCharasheet } from "./charasheet-arianrhod2e";
import { dx3FromCharasheet } from "./charasheet-dx3";
import { goblinSlayerFromCharasheet } from "./charasheet-goblinslayer";
import { kamigakariFromCharasheet } from "./charasheet-kamigakari";
import { nechronicaFromCharasheet } from "./charasheet-nechronica";
import { nightWizardFromCharasheet } from "./charasheet-nightwizard";
import { readSoukoFutariSousa } from "./souko-2s";
import { readSoukoHelltv } from "./souko-helltv";
import { readSoukoMglg } from "./souko-mglg";
import { readSoukoSatasupe } from "./souko-satasupe";
import { readSoukoStellar } from "./souko-stellar";
import { readYtsheetAr2e } from "./ytsheet-ar2e";
import { readYtsheetBlp } from "./ytsheet-blp";
import { readYtsheetDx3rd } from "./ytsheet-dx3rd";
import { readYtsheetGc } from "./ytsheet-gc";
import { readYtsheetGs } from "./ytsheet-gs";
import { readYtsheetKiz } from "./ytsheet-kiz";
import { readYtsheetMs } from "./ytsheet-ms";
import { readYtsheetVc } from "./ytsheet-vc";

export interface GameReader {
  /** 卓譜のシステム ID */
  id: string;
  /** システム名（BCDice に無いシステムの表示名にも使う） */
  label: string;
  read: (root: Record<string, unknown>) => GameSheetParts;
}

/** キャラクター保管所（JSON の game の値） */
export const CHARASHEET_GAMES: Record<string, GameReader> = {
  dx3: { id: "DoubleCross", label: "ダブルクロス The 3rd Edition", read: dx3FromCharasheet },
  ara2: { id: "Arianrhod", label: "アリアンロッドRPG 2E", read: arianrhod2eFromCharasheet },
  gobusla: { id: "GoblinSlayer", label: "ゴブリンスレイヤーTRPG", read: goblinSlayerFromCharasheet },
  kmgkr: { id: "Kamigakari", label: "神我狩", read: kamigakariFromCharasheet },
  nechro: { id: "Nechronica", label: "永い後日談のネクロニカ", read: nechronicaFromCharasheet },
  nw3: { id: "NightWizard3rd", label: "ナイトウィザード The 3rd Edition", read: nightWizardFromCharasheet },
};

/** ゆとシートⅡ（URL の道。/ytsheet/dx3rd/ など）。ソード・ワールドは sheet-sources.ts が読む */
export const YTSHEET_GAMES: Record<string, GameReader> = {
  dx3rd: { id: "DoubleCross", label: "ダブルクロス The 3rd Edition", read: readYtsheetDx3rd },
  ar2e: { id: "Arianrhod", label: "アリアンロッドRPG 2E", read: readYtsheetAr2e },
  gs: { id: "GoblinSlayer", label: "ゴブリンスレイヤーTRPG", read: readYtsheetGs },
  kiz: { id: "KizunaBullet", label: "キズナバレット", read: readYtsheetKiz },
  ms: { id: "MamonoScramble", label: "マモノスクランブル", read: readYtsheetMs },
  gc: { id: "GranCrest", label: "グランクレストRPG", read: readYtsheetGc },
  blp: { id: "general", label: "ブラッドパス", read: readYtsheetBlp },
  vc: { id: "general", label: "ヴィジランテ・コード", read: readYtsheetVc },
};

/** キャラクターシート倉庫（URL の道。/mglg/ など）。ダブルクロス・シノビガミ・インセインは sheet-sources.ts が読む */
export const SOUKO_GAMES: Record<string, GameReader> = {
  mglg: { id: "MagicaLogia", label: "マギカロギア", read: readSoukoMglg },
  helltv: { id: "KillDeathBusiness", label: "キルデスビジネス", read: readSoukoHelltv },
  stellar: { id: "StellarKnights", label: "銀剣のステラナイツ", read: readSoukoStellar },
  satasupe: { id: "Satasupe", label: "サタスペ", read: readSoukoSatasupe },
  "2s": { id: "FutariSousa", label: "フタリソウサ", read: readSoukoFutariSousa },
};
