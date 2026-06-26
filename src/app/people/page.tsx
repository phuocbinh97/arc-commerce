/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useRef } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getContacts, saveContacts, Contact, getPayrollSessions, savePayrollSessions, PayrollSession, PayrollEntry } from "@/lib/storage";
import { fetchGasPrice, waitForReceipt, USDC_ADDRESS, MULTICALL3FROM, encodeBatchTransfers, parseUsdcErc20, formatUsdc, timeAgo, ARC_EXPLORER } from "@/lib/arc";

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
function catLabel(contact: Contact) {
  if (contact.category === "other" && contact.customCategory) return contact.customCategory;
  return catMeta(contact.category).label;
}

function genId() { return "cct_" + Math.random().toString(36).slice(2, 10); }

const EMPTY_FORM = { name: "", wallet: "", category: "employee" as Contact["category"], customCategory: "", notes: "" };

function genPrlId() { return "prl_" + Math.random().toString(36).slice(2, 10); }

function CategoryDropdown({ contact, contacts, onSave }: { contact: Contact; contacts: Contact[]; onSave: (updated: Contact) => void }) {
  const [open, setOpen] = useState(false);
  const [customVal, setCustomVal] = useState(contact.customCategory || "");
  const ref = useRef<HTMLDivElement>(null);
  const meta = catMeta(contact.category);

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function pick(cat: Contact["category"]) {
    if (cat !== "other") {
      onSave({ ...contact, category: cat, customCategory: undefined });
      setOpen(false);
    }
    // for "other" keep open to let user fill custom
  }

  function confirmCustom() {
    onSave({ ...contact, category: "other", customCategory: customVal.trim() || undefined });
    setOpen(false);
  }

  const existingCustom = Array.from(new Set(
    contacts.filter(c => c.category === "other" && c.customCategory && c.id !== contact.id).map(c => c.customCategory as string)
  ));

  return (
    <div ref={ref} className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button onClick={() => { setCustomVal(contact.customCategory || ""); setOpen(v => !v); }}
        className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border transition-all hover:opacity-80 ${meta.color}`}>
        {catLabel(contact)} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[180px] rounded-xl border border-white/10 overflow-hidden"
          style={{background:"#161b22",boxShadow:"0 8px 24px rgba(0,0,0,0.7)"}}>
          {CATEGORIES.map(cat => (
            <button key={cat.value} onClick={() => pick(cat.value)}
              className={`w-full text-left px-3 py-2 text-[12px] font-semibold flex items-center gap-2 transition-colors hover:bg-white/5 ${contact.category===cat.value?"text-ink":"text-muted"}`}>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
            </button>
          ))}
          {/* custom input for Other */}
          <div className="px-2 pb-2 pt-1 border-t border-white/8">
            <input value={customVal} onChange={e => setCustomVal(e.target.value)} placeholder="Custom label…"
              className="w-full px-2.5 py-1.5 bg-bg border border-white/8 rounded-lg text-[11.5px] text-ink outline-none focus:border-white/20 transition-colors" />
            {existingCustom.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {existingCustom.map(opt => (
                  <button key={opt} onClick={() => setCustomVal(opt)}
                    className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-muted hover:text-ink border border-white/8 transition-colors">
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <button onClick={confirmCustom}
              className="mt-2 w-full py-1 rounded-lg text-[11.5px] font-semibold bg-accent/15 text-[#6ea8fe] hover:bg-accent/25 transition-colors">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomCategoryInput({ value, contacts, onChange }: { value: string; contacts: Contact[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const existing = Array.from(new Set(
    contacts.filter(c => c.category === "other" && c.customCategory).map(c => c.customCategory as string)
  ));
  return (
    <div className="relative mt-2">
      <input value={value} onChange={e=>onChange(e.target.value)} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
        placeholder="Custom category (e.g. Contractor, Advisor…)"
        className="w-full px-3.5 py-2 bg-bg border border-white/8 rounded-xl text-[12.5px] text-ink outline-none focus:border-white/20 transition-colors" />
      {open && existing.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl border border-white/10 overflow-hidden"
          style={{background:"#161b22",boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
          {existing.map(opt=>(
            <button key={opt} onMouseDown={()=>onChange(opt)}
              className="w-full text-left px-3.5 py-2 text-[12.5px] text-ink hover:bg-white/5 transition-colors">
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function People() {
  const { account, isConnected, connect, getProvider } = useWallet();
  const [tab, setTab] = useState<"contacts" | "payroll">("contacts");

  // ── Contacts tab state ─────────────────────────────────────────────────────
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

  // ── Payroll tab state ──────────────────────────────────────────────────────
  const [sessions, setSessions]   = useState<PayrollSession[]>([]);
  const [prlView, setPrlView]     = useState<"list" | "session">("list");
  const [prlActive, setPrlActive] = useState<PayrollSession | null>(null);
  const [showNewSess, setShowNewSess] = useState(false);
  const [sessTitle, setSessTitle] = useState("");
  const [sessDesc, setSessDesc]   = useState("");
  const [sessIds, setSessIds]     = useState<Set<string>>(new Set());
  const [sessAmts, setSessAmts]   = useState<Record<string, string>>({});
  const [sessFilter, setSessFilter] = useState<string>("all");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [qaForm, setQaForm] = useState(EMPTY_FORM);
  const [qaErr, setQaErr] = useState("");
  const [prlPaying, setPrlPaying] = useState(false);
  const [prlStatus, setPrlStatus] = useState("");

  useEffect(() => {
    setContacts(getContacts());
    setSessions(getPayrollSessions());
  }, []);

  function save() {
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.wallet)) { setFormErr("Enter a valid wallet address (0x…)."); return; }

    const contactData = {
      ...form,
      customCategory: form.category === "other" ? form.customCategory.trim() : undefined,
    };
    const list = getContacts();
    if (editing) {
      const idx = list.findIndex(c => c.id === editing.id);
      if (idx >= 0) list[idx] = { ...editing, ...contactData };
    } else {
      if (list.some(c => c.wallet.toLowerCase() === form.wallet.toLowerCase())) {
        setFormErr("This wallet is already in your contacts."); return;
      }
      list.unshift({ id: genId(), ...contactData, createdAt: Date.now() });
    }
    saveContacts(list);
    setContacts(list);
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr("");
  }

  function saveQuickAdd() {
    if (!qaForm.name.trim()) { setQaErr("Name is required."); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(qaForm.wallet)) { setQaErr("Enter a valid wallet address (0x…)."); return; }
    const list = getContacts();
    if (list.some(c => c.wallet.toLowerCase() === qaForm.wallet.toLowerCase())) {
      setQaErr("This wallet is already in your contacts."); return;
    }
    const newContact: Contact = {
      id: genId(), name: qaForm.name.trim(), wallet: qaForm.wallet,
      category: qaForm.category,
      customCategory: qaForm.category === "other" ? qaForm.customCategory.trim() : undefined,
      notes: qaForm.notes.trim() || undefined, createdAt: Date.now(),
    };
    list.unshift(newContact);
    saveContacts(list);
    setContacts(list);
    // auto-select in session
    setSessIds(prev => { const s = new Set(prev); s.add(newContact.id); return s; });
    setShowQuickAdd(false);
    setQaForm(EMPTY_FORM);
    setQaErr("");
  }

  function updateContact(updated: Contact) {
    const list = getContacts().map(c => c.id === updated.id ? updated : c);
    saveContacts(list);
    setContacts(list);
  }

  function startEdit(c: Contact) {
    setEditing(c);
    setForm({ name: c.name, wallet: c.wallet, category: c.category, customCategory: c.customCategory || "", notes: c.notes || "" });
    setFormErr("");
    setShowForm(true);
  }

  function remove(id: string) {
    const list = contacts.filter(c => c.id !== id);
    saveContacts(list); setContacts(list);
  }

  // ── Payroll helpers ────────────────────────────────────────────────────────
  function prlTotalAll(s: PayrollSession)    { return s.entries.reduce((x,e)=>x+parseFloat(e.amount),0); }
  function prlTotalPaid(s: PayrollSession)   { return s.entries.filter(e=>e.paid).reduce((x,e)=>x+parseFloat(e.amount),0); }
  function prlTotalUnpaid(s: PayrollSession) { return s.entries.filter(e=>!e.paid).reduce((x,e)=>x+parseFloat(e.amount),0); }
  const prlStatusColor = (s: PayrollSession["status"]) =>
    s==="paid"    ? "text-green  bg-green/10  border-green/20"
    : s==="partial" ? "text-amber  bg-amber/10  border-amber/20"
    : "text-muted bg-white/5 border-white/10";

  function createSession() {
    if (!sessTitle.trim()) return;
    const entries: PayrollEntry[] = contacts
      .filter(c => sessIds.has(c.id))
      .map(c => ({ contactId:c.id, name:c.name, wallet:c.wallet, amount:sessAmts[c.id]||"0", paid:false }))
      .filter(e => parseFloat(e.amount) > 0);
    if (entries.length === 0) return;
    const s: PayrollSession = { id:genPrlId(), title:sessTitle.trim(), description:sessDesc.trim()||undefined, entries, createdAt:Date.now(), status:"draft" };
    const list = [s, ...sessions];
    savePayrollSessions(list); setSessions(list);
    setShowNewSess(false); setSessTitle(""); setSessDesc(""); setSessIds(new Set()); setSessAmts({}); setSessFilter("all");
    setPrlActive(s); setPrlView("session");
  }

  async function payUnpaid() {
    if (!prlActive) return;
    if (!isConnected) { connect(); return; }
    const unpaid = prlActive.entries.filter(e => !e.paid && parseFloat(e.amount) > 0);
    if (unpaid.length === 0) return;
    setPrlPaying(true); setPrlStatus(`Building ${unpaid.length}-recipient batch…`);
    const eth = getProvider(); if (!eth) { setPrlPaying(false); return; }
    try {
      const accs: string[] = await eth.request({ method:"eth_accounts" });
      const from = accs[0];
      try { await eth.request({ method:"wallet_switchEthereumChain", params:[{chainId:"0x4CEF52"}] }); }
      catch(e:any) { if(e.code===4902) await eth.request({ method:"wallet_addEthereumChain", params:[{chainId:"0x4CEF52",chainName:"Arc Testnet",rpcUrls:["https://rpc.testnet.arc.network"],nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},blockExplorerUrls:["https://testnet.arcscan.app"]}] }); else throw e; }
      const calls = unpaid.map(e => ({ recipient:e.wallet as `0x${string}`, units:parseUsdcErc20(e.amount) }));
      const batchData = encodeBatchTransfers(calls);
      const gasLimit = "0x" + Math.min(unpaid.length*80000+60000, 2_000_000).toString(16);
      const gas = await fetchGasPrice(eth);
      setPrlStatus(`Confirm ${unpaid.length} payments in 1 MetaMask tx…`);
      const txHash: string = await eth.request({ method:"eth_sendTransaction", params:[{from, to:MULTICALL3FROM, value:"0x0", data:batchData, gas:gasLimit, ...gas}] });
      setPrlStatus("Confirming on Arc…");
      await waitForReceipt(eth, txHash);
      const now = Date.now();
      const updEntries = prlActive.entries.map(e =>
        (!e.paid && unpaid.find(u=>u.contactId===e.contactId && u.wallet===e.wallet)) ? {...e,paid:true,txHash,paidAt:now} : e
      );
      const allPaid = updEntries.every(e=>e.paid);
      const updated: PayrollSession = { ...prlActive, entries:updEntries, status:allPaid?"paid":"partial", txHash:allPaid?txHash:prlActive.txHash, paidAt:allPaid?now:prlActive.paidAt };
      const list = sessions.map(s=>s.id===updated.id?updated:s);
      savePayrollSessions(list); setSessions(list); setPrlActive(updated);
      setPrlStatus("");
    } catch(e:any) { setPrlStatus("Error: "+(e.message||"Failed")); }
    setPrlPaying(false);
  }

  function deleteSession(id: string) {
    const list = sessions.filter(s=>s.id!==id);
    savePayrollSessions(list); setSessions(list);
    if (prlActive?.id===id) { setPrlActive(null); setPrlView("list"); }
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
    setSending(true); setSendResults([]); setSendStatus(`Building batch for ${targets.length} recipients…`);

    const eth = getProvider();
    if (!eth) { setSending(false); return; }
    try {
      const accs: string[] = await eth.request({ method: "eth_accounts" });
      const from = accs[0];

      // Switch to Arc
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x4CEF52" }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x4CEF52", chainName: "Arc Testnet", rpcUrls: ["https://rpc.testnet.arc.network"], nativeCurrency: { name:"USDC",symbol:"USDC",decimals:18 }, blockExplorerUrls:["https://testnet.arcscan.app"] }] });
        } else throw e;
      }

      const calls = targets.map(c => ({
        recipient: c.wallet as `0x${string}`,
        units: parseUsdcErc20(perAmt[c.id]),
      }));
      const batchData = encodeBatchTransfers(calls);
      const gasLimit = "0x" + Math.min(targets.length * 80000 + 60000, 2_000_000).toString(16);
      const gas = await fetchGasPrice(eth);

      setSendStatus(`Confirm ${targets.length} payments in 1 MetaMask tx…`);
      const txHash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: MULTICALL3FROM, value: "0x0", data: batchData, gas: gasLimit, ...gas }],
      });

      setSendStatus("Confirming on Arc…");
      await waitForReceipt(eth, txHash);

      setSendResults(targets.map(c => ({ name: c.name, wallet: c.wallet, txHash })));
    } catch (e: any) {
      setSendResults([{ name: "Batch", wallet: "", error: e.message || "Failed" }]);
    }
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

  // ── Payroll session detail view ─────────────────────────────────────────────
  if (tab === "payroll" && prlView === "session" && prlActive) {
    const unpaidCount = prlActive.entries.filter(e=>!e.paid).length;
    const paidCount   = prlActive.entries.filter(e=>e.paid).length;
    return (
      <>
        <Topbar title="People" />
        <div className="p-4 lg:p-7 flex-1 max-w-[720px]">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-white/8 pb-0">
            {(["contacts","payroll"] as const).map(t=>(
              <button key={t} onClick={()=>{setTab(t);if(t==="contacts"){}else setPrlView("list");}}
                className={`px-4 py-2 text-[13px] font-semibold capitalize border-b-2 -mb-px transition-colors ${tab===t?"border-accent text-ink":"border-transparent text-muted hover:text-ink"}`}>
                {t==="contacts"?"Contacts":"Payroll"}
              </button>
            ))}
          </div>
          <button onClick={()=>setPrlView("list")} className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink mb-5 transition-colors">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            All sessions
          </button>
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[18px] font-bold">{prlActive.title}</h1>
                <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${prlStatusColor(prlActive.status)}`}>
                  {prlActive.status==="paid"?"Fully Paid":prlActive.status==="partial"?"Partial":"Draft"}
                </span>
              </div>
              {prlActive.description && <div className="text-[12.5px] text-muted mt-1">{prlActive.description}</div>}
              <div className="text-[11.5px] text-muted mt-1">Created {timeAgo(prlActive.createdAt)}</div>
            </div>
            {unpaidCount > 0 && (
              <button onClick={payUnpaid} disabled={prlPaying}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all disabled:opacity-50">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                {prlPaying ? prlStatus||"Processing…" : `Pay ${unpaidCount} unpaid · ${formatUsdc(prlTotalUnpaid(prlActive))} USDC (1 tx)`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {([["Total",formatUsdc(prlTotalAll(prlActive)),"USDC","text-ink"],["Paid",formatUsdc(prlTotalPaid(prlActive)),`${paidCount} recipients`,"text-green"],["Unpaid",formatUsdc(prlTotalUnpaid(prlActive)),`${unpaidCount} pending`,"text-amber"]] as const).map(([l,v,u,c])=>(
              <div key={l} className="bg-surface border border-white/8 rounded-2xl p-4">
                <div className="text-[11px] text-muted mb-1.5">{l}</div>
                <div className={`text-[18px] font-bold font-mono ${c}`}>{v}</div>
                <div className="text-[11px] text-muted mt-0.5">{u}</div>
              </div>
            ))}
          </div>
          <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/8 text-[11px] font-semibold text-muted uppercase tracking-wider grid grid-cols-[1fr_90px_100px_120px] gap-2">
              <span>Recipient</span><span className="text-right">Amount</span><span className="text-center">Status</span><span className="text-right">Tx</span>
            </div>
            {prlActive.entries.map((e,i)=>(
              <div key={i} className="grid grid-cols-[1fr_90px_100px_120px] gap-2 items-center px-5 py-3 border-b border-white/5 last:border-0 hover:bg-surface2/40 transition-colors">
                <div>
                  <div className="text-[13px] font-semibold">{e.name}</div>
                  <div className="font-mono text-[10.5px] text-muted">{e.wallet.slice(0,8)}…{e.wallet.slice(-4)}</div>
                </div>
                <div className="text-right font-mono text-[13px] font-semibold">{formatUsdc(e.amount)}</div>
                <div className="text-center">
                  {e.paid
                    ? <span className="text-[11px] text-green bg-green/10 border border-green/20 px-2 py-0.5 rounded-full">✓ Paid</span>
                    : <span className="text-[11px] text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-full">Pending</span>}
                </div>
                <div className="text-right">
                  {e.txHash ? <a href={`${ARC_EXPLORER}/tx/${e.txHash}`} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-accent hover:underline">{e.txHash.slice(0,8)}…</a>
                    : <span className="text-muted/30 text-[11px]">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="People" />
      <div className="p-4 lg:p-7 flex-1 max-w-[860px]">

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 border-b border-white/8 pb-0">
          {(["contacts","payroll"] as const).map(t=>(
            <button key={t} onClick={()=>{setTab(t);setPrlView("list");}}
              className={`px-4 py-2 text-[13px] font-semibold capitalize border-b-2 -mb-px transition-colors ${tab===t?"border-accent text-ink":"border-transparent text-muted hover:text-ink"}`}>
              {t==="contacts"?"Contacts":`Payroll ${sessions.length>0?`(${sessions.length})`:""}`}
            </button>
          ))}
        </div>

        {/* ── PAYROLL LIST TAB ─────────────────────────────────────────── */}
        {tab === "payroll" && (
          <div className="max-w-[720px]">
            <div className="flex items-center justify-between mb-5">
              <div className="text-[12px] text-muted">Group contacts into payment runs — track who's paid each period</div>
              <button onClick={()=>setShowNewSess(true)} className="px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all">
                + New Session
              </button>
            </div>
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center py-20 gap-3">
                <div className="text-[40px] opacity-20">💸</div>
                <div className="text-muted text-sm">No sessions yet. Create your first payroll run.</div>
                <button onClick={()=>setShowNewSess(true)} className="mt-2 px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 transition-all">+ New Session</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sessions.map(s=>{
                  const paid=s.entries.filter(e=>e.paid).length, total=s.entries.length;
                  const pct=total>0?paid/total*100:0;
                  return (
                    <div key={s.id} onClick={()=>{setPrlActive(s);setPrlView("session");}}
                      className="bg-surface border border-white/8 hover:border-white/14 rounded-2xl p-4 cursor-pointer transition-all group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-[14px] font-bold group-hover:text-accent transition-colors">{s.title}</span>
                            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${prlStatusColor(s.status)}`}>
                              {s.status==="paid"?"Fully Paid":s.status==="partial"?"Partial":"Draft"}
                            </span>
                          </div>
                          {s.description && <div className="text-[12px] text-muted mt-0.5">{s.description}</div>}
                          <div className="text-[11.5px] text-muted mt-1">{timeAgo(s.createdAt)} · {total} recipients · <span className="font-mono">{formatUsdc(prlTotalAll(s))} USDC</span></div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-[11px] text-muted">{paid}/{total} paid</div>
                            <div className="text-[12px] font-mono font-semibold text-green mt-0.5">{formatUsdc(prlTotalPaid(s))}</div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();deleteSession(s.id);}} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-red hover:bg-red/8 transition-all text-[11px]">✕</button>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 bg-surface2 rounded-full overflow-hidden">
                        <div className="h-full bg-green rounded-full transition-all duration-500" style={{width:`${pct}%`}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CONTACTS TAB ─────────────────────────────────────────────── */}
        {tab === "contacts" && <>

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
                      ? <a href={`https://testnet.arcscan.app/tx/${r.txHash}`} target="_blank" rel="noreferrer" className="ml-auto text-accent font-mono text-[11px] hover:underline">{r.name === "Batch" ? "View tx" : r.txHash.slice(0,10)+"…"}</a>
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
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className="text-[13.5px] font-semibold text-ink">{c.name}</span>
                      <CategoryDropdown contact={c} contacts={contacts} onSave={updateContact} />
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
        </> /* end contacts tab */}

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
                {form.category === "other" && (
                  <CustomCategoryInput value={form.customCategory} contacts={contacts} onChange={v=>setForm(f=>({...f,customCategory:v}))} />
                )}
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

      {/* New Session Modal */}
      {showNewSess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={()=>setShowNewSess(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[600px] bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e=>e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between shrink-0">
              <div className="font-bold text-[14px]">New Payment Session</div>
              <button onClick={()=>setShowNewSess(false)} className="text-muted hover:text-ink w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-auto flex-1">
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Session Title</label>
                <input value={sessTitle} onChange={e=>setSessTitle(e.target.value)} placeholder="e.g. June 2026 Payroll"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider block mb-1.5">Description <span className="normal-case font-normal">(optional)</span></label>
                <input value={sessDesc} onChange={e=>setSessDesc(e.target.value)} placeholder="e.g. Full-time staff + contractors"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11.5px] text-muted font-semibold uppercase tracking-wider">Recipients</label>
                  <div className="text-[11px] text-muted">{sessIds.size} selected · <span className="text-ink font-mono">{Object.entries(sessAmts).filter(([id])=>sessIds.has(id)).reduce((s,[,v])=>s+(parseFloat(v)||0),0).toFixed(2)} USDC</span></div>
                </div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex gap-1 flex-wrap">
                    {["all","employee","vendor","partner","other"].map(f=>(
                      <button key={f} onClick={()=>setSessFilter(f)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${sessFilter===f?"bg-accent/15 text-[#6ea8fe] border-accent/30":"border-white/8 text-muted hover:text-ink"}`}>
                        {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>{setQaForm(EMPTY_FORM);setQaErr("");setShowQuickAdd(true);}}
                    className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-white/14 text-muted hover:text-ink hover:border-white/25 transition-all whitespace-nowrap">
                    + New People
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <div className="text-[12px] text-muted py-4 text-center">No contacts — add them in the Contacts tab first.</div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {contacts.filter(c => sessFilter === "all" || c.category === sessFilter).map(c=>{
                      const picked=sessIds.has(c.id);
                      return (
                        <div key={c.id} onClick={()=>setSessIds(prev=>{const s=new Set(prev);s.has(c.id)?s.delete(c.id):s.add(c.id);return s;})}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${picked?"bg-accent/10 border-accent/30":"bg-bg border-white/6 hover:border-white/14"}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${picked?"bg-accent border-accent":"border-white/20"}`}>
                            {picked&&<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12.5px] font-semibold text-ink">{c.name}</span>
                              <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full border ${catMeta(c.category).color}`}>{catLabel(c)}</span>
                            </div>
                            <div className="font-mono text-[10.5px] text-muted truncate">{c.wallet.slice(0,10)}…</div>
                          </div>
                          {picked && (
                            <div className="flex items-center gap-1 shrink-0" onClick={e=>e.stopPropagation()}>
                              <input value={sessAmts[c.id]||""} onChange={e=>setSessAmts(p=>({...p,[c.id]:e.target.value}))} placeholder="0.00"
                                className="w-[72px] px-2 py-1 bg-bg border border-white/14 rounded-lg text-[12px] font-mono text-ink outline-none focus:border-accent/60" />
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
              <button onClick={()=>setShowNewSess(false)} className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-surface2 text-muted hover:text-ink transition-all">Cancel</button>
              <button onClick={createSession} disabled={!sessTitle.trim()||sessIds.size===0}
                className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-40">
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add People (inside New Session modal) */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={()=>setShowQuickAdd(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[400px] rounded-2xl overflow-hidden flex flex-col"
            style={{background:"#111520",boxShadow:"0 24px 64px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.08)"}}
            onClick={e=>e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/8 shrink-0">
              <div className="font-bold text-[14px]">Quick Add Contact</div>
              <button onClick={()=>setShowQuickAdd(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink transition-colors">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3 overflow-y-auto">
              <div>
                <label className="text-[11px] text-muted font-semibold uppercase tracking-wider block mb-1">Name</label>
                <input autoFocus value={qaForm.name} onChange={e=>setQaForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Alice Nguyen"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-semibold uppercase tracking-wider block mb-1">Wallet</label>
                <input value={qaForm.wallet} onChange={e=>setQaForm(f=>({...f,wallet:e.target.value}))} placeholder="0x…"
                  className="w-full px-3.5 py-2.5 bg-bg border border-white/8 rounded-xl text-[13px] font-mono text-ink outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] text-muted font-semibold uppercase tracking-wider block mb-1">Category</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {CATEGORIES.map(cat=>(
                    <button key={cat.value} onClick={()=>setQaForm(f=>({...f,category:cat.value}))}
                      className={`py-1.5 rounded-xl text-[11.5px] font-semibold border transition-all ${qaForm.category===cat.value?cat.color:"border-white/8 text-muted hover:text-ink"}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                {qaForm.category === "other" && (
                  <CustomCategoryInput
                    value={qaForm.customCategory}
                    contacts={contacts}
                    onChange={v=>setQaForm(f=>({...f,customCategory:v}))}
                  />
                )}
              </div>
              {qaErr && <div className="text-[12px] text-red px-3 py-2 bg-red/8 rounded-xl border border-red/20">{qaErr}</div>}
            </div>
            <div className="px-5 py-4 border-t border-white/8 flex justify-end gap-2 shrink-0">
              <button onClick={()=>setShowQuickAdd(false)} className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-surface2 text-muted hover:text-ink transition-all">Cancel</button>
              <button onClick={saveQuickAdd} className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-accent text-white hover:bg-accent/90 transition-all">Add & Select</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
