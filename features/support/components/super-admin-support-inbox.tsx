"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CHAT_STATUSES, FEATURE_STATUSES, type SupportTicketDetail, type SupportTicketSummary } from "@/features/support/support-types";

type Inbox = { tickets: SupportTicketSummary[]; unreadCount: number };

export function SuperAdminSupportInbox() {
  const [inbox, setInbox] = useState<Inbox>({ tickets: [], unreadCount: 0 });
  const [thread, setThread] = useState<SupportTicketDetail | null>(null);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function load(next = { company, status, type }) {
    const query = new URLSearchParams();
    if (next.type !== "all") query.set("type", next.type);
    if (next.status !== "all") query.set("status", next.status);
    if (next.company.trim()) query.set("company", next.company.trim());
    const response = await fetch(`/api/super-admin/support/tickets?${query.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      setError(payload.error || "Unable to load support tickets.");
      return;
    }
    setInbox(payload.data as Inbox);
    setError("");
  }

  useEffect(() => {
    void load();
    // Initial inbox load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openTicket(id: string) {
    setPending(true);
    const response = await fetch(`/api/super-admin/support/tickets/${id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok || payload.ok === false) {
      setError(payload.error || "Unable to open ticket.");
      return;
    }
    setThread(payload.data as SupportTicketDetail);
    void load();
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) return;
    setPending(true);
    const response = await fetch(`/api/super-admin/support/tickets/${thread.id}/messages`, {
      body: JSON.stringify({ message, senderSide: "STORE" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok || payload.ok === false) {
      setError(payload.error || "Reply failed.");
      return;
    }
    setMessage("");
    setThread(payload.data as SupportTicketDetail);
    setError("");
    void load();
  }

  async function changeStatus(nextStatus: string) {
    if (!thread) return;
    setPending(true);
    const response = await fetch(`/api/super-admin/support/tickets/${thread.id}/status`, {
      body: JSON.stringify({ status: nextStatus }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok || payload.ok === false) {
      setError(payload.error || "Status update failed.");
      return;
    }
    setThread(payload.data as SupportTicketDetail);
    void load();
  }

  const statuses = thread?.type === "FEATURE_REQUEST" ? FEATURE_STATUSES : CHAT_STATUSES;

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden" data-super-admin-support>
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Support Center</h1>
        <p className="mt-2 text-sm text-[#94A3B8]">
          {inbox.unreadCount} new {inbox.unreadCount === 1 ? "ticket" : "tickets"} waiting for Super Admin.
        </p>
      </header>
      {error ? <p className="rounded-md border border-red-400/40 px-4 py-3 text-sm text-red-300" role="status">{error}</p> : null}
      <section className="grid gap-3 rounded-lg border border-[#334155] bg-[#111827] p-4 md:grid-cols-3">
        <label className="text-sm">Type
          <select className="mt-1 w-full rounded-md border border-[#334155] bg-[#0B1220] px-3 py-2" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All</option>
            <option value="CHAT">Chat</option>
            <option value="PROBLEM">Problem</option>
            <option value="FEATURE_REQUEST">Feature request</option>
          </select>
        </label>
        <label className="text-sm">Status
          <select className="mt-1 w-full rounded-md border border-[#334155] bg-[#0B1220] px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All</option>
            {[...CHAT_STATUSES, ...FEATURE_STATUSES].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm">Company
          <input className="mt-1 w-full rounded-md border border-[#334155] bg-[#0B1220] px-3 py-2" value={company} onChange={(event) => setCompany(event.target.value)} />
        </label>
        <button className="h-10 rounded-md bg-[#5EEAD4] px-4 text-sm font-semibold text-[#0B1220] md:col-span-3 md:w-fit" type="button" onClick={() => void load()}>Apply filters</button>
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="grid gap-2">
          {inbox.tickets.length === 0 ? <p className="text-sm text-[#94A3B8]">No support tickets.</p> : inbox.tickets.map((ticket) => (
            <button className="rounded-md border border-[#334155] bg-[#111827] p-4 text-left" data-admin-ticket={ticket.id} key={ticket.id} type="button" onClick={() => void openTicket(ticket.id)}>
              <span className="font-semibold">{ticket.subject}</span>
              <span className="mt-1 block text-sm text-[#94A3B8]">{ticket.companyName || ticket.companyId} · {ticket.type} · {ticket.status}</span>
            </button>
          ))}
        </section>
        {thread ? (
          <section className="grid gap-3 rounded-lg border border-[#334155] bg-[#111827] p-4" data-admin-thread={thread.id}>
            <h2 className="text-xl font-semibold">{thread.subject}</h2>
            <p className="text-sm text-[#94A3B8]">{thread.companyName} · {thread.userName} · {thread.sourcePath || "No page"} · {thread.appVersion || "No version"}</p>
            <label className="text-sm">Status
              <select className="mt-1 w-full rounded-md border border-[#334155] bg-[#0B1220] px-3 py-2" value={thread.status} disabled={pending} onChange={(event) => void changeStatus(event.target.value)}>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <div className="grid max-h-80 gap-2 overflow-auto">
              {thread.messages.map((item) => (
                <article className="rounded-md border border-[#334155] p-3" data-sender={item.senderSide} key={item.id}>
                  <p className="text-xs font-semibold text-[#94A3B8]">{item.senderSide === "SUPER_ADMIN" ? "Super Admin" : "Store"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p>
                </article>
              ))}
            </div>
            <form className="grid gap-2" onSubmit={reply}>
              <textarea className="min-h-24 rounded-md border border-[#334155] bg-[#0B1220] px-3 py-2" value={message} onChange={(event) => setMessage(event.target.value)} />
              <button className="h-10 w-fit rounded-md bg-[#5EEAD4] px-4 text-sm font-semibold text-[#0B1220] disabled:opacity-60" disabled={pending} type="submit">Send reply</button>
            </form>
          </section>
        ) : <p className="text-sm text-[#94A3B8]">Open a ticket to reply.</p>}
      </div>
    </div>
  );
}
