const { spawnSync } = require("node:child_process");
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
  if (!databaseUrl.includes(PRODUCTION_REF)) throw new Error("Refusing non-Production database for Hyperdrive local build env");
  if (databaseUrl.includes(OLD_REF) || databaseUrl.includes(GOFLO_REF)) {
    throw new Error("Refusing inactive PRO or unrelated GoFLO database");
  }

  return databaseUrl;
}

const databaseUrl = readProductionDatabaseUrl();
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = databaseUrl;
console.log("Set Hyperdrive local build env host=aws-0-ap-southeast-1.pooler.supabase.com PRODUCTION_REF=ieutdqnlfiiaawctapor");

const generate = spawnSync("npx", ["prisma", "generate"], {
  cwd: process.cwd(),
  env: process.env,
  shell: true,
  stdio: "inherit",
});
if (generate.status) process.exit(generate.status ?? 1);

const build = spawnSync(
  process.execPath,
  [
    "--require",
    "./scripts/windows-symlink-copy-fallback.cjs",
    "./node_modules/@opennextjs/cloudflare/dist/cli/index.js",
    "build",
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);
process.exit(build.status ?? 1);
