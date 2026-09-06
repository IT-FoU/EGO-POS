import assert from "node:assert/strict";
import { test } from "node:test";

import { computeOfflineFeatureFlag } from "../feature-flags";
import { deriveFeatureStatus, summarizeOutbox } from "../diagnostics";
import { getConnectivityStore } from "../pwa/connectivity";
import type { OutboxRecord } from "../outbox/outbox";

test("feature flag defaults to disabled with diagnostics on", () => {
  const flag = computeOfflineFeatureFlag({});
  assert.equal(flag.writeEnabled, false);
  assert.equal(flag.diagnosticsEnabled, true);
  assert.equal(flag.source, "default");
});

test("override takes precedence over env", () => {
  const flag = computeOfflineFeatureFlag({ envEnabled: false, overrideEnabled: true });
  assert.equal(flag.writeEnabled, true);
  assert.equal(flag.source, "override");
});

test("env enables when no override", () => {
  const flag = computeOfflineFeatureFlag({ envEnabled: true });
  assert.equal(flag.writeEnabled, true);
  assert.equal(flag.source, "env");
});

test("deriveFeatureStatus reflects flag/connectivity/queue precedence", () => {
  const zero = { pending: 0, retryable: 0, blocked: 0, rejected: 0 };

  assert.equal(
    deriveFeatureStatus({ online: true, syncing: false, writeEnabled: false, counts: zero }),
    "not_available",
  );
  assert.equal(
    deriveFeatureStatus({ online: true, syncing: false, writeEnabled: true, counts: zero }),
    "online",
  );
  assert.equal(
    deriveFeatureStatus({ online: false, syncing: false, writeEnabled: true, counts: zero }),
    "offline_ready",
  );
  assert.equal(
    deriveFeatureStatus({
      online: false,
      syncing: false,
      writeEnabled: true,
      counts: { ...zero, pending: 2 },
    }),
    "offline_queued",
  );
  assert.equal(
    deriveFeatureStatus({
      online: true,
      syncing: false,
      writeEnabled: true,
      counts: { ...zero, blocked: 1 },
    }),
    "needs_attention",
  );
  assert.equal(
    deriveFeatureStatus({ online: true, syncing: true, writeEnabled: true, counts: zero }),
    "syncing",
  );
});

test("summarizeOutbox counts by status", () => {
  const records = [
    { status: "pending" },
    { status: "pending" },
    { status: "synced" },
    { status: "blocked" },
  ] as OutboxRecord[];
  const counts = summarizeOutbox(records);
  assert.equal(counts.total, 4);
  assert.equal(counts.pending, 2);
  assert.equal(counts.synced, 1);
  assert.equal(counts.blocked, 1);
});

test("connectivity server snapshot is online and stable", () => {
  const store = getConnectivityStore();
  const server = store.getServerSnapshot();
  assert.equal(server.state, "online");
  // getSnapshot in a non-DOM env defaults to online (navigator undefined).
  assert.equal(store.getSnapshot().state, "online");
});
