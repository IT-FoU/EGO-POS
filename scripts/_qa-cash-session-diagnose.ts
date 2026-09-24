/**
 * READ-ONLY QA diagnosis: Owner cash session vs attendance.
 * Usage: npx tsx scripts/_qa-cash-session-diagnose.ts
 * Refuses Production. Mutates nothing.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { FORBIDDEN_DB_FINGERPRINTS, PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";

const QA = "arkhwskvcnntluoakmef";

function assertQaOnly(url: string) {
  if (!url.includes(QA)) throw new Error("STOP: QA DB fingerprint missing");
  if (url.includes(PRODUCTION_DB_FINGERPRINT) || FORBIDDEN_DB_FINGERPRINTS.some((f) => url.includes(f))) {
    throw new Error("STOP: refusing Production/forbidden DB");
  }
}

function buildPoolerUrl(secrets: Record<string, string>, directUrl: string) {
  const password = String(secrets.dbPassword || "");
  const user = String(secrets.dbUser || "postgres");
  if (!password) return null;
  // Supabase transaction pooler — QA project only
  const encoded = encodeURIComponent(password);
  return `postgresql://${user}.${QA}:${encoded}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

async function connectQa(secrets: Record<string, string>) {
  const direct = String(secrets.databaseUrl || secrets.DATABASE_URL || "");
  assertQaOnly(direct);

  const candidates: string[] = [direct];
  const pooler = buildPoolerUrl(secrets, direct);
  if (pooler) {
    assertQaOnly(pooler);
    candidates.push(pooler);
  }

  let lastError: unknown;
  for (const url of candidates) {
    const host = url.match(/@([^/:]+)/)?.[1] ?? "?";
    try {
      const client = new pg.Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      console.log("CONNECTED_HOST=" + host);
      return client;
    } catch (error) {
      lastError = error;
      console.log("CONNECT_FAIL_HOST=" + host + " ERR=" + (error instanceof Error ? error.message : String(error)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
  const secretsRaw = readFileSync(`${process.env.LOCALAPPDATA}/ego-pos-qa/secrets.json`, "utf8").replace(/^\uFEFF/, "");
  const secrets = JSON.parse(secretsRaw) as Record<string, string>;
  const client = await connectQa(secrets);

  try {
    const owners = await client.query(`
      SELECT cu.user_id, cu.company_id, cu.branch_id, cu.is_owner, cu.status,
             u.username, u.full_name, u.email
      FROM company_users cu
      JOIN users u ON u.id = cu.user_id
      WHERE cu.is_owner = true AND cu.status = 'active'
      ORDER BY cu.created_at ASC
      LIMIT 5`);
    console.log("OWNERS=" + owners.rows.length);
    for (const row of owners.rows) {
      console.log(
        JSON.stringify({
          userId: row.user_id,
          username: row.username,
          companyId: row.company_id,
          branchId: row.branch_id,
          isOwner: row.is_owner,
        }),
      );
    }

    const owner = owners.rows[0];
    if (!owner) {
      console.log("NO_OWNER");
      return;
    }

    const branchId = owner.branch_id;
    const openCash = await client.query(
      `SELECT id, branch_id, cashier_id, opening_cash, opened_at, closed_at
       FROM cash_sessions
       WHERE company_id = $1 AND cashier_id = $2 AND closed_at IS NULL
       ORDER BY opened_at DESC`,
      [owner.company_id, owner.user_id],
    );
    console.log("OPEN_CASH_COUNT=" + openCash.rows.length);
    for (const row of openCash.rows) {
      console.log(
        JSON.stringify({
          cashSessionId: row.id,
          branchId: row.branch_id,
          openedAt: row.opened_at,
          openingCash: String(row.opening_cash),
          matchesOwnerBranch: row.branch_id === branchId,
        }),
      );
    }

    const openAtt = await client.query(
      `SELECT id, branch_id, status, cash_session_id, started_at, ended_at
       FROM staff_attendance_sessions
       WHERE company_id = $1 AND user_id = $2 AND status = 'open'
       ORDER BY started_at DESC`,
      [owner.company_id, owner.user_id],
    );
    console.log("OPEN_ATTENDANCE_COUNT=" + openAtt.rows.length);
    for (const row of openAtt.rows) {
      console.log(
        JSON.stringify({
          attendanceId: row.id,
          branchId: row.branch_id,
          cashSessionId: row.cash_session_id,
          startedAt: row.started_at,
          matchesOwnerBranch: row.branch_id === branchId,
        }),
      );
    }

    const lastClosedCash = await client.query(
      `SELECT id, branch_id, opened_at, closed_at
       FROM cash_sessions
       WHERE company_id = $1 AND cashier_id = $2 AND closed_at IS NOT NULL
       ORDER BY closed_at DESC LIMIT 1`,
      [owner.company_id, owner.user_id],
    );
    console.log(
      "LAST_CLOSED_CASH=" +
        (lastClosedCash.rows[0] ? JSON.stringify(lastClosedCash.rows[0]) : "none"),
    );

    const cashOpen = openCash.rows.length > 0;
    const attOpen = openAtt.rows.length > 0;
    const cash = openCash.rows[0];
    const att = openAtt.rows[0];
    let mismatch = "none";
    if (cashOpen && !attOpen) mismatch = "cash_open_attendance_closed";
    else if (!cashOpen && attOpen) mismatch = "attendance_open_cash_closed";
    else if (cashOpen && attOpen && att.cash_session_id && att.cash_session_id !== cash.id) {
      mismatch = "attendance_linked_to_other_cash_session";
    } else if (cashOpen && attOpen && cash.branch_id !== att.branch_id) {
      mismatch = "branch_mismatch_cash_vs_attendance";
    } else if (cashOpen && branchId && cash.branch_id !== branchId) {
      mismatch = "cash_open_on_other_branch";
    }

    console.log(
      JSON.stringify({
        ownerBranchId: branchId,
        cashOpen,
        attendanceOpen: attOpen,
        mismatch,
        startWorkLikely: cashOpen
          ? "HIDDEN_because_cash_open"
          : attOpen
            ? "CLICK_may_fail_duplicate_attendance"
            : "VISIBLE_can_start",
        payLikely:
          cashOpen && attOpen && (!att.cash_session_id || att.cash_session_id === cash?.id)
            ? "ALLOWED_if_same_branch"
            : cashOpen && !attOpen
              ? "BLOCKED_attendance_required"
              : !cashOpen
                ? "BLOCKED_cash_session_required"
                : "BLOCKED_or_mismatch",
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
