"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useCheckout } from "@/hooks/useCheckout";
import { formatUsdc, shortAddr, ARC_EXPLORER } from "@/lib/arc";
import { getSettings } from "@/lib/storage";

const STEP_LABELS: Record<string, string> = {
  idle: "Pay with USDC",
  approving: "Step 1/2 — Approve USDC…",
  "confirming-approve": "Confirming approve…",
  paying: "Step 2/2 — Sending payment…",
  "confirming-pay": "Waiting for receipt…",
  success: "Payment Confirmed!",
  error: "Try again",
};

function CheckoutContent() {
  const params = useSearchParams();
  const amount = params.get("amount") || "1.00";
  const orderId = params.get("order") || `order-${Date.now()}`;
  const memo = params.get("memo") || "";
  const merchantName = params.get("merchantName") || "Arc Commerce";
  const merchantParam = params.get("merchant") || ""; // merchantId from external shop
  const redirect = params.get("redirect") || "";

  const { account, isConnected, isArcNetwork, connect, switchToArc, getUsdcBalance } = useWallet();
  const { step, txHash, error, pay, reset } = useCheckout();
  const [balance, setBalance] = useState("—");
  const [merchantOverride, setMerchantOverride] = useState<{ wallet: string; merchantId: string } | undefined>();
  const [loadingMerchant, setLoadingMerchant] = useState(false);
  const settings = typeof window !== "undefined" ? getSettings() : { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" };

  // Lookup external merchant from Redis
  useEffect(() => {
    if (!merchantParam) return;
    setLoadingMerchant(true);
    fetch(`/api/merchants/${merchantParam}`)
      .then(r => r.json())
      .then(data => {
        if (data.merchant) {
          setMerchantOverride({ wallet: data.merchant.wallet, merchantId: data.merchant.merchantId });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingMerchant(false));
  }, [merchantParam]);

  useEffect(() => { if (account) getUsdcBalance().then(setBalance); }, [account, getUsdcBalance]);

  const isEmbed = params.get("embed") === "1";
  const displayName = merchantOverride ? (params.get("merchantName") || merchantParam) : (merchantName || settings.businessName || "Arc Commerce");
  const sufficient = balance !== "—" && parseFloat(balance) >= parseFloat(amount);

  async function handlePay() {
    if (!isConnected) { await connect(); return; }
    if (!isArcNetwork) { await switchToArc(); return; }
    await pay({ amount, orderId, memo, merchantOverride }).catch(() => {});
  }

  // After success: postMessage to parent (widget) + redirect
  useEffect(() => {
    if (step === "success") {
      // Notify parent iframe
      if (window.parent !== window) {
        window.parent.postMessage({ type: "ARCPAY_SUCCESS", orderId, txHash }, "*");
      }
      if (redirect) {
        const timer = setTimeout(() => {
          window.location.href = `${redirect}?order=${orderId}&tx=${txHash}`;
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [step, redirect, orderId, txHash]);

  if (step === "success") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="bg-surface border border-white/8 rounded-xl p-8 w-full max-w-md text-center shadow-2xl">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-green mb-1">Payment Confirmed!</h1>
          <p className="text-muted text-sm mb-6">Confirmed on Arc Testnet · {new Date().toLocaleTimeString()}</p>
          <div className="bg-surface2 border border-white/8 rounded-xl p-4 text-left mb-6">
            <div className="flex justify-between text-sm mb-2"><span className="text-muted">Amount</span><strong className="text-ink">{amount} USDC</strong></div>
            <div className="flex justify-between text-sm mb-2"><span className="text-muted">Order ID</span><strong className="text-ink">{orderId}</strong></div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted">Transaction</span>
              <div className="flex items-center gap-2">
                <strong className="font-mono text-xs text-ink">{txHash.slice(0, 10)}…</strong>
                <button onClick={() => navigator.clipboard?.writeText(txHash)} className="text-xs text-muted hover:text-ink">Copy</button>
              </div>
            </div>
            <a href={`${ARC_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="block text-center mt-3 text-accent font-semibold text-sm hover:underline">View on ArcScan →</a>
          </div>
          {redirect
            ? <p className="text-muted text-xs mb-3">Redirecting back to shop in 3s…</p>
            : null}
          <button onClick={reset} className="w-full py-3 border border-white/8 rounded-lg font-semibold text-sm text-ink hover:bg-surface2">← New Payment</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-bg flex items-center justify-center ${isEmbed ? "p-3" : "p-6"}`}>
      <div className={isEmbed ? "w-full max-w-md" : "grid grid-cols-[1fr_360px] gap-5 w-full max-w-4xl items-start"}>
        {/* Left: form */}
        <div className="bg-surface border border-white/8 rounded-xl shadow-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4 p-3 bg-surface2 border border-white/8 rounded-lg text-sm">
              <span className="text-muted">{isConnected ? `Connected: ${shortAddr(account)}` : "Wallet not connected"}</span>
              {isArcNetwork && <span className="flex items-center gap-1.5 text-accent font-semibold"><span className="w-2 h-2 rounded-full bg-accent" />Arc Testnet</span>}
            </div>

            <div className="mb-4 p-3.5 bg-surface2 border border-white/8 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center text-white font-bold text-lg">{displayName.charAt(0).toUpperCase()}</div>
              <div>
                <div className="text-[11px] font-semibold text-muted uppercase">Merchant</div>
                <div className="font-semibold text-ink">{loadingMerchant ? "Loading…" : displayName}</div>
              </div>
              <div className="ml-auto text-xs text-green font-semibold bg-green/10 px-2 py-0.5 rounded-full">✓ Verified</div>
            </div>

            {isConnected && (
              <div className={`mb-4 flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${sufficient ? "bg-green/10 border border-green/20 text-green" : "bg-red/10 border border-red/20 text-red"}`}>
                <span>Your balance: {balance} USDC</span>
                <span>{sufficient ? "✓ Sufficient" : "✗ Insufficient"}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Amount</label>
                <input value={formatUsdc(amount)} readOnly className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Currency</label>
                <input value="USDC" disabled className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted uppercase mb-1 block">Order ID</label>
              <input value={orderId} readOnly className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink font-mono" />
            </div>
            {memo && <div className="mb-4">
              <label className="text-xs font-semibold text-muted uppercase mb-1 block">Memo</label>
              <textarea value={memo} readOnly rows={2} className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink resize-none" />
            </div>}

            {error && <div className="mb-3 px-3 py-2 bg-red/10 border border-red/20 rounded-lg text-red text-sm">{error}</div>}

            <div className="flex gap-2">
              <button onClick={handlePay} disabled={!["idle", "error", "success"].includes(step) || loadingMerchant}
                className="flex-1 py-2.5 bg-accent text-white rounded-lg font-semibold text-sm disabled:opacity-60 hover:bg-accent/90 transition-colors">
                {STEP_LABELS[step]}
              </button>
              <button onClick={switchToArc} className="px-4 py-2.5 border border-white/8 rounded-lg font-semibold text-sm text-muted hover:bg-surface2">
                Switch network
              </button>
            </div>
          </div>
        </div>

        {/* Right: preview — hidden in embed mode */}
        {!isEmbed && <div className="bg-surface border border-white/8 rounded-xl shadow-lg p-6">
          <h2 className="font-semibold text-ink mb-3">Payment preview</h2>
          <div className="text-5xl font-black tracking-tight mb-1 text-ink">${formatUsdc(amount)} <span className="text-xl text-muted font-semibold">USDC</span></div>
          <p className="text-muted text-sm mb-5">You will approve USDC first, then confirm the payment through the merchant checkout contract.</p>

          <h3 className="font-semibold text-ink mb-3">How payment works</h3>
          {[["Approve USDC", "Allow this checkout to use exactly the invoice amount."],
            ["Confirm payment", "Send the payment through the merchant contract on Arc."],
            ["Get receipt", "View the confirmed transaction on ArcScan."]].map(([t, d], i) => (
            <div key={i} className={`flex gap-3 mb-3 ${step === "approving" || step === "confirming-approve" ? i === 0 ? "opacity-100" : "opacity-40" : step === "paying" || step === "confirming-pay" ? i === 0 ? "opacity-60" : i === 1 ? "opacity-100" : "opacity-40" : "opacity-80"}`}>
              <div className="w-7 h-7 rounded-full bg-accent/15 text-accent grid place-items-center text-xs font-bold shrink-0">{i + 1}</div>
              <div><div className="font-semibold text-sm text-ink">{t}</div><div className="text-xs text-muted">{d}</div></div>
            </div>
          ))}

          <div className="mt-4 p-3 bg-amber/10 border-l-4 border-amber text-amber text-xs rounded-r-lg">
            Use testnet funds only. Get Arc Testnet USDC from the{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="font-bold underline">Circle Faucet</a>.
          </div>
        </div>}
      </div>
    </div>
  );
}

export default function Checkout() {
  return <Suspense><CheckoutContent /></Suspense>;
}
