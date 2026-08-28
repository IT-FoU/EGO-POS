import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const LOCAL_FALLBACK = "postgresql://postgres:postgres@localhost:5432/igo_pos";

function loadEnvFile(fileName: string) {
  if (!existsSync(fileName)) return;
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

function classify(url: string) {
  if (!url) return "UNKNOWN";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "LOCAL";
  if (url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) return "UNKNOWN";
  if (url.includes(TARGET_REF)) return "PRODUCTION";
  return "UNKNOWN";
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const url = process.env.DATABASE_URL ?? "";
const target = classify(url);

if (target !== "PRODUCTION") {
  console.error(`Refusing prisma migrate status: target=${target}`);
  process.exit(1);
}

if (url.startsWith(LOCAL_FALLBACK)) {
  console.error("Refusing prisma migrate status: localhost fallback");
  process.exit(1);
}

console.log(`migration-verification-target=${target}`);

const result = spawnSync("npx", ["--no-install", "prisma", "migrate", "status"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const redacted = combined.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@");
console.log(redacted.trim());
process.exit(result.status ?? 1);
