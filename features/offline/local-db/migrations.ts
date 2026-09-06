/**
 * Local schema migration runner (tasks Phase 1).
 *
 * Migrations transform data in already-created stores. Each migration runs in
 * its own transaction that both applies the change AND records the new schema
 * version atomically. If a migration throws, the transaction rolls back:
 *   - the schema version stays at the previous value,
 *   - no partial data change is committed,
 *   - the old database is preserved (never erased),
 * and the runner throws {@link LocalDbMigrationError} so the caller can surface a
 * recovery/error state (requirements §5.2, tasks Phase 1).
 */

import {
  type OfflineBackendDatabase,
  type OfflineBackendTransaction,
} from "./backend";
import { CURRENT_SCHEMA_VERSION, MetaKey, OfflineStore } from "./schema";

export interface Migration {
  /** Target schema version this migration advances the database TO. */
  toVersion: number;
  description: string;
  /** Transform data using the provided transaction. Throwing rolls it back. */
  migrate: (tx: OfflineBackendTransaction) => Promise<void>;
}

export class LocalDbMigrationError extends Error {
  constructor(
    message: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LocalDbMigrationError";
  }
}

/**
 * Production migration list. v1 is the baseline (stores created structurally);
 * it only stamps the schema version. Future data migrations append here with an
 * incrementing `toVersion`.
 */
export const SCHEMA_MIGRATIONS: readonly Migration[] = [
  {
    toVersion: 1,
    description: "Baseline offline schema",
    migrate: async () => {
      // No data transformation; stores are created structurally at open.
    },
  },
];

async function readSchemaVersion(tx: OfflineBackendTransaction): Promise<number> {
  const record = await tx.get<{ id: string; value: number }>(
    OfflineStore.meta,
    MetaKey.schemaVersion,
  );
  return typeof record?.value === "number" ? record.value : 0;
}

/**
 * Advance the database from its current schema version to `targetVersion` by
 * running each pending migration in order, each in its own transaction.
 * Returns the final schema version reached.
 */
export async function runMigrations(
  db: OfflineBackendDatabase,
  migrations: readonly Migration[] = SCHEMA_MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): Promise<number> {
  const current = await db.transaction([OfflineStore.meta], "readonly", (tx) =>
    readSchemaVersion(tx),
  );

  const pending = [...migrations]
    .filter((m) => m.toVersion > current && m.toVersion <= targetVersion)
    .sort((a, b) => a.toVersion - b.toVersion);

  let applied = current;
  for (const migration of pending) {
    const from = applied;
    try {
      await db.transaction(db.stores, "readwrite", async (tx) => {
        await migration.migrate(tx);
        await tx.put(OfflineStore.meta, {
          id: MetaKey.schemaVersion,
          value: migration.toVersion,
        });
      });
      applied = migration.toVersion;
    } catch (error) {
      // Transaction rolled back: version stays at `from`, data preserved.
      throw new LocalDbMigrationError(
        `Offline schema migration to v${migration.toVersion} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        from,
        migration.toVersion,
        error,
      );
    }
  }

  return applied;
}
