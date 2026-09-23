import { redirect } from "next/navigation";

/** Phase D: Inventory entry point — same feature as Reports Reorder. */
export default function InventoryReorderPage() {
  redirect("/reports/inventory/reorder");
}
