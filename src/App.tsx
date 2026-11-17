import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/shell";
import Calendar from "./pages/Calendar";
import CharacterDetail from "./pages/CharacterDetail";
import Characters from "./pages/Characters";
import ClaimInvite from "./pages/ClaimInvite";
import Scenarios, { ScenarioDetail, ScenarioNew } from "./pages/Scenarios";
import SessionDetail from "./pages/SessionDetail";
import Sessions from "./pages/Sessions";
import Settings, { ThemeSync, UserDetail } from "./pages/Settings";
import ShareLog, { ShareChar } from "./pages/ShareLog";
import SignIn from "./pages/SignIn";
import Tables, { TableDetail } from "./pages/Tables";
import Upload from "./pages/Upload";
import { useStore } from "./store";
import { WorkspaceProvider } from "./workspace";

function RootGate() {
  const { state } = useStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/share/") || state.entered) {
    return <Outlet />;
  }
  return <SignIn />;
}

const rootRoute = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <ThemeSync />
      <WorkspaceProvider>
        <RootGate />
      </WorkspaceProvider>
    </ErrorBoundary>
  ),
});

const shareLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share/l/$slug",
  component: ShareLog,
});

const shareCharRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share/c/$id",
  component: ShareChar,
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: () => <Navigate to="/sessions" replace />,
});

const sessionsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sessions",
  component: Sessions,
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sessions/$id",
  component: SessionDetail,
});

const calendarRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/calendar",
  component: Calendar,
});

const tablesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tables",
  component: Tables,
});

const tableDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tables/$id",
  component: TableDetail,
});

const uploadRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/upload",
  component: Upload,
});

const charactersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/characters",
  component: Characters,
});

const characterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/characters/$id",
  component: CharacterDetail,
});

const scenariosRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/scenarios",
  component: Scenarios,
});

const scenarioNewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/scenarios/new",
  component: ScenarioNew,
});

const scenarioDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/scenarios/$id",
  component: ScenarioDetail,
});

const inviteRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/invite/$id",
  component: ClaimInvite,
});

const userDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users/$id",
  component: UserDetail,
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  shareLogRoute,
  shareCharRoute,
  shellRoute.addChildren([
    indexRoute,
    sessionsRoute,
    sessionDetailRoute,
    calendarRoute,
    tablesRoute,
    tableDetailRoute,
    uploadRoute,
    charactersRoute,
    characterDetailRoute,
    scenariosRoute,
    scenarioNewRoute,
    scenarioDetailRoute,
    inviteRoute,
    userDetailRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <Navigate to="/sessions" replace />,
});

export default function App() {
  return <RouterProvider router={router} />;
}
