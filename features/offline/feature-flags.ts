/**
 * Offline feature flag (Phase 0 §16, tasks Phase 0/1).
 *
 * Scoped by company + branch + terminal, DEFAULT DISABLED. Read-only diagnostics
 * remain available even when the write feature flag is off, so the Sync Center
 * can always show status without enabling offline writes.
 *
 * Until the cloud flag store exists (later phase), the flag resolves from:
 *   1. build-time env `NEXT_PUBLIC_OFFLINE_ENABLED` ("true" enables), then
 *   2. a per-scope localStorage dev override, then
 *   3. default: disabled.
 *
 * Nothing here changes production behavior unless the flag is explicitly enabled.
 */

import type { StoreNamespace } from "./types";

export interface OfflineFeatureFlag {
  /** When true, offline local writes + queueing are allowed. */
  writeEnabled: boolean;
  /** Always true: diagnostics/status are visible regardless of writeEnabled. */
  diagnosticsEnabled: boolean;
  /** Where the decision came from (for diagnostics). */
  source: "env" | "override" | "default";
}

export interface FeatureFlagInputs {
  namespace?: Partial<StoreNamespace>;
  /** Parsed value of NEXT_PUBLIC_OFFLINE_ENABLED, if any. */
  envEnabled?: boolean | null;
  /** Per-scope dev override, if any. */
  overrideEnabled?: boolean | null;
}

/** Pure resolver — unit tested. */
export function computeOfflineFeatureFlag(inputs: FeatureFlagInputs): OfflineFeatureFlag {
  if (typeof inputs.overrideEnabled === "boolean") {
    return {
      writeEnabled: inputs.overrideEnabled,
      diagnosticsEnabled: true,
      source: "override",
    };
  }
  if (typeof inputs.envEnabled === "boolean") {
    return {
      writeEnabled: inputs.envEnabled,
      diagnosticsEnabled: true,
      source: "env",
    };
  }
  return { writeEnabled: false, diagnosticsEnabled: true, source: "default" };
}

function parseBoolean(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "off") return false;
  return null;
}

export function offlineFlagOverrideKey(namespace?: Partial<StoreNamespace>): string {
  const company = namespace?.companyId ?? "*";
  const branch = namespace?.branchId ?? "*";
  const terminal = namespace?.terminalId ?? "*";
  return `egopos.offline.flag::${company}::${branch}::${terminal}`;
}

function readEnvEnabled(): boolean | null {
  // NEXT_PUBLIC_* is inlined at build time and safe to read on the client.
  return parseBoolean(process.env.NEXT_PUBLIC_OFFLINE_ENABLED);
}

function readOverrideEnabled(namespace?: Partial<StoreNamespace>): boolean | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage?.getItem(offlineFlagOverrideKey(namespace));
    return parseBoolean(raw);
  } catch {
    return null;
  }
}

/** Browser/runtime resolver combining env + dev override. */
export function getOfflineFeatureFlag(
  namespace?: Partial<StoreNamespace>,
): OfflineFeatureFlag {
  return computeOfflineFeatureFlag({
    namespace,
    envEnabled: readEnvEnabled(),
    overrideEnabled: readOverrideEnabled(namespace),
  });
}
