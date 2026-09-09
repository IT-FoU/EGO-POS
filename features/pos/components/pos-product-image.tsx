import { isRenderableImageUrl } from "@/lib/storage/product-image-ref";
import { cn } from "@/lib/utils";

const imageStyles: Record<string, string> = {
  bakery: "from-amber-300 to-orange-700",
  card: "from-violet-400 to-indigo-800",
  carton: "from-purple-400 to-fuchsia-700",
  cold: "from-indigo-300 to-blue-700",
  coffee: "from-stone-500 to-amber-900",
  food: "from-lime-300 to-green-700",
  juice: "from-orange-300 to-red-600",
  noodle: "from-red-300 to-orange-700",
  paper: "from-slate-200 to-slate-600",
  pepsi: "from-cyan-500 to-blue-700",
  snack: "from-yellow-300 to-orange-600",
  soap: "from-emerald-300 to-green-700",
  water: "from-sky-300 to-cyan-600",
};

export function PosProductImage({
  className,
  imageKey,
  imageUrl,
  imageClassName,
  label,
}: {
  className?: string;
  imageKey: string;
  imageUrl?: string;
  imageClassName?: string;
  label: string;
}) {
  if (isRenderableImage(imageUrl)) {
    return (
      <div className={cn("h-24 overflow-hidden rounded-md border border-border bg-background", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={label} className={cn("size-full object-cover", imageClassName)} decoding="async" loading="lazy" src={imageUrl} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid h-24 place-items-center rounded-md bg-gradient-to-br p-2 text-center text-xs font-semibold text-white shadow-inner",
        imageStyles[imageKey] ?? "from-slate-400 to-slate-700",
        className,
      )}
    >
      {label}
    </div>
  );
}

function isRenderableImage(imageUrl?: string) {
  return isRenderableImageUrl(imageUrl);
}
