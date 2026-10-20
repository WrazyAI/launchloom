import { useEffect, useState } from "react";
import { ADMIN_UNAUTHORIZED_EVENT, createAdminApi } from "./api";
import { ClientsView } from "./ClientsView";
import { GenerationsView } from "./GenerationsView";
import { IntegrationsView } from "./IntegrationsView";
import { InvitationsView } from "./InvitationsView";
import { ProfileView } from "./ProfileView";
import { TeamView } from "./TeamView";
import { WorkspaceShell } from "./WorkspaceShell";
import {
  readRouteState,
  writeRouteState,
  type AdminRouteState,
  type AdminView,
} from "./route-state";

const DEFAULT_STATE: AdminRouteState = {
  view: "generations",
  clientId: null,
  attemptId: null,
  filters: {},
  cursor: null,
};

type NavigateOptions = { cursorTrail?: string[] };

function readHistoryCursorTrail(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const trail = (value as { cursorTrail?: unknown }).cursorTrail;
  if (!Array.isArray(trail)) return [];
  return trail
    .filter(
      (cursor): cursor is string =>
        typeof cursor === "string" && cursor.length <= 500,
    )
    .slice(-50);
}

const VIEW_COPY: Record<
  AdminView,
  { label: string; title: string; description: string }
> = {
  generations: {
    label: "Generations",
    title: "Generation history",
    description:
      "Every recorded generation attempt across the shared workspace, including failures, cancellations and reruns.",
  },
  clients: {
    label: "Clients",
    title: "Client directory",
    description:
      "Accepted clients stay linked to their invitations, verified details and complete attempt history.",
  },
  invitations: {
    label: "Invitations",
    title: "Private invitations",
    description:
      "Create private, single-use links and keep invitation creation attribution separate from generation initiation.",
  },
  team: {
    label: "Team",
    title: "Team and profiles",
    description:
      "Owners manage workspace membership and roles. Admins can review the same shared records and edit their own profile.",
  },
  integrations: {
    label: "Integrations",
    title: "Integrations",
    description:
      "Third-party connections are described here only when they are actually available.",
  },
  settings: {
    label: "Settings",
    title: "Workspace settings",
    description:
      "Your verified account profile, role and sign-in controls for this workspace.",
  },
};

function useRouteState() {
  const [state, setState] = useState<AdminRouteState>(() =>
    readRouteState(window.location.href),
  );
  const [cursorTrail, setCursorTrail] = useState<string[]>(() =>
    readHistoryCursorTrail(window.history.state),
  );

  useEffect(() => {
    const onPopState = () => {
      setState(readRouteState(window.location.href));
      setCursorTrail(readHistoryCursorTrail(window.history.state));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = `${VIEW_COPY[state.view].label} | LaunchLoom operations`;
  }, [state.view]);

  return [state, setState, cursorTrail, setCursorTrail] as const;
}

export function AdminApp() {
  const [state, setState, cursorTrail, setCursorTrail] = useRouteState();
  const [api] = useState(createAdminApi);
  const copy = VIEW_COPY[state.view];

  useEffect(() => {
    const onUnauthorized = () => {
      if (window.location.pathname.startsWith("/admin/login")) return;
      const login = new URL("/admin/login", window.location.origin);
      login.searchParams.set(
        "returnTo",
        `${window.location.pathname}${window.location.search}`,
      );
      window.location.assign(`${login.pathname}${login.search}`);
    };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () =>
      window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  function commit(next: AdminRouteState, options: NavigateOptions = {}) {
    const trail = options.cursorTrail ?? cursorTrail;
    const url = writeRouteState(next);
    window.history.pushState(
      { cursorTrail: trail },
      "",
      `${url.pathname}${url.search}`,
    );
    setCursorTrail(trail);
    setState(next);
  }

  function selectView(view: AdminView) {
    if (view === state.view) return;
    commit(
      {
        ...DEFAULT_STATE,
        view,
      },
      { cursorTrail: [] },
    );
  }

  return (
    <WorkspaceShell
      active={state.view}
      onNavigate={selectView}
      eyebrow={copy.label}
      title={copy.title}
      description={copy.description}
    >
      {state.view === "generations" ? (
        <GenerationsView
          api={api}
          state={state}
          cursorTrail={cursorTrail}
          onNavigate={commit}
        />
      ) : state.view === "clients" ? (
        <ClientsView
          api={api}
          state={state}
          cursorTrail={cursorTrail}
          onNavigate={commit}
        />
      ) : state.view === "invitations" ? (
        <InvitationsView api={api} />
      ) : state.view === "team" ? (
        <TeamView api={api} />
      ) : state.view === "integrations" ? (
        <IntegrationsView />
      ) : (
        <ProfileView api={api} />
      )}
    </WorkspaceShell>
  );
}
