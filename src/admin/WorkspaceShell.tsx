import { useEffect, useRef, type ReactNode } from "react";
import {
  ADMIN_VIEWS,
  type AdminView,
} from "./route-state";

const VIEW_LABELS: Record<AdminView, string> = {
  generations: "Generations",
  clients: "Clients",
  invitations: "Invitations",
  team: "Team",
  integrations: "Integrations",
  settings: "Settings",
};

export function WorkspaceNav({
  active,
  onNavigate,
}: {
  active: AdminView;
  onNavigate: (view: AdminView) => void;
}) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const left = current.offsetLeft;
    const right = left + current.offsetWidth;
    if (left < nav.scrollLeft) nav.scrollLeft = left;
    else if (right > nav.scrollLeft + nav.clientWidth)
      nav.scrollLeft = right - nav.clientWidth;
  }, [active]);

  return (
    <nav
      className="admin-nav"
      aria-label="Workspace sections"
      ref={navRef}
    >
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
            onNavigate(view);
          }}
        >
          {VIEW_LABELS[view]}
        </a>
      ))}
    </nav>
  );
}

export function WorkspaceShell({
  active,
  onNavigate,
  eyebrow,
  title,
  description,
  titleId = "admin-view-title",
  children,
}: {
  active: AdminView;
  onNavigate: (view: AdminView) => void;
  eyebrow: string;
  title: string;
  description: string;
  titleId?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-main">
        Skip to main content
      </a>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__name">LaunchLoom</span>
          <span className="admin-brand__product">Operations workspace</span>
        </div>
        <WorkspaceNav active={active} onNavigate={onNavigate} />
        <div className="admin-sidebar__identity">
          <span className="admin-sidebar__identity-mark" aria-hidden="true">
            LL
          </span>
          <span>
            <strong>Shared workspace</strong>
            <span>All authorized admins see the same records.</span>
          </span>
        </div>
      </aside>
      <main className="admin-main" id="admin-main" tabIndex={-1}>
        <header className="admin-topbar">
          <div>
            <p className="admin-eyebrow">LaunchLoom operations</p>
            <h1>Operations workspace</h1>
          </div>
          <p className="admin-topbar__scope">
            Execution, delivery and attribution stay separate in every view.
          </p>
        </header>
        <section className="admin-section" aria-labelledby={titleId}>
          <div className="admin-section__head">
            <p className="admin-eyebrow">{eyebrow}</p>
            <h2 id={titleId} tabIndex={-1}>
              {title}
            </h2>
            <p>{description}</p>
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}
