export const NAV_ITEMS = [
  { href: "/dashboard", label: "Command Center", writerOnly: false },
  { href: "/notifications", label: "Attention", writerOnly: false },
  { href: "/opportunities", label: "Client journey", writerOnly: false },
  { href: "/reporting", label: "Reporting", writerOnly: false },
  { href: "/leads", label: "Leads", writerOnly: false },
  { href: "/leads/import", label: "Import leads", writerOnly: true },
  { href: "/reconciliation", label: "Lead review", writerOnly: false },
  { href: "/settings", label: "Settings", writerOnly: false },
] as const;

export function navItemsForAccess(canWrite: boolean) {
  return NAV_ITEMS.filter((item) => canWrite || !item.writerOnly);
}

const ACTIONABLE_ATTENTION = new Set(["needs", "today", "waiting_client", "waiting_recruitment", "at_risk"]);

export function attentionBadgeCount(items: Array<{ sections: readonly string[] }>) {
  return items.filter((item) => item.sections.some((section) => ACTIONABLE_ATTENTION.has(section))).length;
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/leads") {
    return pathname === "/leads" || (pathname.startsWith("/leads/") && !pathname.startsWith("/leads/import"));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
