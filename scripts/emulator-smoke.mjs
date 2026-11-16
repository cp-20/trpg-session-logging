/**
 * ローカル動作確認: Firebase エミュレータ + 卓譜のセキュリティルール。
 *   前提: firebase emulators:start --only firestore,auth --project takufu-app
 *   使い方: node scripts/emulator-smoke.mjs
 * (node:http を直接使う: fetch が ":signUp" を正規化して emulator と合わないため)
 * ドキュメントIDは実行ごとに一意(エミュレータのデータは再起動まで残るため)。
 */
import http from "node:http";

const API_KEY = "AIzaSyCerWqQYV2c56CYgzLGPbS36tnrx75hoWw";
const AUTH_HOST = "127.0.0.1:9099";
const FS_HOST = "127.0.0.1:8080";
const RUN = Date.now().toString(36);
const results = [];

function req(hostPort, path, { method = "GET", body, token } = {}) {
  const [host, portStr] = hostPort.split(":");
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const r = http.request({ host, port: Number(portStr), path, method, headers }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* noop */
        }
        resolve({ status: res.statusCode, json, text });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(name, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const fields = (ownerId, scope) => ({
  fields: {
    title: { stringValue: "emulator smoke" },
    ownerId: { stringValue: ownerId },
    scope: { stringValue: scope },
  },
});

const signUp = async (email) => {
  const r = await req(AUTH_HOST, `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST",
    body: { email, password: "pass12345" },
  });
  return { uid: r.json?.localId, token: r.json?.idToken };
};

const A = await signUp(`a-${Date.now()}@test.local`);
const B = await signUp(`b-${Date.now()}@test.local`);
check("Auth emulator で2ユーザーを作成", !!(A.token && B.token));

const idA = `smoke-a-${RUN}`;
const idB = `smoke-b-${RUN}`;
const idPub = `smoke-pub-${RUN}`;
const fs = (method, path, token, body) => req(FS_HOST, `/v1/projects/takufu-app/databases/(default)/documents/${path}`, { method, body, token });

/* 1. 未認証の書き込みは拒否される */
let r = await fs("POST", `sessions?documentId=x1-${RUN}`, null, fields(A.uid, "members"));
check("未認証の書き込みは PERMISSION_DENIED", r.status === 403, `status=${r.status}`);

/* 2. 認証済みユーザーは自分のセッションを作成できる */
r = await fs("POST", `sessions?documentId=${idA}`, A.token, fields(A.uid, "members"));
check("認証済みは自分のセッションを作成できる", r.status === 200, `status=${r.status}`);

/* 3. 他ユーザーは他人の members セッションを更新できない */
r = await fs("PATCH", `sessions/${idA}`, B.token, { fields: { title: { stringValue: "hack" } } });
check("他人の members セッション更新は拒否", r.status === 403, `status=${r.status}`);

/* 4. 所有者は自分のセッションを更新できる */
r = await fs("PATCH", `sessions/${idA}`, A.token, { fields: { title: { stringValue: "emulator smoke (updated)" } } });
check("所有者なら更新できる", r.status === 200, `status=${r.status}`);

/* 5. 公開セッションは未認証でも読める */
await fs("POST", `sessions?documentId=${idPub}`, A.token, fields(A.uid, "public"));
r = await fs("GET", `sessions/${idPub}`, null);
check("公開セッションの作成+未認証読み取り", r.status === 200, `status=${r.status}`);

/* 6. members セッションは未認証で読めない */
r = await fs("GET", `sessions/${idA}`, null);
check("members セッションの未認証読み取りは拒否", r.status === 403, `status=${r.status}`);

/* 7. B は自分のセッションを作成・削除できる(所有者境界) */
r = await fs("POST", `sessions?documentId=${idB}`, B.token, fields(B.uid, "public"));
check("Bのセッション作成", r.status === 200, `status=${r.status}`);
r = await fs("DELETE", `sessions/${idB}`, B.token);
check("Bは自分のセッションを削除できる", r.status === 200, `status=${r.status}`);
r = await fs("DELETE", `sessions/${idPub}`, B.token);
check("他人の公開セッションは削除できない", r.status === 403, `status=${r.status}`);

console.log(results.join("\n"));
console.log(`\n${results.every((x) => x.startsWith("PASS")) ? "ALL PASS" : "FAILURES"}`);
