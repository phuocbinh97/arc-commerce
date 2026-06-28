"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { getInvoices, saveInvoices, getSettings, Invoice } from "@/lib/storage";
import { formatUsdc } from "@/lib/arc";

// ── helpers ──────────────────────────────────────────────────────────────────

function nextInvoiceNumber(): string {
  // Derive next number from existing invoices to avoid duplicates after localStorage reset
  const existing = getInvoices();
  const max = existing.reduce((m, inv) => {
    const num = parseInt(inv.id.replace("INV-", "")) || 0;
    return Math.max(m, num);
  }, 0);
  const n = max + 1;
  return `INV-${String(n).padStart(3, "0")}`;
}

function buildUrl(inv: Invoice, settings: ReturnType<typeof getSettings>): string {
  const base = window.location.origin + "/checkout";
  const url = new URL(base);
  url.searchParams.set("amount", inv.amount);
  url.searchParams.set("order", inv.id);
  url.searchParams.set("memo", inv.memo || inv.description);
  url.searchParams.set("merchantName", settings.businessName || "Nexmer");
  if (settings.merchantId) url.searchParams.set("merchant", settings.merchantId);
  return url.toString();
}

const STATUS: Record<string, { label: string; text: string; bg: string }> = {
  pending: { label: "● Pending", text: "text-amber", bg: "bg-amber/10 border-amber/25" },
  paid:    { label: "✓ Paid",    text: "text-green", bg: "bg-green/10 border-green/25" },
  expired: { label: "✗ Expired", text: "text-red",   bg: "bg-red/10   border-red/25"   },
  void:    { label: "○ Void",    text: "text-muted", bg: "bg-surface2 border-white/14" },
};

// ── Invoice detail modal ──────────────────────────────────────────────────────

function InvoiceModal({ inv, settings, onClose, onMarkPaid, onVoid, onDelete }: {
  inv: Invoice;
  settings: ReturnType<typeof getSettings>;
  onClose: () => void;
  onMarkPaid: (id: string) => void;
  onVoid:     (id: string) => void;
  onDelete:   (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url    = buildUrl(inv, settings);
  const qrSrc  = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=161b22&color=e6edf3&margin=10`;
  const st     = STATUS[inv.status] ?? STATUS.pending;
  const isPending = inv.status === "pending";

  const copy = () => {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-surface border border-white/8 rounded-2xl w-full max-w-[500px] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold font-mono text-[15px]">{inv.id}</span>
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${st.bg} ${st.text}`}>
              {st.label}
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none transition-colors">×</button>
        </div>

        <div className="p-5 flex gap-5">
          {/* Details */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {inv.clientName && (
              <div>
                <div className="text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">Bill to</div>
                <div className="text-[13.5px] font-semibold">{inv.clientName}</div>
              </div>
            )}
            <div>
              <div className="text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">Description</div>
              <div className="text-[13px] text-ink">{inv.description}</div>
            </div>
            {inv.memo && (
              <div>
                <div className="text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">Memo</div>
                <div className="text-[12px] text-muted">{inv.memo}</div>
              </div>
            )}
            <div>
              <div className="text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">Amount</div>
              <div className="text-[24px] font-bold font-mono leading-none">
                {formatUsdc(inv.amount)} <span className="text-[14px] text-muted font-sans font-normal">USDC</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11.5px]">
              <div>
                <div className="text-muted mb-0.5">Created</div>
                <div className="text-ink">{new Date(inv.createdAt).toLocaleDateString()}</div>
              </div>
              {inv.expiresAt && (
                <div>
                  <div className="text-muted mb-0.5">Expires</div>
                  <div className={Date.now() > inv.expiresAt ? "text-red" : "text-ink"}>
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* QR code — only for pending */}
          {isPending && (
            <div className="flex flex-col items-center gap-2 shrink-0">
              <img src={qrSrc} alt="QR" className="w-[140px] h-[140px] rounded-xl border border-white/8" />
              <div className="text-[10.5px] text-muted">Scan to pay</div>
            </div>
          )}
        </div>

        {/* Payment link bar */}
        {isPending && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 bg-bg border border-white/8 rounded-2xl px-3 py-2">
              <span className="flex-1 font-mono text-[10px] text-muted truncate">{url}</span>
              <button onClick={copy} className="text-muted hover:text-ink text-sm shrink-0 transition-colors">⎘</button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2 flex-wrap">
          {isPending && (
            <>
              <button onClick={copy}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${copied ? "bg-green text-white" : "bg-accent text-white hover:bg-accent/90"}`}>
                {copied ? "✓ Copied!" : "Copy Link"}
              </button>
              <button onClick={() => { onMarkPaid(inv.id); onClose(); }}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-green/10 border border-green/20 text-green hover:bg-green/20 transition-colors">
                Mark Paid
              </button>
              <button onClick={() => { onVoid(inv.id); onClose(); }}
                className="py-2.5 px-4 rounded-xl text-[13px] font-semibold bg-surface2 border border-white/14 text-muted hover:text-ink transition-colors">
                Void
              </button>
            </>
          )}
          <button onClick={() => { if (confirm("Delete this invoice?")) { onDelete(inv.id); onClose(); } }}
            className="py-2.5 px-4 rounded-xl text-[13px] font-semibold bg-red/8 border border-red/20 text-red hover:bg-red/15 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Invoices() {
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [filter,     setFilter]     = useState<"all"|"pending"|"paid"|"expired"|"void">("all");
  const [selected,   setSelected]   = useState<Invoice | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [copied,     setCopied]     = useState("");
  const [showTrash,  setShowTrash]  = useState(false);

  // Form state
  const [amount,     setAmount]     = useState("");
  const [desc,       setDesc]       = useState("");
  const [memo,       setMemo]       = useState("");
  const [clientName, setClientName] = useState("");
  const [expiry,     setExpiry]     = useState("604800000");

  const settings = typeof window !== "undefined" ? getSettings() : { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" };

  useEffect(() => {
    const local = getInvoices();
    let changed = false;
    local.forEach(inv => {
      if (inv.status === "pending" && inv.expiresAt && Date.now() > inv.expiresAt) {
        inv.status = "expired"; changed = true;
      }
    });
    if (changed) saveInvoices(local);
    setInvoices(local);

    // Sync paid status from Redis
    const s = JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
    if (!s.merchantId) return;
    fetch(`/api/invoices?merchantId=${s.merchantId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.invoices?.length) return;
        const redisMap: Record<string, string> = {};
        data.invoices.forEach((inv: any) => { redisMap[inv.id] = inv.status; });
        const merged = local.map(inv => ({
          ...inv,
          status: (redisMap[inv.id] || inv.status) as Invoice["status"],
        }));
        const localIds = new Set(local.map(i => i.id));
        const extra = data.invoices.filter((i: any) => !localIds.has(i.id));
        const final = [...merged, ...extra];
        saveInvoices(final);
        setInvoices(final);
      })
      .catch(() => {});
  }, []);

  // Stats
  const totalAmt  = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const paidAmt   = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const paidCount = invoices.filter(i => i.status === "paid").length;
  const pendCount = invoices.filter(i => i.status === "pending").length;

  const active   = invoices.filter(i => !i.deleted);
  const trashed  = invoices.filter(i => i.deleted);
  const filtered = filter === "all" ? active : active.filter(i => i.status === filter);
  const sorted   = [...filtered].sort((a, b) => b.createdAt - a.createdAt);

  function create() {
    if (!amount || !desc) return;
    const inv: Invoice = {
      id: nextInvoiceNumber(),
      amount, description: desc, memo,
      clientName: clientName || undefined,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: parseInt(expiry) > 0 ? Date.now() + parseInt(expiry) : null,
    };
    const updated = [...invoices, inv];
    saveInvoices(updated);
    setInvoices(updated);
    if (settings.merchantId) {
      fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inv, merchantId: settings.merchantId }),
      }).catch(() => {});
    }
    setAmount(""); setDesc(""); setMemo(""); setClientName("");
    setShowForm(false);
    setSelected(inv);
  }

  function markPaid(id: string) {
    const updated = invoices.map(i => i.id === id ? { ...i, status: "paid" as const } : i);
    saveInvoices(updated); setInvoices(updated);
  }

  function markVoid(id: string) {
    const updated = invoices.map(i => i.id === id ? { ...i, status: "void" as const } : i);
    saveInvoices(updated); setInvoices(updated);
  }

  function del(id: string) {
    const updated = invoices.map(i => i.id === id ? { ...i, deleted: true, deletedAt: Date.now() } : i);
    saveInvoices(updated); setInvoices(updated);
  }

  function restore(id: string) {
    const updated = invoices.map(i => i.id === id ? { ...i, deleted: false, deletedAt: undefined } : i);
    saveInvoices(updated); setInvoices(updated);
  }

  function permDelete(id: string) {
    const updated = invoices.filter(i => i.id !== id);
    saveInvoices(updated); setInvoices(updated);
  }

  function copyLink(inv: Invoice, e: React.MouseEvent) {
    e.stopPropagation();
    const url = buildUrl(inv, settings);
    navigator.clipboard?.writeText(url);
    setCopied(inv.id);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <>
      <Topbar title="Invoices"
        action={{ label: "+ New Invoice", onClick: () => setShowForm(true) }} />

      <div className="p-4 lg:p-6 flex-1 flex flex-col gap-4 lg:gap-5 max-w-[1100px] mx-auto w-full">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 lg:gap-3">
          <div className="bg-surface border border-white/8 rounded-xl p-4">
            <div className="text-[11px] text-muted mb-2">Total Invoiced</div>
            <div className="text-[22px] font-bold font-mono leading-none">
              {formatUsdc(totalAmt)} <span className="text-[13px] text-muted font-sans font-normal">USDC</span>
            </div>
            <div className="text-[11px] text-muted mt-1">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="bg-surface border border-white/8 rounded-xl p-4">
            <div className="text-[11px] text-muted mb-2">Paid</div>
            <div className="text-[22px] font-bold font-mono text-green leading-none">
              {formatUsdc(paidAmt)} <span className="text-[13px] font-sans font-normal">USDC</span>
            </div>
            <div className="text-[11px] text-muted mt-1">{paidCount} invoice{paidCount !== 1 ? "s" : ""}</div>
          </div>
          <div className="bg-surface border border-white/8 rounded-xl p-4">
            <div className="text-[11px] text-muted mb-2">Pending</div>
            <div className="text-[22px] font-bold font-mono text-amber leading-none">{pendCount}</div>
            <div className="text-[11px] text-muted mt-1">awaiting payment</div>
          </div>
        </div>

        {/* Invoice list */}
        <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden flex-1">
          {/* List header */}
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <div className="font-semibold text-[14px]">All Invoices</div>
            <div className="flex items-center gap-1">
              {(["all","pending","paid","expired","void"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-2xl text-[12px] font-semibold capitalize transition-all
                    ${filter === f ? "bg-surface2 text-ink border border-white/14" : "text-muted hover:text-ink"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 lg:py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-surface2 border border-white/8 grid place-items-center text-3xl">🧾</div>
              <div className="text-center">
                <div className="font-semibold text-[14px] mb-1">No invoices yet</div>
                <div className="text-[12px] text-muted mb-4">Create your first invoice and share the payment link</div>
                <button onClick={() => setShowForm(true)}
                  className="px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-colors">
                  + New Invoice
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="lg:hidden flex flex-col divide-y divide-white/6">
                {sorted.map(inv => {
                  const st = STATUS[inv.status] ?? STATUS.pending;
                  return (
                    <div key={inv.id} onClick={() => setSelected(inv)}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface2/60 transition-colors cursor-pointer active:bg-surface2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[12px] font-bold text-ink">{inv.id}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="text-[12px] text-muted truncate">{inv.description}</div>
                        {inv.clientName && <div className="text-[11px] text-muted/70 truncate">{inv.clientName}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[13px] font-bold">{formatUsdc(inv.amount)}</div>
                        <div className="text-[10px] text-muted">USDC</div>
                      </div>
                      <span className="text-muted text-[11px]">›</span>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/8 text-[11px] font-semibold text-muted uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">Invoice</th>
                      <th className="px-5 py-3 text-left">Client</th>
                      <th className="px-5 py-3 text-left">Description</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-left">Date</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(inv => {
                      const st = STATUS[inv.status] ?? STATUS.pending;
                      return (
                        <tr key={inv.id} onClick={() => setSelected(inv)}
                          className="border-b border-white/6 last:border-0 hover:bg-surface2/60 transition-colors cursor-pointer">
                          <td className="px-5 py-3.5">
                            <div className="font-mono text-[12.5px] font-semibold text-ink">{inv.id}</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="text-[12.5px] text-muted">{inv.clientName || "—"}</div>
                          </td>
                          <td className="px-5 py-3.5 max-w-[200px]">
                            <div className="text-[12.5px] truncate">{inv.description}</div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="font-mono text-[13px] font-bold">{formatUsdc(inv.amount)}</div>
                            <div className="text-[10.5px] text-muted">USDC</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${st.bg} ${st.text}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="text-[12px] text-muted">{new Date(inv.createdAt).toLocaleDateString()}</div>
                            {inv.expiresAt && inv.status === "pending" && (
                              <div className={`text-[10.5px] ${Date.now() > inv.expiresAt ? "text-red" : "text-muted"}`}>
                                exp {new Date(inv.expiresAt).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                              {inv.status === "pending" && (
                                <button onClick={e => copyLink(inv, e)}
                                  className={`px-2.5 py-1.5 rounded-2xl text-[11.5px] font-semibold border transition-colors
                                    ${copied === inv.id ? "bg-green/10 border-green/20 text-green" : "bg-surface2 border-white/8 text-muted hover:text-ink"}`}>
                                  {copied === inv.id ? "✓" : "Copy Link"}
                                </button>
                              )}
                              {inv.status === "pending" && (
                                <button onClick={() => markPaid(inv.id)}
                                  className="px-2.5 py-1.5 rounded-2xl text-[11.5px] font-semibold bg-green/8 border border-green/20 text-green hover:bg-green/15 transition-colors">
                                  Mark Paid
                                </button>
                              )}
                              <button onClick={() => setSelected(inv)}
                                className="px-2.5 py-1.5 rounded-2xl text-[11.5px] font-semibold bg-surface2 border border-white/8 text-muted hover:text-ink transition-colors">
                                View
                              </button>
                              <button onClick={() => del(inv.id)} title="Move to trash"
                                className="w-6 h-6 grid place-items-center rounded-lg text-muted/40 hover:text-red hover:bg-red/10 transition-colors">
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* Trash — collapsible */}
        {trashed.length > 0 && (
          <div className="overflow-hidden">
            <button onClick={() => setShowTrash(v => !v)}
              className="mx-auto flex items-center gap-2 px-4 py-2 border border-white/14 rounded-2xl bg-surface hover:bg-surface2 transition-colors">
              <span className="text-[13px] font-semibold text-ink">Trash ({trashed.length})</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-ink transition-transform ${showTrash ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showTrash && (
              <div className="mt-2 bg-surface border border-white/8 rounded-2xl divide-y divide-white/6 opacity-80">
                {[...trashed].sort((a,b) => (b.deletedAt||0)-(a.deletedAt||0)).map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 px-5 py-3 text-muted">
                    <span className="font-mono text-[12px] w-16 shrink-0">{inv.id}</span>
                    <span className="text-[12px] flex-1 truncate line-through">{inv.description}</span>
                    <span className="font-mono text-[12px] shrink-0">{formatUsdc(inv.amount)} USDC</span>
                    <span className="text-[11px] shrink-0 hidden lg:block">deleted {inv.deletedAt ? new Date(inv.deletedAt).toLocaleDateString() : ""}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => restore(inv.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-surface2 border border-white/14 text-muted hover:text-ink transition-colors">
                        Restore
                      </button>
                      <button onClick={() => { if (confirm("Permanently delete? Cannot undo.")) permDelete(inv.id); }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red/8 border border-red/20 text-red hover:bg-red/15 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Invoice form — slide-in panel */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowForm(false)}>
          <div className="bg-surface border border-white/8 rounded-2xl w-full max-w-[440px] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="font-bold text-[14px]">New Invoice</div>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink text-xl leading-none">×</button>
            </div>
            <div className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-[12px] font-semibold text-muted mb-1.5 block">Amount (USDC) *</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00"
                  className="w-full bg-surface2 border border-white/14 rounded-xl px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-muted mb-1.5 block">Description *</label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Web design services…"
                  className="w-full bg-surface2 border border-white/14 rounded-xl px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-muted mb-1.5 block">Bill to (optional)</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name or company…"
                  className="w-full bg-surface2 border border-white/14 rounded-xl px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-muted mb-1.5 block">Memo (optional)</label>
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Additional notes…"
                  className="w-full bg-surface2 border border-white/14 rounded-xl px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-muted mb-1.5 block">Expires in</label>
                <select value={expiry} onChange={e => setExpiry(e.target.value)}
                  className="w-full bg-surface2 border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent transition-colors cursor-pointer">
                  <option value="0">No expiry</option>
                  <option value="3600000">1 hour</option>
                  <option value="86400000">24 hours</option>
                  <option value="604800000">7 days</option>
                  <option value="2592000000">30 days</option>
                </select>
              </div>
              <button onClick={create} disabled={!amount || !desc}
                className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors mt-1">
                Generate Invoice & Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice detail modal */}
      {selected && (
        <InvoiceModal
          inv={selected}
          settings={settings}
          onClose={() => setSelected(null)}
          onMarkPaid={id => { markPaid(id); setSelected(s => s ? { ...s, status: "paid" } : null); }}
          onVoid={id     => { markVoid(id); setSelected(null); }}
          onDelete={id   => { del(id);      setSelected(null); }}
        />
      )}
    </>
  );
}
