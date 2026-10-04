import { rejectStoreStatusChange } from "@/features/support/support-service";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    async () => {
      rejectStoreStatusChange();
    },
    request,
    WRITE_PERMISSIONS.helpSubmit,
  );
}
