"use client";
import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getSwapHistory, saveSwapEntry } from "@/lib/storage";
import { timeAgo, KIT_KEY } from "@/lib/arc";

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface border border-white/8 rounded-xl overflow-hidden w-full">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface2 transition-colors">
        <span className="font-semibold text-[13.5px]">{title}</span>
        <span className={`text-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="border-t border-white/8">{children}</div>}
    </div>
  );
}

const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ARC_RPC = "https://rpc.testnet.arc.network";

async function fetchTokenBalance(token: "USDC" | "EURC", addr: string): Promise<string> {
  const contractAddr = token === "USDC"
    ? "0x3600000000000000000000000000000000000000"
    : EURC_ADDRESS;
  const data = "0x70a08231" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
  const res = await fetch(ARC_RPC, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contractAddr, data }, "latest"] }),
  }).then(r => r.json());
  const raw = res.result && res.result !== "0x" ? res.result : "0x0";
  return (Number(BigInt(raw)) / 1e6).toFixed(2);
}

export default function Treasury() {
  const { account, isConnected, connect, getUsdcBalance, walletName } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState("—");
  const [eurcBalance, setEurcBalance] = useState("—");
  const [swapFrom, setSwapFrom] = useState("USDC");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapStatus, setSwapStatus] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapHist, setSwapHist] = useState<ReturnType<typeof getSwapHistory>>([]);

  const refreshBalances = useCallback(async () => {
    if (!account) return;
    const [usdc, eurc] = await Promise.all([
      fetchTokenBalance("USDC", account),
      fetchTokenBalance("EURC", account),
    ]);
    setUsdcBalance(usdc);
    setEurcBalance(eurc);
  }, [account]);

  // Load balance + history when account is ready
  useEffect(() => {
    if (account) {
      refreshBalances();
      setSwapHist(getSwapHistory(account));
    }
  }, [account, refreshBalances]);

  const swapTo = swapFrom === "USDC" ? "EURC" : "USDC";
  const amtNum = parseFloat(swapAmount) || 0;

  const doSwap = useCallback(async () => {
    if (!account || !swapAmount) return;
    setSwapping(true); setSwapStatus("Preparing swap…");
    try {
      const { AppKit } = await import("@circle-fin/app-kit");
      const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
      const kit = new AppKit();
      const eth = (window as any).ethereum;

      setSwapStatus("Creating adapter from MetaMask…");
      const adapter = await (createAdapterFromProvider as any)({ provider: eth });
      setSwapStatus(`Confirm swap in ${walletName}…`);

      const arcRpc = async (method: string, params: unknown[]) => {
        const res = await fetch("https://rpc.testnet.arc.network", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }).then(r => r.json());
        return res.result;
      };

      const nonceBefore = parseInt(await arcRpc("eth_getTransactionCount", [account, "latest"]), 16);

      await kit.swap({
        from: { adapter, chain: "Arc_Testnet" },
        tokenIn: swapFrom as "USDC" | "EURC",
        tokenOut: swapTo as "USDC" | "EURC",
        amountIn: parseFloat(swapAmount).toFixed(2),
        config: { kitKey: `KIT_KEY:${KIT_KEY}` },
      });

      const nonceAfter = parseInt(await arcRpc("eth_getTransactionCount", [account, "latest"]), 16);

      if (nonceAfter <= nonceBefore) {
        setSwapStatus("Swap cancelled.");
        setSwapping(false);
        return;
      }

      saveSwapEntry({ tokenIn: swapFrom, tokenOut: swapTo, amountIn: swapAmount, ts: Date.now(), status: "completed" }, account);
      const updated = getSwapHistory(account);
      setSwapHist(updated);
      setSwapStatus(`✅ Swap complete! ${swapAmount} ${swapFrom} → ${swapTo}`);
      refreshBalances();
    } catch (e: any) {
      if (e?.code === 4001 || e?.message?.toLowerCase().includes("rejected") || e?.message?.toLowerCase().includes("cancel")) {
        setSwapStatus("Swap cancelled.");
      } else {
        saveSwapEntry({ tokenIn: swapFrom, tokenOut: swapTo, amountIn: swapAmount, ts: Date.now(), status: "failed" }, account);
        const updated = getSwapHistory(account);
        setSwapHist(updated);
        setSwapStatus(`❌ ${e.message || "Swap failed"}`);
      }
    } finally { setSwapping(false); }
  }, [account, swapAmount, swapFrom, swapTo, getUsdcBalance, walletName]);

  return (
    <>
      <Topbar title="Treasury" />
      <div className="p-6 flex-1 flex flex-col items-center gap-5 max-w-[860px] mx-auto w-full">

        {/* Swap card */}
        <div className="bg-surface border border-white/8 rounded-2xl overflow-hidden w-full">

          {/* Header — balance inside */}
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <div>
              <div className="font-bold text-[14px]">Swap Stablecoins</div>
              <div className="text-[11px] text-muted mt-0.5">Arc App Kit · Arc Testnet</div>
            </div>
            <div className="flex items-center gap-3">
              {isConnected && (
                )}
              <div className="flex gap-1.5">
                {!isConnected ? (
                  <button onClick={connect}
                    className="px-3 py-1.5 bg-accent text-white rounded-lg text-[12px] font-semibold hover:bg-accent/90">
                    Connect Wallet
                  </button>
                ) : (
                  <button onClick={refreshBalances}
                    className="px-3 py-1.5 bg-surface2 border border-white/8 text-muted rounded-lg text-[12px] font-semibold hover:text-ink transition-colors">
                    ↻ Refresh
                  </button>
                )}
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 bg-surface2 border border-white/8 rounded-lg text-[12px] font-semibold text-muted hover:text-ink transition-colors">
                  Faucet
                </a>
              </div>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* FROM block */}
            <div className="bg-bg rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">From</span>
                <span className="text-[11px] text-muted">
                  Balance: <span className="text-ink font-mono">{swapFrom === "USDC" ? usdcBalance : eurcBalance} {swapFrom}</span>
                </span>
              </div>
              <select value={swapFrom} onChange={e => { setSwapFrom(e.target.value); setSwapStatus(""); }}
                className="w-full bg-surface2 border border-white/6 rounded-lg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent transition-colors cursor-pointer">
                <option value="USDC">$ USDC</option>
                <option value="EURC">€ EURC</option>
              </select>
              <div className="flex items-center gap-3">
                <input type="number" value={swapAmount} onChange={e => { setSwapAmount(e.target.value); setSwapStatus(""); }}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-[28px] font-bold text-ink outline-none placeholder:text-muted w-0" />
                <span className="text-[13px] text-muted font-medium shrink-0">{swapFrom}</span>
              </div>
            </div>

            {/* Swap direction button */}
            <div className="flex justify-center -my-1">
              <button onClick={() => { setSwapFrom(swapTo); setSwapStatus(""); }} title="Swap direction"
                className="w-8 h-8 rounded-full bg-surface2 border border-white/8 grid place-items-center text-muted hover:text-white hover:border-accent hover:bg-accent/10 transition-all text-sm font-bold select-none">
                ⇅
              </button>
            </div>

            {/* TO block */}
            <div className="bg-bg rounded-xl p-4 flex flex-col gap-3">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">To</span>
              <div className="w-full bg-surface2 border border-white/6 rounded-lg px-3 py-2.5 text-[13px] text-muted">
                {swapTo === "USDC" ? "$ USDC" : "€ EURC"}
              </div>
              <div className="flex items-center gap-3">
                <span className={`flex-1 text-[28px] font-bold ${amtNum > 0 ? "text-green" : "text-muted"}`}>
                  {amtNum > 0 ? `~${amtNum.toFixed(4)}` : "0.00"}
                </span>
                <span className="text-[13px] text-muted font-medium shrink-0">{swapTo}</span>
              </div>
            </div>

            {/* Status */}
            {swapStatus && (
              <div className={`px-3 py-2.5 rounded-xl text-[12px] leading-relaxed border ${
                swapStatus.startsWith("✅") ? "bg-green/8 text-green border-green/20" :
                swapStatus.startsWith("❌") ? "bg-red/8 text-red border-red/20" :
                "bg-surface2 text-muted border-white/8"}`}>
                {swapStatus}
              </div>
            )}

            {/* CTA */}
            {!isConnected ? (
              <button onClick={connect}
                className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold hover:bg-accent/90 transition-colors">
                Connect Wallet
              </button>
            ) : (
              <button onClick={doSwap} disabled={swapping || amtNum <= 0}
                className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors">
                {swapping ? "Swapping…" : amtNum > 0 ? `Swap ${swapAmount} ${swapFrom} → ${swapTo}` : "Enter amount to swap"}
              </button>
            )}

            <p className="text-center text-[11px] text-muted">
              Powered by{" "}
              <a href="https://docs.arc.io/app-kit/swap" target="_blank" rel="noreferrer"
                className="text-accent hover:underline">Arc App Kit</a>
              {" · "}USDC ↔ EURC on Arc Testnet
            </p>
          </div>
        </div>

        {/* Swap History — accordion like Bridge */}
        <Accordion key="swap-history" title={`Swap History  (${swapHist.length})`}>
          {swapHist.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">No swaps yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/8 text-muted text-left">
                    <th className="px-4 py-2.5 font-medium">Swap</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {swapHist.map((h, i) => (
                    <tr key={i} className="border-b border-white/6 last:border-0 hover:bg-surface2/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">{h.tokenIn} → {h.tokenOut}</td>
                      <td className="px-4 py-3 font-mono">{h.amountIn} {h.tokenIn}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          h.status === "completed" ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
                          {h.status === "completed" ? "✓ Done" : "✗ Failed"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted text-right">{timeAgo(h.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Accordion>

      </div>
    </>
  );
}
