export type AdminIconName =
  | "operations"
  | "history"
  | "generations"
  | "clients"
  | "invitations"
  | "team"
  | "integrations"
  | "settings"
  | "menu"
  | "panel"
  | "search"
  | "filters"
  | "plus"
  | "close";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function AdminIcon({
  name,
  className,
}: {
  name: AdminIconName;
  className?: string;
}) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true, className };
  switch (name) {
    case "operations":
      return (
        <svg {...common} {...STROKE}>
          <path d="M3.5 12h3.2l2.1-5.2 3.4 10.4 2.2-6.2 1.4 3h4.7" />
          <circle cx="12" cy="12" r="8.6" opacity=".35" />
        </svg>
      );
    case "history":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4.2 10.2A8 8 0 1 1 6 17.1" />
          <path d="M4.2 5.4v4.8h4.8M12 8v4.4l2.9 1.8" />
        </svg>
      );
    case "generations":
      return (
        <svg {...common} {...STROKE}>
          <path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5Z" />
          <path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5" />
        </svg>
      );
    case "clients":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.8 19c.4-3.2 2.4-5 5.2-5s4.8 1.8 5.2 5M16 5.5h4M18 3.5v4M16 18.5h4" />
        </svg>
      );
    case "invitations":
      return (
        <svg {...common} {...STROKE}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <path d="m4.5 7 7.5 5 7.5-5" />
        </svg>
      );
    case "team":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="8" cy="8.5" r="2.8" />
          <circle cx="16.5" cy="9.5" r="2.2" />
          <path d="M3.5 19c.4-3 2.1-4.7 4.5-4.7s4.1 1.7 4.5 4.7M13.8 18.7c.2-2.3 1.4-3.7 3.1-3.7 1.6 0 2.8 1.2 3.1 3.2" />
        </svg>
      );
    case "integrations":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9.8 14.2 8.2 15.8a3.4 3.4 0 0 1-4.8-4.8l3-3a3.4 3.4 0 0 1 4.8 0M14.2 9.8l1.6-1.6a3.4 3.4 0 0 1 4.8 4.8l-3 3a3.4 3.4 0 0 1-4.8 0M8.8 15.2l6.4-6.4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="1.8" fill="currentColor" />
          <circle cx="15" cy="12" r="1.8" fill="currentColor" />
          <circle cx="10" cy="18" r="1.8" fill="currentColor" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "panel":
      return (
        <svg {...common} {...STROKE}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M9 4.5v15M14 9l-3 3 3 3" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="10.8" cy="10.8" r="6.2" />
          <path d="m15.4 15.4 4.2 4.2" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common} {...STROKE}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "close":
      return (
        <svg {...common} {...STROKE}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
  }
}
