"use client";

import { useEffect, useState } from "react";

function formatMinute(minute: number | null | undefined) {
  if (minute == null) return "—";
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function MyOtPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/pos/ot", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "Failed to load OT");
        }
        if (!cancelled) setData(payload.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const history = Array.isArray(data?.history) ? data.history : [];

  return (
    <div className="space-y-3" data-testid="my-ot-panel">
      <div>
        <h3 className="font-semibold">My OT</h3>
        <p className="text-xs text-muted-foreground">{data?.businessDate}</p>
      </div>
      <div className="grid gap-1 text-sm">
        <div>Normal End: {formatMinute(data?.normalEndMinute)}</div>
        <div>OT Approved Until: {formatMinute(data?.otApprovedUntilMinute)}</div>
        <div>Auto End: {data?.autoEndAt ? new Date(data.autoEndAt).toLocaleTimeString() : "None"}</div>
        <div>Attendance: {data?.attendanceOpen ? "Open" : "Closed"}</div>
      </div>
      <div>
        <h4 className="text-sm font-medium">Recent approvals</h4>
        <ul className="mt-1 max-h-48 space-y-1 overflow-auto text-xs">
          {history.length === 0 ? <li className="text-muted-foreground">No OT history</li> : null}
          {history.slice(0, 20).map((row: any) => (
            <li key={row.id}>
              {row.businessDate} · {formatMinute(row.startMinute)}–{formatMinute(row.endMinute)} · {row.status}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
