"use client";
import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getSwapHistory, saveSwapEntry } from "@/lib/storage";
import { formatUsdc, timeAgo, KIT_KEY } from "@/lib/arc";

export default function Treasury() {
  const { account, isConnected, connect, getUsdcBalance, walletName } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState("—");
  const [swapFrom, setSwapFrom] = useState("USDC");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapStatus, setSwapStatus] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapHist, setSwapHist] = useState(() => getSwapHistory(account));

  useEffect(() => {
    if (account) {
      getUsdcBalance().then(setUsdcBalance);
      setSwapHist(getSwapHistory(account));
    }
  }, [account, getUsdcBalance]);

  const doSwap = useCallback(async () => {
    if (!account || !swapAmount) return;
    setSwapping(true); setSwapStatus("Preparing swap…");
    try {

      const { AppKit } = await import("@circle-fin/app-kit");
      // ✅ Correct function: createAdapterFromProvider
      const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");

      const kit = new AppKit();
      const eth = (window as any).ethereum;

      setSwapStatus("Creating adapter from MetaMask…");
      const adapter = await (createAdapterFromProvider as any)({ provider: eth });

      setSwapStatus(`Confirm swap in ${walletName}…`);
      const swapResult = await kit.swap({
        from: { adapter, chain: "Arc_Testnet" },
        tokenIn: swapFrom as "USDC" | "EURC",
        tokenOut: swapFrom === "USDC" ? "EURC" : "USDC",
        amountIn: parseFloat(swapAmount).toFixed(2),
        config: { kitKey: `KIT_KEY:${KIT_KEY}` },
      });

      const txHash = (swapResult as any)?.txHash || (swapResult as any)?.hash || (typeof swapResult === "string" ? swapResult : null);
      if (!txHash && swapResult !== true) {
        setSwapStatus("Swap cancelled.");
        return;
      }

      const tokenOut = swapFrom === "USDC" ? "EURC" : "USDC";
      saveSwapEntry({ tokenIn: swapFrom, tokenOut, amountIn: swapAmount, ts: Date.now(), status: "completed" }, account);
      setSwapHist(getSwapHistory(account));
      setSwapStatus(`✅ Swap complete! ${swapAmount} ${swapFrom} → ${tokenOut}`);
      getUsdcBalance().then(setUsdcBalance);
    } catch (e: any) {
      if (e?.code === 4001 || e?.message?.toLowerCase().includes("rejected") || e?.message?.toLowerCase().includes("cancel")) {
        setSwapStatus("Swap cancelled.");
      } else {
        saveSwapEntry({ tokenIn: swapFrom, tokenOut: swapFrom === "USDC" ? "EURC" : "USDC", amountIn: swapAmount, ts: Date.now(), status: "failed" }, account);
        setSwapStatus(`❌ ${e.message || "Swap failed"}`);
        console.error("Swap error:", e);
      }
    } finally { setSwapping(false); }
  }, [account, swapAmount, swapFrom, getUsdcBalance]);

  return (
    <>
      <Topbar title="Treasury" action={{ label: "↻ Refresh", onClick: () => getUsdcBalance().then(setUsdcBalance) }} />
      <div className="p-7 flex-1">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Balance card */}
          <div className="bg-surface border border-white/8 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2775ca] to-[#1a5fa8] grid place-items-center text-lg font-bold text-white">$</div>
              <div>
                <div className="font-bold text-[15px]">USDC</div>
                <div className="text-[11.5px] text-muted">USD Coin · Arc Testnet</div>
              </div>
            </div>
            <div className="text-4xl font-bold font-mono tracking-tight mb-1">{usdcBalance}</div>
            <div className="text-[13px] text-muted mb-4">
              {account ? `${account.slice(0,6)}…${account.slice(-4)} · Arc Testnet` : "Connect wallet to view"}
            </div>
            <div className="flex gap-2">
              {!isConnected ? (
                <button onClick={connect} className="px-3.5 py-1.5 bg-accent text-white rounded-lg text-[13px] font-semibold hover:bg-accent/90">⚡ Connect Wallet</button>
              ) : (
                <button onClick={() => getUsdcBalance().then(setUsdcBalance)} className="px-3.5 py-1.5 bg-surface2 border border-white/14 text-muted rounded-lg text-[13px] font-semibold hover:text-ink">↻ Refresh</button>
              )}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
                className="px-3.5 py-1.5 bg-surface2 border border-white/14 rounded-lg text-[13px] font-semibold text-muted hover:text-ink">Get Testnet USDC</a>
            </div>
          </div>

          {/* Swap card */}
          <div className="bg-surface border border-white/8 rounded-lg p-6">
            <div className="font-semibold text-sm mb-4">
              Swap Stablecoins
              <span className="text-[11px] text-muted ml-2">via Arc App Kit</span>
            </div>
            <div className="mb-3">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">From</label>
              <select value={swapFrom} onChange={e => setSwapFrom(e.target.value)}
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent">
                <option value="USDC">USDC</option>
                <option value="EURC">EURC</option>
              </select>
            </div>
            <div className="text-center text-muted my-2 text-sm">⇅ → {swapFrom === "USDC" ? "EURC" : "USDC"}</div>
            <div className="mb-3">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Amount</label>
              <input type="number" value={swapAmount} onChange={e => setSwapAmount(e.target.value)} placeholder="10.00"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
            </div>

            {swapStatus && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-[12.5px] ${
                swapStatus.startsWith("✅") ? "bg-green/10 text-green border border-green/20"
                : swapStatus.startsWith("❌") ? "bg-red/10 text-red border border-red/20"
                : "bg-surface2 text-muted"}`}>
                {swapStatus}
              </div>
            )}

            <button onClick={doSwap} disabled={swapping || !isConnected || !swapAmount}
              className="w-full py-2 bg-accent text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:bg-accent/90 transition-colors">
              {swapping ? "Swapping…" : `Swap ${swapFrom} → ${swapFrom === "USDC" ? "EURC" : "USDC"}`}
            </button>
            <p className="mt-2 text-center text-[11.5px] text-muted">
              Powered by <a href="https://docs.arc.io/app-kit/swap" target="_blank" rel="noreferrer" className="text-[#6ea8fe]">Arc App Kit</a>
            </p>
          </div>
        </div>

        {/* Swap history */}
        <div className="bg-surface border border-white/8 rounded-lg">
          <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Swap History</div>
          <div className="p-4">
            {swapHist.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm">No swaps yet</div>
            ) : swapHist.map((h, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/8 last:border-0">
                <div className={`w-[30px] h-[30px] rounded-lg grid place-items-center text-sm ${h.status === "completed" ? "bg-green/10" : "bg-red/10"}`}>
                  {h.status === "completed" ? "⇄" : "✗"}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium font-mono">{h.tokenIn} → {h.tokenOut}</div>
                  <div className="text-[11.5px] text-muted">{timeAgo(h.ts)}</div>
                </div>
                <div className={`font-mono text-[13px] font-semibold ${h.status === "completed" ? "text-green" : "text-red"}`}>
                  {h.status === "completed" ? `${h.amountIn} ${h.tokenIn}` : "Failed"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
