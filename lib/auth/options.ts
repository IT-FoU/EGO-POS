import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { isDemoMode } from "@/lib/demo-mode";
import { readDemoStaffFromCookieHeader, verifyDemoStaffPassword } from "@/lib/auth/demo-staff-access";
import { authenticateMerchantUser, verifyMerchantSecret } from "@/lib/auth/merchant-login";
import { normalizeLocale } from "@/lib/i18n/locale";

const demoLoginUsers = [
  {
    activeBranchId: "gobox-main-branch",
    activeCompanyId: "gobox-company",
    activeCompanyName: "GO BOX",
    activeWarehouseId: "gobox-default-warehouse",
    email: "owner@igopos.local",
    id: "demo-owner-login",
    name: "EGO Store Owner",
    password: "AdminChangeMe123!",
    roles: ["Owner"],
    username: "igo-admin",
  },
  {
    activeBranchId: "gobox-main-branch",
    activeCompanyId: "gobox-company",
    activeCompanyName: "GO BOX",
    activeWarehouseId: "gobox-default-warehouse",
    email: "manager@igopos.local",
    id: "demo-manager-login",
    name: "EGO Store Manager",
    password: "Manager123!",
    roles: ["Manager"],
    username: "manager",
  },
  {
    activeBranchId: "gobox-main-branch",
    activeCompanyId: "gobox-company",
    activeCompanyName: "GO BOX",
    activeWarehouseId: "gobox-default-warehouse",
    email: "cashier@igopos.local",
    id: "demo-cashier-login",
    name: "EGO Store Cashier",
    password: "Cashier123!",
    roles: ["Cashier"],
    username: "cashier",
  },
] as const;

const DEMO_LOGIN_USER_IDS: Record<string, string> = {
  "demo-cashier-login": "cashier",
  "demo-manager-login": "manager",
  "demo-owner-login": "igo-admin",
};

async function buildSessionUserFromDatabase(user: {
  companies: Array<{
    allowBackOfficeAccess: boolean;
    allowPosAccess: boolean;
    assignedTerminal: string | null;
    branchId: string | null;
    company: { businessTemplateKey: string; id: string; name: string };
    isOwner: boolean;
  }>;
  email: string | null;
  fullName: string;
  id: string;
  preferredLocale: string;
  roles: Array<{ companyId: string | null; role: { name: string } }>;
  username: string;
}) {
  const membership = user.companies[0];
  const activeCompany = membership?.company;
  if (!membership || !activeCompany) {
    return null;
  }

  if (!membership.allowPosAccess && !membership.allowBackOfficeAccess) {
    throw new Error("UserDisabled");
  }

  const activeBranch = membership.branchId
    ? await prisma.branch.findFirst({
        where: { companyId: activeCompany.id, id: membership.branchId },
      })
    : await prisma.branch.findFirst({
        orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
        where: { companyId: activeCompany.id },
      });
  const activeWarehouse = activeBranch
    ? await prisma.warehouse.findFirst({
        orderBy: { createdAt: "asc" },
        where: { branchId: activeBranch.id, companyId: activeCompany.id },
      })
    : null;

  const companyRoles = user.roles.filter((entry) => entry.companyId === activeCompany.id);

  return {
    id: user.id,
    name: user.fullName,
    email: user.email ?? `${user.username}@local`,
    username: user.username,
    activeBranchId: activeBranch?.id,
    activeWarehouseId: activeWarehouse?.id,
    activeCompanyId: activeCompany.id,
    activeCompanyName: activeCompany.name,
    businessTemplateKey: activeCompany.businessTemplateKey,
    locale: normalizeLocale(user.preferredLocale),
    roles: membership.isOwner ? ["Owner"] : companyRoles.map((entry) => entry.role.name),
    allowPOSAccess: membership.allowPosAccess,
    allowBackOfficeAccess: membership.allowBackOfficeAccess,
    assignedTerminal: membership.assignedTerminal ?? "POS-01",
  };
}

async function authorizeDemoUser(username: string, password: string, cookieHeader?: string | null) {
  if (!isDemoMode()) {
    return null;
  }

  const staffUsers = readDemoStaffFromCookieHeader(cookieHeader);
  const staffUser = staffUsers.find((user) => user.username.toLowerCase() === username.toLowerCase());
  if (staffUser) {
    if (staffUser.status !== "Active") {
      throw new Error("UserDisabled");
    }
    if (!staffUser.allowPosAccess && !staffUser.allowBackOfficeAccess) {
      throw new Error("UserDisabled");
    }
    const passwordMatches = await verifyDemoStaffPassword(staffUser, password);
    if (!passwordMatches) {
      return false;
    }
    return {
      id: staffUser.id,
      name: staffUser.fullName,
      email: `${staffUser.username}@demo.local`,
      username: staffUser.username,
      activeBranchId: "gobox-main-branch",
      activeWarehouseId: "gobox-default-warehouse",
      activeCompanyId: "gobox-company",
      activeCompanyName: "GO BOX",
      locale: "en",
      roles: [staffUser.role],
      allowPOSAccess: staffUser.allowPosAccess,
      allowBackOfficeAccess: staffUser.allowBackOfficeAccess,
      assignedTerminal: staffUser.assignedTerminal,
    };
  }

  const demoUser = demoLoginUsers.find((user) => {
    if (username.includes("@")) {
      return user.email === username && user.roles[0] === "Owner";
    }
    return user.username.toLowerCase() === username.toLowerCase();
  });
  if (!demoUser) {
    return null;
  }

  const storedUser = await prisma.user.findFirst({
    where: { username: demoUser.username },
    include: {
      companies: {
        include: { company: true },
        where: { status: "active" },
        orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
      },
      roles: {
        include: { role: true },
      },
    },
  });

  if (storedUser) {
    const valid = await verifyMerchantSecret(storedUser, password);
    if (!valid) {
      return false;
    }
    return buildSessionUserFromDatabase(storedUser);
  }

  if (demoUser.password !== password) {
    return false;
  }

  return {
    id: demoUser.id,
    name: demoUser.name,
    email: demoUser.email,
    username: demoUser.username,
    activeBranchId: demoUser.activeBranchId,
    activeWarehouseId: demoUser.activeWarehouseId,
    activeCompanyId: demoUser.activeCompanyId,
    activeCompanyName: demoUser.activeCompanyName,
    locale: "en",
    roles: [...demoUser.roles],
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Username and Password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;

        if (!username || !password) {
          return null;
        }

        const demoUser = await authorizeDemoUser(username, password, request?.headers?.cookie);
        if (demoUser) {
          return demoUser;
        }
        if (demoUser === false) {
          return null;
        }

        let user;
        try {
          user = await authenticateMerchantUser(username, password);
        } catch (error) {
          if (error instanceof Error && error.message === "UserDisabled") {
            throw error;
          }
          return null;
        }

        if (!user) {
          return null;
        }

        return buildSessionUserFromDatabase(user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = user.username;
        token.activeBranchId = user.activeBranchId;
        token.activeWarehouseId = user.activeWarehouseId;
        token.activeCompanyId = user.activeCompanyId;
        token.activeCompanyName = user.activeCompanyName;
        token.businessTemplateKey = user.businessTemplateKey;
        token.locale = user.locale;
        token.roles = user.roles;
        token.allowPOSAccess = user.allowPOSAccess ?? true;
        token.allowBackOfficeAccess = user.allowBackOfficeAccess ?? true;
        token.assignedTerminal = user.assignedTerminal;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.username = token.username;
        session.user.activeBranchId = token.activeBranchId;
        session.user.activeWarehouseId = token.activeWarehouseId;
        session.user.activeCompanyId = token.activeCompanyId;
        session.user.activeCompanyName = token.activeCompanyName;
        session.user.businessTemplateKey = token.businessTemplateKey;
        session.user.locale = token.locale;
        session.user.roles = token.roles;
        session.user.allowPOSAccess = token.allowPOSAccess;
        session.user.allowBackOfficeAccess = token.allowBackOfficeAccess;
        session.user.assignedTerminal = token.assignedTerminal;
      }

      return session;
    },
  },
};
