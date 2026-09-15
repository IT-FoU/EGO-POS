import { setBranchFavoriteProduct } from "@/features/pos/favorites-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    async (tenant, body) => {
      const productId = String(body.productId ?? "").trim();
      const favorite = Boolean(body.favorite);
      if (!productId) {
        throw new Error("Product id is required.");
      }
      return setBranchFavoriteProduct({ favorite, productId }, tenant);
    },
    request,
    WRITE_PERMISSIONS.posSell,
  );
}
