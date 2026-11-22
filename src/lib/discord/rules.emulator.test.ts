import { expect, it } from "vitest";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getTakufuAuth } from "../auth";
import { getTakufuFirestore } from "../firebase";

/**
 * Discord 連携の文書はサーバー（ボットの利用者。firestore.rules の isBot()）だけが読み書きする。
 * ログインした人は、自分の userDiscord を読む・消すことだけできる
 */
const BOT_ONLY = [
  "discordLinks",
  "userDiscord",
  "discordOAuthStates",
  "discordLinkCodes",
  "tableDiscord",
  "discordEvents",
  "discordReminders",
];

it.skipIf(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")(
  "Discord 連携の文書は、ブラウザからは自分の userDiscord を読む・消す以外できない（実際のルール）",
  async () => {
    const auth = getTakufuAuth()!;
    const run = crypto.randomUUID().slice(0, 8);
    // ボットに似せた名前で登録しても、uid は選べないのでボットにはなれない
    const user = (
      await createUserWithEmailAndPassword(auth, `discord-bot-${run}@takufu.invalid`, "test-password-123")
    ).user;
    const db = getTakufuFirestore()!;
    for (const name of BOT_ONLY) {
      const mine = name === "userDiscord";
      if (mine) expect((await getDoc(doc(db, name, user.uid))).exists(), `${name} get own`).toBe(false);
      else
        await expect(getDoc(doc(db, name, user.uid)), `${name} get`).rejects.toMatchObject({
          code: "permission-denied",
        });
      await expect(getDoc(doc(db, name, "someone-else")), `${name} get other`).rejects.toMatchObject({
        code: "permission-denied",
      });
      await expect(getDocs(collection(db, name)), `${name} list`).rejects.toMatchObject({
        code: "permission-denied",
      });
      await expect(setDoc(doc(db, name, user.uid), { uid: user.uid }), `${name} set`).rejects.toMatchObject({
        code: "permission-denied",
      });
      if (mine) await deleteDoc(doc(db, name, user.uid));
      else
        await expect(deleteDoc(doc(db, name, user.uid)), `${name} delete`).rejects.toMatchObject({
          code: "permission-denied",
        });
    }
  },
  30_000,
);
