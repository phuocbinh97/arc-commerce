/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import {
  getRecurringPayments, saveRecurringPayments, getRecurringInvoices,
  saveRecurringInvoice, RecurringPayment, RecurringInvoice,
} from "@/lib/storage";
import {
  fetchGasPrice, waitForReceipt, parseUsdcErc20, shortAddr,
  ARC_EXPLORER, timeAgo, MULTICALL3FROM, encodeBatchTransfers,
  USDC_ADDRESS, KIT_KEY,
} from "@/lib/arc";

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
  if (interval === "test") return from + 60 * 1000;
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
    const todayDow = now.getDay() || 7;
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
  if (diff < 0)   return { label: `Overdue ${Math.abs(days)}d`, color: "text-red",   urgent: true };
  if (days === 0) return { label: "Due today",                   color: "text-amber", urgent: true };
  if (days <= 3)  return { label: `Due in ${days}d`,            color: "text-amber", urgent: false };
  return             { label: `Due in ${days}d`,                 color: "text-muted", urgent: false };
}

const DAYS_OF_WEEK = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const EMPTY_FORM = { name: "", category: "hosting", recipientWallet: "", amount: "", interval: "monthly", payDay: "1", payWeekday: "1", totalPeriods: "", notes: "" };

// ─── Pay Method Modal ────────────────────────────────────────────────────────

function PayModal({ rec, onClose, onPaid }: {
  rec: RecurringPayment;
  onClose: () => void;
  onPaid: (rec: RecurringPayment, txHash: string) => void;
}) {
  const { account, isConnected, isArcNetwork, connect, switchToArc } = useWallet();
  const [method, setMethod] = useState<"unified" | "onchain">("unified");
  const [status, setStatus] = useState("");
  const [busy, setBusy]     = useState(false);
  const [poolBalance, setPoolBalance] = useState<string | null>(null);

  // Load pool balance for display
  useEffect(() => {
    (async () => {
      try {
        const eth = (window as any).ethereum;
        if (!eth || !account) return;
        const { AppKit } = await import("@circle-fin/app-kit");
        const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
        const kit = new AppKit();
        const adapter = await createAdapterFromProvider({ provider: eth });
        const res: any = await kit.unifiedBalance.getBalance({ adapter, token: "USDC" });
        const bal = res?.balance ?? res?.total ?? res?.amount ?? null;
        setPoolBalance(bal ? Number(bal).toFixed(2) : "0.00");
      } catch {
        setPoolBalance(null);
      }
    })();
  }, [account]);

  async function ensureReady() {
    if (!isConnected) await connect();
    if (!isArcNetwork) await switchToArc();
  }

  async function payUnified() {
    await ensureReady();
    const eth = (window as any).ethereum;
    if (!eth) return;
    setBusy(true);
    setStatus("Loading Circle SDK…");
    try {
      const { AppKit } = await import("@circle-fin/app-kit");
      const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
      const kit = new AppKit();
      const adapter = await createAdapterFromProvider({ provider: eth });
      const amt = Number(rec.amount).toFixed(2);
      setStatus("Confirm in MetaMask (sign + burn)…");
      const result: any = await kit.unifiedBalance.spend({
        from:   { adapter, allocations: [{ amount: amt, chain: "Arc_Testnet" }] },
        to:     { chain: "Arc_Testnet", recipientAddress: rec.recipientWallet, useForwarder: true },
        token:  "USDC",
        amount: amt,
        config: { kitKey: `KIT_KEY:${KIT_KEY}` },
      });
      const txHash: string = result?.burnTxHash || result?.txHash || result?.hash || "ub_" + Date.now();
      setStatus("✅ Paid via Unified Balance!");
      onPaid(rec, txHash);
      setTimeout(onClose, 1500);
    } catch (e: any) {
      const msg: string = e?.message || "Failed";
      setStatus("❌ " + (msg.length > 80 ? msg.slice(0, 80) + "…" : msg));
      setBusy(false);
    }
  }

  async function payOnChain() {
    await ensureReady();
    const eth = (window as any).ethereum;
    if (!eth) return;
    setBusy(true);
    setStatus("Sending USDC on-chain…");
    try {
      const accs = await eth.request({ method: "eth_accounts" });
      const from = accs[0];
      const units = parseUsdcErc20(rec.amount);
      const data = `0xa9059cbb${rec.recipientWallet.toLowerCase().replace("0x","").padStart(64,"0")}${units.toString(16).padStart(64,"0")}`;
      const gas = await fetchGasPrice(eth);
      const txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: USDC_ADDRESS, value: "0x0", data, ...gas }],
      });
      setStatus("Confirming on Arc…");
      await waitForReceipt(eth, txHash);
      setStatus("✅ Paid on-chain!");
      onPaid(rec, txHash);
      setTimeout(onClose, 1500);
    } catch (e: any) {
      const msg: string = e?.message || "Failed";
      setStatus("❌ " + (msg.length > 80 ? msg.slice(0, 80) + "…" : msg));
      setBusy(false);
    }
  }

  const hasEnoughPool = poolBalance !== null && Number(poolBalance) >= Number(rec.amount);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[440px] bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <div className="font-bold text-[15px] text-white">Pay Schedule</div>
            <div className="text-[12px] text-[#7d8590] mt-0.5">{rec.name} · {rec.amount} USDC</div>
          </div>
          <button onClick={onClose} disabled={busy}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#7d8590] hover:text-white hover:bg-[#1c2330] transition-colors disabled:opacity-40">
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {/* Recipient */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-[#0d1117] rounded-xl border border-white/8">
            <span className="text-[12px] text-[#7d8590]">To</span>
            <span className="font-mono text-[12px] text-[#e6edf3]">{shortAddr(rec.recipientWallet)}</span>
          </div>

          {/* Method selector */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider">Payment Method</div>

            {/* Unified Balance option */}
            <button onClick={() => setMethod("unified")} disabled={busy}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all
                ${method === "unified"
                  ? "bg-[#0757f9]/10 border-[#0757f9]/40"
                  : "bg-[#0d1117] border-white/8 hover:border-white/16"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors
                ${method === "unified" ? "border-[#0757f9]" : "border-white/20"}`}>
                {method === "unified" && <div className="w-2 h-2 rounded-full bg-[#0757f9]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-semibold text-white">Unified Balance</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0757f9]/20 text-[#6ea8fe] font-semibold">Recommended</span>
                </div>
                <div className="text-[11.5px] text-[#7d8590]">
                  Spend from your Circle pool · Cross-chain · No Arc USDC needed
                </div>
                {poolBalance !== null && (
                  <div className={`mt-1.5 text-[11.5px] font-medium ${hasEnoughPool ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                    Pool: {poolBalance} USDC {!hasEnoughPool && `(need ${rec.amount})`}
                  </div>
                )}
                {poolBalance === null && (
                  <div className="mt-1.5 text-[11.5px] text-[#7d8590]">Loading pool balance…</div>
                )}
              </div>
            </button>

            {/* On-chain option */}
            <button onClick={() => setMethod("onchain")} disabled={busy}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all
                ${method === "onchain"
                  ? "bg-white/5 border-white/20"
                  : "bg-[#0d1117] border-white/8 hover:border-white/16"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors
                ${method === "onchain" ? "border-white/60" : "border-white/20"}`}>
                {method === "onchain" && <div className="w-2 h-2 rounded-full bg-white/60" />}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-white mb-0.5">On-Chain Transfer</div>
                <div className="text-[11.5px] text-[#7d8590]">
                  Direct USDC transfer on Arc Testnet · Uses your Arc wallet balance
                </div>
              </div>
            </button>
          </div>

          {/* Status */}
          {status && (
            <div className={`px-3 py-2.5 rounded-xl text-[12.5px] border ${
              status.startsWith("✅") ? "bg-[#3fb950]/8 text-[#3fb950] border-[#3fb950]/20" :
              status.startsWith("❌") ? "bg-[#f85149]/8 text-[#f85149] border-[#f85149]/20" :
              "bg-[#1c2330] text-[#7d8590] border-white/8"
            }`}>
              {status}
            </div>
          )}

          {/* Pay button */}
          <button
            onClick={method === "unified" ? payUnified : payOnChain}
            disabled={busy || (method === "unified" && poolBalance !== null && !hasEnoughPool)}
            className="w-full py-3 bg-[#0757f9] text-white rounded-xl text-[14px] font-bold disabled:opacity-40 hover:bg-[#0757f9]/90 transition-colors">
            {busy ? status.replace("✅ ","").replace("❌ ","") || "Processing…" :
              method === "unified" ? `Pay ${rec.amount} USDC via Unified Balance` : `Pay ${rec.amount} USDC On-Chain`}
          </button>

          {method === "unified" && !hasEnoughPool && poolBalance !== null && (
            <div className="text-center text-[11.5px] text-[#7d8590]">
              Not enough pool balance —{" "}
              <a href="/unified-balance" className="text-[#0757f9] hover:underline">deposit on Unified Balance page</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Recurring() {
  const { account, isConnected, isArcNetwork, connect, switchToArc } = useWallet();
  const [payments, setPayments]     = useState<RecurringPayment[]>([]);
  const [invoices, setInvoices]     = useState<RecurringInvoice[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [tab, setTab]               = useState<"schedules" | "invoices">("schedules");
  const [payingRec, setPayingRec]   = useState<RecurringPayment | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");

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
      payDay, payWeekday, totalPeriods,
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

  // Called by PayModal after successful payment
  function handlePaid(rec: RecurringPayment, txHash: string) {
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
  }

  // Batch pay all due — on-chain only (1 tx via Multicall)
  const payAllDue = useCallback(async () => {
    if (!isConnected) { await connect(); return; }
    if (!isArcNetwork) { await switchToArc(); return; }
    const eth = (window as any).ethereum;
    if (!eth) return;
    const due = payments.filter(p => p.status === "active" && p.nextDueDate <= Date.now() + 86400000);
    if (due.length === 0) return;
    setBatchPaying(true);
    setBatchStatus(`Building batch for ${due.length} payment${due.length > 1 ? "s" : ""}…`);
    try {
      const accs = await eth.request({ method: "eth_accounts" });
      const from = accs[0];
      const calls = due.map(rec => ({
        recipient: rec.recipientWallet as `0x${string}`,
        units: parseUsdcErc20(rec.amount),
      }));
      const batchData = encodeBatchTransfers(calls);
      const gasLimit = "0x" + Math.min(due.length * 80000 + 60000, 2_000_000).toString(16);
      const gas = await fetchGasPrice(eth);
      setBatchStatus(`Confirm ${due.length} payments in 1 MetaMask tx…`);
      const txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: MULTICALL3FROM, value: "0x0", data: batchData, gas: gasLimit, ...gas }],
      });
      setBatchStatus("Confirming on Arc…");
      await waitForReceipt(eth, txHash);
      const now = Date.now();
      const updatedPayments = payments.map(p => {
        if (!due.find(d => d.id === p.id)) return p;
        const newPaid = (p.paidPeriods || 0) + 1;
        const done = p.totalPeriods && newPaid >= p.totalPeriods;
        saveRecurringInvoice({
          id: "inv_" + Math.random().toString(36).slice(2, 9),
          recurringId: p.id, name: p.name,
          recipientWallet: p.recipientWallet, amount: p.amount,
          txHash, paidAt: now,
        });
        return { ...p, paidPeriods: newPaid,
          nextDueDate: done ? p.nextDueDate : nextDue(now, p.interval, p.payDay),
          status: (done ? "completed" : p.status) as RecurringPayment["status"] };
      });
      saveRecurringPayments(updatedPayments);
      setPayments(updatedPayments);
      setInvoices(getRecurringInvoices());
      setBatchStatus(`✅ ${due.length} payments sent in 1 tx!`);
      setTimeout(() => setBatchStatus(""), 5000);
    } catch (e: any) {
      const msg: string = e?.message || "";
      setBatchStatus(msg.includes("reject") || msg.includes("cancel") ? "Batch cancelled." : `❌ ${msg.slice(0, 80) || "Batch failed"}`);
      setTimeout(() => setBatchStatus(""), 5000);
    } finally { setBatchPaying(false); }
  }, [isConnected, isArcNetwork, connect, switchToArc, payments]);

  const visiblePayments = isConnected ? payments : [];
  const active    = visiblePayments.filter(p => p.status === "active");
  const paused    = visiblePayments.filter(p => p.status === "paused");
  const completed = visiblePayments.filter(p => p.status === "completed");
  const dueNow    = active.filter(p => p.nextDueDate <= Date.now() + 86400000);
  const upcoming  = active.filter(p => p.nextDueDate > Date.now() + 86400000);
  const visibleInvoices = isConnected ? invoices : [];

  return (
    <>
      <Topbar title="Recurring Payments" action={{ label: "+ New Schedule", onClick: () => setShowForm(true) }} />
      <div className="p-4 lg:p-7 flex-1">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          {[
            { label: "Active",         value: active.length,          color: "text-[#3fb950]"  },
            { label: "Due / Overdue",  value: dueNow.length,          color: dueNow.length > 0 ? "text-[#d29922]" : "text-[#e6edf3]" },
            { label: "Completed",      value: completed.length,       color: "text-[#a371f7]"  },
            { label: "Total Invoices", value: visibleInvoices.length, color: "text-[#0757f9]"  },
          ].map(s => (
            <div key={s.label} className="bg-[#161b22] border border-white/8 rounded-xl p-4">
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[12.5px] text-[#7d8590] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* New schedule form — modal overlay */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-[#161b22] border border-white/10 rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}>

              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between sticky top-0 bg-[#161b22] z-10">
                <div>
                  <div className="font-bold text-[15px] text-white">New Recurring Payment</div>
                  <div className="text-[12px] text-[#7d8590] mt-0.5">Schedule automatic USDC payments</div>
                </div>
                <button onClick={() => setShowForm(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#7d8590] hover:text-white hover:bg-[#1c2330] transition-colors">
                  ✕
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Name</label>
                    <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
                      placeholder="e.g. Shopify Hosting"
                      className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] transition-colors" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Category</label>
                    <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}
                      className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] transition-colors">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Recipient Wallet</label>
                  <input value={form.recipientWallet} onChange={e => setForm(f=>({...f,recipientWallet:e.target.value}))}
                    placeholder="0x…"
                    className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] font-mono outline-none focus:border-[#0757f9] transition-colors" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Amount (USDC)</label>
                    <input type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))}
                      placeholder="50.00"
                      className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] transition-colors" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Interval</label>
                    <select value={form.interval} onChange={e => setForm(f=>({...f,interval:e.target.value}))}
                      className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] transition-colors">
                      {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">
                    Number of payments <span className="normal-case font-normal text-[#7d8590]">(blank = unlimited)</span>
                  </label>
                  <input type="number" min="1" value={form.totalPeriods} onChange={e => setForm(f=>({...f,totalPeriods:e.target.value}))}
                    placeholder="e.g. 12"
                    className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] transition-colors" />
                </div>

                {form.interval === "weekly" && (
                  <div>
                    <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Payment day of week</label>
                    <div className="flex gap-1.5">
                      {DAYS_OF_WEEK.map((d, i) => (
                        <button key={d} type="button" onClick={() => setForm(f=>({...f,payWeekday:String(i+1)}))}
                          className={`flex-1 h-9 rounded-lg text-[12px] font-semibold border transition-colors
                            ${form.payWeekday===String(i+1) ? "bg-[#0757f9] text-white border-[#0757f9]" : "bg-[#0d1117] border-white/14 text-[#7d8590] hover:text-[#e6edf3]"}`}>
                          {d.slice(0,2)}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] text-[#7d8590] mt-1.5">
                      Next due: <span className="text-[#e6edf3] font-medium">{(() => {
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
                  <div>
                    <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Payment day of month</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[1,5,10,15,20,25,28].map(d => (
                        <button key={d} type="button" onClick={() => setForm(f=>({...f,payDay:String(d)}))}
                          className={`w-10 h-9 rounded-lg text-[13px] font-semibold border transition-colors
                            ${form.payDay===String(d) ? "bg-[#0757f9] text-white border-[#0757f9]" : "bg-[#0d1117] border-white/14 text-[#7d8590] hover:text-[#e6edf3]"}`}>
                          {d}
                        </button>
                      ))}
                      <input type="number" min="1" max="28" value={form.payDay}
                        onChange={e => setForm(f=>({...f,payDay:e.target.value}))} placeholder="day"
                        className="w-16 bg-[#0d1117] border border-white/14 rounded-lg px-2 py-1.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] text-center" />
                    </div>
                    <div className="text-[11px] text-[#7d8590] mt-1.5">
                      Next due: <span className="text-[#e6edf3] font-medium">
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

                <div>
                  <label className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
                  <input value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
                    placeholder="e.g. Invoice #1234, KOL contract…"
                    className="w-full bg-[#0d1117] border border-white/14 rounded-xl px-3 py-2.5 text-[13px] text-[#e6edf3] outline-none focus:border-[#0757f9] transition-colors" />
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={saveForm} disabled={!form.name||!form.recipientWallet||!form.amount}
                    className="flex-1 py-2.5 bg-[#0757f9] text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-[#0757f9]/90 transition-colors">
                    Save Schedule
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-5 py-2.5 border border-white/14 rounded-xl text-[13px] text-[#7d8590] hover:text-[#e6edf3] hover:border-white/20 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[#1c2330] p-1 rounded-xl w-fit">
          {(["schedules","invoices"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors
                ${tab===t ? "bg-[#161b22] text-[#e6edf3] shadow" : "text-[#7d8590] hover:text-[#e6edf3]"}`}>
              {t === "schedules"
                ? `Schedules (${visiblePayments.filter(p=>p.status!=="cancelled").length})`
                : `Invoice History (${visibleInvoices.length})`}
            </button>
          ))}
        </div>

        {tab === "schedules" && (
          <div className="flex flex-col gap-3">
            {/* Due now */}
            {dueNow.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[11.5px] font-bold text-[#d29922] uppercase tracking-wider">⚠ Due Now ({dueNow.length})</div>
                  <div className="flex flex-col items-end gap-1.5">
                    {batchStatus && (
                      <div className={`text-[12px] ${batchStatus.startsWith("✅")?"text-[#3fb950]":batchStatus.startsWith("❌")?"text-[#f85149]":"text-[#7d8590]"}`}>
                        {batchStatus}
                      </div>
                    )}
                    {dueNow.length > 1 && (
                      <button onClick={payAllDue} disabled={batchPaying}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d29922] text-[#0d1117] rounded-lg text-[12.5px] font-bold disabled:opacity-50 hover:bg-[#d29922]/90 transition-colors">
                        <span>⚡</span>
                        <span>{batchPaying ? "Batching…" : `Pay All ${dueNow.length} · 1 tx (on-chain)`}</span>
                      </button>
                    )}
                  </div>
                </div>
                {dueNow.map(rec => (
                  <RecurringRow key={rec.id} rec={rec} onPay={() => setPayingRec(rec)} onToggle={toggleStatus} />
                ))}
              </div>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-[#7d8590] uppercase tracking-wider mb-2.5">Upcoming</div>
                {upcoming.map(rec => (
                  <RecurringRow key={rec.id} rec={rec} onPay={() => setPayingRec(rec)} onToggle={toggleStatus} />
                ))}
              </div>
            )}

            {/* Paused */}
            {paused.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-[#7d8590] uppercase tracking-wider mb-2.5">Paused</div>
                {paused.map(rec => (
                  <RecurringRow key={rec.id} rec={rec} onPay={() => setPayingRec(rec)} onToggle={toggleStatus} />
                ))}
              </div>
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold text-[#a371f7] uppercase tracking-wider mb-2.5">✓ Completed</div>
                {completed.map(rec => (
                  <RecurringRow key={rec.id} rec={rec} onPay={() => setPayingRec(rec)} onToggle={toggleStatus} />
                ))}
              </div>
            )}

            {visiblePayments.filter(p=>p.status!=="cancelled").length === 0 && (
              <div className="bg-[#161b22] border border-white/8 rounded-xl p-12 text-center">
                <div className="text-4xl mb-3">↻</div>
                <div className="font-semibold text-[#e6edf3] mb-1">No recurring payments yet</div>
                <div className="text-sm text-[#7d8590] mb-4">Schedule hosting, domain, salary, marketing — any recurring USDC payment.</div>
                <button onClick={() => setShowForm(true)}
                  className="px-4 py-2 bg-[#0757f9] text-white rounded-xl text-[13px] font-semibold hover:bg-[#0757f9]/90 transition-colors">
                  + New Schedule
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "invoices" && (
          <div className="bg-[#161b22] border border-white/8 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
              <div className="font-semibold text-sm text-[#e6edf3]">Invoice History</div>
              <div className="text-[12px] text-[#7d8590]">{invoices.length} payments · On-chain receipts</div>
            </div>
            {visibleInvoices.length === 0 ? (
              <div className="p-12 text-center text-[#7d8590] text-sm">No invoices yet — pay a schedule to generate your first invoice.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8 text-[11.5px] font-semibold text-[#7d8590] uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Name</th>
                    <th className="px-5 py-3 text-left">Recipient</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-left">Paid</th>
                    <th className="px-5 py-3 text-left">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.map((inv, i) => (
                    <tr key={inv.id} className={`border-b border-white/8 last:border-0 hover:bg-[#1c2330] transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                      <td className="px-5 py-3 text-[13px] font-medium text-[#e6edf3]">{inv.name}</td>
                      <td className="px-5 py-3 font-mono text-[12px] text-[#7d8590]">{shortAddr(inv.recipientWallet)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] font-semibold text-[#3fb950]">{inv.amount} USDC</td>
                      <td className="px-5 py-3 text-[12px] text-[#7d8590]">{timeAgo(inv.paidAt)}</td>
                      <td className="px-5 py-3">
                        <a href={`${ARC_EXPLORER}/tx/${inv.txHash}`} target="_blank" rel="noreferrer"
                          className="font-mono text-[11.5px] text-[#0757f9] hover:underline">
                          {inv.txHash.startsWith("ub_") ? "Unified Balance" : inv.txHash.slice(0,10) + "…"}
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

      {/* Pay method modal */}
      {payingRec && (
        <PayModal
          rec={payingRec}
          onClose={() => setPayingRec(null)}
          onPaid={(rec, txHash) => { handlePaid(rec, txHash); }}
        />
      )}
    </>
  );
}

// ─── Row Component ───────────────────────────────────────────────────────────

function RecurringRow({ rec, onPay, onToggle }: {
  rec: RecurringPayment;
  onPay: () => void;
  onToggle: (id: string, s: "active"|"paused"|"cancelled") => void;
}) {
  const cat = catMeta(rec.category);
  const int = intMeta(rec.interval);
  const due = dueStatus(rec.nextDueDate);

  return (
    <div className="bg-[#161b22] border border-white/8 rounded-xl p-4 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 mb-2">
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-[#1c2330] grid place-items-center text-xl shrink-0">{cat.icon}</div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-semibold text-[13.5px] text-[#e6edf3] truncate">{rec.name}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#1c2330] border border-white/8 text-[#7d8590]">
            {int.label}
            {rec.payDay && ["monthly","quarterly","yearly"].includes(rec.interval) ? ` · day ${rec.payDay}` : ""}
            {rec.payWeekday && rec.interval === "weekly" ? ` · ${DAYS_OF_WEEK[rec.payWeekday-1]}` : ""}
          </span>
          {rec.totalPeriods ? (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${rec.paidPeriods >= rec.totalPeriods ? "bg-[#3fb950]/10 border-[#3fb950]/30 text-[#3fb950]" : "bg-[#1c2330] border-white/8 text-[#7d8590]"}`}>
              {rec.paidPeriods}/{rec.totalPeriods} paid
            </span>
          ) : null}
          {rec.status === "paused" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#d29922]/10 border border-[#d29922]/30 text-[#d29922]">Paused</span>}
        </div>
        <div className="flex items-center gap-2.5 text-[11.5px] text-[#7d8590]">
          <span className="font-mono">{shortAddr(rec.recipientWallet)}</span>
          {rec.status !== "completed" && <><span>·</span><span className={due.color}>{due.label}</span></>}
          {rec.notes && <><span>·</span><span className="truncate max-w-[180px]">{rec.notes}</span></>}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <div className="font-mono font-bold text-[15px] text-[#e6edf3]">
          {rec.amount} <span className="text-[11px] text-[#7d8590] font-normal">USDC</span>
        </div>
        <div className="text-[11px] text-[#7d8590]">per {int.label.toLowerCase()}</div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 shrink-0">
        {rec.status === "completed" ? (
          <span className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#a371f7]/10 border border-[#a371f7]/30 text-[#a371f7]">✓ Done</span>
        ) : (
          <>
            {rec.status === "active" && (
              <button onClick={onPay}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors
                  ${due.urgent
                    ? "bg-[#0757f9] text-white hover:bg-[#0757f9]/90"
                    : "bg-[#1c2330] border border-white/14 text-[#e6edf3] hover:border-white/25"}`}>
                Pay now
              </button>
            )}
            {rec.status === "active"
              ? <button onClick={() => onToggle(rec.id,"paused")} title="Pause"
                  className="px-2.5 py-1.5 rounded-lg text-[12px] text-[#7d8590] border border-white/8 hover:text-[#e6edf3] hover:border-white/16 transition-colors">⏸</button>
              : rec.status === "paused"
              ? <button onClick={() => onToggle(rec.id,"active")} title="Resume"
                  className="px-2.5 py-1.5 rounded-lg text-[12px] text-[#3fb950] border border-[#3fb950]/20 hover:bg-[#3fb950]/10 transition-colors">▶</button>
              : null}
            <button onClick={() => onToggle(rec.id,"cancelled")} title="Cancel"
              className="px-2.5 py-1.5 rounded-lg text-[12px] text-[#7d8590] border border-white/8 hover:text-[#f85149] hover:border-[#f85149]/20 transition-colors">✕</button>
          </>
        )}
      </div>
    </div>
  );
}
