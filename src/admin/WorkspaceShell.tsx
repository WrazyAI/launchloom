import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import { BrandMark } from "./BrandMark";
import { ADMIN_VIEWS, type AdminView } from "./route-state";

const VIEW_LABELS: Record<AdminView, string> = {
  generations: "Generations",
  clients: "Clients",
  invitations: "Invitations",
  team: "Team",
  integrations: "Integrations",
  settings: "Settings",
};

const VIEW_ICONS: Record<AdminView, AdminIconName> = {
  generations: "generations",
  clients: "clients",
  invitations: "invitations",
  team: "team",
  integrations: "integrations",
  settings: "settings",
};

const MOBILE_QUERY = "(max-width: 900px)";

export function WorkspaceNav({
  active,
  onNavigate,
  onNavigateComplete,
  navRef,
}: {
  active: AdminView;
  onNavigate: (view: AdminView) => void;
  onNavigateComplete?: () => void;
  navRef?: RefObject<HTMLElement | null>;
}) {
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
          aria-label={VIEW_LABELS[view]}
          title={VIEW_LABELS[view]}
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
            onNavigateComplete?.();
          }}
        >
          <AdminIcon name={VIEW_ICONS[view]} className="admin-nav__icon" />
          <span className="admin-nav__label">{VIEW_LABELS[view]}</span>
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(MOBILE_QUERY).matches,
  );
  const navRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => {
      setMobile(query.matches);
      if (!query.matches) setMobileOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      navRef.current?.querySelector<HTMLElement>("a")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
  }

  function navigate(view: AdminView) {
    onNavigate(view);
    closeMobile();
  }

  return (
    <div
      className={`admin-shell${collapsed && !mobile ? " admin-shell--collapsed" : ""}${mobileOpen ? " admin-shell--rail-open" : ""}`}
    >
      <a className="admin-skip" href="#admin-main">
        Skip to main content
      </a>
      <button
        className="admin-rail-scrim"
        type="button"
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={closeMobile}
      />
      <aside className="admin-sidebar" aria-label="LaunchLoom workspace">
        <div className="admin-sidebar__head">
          <a
            className="admin-brand"
            href="/admin/onboarding-invites?view=generations"
            aria-label="LaunchLoom operations home"
          >
            <BrandMark compact={collapsed && !mobile} />
          </a>
          <button
            className="admin-rail-toggle"
            type="button"
            aria-label={
              mobile
                ? "Close navigation"
                : collapsed
                  ? "Expand sidebar"
                  : "Collapse sidebar"
            }
            aria-expanded={mobile ? mobileOpen : !collapsed}
            onClick={() => {
              if (mobile) {
                closeMobile();
                menuButtonRef.current?.focus();
              } else {
                setCollapsed((value) => !value);
              }
            }}
          >
            <AdminIcon name="panel" />
          </button>
        </div>

        <WorkspaceNav
          active={active}
          onNavigate={navigate}
          onNavigateComplete={closeMobile}
          navRef={navRef}
        />

        <div className="admin-sidebar__spacer" />
        <p className="admin-sidebar__note">
          Every admin sees the same clients and generation history.
        </p>
        <div className="admin-sidebar__account">
          <span className="admin-avatar admin-avatar--lime" aria-hidden="true">
            LL
          </span>
          <span className="admin-sidebar__account-copy">
            <strong>Workspace account</strong>
            <span>All authorized admins</span>
          </span>
        </div>
      </aside>

      <main
        className="admin-main"
        id="admin-main"
        tabIndex={-1}
        aria-label={`${eyebrow} view`}
      >
        <header className="admin-topbar">
          <div className="admin-topbar__heading">
            <button
              ref={menuButtonRef}
              className="admin-mobile-menu"
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <AdminIcon name="menu" />
            </button>
            <div>
              <p className="admin-eyebrow">LaunchLoom operations</p>
              <h1 id={titleId} tabIndex={-1}>
                {title}
              </h1>
              {description ? (
                <p className="admin-topbar__description">{description}</p>
              ) : null}
            </div>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
