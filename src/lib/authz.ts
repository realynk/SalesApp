export const USER_ROLES = ["sales_lead", "recruiter", "member", "executive"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CRM_WRITE_DENIED = "View-only accounts cannot change this workspace.";

export function isUserRole(value: string | null | undefined): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function canWriteCrm(role: string | null | undefined) {
  return role === "sales_lead";
}

export function canManageWorkspace(role: string | null | undefined) {
  return role === "sales_lead";
}

export function authorizeCrmWrite(role: string | null | undefined): { ok: true } | { ok: false; error: string } {
  if (!canWriteCrm(role)) return { ok: false, error: CRM_WRITE_DENIED };
  return { ok: true };
}
