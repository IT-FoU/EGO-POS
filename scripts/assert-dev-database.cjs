const { existsSync, readFileSync } = require("node:fs");

const PRODUCTION_REF = "ieutdqnlfiiaawctapor";

function load(fileName) {
  if (!existsSync(fileName)) return;
  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
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

const url = process.env.DEV_DATABASE_URL || "";
if (!url) {
  console.error("REFUSING LOCAL DATABASE ACCESS: DEV_DATABASE_URL is missing. Development does not fall back to Production.");
  process.exit(1);
}
if (url.includes(PRODUCTION_REF)) {
  console.error("REFUSING LOCAL DATABASE ACCESS: Development environment is targeting the Production database.");
  process.exit(1);
}
console.log("dev-database-target=DEVELOPMENT");
