const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const PRODUCTION_REF = "ieutdqnlfiiaawctapor";

function load(fileName) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

load(".env");
load(".env.development");
load(".env.local");
load(".env.development.local");

const databaseUrl = process.env.DEV_DATABASE_URL || "";
if (!databaseUrl) {
  throw new Error("REFUSING LOCAL DATABASE ACCESS: DEV_DATABASE_URL is missing. Development does not fall back to Production.");
}
if (databaseUrl.includes(PRODUCTION_REF)) {
  throw new Error("REFUSING LOCAL DATABASE ACCESS: Development environment is targeting the Production database.");
}

process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = databaseUrl;
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = "http://localhost:3000";
}

console.log("dev-database-target=DEVELOPMENT host=127.0.0.1");

const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", "--hostname", "0.0.0.0"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
