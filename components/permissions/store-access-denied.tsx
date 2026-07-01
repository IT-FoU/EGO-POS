export function StoreAccessDenied() {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-danger">
      <h1 className="text-lg font-bold">Access denied</h1>
      <p className="mt-2 text-sm">You do not have permission to view this section.</p>
    </div>
  );
}

