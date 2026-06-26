/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getContacts, saveContacts, Contact } from "@/lib/storage";
import { shortAddr, fetchGasPrice, waitForReceipt, USDC_ADDRESS } from "@/lib/arc";

const CATEGORIES: { value: Contact["category"]; label: string; color: string }[] = [
  { value: "employee", label: "Employee",  color: "text-blue-400  bg-blue-400/10  border-blue-400/20"  },
  { value: "vendor",   label: "Vendor",    color: "text-purple   bg-purple/10    border-purple/20"     },
  { value: "partner",  label: "Partner",   color: "text-amber    bg-amber/10     border-amber/20"      },
  { value: "other",    label: "Other",     color: "text-muted    bg-white/5      border-white/10"      },
];

function catMeta(c: string) { return CATEGORIES.find(x => x.value === c) || CATEGORIES[3]; }

function genId() { return "cct_" + Math.random().toString(36).slice(2, 10); }

const EMPTY_FORM = { name: "", wallet: "", category: "employee" as Contact["category"], notes: "" };

export default function People() {
  const { account, isConnected, connect, getProvider } = useWallet();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState("");

  // Batch send
  const [batchMode, setBatchMode] = useState(false);
  const [batchAmount, setBatchAmount] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [sendResults, setSendResults] = useState<{ name: string; wallet: string; txHash?: string; error?: string }[]>([]);

  useEffect(() => {
    setContacts(getContacts());
  }, []);

  function save() {
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.wallet)) { setFormErr("Enter a valid wallet address (0x…)."); return; }

    const list = getContacts();
    if (editing) {
      const idx = list.findIndex(c => c.id === editing.id);
      if (idx >= 0) list[idx] = { ...editing, ...form };
    } else {
      // Check duplicate wallet
      if (list.some(c => c.wallet.toLowerCase() === form.wallet.toLowerCase())) {
        setFormErr("This wallet is already in your contacts."); return;
      }
      list.unshift({ id: genId(), ...form, createdAt: Date.now() });
    }
    saveContacts(list);
    setContacts(list);
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr("");
  }

  function startEdit(c: Contact) {
    setEditing(c);
    setForm({ name: c.name, wallet: c.wallet, category: c.category, notes: c.notes || "" });
    setFormErr("");
    setShowForm(true);
  }

  function remove(id: string) {
    const list = contacts.filter(c => c.id !== id);
    saveContacts(list); setContacts(list);
  }

  function exportCsv() {
    const rows = [["Name","Wallet","Category","Notes","Added"]];
    contacts.forEach(c => rows.push([c.name, c.wallet, c.category, c.notes || "", new Date(c.createdAt).toLocaleDateString("en-US")]));
    const csv = rows.map(r => r.map(x => `"${x.replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `nexmer-contacts-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function sendBatch() {
    const targets = contacts.filter(c => selected.has(c.id));
    if (targets.length === 0 || !batchAmount || parseFloat(batchAmount) <= 0) return;
    if (!isConnected) { connect(); return; }
    setSending(true); setSendResults([]); setSendStatus("");

    const eth = getProvider();
    if (!eth) { setSending(false); return; }
    const accs: string[] = await eth.request({ method: "eth_accounts" });
    const from = accs[0];
    const amtRaw = BigInt(Math.round(parseFloat(batchAmount) * 1_000_000));
    const gasPrice = await fetchGasPrice(eth);

    const results: typeof sendResults = [];
    for (const c of targets) {
      setSendStatus(`Sending to ${c.name}…`);
      try {
        // ERC-20 transfer(address,uint256) on Arc
        const data = "0xa9059cbb" +
          c.wallet.toLowerCase().replace("0x","").padStart(64,"0") +
          amtRaw.toString(16).padStart(64,"0");
        const hash: string = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to: USDC_ADDRESS, data, gas: "0x186a0", ...gasPrice }],
        });
        await waitForReceipt(eth, hash);
        results.push({ name: c.name, wallet: c.wallet, txHash: hash });
      } catch (e: any) {
        results.push({ name: c.name, wallet: c.wallet, error: e.message || "Failed" });
      }
    }
    setSendResults(results);
    setSendStatus("");
    setSending(false);
  }

  const filtered = contacts.filter(c => {
    const matchQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.wallet.toLowerCase().includes(q.toLowerCase());
    const matchCat = filter === "all" || c.category === filter;
    return matchQ && matchCat;
  });

  const batchTargets = batchMode ? contacts.filter(c => selected.has(c.id)) : [];
  const batchTotal = batchTargets.length * (parseFloat(batchAmount) || 0);

  return (
    <>
      <Topbar title="People" />
      <div className="p-4 lg:p-7 flex-1 max-w-[860px]">

        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or wallet…"
                className="pl-8 pr-3 py-1.5 bg-surface border border-white/8 rounded-lg text-[12.5px] text-ink placeholder:text-muted outline-none focus:border-white/20 w-[200px]" />
            </div>
            <div className="flex gap-1">
              {[{value:"all",label:"All"},...CATEGORIES.map(c=>({value:c.value,label:c.label}))].map(opt=>(
                <button key={opt.value} onClick={()=>setFilter(opt.value)}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all ${filter===opt.value?"bg-surface2 text-ink border border-white/14":"text-muted hover:text-ink"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {contacts.length > 0 && (
              <>
                <button onClick={exportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-surface border border-white/8 text-muted hover:text-ink transition-all">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  CSV
                </button>
                <button onClick={() => { setBatchMode(v => !v); setSelected(new Set()); setSendResults([]); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${batchMode ? "bg-accent/15 text-accent border-accent/30" : "bg-surface border-white/8 text-muted hover:text-ink"}`}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  {batchMode ? "Cancel Batch" : "Batch Send"}
                </button>
              </>
            )}
            <button onClick={() => { setShowForm(true); setEditing(null); setForm(EMPTY_FORM); setFormErr(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all">
              + Add Contact
            </button>
          </div>
        </div>

        {/* Batch send panel */}
        {batchMode && (
          <div className="mb-5 p-4 bg-surface border border-accent/20 rounded-2xl">
            <div className="text-[13px] font-semibold mb-3">Batch Send USDC <span className="text-muted font-normal">(Arc Testnet)</span></div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted">Amount per person</span>
                <input value={batchAmount} onChange={e => setBatchAmount(e.target.value)} placeholder="0.00"
                  className="w-[100px] px-3 py-1.5 bg-bg border border-white/8 rounded-lg text-[13px] font-mono text-ink outline-none focus:border-white/20" />
                <span className="text-[12px] text-muted">USDC</span>
              </div>
              {batchTargets.length > 0 && (
                <div className="text-[12px] text-muted">
                  → {batchTargets.length} person{batchTargets.length>1?"s":""} · <span className="text-ink font-mono">{batchTotal.toFixed(2)} USDC</span> total
                </div>
              )}
              <button onClick={sendBatch} disabled={sending || batchTargets.length === 0 || !batchAmount}
                className="ml-auto px-4 py-1.5 rounded-lg text-[12.5px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                {sending ? sendStatus || "Sending…" : `Send to ${batchTargets.length} selected`}
              </button>
            </div>
            {sendResults.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {sendResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg ${r.txHash ? "bg-green/8 border border-green/15" : "bg-red/8 border border-red/15"}`}>
                    <span className={r.txHash ? "text-green" : "text-red"}>{r.txHash ? "✓" : "✗"}</span>
                    <span className="text-ink">{r.name}</span>
                    {r.txHash
                      ? <a href={`https://testnet.arcscan.app/tx/${r.txHash}`} target="_blank" rel="noreferrer" className="ml-auto text-accent font-mono hover:underline">{r.txHash.slice(0,10)}…</a>
                      : <span className="ml-auto text-red/80">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contact list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="text-[40px] opacity-20">👥</div>
            <div className="text-muted text-sm">{contacts.length === 0 ? "No contacts yet. Add employees, vendors, or partners." : "No matches."}</div>
            {contacts.length === 0 && (
              <button onClick={() => { setShowForm(true); setEditing(null); setForm(EMPTY_FORM); setFormErr(""); }}
                className="mt-2 px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all">
                Add First Contact
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => {
              const meta = catMeta(c.category);
              const isSelected = selected.has(c.id);
              return (
                <div key={c.id}
                  onClick={() => batchMode && setSelected(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${batchMode ? "cursor-pointer" : ""} ${isSelected ? "bg-accent/10 border-accent/30" : "bg-surface border-white/8 hover:border-white/14"}`}>
                  {batchMode && (
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-accent border-accent" : "border-white/20"}`}>
                      {isSelected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  )}
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-surface2 border border-white/8 flex items-center justify-center text-[14px] font-bold text-muted shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{c.name}</span>
                      <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
                    </div>
                    <div className="font-mono text-[11.5px] text-muted mt-0.5">{c.wallet}</div>
                    {c.notes && <div className="text-[11px] text-muted/60 mt-0.5 truncate">{c.notes}</div>}
                  </div>
                  {/* Actions */}
                  {!batchMode && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(c.wallet); }}
                        title="Copy wallet" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-white/8 transition-all text-[11px]">
                        ⎘
                      </button>
                      <button onClick={e => { e.stopPropagation(); startEdit(c); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-white/8 transition-all text-[11px]">
                        ✎
                      </button>
                      <button onClick={e => { e.stopPropagation(); remove(c.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-red hover:bg-red/8 transition-all text-[11px]">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[440px] bg-surface border border-white/10 rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="font-bold text-[14px]">{editing ? "Edit Contact" : "Add Contact"}</div>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-muted hover:text-ink w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Name</label>
                <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Alice Johnson"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Wallet Address</label>
                <input value={form.wallet} onChange={e => setForm(f=>({...f,wallet:e.target.value.trim()}))} placeholder="0x…"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] font-mono text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Category</label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat.value} onClick={() => setForm(f=>({...f,category:cat.value}))}
                      className={`py-2 rounded-xl text-[12px] font-semibold border transition-all ${form.category===cat.value ? cat.color : "border-white/8 text-muted hover:text-ink"}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Notes <span className="normal-case font-normal">(optional)</span></label>
                <input value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. Monthly salary $3k"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              {formErr && <div className="text-[12px] text-red px-3 py-2 bg-red/8 rounded-xl border border-red/20">{formErr}</div>}
              <button onClick={save}
                className="w-full py-2.5 bg-accent text-white rounded-xl text-[13px] font-bold hover:bg-accent/90 transition-all mt-1">
                {editing ? "Save Changes" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
