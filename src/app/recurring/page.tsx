/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import {
  getRecurringPayments, saveRecurringPayments, getRecurringInvoices,
  saveRecurringInvoice, RecurringPayment, RecurringInvoice,
} from "@/lib/storage";
import { USDC_ADDRESS, fetchGasPrice, waitForReceipt, parseUsdcErc20, shortAddr, ARC_EXPLORER, timeAgo } from "@/lib/arc";

const CATEGORIES = [
  { value: "hosting",   label: "Hosting",   icon: "🖥️" },
  { value: "domain",    label: "Domain",    icon: "🌐" },
  { value: "marketing", label: "Marketing", icon: "📢" },
  { value: "salary",    label: "Salary",    icon: "💼" },
  { value: "tools",     label: "Tools",     icon: "🔧" },
  { value: "other",     label: "Other",     icon: "📋" },
];

const INTERVALS = [
  { value: "test",      label: "Every minute (test)", days: 1/1440 },
  { value: "weekly",    label: "Weekly",              days: 7      },
  { value: "monthly",   label: "Monthly",             days: 30     },
  { value: "quarterly", label: "Quarterly",           days: 90     },
  { value: "yearly",    label: "Yearly",              days: 365    },
];

function catMeta(c: string) { return CATEGORIES.find(x => x.value === c) || CATEGORIES[5]; }
function intMeta(i: string) { return INTERVALS.find(x => x.value === i) || INTERVALS[1]; }

function nextDue(from: number, interval: string, payDay?: number): number {
  if (interval === "test") return from + 60 * 1000; // 1 minute
  if ((interval === "monthly" || interval === "quarterly" || interval === "yearly") && payDay) {
    const months = interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 12;
    const d = new Date(from);
    d.setMonth(d.getMonth() + months);
    d.setDate(Math.min(payDay, 28));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = intMeta(interval).days;
  return from + days * 86400 * 1000;
}

function nextDueFromNow(interval: string, payDay?: number, payWeekday?: number): number {
  if (interval === "test") return Date.now();
  if (interval === "weekly" && payWeekday) {
    const now = new Date();
    const todayDow = now.getDay() || 7; // 1=Mon..7=Sun
    let diff = payWeekday - todayDow;
    if (diff <= 0) diff += 7;
    const t = new Date(now);
    t.setDate(t.getDate() + diff);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }
  if ((interval === "monthly" || interval === "quarterly" || interval === "yearly") && payDay) {
    const now = new Date();
    const target = new Date();
    target.setDate(Math.min(payDay, 28));
    target.setHours(0, 0, 0, 0);
    if (target <= now) {
      const months = interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 12;
      target.setMonth(target.getMonth() + months);
    }
    return target.getTime();
  }
  return Date.now();
}

function dueStatus(nextDueDate: number): { label: string; color: string; urgent: boolean } {
  const diff = nextDueDate - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (diff < 0)       return { label: `Overdue ${Math.abs(days)}d`, color: "text-red",   urgent: true };
  if (days === 0)     return { label: "Due today",                   color: "text-amber", urgent: true };
  if (days <= 3)      return { label: `Due in ${days}d`,            color: "text-amber", urgent: false };
  return { label: `Due in ${days}d`,                                 color: "text-muted", urgent: false };
}

const DAYS_OF_WEEK = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const EMPTY_FORM = { name: "", category: "hosting", recipientWallet: "", amount: "", interval: "monthly", payDay: "1", payWeekday: "1", totalPeriods: "", notes: "" };

export default function Recurring() {
  const { account, isConnected, isArcNetwork, connect, switchToArc } = useWallet();
  const [payments, setPayments]   = useState<RecurringPayment[]>([]);
  const [invoices, setInvoices]   = useState<RecurringInvoice[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [tab, setTab]             = useState<"schedules" | "invoices">("schedules");
  const [paying, setPaying]       = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    setPayments(getRecurringPayments());
    setInvoices(getRecurringInvoices());
  }, []);

  function saveForm() {
    if (!form.name || !form.recipientWallet || !form.amount) return;
    const now = Date.now();
    const payDay = ["monthly","quarterly","yearly"].includes(form.interval) ? parseInt(form.payDay) : undefined;
    const payWeekday = form.interval === "weekly" ? parseInt(form.payWeekday) : undefined;
    const totalPeriods = form.totalPeriods ? parseInt(form.totalPeriods) : undefined;
    const rec: RecurringPayment = {
      id: "rec_" + Math.random().toString(36).slice(2, 9),
      name: form.name,
      category: form.category as RecurringPayment["category"],
      recipientWallet: form.recipientWallet,
      amount: form.amount,
      interval: form.interval as RecurringPayment["interval"],
      payDay,
      payWeekday,
      totalPeriods,
      paidPeriods: 0,
      startDate: now,
      nextDueDate: nextDueFromNow(form.interval, payDay, payWeekday),
      status: "active",
      notes: form.notes,
    };
    const updated = [rec, ...payments];
    saveRecurringPayments(updated);
    setPayments(updated);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function toggleStatus(id: string, newStatus: "active" | "paused" | "cancelled") {
    const updated = payments.map(p => p.id === id ? { ...p, status: newStatus } : p);
    saveRecurringPayments(updated);
    setPayments(updated);
  }

  const payNow = useCallback(async (rec: RecurringPayment) => {
    if (!isConnected) { await connect(); return; }
    if (!isArcNetwork) { await switchToArc(); return; }
    const eth = (window as any).ethereum;
    if (!eth) return;
    setPaying(rec.id);
    setPayStatus(s => ({ ...s, [rec.id]: "Sending USDC…" }));
    try {
      const accs = await eth.request({ method: "eth_accounts" });
      const from = accs[0];
      const units = parseUsdcErc20(rec.amount);
      // Direct USDC transfer — no hub needed
      const data = `0xa9059cbb${rec.recipientWallet.toLowerCase().replace("0x","").padStart(64,"0")}${units.toString(16).padStart(64,"0")}`;
      const gas = await fetchGasPrice(eth);
      const txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: USDC_ADDRESS, value: "0x0", data, ...gas }],
      });
      setPayStatus(s => ({ ...s, [rec.id]: "Confirming…" }));
      await waitForReceipt(eth, txHash);

      // Save invoice
      const inv: RecurringInvoice = {
        id: "inv_" + Math.random().toString(36).slice(2, 9),
        recurringId: rec.id,
        name: rec.name,
        recipientWallet: rec.recipientWallet,
        amount: rec.amount,
        txHash,
        paidAt: Date.now(),
      };
      saveRecurringInvoice(inv);
      setInvoices(getRecurringInvoices());

      // Advance next due date, increment paidPeriods, auto-cancel if done
      const updated = payments.map(p => {
        if (p.id !== rec.id) return p;
        const newPaid = (p.paidPeriods || 0) + 1;
        const done = p.totalPeriods && newPaid >= p.totalPeriods;
        return {
          ...p,
          paidPeriods: newPaid,
          nextDueDate: done ? p.nextDueDate : nextDue(Date.now(), p.interval, p.payDay),
          status: done ? "completed" as const : p.status,
        };
      });
      saveRecurringPayments(updated);
      setPayments(updated);
      setPayStatus(s => ({ ...s, [rec.id]: "✅ Paid!" }));
      setTimeout(() => setPayStatus(s => { const n={...s}; delete n[rec.id]; return n; }), 3000);
    } catch (e: any) {
      setPayStatus(s => ({ ...s, [rec.id]: `❌ ${e?.message?.slice(0,60) || "Failed"}` }));
      setTimeout(() => setPayStatus(s => { const n={...s}; delete n[rec.id]; return n; }), 4000);
    } finally { setPaying(null); }
  }, [isConnected, isArcNetwork, connect, switchToArc, payments]);

  const visiblePayments = isConnected ? payments : [];
  const active    = visiblePayments.filter(p => p.status === "active");
  const paused    = visiblePayments.filter(p => p.status === "paused");
  const completed = visiblePayments.filter(p => p.status === "completed");
  const dueNow    = active.filter(p => p.nextDueDate <= Date.now() + 86400000); // due within 24h
  const upcoming  = active.filter(p => p.nextDueDate > Date.now() + 86400000);
  const visibleInvoices = isConnected ? invoices : [];

  return (
    <>
      <Topbar title="Recurring Payments" action={{ label: "+ New Schedule", onClick: () => setShowForm(true) }} />
      <div className="p-7 flex-1">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Active",        value: active.length,         color: "text-green"  },
            { label: "Due / Overdue", value: dueNow.length,         color: dueNow.length > 0 ? "text-amber" : "text-ink" },
            { label: "Completed",     value: completed.length,      color: "text-purple" },
            { label: "Total Invoices",value: visibleInvoices.length, color: "text-accent" },
          ].map(s => (
            <div key={s.label} className="bg-surface border border-white/8 rounded-lg p-4">
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[12.5px] text-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* New schedule form */}
        {showForm && (
          <div className="bg-surface border border-accent/30 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-sm">New Recurring Payment</div>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink text-lg">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Name</label>
                <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
                  placeholder="e.g. Shopify Hosting" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Category</label>
                <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}
                  className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Recipient Wallet</label>
              <input value={form.recipientWallet} onChange={e => setForm(f=>({...f,recipientWallet:e.target.value}))}
                placeholder="0x…" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Amount (USDC)</label>
                <input type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))}
                  placeholder="50.00" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Interval</label>
                <select value={form.interval} onChange={e => setForm(f=>({...f,interval:e.target.value}))}
                  className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Number of payments <span className="normal-case font-normal">(leave blank = unlimited)</span></label>
              <input type="number" min="1" value={form.totalPeriods} onChange={e => setForm(f=>({...f,totalPeriods:e.target.value}))}
                placeholder="e.g. 12" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
            </div>
            {form.interval === "weekly" && (
              <div className="mb-3">
                <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Payment day of week</label>
                <div className="flex gap-1.5">
                  {DAYS_OF_WEEK.map((d, i) => (
                    <button key={d} type="button" onClick={() => setForm(f=>({...f,payWeekday:String(i+1)}))}
                      className={`w-10 h-9 rounded-lg text-[12px] font-semibold border transition-colors
                        ${form.payWeekday===String(i+1) ? "bg-accent text-white border-accent" : "bg-surface2 border-white/14 text-muted hover:text-ink"}`}>
                      {d.slice(0,2)}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted mt-1.5">
                  Next due: <span className="text-ink font-medium">{(() => {
                    const dow = parseInt(form.payWeekday);
                    const now = new Date();
                    const todayDow = now.getDay() || 7;
                    let diff = dow - todayDow; if (diff <= 0) diff += 7;
                    const t = new Date(now); t.setDate(t.getDate() + diff);
                    return t.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"short" });
                  })()}</span>
                </div>
              </div>
            )}
            {["monthly","quarterly","yearly"].includes(form.interval) && (
              <div className="mb-3">
                <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Payment day of month</label>
                <div className="flex flex-wrap gap-1.5">
                  {[1,5,10,15,20,25,28].map(d => (
                    <button key={d} type="button" onClick={() => setForm(f=>({...f,payDay:String(d)}))}
                      className={`w-10 h-9 rounded-lg text-[13px] font-semibold border transition-colors
                        ${form.payDay===String(d) ? "bg-accent text-white border-accent" : "bg-surface2 border-white/14 text-muted hover:text-ink"}`}>
                      {d}
                    </button>
                  ))}
                  <input type="number" min="1" max="28" value={form.payDay}
                    onChange={e => setForm(f=>({...f,payDay:e.target.value}))}
                    placeholder="day"
                    className="w-16 bg-surface2 border border-white/14 rounded-lg px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent text-center" />
                </div>
                <div className="text-[11px] text-muted mt-1.5">
                  Next due: <span className="text-ink font-medium">
                    {(() => {
                      const d = parseInt(form.payDay);
                      if (!d) return "—";
                      const t = new Date(); t.setDate(Math.min(d,28)); t.setHours(0,0,0,0);
                      if (t <= new Date()) { t.setMonth(t.getMonth() + (form.interval === "yearly" ? 12 : form.interval === "quarterly" ? 3 : 1)); }
                      return t.toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" });
                    })()}
                  </span>
                </div>
              </div>
            )}
            <div className="mb-4">
              <label className="text-[11.5px] font-semibold text-muted uppercase mb-1 block">Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
                placeholder="e.g. Invoice #1234, KOL contract..." className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveForm} disabled={!form.name||!form.recipientWallet||!form.amount}
                className="px-5 py-2 bg-accent text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:bg-accent/90">
                Save Schedule
              </button>
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border border-white/14 rounded-lg text-[13px] text-muted hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-surface2 p-1 rounded-lg w-fit">
          {(["schedules","invoices"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-colors capitalize
                ${tab===t ? "bg-surface text-ink shadow" : "text-muted hover:text-ink"}`}>
              {t === "schedules" ? `Schedules (${visiblePayments.filter(p=>p.status!=="cancelled").length})` : `Invoice History (${visibleInvoices.length})`}
            </button>
          ))}
        </div>

        {tab === "schedules" && (
          <div className="flex flex-col gap-3">
            {/* Due now */}
            {dueNow.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-amber uppercase tracking-wider mb-2">⚠ Due Now</div>
                {dueNow.map(rec => <RecurringRow key={rec.id} rec={rec} paying={paying} payStatus={payStatus} onPay={payNow} onToggle={toggleStatus} />)}
              </div>
            )}
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-muted uppercase tracking-wider mb-2">Upcoming</div>
                {upcoming.map(rec => <RecurringRow key={rec.id} rec={rec} paying={paying} payStatus={payStatus} onPay={payNow} onToggle={toggleStatus} />)}
              </div>
            )}
            {/* Paused */}
            {paused.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-muted uppercase tracking-wider mb-2">Paused</div>
                {paused.map(rec => <RecurringRow key={rec.id} rec={rec} paying={paying} payStatus={payStatus} onPay={payNow} onToggle={toggleStatus} />)}
              </div>
            )}
            {/* Completed */}
            {completed.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-purple uppercase tracking-wider mb-2">✓ Completed</div>
                {completed.map(rec => <RecurringRow key={rec.id} rec={rec} paying={paying} payStatus={payStatus} onPay={payNow} onToggle={toggleStatus} />)}
              </div>
            )}
            {visiblePayments.filter(p=>p.status!=="cancelled").length === 0 && (
              <div className="bg-surface border border-white/8 rounded-xl p-12 text-center">
                <div className="text-4xl mb-3">↻</div>
                <div className="font-semibold text-ink mb-1">No recurring payments yet</div>
                <div className="text-sm text-muted mb-4">Schedule hosting, domain, salary, marketing — any recurring USDC payment.</div>
                <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-[13px] font-semibold">+ New Schedule</button>
              </div>
            )}
          </div>
        )}

        {tab === "invoices" && (
          <div className="bg-surface border border-white/8 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
              <div className="font-semibold text-sm">Invoice History</div>
              <div className="text-[12px] text-muted">{invoices.length} payments · On-chain receipts</div>
            </div>
            {visibleInvoices.length === 0 ? (
              <div className="p-12 text-center text-muted text-sm">No invoices yet — pay a schedule to generate your first invoice.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8 text-[11.5px] font-semibold text-muted uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Name</th>
                    <th className="px-5 py-3 text-left">Recipient</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-left">Paid</th>
                    <th className="px-5 py-3 text-left">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.map((inv, i) => (
                    <tr key={inv.id} className={`border-b border-white/8 last:border-0 hover:bg-surface2 transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                      <td className="px-5 py-3 text-[13px] font-medium text-ink">{inv.name}</td>
                      <td className="px-5 py-3 font-mono text-[12px] text-muted">{shortAddr(inv.recipientWallet)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] font-semibold text-green">{inv.amount} USDC</td>
                      <td className="px-5 py-3 text-[12px] text-muted">{timeAgo(inv.paidAt)}</td>
                      <td className="px-5 py-3">
                        <a href={`${ARC_EXPLORER}/tx/${inv.txHash}`} target="_blank" rel="noreferrer"
                          className="font-mono text-[11.5px] text-accent hover:underline">
                          {inv.txHash.slice(0,10)}…
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function RecurringRow({ rec, paying, payStatus, onPay, onToggle }: {
  rec: RecurringPayment;
  paying: string | null;
  payStatus: Record<string, string>;
  onPay: (r: RecurringPayment) => void;
  onToggle: (id: string, s: "active"|"paused"|"cancelled") => void;
}) {
  const cat  = catMeta(rec.category);
  const int  = intMeta(rec.interval);
  const due  = dueStatus(rec.nextDueDate);
  const busy = paying === rec.id;
  const st   = payStatus[rec.id];

  return (
    <div className="bg-surface border border-white/8 rounded-xl p-4 flex items-center gap-4">
      {/* Category icon */}
      <div className="w-10 h-10 rounded-lg bg-surface2 grid place-items-center text-xl shrink-0">{cat.icon}</div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-[13.5px] text-ink truncate">{rec.name}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface2 border border-white/14 text-muted">
            {int.label}
            {rec.payDay && ["monthly","quarterly","yearly"].includes(rec.interval) ? ` · day ${rec.payDay}` : ""}
            {rec.payWeekday && rec.interval === "weekly" ? ` · ${DAYS_OF_WEEK[rec.payWeekday-1]}` : ""}
          </span>
          {rec.totalPeriods ? (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${rec.paidPeriods >= rec.totalPeriods ? "bg-green/10 border-green/30 text-green" : "bg-surface2 border-white/14 text-muted"}`}>
              {rec.paidPeriods}/{rec.totalPeriods} paid
            </span>
          ) : null}
          {rec.status === "paused" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber/10 border border-amber/30 text-amber">Paused</span>}
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-muted">
          <span className="font-mono">{shortAddr(rec.recipientWallet)}</span>
          {rec.status !== "completed" && <><span>·</span><span className={due.color}>{due.label}</span></>}
          {rec.notes && <><span>·</span><span className="truncate max-w-[200px]">{rec.notes}</span></>}
        </div>
        {st && <div className={`mt-1 text-[12px] ${st.startsWith("✅")?"text-green":st.startsWith("❌")?"text-red":"text-muted"}`}>{st}</div>}
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <div className="font-mono font-bold text-[15px] text-ink">{rec.amount} <span className="text-[11px] text-muted font-normal">USDC</span></div>
        <div className="text-[11px] text-muted">per {int.label.toLowerCase()}</div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 shrink-0">
        {rec.status === "completed" ? (
          <span className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-purple/10 border border-purple/30 text-purple">✓ Done</span>
        ) : (
          <>
            {rec.status === "active" && (
              <button onClick={() => onPay(rec)} disabled={busy}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors
                  ${due.urgent ? "bg-accent text-white hover:bg-accent/90" : "bg-surface2 border border-white/14 text-ink hover:bg-surface"}
                  disabled:opacity-50`}>
                {busy ? "Paying…" : "Pay now"}
              </button>
            )}
            {rec.status === "active"
              ? <button onClick={() => onToggle(rec.id,"paused")} className="px-2.5 py-1.5 rounded-lg text-[12px] text-muted border border-white/8 hover:text-ink">⏸</button>
              : rec.status === "paused"
              ? <button onClick={() => onToggle(rec.id,"active")} className="px-2.5 py-1.5 rounded-lg text-[12px] text-green border border-green/20 hover:bg-green/10">▶</button>
              : null}
            <button onClick={() => onToggle(rec.id,"cancelled")} className="px-2.5 py-1.5 rounded-lg text-[12px] text-muted border border-white/8 hover:text-red">✕</button>
          </>
        )}
      </div>
    </div>
  );
}
