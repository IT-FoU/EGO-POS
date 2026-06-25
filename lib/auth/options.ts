import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { isDemoMode } from "@/lib/demo-mode";
import { readDemoStaffFromCookieHeader, verifyDemoStaffPassword } from "@/lib/auth/demo-staff-access";

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
    company: { id: string; name: string };
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
    locale: user.preferredLocale,
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
      locale: "lo",
      roles: [staffUser.role],
      allowPOSAccess: staffUser.allowPosAccess,
      allowBackOfficeAccess: staffUser.allowBackOfficeAccess,
      assignedTerminal: staffUser.assignedTerminal,
    };
  }

  const demoUser = demoLoginUsers.find((user) => user.username === username || user.email === username);
  if (!demoUser) {
    return null;
  }
  if (demoUser.password !== password) {
    return false;
  }

  const storedUser = await prisma.user.findFirst({
    where: { username: demoUser.username },
    include: {
      companies: {
        include: { company: true },
        where: { status: "active" },
      },
      roles: {
        include: { role: true },
      },
    },
  });

  if (storedUser) {
    return buildSessionUserFromDatabase(storedUser);
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
    locale: "lo",
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

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ username }, { email: username }],
          },
          include: {
            companies: {
              include: { company: true },
              where: { status: "active" },
            },
            roles: {
              include: { role: true },
            },
          },
        });

        if (!user) {
          return null;
        }

        if (user.status !== "active") {
          throw new Error("UserDisabled");
        }

        const isValidPassword = await compare(password, user.passwordHash);

        if (!isValidPassword) {
          await prisma.loginHistory.create({
            data: {
              userId: user.id,
              status: "failed",
            },
          });
          return null;
        }

        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            status: "success",
          },
        });

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
