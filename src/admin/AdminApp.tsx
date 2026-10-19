import { useEffect, useState } from "react";
import {
  ADMIN_VIEWS,
  readRouteState,
  writeRouteState,
  type AdminRouteState,
  type AdminView,
} from "./route-state";

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
      "Every generation attempt will appear here, including failures, cancellations and reruns.",
    placeholder: "Attempt data is not connected in this shell preview.",
    detail:
      "The server-side attempt ledger, filters and selected-attempt inspector connect in the next implementation step.",
  },
  clients: {
    label: "Clients",
    title: "Client directory",
    description:
      "Clients derived from verified submissions will stay linked to their invitations and complete attempt history.",
    placeholder: "Client records are not connected in this shell preview.",
    detail:
      "No client records, names, emails or site links are bundled with the admin assets.",
  },
  invitations: {
    label: "Invitations",
    title: "Private invitations",
    description:
      "Create private, single-use links and keep invitation creation attribution separate from generation initiation.",
    placeholder:
      "The invitation surface is not connected in this shell preview.",
    detail:
      "The existing Access-protected invitation route and API remain available while the workspace UI is built.",
  },
  team: {
    label: "Team",
    title: "Team and profiles",
    description:
      "Owner and admin membership will be managed here after the account flow is verified.",
    placeholder: "Team records are not connected in this shell preview.",
    detail:
      "No administrator identity, email or role is inferred by the static assets.",
  },
  integrations: {
    label: "Integrations",
    title: "Integrations",
    description:
      "Third-party connections will be described here only when they are actually available.",
    placeholder: "GoHighLevel is not connected.",
    detail:
      "Contact matching and generation milestones are planned. This preview makes no provider calls and has no active connect action.",
  },
  settings: {
    label: "Settings",
    title: "Workspace settings",
    description:
      "Profile, sign-in and workspace visibility controls will live here after accounts are connected.",
    placeholder: "Profile data is not connected in this shell preview.",
    detail:
      "No signed-in name or email is shown until the server provides a verified principal.",
  },
};

function useRouteState() {
  const [state, setState] = useState<AdminRouteState>(() =>
    readRouteState(window.location.href),
  );

  useEffect(() => {
    const onPopState = () => setState(readRouteState(window.location.href));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const copy = VIEW_COPY[state.view];
    document.title = `${copy.label} | LaunchLoom operations`;
  }, [state.view]);

  return [state, setState] as const;
}

function navigate(view: AdminView) {
  const next: AdminRouteState = {
    view,
    clientId: null,
    attemptId: null,
    filters: {},
    cursor: null,
  };
  const url = writeRouteState(next);
  window.history.pushState(null, "", `${url.pathname}${url.search}`);
  return next;
}

function WorkspaceNav({
  active,
  onChange,
}: {
  active: AdminView;
  onChange: (view: AdminView) => void;
}) {
  return (
    <nav className="admin-nav" aria-label="Workspace sections">
      {ADMIN_VIEWS.map((view) => (
        <a
          key={view}
          href={`/admin/onboarding-invites?view=${view}`}
          aria-current={view === active ? "page" : undefined}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onChange(view);
          }}
        >
          {VIEW_COPY[view].label}
        </a>
      ))}
    </nav>
  );
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
        <li>Loading, empty and error states will use real server responses.</li>
      </ul>
    </div>
  );
}

export function AdminApp() {
  const [state, setState] = useRouteState();
  const copy = VIEW_COPY[state.view];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__name">LaunchLoom</span>
          <span className="admin-brand__product">Operations workspace</span>
        </div>
        <WorkspaceNav
          active={state.view}
          onChange={(view) => setState(navigate(view))}
        />
        <p className="admin-sidebar__note">
          Shared visibility for every authorized administrator.
        </p>
      </aside>
      <main className="admin-main" id="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="admin-eyebrow">LaunchLoom operations</p>
            <h1>Operations workspace</h1>
          </div>
          <p className="admin-topbar__scope">
            All authorized admins see the same clients, invitations and
            generation attempts.
          </p>
        </header>
        <section
          className="admin-section"
          aria-labelledby="admin-view-title"
        >
          <div className="admin-section__head">
            <p className="admin-eyebrow">{copy.label}</p>
            <h2 id="admin-view-title">{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
          <SectionPlaceholder view={state.view} />
        </section>
      </main>
    </div>
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
