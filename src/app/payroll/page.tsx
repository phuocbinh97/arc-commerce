/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import {
  getPayrollSessions, savePayrollSessions, getContacts,
  PayrollSession, PayrollEntry, Contact,
} from "@/lib/storage";
import {
  fetchGasPrice, waitForReceipt, MULTICALL3FROM,
  encodeBatchTransfers, parseUsdcErc20, formatUsdc, timeAgo, ARC_EXPLORER,
} from "@/lib/arc";

function genId() { return "prl_" + Math.random().toString(36).slice(2, 10); }

export default function Payroll() {
  const { isConnected, connect, getProvider } = useWallet();
  const [sessions, setSessions]     = useState<PayrollSession[]>([]);
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [view, setView]             = useState<"list" | "session">("list");
  const [active, setActive]         = useState<PayrollSession | null>(null);

  // New session form
  const [showNew, setShowNew]       = useState(false);
  const [newTitle, setNewTitle]     = useState("");
  const [newDesc, setNewDesc]       = useState("");
  const [pickedIds, setPickedIds]   = useState<Set<string>>(new Set());
  const [entryAmts, setEntryAmts]   = useState<Record<string, string>>({});

  // Pay status
  const [paying, setPaying]         = useState(false);
  const [payStatus, setPayStatus]   = useState("");

  useEffect(() => {
    setSessions(getPayrollSessions());
    setContacts(getContacts());
  }, []);

  // ── Create session ──────────────────────────────────────────────────────────
  function createSession() {
    if (!newTitle.trim()) return;
    const entries: PayrollEntry[] = contacts
      .filter(c => pickedIds.has(c.id))
      .map(c => ({
        contactId: c.id, name: c.name, wallet: c.wallet,
        amount: entryAmts[c.id] || "0", paid: false,
      }))
      .filter(e => parseFloat(e.amount) > 0);
    if (entries.length === 0) return;

    const session: PayrollSession = {
      id: genId(), title: newTitle.trim(), description: newDesc.trim() || undefined,
      entries, createdAt: Date.now(), status: "draft",
    };
    const list = [session, ...sessions];
    savePayrollSessions(list); setSessions(list);
    setShowNew(false); setNewTitle(""); setNewDesc(""); setPickedIds(new Set()); setEntryAmts({});
    openSession(session);
  }

  // ── Open session ────────────────────────────────────────────────────────────
  function openSession(s: PayrollSession) {
    setActive(s); setView("session");
  }

  // ── Pay unpaid entries (1 Multicall tx) ────────────────────────────────────
  async function payUnpaid() {
    if (!active) return;
    if (!isConnected) { connect(); return; }
    const unpaid = active.entries.filter(e => !e.paid && parseFloat(e.amount) > 0);
    if (unpaid.length === 0) return;

    setPaying(true); setPayStatus(`Building ${unpaid.length}-recipient batch…`);
    const eth = getProvider();
    if (!eth) { setPaying(false); return; }
    try {
      const accs: string[] = await eth.request({ method: "eth_accounts" });
      const from = accs[0];

      // Ensure Arc network
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x4CEF52" }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x4CEF52", chainName: "Arc Testnet", rpcUrls: ["https://rpc.testnet.arc.network"], nativeCurrency: { name:"USDC",symbol:"USDC",decimals:18 }, blockExplorerUrls:["https://testnet.arcscan.app"] }] });
        } else throw e;
      }

      const calls = unpaid.map(e => ({
        recipient: e.wallet as `0x${string}`,
        units: parseUsdcErc20(e.amount),
      }));
      const batchData = encodeBatchTransfers(calls);
      const gasLimit = "0x" + Math.min(unpaid.length * 80000 + 60000, 2_000_000).toString(16);
      const gas = await fetchGasPrice(eth);

      setPayStatus(`Confirm ${unpaid.length} payments in 1 MetaMask tx…`);
      const txHash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: MULTICALL3FROM, value: "0x0", data: batchData, gas: gasLimit, ...gas }],
      });
      setPayStatus("Confirming on Arc…");
      await waitForReceipt(eth, txHash);

      // Mark entries paid
      const now = Date.now();
      const updatedEntries = active.entries.map(e => {
        if (!e.paid && unpaid.find(u => u.contactId === e.contactId && u.wallet === e.wallet)) {
          return { ...e, paid: true, txHash, paidAt: now };
        }
        return e;
      });
      const allPaid = updatedEntries.every(e => e.paid);
      const updated: PayrollSession = {
        ...active, entries: updatedEntries,
        status: allPaid ? "paid" : "partial",
        txHash: allPaid ? txHash : active.txHash,
        paidAt: allPaid ? now : active.paidAt,
      };
      const list = sessions.map(s => s.id === updated.id ? updated : s);
      savePayrollSessions(list); setSessions(list); setActive(updated);
      setPayStatus("");
    } catch (e: any) {
      setPayStatus("Error: " + (e.message || "Failed"));
    }
    setPaying(false);
  }

  function deleteSession(id: string) {
    const list = sessions.filter(s => s.id !== id);
    savePayrollSessions(list); setSessions(list);
    if (active?.id === id) { setActive(null); setView("list"); }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalPaid    = (s: PayrollSession) => s.entries.filter(e=>e.paid).reduce((x,e)=>x+parseFloat(e.amount),0);
  const totalUnpaid  = (s: PayrollSession) => s.entries.filter(e=>!e.paid).reduce((x,e)=>x+parseFloat(e.amount),0);
  const totalAll     = (s: PayrollSession) => s.entries.reduce((x,e)=>x+parseFloat(e.amount),0);

  const statusColor = (s: PayrollSession["status"]) =>
    s === "paid" ? "text-green bg-green/10 border-green/20"
    : s === "partial" ? "text-amber bg-amber/10 border-amber/20"
    : "text-muted bg-white/5 border-white/10";

  // ── Render ──────────────────────────────────────────────────────────────────
  if (view === "session" && active) {
    const unpaidCount = active.entries.filter(e => !e.paid).length;
    const paidCount   = active.entries.filter(e => e.paid).length;
    return (
      <>
        <Topbar title="Payroll" />
        <div className="p-4 lg:p-7 flex-1 max-w-[720px]">
          {/* Back + header */}
          <button onClick={() => setView("list")} className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink mb-5 transition-colors">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            All sessions
          </button>

          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[18px] font-bold text-ink">{active.title}</h1>
                <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(active.status)}`}>
                  {active.status === "paid" ? "Fully Paid" : active.status === "partial" ? "Partial" : "Draft"}
                </span>
              </div>
              {active.description && <div className="text-[12.5px] text-muted mt-1">{active.description}</div>}
              <div className="text-[11.5px] text-muted mt-1">Created {timeAgo(active.createdAt)}</div>
            </div>

            {/* Pay button */}
            {unpaidCount > 0 && (
              <button onClick={payUnpaid} disabled={paying}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all disabled:opacity-50">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                {paying ? payStatus || "Processing…" : `Pay ${unpaidCount} unpaid · ${formatUsdc(totalUnpaid(active))} USDC (1 tx)`}
              </button>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              ["Total",   formatUsdc(totalAll(active)),   "USDC",   "text-ink"  ],
              ["Paid",    formatUsdc(totalPaid(active)),  `${paidCount} recipients`,    "text-green"],
              ["Unpaid",  formatUsdc(totalUnpaid(active)),`${unpaidCount} pending`,     "text-amber" ],
            ].map(([l,v,u,c])=>(
              <div key={l as string} className="bg-surface border border-white/8 rounded-2xl p-4">
                <div className="text-[11px] text-muted mb-1.5">{l}</div>
                <div className={`text-[18px] font-bold font-mono ${c}`}>{v}</div>
                <div className="text-[11px] text-muted mt-0.5">{u}</div>
              </div>
            ))}
          </div>

          {/* Entry list */}
          <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/8 text-[11px] font-semibold text-muted uppercase tracking-wider grid grid-cols-[1fr_90px_100px_120px] gap-2">
              <span>Recipient</span><span className="text-right">Amount</span><span className="text-center">Status</span><span className="text-right">Tx</span>
            </div>
            {active.entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_100px_120px] gap-2 items-center px-5 py-3 border-b border-white/5 last:border-0 hover:bg-surface2/40 transition-colors">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{e.name}</div>
                  <div className="font-mono text-[10.5px] text-muted">{e.wallet.slice(0,8)}…{e.wallet.slice(-4)}</div>
                </div>
                <div className="text-right font-mono text-[13px] font-semibold">{formatUsdc(e.amount)}</div>
                <div className="text-center">
                  {e.paid
                    ? <span className="text-[11px] text-green bg-green/10 border border-green/20 px-2 py-0.5 rounded-full">✓ Paid</span>
                    : <span className="text-[11px] text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-full">Pending</span>}
                </div>
                <div className="text-right">
                  {e.txHash
                    ? <a href={`${ARC_EXPLORER}/tx/${e.txHash}`} target="_blank" rel="noreferrer"
                        className="text-[11px] font-mono text-accent hover:underline">{e.txHash.slice(0,8)}…</a>
                    : <span className="text-muted/30 text-[11px]">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── Session list ─────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar title="Payroll" />
      <div className="p-4 lg:p-7 flex-1 max-w-[720px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[16px] font-bold text-ink">Payment Sessions</h1>
            <div className="text-[12px] text-muted mt-0.5">Group people into payroll runs — track who's paid each period</div>
          </div>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all">
            + New Session
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <div className="text-[40px] opacity-20">📋</div>
            <div className="text-muted text-sm">No sessions yet. Create your first payroll run.</div>
            <button onClick={() => setShowNew(true)}
              className="mt-2 px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all">
              + New Session
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map(s => {
              const paid = s.entries.filter(e=>e.paid).length;
              const total = s.entries.length;
              const pct = total > 0 ? paid/total*100 : 0;
              return (
                <div key={s.id} onClick={() => openSession(s)}
                  className="bg-surface border border-white/8 hover:border-white/14 rounded-2xl p-4 cursor-pointer transition-all group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[14px] font-bold text-ink group-hover:text-accent transition-colors">{s.title}</span>
                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(s.status)}`}>
                          {s.status === "paid" ? "Fully Paid" : s.status === "partial" ? "Partial" : "Draft"}
                        </span>
                      </div>
                      {s.description && <div className="text-[12px] text-muted mt-0.5">{s.description}</div>}
                      <div className="text-[11.5px] text-muted mt-1">{timeAgo(s.createdAt)} · {total} recipients · <span className="font-mono">{formatUsdc(totalAll(s))} USDC</span></div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] text-muted">{paid}/{total} paid</div>
                        <div className="text-[12px] font-mono font-semibold text-green mt-0.5">{formatUsdc(totalPaid(s))}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-red hover:bg-red/8 transition-all text-[11px]">✕</button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-surface2 rounded-full overflow-hidden">
                    <div className="h-full bg-green rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Session Modal */}
      {showNew && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowNew(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[600px] bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}>

            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between shrink-0">
              <div className="font-bold text-[14px]">New Payment Session</div>
              <button onClick={() => setShowNew(false)} className="text-muted hover:text-ink w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all">✕</button>
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-auto flex-1">
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Session Title</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. June 2026 Payroll"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Description <span className="normal-case font-normal">(optional)</span></label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. Full-time staff + contractors (optional)"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>

              {/* Pick people */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider">Recipients</label>
                  <div className="text-[11px] text-muted">{pickedIds.size} selected · <span className="text-ink font-mono">{Object.entries(entryAmts).filter(([id])=>pickedIds.has(id)).reduce((s,[,v])=>s+(parseFloat(v)||0),0).toFixed(2)} USDC</span></div>
                </div>
                {contacts.length === 0 ? (
                  <div className="text-[12px] text-muted py-4 text-center">No contacts yet — go to People to add them first.</div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {contacts.map(c => {
                      const picked = pickedIds.has(c.id);
                      return (
                        <div key={c.id}
                          onClick={() => setPickedIds(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${picked ? "bg-accent/10 border-accent/30" : "bg-bg border-white/6 hover:border-white/14"}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${picked ? "bg-accent border-accent" : "border-white/20"}`}>
                            {picked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-semibold text-ink">{c.name}</div>
                            <div className="font-mono text-[10.5px] text-muted truncate">{c.wallet.slice(0,10)}…</div>
                          </div>
                          {picked && (
                            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <input
                                value={entryAmts[c.id] || ""}
                                onChange={e => setEntryAmts(p => ({ ...p, [c.id]: e.target.value }))}
                                placeholder="0.00"
                                className="w-[72px] px-2 py-1 bg-bg border border-white/14 rounded-lg text-[12px] font-mono text-ink outline-none focus:border-accent/60"
                              />
                              <span className="text-[10.5px] text-muted">USDC</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/8 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-surface2 text-muted hover:text-ink transition-all">Cancel</button>
              <button onClick={createSession} disabled={!newTitle.trim() || pickedIds.size === 0}
                className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-40">
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
