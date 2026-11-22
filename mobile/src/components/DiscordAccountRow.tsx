import { useEffect, useState } from "react";
import { ProviderIcon } from "./identity";
import { SettingRow } from "./ui";
import { useMobileStore } from "../store/mobile-store";

const ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";

/**
 * 設定の「Discord」の行（見るだけ）。つなぐ・外すは Web 版の設定で行う（Discord の認可画面はブラウザで開く）。
 * つながりはサーバーだけが持つので、Web と同じ API（/api/discord/account）を ID トークン付きで読む
 */
export function DiscordAccountRow() {
  const { authUser } = useMobileStore();
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`${ORIGIN}/api/discord/account`, {
          headers: { Authorization: `Bearer ${await authUser.getIdToken()}` },
        });
        const data = (await res.json()) as {
          ok?: boolean;
          account?: { username: string; globalName: string | null } | null;
        };
        if (alive) setName(data.ok && data.account ? data.account.globalName || data.account.username : null);
      } catch {
        if (alive) setName(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authUser]);

  return (
    <SettingRow
      icon={<ProviderIcon provider="discord" size={26} />}
      title="Discord"
      desc={
        !authUser
          ? "サンプルでは連携できません"
          : name === undefined
            ? "確かめています…"
            : name || "連携は Web 版から行います"
      }
    />
  );
}
