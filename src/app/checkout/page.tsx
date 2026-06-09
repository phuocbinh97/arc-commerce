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

  const { account, isConnected, isArcNetwork, connect, switchToArc, getUsdcBalance } = useWallet();
  const { step, txHash, error, pay, reset } = useCheckout();
  const [balance, setBalance] = useState("—");
  const settings = typeof window !== "undefined" ? getSettings() : {};

  useEffect(() => { if (account) getUsdcBalance().then(setBalance); }, [account, getUsdcBalance]);

  const sufficient = balance !== "—" && parseFloat(balance) >= parseFloat(amount);

  async function handlePay() {
    if (!isConnected) { await connect(); return; }
    if (!isArcNetwork) { await switchToArc(); return; }
    await pay({ amount, orderId, memo }).catch(() => {});
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-md text-center shadow-2xl">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-green-700 mb-1">Payment Confirmed!</h1>
          <p className="text-gray-500 text-sm mb-6">Confirmed on Arc Testnet · {new Date().toLocaleTimeString()}</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6">
            <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Amount</span><strong>{amount} USDC</strong></div>
            <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Order ID</span><strong>{orderId}</strong></div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-500">Transaction</span>
              <div className="flex items-center gap-2">
                <strong className="font-mono text-xs">{txHash.slice(0,10)}…</strong>
                <button onClick={() => navigator.clipboard?.writeText(txHash)} className="text-xs text-gray-400 hover:text-gray-600">Copy</button>
              </div>
            </div>
            <a href={`${ARC_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="block text-center mt-3 text-blue-600 font-semibold text-sm hover:underline">View on ArcScan →</a>
          </div>
          <button onClick={reset} className="w-full py-3 border border-gray-200 rounded-lg font-semibold text-sm hover:bg-gray-50">← New Payment</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center p-6">
      <div className="grid grid-cols-[1fr_360px] gap-5 w-full max-w-4xl items-start">
        {/* Left: form */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <span className="text-gray-500">{isConnected ? `Connected: ${shortAddr(account)}` : "Wallet not connected"}</span>
              {isArcNetwork && <span className="flex items-center gap-1.5 text-blue-600 font-semibold"><span className="w-2 h-2 rounded-full bg-blue-500" />Arc Testnet</span>}
            </div>

            <div className="mb-4 p-3.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 grid place-items-center text-white font-bold text-lg">{merchantName.charAt(0)}</div>
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase">Merchant</div>
                <div className="font-semibold text-gray-900">{merchantName}</div>
              </div>
              <div className="ml-auto text-xs text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded-full">✓ Verified</div>
            </div>

            {isConnected && (
              <div className={`mb-4 flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${sufficient ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                <span>Your balance: {balance} USDC</span>
                <span>{sufficient ? "✓ Sufficient" : "✗ Insufficient"}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Amount</label>
                <input value={amount} readOnly className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Currency</label>
                <input value="USDC" disabled className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Order ID</label>
              <input value={orderId} readOnly className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50" />
            </div>
            {memo && <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Memo</label>
              <textarea value={memo} readOnly rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 resize-none" />
            </div>}

            {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

            <div className="flex gap-2">
              <button onClick={handlePay} disabled={!["idle","error","success"].includes(step)}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm disabled:opacity-60 hover:bg-blue-700 transition-colors">
                {STEP_LABELS[step]}
              </button>
              <button onClick={switchToArc} className="px-4 py-2.5 border border-gray-200 rounded-lg font-semibold text-sm text-gray-600 hover:bg-gray-50">
                Switch network
              </button>
            </div>
          </div>
        </div>

        {/* Right: preview */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Payment preview</h2>
          <div className="text-5xl font-black tracking-tight mb-1">${amount} <span className="text-xl text-gray-400 font-semibold">USDC</span></div>
          <p className="text-gray-500 text-sm mb-5">You will approve USDC first, then confirm the payment through the merchant checkout contract.</p>

          <h3 className="font-semibold text-gray-900 mb-3">How payment works</h3>
          {[["Approve USDC","Allow this checkout to use exactly the invoice amount."],
            ["Confirm payment","Send the payment through the merchant contract on Arc."],
            ["Get receipt","View the confirmed transaction on ArcScan."]].map(([t,d],i)=>(
            <div key={i} className={`flex gap-3 mb-3 ${step==="approving"||step==="confirming-approve" ? i===0?"opacity-100 font-semibold":i===1?"opacity-40":"opacity-40" : step==="paying"||step==="confirming-pay"?i===0?"opacity-60":i===1?"opacity-100 font-semibold":"opacity-40":"opacity-80"}`}>
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 grid place-items-center text-xs font-bold shrink-0">{i+1}</div>
              <div><div className="font-semibold text-sm text-gray-900">{t}</div><div className="text-xs text-gray-500">{d}</div></div>
            </div>
          ))}

          <div className="mt-4 p-3 bg-amber-50 border-l-4 border-amber-400 text-amber-800 text-xs rounded-r-lg">
            Use testnet funds only. Get Arc Testnet USDC from the{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="font-bold underline">Circle Faucet</a>.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Checkout() {
  return <Suspense><CheckoutContent /></Suspense>;
}
