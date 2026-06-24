"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { getPaymentHistory } from "@/lib/storage";
import { formatUsdc, shortAddr, timeAgo, ARC_EXPLORER } from "@/lib/arc";

export default function Customers() {
  const [hist, setHist] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (localStorage.getItem("arcWalletDisconnected") === "1") { setLoading(false); return; }

    async function load() {
      let merchantId = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}").merchantId;
      if (!merchantId) {
        const eth = (window as any).ethereum;
        const accs: string[] = eth ? await eth.request({ method: "eth_accounts" }).catch(() => []) : [];
        if (accs[0]) {
          try {
            const res = await fetch(`/api/merchants/by-wallet/${accs[0]}`);
            if (res.ok) { const { merchant } = await res.json(); merchantId = merchant?.merchantId; }
          } catch {}
        }
      }
      if (!merchantId) { setLoading(false); return; }
      try {
        const data = await fetch(`/api/transactions?merchantId=${merchantId}`).then(r => r.json());
        if (!data.txns) return;
        const normalized = data.txns.map((t: any) => ({ ...t, merchant: t.buyerWallet || t.merchant || t.merchantWallet || "unknown" }));
        const seen = new Set<string>();
        const deduped = normalized.filter((t: any) => { if (seen.has(t.txHash)) return false; seen.add(t.txHash); return true; });
        setHist(deduped);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  const map: Record<string, any> = {};
  hist.forEach(h => {
    const k = (h.merchant || "unknown").toLowerCase();
    if (!map[k]) map[k] = { addr: h.merchant || "unknown", total: 0, count: 0, lastTs: 0 };
    map[k].total += parseFloat(h.amount) || 0;
    map[k].count++;
    if (h.ts > map[k].lastTs) map[k].lastTs = h.ts;
  });
  const customers = Object.values(map)
    .sort((a, b) => b.total - a.total)
    .filter(c => !q || c.addr.toLowerCase().includes(q.toLowerCase()));

  const totalRev = customers.reduce((s, c) => s + c.total, 0);
  const totalTxs = customers.reduce((s, c) => s + c.count, 0);
  const aov = totalTxs ? totalRev / totalTxs : 0;

  return (
    <>
      <Topbar title="Customers" />
      <div className="p-4 lg:p-7 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-3.5 mb-6">
          <div className="bg-surface border border-white/8 rounded-2xl p-4">
            <div className="text-xs text-muted mb-1">Total Customers</div>
            <div className="text-2xl font-bold font-mono">{customers.length}</div>
          </div>
          <div className="bg-surface border border-white/8 rounded-2xl p-4">
            <div className="text-xs text-muted mb-1">Total Revenue</div>
            <div className="text-2xl font-bold font-mono text-green">{formatUsdc(totalRev)}</div>
          </div>
          <div className="bg-surface border border-white/8 rounded-2xl p-4">
            <div className="text-xs text-muted mb-1">Avg Order Value</div>
            <div className="text-2xl font-bold font-mono">{formatUsdc(aov)}</div>
          </div>
        </div>

        <div className="bg-surface border border-white/8 rounded-2xl overflow-x-auto">
          <div className="px-4 lg:px-5 py-4 border-b border-white/8 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div className="font-semibold text-sm">All Customers</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by address…"
              className="bg-surface2 border border-white/14 rounded-2xl px-3 py-1.5 text-[13px] text-ink outline-none focus:border-accent w-full sm:w-[220px]" />
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8">
                {["Wallet", "Payments", "Total Spent", "Avg Order", "Last Payment"].map(h => (
                  <th key={h} className="text-[11.5px] font-semibold text-muted uppercase tracking-[0.5px] px-5 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted text-sm">Loading…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted text-sm">No customers yet</td></tr>
              ) : customers.map((c, i) => (
                <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-surface2 transition-colors cursor-pointer"
                  onClick={() => window.open(`${ARC_EXPLORER}/address/${c.addr}`, "_blank")}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-purple/10 grid place-items-center text-[12px] font-bold text-purple font-mono shrink-0">
                        {c.addr.slice(2, 4).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold">{shortAddr(c.addr)}</div>
                        <div className="text-[11.5px] font-mono text-muted">{c.addr.slice(0, 14)}…</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[13px]">{c.count} payment{c.count > 1 ? "s" : ""}</td>
                  <td className="px-5 py-3.5 font-mono text-[13px] font-semibold text-green">+{formatUsdc(c.total)} USDC</td>
                  <td className="px-5 py-3.5 font-mono text-[12.5px]">{formatUsdc(c.total / c.count)} USDC</td>
                  <td className="px-5 py-3.5 text-[12px] text-muted">{timeAgo(c.lastTs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
