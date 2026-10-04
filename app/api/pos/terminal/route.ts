import { ensurePosDeviceId } from "@/features/terminals/device-cookie";
import {
  bindCurrentDevice,
  listStoreTerminals,
  resolveBoundTerminal,
  TerminalAccessError,
} from "@/features/terminals/terminal-service";
import { runRead, runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function GET() {
  return runRead(async (tenant) => {
    const deviceId = await ensurePosDeviceId();
    const bound = await resolveBoundTerminal(tenant, deviceId);
    if (bound?.status === "ACTIVE") {
      await db.posTerminal.update({ data: { lastSeenAt: new Date() }, where: { id: bound.id } });
    }
    const terminals = await listStoreTerminals(tenant);
    return {
      terminal: bound
        ? {
            id: String(bound.id),
            status: bound.status === "DISABLED" ? "DISABLED" : "ACTIVE",
            terminalCode: String(bound.terminalCode),
            terminalName: String(bound.terminalName),
          }
        : null,
      terminals,
    };
  }, WRITE_PERMISSIONS.posSell);
}

export async function POST(request: Request) {
  return runWrite(
    async (tenant, body) => {
      const deviceId = await ensurePosDeviceId();
      if (body.deviceId && String(body.deviceId) !== deviceId) {
        throw new TerminalAccessError("Device identity does not match this browser.", 403);
      }
      const terminalId = String(body.terminalId ?? "");
      if (!terminalId) throw new TerminalAccessError("Choose a POS terminal.");
      return bindCurrentDevice(tenant, terminalId, deviceId, body.rebind === true);
    },
    request,
    WRITE_PERMISSIONS.posSell,
  );
}
