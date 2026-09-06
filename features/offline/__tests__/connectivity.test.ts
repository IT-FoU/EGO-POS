import assert from "node:assert/strict";
import { test } from "node:test";

// Install a minimal fake `window` BEFORE the connectivity store is first
// constructed, so we can drive its online/offline lifecycle deterministically in
// Node (no DOM). The store's online/offline handlers set state directly and do
// not read `navigator`, so Node's read-only `navigator` global is left untouched.
const handlers: Record<string, Array<() => void>> = {};
(globalThis as any).window = {
  addEventListener: (type: string, handler: () => void) => {
    (handlers[type] ||= []).push(handler);
  },
  removeEventListener: (type: string, handler: () => void) => {
    handlers[type] = (handlers[type] || []).filter((h) => h !== handler);
  },
};
function fire(type: string): void {
  (handlers[type] || []).slice().forEach((h) => h());
}

import { getConnectivityStore } from "../pwa/connectivity";

test("getServerSnapshot is referentially stable and frozen (no render loop)", () => {
  const store = getConnectivityStore();
  const a = store.getServerSnapshot();
  const b = store.getServerSnapshot();
  assert.equal(a, b, "server snapshot must be the same reference across calls");
  assert.equal(Object.isFrozen(a), true, "server snapshot must be frozen");
  // Neutral online default so SSR never flashes offline before hydration.
  assert.equal(a.state, "online");
  assert.equal(a.navigatorOnline, true);
});

test("getSnapshot is a stable reference until connectivity actually changes", () => {
  const store = getConnectivityStore();
  const first = store.getSnapshot();
  assert.equal(store.getSnapshot(), first, "unchanged snapshot keeps identity");
});

test("the singleton is shared", () => {
  assert.equal(getConnectivityStore(), getConnectivityStore());
});

test("subscribe wires listeners exactly once and drives online/offline transitions", () => {
  const store = getConnectivityStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });
  // A second subscriber must not double-register the window listeners.
  const unsubscribe2 = store.subscribe(() => {});
  assert.equal(handlers["online"].length, 1, "online listener registered once");
  assert.equal(handlers["offline"].length, 1, "offline listener registered once");

  const before = store.getSnapshot();

  fire("offline");
  const offlineSnap = store.getSnapshot();
  assert.equal(offlineSnap.state, "offline");
  assert.notEqual(offlineSnap, before, "state change produces a new snapshot reference");
  assert.equal(notifications, 1, "one notification on the offline transition");

  // Redundant offline event must NOT emit again or flip state (no false transition).
  fire("offline");
  assert.equal(store.getSnapshot(), offlineSnap, "no new snapshot when unchanged");
  assert.equal(notifications, 1, "no redundant notification");

  fire("online");
  assert.equal(store.getSnapshot().state, "online");
  assert.equal(notifications, 2, "one notification on the online transition");

  // Server snapshot remains independent + stable through client transitions.
  assert.equal(store.getServerSnapshot().state, "online");
  assert.equal(store.getServerSnapshot(), store.getServerSnapshot());

  unsubscribe();
  unsubscribe2();
  const countAfterUnsub = notifications;
  fire("offline");
  assert.equal(notifications, countAfterUnsub, "no notifications after unsubscribe");
});
