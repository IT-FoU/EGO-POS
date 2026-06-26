const LEGACY_PREFIX = "/igo-admin";

const LEGACY_ROUTE_MAP: Record<string, string> = {
  "/igo-admin": "/super-admin",
  "/igo-admin/audit-logs": "/super-admin/audit-logs",
  "/igo-admin/businesses": "/super-admin/businesses",
  "/igo-admin/login": "/super-admin/login",
  "/igo-admin/subscriptions": "/super-admin/subscriptions",
  "/igo-admin/users": "/super-admin/users",
};

export function mapLegacyIgoAdminPath(pathname: string) {
  if (pathname in LEGACY_ROUTE_MAP) {
    return LEGACY_ROUTE_MAP[pathname];
  }

  if (pathname.startsWith(`${LEGACY_PREFIX}/`)) {
    return `/super-admin${pathname.slice(LEGACY_PREFIX.length)}`;
  }

  return "/super-admin";
}
