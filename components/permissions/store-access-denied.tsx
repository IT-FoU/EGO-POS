export function StoreAccessDenied({
  description = "You do not have permission to view this section.",
  title = "Access denied",
}: {
  description?: string;
  title?: string;
} = {}) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-danger">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}

