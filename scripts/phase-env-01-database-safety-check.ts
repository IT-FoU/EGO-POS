import {
  assertSafeDatabaseTarget,
  classifyDatabaseUrl,
  fingerprintDatabaseUrl,
  PRODUCTION_DB_FINGERPRINT,
} from "../lib/db/database-target";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const productionUrl = `postgresql://postgres:secret@db.${PRODUCTION_DB_FINGERPRINT}.supabase.co:5432/postgres`;
const developmentUrl = "postgresql://postgres:postgres@127.0.0.1:5432/igo_pos";

check("fingerprint classifies Production without printing secrets", () => {
  assert(fingerprintDatabaseUrl(productionUrl) === PRODUCTION_DB_FINGERPRINT, "prod fingerprint");
  assert(classifyDatabaseUrl(productionUrl) === "PRODUCTION", "prod class");
  assert(classifyDatabaseUrl(developmentUrl) === "LOCAL", "local class");
});

check("development + Production fingerprint is refused", () => {
  let refused = false;
  try {
    assertSafeDatabaseTarget({ databaseUrl: productionUrl, environment: "development", operation: "unit" });
  } catch (error) {
    refused = error instanceof Error && error.message.includes("REFUSING LOCAL DATABASE ACCESS");
  }
  assert(refused, "development must refuse Production");
});

check("test + Production fingerprint is refused", () => {
  let refused = false;
  try {
    assertSafeDatabaseTarget({ databaseUrl: productionUrl, environment: "test" });
  } catch (error) {
    refused = error instanceof Error && error.message.includes("REFUSING LOCAL DATABASE ACCESS");
  }
  assert(refused, "test must refuse Production");
});

check("development + Development DB is allowed", () => {
  assertSafeDatabaseTarget({ databaseUrl: developmentUrl, environment: "development" });
});

check("production + Production DB is allowed", () => {
  assertSafeDatabaseTarget({ databaseUrl: productionUrl, environment: "production" });
});

check("missing development URL fails closed", () => {
  let refused = false;
  try {
    assertSafeDatabaseTarget({ databaseUrl: "", environment: "development" });
  } catch (error) {
    refused = error instanceof Error && error.message.includes("missing");
  }
  assert(refused, "missing URL must fail closed");
});

check("production migration without explicit intent is refused", () => {
  const previous = process.env.EGO_ALLOW_PRODUCTION_MIGRATION;
  delete process.env.EGO_ALLOW_PRODUCTION_MIGRATION;
  let refused = false;
  try {
    assertSafeDatabaseTarget({ databaseUrl: productionUrl, environment: "production-migration" });
  } catch (error) {
    refused = error instanceof Error && /REFUSING PRODUCTION MIGRATION|explicit/.test(error.message);
  }
  if (previous === undefined) delete process.env.EGO_ALLOW_PRODUCTION_MIGRATION;
  else process.env.EGO_ALLOW_PRODUCTION_MIGRATION = previous;
  assert(refused, "migration without intent must refuse");
});

check("production migration with explicit intent is allowed", () => {
  process.env.EGO_ALLOW_PRODUCTION_MIGRATION = "true";
  assertSafeDatabaseTarget({ databaseUrl: productionUrl, environment: "production-migration" });
  delete process.env.EGO_ALLOW_PRODUCTION_MIGRATION;
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  throw new Error(`ENV-01 database safety checks failed: ${failed.length}`);
}
console.log(`\nENV-01 database safety checks passed: ${results.length}`);
