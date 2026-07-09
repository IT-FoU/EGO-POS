import {
  getAdminAuditLogs,
  getAdminBusinesses,
  getAdminCommandDashboardData,
  getAdminPlatformUsersCount,
  getAdminPlatformAuditLogs,
  getAdminPlans,
  getAdminRoles,
  getAdminSubscriptions,
  getAdminStoreActivityLogs,
  getAdminUsers,
} from "@/features/igo-admin/admin-data";
import { getCurrentPlatformUser } from "@/lib/auth/platform-user";

function serializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function getEgoPosCenterPageData() {
  const currentPlatformUser = await getCurrentPlatformUser();
  const role = currentPlatformUser?.role;
  const [businesses, users, roles, auditLogs, platformAuditLogs, storeActivityLogs, plans, subscriptions, platformUsersCount, commandDashboard] = await Promise.all([
    getAdminBusinesses(role),
    getAdminUsers(),
    getAdminRoles(),
    getAdminAuditLogs(),
    getAdminPlatformAuditLogs(role),
    getAdminStoreActivityLogs(role),
    getAdminPlans(),
    getAdminSubscriptions(),
    getAdminPlatformUsersCount(),
    getAdminCommandDashboardData(),
  ]);

  return serializable({ auditLogs, businesses, commandDashboard, currentPlatformUser, platformAuditLogs, platformUsersCount, plans, roles, storeActivityLogs, subscriptions, users });
}
