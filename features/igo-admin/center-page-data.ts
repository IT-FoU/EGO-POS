import {
  getAdminAuditLogs,
  getAdminBusinesses,
  getAdminPlatformUsersCount,
  getAdminPlatformAuditLogs,
  getAdminPlans,
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
  const [businesses, users, auditLogs, platformAuditLogs, storeActivityLogs, plans, subscriptions, platformUsersCount] = await Promise.all([
    getAdminBusinesses(role),
    getAdminUsers(),
    getAdminAuditLogs(),
    getAdminPlatformAuditLogs(role),
    getAdminStoreActivityLogs(role),
    getAdminPlans(),
    getAdminSubscriptions(),
    getAdminPlatformUsersCount(),
  ]);

  return serializable({ auditLogs, businesses, currentPlatformUser, platformAuditLogs, platformUsersCount, plans, storeActivityLogs, subscriptions, users });
}
