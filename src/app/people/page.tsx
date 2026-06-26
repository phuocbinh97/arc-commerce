/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useRef } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getContacts, saveContacts, Contact } from "@/lib/storage";
import { fetchGasPrice, waitForReceipt, USDC_ADDRESS } from "@/lib/arc";

interface ImportRow {
  name: string;
  wallet: string;
  amount: string;
  category: Contact["category"];
  notes: string;
  valid: boolean;
  error?: string;
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perAmt, setPerAmt] = useState<Record<string, string>>({}); // id → amount
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [sendResults, setSendResults] = useState<{ name: string; wallet: string; txHash?: string; error?: string }[]>([]);

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);

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

  function parseCategory(raw: string): Contact["category"] {
    const v = (raw || "").toLowerCase().trim();
    if (v.includes("employee") || v.includes("staff") || v.includes("nhân viên")) return "employee";
    if (v.includes("vendor") || v.includes("supplier") || v.includes("nhà cung cấp")) return "vendor";
    if (v.includes("partner") || v.includes("đối tác")) return "partner";
    return "other";
  }

  function rowsFromMatrix(matrix: string[][]): ImportRow[] {
    if (matrix.length < 2) return [];
    // Detect header row — find columns
    const header = matrix[0].map(h => h.toLowerCase().trim());
    const colName   = header.findIndex(h => h.includes("name") || h.includes("tên"));
    const colWallet = header.findIndex(h => h.includes("wallet") || h.includes("address") || h.includes("địa chỉ"));
    const colAmt    = header.findIndex(h => h.includes("amount") || h.includes("usdc") || h.includes("số tiền"));
    const colCat    = header.findIndex(h => h.includes("category") || h.includes("loại") || h.includes("type"));
    const colNotes  = header.findIndex(h => h.includes("note") || h.includes("ghi chú") || h.includes("memo"));

    return matrix.slice(1).filter(r => r.some(c => c.trim())).map(row => {
      const name   = colName   >= 0 ? (row[colName]   || "").trim() : (row[0] || "").trim();
      const wallet = colWallet >= 0 ? (row[colWallet] || "").trim() : (row[1] || "").trim();
      const amount = colAmt    >= 0 ? (row[colAmt]    || "").trim() : (row[2] || "").trim();
      const cat    = parseCategory(colCat >= 0 ? row[colCat] : "");
      const notes  = colNotes  >= 0 ? (row[colNotes]  || "").trim() : (row[4] || "").trim();
      const valid  = !!name && /^0x[a-fA-F0-9]{40}$/.test(wallet);
      const error  = !name ? "Missing name" : !wallet ? "Missing wallet" : !/^0x[a-fA-F0-9]{40}$/.test(wallet) ? "Invalid wallet" : undefined;
      return { name, wallet, amount, category: cat, notes, valid, error };
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const text = await file.text();
      // Simple CSV parser
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const matrix = lines.map(line => {
        const cols: string[] = [];
        let cur = "", inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
          else cur += ch;
        }
        cols.push(cur);
        return cols.map(c => c.replace(/^"|"$/g, "").trim());
      });
      setImportRows(rowsFromMatrix(matrix));
      setShowImport(true);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const { read, utils } = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix: string[][] = utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
      setImportRows(rowsFromMatrix(matrix));
      setShowImport(true);
    }
  }

  function confirmImport() {
    setImporting(true);
    const list = getContacts();
    const existingWallets = new Set(list.map(c => c.wallet.toLowerCase()));
    const newAmounts: Record<string, string> = {};
    let added = 0;

    for (const row of importRows) {
      if (!row.valid) continue;
      if (existingWallets.has(row.wallet.toLowerCase())) continue;
      const id = genId();
      list.unshift({ id, name: row.name, wallet: row.wallet, category: row.category, notes: row.notes, createdAt: Date.now() });
      existingWallets.add(row.wallet.toLowerCase());
      if (row.amount && parseFloat(row.amount) > 0) newAmounts[id] = row.amount;
      added++;
    }
    saveContacts(list);
    setContacts(list);

    // Auto-enable batch mode and fill amounts if file had amounts
    if (Object.keys(newAmounts).length > 0) {
      setBatchMode(true);
      setSelected(new Set(Object.keys(newAmounts)));
      setPerAmt(newAmounts);
    }

    setShowImport(false);
    setImporting(false);
    alert(`Imported ${added} contact${added !== 1 ? "s" : ""}.`);
  }

  function downloadTemplate() {
    const csv = `"Name","Wallet","Amount (USDC)","Category","Notes"\n"Alice Johnson","0xAbCd…","500","employee","Monthly salary"\n"Acme Corp","0x1234…","1500","vendor","Monthly invoice"`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "nexmer-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
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
    const targets = contacts.filter(c => selected.has(c.id) && parseFloat(perAmt[c.id] || "0") > 0);
    if (targets.length === 0) return;
    if (!isConnected) { connect(); return; }
    setSending(true); setSendResults([]); setSendStatus("");

    const eth = getProvider();
    if (!eth) { setSending(false); return; }
    const accs: string[] = await eth.request({ method: "eth_accounts" });
    const from = accs[0];
    const gasPrice = await fetchGasPrice(eth);

    const results: typeof sendResults = [];
    for (const c of targets) {
      setSendStatus(`Sending to ${c.name}…`);
      try {
        const amtRaw = BigInt(Math.round(parseFloat(perAmt[c.id]) * 1_000_000));
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
  const batchTotal = batchTargets.reduce((s, c) => s + (parseFloat(perAmt[c.id] || "0") || 0), 0);
  const batchReady = batchTargets.filter(c => parseFloat(perAmt[c.id] || "0") > 0).length;

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
                <button onClick={() => { setBatchMode(v => !v); setSelected(new Set()); setPerAmt({}); setSendResults([]); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${batchMode ? "bg-accent/15 text-accent border-accent/30" : "bg-surface border-white/8 text-muted hover:text-ink"}`}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  {batchMode ? "Cancel Batch" : "Batch Send"}
                </button>
              </>
            )}
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-surface border border-white/8 text-muted hover:text-ink transition-all">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Import
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <button onClick={() => { setShowForm(true); setEditing(null); setForm(EMPTY_FORM); setFormErr(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all">
              + Add Contact
            </button>
          </div>
        </div>

        {/* Batch send panel */}
        {batchMode && (
          <div className="mb-5 p-4 bg-surface border border-accent/20 rounded-2xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-[13px] font-semibold">Batch Send USDC <span className="text-muted font-normal">(Arc Testnet)</span></div>
                <div className="text-[11.5px] text-muted mt-0.5">Check contacts below → enter amount for each → confirm</div>
              </div>
              <div className="flex items-center gap-3">
                {batchTargets.length > 0 && (
                  <div className="text-[12px] text-muted">
                    {batchReady}/{batchTargets.length} ready · <span className="text-ink font-mono font-semibold">{batchTotal.toFixed(2)} USDC</span> total
                  </div>
                )}
                <button onClick={sendBatch} disabled={sending || batchReady === 0}
                  className="px-4 py-1.5 rounded-lg text-[12.5px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {sending ? sendStatus || "Sending…" : `Send to ${batchReady} recipient${batchReady!==1?"s":""}`}
                </button>
              </div>
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${batchMode ? "cursor-pointer select-none" : ""} ${isSelected ? "bg-accent/10 border-accent/30" : "bg-surface border-white/8 hover:border-white/14"}`}>
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
                  {/* Per-person amount in batch mode */}
                  {batchMode && isSelected && (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <input
                        value={perAmt[c.id] || ""}
                        onChange={e => setPerAmt(p => ({ ...p, [c.id]: e.target.value }))}
                        placeholder="0.00"
                        className="w-[80px] px-2.5 py-1.5 bg-bg border border-white/14 rounded-lg text-[12.5px] font-mono text-ink outline-none focus:border-accent/60 transition-colors"
                      />
                      <span className="text-[11px] text-muted">USDC</span>
                    </div>
                  )}
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

      {/* Import Preview Modal */}
      {showImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowImport(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[720px] bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between shrink-0">
              <div>
                <div className="font-bold text-[14px]">Import Preview</div>
                <div className="text-[11.5px] text-muted mt-0.5">
                  {importRows.filter(r=>r.valid).length} valid · {importRows.filter(r=>!r.valid).length} invalid · {importRows.filter(r=>r.valid && parseFloat(r.amount||"0")>0).length} with amount
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadTemplate}
                  className="text-[11.5px] text-muted hover:text-ink px-2.5 py-1 rounded-lg bg-surface2 transition-all">
                  Download Template
                </button>
                <button onClick={() => setShowImport(false)} className="text-muted hover:text-ink w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all">✕</button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface border-b border-white/8">
                  <tr className="text-[10.5px] font-semibold text-muted uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left w-6">#</th>
                    <th className="px-4 py-2.5 text-left">Name</th>
                    <th className="px-4 py-2.5 text-left">Wallet</th>
                    <th className="px-4 py-2.5 text-right">Amount (USDC)</th>
                    <th className="px-4 py-2.5 text-left">Category</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-b border-white/5 ${r.valid ? "" : "opacity-40"}`}>
                      <td className="px-4 py-2 text-muted">{i+1}</td>
                      <td className="px-4 py-2 font-medium text-ink">{r.name || <span className="text-red/60">—</span>}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-muted">{r.wallet ? r.wallet.slice(0,8)+"…"+r.wallet.slice(-4) : <span className="text-red/60">—</span>}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.amount ? <span className="text-green">{parseFloat(r.amount).toFixed(2)}</span> : <span className="text-muted/40">—</span>}</td>
                      <td className="px-4 py-2">
                        <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border ${catMeta(r.category).color}`}>{r.category}</span>
                      </td>
                      <td className="px-4 py-2">
                        {r.valid
                          ? <span className="text-green text-[11px]">✓ OK</span>
                          : <span className="text-red text-[11px]">✗ {r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/8 flex items-center justify-between shrink-0">
              <div className="text-[11.5px] text-muted">
                Columns auto-detected · invalid rows skipped · duplicates skipped
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)}
                  className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-surface2 text-muted hover:text-ink transition-all">
                  Cancel
                </button>
                <button onClick={confirmImport} disabled={importing || importRows.filter(r=>r.valid).length===0}
                  className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-40">
                  {importing ? "Importing…" : `Import ${importRows.filter(r=>r.valid).length} contacts`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
