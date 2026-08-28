const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const PRODUCTION_REF = "ieutdqnlfiiaawctapor";
const OLD_REF = "urqizygucheilflanlea";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";

function readProductionDatabaseUrl() {
  const envLocal = join(process.cwd(), ".env.local");
  if (!existsSync(envLocal)) {
    throw new Error("Missing .env.local for Production DATABASE_URL");
  }

  let databaseUrl = "";
  for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("DATABASE_URL=")) continue;
    databaseUrl = line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  }

  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  if (!databaseUrl.includes(PRODUCTION_REF)) {
    throw new Error("Refusing non-Production database for Hyperdrive local UAT env");
  }
  if (databaseUrl.includes(OLD_REF) || databaseUrl.includes(GOFLO_REF)) {
    throw new Error("Refusing inactive PRO or unrelated GoFLO database");
  }

  return databaseUrl;
}

const databaseUrl = readProductionDatabaseUrl();
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = databaseUrl;
process.env.IGO_DEMO_MODE = "false";
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = "http://localhost:3000";
}

console.log(
  "UAT Hyperdrive host=aws-0-ap-southeast-1.pooler.supabase.com PRODUCTION_REF=ieutdqnlfiiaawctapor NEXTAUTH_URL=http://localhost:3000",
);
console.log("Open http://localhost:3000 — do not use 127.0.0.1 (dev middleware canonicalizes to localhost:3000).");

const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", "--hostname", "0.0.0.0", "--port", "3000"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
