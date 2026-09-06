/**
 * POS sync network client (Phase 6).
 *
 * Builds the bootstrap + delta fetchers that call the secured Phase 4 endpoints
 * (`/api/offline/sync/bootstrap`, `/api/offline/sync/pull`). These are `/api`
 * routes, which the service worker never caches (Phase 2 cache policy), so no
 * authenticated API/HTML response is cached.
 */

import type {
  BootstrapFetcher,
  DeltaFetcher,
} from "../replica/store-snapshot-repository";
import type { ReferenceScope } from "../replica/reference-types";
import { referenceEntitiesFromBootstrap } from "../replica/reference-snapshot";
import { SYNC_SCHEMA_VERSION, type CommandResult, type ServerChange } from "../server/sync-contract";
import type { OfflineOperationEnvelope } from "../operations/envelope";
import type { PushFetcher } from "../checkout/outbox-flush";

export interface PosSyncNetworkOptions {
  deviceId: string;
  scope: ReferenceScope;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<any> {
  const response = await fetchImpl(url, {
    // Never cached; always talk to the origin for authenticated data.
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Sync request failed: ${response.status}`);
  }
  const body = await response.json();
  // runRead wraps payloads as { data, ok }.
  return body?.data ?? body;
}

async function postJson(fetchImpl: typeof fetch, url: string, payload: unknown): Promise<any> {
  const response = await fetchImpl(url, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Sync request failed: ${response.status}`);
  }
  const body = await response.json();
  return body?.data ?? body;
}

/**
 * Build the outbox {@link PushFetcher} that posts operations to the secured push
 * endpoint (`/api/offline/sync/push` — never SW-cached). Used by the flush loop.
 */
export function createPosPushFetcher(options: {
  deviceId: string;
  policyVersion?: number | null;
  fetchImpl?: typeof fetch;
}): PushFetcher {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (envelopes: OfflineOperationEnvelope[]): Promise<CommandResult[]> => {
    const data = await postJson(fetchImpl, `/api/offline/sync/push`, {
      schemaVersion: SYNC_SCHEMA_VERSION,
      deviceId: options.deviceId,
      policyVersion: options.policyVersion ?? undefined,
      operations: envelopes,
    });
    return (data.results ?? []) as CommandResult[];
  };
}

export interface DeviceStatusResult {
  deviceStatus: string | null;
  policyVersion: number | null;
}

export type StatusFetcher = () => Promise<DeviceStatusResult>;

export function createPosSyncFetchers(options: PosSyncNetworkOptions): {
  bootstrap: BootstrapFetcher;
  delta: DeltaFetcher;
  status: StatusFetcher;
} {
  const fetchImpl = options.fetchImpl ?? fetch;
  const deviceId = encodeURIComponent(options.deviceId);

  const bootstrap: BootstrapFetcher = async (cursor, limit) => {
    const data = await getJson(
      fetchImpl,
      `/api/offline/sync/bootstrap?deviceId=${deviceId}&cursor=${cursor}&limit=${limit}`,
    );
    const entities = referenceEntitiesFromBootstrap(data.entities ?? [], options.scope);
    return {
      entities,
      nextCursor: Number(data.nextCursor ?? cursor),
      hasMore: Boolean(data.hasMore),
    };
  };

  const delta: DeltaFetcher = async (cursor, limit) => {
    const data = await getJson(
      fetchImpl,
      `/api/offline/sync/pull?deviceId=${deviceId}&cursor=${cursor}&limit=${limit}`,
    );
    return {
      changes: (data.changes ?? []) as ServerChange[],
      nextCursor: Number(data.nextCursor ?? cursor),
      hasMore: Boolean(data.hasMore),
    };
  };

  const status: StatusFetcher = async () => {
    const data = await getJson(fetchImpl, `/api/offline/sync/status?deviceId=${deviceId}`);
    return {
      deviceStatus: typeof data.deviceStatus === "string" ? data.deviceStatus : null,
      policyVersion: typeof data.policyVersion === "number" ? data.policyVersion : null,
    };
  };

  return { bootstrap, delta, status };
}
