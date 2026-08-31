function Block({ className }: { className?: string }) {
  return <div className={`rounded-md bg-muted ${className ?? "h-5"}`} />;
}

export function RouteLoadingShell({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div aria-busy="true" aria-label={label} className="flex min-w-0 flex-col gap-5" role="status">
      {children}
    </div>
  );
}

export function RouteLoadingHeader() {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <Block className="h-4 w-28" />
      <Block className="mt-3 h-8 w-56" />
      <Block className="mt-3 h-4 w-full max-w-xl" />
    </section>
  );
}

export function RouteLoadingCards({ count = 4 }: { count?: number }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div className="rounded-lg border border-border bg-card p-4" key={index}>
          <Block className="h-4 w-24" />
          <Block className="mt-3 h-8 w-32" />
          <Block className="mt-3 h-3 w-20" />
        </div>
      ))}
    </section>
  );
}

export function RouteLoadingPanel({ tall = false }: { tall?: boolean }) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-5">
      <Block className="h-6 w-40" />
      <Block className={tall ? "mt-5 h-48 w-full" : "mt-5 h-20 w-full"} />
    </article>
  );
}

export function RouteLoadingRows({ count = 6 }: { count?: number }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <Block className="h-5 w-40" />
      <div className="mt-4 grid gap-2">
        {Array.from({ length: count }, (_, index) => (
          <Block className="h-12 w-full" key={index} />
        ))}
      </div>
    </section>
  );
}
