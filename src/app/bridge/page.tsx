/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getBridgeHistory, saveBridgeEntry } from "@/lib/storage";

const CHAINS = [
  { id: "Arc_Testnet",      label: "⚡ Arc Testnet",      gas: "USDC" },
  { id: "Ethereum_Sepolia", label: "Ξ Ethereum Sepolia", gas: "ETH"  },
  { id: "Base_Sepolia",     label: "🔵 Base Sepolia",     gas: "ETH"  },
  { id: "Arbitrum_Sepolia", label: "🔷 Arbitrum Sepolia", gas: "ETH"  },
];

export default function Bridge() {
  const { account, isConnected, connect, walletName } = useWallet();
  const [fromChain, setFromChain] = useState("Arc_Testnet");
  const [toChain,   setToChain]   = useState("Ethereum_Sepolia");
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState("");
  const [status,    setStatus]    = useState("");
  const [bridging,  setBridging]  = useState(false);
  const [history,   setHistory]   = useState(getBridgeHistory());

  const estimate = parseFloat(amount) > 0 && fromChain !== toChain
    ? { fee: "~0.10 USDC", receive: (parseFloat(amount) - 0.10).toFixed(4), time: "~20 min" }
    : null;

  async function doBridge() {
    if (!account || !amount || fromChain === toChain) return;
    setBridging(true); setStatus("Connecting to Arc App Kit…");
    try {
      const appKitModule = await import("@circle-fin/app-kit");
      const adapterModule = await import("@circle-fin/adapter-viem-v2");
      const AppKit = (appKitModule as any).AppKit;
      const createAdapterFromProvider = (adapterModule as any).createAdapterFromProvider;
      const kit = new AppKit();
      const eth = (window as any).ethereum;

      setStatus("Creating adapter…");
      const adapter = await createAdapterFromProvider({ provider: eth });

      setStatus(`Confirm bridge in ${walletName}…`);
      await (kit as any).bridge({
        from: { adapter, chain: fromChain },
        to:   { adapter, chain: toChain },
        amount: parseFloat(amount).toFixed(2),
        token: "USDC",
      });

      const entry = { from: fromChain, to: toChain, amount, token: "USDC", ts: Date.now(), status: "completed" };
      saveBridgeEntry(entry);
      setHistory(getBridgeHistory());
      setStatus(`✅ Bridge submitted! ${amount} USDC → ${toChain}`);
    } catch (e: any) {
      setStatus(`❌ ${e?.message || "Bridge failed"}`);
    } finally { setBridging(false); }
  }

  return (
    <>
      <Topbar title="Bridge" />
      <div className="p-7 flex-1 grid grid-cols-[480px_1fr] gap-5 items-start">
        <div className="bg-surface border border-white/8 rounded-lg">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Bridge USDC</div>
            <div className="text-xs text-muted mt-0.5">Cross-chain via Circle CCTP · Arc App Kit</div>
          </div>
          <div className="p-5">
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">From → To</label>
              <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
                <select value={fromChain} onChange={e => setFromChain(e.target.value)}
                  className="bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                  {CHAINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className="text-center text-muted text-lg">⇄</div>
                <select value={toChain} onChange={e => setToChain(e.target.value)}
                  className="bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                  {CHAINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Amount (USDC)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100.00"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
            </div>
            <div className="mb-4">
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Recipient (optional)</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x…"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
            </div>
            {estimate && (
              <div className="mb-4 bg-surface2 border border-white/8 rounded-lg p-3 text-[13px]">
                <div className="flex justify-between mb-1.5"><span className="text-muted">You send</span><span className="font-semibold">{amount} USDC</span></div>
                <div className="flex justify-between mb-1.5"><span className="text-muted">Bridge fee</span><span>{estimate.fee}</span></div>
                <div className="flex justify-between mb-1.5"><span className="text-muted">You receive</span><span className="text-green font-semibold">{estimate.receive} USDC</span></div>
                <div className="flex justify-between"><span className="text-muted">Est. time</span><span>{estimate.time}</span></div>
              </div>
            )}
            {fromChain === toChain && <div className="mb-3 text-[12.5px] text-red">Source and destination must be different.</div>}
            {status && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-[12.5px] ${status.startsWith("✅")?"bg-green/10 text-green border border-green/20":status.startsWith("❌")?"bg-red/10 text-red border border-red/20":"bg-surface2 text-muted"}`}>
                {status}
              </div>
            )}
            {!isConnected ? (
              <button onClick={connect} className="w-full py-2 bg-accent text-white rounded-lg text-[13px] font-semibold">⚡ Connect Wallet</button>
            ) : (
              <button onClick={doBridge} disabled={bridging || !amount || fromChain === toChain}
                className="w-full py-2 bg-accent text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:bg-accent/90 transition-colors">
                {bridging ? "Bridging…" : "Bridge via Arc App Kit"}
              </button>
            )}
            <div className="mt-2 text-center text-[12px] text-muted">
              Powered by <a href="https://docs.arc.io/app-kit/bridge" target="_blank" rel="noreferrer" className="text-[#6ea8fe]">Arc App Kit</a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">How Bridge Works</div>
            <div className="p-4 flex flex-col gap-2.5">
              {[{n:1,t:"Burn on source chain",d:"USDC burned via CCTP"},{n:2,t:"Attestation",d:"Circle verifies (~20s)"},{n:3,t:"Mint on destination",d:"USDC minted on target chain"}].map(s=>(
                <div key={s.n} className="flex items-start gap-3 p-3 bg-surface2 border border-white/8 rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-accent/15 text-[#6ea8fe] grid place-items-center text-xs font-bold shrink-0">{s.n}</div>
                  <div><div className="text-[13px] font-semibold">{s.t}</div><div className="text-[11.5px] text-muted">{s.d}</div></div>
                </div>
              ))}
              <div className="p-3 bg-amber/10 border border-amber/30 rounded-lg text-[12.5px] text-amber">⚠️ Make sure you have native gas on the destination chain.</div>
            </div>
          </div>
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Supported Chains</div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {CHAINS.map(c=>(
                <div key={c.id} className="flex items-center gap-2.5 p-3 bg-surface2 border border-white/8 rounded-lg">
                  <div className="text-lg">{c.label.split(" ")[0]}</div>
                  <div><div className="text-[13px] font-semibold">{c.label.substring(c.label.indexOf(" ")+1)}</div><div className="text-[11px] text-muted">Gas: {c.gas}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Bridge History</div>
            <div className="p-4">
              {history.length === 0 ? <div className="text-center py-6 text-muted text-sm">No bridges yet</div>
              : (history as any[]).map((h,i)=>(
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/8 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-purple/10 grid place-items-center text-sm shrink-0">⇄</div>
                  <div className="flex-1"><div className="text-[13px] font-medium">{h.from} → {h.to}</div><div className="text-[11.5px] text-muted">{new Date(h.ts).toLocaleString()}</div></div>
                  <div className="text-right shrink-0"><div className="font-mono text-[13px] font-semibold">{h.amount} {h.token}</div><div className="text-[11px] text-amber">{h.status}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
