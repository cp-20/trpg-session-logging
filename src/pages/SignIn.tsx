import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, Modal, ProviderIcon, PROVIDER_LABEL } from "../components/ui";
import type { Provider } from "../types";
import { todayStr, uid } from "../lib/time";

const DEMO_USERS = ["u_mikan", "u_sora", "u_kai", "u_hina", "u_rin"];

export default function SignIn() {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [pick, setPick] = useState<Provider | null>(null);

  function enter(userId: string, provider: Provider | null) {
    update((s) => {
      s.me = userId;
      s.entered = true;
      if (provider) {
        const u = s.users[userId];
        const ex = u.accounts.find((a) => a.provider === provider);
        if (ex) {
          ex.status = "linked";
          ex.externalId = `${provider.slice(0, 2)}_${uid()}`;
          ex.verifiedAt = todayStr();
        } else {
          u.accounts.push({ provider, status: "linked", externalId: `${provider.slice(0, 2)}_${uid()}`, verifiedAt: todayStr() });
        }
      }
    });
    toast(`${state.users[userId].name} として入りました${provider ? `（${PROVIDER_LABEL[provider]}連携）` : ""}`);
    nav("/sessions");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-base-200 to-primary/10">
      <div className="w-full max-w-sm bg-base-100 border border-base-300 rounded-3xl shadow-lg px-8 py-9">
        <div className="text-4xl text-center display">譜</div>
        <h1 className="text-center text-3xl font-extrabold mt-2 tracking-tight">卓譜</h1>
        <p className="text-center text-[13px] text-ink2 mt-2 leading-6">
          TRPGのセッション・キャラクター・シナリオを
          <br />
          つなげて残す。
        </p>
        <div className="mt-6 space-y-2.5">
          {(["google", "discord", "x"] as Provider[]).map((p) => (
            <button key={p} className="btn btn-bordered w-full justify-start gap-3 bg-base-100 hover:bg-base-200 border-base-300 font-semibold" onClick={() => setPick(p)}>
              <ProviderIcon provider={p} size={19} />
              {PROVIDER_LABEL[p]} でサインイン
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink2 mt-4 text-center leading-5">
          サインインするとセッションを記録できます。
          <br />
          利用規約・プライバシーポリシー（モック）
        </p>
        <button className="btn btn-ghost btn-sm w-full mt-2" onClick={() => enter("u_mikan", null)}>
          → サンプルデータをそのまま見る（デモ）
        </button>
      </div>

      {pick && (
        <Modal title={`${PROVIDER_LABEL[pick]} でサインイン（モック）`} onClose={() => setPick(null)}>
          <div className="flex items-center gap-2 mb-3 text-[12px] text-ink2">
            <ProviderIcon provider={pick} size={16} />
            卓譜 への接続を許可しますか？
          </div>
          <p className="text-[11px] text-ink2 mb-2">デモ用アカウントを選択してください（実際のOAuth同意画面の代わり）。</p>
          {DEMO_USERS.map((id) => {
            const u = state.users[id];
            return (
              <button key={id} className="flex items-center gap-3 w-full px-2 py-2.5 rounded-xl hover:bg-base-200 text-left border-b border-base-200 last:border-0" onClick={() => { setPick(null); enter(id, pick); }}>
                <Avatar u={u} size={30} />
                <span className="grow">
                  <b className="text-[13.5px]">{u.name}</b>
                  <div className="text-[10.5px] text-ink2">{id.replace("u_", "").toLowerCase()}@example.com</div>
                </span>
                <span className="text-[11px] text-ink2">続行 →</span>
              </button>
            );
          })}
          <p className="text-[11px] text-ink2 mt-3">要求スコープ: 識別のみ。卓譜は投稿・フォローを行いません。</p>
        </Modal>
      )}
    </div>
  );
}
