/**
 * TALTO の公開シナリオの一覧（scripts/data/talto-catalog.json）を、共有シナリオ一覧（Firestore の scenarios）へ書き込む。
 *   node scripts/sync-scenario-directory.ts [--dry-run] [--emulator]
 *
 * - ボットの利用者（.env.discord.local の TAKUFU_BOT_EMAIL / TAKUFU_BOT_PASSWORD）で書く。TALTO の作品（sc_talto_*）を
 *   書けるのはボットだけ（firestore.rules）。
 * - 今ある TALTO の文書を読み、中身が変わったものだけを書く。共有シナリオ一覧から消えた作品は消す（利用者が足したものには触れない）。
 * - 共有シナリオ一覧の取り直しは node scripts/fetch-talto-scenarios.ts。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getFirestore,
  query,
  where,
  writeBatch,
} from "firebase/firestore/lite";
import { SYSTEMS } from "../src/data/systems.ts";
import { docFields, taltoToDirectory, toDirectoryDoc } from "../src/lib/scenario-directory.ts";
import { decodeTaltoCatalog, type TaltoCatalogFile } from "../src/lib/talto-scenarios.ts";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const EMULATOR = args.includes("--emulator");
const BATCH = 400;

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(path))
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    }
  return out;
}

const env: Record<string, string | undefined> = {
  ...readEnvFile(join(ROOT, ".env.local")),
  ...readEnvFile(join(ROOT, ".env.discord.local")),
  ...process.env,
};
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = EMULATOR ? "demo-key" : env.NEXT_PUBLIC_FIREBASE_API_KEY;
const email = EMULATOR ? "discord-bot@takufu.invalid" : env.TAKUFU_BOT_EMAIL;
const password = EMULATOR ? undefined : env.TAKUFU_BOT_PASSWORD;
if (!projectId || !apiKey)
  throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID / API_KEY are missing (.env.local)");
if (!EMULATOR && (!email || !password))
  throw new Error("TAKUFU_BOT_EMAIL / TAKUFU_BOT_PASSWORD are missing (.env.discord.local)");

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app, env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "takufu");
if (EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  // エミュレーターのボット（uid は firestore.rules の botUid()）。サーバーと同じ作り方
  const { ensureEmulatorBotUser, EMULATOR_BOT } = await import("../src/lib/discord/bot-account.ts");
  await ensureEmulatorBotUser({ authUrl: "http://127.0.0.1:9099", projectId, ...EMULATOR_BOT });
  await signInWithEmailAndPassword(auth, EMULATOR_BOT.email, EMULATOR_BOT.password);
} else {
  await signInWithEmailAndPassword(auth, email!, password!);
}

const file = JSON.parse(
  readFileSync(join(ROOT, "scripts/data/talto-catalog.json"), "utf8"),
) as TaltoCatalogFile;
const wanted = new Map(
  decodeTaltoCatalog(file).map((e, rank) => {
    const d = toDirectoryDoc(taltoToDirectory(e, SYSTEMS), rank, SYSTEMS);
    return [d.id, docFields(d)] as const;
  }),
);

const existing = new Map<string, string>();
for (const snap of (await getDocs(query(collection(db, "scenarios"), where("source", "==", "talto")))).docs)
  if (snap.id.startsWith("sc_talto_")) existing.set(snap.id, JSON.stringify(sortKeys(snap.data())));

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

const writes = [...wanted].filter(([id, fields]) => existing.get(id) !== JSON.stringify(sortKeys(fields)));
const deletes = [...existing.keys()].filter((id) => !wanted.has(id));
console.log(
  `catalog ${wanted.size} (fetched ${file.fetchedAt}), in Firestore ${existing.size}: write ${writes.length}, delete ${deletes.length}${DRY ? " (dry run)" : ""}`,
);
if (!DRY) {
  const ops = [
    ...writes.map(
      ([id, fields]) =>
        (b: ReturnType<typeof writeBatch>) =>
          b.set(doc(db, "scenarios", id), fields),
    ),
    ...deletes.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(db, "scenarios", id))),
  ];
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH)) op(batch);
    await batch.commit();
    console.log(`  ${Math.min(i + BATCH, ops.length)} / ${ops.length}`);
  }
}
process.exit(0);
