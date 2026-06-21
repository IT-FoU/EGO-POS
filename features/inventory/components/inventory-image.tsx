import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const imageStyles: Record<string, string> = {
  pepsi: "from-cyan-500 to-blue-700",
  water: "from-sky-300 to-cyan-600",
  snack: "from-yellow-300 to-orange-600",
  soap: "from-emerald-300 to-green-700",
  cold: "from-violet-300 to-fuchsia-700",
};

export function InventoryImage({
  imageKey,
  label,
}: {
  imageKey: string;
  label: string;
}) {
  return (
    <div
      className={cn(
        "grid size-14 place-items-center rounded-md bg-gradient-to-br text-center text-[10px] font-semibold text-white",
        imageStyles[imageKey] ?? "from-slate-400 to-slate-700",
      )}
      title={label}
    >
      <ImageIcon aria-hidden="true" />
    </div>
  );
}
