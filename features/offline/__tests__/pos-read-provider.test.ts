import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePosReadRepository } from "../pos-read/pos-read-provider";
import type { PosReadRepository } from "../pos-read/pos-read-repository";
import type { PosGateResult } from "../pos-read/pos-offline-gate";

const onlineRepo = { source: "online" } as unknown as PosReadRepository;
const offlineRepo = { source: "offline" } as unknown as PosReadRepository;

function gate(overrides: Partial<PosGateResult>): PosGateResult {
  return { state: "online", offlineReadsPermitted: false, reason: null, ...overrides };
}

test("flag off (online, not permitted) selects the online repository", () => {
  const r = resolvePosReadRepository({
    gate: gate({ state: "online", offlineReadsPermitted: false, reason: "offline_disabled" }),
    online: onlineRepo,
    offline: null,
  });
  assert.equal(r.source, "online");
  assert.equal(r.repository, onlineRepo);
});

test("online + permitted still uses online (authoritative)", () => {
  const r = resolvePosReadRepository({
    gate: gate({ state: "online", offlineReadsPermitted: true }),
    online: onlineRepo,
    offline: offlineRepo,
  });
  assert.equal(r.source, "online");
});

test("offline read_only + permitted uses the offline replica", () => {
  const r = resolvePosReadRepository({
    gate: gate({ state: "read_only", offlineReadsPermitted: true }),
    online: null,
    offline: offlineRepo,
  });
  assert.equal(r.source, "offline");
  assert.equal(r.repository, offlineRepo);
});

test("offline stale + permitted uses the offline replica", () => {
  const r = resolvePosReadRepository({
    gate: gate({ state: "stale", offlineReadsPermitted: true }),
    online: null,
    offline: offlineRepo,
  });
  assert.equal(r.source, "offline");
});

test("blocked (offline, not permitted) yields no repository", () => {
  const r = resolvePosReadRepository({
    gate: gate({ state: "blocked", offlineReadsPermitted: false, reason: "stale_beyond_policy" }),
    online: null,
    offline: offlineRepo,
  });
  assert.equal(r.repository, null);
  assert.equal(r.source, "blocked");
});
