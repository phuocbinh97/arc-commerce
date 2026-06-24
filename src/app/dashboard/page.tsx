"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { PaymentHistory } from "@/lib/storage";
import { formatUsdc, shortAddr, timeAgo, ARC_EXPLORER } from "@/lib/arc";
import Link from "next/link";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from "chart.js";
import { Line } from "react-chartjs-2";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const UNIFIED_CHAINS = [
  { key: "Arc_Testnet",          label: "Arc",      color: "#0757f9", usdc: "0x3600000000000000000000000000000000000000", rpc: "https://rpc.testnet.arc.network" },
  { key: "Ethereum_Sepolia",     label: "Sepolia",  color: "#627eea", usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", rpc: "https://rpc.sepolia.org" },
  { key: "Base_Sepolia",         label: "Base",     color: "#0052ff", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", rpc: "https://sepolia.base.org" },
  { key: "Arbitrum_Sepolia",     label: "Arbitrum", color: "#12aaff", usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", rpc: "https://sepolia-rollup.arbitrum.io/rpc" },
  { key: "Optimism_Sepolia",     label: "OP",       color: "#ff0420", usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", rpc: "https://sepolia.optimism.io" },
  { key: "Polygon_Amoy_Testnet", label: "Polygon",  color: "#8247e5", usdc: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582", rpc: "https://rpc-amoy.polygon.technology" },
  { key: "Linea_Sepolia",        label: "Linea",    color: "#61dfff", usdc: "0xfece4462d57bd51a6a552365a011b95f0e16d9b7", rpc: "https://rpc.sepolia.linea.build" },
  { key: "Unichain_Sepolia",     label: "Unichain", color: "#ff007a", usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F", rpc: "https://sepolia.unichain.org" },
  { key: "Avalanche_Fuji",       label: "Avax",     color: "#e84142", usdc: "0x5425890298aed601595a70AB815c96711a31Bc65", rpc: "https://api.avax-test.network/ext/bc/C/rpc" },
];

async function fetchUsdcOn(chain: typeof UNIFIED_CHAINS[0], addr: string): Promise<string> {
  const data = "0x70a08231" + addr.toLowerCase().replace("0x","").padStart(64,"0");
  try {
    const res = await fetch(chain.rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[{ to: chain.usdc, data }, "latest"] }),
    }).then(r => r.json());
    const raw = res.result && res.result !== "0x" ? res.result : "0x0";
    return (Number(BigInt(raw)) / 1e6).toFixed(2);
  } catch { return "—"; }
}

export default function Dashboard() {
  const [hist, setHist] = useState<PaymentHistory[]>([]);
  const [range, setRange] = useState(7);
  const [mounted, setMounted] = useState(false);
  const [chainBals, setChainBals] = useState<Record<string, string>>({});
  const [poolBal, setPoolBal] = useState<string | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);

  useEffect(() => {
    setMounted(true);

    async function loadBalances() {
      let addr = localStorage.getItem("arcExpectedAddress") || "";
      if (!addr) {
        try {
          const eth = (window as any).ethereum;
          const accs: string[] = eth ? await eth.request({ method: "eth_accounts" }).catch(() => []) : [];
          if (accs[0]) addr = accs[0];
        } catch {}
      }
      if (!addr) return;
      checkPoolBalance(addr);
      Promise.all(UNIFIED_CHAINS.map(c => fetchUsdcOn(c, addr).then(bal => ({ key: c.key, bal }))))
        .then(results => {
          const bals: Record<string, string> = {};
          results.forEach(r => { bals[r.key] = r.bal; });
          setChainBals(bals);
        });
    }
    loadBalances();

    if (localStorage.getItem("arcWalletDisconnected") === "1") return;
    async function loadTxns() {
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
      if (!merchantId) return;
      const data = await fetch(`/api/transactions?merchantId=${merchantId}`).then(r => r.json()).catch(() => ({}));
      if (!data.txns) return;
      const normalized = data.txns.map((t: any) => ({ ...t, merchant: t.buyerWallet || t.merchant || t.merchantWallet || "unknown" }));
      const seen = new Set<string>();
      const deduped = normalized.filter((t: any) => { if (seen.has(t.txHash)) return false; seen.add(t.txHash); return true; });
      deduped.sort((a: any, b: any) => b.ts - a.ts);
      setHist(deduped);
    }
    loadTxns();
  }, []);

  async function checkPoolBalance(addrArg?: string) {
    setPoolLoading(true);
    try {
      let addr = addrArg || localStorage.getItem("arcExpectedAddress") || "";
      if (!addr) {
        const eth = (window as any).ethereum;
        const accs: string[] = eth ? await eth.request({ method: "eth_accounts" }).catch(() => []) : [];
        if (accs[0]) addr = accs[0];
      }
      if (!addr) { setPoolBal("—"); setPoolLoading(false); return; }
      const { AppKit } = await import("@circle-fin/app-kit") as any;
      const kit = new AppKit();
      const res = await kit.unifiedBalance.getBalances({
        token: "USDC",
        sources: { address: addr, chains: ["Arc_Testnet","Ethereum_Sepolia","Base_Sepolia","Arbitrum_Sepolia","Optimism_Sepolia"] },
      });
      setPoolBal(parseFloat(res?.totalConfirmedBalance ?? "0").toFixed(2));
    } catch { setPoolBal("—"); }
    setPoolLoading(false);
  }

  const filtered = range >= 90 ? hist : hist.filter(h => h.ts >= Date.now() - range * 86400000);
  const total = hist.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
  const periodTotal = filtered.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
  const customers = new Set(filtered.map(h => h.merchant)).size;
  const aov = filtered.length ? periodTotal / filtered.length : 0;
  const totalAcrossChains = Object.values(chainBals).filter(b => b !== "—" && b !== "…").reduce((s, b) => s + (parseFloat(b) || 0), 0);

  const days = range >= 90 ? 30 : range;
  const labels: string[] = [];
  const revenueData: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const end = d.getTime() + 86400000;
    const sum = hist.filter(h => h.ts >= d.getTime() && h.ts < end).reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    revenueData.push(parseFloat(sum.toFixed(2)));
  }

  if (!mounted) return null;

  const stats = [
    { label: "Total Revenue", value: formatUsdc(total),       unit: "USDC", sub: `${hist.length} txns all time`, icon: "💰" },
    { label: "This Period",   value: formatUsdc(periodTotal), unit: "USDC", sub: `${filtered.length} tx in range`, icon: "📅" },
    { label: "Transactions",  value: String(filtered.length), unit: "",     sub: `avg ${formatUsdc(aov)} USDC/tx`, icon: "⚡" },
    { label: "Customers",     value: String(customers),       unit: "",     sub: "unique wallets",                 icon: "👥" },
  ];

  return (
    <>
      <Topbar title="Overview" action={{ label: "+ New Invoice", href: "/invoices" }} />
      <div className="p-4 lg:p-7 flex-1 flex flex-col gap-5 lg:gap-6">

        {/* ── UNIFIED BALANCE HERO ── */}
        <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-5 flex flex-col lg:flex-row lg:items-start gap-6 border-b border-white/8">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[12px] font-black uppercase tracking-widest text-white">Unified Pool Balance</span>
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-green font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse inline-block" />Circle CCTP
                </span>
              </div>
              <div className="flex items-end gap-3 mb-1">
                <span className="font-mono text-[52px] lg:text-[60px] font-black leading-none tracking-tight text-ink">
                  {poolBal === null ? "—" : poolBal}
                </span>
                <span className="text-[18px] text-muted font-semibold mb-2">USDC</span>
                <button onClick={() => checkPoolBalance()} disabled={poolLoading}
                  className={`mb-2 text-muted hover:text-white transition-all text-[14px] ${poolLoading ? "animate-spin" : ""}`}>↻</button>
              </div>
              <p className="text-[12px] text-muted mb-5">Spendable to any chain instantly · no bridging needed</p>
              <div className="flex gap-2.5 flex-wrap">
                <Link href="/unified-balance" className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-accent text-white text-[13px] font-bold hover:bg-accent/85 transition-all">⬇ Deposit</Link>
                <Link href="/unified-balance?tab=spend" className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-surface2 border border-white/8 text-ink text-[13px] font-semibold hover:bg-surface2/80 transition-all">⬆ Spend</Link>
              </div>
              {totalAcrossChains > 0 && poolBal !== null && (
                <div className="mt-3 text-[11px] text-amber flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" />
                  {totalAcrossChains.toFixed(2)} USDC on-chain available to deposit
                </div>
              )}
            </div>
            <div className="lg:max-w-[220px] bg-surface2 border border-white/8 rounded-2xl px-4 py-3.5">
              <div className="text-[12px] font-bold text-ink mb-1">What is Unified Balance?</div>
              <div className="text-[11px] text-muted leading-relaxed">
                One pool, all chains. Deposit USDC from anywhere — customers pay you from any chain, funds arrive here automatically via Circle's CCTP.
              </div>
            </div>
          </div>

          {/* Chain balance pills */}
          <div className="px-5 py-4">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">
              On-chain USDC · {Object.keys(chainBals).length > 0 ? `${totalAcrossChains.toFixed(2)} total` : "loading…"}
            </div>
            <div className="flex flex-wrap gap-2">
              {UNIFIED_CHAINS.map(c => {
                const bal = chainBals[c.key] ?? "…";
                const hasBalance = bal !== "—" && bal !== "…" && parseFloat(bal) > 0;
                return (
                  <div key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface2 border border-white/8">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="text-[11px] text-muted">{c.label}</span>
                    <span className={`font-mono text-[12px] font-bold ${hasBalance ? "text-green" : "text-muted/40"}`}>{bal}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-muted uppercase tracking-widest">Payments</h2>
            <div className="flex gap-1 bg-surface2 border border-white/8 rounded-xl p-1">
              {[7, 30, 90].map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all ${range === r ? "bg-accent text-white" : "text-muted hover:text-ink"}`}>
                  {r >= 90 ? "All" : `${r}d`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map(s => (
              <div key={s.label} className="bg-surface border border-white/8 rounded-2xl p-4">
                <div className="text-2xl mb-2">{s.icon}</div>
                <div className="text-[11px] font-medium text-muted mb-1">{s.label}</div>
                <div className="text-[26px] font-black font-mono leading-none text-ink mb-1">
                  {s.value}{s.unit && <span className="text-[13px] text-muted font-sans font-medium ml-1">{s.unit}</span>}
                </div>
                {s.sub && <div className="text-[11px] text-muted">{s.sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Chart + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div>
                <div className="font-semibold text-[14px]">Revenue</div>
                <div className="text-[11px] text-muted mt-0.5">Last {days} days</div>
              </div>
              <div className="text-[11px] text-muted font-mono">{formatUsdc(periodTotal)} USDC</div>
            </div>
            <div className="p-5 h-[220px]">
              <Line data={{
                labels,
                datasets: [{ data: revenueData, borderColor: "#0757f9", backgroundColor: "rgba(7,87,249,0.1)", borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: "#0757f9", tension: 0.45, fill: true }],
              }} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1c2330", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, titleColor: "#7d8590", bodyColor: "#e6edf3", padding: 10, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.parsed.y} USDC` } } },
                scales: {
                  x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#7d8590", font: { size: 11 } } },
                  y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#7d8590", font: { size: 11 }, callback: v => v + " U" }, beginAtZero: true },
                },
              }} />
            </div>
          </div>

          <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="font-semibold text-[14px]">Recent Activity</div>
              <Link href="/checkout" className="text-[11px] text-accent hover:underline font-semibold">View all</Link>
            </div>
            <div className="flex flex-col">
              {hist.length === 0 ? (
                <div className="text-center py-12 text-muted text-sm">
                  <div className="text-3xl mb-2">📭</div>
                  <p>No payments yet.<br /><Link href="/shop" className="text-accent">Try the demo shop →</Link></p>
                </div>
              ) : hist.slice(0, 6).map((h, i) => (
                <a key={i} href={`${ARC_EXPLORER}/tx/${h.txHash}`} target="_blank" rel="noreferrer"
                  className={`flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors ${i < 5 ? "border-b border-white/8" : ""}`}>
                  <div className="w-9 h-9 rounded-xl bg-green/10 border border-green/15 grid place-items-center text-sm shrink-0">✅</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{h.orderId || "Payment"}</div>
                    <div className="text-[11px] text-muted">{timeAgo(h.ts)} · {shortAddr(h.merchant)}</div>
                  </div>
                  <div className="font-mono text-[13px] font-bold text-green">+{formatUsdc(h.amount)}</div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8">
              <div className="font-semibold text-[14px]">Recent Transactions</div>
              <div className="text-[11px] text-muted mt-0.5">On-chain payments via ArcScan</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8">
                    {["Order","Amount","Tx","Time","Status"].map(h => (
                      <th key={h} className="text-[11px] font-semibold text-muted uppercase tracking-wider px-4 py-2.5 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-muted text-sm">
                      No transactions yet. <Link href="/shop" className="text-accent">Make a test payment →</Link>
                    </td></tr>
                  ) : filtered.slice(0, 8).map((h, i) => (
                    <tr key={i} className={`hover:bg-surface2 transition-colors cursor-pointer ${i < 7 ? "border-b border-white/8" : ""}`}
                      onClick={() => window.open(`${ARC_EXPLORER}/tx/${h.txHash}`, "_blank")}>
                      <td className="px-4 py-3 text-[12.5px] font-medium">{h.orderId || "—"}</td>
                      <td className="px-4 py-3 font-mono text-[12.5px] font-bold text-green">+{formatUsdc(h.amount)}</td>
                      <td className="px-4 py-3">
                        <a href={`${ARC_EXPLORER}/tx/${h.txHash}`} target="_blank" rel="noreferrer"
                          className="text-accent font-mono text-[11.5px] hover:underline" onClick={e => e.stopPropagation()}>
                          {h.txHash ? h.txHash.slice(0,8)+"…" : "—"}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-muted">{timeAgo(h.ts)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-green/10 border border-green/15 text-green text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-green" />Confirmed
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 font-semibold text-[14px]">Quick Actions</div>
              <div className="p-4 grid grid-cols-2 gap-2.5">
                {[
                  { icon: "🧾", label: "New Invoice", desc: "Create payment link", href: "/invoices" },
                  { icon: "🛍️", label: "Demo Shop",   desc: "Test checkout flow",  href: "/shop" },
                  { icon: "🏦", label: "Treasury",    desc: "Swap stablecoins",    href: "/treasury" },
                  { icon: "🌉", label: "Bridge",      desc: "Cross-chain USDC",    href: "/bridge" },
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    className="flex items-center gap-3 p-3.5 bg-surface2 border border-white/8 rounded-2xl hover:border-white/16 hover:bg-surface2/80 transition-all group">
                    <div className="w-9 h-9 rounded-xl bg-accent/10 grid place-items-center text-lg shrink-0 transition-transform group-hover:scale-110">{a.icon}</div>
                    <div>
                      <div className="text-[12.5px] font-semibold">{a.label}</div>
                      <div className="text-[11px] text-muted">{a.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden flex-1">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div className="font-semibold text-[14px]">Top Customers</div>
                <span className="text-[11px] text-muted">by spend</span>
              </div>
              <div className="p-4 flex flex-col gap-1">
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
                  return Object.values(map).sort((a,b) => b.total - a.total).slice(0,4).map((c,i,arr) => (
                    <div key={i} className={`flex items-center gap-3 py-2.5 ${i < arr.length-1 ? "border-b border-white/8" : ""}`}>
                      <div className="w-9 h-9 rounded-xl bg-purple/10 border border-purple/15 grid place-items-center text-[12px] font-bold text-purple font-mono shrink-0">
                        {c.addr.slice(2,4).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold">{shortAddr(c.addr)}</div>
                        <div className="text-[11px] text-muted">{c.count} payment{c.count>1?"s":""}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[13px] font-bold text-green">+{formatUsdc(c.total)}</div>
                        <div className="text-[10px] text-muted">USDC</div>
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
