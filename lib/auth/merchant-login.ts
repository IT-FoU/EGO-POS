import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export const INVALID_CREDENTIALS_MESSAGE = "Username or password is incorrect.";

type MerchantUserRecord = {
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
  passwordHash: string;
  pinHash: string | null;
  preferredLocale: string;
  roles: Array<{ companyId: string | null; role: { name: string } }>;
  status: string;
  username: string;
};

const userInclude = {
  companies: {
    include: { company: true },
    orderBy: [{ isOwner: "desc" as const }, { createdAt: "asc" as const }],
    where: { status: "active" as const },
  },
  roles: {
    include: { role: true },
  },
};

function userIsOwner(user: MerchantUserRecord) {
  return user.companies.some((membership) => membership.isOwner);
}

export async function findMerchantUserForLogin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    const user = await prisma.user.findFirst({
      include: userInclude,
      where: { email: trimmed },
    });
    if (!user || !userIsOwner(user)) {
      return null;
    }
    return user;
  }

  return prisma.user.findFirst({
    include: userInclude,
    where: {
      OR: [{ username: trimmed }, { username: trimmed.toLowerCase() }],
    },
  });
}

export async function verifyMerchantSecret(user: MerchantUserRecord, secret: string) {
  const owner = userIsOwner(user);

  if (owner) {
    if (user.pinHash && (await compare(secret, user.pinHash))) {
      return true;
    }
    return compare(secret, user.passwordHash);
  }

  if (user.pinHash) {
    return compare(secret, user.pinHash);
  }

  return compare(secret, user.passwordHash);
}

export async function authenticateMerchantUser(identifier: string, secret: string) {
  const user = await findMerchantUserForLogin(identifier);
  if (!user) {
    return null;
  }

  if (user.status !== "active") {
    throw new Error("UserDisabled");
  }

  const valid = await verifyMerchantSecret(user, secret);
  if (!valid) {
    await prisma.loginHistory.create({
      data: {
        status: "failed",
        userId: user.id,
      },
    });
    return null;
  }

  await prisma.loginHistory.create({
    data: {
      status: "success",
      userId: user.id,
    },
  });

  return user;
}
