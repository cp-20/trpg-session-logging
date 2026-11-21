import fs from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

function readRootEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const envFile = readRootEnvLocal();
  const readEnv = (expoKey: string, nextKey: string, fallback = "") =>
    process.env[expoKey] || process.env[nextKey] || envFile[expoKey] || envFile[nextKey] || fallback;

  return {
    ...config,
    name: "卓譜",
    slug: "takufu",
    version: "0.3.0",
    orientation: "portrait",
    scheme: "takufu",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    backgroundColor: "#f2ebe0",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "app.takufu.mobile",
      infoPlist: {
        NSFaceIDUsageDescription: "秘密のログやキャラクター記録を端末で保護するために使います。",
        NSCalendarsUsageDescription:
          "卓の予定をカレンダーに追加し、候補日の空き状況を確認するために使います。",
        NSCalendarsFullAccessUsageDescription:
          "卓の予定をカレンダーに追加し、候補日の空き状況を確認するために使います。",
        NSPhotoLibraryUsageDescription: "キャラクターや発言者のアイコン画像を選ぶために使います。",
      },
    },
    android: {
      package: "app.takufu.mobile",
      backgroundColor: "#f2ebe0",
      adaptiveIcon: {
        backgroundColor: "#f2ebe0",
        foregroundImage: "./assets/adaptive-icon.png",
      },
      permissions: ["READ_CALENDAR", "WRITE_CALENDAR", "USE_BIOMETRIC", "USE_FINGERPRINT"],
    },
    web: {
      bundler: "metro",
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-router",
        {
          root: "./src/app",
        },
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#f2ebe0",
          image: "./assets/splash-icon.png",
          imageWidth: 120,
          dark: {
            backgroundColor: "#1a1613",
            image: "./assets/splash-icon.png",
          },
        },
      ],
      "expo-sqlite",
      [
        "expo-calendar",
        {
          calendarPermission: "卓の予定をカレンダーに追加し、候補日の空き状況を確認するために使います。",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "キャラクターや発言者のアイコン画像を選ぶために使います。",
        },
      ],
      [
        "expo-local-authentication",
        {
          faceIDPermission: "秘密のログやキャラクター記録を端末で保護するために使います。",
        },
      ],
      "expo-notifications",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      firebase: {
        apiKey: readEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY"),
        authDomain: readEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
        projectId: readEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
        storageBucket: readEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
        messagingSenderId: readEnv(
          "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
          "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        ),
        appId: readEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"),
        databaseId: readEnv("EXPO_PUBLIC_FIREBASE_DATABASE_ID", "NEXT_PUBLIC_FIREBASE_DATABASE_ID", "takufu"),
      },
      googleAuth: {
        iosClientId: readEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
        androidClientId: readEnv(
          "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
          "NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
        ),
        webClientId: readEnv("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
      },
    },
  };
};
