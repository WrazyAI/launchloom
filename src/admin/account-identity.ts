import type { WorkspacePrincipal } from "./api";

export function accountInitials(principal: WorkspacePrincipal): string {
  if (principal.authSource === "neon" && principal.initials)
    return principal.initials;
  const source = principal.displayName?.trim() || principal.email.split("@")[0];
  return (
    source
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => [...part][0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}
