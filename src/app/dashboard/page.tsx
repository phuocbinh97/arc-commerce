"use client";
import { useEffect, useState, useRef } from "react";
import Topbar from "@/components/Topbar";
import { getPaymentHistory, PaymentHistory } from "@/lib/storage";
import { formatUsdc, shortAddr, timeAgo, ARC_EXPLORER } from "@/lib/arc";
import Link from "next/link";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Filler, BarElement,
} from "chart.js";
import { Line } from "react-chartjs-2";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, BarElement);

function StatCard({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="bg-surface border border-white/8 rounded-lg p-4 hover:border-white/14 transition-colors">
      <div className="text-xs font-medium text-muted mb-2">{label}</div>
      <div className="text-2xl font-bold font-mono tracking-tight leading-none mb-1.5">
        {value}{unit && <span className="text-sm text-muted font-sans font-medium ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [hist, setHist] = useState<PaymentHistory[]>([]);
  const [range, setRange] = useState(7);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Use Redis as source of truth (per-merchant isolation)
    const settings = JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
    const session = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}");
    // Show nothing when wallet is explicitly disconnected
    if (localStorage.getItem("arcWalletDisconnected") === "1") return;

    // Only use Redis when merchant session is active (requires wallet login)
    const merchantId = session.merchantId;

    if (!merchantId) {
      setHist(getPaymentHistory());
      return;
    }

    fetch(`/api/transactions?merchantId=${merchantId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.txns) return;
        const normalized = data.txns.map((t: any) => ({
          ...t,
          merchant: t.buyerWallet || t.merchant || t.merchantWallet || "unknown",
        }));
        const merged = [...normalized];
        const seen = new Set<string>();
        const deduped = merged.filter(t => {
          if (seen.has(t.txHash)) return false;
          seen.add(t.txHash); return true;
        });
        deduped.sort((a, b) => b.ts - a.ts);
        setHist(deduped);
      })
      .catch(console.error);
  }, []);

  const filtered = range >= 90 ? hist : hist.filter(h => h.ts >= Date.now() - range * 86400000);
  const total = hist.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
  const periodTotal = filtered.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
  const customers = new Set(filtered.map(h => h.merchant)).size;
  const aov = filtered.length ? periodTotal / filtered.length : 0;

  // Chart data
  const days = range >= 90 ? 30 : range;
  const labels: string[] = [];
  const revenueData: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const end = d.getTime() + 86400000;
    const sum = hist.filter(h => h.ts >= d.getTime() && h.ts < end)
      .reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    revenueData.push(parseFloat(sum.toFixed(2)));
  }

  if (!mounted) return null;

  return (
    <>
      <Topbar title="Overview" action={{ label: "+ New Invoice", href: "/invoices" }} />
      <div className="p-7 flex-1">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex gap-1">
            {[7, 30, 90].map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-md text-[12.5px] font-semibold transition-all
                  ${range === r ? "bg-surface2 text-ink border border-white/14" : "text-muted hover:text-ink"}`}>
                {r >= 90 ? "All" : `${r}d`}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          <StatCard label="💰 Total Revenue" value={formatUsdc(total)} unit="USDC" sub={`${hist.length} txns all time`} />
          <StatCard label="📅 This Period" value={formatUsdc(periodTotal)} unit="USDC" sub={`${filtered.length} tx in range`} />
          <StatCard label="⚡ Transactions" value={String(filtered.length)} sub={`avg ${formatUsdc(aov)} USDC/tx`} />
          <StatCard label="👥 Customers" value={String(customers)} sub="unique wallets" />
        </div>

        {/* Chart + Feed */}
        <div className="grid grid-cols-[1fr_360px] gap-3.5 mb-6">
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8">
              <div className="font-semibold text-sm">Revenue</div>
              <div className="text-xs text-muted mt-0.5">Last {range >= 90 ? 30 : range} days</div>
            </div>
            <div className="p-5 h-[240px]">
              <Line data={{
                labels,
                datasets: [{
                  data: revenueData,
                  borderColor: "#0757f9",
                  backgroundColor: "rgba(7,87,249,0.15)",
                  borderWidth: 2,
                  pointRadius: 3,
                  tension: 0.4,
                  fill: true,
                }],
              }} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: {
                  backgroundColor: "#1c2330", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1,
                  titleColor: "#7d8590", bodyColor: "#e6edf3",
                  callbacks: { label: ctx => ` ${ctx.parsed.y} USDC` },
                }},
                scales: {
                  x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#7d8590", font: { size: 11 } } },
                  y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#7d8590", font: { size: 11 }, callback: v => v + " USDC" }, beginAtZero: true },
                },
              }} />
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="font-semibold text-sm">Recent Activity</div>
              <Link href="/checkout" className="text-xs text-[#6ea8fe] hover:underline">View all</Link>
            </div>
            <div className="flex flex-col">
              {hist.length === 0 ? (
                <div className="text-center py-12 text-muted text-sm">
                  <div className="text-3xl mb-2">📭</div>
                  <p>No payments yet.<br /><Link href="/shop" className="text-[#6ea8fe]">Try the demo shop →</Link></p>
                </div>
              ) : hist.slice(0, 6).map((h, i) => (
                <a key={i} href={`${ARC_EXPLORER}/tx/${h.txHash}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 px-5 py-3 border-b border-white/8 last:border-0 hover:bg-surface2 transition-colors">
                  <div className="w-[34px] h-[34px] rounded-lg bg-green/10 grid place-items-center text-base shrink-0">✅</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{h.orderId || "Payment"}</div>
                    <div className="text-[11.5px] text-muted">{timeAgo(h.ts)} · {shortAddr(h.merchant)}</div>
                  </div>
                  <div className="font-mono text-[13px] font-medium text-green">+{formatUsdc(h.amount)}</div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: Table + Actions */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8">
              <div className="font-semibold text-sm">Recent Transactions</div>
              <div className="text-xs text-muted mt-0.5">On-chain payments via ArcScan</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8">
                    {["Order","Amount","Tx Hash","Time","Status"].map(h => (
                      <th key={h} className="text-[11.5px] font-semibold text-muted uppercase tracking-[0.5px] px-4 py-2.5 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-muted text-sm">
                      No transactions yet. <Link href="/shop" className="text-[#6ea8fe]">Make a test payment →</Link>
                    </td></tr>
                  ) : filtered.slice(0, 8).map((h, i) => (
                    <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-surface2 transition-colors cursor-pointer"
                      onClick={() => window.open(`${ARC_EXPLORER}/tx/${h.txHash}`, "_blank")}>
                      <td className="px-4 py-3 text-[13px]">{h.orderId || "—"}</td>
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-green">+{formatUsdc(h.amount)} USDC</td>
                      <td className="px-4 py-3">
                        <a href={`${ARC_EXPLORER}/tx/${h.txHash}`} target="_blank" rel="noreferrer"
                          className="text-[#6ea8fe] font-mono text-[12px] hover:underline" onClick={e => e.stopPropagation()}>
                          {h.txHash ? h.txHash.slice(0, 10) + "…" : "—"}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted">{new Date(h.ts).toLocaleString()}</td>
                      <td className="px-4 py-3"><span className="bg-green/10 text-green text-[11.5px] font-semibold px-2 py-0.5 rounded-full">● Confirmed</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-col gap-3.5">
            <div className="bg-surface border border-white/8 rounded-lg">
              <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Quick Actions</div>
              <div className="p-4 grid grid-cols-2 gap-2.5">
                {[
                  { icon: "⊕", label: "New Invoice", desc: "Create payment link", href: "/invoices" },
                  { icon: "⊟", label: "Demo Shop", desc: "Test checkout flow", href: "/shop" },
                  { icon: "◈", label: "Treasury", desc: "View USDC balance", href: "/treasury" },
                  { icon: "⇄", label: "Bridge", desc: "Cross-chain USDC", href: "/bridge" },
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    className="flex items-center gap-2.5 p-3.5 bg-surface2 border border-white/8 rounded-lg hover:border-accent hover:bg-accent/8 transition-all">
                    <div className="w-9 h-9 rounded-lg bg-accent/12 grid place-items-center text-lg shrink-0">{a.icon}</div>
                    <div>
                      <div className="text-[13px] font-semibold">{a.label}</div>
                      <div className="text-[11.5px] text-muted">{a.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Top customers */}
            <div className="bg-surface border border-white/8 rounded-lg flex-1">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div className="font-semibold text-sm">Top Customers</div>
                <span className="text-xs text-muted">by spend</span>
              </div>
              <div className="p-4">
                {hist.length === 0 ? (
                  <div className="text-center py-4 text-muted text-xs">No customers yet</div>
                ) : (() => {
                  const map: Record<string, { addr: string; total: number; count: number }> = {};
                  hist.forEach(h => {
                    const k = h.merchant || "unknown";
                    if (!map[k]) map[k] = { addr: k, total: 0, count: 0 };
                    map[k].total += parseFloat(h.amount) || 0;
                    map[k].count++;
                  });
                  return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 4).map((c, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/8 last:border-0">
                      <div className="w-[34px] h-[34px] rounded-lg bg-purple/10 grid place-items-center text-[13px] font-bold text-purple font-mono shrink-0">
                        {c.addr.slice(2, 4).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold">{shortAddr(c.addr)}</div>
                        <div className="text-[11px] text-muted">{c.count} payment{c.count > 1 ? "s" : ""}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[13px] font-semibold text-green">+{formatUsdc(c.total)}</div>
                        <div className="text-[11px] text-muted text-right">USDC</div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
