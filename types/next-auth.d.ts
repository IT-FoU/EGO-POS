import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    username: string;
    activeBranchId?: string;
    activeWarehouseId?: string;
    activeCompanyId?: string;
    activeCompanyName?: string;
    businessTemplateKey?: string;
    allowBackOfficeAccess?: boolean;
    allowPOSAccess?: boolean;
    assignedTerminal?: string;
    locale: string;
    roles: string[];
  }

  interface Session {
    user: {
      id: string;
      username?: string;
      activeBranchId?: string;
      activeWarehouseId?: string;
      activeCompanyId?: string;
      activeCompanyName?: string;
      businessTemplateKey?: string;
      allowBackOfficeAccess?: boolean;
      allowPOSAccess?: boolean;
      assignedTerminal?: string;
      locale?: string;
      roles?: string[];
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    activeBranchId?: string;
    activeWarehouseId?: string;
    activeCompanyId?: string;
    activeCompanyName?: string;
    businessTemplateKey?: string;
    allowBackOfficeAccess?: boolean;
    allowPOSAccess?: boolean;
    assignedTerminal?: string;
    locale?: string;
    roles?: string[];
  }
}
