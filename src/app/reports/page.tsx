"use client";
import { useEffect, useState, useMemo } from "react";
import Topbar from "@/components/Topbar";
import {
  getPaymentHistory, getPayrollSessions, getRecurringInvoices, getRecurringPayments,
  PaymentHistory, PayrollSession, RecurringInvoice, RecurringPayment,
} from "@/lib/storage";
import { formatUsdc } from "@/lib/arc";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface TxRecord {
  txHash?: string; amount: number;
  type: "income" | "expense"; category: string; label: string; ts: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  revenue:"#3fb950", salary:"#0757f9", hosting:"#a371f7",
  domain:"#d29922", marketing:"#f85149", tools:"#00c0d8", other:"#7d8590",
};
const CATEGORY_LABELS: Record<string, string> = {
  revenue:"Revenue", salary:"Salary", hosting:"Hosting",
  domain:"Domain", marketing:"Marketing", tools:"Tools", other:"Other",
};

function buildLedger(
  payments: PaymentHistory[], sessions: PayrollSession[],
  recInvoices: RecurringInvoice[], recPayments: RecurringPayment[],
): TxRecord[] {
  const records: TxRecord[] = [];
  for (const p of payments) {
    records.push({ txHash: p.txHash, amount: parseFloat(p.amount)||0, type:"income", category:"revenue",
      label: p.orderId?.startsWith("INV-") ? `Invoice ${p.orderId}` : `Order ${p.orderId||"—"}`, ts: p.ts });
  }
  for (const s of sessions) {
    const paid = s.entries.filter(e => e.paid && e.paidAt);
    if (!paid.length) continue;
    const byTx: Record<string, { amount:number; ts:number }> = {};
    for (const e of paid) {
      const k = e.txHash || s.txHash || s.id;
      if (!byTx[k]) byTx[k] = { amount:0, ts: e.paidAt! };
      byTx[k].amount += parseFloat(e.amount)||0;
    }
    for (const [txHash,{amount,ts}] of Object.entries(byTx)) {
      records.push({ txHash, amount, type:"expense", category:"salary", label:`Payroll — ${s.title}`, ts });
    }
  }
  for (const inv of recInvoices) {
    const rp = recPayments.find(r => r.id === inv.recurringId);
    records.push({ txHash: inv.txHash, amount: parseFloat(inv.amount)||0, type:"expense",
      category: rp?.category || "other", label: `Recurring — ${inv.name}`, ts: inv.paidAt });
  }
  return records.sort((a,b) => b.ts - a.ts);
}

function monthKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function quarterKey(ts: number) {
  const d = new Date(ts);
  const q = Math.floor(d.getMonth()/3)+1;
  return `${d.getFullYear()}-Q${q}`;
}
function yearKey(ts: number) {
  return String(new Date(ts).getFullYear());
}

type Period = "monthly" | "quarterly" | "yearly";

export default function Reports() {
  const [ledger, setLedger] = useState<TxRecord[]>([]);
  const [period, setPeriod] = useState<Period>("monthly");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const payments = getPaymentHistory();
    const sessions = getPayrollSessions();
    const recInvoices = getRecurringInvoices();
    const recPayments = getRecurringPayments();
    setLedger(buildLedger(payments, sessions, recInvoices, recPayments));
  }, []);

  const keyFn = period === "monthly" ? monthKey : period === "quarterly" ? quarterKey : yearKey;

  // All available periods
  const allPeriods = useMemo(() => {
    const keys = new Set(ledger.map(r => keyFn(r.ts)));
    return Array.from(keys).sort((a,b) => b.localeCompare(a));
  }, [ledger, period]);

  // Auto-select latest period
  useEffect(() => {
    if (allPeriods.length && !selectedKey) setSelectedKey(allPeriods[0]);
  }, [allPeriods]);

  // Records in selected period
  const periodRecords = useMemo(() =>
    ledger.filter(r => keyFn(r.ts) === selectedKey),
    [ledger, selectedKey, period]
  );

  const income  = periodRecords.filter(r => r.type==="income").reduce((s,r) => s+r.amount, 0);
  const expense = periodRecords.filter(r => r.type==="expense").reduce((s,r) => s+r.amount, 0);
  const net     = income - expense;

  // Category breakdown
  const catBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of periodRecords) {
      map[r.category] = (map[r.category]||0) + r.amount;
    }
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [periodRecords]);

  // Last 6 periods bar chart
  const last6 = useMemo(() => {
    const keys = allPeriods.slice(0, 6).reverse();
    const inc = keys.map(k => ledger.filter(r => keyFn(r.ts)===k && r.type==="income").reduce((s,r)=>s+r.amount,0));
    const exp = keys.map(k => ledger.filter(r => keyFn(r.ts)===k && r.type==="expense").reduce((s,r)=>s+r.amount,0));
    return { keys, inc, exp };
  }, [ledger, allPeriods, period]);

  function exportCSV() {
    const rows = [["Date","Type","Category","Description","Amount (USDC)","Tx Hash"]];
    for (const r of periodRecords) {
      rows.push([
        new Date(r.ts).toLocaleDateString(),
        r.type, CATEGORY_LABELS[r.category]||r.category,
        r.label,
        r.amount.toFixed(2),
        r.txHash||"—",
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`nexmer-report-${selectedKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!mounted) return null;

  return (
    <>
      <Topbar title="Reports" />
      <div className="p-4 lg:p-7 flex-1 flex flex-col gap-5">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period type */}
          <div className="flex bg-surface border border-white/8 rounded-2xl overflow-hidden">
            {(["monthly","quarterly","yearly"] as Period[]).map(p => (
              <button key={p} onClick={() => { setPeriod(p); setSelectedKey(""); }}
                className={`px-4 py-2 text-[12.5px] font-semibold capitalize transition-colors
                  ${period===p ? "bg-accent/20 text-[#6ea8fe]" : "text-muted hover:text-ink"}`}>
                {p}
              </button>
            ))}
          </div>

          {/* Period selector */}
          <select value={selectedKey} onChange={e => setSelectedKey(e.target.value)}
            className="bg-surface border border-white/8 rounded-2xl px-3 py-2 text-[13px] text-ink outline-none cursor-pointer">
            {allPeriods.map(k => <option key={k} value={k}>{k}</option>)}
          </select>

          {/* Export */}
          <button onClick={exportCSV} disabled={!periodRecords.length}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 text-[#6ea8fe] rounded-2xl text-[12.5px] font-semibold hover:bg-accent/20 transition-colors disabled:opacity-40">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Export CSV
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label:"Income",       val: income,  color:"text-green",  icon:"↑" },
            { label:"Expense",      val: expense, color:"text-red",    icon:"↓" },
            { label:"Net P&L",      val: net,     color: net>=0 ? "text-green" : "text-red", icon:"=" },
            { label:"Transactions", val: periodRecords.length, color:"text-ink", icon:"#", raw: true },
          ].map(c => (
            <div key={c.label} className="bg-surface border border-white/8 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-[11px] font-bold ${c.color}`}>{c.icon}</span>
                <span className="text-[11px] text-muted uppercase tracking-wider">{c.label}</span>
              </div>
              <div className={`text-xl font-bold font-mono ${c.color}`}>
                {c.raw ? c.val : formatUsdc(c.val as number)}
                {!c.raw && <span className="text-[11px] font-normal text-muted ml-1">USDC</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          {/* Bar chart — last 6 periods */}
          <div className="bg-surface border border-white/8 rounded-2xl p-5">
            <div className="text-[13px] font-semibold mb-4">
              {period === "monthly" ? "Last 6 Months" : period === "quarterly" ? "Last 6 Quarters" : "Last 6 Years"}
            </div>
            <div className="h-48">
              <Bar
                data={{
                  labels: last6.keys,
                  datasets: [
                    { label:"Income",  data: last6.inc, backgroundColor:"rgba(63,185,80,0.6)",  borderRadius:4 },
                    { label:"Expense", data: last6.exp, backgroundColor:"rgba(248,81,73,0.55)", borderRadius:4 },
                  ],
                }}
                options={{
                  responsive:true, maintainAspectRatio:false,
                  plugins:{ legend:{ labels:{ color:"#7d8590", font:{ size:11 } } }, tooltip:{ backgroundColor:"#1c2330", titleColor:"#7d8590", bodyColor:"#e6edf3" } },
                  scales:{
                    x:{ grid:{color:"rgba(255,255,255,0.05)"}, ticks:{color:"#7d8590",font:{size:10}} },
                    y:{ grid:{color:"rgba(255,255,255,0.05)"}, ticks:{color:"#7d8590",font:{size:10}}, beginAtZero:true },
                  },
                }}
              />
            </div>
          </div>

          {/* Category breakdown */}
          <div className="bg-surface border border-white/8 rounded-2xl p-5">
            <div className="text-[13px] font-semibold mb-4">Breakdown by Category</div>
            {catBreakdown.length === 0
              ? <p className="text-muted text-sm">No transactions in this period.</p>
              : (
                <div className="flex flex-col gap-2.5">
                  {catBreakdown.map(([cat, amt]) => {
                    const total = catBreakdown.reduce((s,[,a])=>s+a,0);
                    const pct = total ? (amt/total*100).toFixed(0) : "0";
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{background: CATEGORY_COLORS[cat]||"#7d8590"}} />
                            <span className="text-ink">{CATEGORY_LABELS[cat]||cat}</span>
                          </div>
                          <span className="font-mono text-muted">{formatUsdc(amt)}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background: CATEGORY_COLORS[cat]||"#7d8590" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        </div>

        {/* Transaction table */}
        <div className="bg-surface border border-white/8 rounded-2xl overflow-x-auto">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <div className="text-[13px] font-semibold">Transactions — {selectedKey || "—"}</div>
            <div className="text-[11px] text-muted">{periodRecords.length} records</div>
          </div>
          {periodRecords.length === 0
            ? <div className="px-5 py-8 text-center text-muted text-sm">No transactions in this period.</div>
            : (
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] text-muted uppercase tracking-wider border-b border-white/6">
                    <th className="px-5 py-2.5 text-left font-semibold">Date</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Description</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Category</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Type</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {periodRecords.map((r, i) => (
                    <tr key={i} className="hover:bg-surface2/40 transition-colors">
                      <td className="px-5 py-3 text-[12px] text-muted whitespace-nowrap">
                        {new Date(r.ts).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-ink max-w-[200px] truncate">{r.label}</td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1.5 text-[11.5px]">
                          <span className="w-1.5 h-1.5 rounded-full" style={{background: CATEGORY_COLORS[r.category]||"#7d8590"}} />
                          <span className="text-muted">{CATEGORY_LABELS[r.category]||r.category}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg
                          ${r.type==="income" ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
                          {r.type==="income" ? "↑ Income" : "↓ Expense"}
                        </span>
                      </td>
                      <td className={`px-5 py-3 text-right font-mono text-[13px] font-semibold
                        ${r.type==="income" ? "text-green" : "text-red"}`}>
                        {r.type==="income" ? "+" : "-"}{formatUsdc(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>

      </div>
    </>
  );
}
