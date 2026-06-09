"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { getSettings, saveSettings } from "@/lib/storage";
import { useWallet } from "@/hooks/useWallet";

export default function Settings() {
  const { account, connect } = useWallet();
  const [form, setForm] = useState({ businessName:"", merchantId:"", merchantWallet:"", hubContract:"" });
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = getSettings();
    setForm({
      businessName: s.businessName || "",
      merchantId: s.merchantId || "",
      merchantWallet: s.merchantWallet || "0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02",
      hubContract: s.hubContract || "0xc7cb4f5ace70a4febc3b260591832af72563e988",
    });
  }, []);

  function save() {
    if (form.merchantWallet && !/^0x[a-fA-F0-9]{40}$/.test(form.merchantWallet)) { setMsg("Invalid wallet address"); return; }
    if (form.hubContract && !/^0x[a-fA-F0-9]{40}$/.test(form.hubContract)) { setMsg("Invalid contract address"); return; }
    saveSettings({ ...form, merchantId: form.merchantId.toLowerCase().replace(/\s+/g,"-") });
    setSaved(true); setMsg("Settings saved!");
    setTimeout(() => { setSaved(false); setMsg(""); }, 2000);
  }

  async function autoFill() {
    if (!account) await connect();
    setForm(f => ({ ...f, merchantWallet: account || "" }));
  }

  const NET = [
    ["Network","Arc Testnet"],["Chain ID","5042002 / 0x4CEF52"],
    ["RPC URL","rpc.testnet.arc.network"],["Gas Token","USDC (6 dec ERC-20)"],
    ["Explorer","testnet.arcscan.app"],["Faucet","faucet.circle.com"],
  ];

  return (
    <>
      <Topbar title="Settings" action={{ label: "Save Changes", onClick: save }} />
      <div className="p-7 flex-1 max-w-[680px]">
        {msg && <div className={`mb-4 px-4 py-2.5 rounded-lg text-[13px] font-semibold ${saved?"bg-green/10 text-green border border-green/20":"bg-red/10 text-red border border-red/20"}`}>{msg}</div>}

        {/* Business profile */}
        <div className="bg-surface border border-white/8 rounded-lg mb-5">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Business Profile</div>
            <div className="text-xs text-muted mt-0.5">Displayed on checkout pages and invoices</div>
          </div>
          <div className="p-5">
            <div className="w-[52px] h-[52px] bg-accent rounded-xl grid place-items-center text-[22px] font-bold text-white mb-4">
              {form.businessName.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Business Name</label>
              <input value={form.businessName} onChange={e=>setForm(f=>({...f,businessName:e.target.value}))} placeholder="My Shop"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Merchant ID / Slug</label>
              <input value={form.merchantId} onChange={e=>setForm(f=>({...f,merchantId:e.target.value}))} placeholder="my-shop"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
              <div className="text-[11.5px] text-muted mt-1">Lowercase, no spaces. Used in payment links and on-chain events.</div>
            </div>
          </div>
        </div>

        {/* Wallet & Contract */}
        <div className="bg-surface border border-white/8 rounded-lg mb-5">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Wallet & Contract</div>
            <div className="text-xs text-muted mt-0.5">Where payments are received</div>
          </div>
          <div className="p-5">
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Merchant Wallet Address</label>
              <input value={form.merchantWallet} onChange={e=>setForm(f=>({...f,merchantWallet:e.target.value}))}
                placeholder="0x…" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
              <div className="text-[11.5px] text-muted mt-1">Payments go directly to this wallet.</div>
            </div>
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Hub Contract Address</label>
              <input value={form.hubContract} onChange={e=>setForm(f=>({...f,hubContract:e.target.value}))}
                placeholder="0x…" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
            </div>
            <button onClick={autoFill} className="px-3.5 py-1.5 bg-surface2 border border-white/14 rounded-lg text-[13px] font-semibold text-muted hover:text-ink">
              ⚡ Auto-fill from MetaMask
            </button>
          </div>
        </div>

        {/* Arc Network */}
        <div className="bg-surface border border-white/8 rounded-lg mb-5">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Arc Network</div>
            <div className="text-xs text-muted mt-0.5">Read-only network configuration</div>
          </div>
          <div className="p-5">
            {NET.map(([l,v])=>(
              <div key={l} className="flex items-center justify-between py-2.5 border-b border-white/8 last:border-0">
                <span className="text-[13px] text-muted">{l}</span>
                <span className="font-mono text-[12.5px]">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Danger */}
        <div className="bg-surface border border-red/20 rounded-lg">
          <div className="px-5 py-4 border-b border-red/20">
            <div className="font-semibold text-sm text-red">Danger Zone</div>
          </div>
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold">Clear all payment history</div>
              <div className="text-[12px] text-muted">Permanently delete all transactions from local storage.</div>
            </div>
            <button onClick={() => { if(confirm("Clear ALL history?")) localStorage.removeItem("arcCheckoutHistory"); }}
              className="px-3.5 py-1.5 text-red border border-red/30 rounded-lg text-[13px] font-semibold hover:bg-red/10">
              Clear History
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
