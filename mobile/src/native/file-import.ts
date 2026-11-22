import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { importLogFromFile, type LogImportResult } from "@shared/lib/importers";
import { parseSavedState } from "@shared/lib/state-schema";
import type { State } from "@shared/types";

function assetToWebFileLike(asset: DocumentPicker.DocumentPickerAsset): File {
  if (Platform.OS === "web" && asset.file) {
    return asset.file;
  }
  const fsFile = new ExpoFile(asset.uri);
  const stub = {
    name: asset.name,
    size: asset.size ?? 0,
    type: asset.mimeType ?? "",
    text: () => fsFile.text(),
    arrayBuffer: async () => {
      const u8 = await fsFile.bytes();
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    },
  };
  return stub as unknown as File;
}

export async function pickAndImportLogFile(): Promise<{
  fileName: string;
  result: LogImportResult | null;
} | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      "application/json",
      "text/html",
      "text/plain",
      "text/xml",
      "application/xml",
      "application/zip",
      "application/x-zip-compressed",
      "*/*",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const result = await importLogFromFile(assetToWebFileLike(asset));
  return { fileName: asset.name, result };
}

export async function pickAndImportBackupJson(): Promise<State | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const text = await assetToWebFileLike(picked.assets[0]).text();
  const parsed = parseSavedState(text);
  if (!parsed) {
    throw new Error("卓譜の記録として読み込めませんでした。ファイルを確認してください。");
  }
  return parsed;
}

export async function pickAvatarImageDataUrl(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("写真ライブラリへのアクセス許可が必要です。");
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.72,
    base64: true,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  if (asset.base64) {
    const mime = asset.mimeType && asset.mimeType.startsWith("image/") ? asset.mimeType : "image/jpeg";
    return `data:${mime};base64,${asset.base64}`;
  }
  return asset.uri;
}
