import { useEffect, useState } from "react";
import { createAdminApi } from "./api";
import { ClientsView } from "./ClientsView";
import { GenerationsView } from "./GenerationsView";
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
  {
    label: string;
    title: string;
    description: string;
    placeholder: string;
    detail: string;
  }
> = {
  generations: {
    label: "Generations",
    title: "Generation history",
    description:
      "Every recorded generation attempt across the shared workspace, including failures, cancellations and reruns.",
    placeholder: "",
    detail: "",
  },
  clients: {
    label: "Clients",
    title: "Client directory",
    description:
      "Accepted clients stay linked to their invitations, verified details and complete attempt history.",
    placeholder: "",
    detail: "",
  },
  invitations: {
    label: "Invitations",
    title: "Private invitations",
    description:
      "Create private, single-use links and keep invitation creation attribution separate from generation initiation.",
    placeholder:
      "The invitation surface is not connected in this workspace step.",
    detail:
      "The existing Access-protected invitation route and API remain available while the workspace UI is built.",
  },
  team: {
    label: "Team",
    title: "Team and profiles",
    description:
      "Owner and admin membership will be managed here after the account flow is verified.",
    placeholder: "Team records are not connected in this workspace step.",
    detail:
      "No administrator identity, email or role is inferred by the static assets.",
  },
  integrations: {
    label: "Integrations",
    title: "Integrations",
    description:
      "Third-party connections will be described here only when they are actually available.",
    placeholder: "",
    detail: "",
  },
  settings: {
    label: "Settings",
    title: "Workspace settings",
    description:
      "Profile, sign-in and workspace visibility controls will live here after accounts are connected.",
    placeholder: "Profile data is not connected in this workspace step.",
    detail:
      "No signed-in name or email is shown until the server provides a verified principal.",
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

function IntegrationsPlaceholder() {
  return (
    <div className="admin-integration" role="status">
      <div className="admin-integration__head">
        <div>
          <p className="admin-eyebrow">GoHighLevel</p>
          <h3>Contact matching and milestones</h3>
        </div>
        <span className="admin-status-pill">Not connected</span>
      </div>
      <p>
        A future integration will describe contact matching and generation
        milestones. It is not connected today, and this workspace makes no
        third-party requests.
      </p>
      <button type="button" disabled>
        Connection coming later
      </button>
      <p className="admin-muted">
        Status: <strong>Planned</strong>. No credentials, sync timestamps or
        provider actions are present.
      </p>
    </div>
  );
}

function SectionPlaceholder({ view }: { view: AdminView }) {
  const copy = VIEW_COPY[view];
  if (view === "integrations") return <IntegrationsPlaceholder />;
  return (
    <div className="admin-placeholder" role="status">
      <p className="admin-eyebrow">Data connection pending</p>
      <h3>{copy.placeholder}</h3>
      <p>{copy.detail}</p>
      <ul>
        <li>This page contains no client records.</li>
        <li>There are no invented counts, costs or activity totals.</li>
        <li>Loading, empty and error states use real server responses.</li>
      </ul>
    </div>
  );
}

export function AdminApp() {
  const [state, setState, cursorTrail, setCursorTrail] = useRouteState();
  const [api] = useState(createAdminApi);
  const copy = VIEW_COPY[state.view];

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
      ) : (
        <SectionPlaceholder view={state.view} />
      )}
    </WorkspaceShell>
  );
}

export function AdminLoginPlaceholder() {
  useEffect(() => {
    document.title = "Sign in | LaunchLoom";
  }, []);

  return (
    <main className="admin-auth">
      <div className="admin-auth__card">
        <p className="admin-eyebrow">LaunchLoom</p>
        <h1>LaunchLoom admin</h1>
        <p>Sign in with your approved admin account.</p>
        <p className="admin-auth__note">
          Account sign-in is not enabled in this shell preview. The public admin
          assets contain no account or client data.
        </p>
      </div>
    </main>
  );
}
