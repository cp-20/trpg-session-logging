import type { ComponentRef, RefObject } from "react";
import { Linking, Platform, Share, type View } from "react-native";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

export async function shareTextOrUrl(title: string, message: string, url?: string): Promise<void> {
  await Share.share({
    title,
    message: url ? `${message}\n${url}` : message,
    url,
  });
}

export async function shareViewAsPng(
  viewRef: RefObject<ComponentRef<typeof View> | null>,
  filename: string,
): Promise<void> {
  if (!viewRef.current) {
    throw new Error("画像を作成できませんでした。");
  }
  const uri = await captureRef(viewRef as unknown as Parameters<typeof captureRef>[0], {
    format: "png",
    quality: 1,
    result: "tmpfile",
    width: 1200,
    height: 670,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("この端末では共有シートを開けませんでした。");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: filename,
  });
}

export async function shareJsonBackupFile(filename: string, jsonText: string): Promise<void> {
  if (Platform.OS === "web") {
    await Share.share({ title: filename, message: jsonText });
    return;
  }
  const file = new ExpoFile(Paths.cache, filename);
  await file.write(jsonText);
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    await Share.share({ title: filename, message: jsonText });
    return;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: filename,
  });
}

export async function openExternalUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}
