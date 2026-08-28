import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const DEFAULT_EMAIL = "admin@igopos.local";
const DEFAULT_USERNAME = "igo-admin";
const FORBIDDEN_PASSWORDS = new Set(["AdminChangeMe123!", "SetupChangeMe123!"]);
const SECRETS_PATH = join(process.env.LOCALAPPDATA ?? "", "ego-pos-production", "secrets.json");

type OwnerSecrets = {
  goboxPassword?: string;
  superAdminEmail?: string;
  superAdminPassword?: string;
  superAdminUsername?: string;
};

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
process.env.IGO_DEMO_MODE = "false";
delete process.env.IGO_ENABLE_DEMO_FALLBACK;

function assertTarget() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(TARGET_REF) || url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) {
    throw new Error("Refusing Super Admin bootstrap: DATABASE_URL is not the intended Production project");
  }
}

function readSecrets(): OwnerSecrets {
  if (!existsSync(SECRETS_PATH)) return {};
  return JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as OwnerSecrets;
}

function writeSecrets(next: OwnerSecrets) {
  mkdirSync(dirname(SECRETS_PATH), { recursive: true });
  writeFileSync(SECRETS_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

function isPinOnly(secret: string) {
  return /^\d{4,8}$/.test(secret.trim());
}

function resolveIdentity(secrets: OwnerSecrets) {
  const email = (process.env.EGO_SUPER_ADMIN_EMAIL ?? secrets.superAdminEmail ?? DEFAULT_EMAIL).trim().toLowerCase();
  const username = (process.env.EGO_SUPER_ADMIN_USERNAME ?? secrets.superAdminUsername ?? DEFAULT_USERNAME).trim();

  if (!email.includes("@")) {
    throw new Error("Super Admin identity must be an email");
  }
  if (email === "gobox@gobox.local" || username.toLowerCase() === "gobox") {
    throw new Error("Refusing to create Super Admin from Store Owner identity");
  }
  if (!username || username.includes("@")) {
    throw new Error("Super Admin username is invalid");
  }

  return { email, username };
}

function resolvePassword(secrets: OwnerSecrets, email: string, username: string) {
  const fromEnv = process.env.EGO_SUPER_ADMIN_PASSWORD?.trim() ?? "";
  const fromSecrets = secrets.superAdminPassword?.trim() ?? "";
  const goboxPassword = secrets.goboxPassword?.trim() ?? "";
  let password = fromEnv || fromSecrets;
  let source: "env" | "secrets-file" | "generated-and-stored" = fromEnv ? "env" : "secrets-file";

  if (!password) {
    password = randomBytes(24).toString("base64url");
    source = "generated-and-stored";
  }

  if (password.length < 12) {
    throw new Error("OWNER CREDENTIAL INPUT REQUIRED: Super Admin password must be at least 12 characters");
  }
  if (isPinOnly(password) || FORBIDDEN_PASSWORDS.has(password)) {
    throw new Error("Refusing unsafe/default Super Admin password on Production");
  }
  if (goboxPassword && password === goboxPassword) {
    throw new Error("Refusing to reuse Store Owner password for Super Admin");
  }

  writeSecrets({
    ...secrets,
    superAdminEmail: email,
    superAdminPassword: password,
    superAdminUsername: username,
  });

  return { password, source };
}

async function main() {
  assertTarget();
  const rotate = process.env.EGO_SUPER_ADMIN_ROTATE === "true";
  const secrets = readSecrets();
  const identity = resolveIdentity(secrets);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const goboxUser = await prisma.user.findFirst({
      select: { id: true },
      where: { OR: [{ username: "gobox" }, { email: "gobox@gobox.local" }] },
    });
    if (!goboxUser) {
      throw new Error("GO BOX owner is missing; refusing Super Admin bootstrap");
    }

    const existing = await prisma.superAdmin.findMany({
      select: { email: true, id: true, status: true, username: true },
    });
    const matching = existing.filter(
      (row) => row.email.toLowerCase() === identity.email || row.username === identity.username,
    );

    if (existing.length > 1 || matching.length > 1) {
      throw new Error("Duplicate Super Admin records exist; refusing to mutate");
    }

    if (existing.length === 1 && matching.length === 0) {
      throw new Error("A different Super Admin identity already exists; refusing to create another");
    }

    if (matching.length === 1 && !rotate) {
      const current = matching[0];
      if (current.email.toLowerCase() !== identity.email || current.username !== identity.username) {
        throw new Error("Existing Super Admin identity does not match requested email/username");
      }
      if (current.status !== "active") {
        await prisma.superAdmin.update({
          data: { status: "active" },
          where: { id: current.id },
        });
      }
      console.log(
        JSON.stringify({
          created: false,
          email: identity.email,
          mutated: current.status !== "active",
          passwordSource: "unchanged",
          username: identity.username,
        }),
      );
      return;
    }

    const { password, source } = resolvePassword(readSecrets(), identity.email, identity.username);
    const passwordHash = await hash(password, 12);

    if (matching.length === 1 && rotate) {
      await prisma.superAdmin.update({
        data: {
          email: identity.email,
          passwordHash,
          role: "super_admin",
          status: "active",
          username: identity.username,
        },
        where: { id: matching[0].id },
      });
      console.log(
        JSON.stringify({
          created: false,
          email: identity.email,
          mutated: true,
          passwordSource: source,
          username: identity.username,
        }),
      );
      return;
    }

    await prisma.superAdmin.create({
      data: {
        email: identity.email,
        passwordHash,
        role: "super_admin",
        status: "active",
        username: identity.username,
      },
    });

    console.log(
      JSON.stringify({
        created: true,
        email: identity.email,
        mutated: true,
        passwordSource: source,
        username: identity.username,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(String(error).replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***@"));
  process.exit(1);
});
