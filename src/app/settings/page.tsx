"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { getSettings, saveSettings } from "@/lib/storage";
import { useWallet } from "@/hooks/useWallet";

export default function Settings() {
  const { account, connect } = useWallet();
  const [form, setForm] = useState({ businessName: "", merchantId: "", merchantWallet: "", hubContract: "" });
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState("");
  const [registering, setRegistering] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("arcWalletDisconnected") === "1") {
      setForm(f => ({ ...f, merchantWallet: "", businessName: "", merchantId: "" }));
      return;
    }
    const s = getSettings();
    setForm({
      businessName: s.businessName || "",
      merchantId: s.merchantId || "",
      merchantWallet: account || s.merchantWallet || "",
      hubContract: s.hubContract || "0xc7cb4f5ace70a4febc3b260591832af72563e988",
    });
  }, [account]);

  function save() {
    if (form.merchantWallet && !/^0x[a-fA-F0-9]{40}$/.test(form.merchantWallet)) { setMsg("Invalid wallet address"); return; }
    if (form.hubContract && !/^0x[a-fA-F0-9]{40}$/.test(form.hubContract)) { setMsg("Invalid contract address"); return; }
    saveSettings({ ...form, merchantId: form.merchantId.toLowerCase().replace(/\s+/g, "-") });
    setSaved(true); setMsg("Settings saved!");
    setTimeout(() => { setSaved(false); setMsg(""); }, 2000);
  }

  async function autoFill() {
    if (!account) await connect();
    setForm(f => ({ ...f, merchantWallet: account || "" }));
  }

  async function register() {
    // Auto-connect wallet if not connected
    let wallet = form.merchantWallet;
    if (!wallet) {
      try {
        const addr = await connect();
        wallet = addr;
        setForm(f => ({ ...f, merchantWallet: addr }));
      } catch { setMsg("Connect your wallet first"); return; }
    }
    if (!form.businessName) {
      setMsg("Enter your Business Name first"); return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setMsg("Invalid wallet address"); return;
    }
    setRegistering(true); setMsg("");
    try {
      const res = await fetch("/api/merchants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.businessName, wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const newForm = { ...form, merchantId: data.merchant.merchantId };
      setForm(newForm);
      saveSettings({ ...newForm });
      // Auto-login: set merchant session so Topbar shows name + Logout
      const session = { merchantId: data.merchant.merchantId, name: data.merchant.name, wallet: form.merchantWallet };
      localStorage.setItem("arcMerchantSession", JSON.stringify(session));
      setSaved(true); setMsg(`✅ Registered! Your Merchant ID: ${data.merchant.merchantId}`);
      setTimeout(() => { setSaved(false); setMsg(""); }, 5000);
    } catch (e: unknown) {
      setMsg(`❌ ${e instanceof Error ? e.message : "Registration failed"}`);
    } finally {
      setRegistering(false);
    }
  }

  function copySnippet() {
    const snippet = `<script src="https://arcpay-desk.vercel.app/widget.js"\n  data-merchant="${form.merchantId}"\n  data-amount="{{order.total}}"\n  data-order="{{order.id}}"\n  data-redirect="https://yourshop.com/success">\n</script>`;
    navigator.clipboard?.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const NET = [
    ["Network", "Arc Testnet"], ["Chain ID", "5042002 / 0x4CEF52"],
    ["RPC URL", "rpc.testnet.arc.network"], ["Gas Token", "USDC (6 dec ERC-20)"],
    ["Explorer", "testnet.arcscan.app"], ["Faucet", "faucet.circle.com"],
  ];

  const snippet = `<script src="https://arcpay-desk.vercel.app/widget.js"
  data-merchant="${form.merchantId || "mer_xxxxxxx"}"
  data-amount="{{order.total}}"
  data-order="{{order.id}}"
  data-redirect="https://yourshop.com/success">
</script>`;

  return (
    <>
      <Topbar title="Settings" action={{ label: "Save Changes", onClick: save }} />
      <div className="p-7 flex-1 max-w-[680px]">
        {msg && (
          <div className={`mb-4 px-4 py-2.5 rounded-lg text-[13px] font-semibold ${saved ? "bg-green/10 text-green border border-green/20" : "bg-red/10 text-red border border-red/20"}`}>
            {msg}
          </div>
        )}

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
              <input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="My Shop"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
            </div>
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Merchant ID</label>
              <div className="flex gap-2">
                <input value={form.merchantId} readOnly placeholder="Chưa đăng ký — bấm Register bên dưới"
                  className="flex-1 bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none opacity-70" />
                {form.merchantId && (
                  <span className="px-2.5 py-1 bg-green/10 text-green border border-green/20 rounded-lg text-[12px] font-semibold self-center">✓ Active</span>
                )}
              </div>
              <div className="text-[11.5px] text-muted mt-1">Generated automatically khi bạn Register. Dùng trong payment links và widget.</div>
            </div>
          </div>
        </div>

        {/* Wallet & Contract */}
        <div className="bg-surface border border-white/8 rounded-lg mb-5">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Wallet & Contract</div>
            <div className="text-xs text-muted mt-0.5">Payments go directly to your wallet</div>
          </div>
          <div className="p-5">
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Merchant Wallet Address</label>
              <input value={form.merchantWallet} onChange={e => setForm(f => ({ ...f, merchantWallet: e.target.value }))}
                placeholder="0x…" className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
              <div className="text-[11.5px] text-muted mt-1">
                {account ? "Auto-filled from connected wallet. USDC payments go directly here." : "Connect your wallet — address will auto-fill."}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={register} disabled={registering}
                className="px-3.5 py-1.5 bg-accent text-white rounded-lg text-[13px] font-semibold hover:bg-accent/90 disabled:opacity-50">
                {registering ? "Registering…" : form.merchantId ? "Re-register" : "Register as Merchant"}
              </button>
            </div>
          </div>
        </div>

        {/* Embed Widget — chỉ hiện khi đã có merchantId */}
        {form.merchantId && (
          <div className="bg-surface border border-white/8 rounded-lg mb-5">
            <div className="px-5 py-4 border-b border-white/8">
              <div className="font-semibold text-sm">Embed Widget</div>
              <div className="text-xs text-muted mt-0.5">Copy snippet này vào trang web của bạn để nhận thanh toán</div>
            </div>
            <div className="p-5">
              <div className="relative">
                <pre className="bg-surface2 border border-white/8 rounded-lg p-4 text-[12px] text-ink font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {snippet}
                </pre>
                <button onClick={copySnippet}
                  className={`absolute top-2 right-2 px-2.5 py-1 rounded text-[11.5px] font-semibold transition-colors ${copied ? "bg-green/20 text-green" : "bg-surface border border-white/14 text-muted hover:text-ink"}`}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="mt-3 text-[12px] text-muted">
                Thay <code className="text-ink bg-surface2 px-1 rounded">{"{{order.total}}"}</code> và <code className="text-ink bg-surface2 px-1 rounded">{"{{order.id}}"}</code> bằng giá trị thật từ hệ thống của bạn.
              </div>
              <div className="mt-3 p-3 bg-accent/10 border border-accent/20 rounded-lg text-[12.5px] text-[#6ea8fe]">
                💡 Payment link trực tiếp:{" "}
                <span className="font-mono break-all">
                  {`https://arcpay-desk.vercel.app/checkout?merchant=${form.merchantId}&amount=10.00&order=ORDER_ID`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Arc Network */}
        <div className="bg-surface border border-white/8 rounded-lg mb-5">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Arc Network</div>
            <div className="text-xs text-muted mt-0.5">Read-only network configuration</div>
          </div>
          <div className="p-5">
            {NET.map(([l, v]) => (
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
            <button onClick={() => { if (confirm("Clear ALL history?")) localStorage.removeItem("arcCheckoutHistory"); }}
              className="px-3.5 py-1.5 text-red border border-red/30 rounded-lg text-[13px] font-semibold hover:bg-red/10">
              Clear History
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
