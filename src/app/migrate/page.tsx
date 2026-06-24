"use client";
import { useState } from "react";

const LS_KEYS = [
  "arcCheckoutHistory",
  "arcCommerceInvoices",
  "arcCommerceSettings",
  "arcBridgeHistory",
  "arcRecurringPayments",
  "arcRecurringInvoices",
  "arcMerchantSession",
];

const NEW_DOMAIN = "https://nexmer.xyz";

export default function MigratePage() {
  const [status, setStatus]   = useState<"idle" | "running" | "done" | "error">("idle");
  const [wallet, setWallet]   = useState("");
  const [detail, setDetail]   = useState("");
  const [keyCount, setKeyCount] = useState(0);

  async function detectWallet() {
    const eth = (window as any).ethereum;
    if (!eth) { setDetail("MetaMask not found."); return; }
    const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
    setWallet(accs[0] || "");
  }

  async function doMigrate() {
    if (!wallet) { setDetail("Connect wallet first."); return; }
    setStatus("running"); setDetail("");

    // Collect localStorage data
    const data: Record<string, unknown> = { wallet };
    let count = 0;
    for (const key of LS_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { data[key] = JSON.parse(raw); count++; }
        catch { data[key] = raw; count++; }
      }
    }
    setKeyCount(count);

    if (count === 0) {
      setStatus("error");
      setDetail("No data found in localStorage on this domain. Nothing to migrate.");
      return;
    }

    try {
      const res = await fetch(`${NEW_DOMAIN}/api/user-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setStatus("done");
      setDetail(`${count} data keys migrated successfully.`);
    } catch (e: any) {
      setStatus("error");
      setDetail(e?.message || "Migration failed.");
    }
  }

  const isOnOldDomain = typeof window !== "undefined" &&
    window.location.hostname.includes("arcpay-desk");

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-[480px]">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-[28px] font-black text-white mb-1">
            Nex<span className="text-[#0757f9]">mer</span>
          </div>
          <div className="text-[13px] text-[#7d8590]">Data Migration Tool</div>
        </div>

        <div className="bg-[#161b22] border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-bold text-[15px] text-white">Migrate to nexmer.xyz</div>
            <div className="text-[12px] text-[#7d8590] mt-1">
              Move your invoices, payment history, and settings from this domain to the new one.
            </div>
          </div>

          <div className="p-5 flex flex-col gap-4">

            {!isOnOldDomain && (
              <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px]">
                ⚠ Open this page on <strong>arcpay-desk.vercel.app/migrate</strong> — that's where your old data lives.
              </div>
            )}

            {/* Step 1 */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider">
                Step 1 — Connect Wallet
              </div>
              {wallet ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#3fb950]/10 border border-[#3fb950]/20 text-[#3fb950] text-[13px] font-mono">
                  ✓ {wallet.slice(0, 10)}…{wallet.slice(-6)}
                </div>
              ) : (
                <button onClick={detectWallet}
                  className="w-full py-2.5 bg-[#0757f9] text-white rounded-xl text-[13px] font-bold hover:bg-[#0757f9]/90 transition-colors">
                  Connect MetaMask
                </button>
              )}
            </div>

            {/* Step 2 */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider">
                Step 2 — Migrate Data
              </div>
              <button
                onClick={doMigrate}
                disabled={!wallet || status === "running" || status === "done"}
                className="w-full py-3 bg-[#0757f9] text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-[#0757f9]/90 transition-colors">
                {status === "running" ? "Migrating…" :
                 status === "done"    ? "✓ Migration Complete" :
                 "Migrate My Data →"}
              </button>
            </div>

            {/* Status */}
            {detail && (
              <div className={`px-3 py-2.5 rounded-xl text-[12px] border ${
                status === "done"  ? "bg-[#3fb950]/8 text-[#3fb950] border-[#3fb950]/20" :
                status === "error" ? "bg-[#f85149]/8 text-[#f85149] border-[#f85149]/20" :
                "bg-[#1c2330] text-[#7d8590] border-white/8"
              }`}>
                {detail}
              </div>
            )}

            {status === "done" && (
              <a href={NEW_DOMAIN}
                className="w-full py-2.5 bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/20 rounded-xl text-[13px] font-bold hover:bg-[#3fb950]/25 transition-colors text-center">
                Go to nexmer.xyz →
              </a>
            )}

            {/* What gets migrated */}
            <div className="border-t border-white/8 pt-3">
              <div className="text-[11px] font-semibold text-[#7d8590] uppercase tracking-wider mb-2">
                What gets migrated
              </div>
              {[
                ["Payment history", "arcCheckoutHistory"],
                ["Invoices",        "arcCommerceInvoices"],
                ["Settings",        "arcCommerceSettings"],
                ["Bridge history",  "arcBridgeHistory"],
                ["Recurring payments", "arcRecurringPayments"],
                ["Merchant session", "arcMerchantSession"],
              ].map(([label, key]) => {
                const exists = typeof window !== "undefined" && !!localStorage.getItem(key);
                return (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-[12px] text-[#7d8590]">{label}</span>
                    <span className={`text-[11px] font-medium ${exists ? "text-[#3fb950]" : "text-white/20"}`}>
                      {exists ? "✓ Found" : "Empty"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
