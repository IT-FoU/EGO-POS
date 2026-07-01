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
  const [businesses, users, auditLogs, platformAuditLogs, storeActivityLogs, plans, subscriptions, platformUsersCount, currentPlatformUser] = await Promise.all([
    getAdminBusinesses(),
    getAdminUsers(),
    getAdminAuditLogs(),
    getAdminPlatformAuditLogs(),
    getAdminStoreActivityLogs(),
    getAdminPlans(),
    getAdminSubscriptions(),
    getAdminPlatformUsersCount(),
    getCurrentPlatformUser(),
  ]);

  return serializable({ auditLogs, businesses, currentPlatformUser, platformAuditLogs, platformUsersCount, plans, storeActivityLogs, subscriptions, users });
}
