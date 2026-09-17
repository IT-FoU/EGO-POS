import { isUnitEnabled, parsePositiveIntQty, unitRole } from "@/features/products/unit-hierarchy";

export const LAST_CREATE_UNIT_SETUP_KEY = "ego-pos.last-create-unit-setup";

export type LastCreateUnitSlot = {
  conversionQty: number;
  enabled: boolean;
};

export type LastCreateUnitSetup = {
  units: {
    box: LastCreateUnitSlot;
    pack: LastCreateUnitSlot;
    piece: LastCreateUnitSlot;
  };
  version: 1;
};

export const FALLBACK_LAST_CREATE_UNIT_SETUP: LastCreateUnitSetup = {
  version: 1,
  units: {
    piece: { enabled: true, conversionQty: 1 },
    pack: { enabled: true, conversionQty: 6 },
    box: { enabled: true, conversionQty: 60 },
  },
};

function normalizeQty(value: unknown, fallback: number) {
  return parsePositiveIntQty(value) ?? fallback;
}

export function parseLastCreateUnitSetup(value: unknown): LastCreateUnitSetup | null {
  if (!value || typeof value !== "object") return null;
  const units = (value as { units?: unknown }).units;
  if (!units || typeof units !== "object") return null;
  const row = units as Record<string, unknown>;
  const piece = row.piece;
  const pack = row.pack;
  const box = row.box;
  if (!piece || typeof piece !== "object" || !pack || typeof pack !== "object" || !box || typeof box !== "object") {
    return null;
  }
  const pieceRow = piece as Record<string, unknown>;
  const packRow = pack as Record<string, unknown>;
  const boxRow = box as Record<string, unknown>;
  return {
    version: 1,
    units: {
      piece: {
        enabled: pieceRow.enabled !== false,
        conversionQty: 1,
      },
      pack: {
        enabled: packRow.enabled !== false,
        conversionQty: normalizeQty(packRow.conversionQty, 6),
      },
      box: {
        enabled: boxRow.enabled !== false,
        conversionQty: normalizeQty(boxRow.conversionQty, 60),
      },
    },
  };
}

export function readLastCreateUnitSetup(): LastCreateUnitSetup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_CREATE_UNIT_SETUP_KEY);
    if (!raw) return null;
    return parseLastCreateUnitSetup(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLastCreateUnitSetup(setup: LastCreateUnitSetup) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CREATE_UNIT_SETUP_KEY, JSON.stringify(setup));
  } catch {
    // Private mode / blocked storage — next Create falls back to defaults.
  }
}

/** Capture only enable + Qty for Piece/Pack/Box. Never stores prices, barcodes, SKU, etc. */
export function extractLastCreateUnitSetupFromUnits(
  units: Array<{ conversionQty?: unknown; status?: "active" | "inactive"; unitName: string }>,
): LastCreateUnitSetup {
  const next = structuredClone(FALLBACK_LAST_CREATE_UNIT_SETUP);
  for (const unit of units) {
    const role = unitRole(unit.unitName);
    if (role !== "piece" && role !== "pack" && role !== "box") continue;
    const fallbackQty = FALLBACK_LAST_CREATE_UNIT_SETUP.units[role].conversionQty;
    next.units[role] = {
      enabled: isUnitEnabled(unit),
      conversionQty: role === "piece" ? 1 : normalizeQty(unit.conversionQty, fallbackQty),
    };
  }
  return next;
}

export function applyLastCreateUnitSetupToDefaults<T extends {
  conversionQty: number;
  status?: "active" | "inactive";
  unitName: string;
}>(units: T[], setup: LastCreateUnitSetup | null | undefined): T[] {
  if (!setup) return units;
  return units.map((unit) => {
    const role = unitRole(unit.unitName);
    if (role !== "piece" && role !== "pack" && role !== "box") return unit;
    const slot = setup.units[role];
    return {
      ...unit,
      conversionQty: role === "piece" ? 1 : slot.conversionQty,
      status: slot.enabled ? "active" : "inactive",
    };
  });
}

export function resolveCreateUnitSetup(setup?: LastCreateUnitSetup | null): LastCreateUnitSetup {
  return setup ?? FALLBACK_LAST_CREATE_UNIT_SETUP;
}
