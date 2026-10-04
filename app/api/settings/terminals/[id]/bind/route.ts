import { ensurePosDeviceId } from "@/features/terminals/device-cookie";
import { bindCurrentDevice, TerminalAccessError, unbindTerminal } from "@/features/terminals/terminal-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runWrite(
    async (tenant, body) => {
      if (body.action === "unbind") return unbindTerminal(tenant, id);
      const deviceId = await ensurePosDeviceId();
      if (body.deviceId && String(body.deviceId) !== deviceId) {
        throw new TerminalAccessError("Device identity does not match this browser.", 403);
      }
      return bindCurrentDevice(tenant, id, deviceId, body.rebind === true);
    },
    request,
    WRITE_PERMISSIONS.terminalsEdit,
  );
}
