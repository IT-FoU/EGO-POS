import { RouteLoadingShell } from "@/components/layout/route-loading-shell";

export default function PosLoading() {
  return (
    <RouteLoadingShell label="POS">
      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-3">
          <div className="h-12 rounded-md bg-muted" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="h-36 rounded-lg border border-border bg-card" key={index} />
            ))}
          </div>
        </div>
        <aside className="rounded-lg border border-dashed border-border bg-card p-5">
          <div className="h-5 w-32 rounded-md bg-muted" />
          <div className="mt-5 h-64 rounded-md bg-muted" />
          <div className="mt-4 h-24 rounded-md bg-muted" />
        </aside>
      </section>
    </RouteLoadingShell>
  );
}
