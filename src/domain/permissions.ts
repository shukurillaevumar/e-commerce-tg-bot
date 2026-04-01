import type { AdminRole } from "@domain/enums";

export const rolePermissionMap: Record<AdminRole, string[]> = {
  owner: ["*"],
  admin: [
    "catalog:write",
    "pricing:write",
    "orders:read",
    "orders:write",
    "users:read",
    "fraud:read",
    "support:write",
    "reports:export",
  ],
  support: ["orders:read", "support:write", "fraud:read", "fulfillment:queue:read"],
};

export function hasPermission(role: AdminRole, permissions: string[], required: string): boolean {
  if (role === "owner") {
    return true;
  }
  if (permissions.includes("*")) {
    return true;
  }
  return permissions.includes(required);
}
