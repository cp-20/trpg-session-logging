import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreProvider, useStore } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/shell";
import SignIn from "./pages/SignIn";
import Sessions from "./pages/Sessions";
import SessionDetail from "./pages/SessionDetail";
import Upload from "./pages/Upload";
import Tables from "./pages/Tables";
import TableDetail from "./pages/TableDetail";
import Characters from "./pages/Characters";
import CharacterDetail from "./pages/CharacterDetail";
import Scenarios from "./pages/Scenarios";
import ScenarioDetail from "./pages/ScenarioDetail";
import ScenarioNew from "./pages/ScenarioNew";
import UserDetail from "./pages/UserDetail";
import Settings from "./pages/Settings";
import ShareLog from "./pages/ShareLog";
import ShareChar from "./pages/ShareChar";
import ClaimInvite from "./pages/ClaimInvite";

function Root() {
  const { state } = useStore();
  if (!state.entered) return <SignIn />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/sessions" replace />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="sessions/:id" element={<SessionDetail />} />
        <Route path="tables" element={<Tables />} />
        <Route path="tables/:id" element={<TableDetail />} />
        <Route path="upload" element={<Upload />} />
        <Route path="characters" element={<Characters />} />
        <Route path="characters/:id" element={<CharacterDetail />} />
        <Route path="scenarios" element={<Scenarios />} />
        <Route path="scenarios/new" element={<ScenarioNew />} />
        <Route path="scenarios/:id" element={<ScenarioDetail />} />
        <Route path="invite/:id" element={<ClaimInvite />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* 共有ビューは未サインインでも開ける公開ページ */}
          <Route path="/share/l/:slug" element={<ShareLog />} />
          <Route path="/share/c/:id" element={<ShareChar />} />
          <Route path="*" element={<Root />} />
        </Routes>
      </HashRouter>
    </StoreProvider>
    </ErrorBoundary>
  );
}
