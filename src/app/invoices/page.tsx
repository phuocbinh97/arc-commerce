"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { getInvoices, saveInvoices, getSettings, Invoice } from "@/lib/storage";
import { formatUsdc, ARC_EXPLORER } from "@/lib/arc";

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<"all"|"pending"|"paid"|"expired">("all");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [memo, setMemo] = useState("");
  const [expiry, setExpiry] = useState("86400000");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    const local = getInvoices();
    // Check expiry locally
    let changed = false;
    local.forEach(inv => {
      if (inv.status === "pending" && inv.expiresAt && Date.now() > inv.expiresAt) {
        inv.status = "expired"; changed = true;
      }
    });
    if (changed) saveInvoices(local);
    setInvoices(local);

    // Sync from Redis — Redis is source of truth for paid status
    const s = JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
    if (!s.merchantId) return;
    fetch(`/api/invoices?merchantId=${s.merchantId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.invoices?.length) return;
        // Merge: update local status from Redis
        const redisMap: Record<string, string> = {};
        data.invoices.forEach((inv: any) => { redisMap[inv.id] = inv.status; });
        const merged = local.map(inv => ({
          ...inv,
          status: (redisMap[inv.id] || inv.status) as Invoice["status"],
        }));
        // Also add any Redis invoices not in local (paid from other device)
        const localIds = new Set(local.map(i => i.id));
        const extra = data.invoices.filter((i: any) => !localIds.has(i.id));
        const final = [...merged, ...extra];
        saveInvoices(final);
        setInvoices(final);
      })
      .catch(console.error);
  }, []);

  const settings = typeof window !== "undefined" ? getSettings() : { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" };
  const filtered = filter === "all" ? invoices : invoices.filter(i => i.status === filter);
  const total = invoices.reduce((s,i) => s+(parseFloat(i.amount)||0), 0);
  const paid = invoices.filter(i=>i.status==="paid").length;
  const pending = invoices.filter(i=>i.status==="pending").length;

  function buildUrl(inv: Invoice) {
    const base = window.location.origin + "/checkout";
    const url = new URL(base);
    url.searchParams.set("amount", inv.amount);
    url.searchParams.set("order", inv.id);
    url.searchParams.set("memo", inv.memo || inv.description);
    url.searchParams.set("merchantName", settings.businessName || "Arc Commerce");
    if (settings.merchantId) url.searchParams.set("merchant", settings.merchantId);
    return url.toString();
  }

  function create() {
    if (!amount || !desc) return;
    const inv: Invoice = {
      id: "INV-" + Date.now(),
      amount, description: desc, memo,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: parseInt(expiry) > 0 ? Date.now() + parseInt(expiry) : null,
    };
    const updated = [...invoices, inv];
    saveInvoices(updated); setInvoices(updated);
    // Sync to Redis
    if (settings.merchantId) {
      fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inv, merchantId: settings.merchantId }),
      }).catch(console.error);
    }
    const url = buildUrl(inv);
    setGeneratedUrl(url);
    setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=1c2330&color=e6edf3&margin=10`);
    setAmount(""); setDesc(""); setMemo("");
  }

  function del(id: string) {
    if (!confirm("Delete this invoice?")) return;
    const updated = invoices.filter(i=>i.id!==id);
    saveInvoices(updated); setInvoices(updated);
  }

  const statusColor = { paid: "text-green bg-green/10", pending: "text-amber bg-amber/10", expired: "text-red bg-red/10" };

  return (
    <>
      <Topbar title="Invoices" action={{ label: "+ New Invoice", onClick: () => {} }} />
      <div className="p-7 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3.5 mb-6">
          <div className="bg-surface border border-white/8 rounded-lg p-4">
            <div className="text-xs text-muted mb-1">Total Invoiced</div>
            <div className="text-xl font-bold font-mono">{formatUsdc(total)} <span className="text-sm text-muted font-sans">USDC</span></div>
          </div>
          <div className="bg-surface border border-white/8 rounded-lg p-4">
            <div className="text-xs text-muted mb-1">Paid</div>
            <div className="text-xl font-bold text-green">{paid}</div>
          </div>
          <div className="bg-surface border border-white/8 rounded-lg p-4">
            <div className="text-xs text-muted mb-1">Pending</div>
            <div className="text-xl font-bold text-amber">{pending}</div>
          </div>
        </div>

        <div className="grid grid-cols-[420px_1fr] gap-5">
          {/* Form */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">New Invoice</div>
            <div className="p-5">
              <div className="mb-3">
                <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Amount (USDC)</label>
                <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="10.00"
                  className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
              </div>
              <div className="mb-3">
                <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Description</label>
                <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Web design services…"
                  className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
              </div>
              <div className="mb-3">
                <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Memo (optional)</label>
                <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Additional notes…"
                  className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
              </div>
              <div className="mb-4">
                <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Expires in</label>
                <select value={expiry} onChange={e=>setExpiry(e.target.value)}
                  className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                  <option value="0">No expiry</option>
                  <option value="3600000">1 hour</option>
                  <option value="86400000">24 hours</option>
                  <option value="604800000">7 days</option>
                </select>
              </div>
              <button onClick={create} disabled={!amount || !desc}
                className="w-full py-2 bg-accent text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:bg-accent/90 transition-colors">
                Generate Invoice & Link
              </button>

              {generatedUrl && (
                <div className="mt-4 p-4 bg-surface2 border border-white/8 rounded-lg">
                  {qrSrc && <img src={qrSrc} alt="QR Code" className="w-40 h-40 mx-auto mb-3 rounded-lg" />}
                  <div className="flex items-center gap-2 bg-bg border border-white/8 rounded-lg px-3 py-2 mb-3">
                    <span className="flex-1 font-mono text-[11px] text-muted truncate">{generatedUrl}</span>
                    <button onClick={() => navigator.clipboard?.writeText(generatedUrl)}
                      className="text-[13px] text-muted hover:text-ink">⎘</button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard?.writeText(generatedUrl)}
                      className="flex-1 py-1.5 bg-accent text-white rounded-lg text-[13px] font-semibold">Copy Link</button>
                    <a href={generatedUrl} target="_blank" rel="noreferrer"
                      className="px-4 py-1.5 bg-surface border border-white/14 rounded-lg text-[13px] font-semibold text-muted hover:text-ink">Open →</a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Invoice list */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="font-semibold text-sm">All Invoices</div>
              <div className="flex gap-1">
                {(["all","pending","paid","expired"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md text-[12px] font-semibold capitalize transition-all
                      ${filter===f ? "bg-surface2 text-ink border border-white/14" : "text-muted hover:text-ink"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-muted text-sm">No invoices</div>
              ) : [...filtered].reverse().map(inv => (
                <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-white/8 last:border-0 hover:bg-surface2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold">{inv.description}</div>
                    <div className="text-[11.5px] text-muted font-mono">#{inv.id}</div>
                  </div>
                  <div className="font-mono text-[14px] font-semibold">{formatUsdc(inv.amount)} USDC</div>
                  <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${statusColor[inv.status]}`}>
                    {inv.status === "paid" ? "✓ Paid" : inv.status === "expired" ? "✗ Expired" : "● Pending"}
                  </span>
                  <div className="flex gap-1.5">
                    <button onClick={() => navigator.clipboard?.writeText(buildUrl(inv))}
                      className="p-1.5 bg-surface2 border border-white/8 rounded-md text-muted hover:text-ink text-[13px]">⎘</button>
                    <button onClick={() => del(inv.id)}
                      className="p-1.5 bg-surface2 border border-white/8 rounded-md text-red hover:bg-red/10 text-[13px]">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
