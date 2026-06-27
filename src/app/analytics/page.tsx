"use client";
import { useEffect, useState, useMemo } from "react";
import Topbar from "@/components/Topbar";
import {
  getPaymentHistory, getPayrollSessions, getRecurringInvoices, getRecurringPayments,
  PaymentHistory, PayrollSession, RecurringInvoice, RecurringPayment,
} from "@/lib/storage";
import { formatUsdc, shortAddr, decodeMemoData, ARC_RPC } from "@/lib/arc";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Filler, Legend,
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Filler, Legend);

// ── Unified transaction record ────────────────────────────────────────────────
interface TxRecord {
  txHash?: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  label: string;
  ts: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue", salary: "Salary", hosting: "Hosting",
  domain: "Domain", marketing: "Marketing", tools: "Tools", other: "Other",
};
const CATEGORY_COLORS: Record<string, string> = {
  revenue:   "rgba(63,185,80,0.75)",
  salary:    "rgba(7,87,249,0.75)",
  hosting:   "rgba(163,113,247,0.75)",
  domain:    "rgba(210,153,34,0.75)",
  marketing: "rgba(248,81,73,0.75)",
  tools:     "rgba(0,192,216,0.75)",
  other:     "rgba(125,133,144,0.75)",
};

const CHART_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor:"#1c2330", borderColor:"rgba(255,255,255,0.1)", borderWidth:1, titleColor:"#7d8590", bodyColor:"#e6edf3" } },
  scales: { x: { grid:{color:"rgba(255,255,255,0.05)"}, ticks:{color:"#7d8590",font:{size:10}} }, y: { grid:{color:"rgba(255,255,255,0.05)"}, ticks:{color:"#7d8590",font:{size:10},callback:(v:any)=>v+" USDC"}, beginAtZero:true } },
};

function buildLedger(
  payments: PaymentHistory[],
  sessions: PayrollSession[],
  recInvoices: RecurringInvoice[],
  recPayments: RecurringPayment[],
): TxRecord[] {
  const records: TxRecord[] = [];

  // Income — checkout / invoice payments
  for (const p of payments) {
    records.push({
      txHash: p.txHash, amount: parseFloat(p.amount) || 0,
      type: "income", category: "revenue",
      label: p.orderId?.startsWith("INV-") ? `Invoice ${p.orderId}` : `Order ${p.orderId || "—"}`,
      ts: p.ts,
    });
  }

  // Expense — payroll sessions (batch tx, sum of paid entries)
  for (const s of sessions) {
    const paidEntries = s.entries.filter(e => e.paid && e.paidAt);
    if (!paidEntries.length) continue;
    const byTx: Record<string, { amount: number; ts: number }> = {};
    for (const e of paidEntries) {
      const k = e.txHash || s.txHash || s.id;
      if (!byTx[k]) byTx[k] = { amount: 0, ts: e.paidAt! };
      byTx[k].amount += parseFloat(e.amount) || 0;
    }
    for (const [txHash, { amount, ts }] of Object.entries(byTx)) {
      records.push({
        txHash, amount, type: "expense", category: "salary",
        label: `Payroll — ${s.title}`,
        ts,
      });
    }
  }

  // Expense — recurring payments
  const recMap: Record<string, RecurringPayment> = {};
  for (const r of recPayments) recMap[r.id] = r;
  for (const inv of recInvoices) {
    const parent = recMap[inv.recurringId];
    const category = parent?.category || "other";
    records.push({
      txHash: inv.txHash, amount: parseFloat(inv.amount) || 0,
      type: "expense", category,
      label: inv.name,
      ts: inv.paidAt,
    });
  }

  return records.sort((a, b) => b.ts - a.ts);
}

function monthKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function Analytics() {
  const [payments, setPayments]     = useState<PaymentHistory[]>([]);
  const [sessions, setSessions]     = useState<PayrollSession[]>([]);
  const [recInvs, setRecInvs]       = useState<RecurringInvoice[]>([]);
  const [recPmts, setRecPmts]       = useState<RecurringPayment[]>([]);
  const [range, setRange]           = useState(30);
  const [txFilter, setTxFilter]     = useState<"all" | "income" | "expense">("all");
  const [mounted, setMounted]       = useState(false);
  const [memoFeed, setMemoFeed]     = useState<{ txHash: string; amount: string; ts: number; memo: Record<string, unknown> }[]>([]);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (localStorage.getItem("arcWalletDisconnected") === "1") return;

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
      if (merchantId) {
        const data = await fetch(`/api/transactions?merchantId=${merchantId}`).then(r => r.json()).catch(() => ({}));
        if (data.txns) {
          const normalized = data.txns.map((t: any) => ({ ...t, merchant: t.buyerWallet || t.merchant || "unknown" }));
          const seen = new Set<string>();
          const deduped = normalized.filter((t: any) => { if (seen.has(t.txHash)) return false; seen.add(t.txHash); return true; });
          deduped.sort((a: any, b: any) => b.ts - a.ts);
          setPayments(deduped);
        }
      } else {
        setPayments(getPaymentHistory());
      }
      setSessions(getPayrollSessions());
      setRecInvs(getRecurringInvoices());
      setRecPmts(getRecurringPayments());
    }
    load();
  }, []);

  const ledger = useMemo(() => buildLedger(payments, sessions, recInvs, recPmts), [payments, sessions, recInvs, recPmts]);

  const cutoff = range >= 90 ? 0 : Date.now() - range * 86400000;
  const filtered = ledger.filter(r => r.ts >= cutoff);
  const shown = txFilter === "all" ? filtered : filtered.filter(r => r.type === txFilter);

  const totalIncome  = filtered.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const totalExpense = filtered.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const netPnL = totalIncome - totalExpense;

  // Daily income/expense for line chart
  const days = range >= 90 ? 30 : range;
  const dayLabels: string[] = [], incomePerDay: number[] = [], expensePerDay: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const start = d.getTime(); const end = start + 86400000;
    const dayRecs = filtered.filter(r => r.ts >= start && r.ts < end);
    dayLabels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    incomePerDay.push(+dayRecs.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0).toFixed(2));
    expensePerDay.push(+dayRecs.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0).toFixed(2));
  }

  // Monthly P&L — last 6 months
  const monthlyData = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const inc: Record<string, number> = {}, exp: Record<string, number> = {};
    for (const m of months) { inc[m] = 0; exp[m] = 0; }
    for (const r of ledger) {
      const k = monthKey(r.ts);
      if (!months.includes(k)) continue;
      if (r.type === "income") inc[k] = (inc[k] || 0) + r.amount;
      else exp[k] = (exp[k] || 0) + r.amount;
    }
    return { months, inc, exp };
  }, [ledger]);

  // Expense category breakdown
  const expenseCats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of filtered) {
      if (r.type !== "expense") continue;
      m[r.category] = (m[r.category] || 0) + r.amount;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // Memo feed
  useEffect(() => {
    if (payments.length === 0) return;
    Promise.all(payments.slice(0, 6).map(async h => {
      if (!h.txHash) return null;
      try {
        const res = await fetch(ARC_RPC, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_getTransactionByHash", params:[h.txHash] }),
        }).then(r => r.json());
        const raw = decodeMemoData(res.result?.input || "");
        if (!raw) return null;
        try { return { txHash: h.txHash, amount: h.amount, ts: h.ts, memo: JSON.parse(raw) }; }
        catch { return null; }
      } catch { return null; }
    })).then(r => setMemoFeed(r.filter((x): x is NonNullable<typeof x> => x !== null)));
  }, [payments]);

  function exportCsv() {
    const rows = [["Date","Time","Type","Category","Description","Amount (USDC)","Tx Hash"]];
    shown.forEach(r => {
      const d = new Date(r.ts);
      rows.push([
        d.toLocaleDateString("en-US"),
        d.toLocaleTimeString("en-US", { hour12: false }),
        r.type,
        CATEGORY_LABELS[r.category] || r.category,
        r.label,
        (r.type === "expense" ? "-" : "+") + r.amount.toFixed(6),
        r.txHash || "",
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `nexmer-${txFilter}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (!mounted) return null;

  return (
    <>
      <Topbar title="Analytics" />
      <div className="p-4 lg:p-7 flex-1">

        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <button onClick={exportCsv} disabled={shown.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-surface border border-white/8 text-muted hover:text-ink hover:border-white/14 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
          <div className="flex gap-1">
            {[7, 30, 90].map(r => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md text-[12.5px] font-semibold transition-all ${range === r ? "bg-surface2 text-ink border border-white/14" : "text-muted hover:text-ink"}`}>
                {r >= 90 ? "All" : `${r}d`}
              </button>
            ))}
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-3.5 mb-6">
          {([
            ["Total Income",  formatUsdc(totalIncome),            "USDC", "text-green"],
            ["Total Expense", formatUsdc(totalExpense),           "USDC", "text-red"],
            ["Net P&L",       (netPnL >= 0 ? "+" : "") + formatUsdc(Math.abs(netPnL)), "USDC", netPnL >= 0 ? "text-green" : "text-red"],
            ["Transactions",  String(filtered.length),            "records", "text-ink"],
          ] as [string,string,string,string][]).map(([l,v,u,cls]) => (
            <div key={l} className="bg-surface border border-white/8 rounded-2xl p-4">
              <div className="text-xs text-muted mb-2">{l}</div>
              <div className={`text-2xl font-bold font-mono tracking-tight ${cls}`}>{v}</div>
              <div className="text-xs text-muted mt-1">{u}</div>
            </div>
          ))}
        </div>

        {/* Revenue vs Expense trend + Monthly P&L */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-surface border border-white/8 rounded-2xl">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Cash Flow</div>
            <div className="p-5 h-[220px]">
              <Line data={{ labels: dayLabels, datasets: [
                { data: incomePerDay,  borderColor:"#3fb950", backgroundColor:"rgba(63,185,80,0.1)",  borderWidth:2, pointRadius:3, tension:0.4, fill:true, label:"Income"  },
                { data: expensePerDay, borderColor:"#f85149", backgroundColor:"rgba(248,81,73,0.08)", borderWidth:2, pointRadius:3, tension:0.4, fill:true, label:"Expense" },
              ]}} options={{ ...CHART_OPTS, plugins: { ...CHART_OPTS.plugins, legend: { display:true, labels:{color:"#7d8590",font:{size:11},boxWidth:10} } } }} />
            </div>
          </div>
          <div className="bg-surface border border-white/8 rounded-2xl">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Monthly P&L</div>
            <div className="p-5 h-[220px]">
              <Bar data={{ labels: monthlyData.months.map(monthLabel), datasets: [
                { label:"Income",  data: monthlyData.months.map(m => +monthlyData.inc[m].toFixed(2)), backgroundColor:"rgba(63,185,80,0.55)",  borderColor:"#3fb950", borderWidth:1, borderRadius:4 },
                { label:"Expense", data: monthlyData.months.map(m => +monthlyData.exp[m].toFixed(2)), backgroundColor:"rgba(248,81,73,0.45)", borderColor:"#f85149", borderWidth:1, borderRadius:4 },
              ]}} options={{ ...CHART_OPTS, plugins: { ...CHART_OPTS.plugins, legend: { display:true, labels:{color:"#7d8590",font:{size:11},boxWidth:10} } } }} />
            </div>
          </div>
        </div>

        {/* Category breakdown + Memo feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-surface border border-white/8 rounded-2xl">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Expense Breakdown</div>
            <div className="p-5">
              {expenseCats.length === 0 ? (
                <div className="text-center py-8 text-muted text-sm">No expense data yet</div>
              ) : (
                <div className="flex gap-4 items-center">
                  <div className="h-[160px] w-[160px] shrink-0">
                    <Doughnut data={{
                      labels: expenseCats.map(([c]) => CATEGORY_LABELS[c] || c),
                      datasets: [{ data: expenseCats.map(([,v]) => +v.toFixed(2)), backgroundColor: expenseCats.map(([c]) => CATEGORY_COLORS[c] || CATEGORY_COLORS.other), borderWidth:0 }],
                    }} options={{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }} />
                  </div>
                  <div className="flex-1 space-y-2">
                    {expenseCats.map(([cat, amt]) => (
                      <div key={cat} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other }} />
                        <div className="text-[12px] text-muted flex-1">{CATEGORY_LABELS[cat] || cat}</div>
                        <div className="font-mono text-[12px] font-semibold text-red">{formatUsdc(amt)}</div>
                      </div>
                    ))}
                    <div className="border-t border-white/8 pt-2 flex justify-between">
                      <span className="text-[12px] text-muted">Total expenses</span>
                      <span className="font-mono text-[12px] font-semibold text-red">{formatUsdc(totalExpense)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {memoFeed.length > 0 ? (
            <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">On-chain Memo Feed</div>
                  <div className="text-[11px] text-muted mt-0.5">Structured context via Arc Memo contract</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple/10 border border-purple/20 text-purple font-medium">Arc v0.7.2</span>
              </div>
              <div className="divide-y divide-white/8">
                {memoFeed.map((m, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-surface2/40 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12px]">
                        <span className="font-mono text-muted text-[11px]">{((m.memo?.ord || m.memo?.sid || "") as string).slice(0,24) || "—"}</span>
                        {m.memo?.lbl && <span className="ml-2 text-ink">{m.memo.lbl as string}</span>}
                      </div>
                      <span className="font-mono text-[12px] font-semibold text-green shrink-0">+{formatUsdc(m.amount)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-muted">{new Date(m.ts).toLocaleDateString()}</span>
                      <a href={`https://testnet.arcscan.app/tx/${m.txHash}`} target="_blank" rel="noreferrer"
                        className="font-mono text-[11px] text-accent hover:underline">{m.txHash.slice(0,10)}…</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-white/8 rounded-2xl">
              <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Income vs Expense</div>
              <div className="p-5 flex flex-col gap-3">
                {([["Income", totalIncome, "#3fb950"], ["Expense", totalExpense, "#f85149"]] as [string,number,string][]).map(([l,v,c]) => (
                  <div key={l}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span className="text-muted">{l}</span>
                      <span className="font-mono font-semibold" style={{color:c}}>{formatUsdc(v)}</span>
                    </div>
                    <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: totalIncome + totalExpense ? `${(v/(totalIncome+totalExpense)*100).toFixed(1)}%` : "0%",
                        background: c, opacity: 0.7,
                      }} />
                    </div>
                  </div>
                ))}
                <div className={`mt-2 text-center text-xl font-bold font-mono ${netPnL >= 0 ? "text-green" : "text-red"}`}>
                  {netPnL >= 0 ? "+" : ""}{formatUsdc(Math.abs(netPnL))} net
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Unified Transaction Ledger */}
        <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <div className="font-semibold text-sm">All Transactions</div>
            <div className="flex gap-1">
              {(["all","income","expense"] as const).map(f => (
                <button key={f} onClick={() => setTxFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all capitalize ${txFilter===f?"bg-surface2 text-ink border border-white/14":"text-muted hover:text-ink"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] font-semibold text-muted uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">Category</th>
                    <th className="px-4 py-2.5 text-left">Description</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-right">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-surface2/40 transition-colors">
                      <td className="px-4 py-3 text-muted text-[11px] whitespace-nowrap">
                        {new Date(r.ts).toLocaleDateString("en-US", {month:"short",day:"numeric"})}<br/>
                        <span className="text-muted/60">{new Date(r.ts).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:false})}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${r.type==="income"?"bg-green/10 text-green":"bg-red/10 text-red"}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{background: CATEGORY_COLORS[r.category]||CATEGORY_COLORS.other}} />
                          <span className="text-muted">{CATEGORY_LABELS[r.category]||r.category}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink max-w-[200px] truncate">{r.label}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${r.type==="income"?"text-green":"text-red"}`}>
                        {r.type==="income"?"+":"−"}{formatUsdc(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.txHash
                          ? <a href={`https://testnet.arcscan.app/tx/${r.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-accent hover:underline">{shortAddr(r.txHash)}</a>
                          : <span className="text-muted/40">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 50 && (
                <div className="px-5 py-3 text-[12px] text-muted border-t border-white/8">
                  Showing 50 of {shown.length} — export CSV for full history
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
