/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { KIT_KEY, formatUsdc, shortAddr } from "@/lib/arc";

const DEPOSIT_CHAINS = [
  { key: "Arc_Testnet",      label: "Arc Testnet",      chainId: "0x4CEF52", rpc: "https://rpc.testnet.arc.network",            usdc: "0x3600000000000000000000000000000000000000", gas: "USDC" },
  { key: "Ethereum_Sepolia", label: "Ethereum Sepolia", chainId: "0xaa36a7", rpc: "https://rpc.sepolia.org",                    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", gas: "ETH"  },
  { key: "Base_Sepolia",     label: "Base Sepolia",     chainId: "0x14a34",  rpc: "https://sepolia.base.org",                   usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", gas: "ETH"  },
  { key: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", chainId: "0x66eee",  rpc: "https://sepolia-rollup.arbitrum.io/rpc",     usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", gas: "ETH"  },
  { key: "Optimism_Sepolia", label: "OP Sepolia",       chainId: "0xaa37dc", rpc: "https://sepolia.optimism.io",                usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", gas: "ETH"  },
];

const SPEND_CHAINS = [
  { key: "Arc_Testnet",      label: "Arc Testnet",      chainId: "0x4CEF52" },
  { key: "Ethereum_Sepolia", label: "Ethereum Sepolia", chainId: "0xaa36a7" },
  { key: "Base_Sepolia",     label: "Base Sepolia",     chainId: "0x14a34"  },
  { key: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", chainId: "0x66eee"  },
  { key: "Optimism_Sepolia", label: "OP Sepolia",       chainId: "0xaa37dc" },
];

type Tab = "deposit" | "spend";

export default function UnifiedBalance() {
  const { account, isConnected, connect } = useWallet();
  const [tab,       setTab]       = useState<Tab>("deposit");
  const [depChain,  setDepChain]  = useState("Arc_Testnet");
  const [depAmt,    setDepAmt]    = useState("");
  const [spendTo,   setSpendTo]   = useState("");
  const [spendAmt,  setSpendAmt]  = useState("");
  const [spendDst,  setSpendDst]  = useState("Arc_Testnet");
  const [status,    setStatus]    = useState("");
  const [working,   setWorking]   = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [txHash,    setTxHash]    = useState("");
  const [estimate,  setEstimate]  = useState<any>(null);
  const [estimating, setEstimating] = useState(false);
  const [poolBal,   setPoolBal]   = useState<string | null>(null);
  const [balLoading, setBalLoading] = useState(false);

  const srcChain = DEPOSIT_CHAINS.find(c => c.key === depChain)!;
  const depAmtNum  = parseFloat(depAmt)  || 0;
  const spendAmtNum = parseFloat(spendAmt) || 0;

  async function fetchPoolBalance() {
    if (!account) return;
    setBalLoading(true);
    try {
      const { adapter } = await getAdapter();
      const { AppKit } = await import("@circle-fin/app-kit") as any;
      const kit = new AppKit();
      // try getBalance first, fallback to getUnifiedBalance
      const accs: string[] = await (window as any).ethereum.request({ method: "eth_accounts" });
      const res = await kit.unifiedBalance.getBalances({
        token: "USDC",
        sources: { address: accs[0], chains: ["Arc_Testnet","Ethereum_Sepolia","Base_Sepolia","Arbitrum_Sepolia","Optimism_Sepolia"] },
      });
      setPoolBal(parseFloat(res?.totalConfirmedBalance ?? "0").toFixed(2));
    } catch (e: any) {
      setPoolBal(`Error: ${e?.message?.slice(0, 60)}`);
    }
    setBalLoading(false);
  }

  async function getAdapter() {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask not found");
    const adapterModule = await import("@circle-fin/adapter-viem-v2");
    const createAdapterFromProvider = (adapterModule as any).createAdapterFromProvider;
    return { eth, adapter: await createAdapterFromProvider({ provider: eth }) };
  }

  async function switchChain(chainId: string, label: string, rpc: string, gas: string) {
    const eth = (window as any).ethereum;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (e: any) {
      if (e.code === 4902) {
        const sym = gas === "USDC" ? "USDC" : gas;
        await eth.request({ method: "wallet_addEthereumChain", params: [{
          chainId, chainName: label, rpcUrls: [rpc],
          nativeCurrency: gas === "USDC" ? { name:"USDC",symbol:"USDC",decimals:6 } : { name:sym,symbol:sym,decimals:18 },
        }]});
      } else throw e;
    }
  }

  async function doDeposit() {
    if (!account || depAmtNum <= 0) return;
    setWorking(true); setStatus(""); setSucceeded(false); setTxHash("");
    try {
      setStatus(`Switching to ${srcChain.label}…`);
      await switchChain(srcChain.chainId, srcChain.label, srcChain.rpc, srcChain.gas);
      setStatus("Connecting to Circle App Kit…");
      const { adapter } = await getAdapter();
      const { AppKit } = await import("@circle-fin/app-kit") as any;
      const kit = new AppKit();
      setStatus("Confirm deposit in MetaMask…");
      const result = await kit.unifiedBalance.deposit({
        from:   { adapter, chain: srcChain.key },
        amount: depAmtNum.toFixed(2),
        token:  "USDC",
      });
      if (!result || result.state === "error") throw new Error(result?.error?.message || "Deposit failed");
      setTxHash(result.txHash || "");
      setStatus(`✅ ${depAmt} USDC deposited to Unified Balance!`);
      setSucceeded(true);
      fetchPoolBalance();
    } catch (e: any) {
      const msg = e?.message || "Deposit failed";
      setStatus(msg.includes("cancel") || msg.includes("rejected") ? "Cancelled." : `❌ ${msg}`);
    }
    setWorking(false);
  }

  async function estimateSpend() {
    if (!account || spendAmtNum <= 0 || !spendTo.startsWith("0x")) return;
    setEstimating(true); setEstimate(null);
    try {
      const { adapter } = await getAdapter();
      const { AppKit } = await import("@circle-fin/app-kit") as any;
      const kit = new AppKit();
      const est = await kit.unifiedBalance.estimateSpend({
        from:    { adapter },
        to:      { adapter, chain: spendDst, recipientAddress: spendTo },
        token:   "USDC",
        amountIn: spendAmtNum.toFixed(2),
      });
      setEstimate(est);
    } catch (e: any) {
      setEstimate({ error: e?.message });
    }
    setEstimating(false);
  }

  async function doSpend() {
    if (!account || spendAmtNum <= 0 || !spendTo.startsWith("0x")) return;
    setWorking(true); setStatus(""); setSucceeded(false); setTxHash("");
    try {
      setStatus("Connecting to Circle App Kit…");
      const { adapter } = await getAdapter();
      const { AppKit } = await import("@circle-fin/app-kit") as any;
      const kit = new AppKit();
      setStatus("Confirm spend in MetaMask…");
      const result = await kit.unifiedBalance.spend({
        from:    { adapter },
        to:      { adapter, chain: spendDst, recipientAddress: spendTo },
        token:   "USDC",
        amountIn: spendAmtNum.toFixed(2),
      });
      if (!result || result.state === "error") throw new Error(result?.error?.message || "Spend failed");
      setTxHash(result.txHash || "");
      setStatus(`✅ ${spendAmt} USDC spent to ${shortAddr(spendTo)} on ${SPEND_CHAINS.find(c=>c.key===spendDst)?.label}!`);
      setSucceeded(true);
    } catch (e: any) {
      const msg = e?.message || "Spend failed";
      setStatus(msg.includes("cancel") || msg.includes("rejected") ? "Cancelled." : `❌ ${msg}`);
    }
    setWorking(false);
  }

  return (
    <>
      <Topbar title="Unified Balance" />
      <div className="p-4 lg:p-6 flex-1 flex flex-col items-center gap-4 max-w-[600px] mx-auto w-full">

        {/* Explainer */}
        <div className="w-full bg-accent/6 border border-accent/20 rounded-xl px-4 py-3">
          <div className="text-[13px] font-semibold text-accent mb-1">Chain-Abstracted Balance</div>
          <div className="text-[11.5px] text-muted leading-relaxed">
            Deposit USDC from any chain into a unified pool. Spend it instantly on any supported chain — no manual bridging needed.
          </div>
        </div>

        {/* Pool Balance Card */}
        {isConnected && (
          <div className="w-full bg-surface border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">Unified Pool Balance</div>
              <div className="font-mono text-2xl font-bold text-ink">
                {poolBal === null ? "—" : poolBal.startsWith("Error") ? <span className="text-[13px] text-red">{poolBal}</span> : poolBal}
              </div>
              <div className="text-[11px] text-muted mt-0.5">USDC · spendable across all chains</div>
            </div>
            <button onClick={fetchPoolBalance} disabled={balLoading}
              className="px-3 py-1.5 rounded-lg bg-surface2 border border-white/8 text-[12px] text-muted hover:text-ink transition-colors disabled:opacity-50">
              {balLoading ? "…" : "↻ Check"}
            </button>
          </div>
        )}

        {/* Tab */}
        <div className="w-full flex gap-1 p-1 bg-surface border border-white/8 rounded-xl">
          {(["deposit", "spend"] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setStatus(""); setSucceeded(false); setEstimate(null); }}
              className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all capitalize ${tab === t ? "bg-accent text-white" : "text-muted hover:text-ink"}`}>
              {t === "deposit" ? "⬇ Deposit" : "⬆ Spend"}
            </button>
          ))}
        </div>

        <div className="w-full bg-surface border border-white/8 rounded-2xl overflow-hidden">
          {tab === "deposit" ? (
            <>
              <div className="px-5 py-4 border-b border-white/8">
                <div className="font-bold text-[14px]">Deposit to Unified Balance</div>
                <div className="text-[11px] text-muted mt-0.5">Move USDC from any chain into your pool</div>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">From Chain</label>
                  <select value={depChain} onChange={e => setDepChain(e.target.value)}
                    className="w-full bg-bg border border-white/6 rounded-lg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent cursor-pointer">
                    {DEPOSIT_CHAINS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                {srcChain.gas !== "USDC" && (
                  <div className="text-[11.5px] text-amber px-3 py-2 rounded-lg bg-amber/8 border border-amber/20">
                    ⚠ Need {srcChain.gas} for gas on {srcChain.label}
                  </div>
                )}
                <div className="bg-bg rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Amount</div>
                  <div className="flex items-center gap-3">
                    <input type="number" value={depAmt} onChange={e => setDepAmt(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-[28px] font-bold text-ink outline-none placeholder:text-muted w-0" />
                    <span className="text-[13px] text-muted font-medium shrink-0">USDC</span>
                  </div>
                </div>
                {status && (
                  <div className={`px-3 py-2.5 rounded-xl text-[12px] border ${status.startsWith("✅") ? "bg-green/8 text-green border-green/20" : status.startsWith("❌") ? "bg-red/8 text-red border-red/20" : "bg-surface2 text-muted border-white/8"}`}>
                    {status}
                    {txHash && <div className="mt-1"><a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-accent hover:underline">{txHash.slice(0,18)}…</a></div>}
                  </div>
                )}
                {!isConnected ? (
                  <button onClick={connect} className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold hover:bg-accent/90 transition-colors">Connect Wallet</button>
                ) : (
                  <button onClick={doDeposit} disabled={working || depAmtNum <= 0}
                    className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors">
                    {working ? "Depositing…" : depAmtNum > 0 ? `Deposit ${depAmt} USDC` : "Enter amount"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-white/8">
                <div className="font-bold text-[14px]">Spend from Unified Balance</div>
                <div className="text-[11px] text-muted mt-0.5">Send USDC to any chain — Circle handles routing automatically</div>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Destination Chain</label>
                  <select value={spendDst} onChange={e => { setSpendDst(e.target.value); setEstimate(null); }}
                    className="w-full bg-bg border border-white/6 rounded-lg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent cursor-pointer">
                    {SPEND_CHAINS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Recipient</label>
                  <input value={spendTo} onChange={e => { setSpendTo(e.target.value); setEstimate(null); }}
                    placeholder="0x..."
                    className="w-full bg-bg border border-white/6 rounded-lg px-3 py-2.5 text-[13px] font-mono text-ink outline-none focus:border-accent transition-colors placeholder:text-muted" />
                </div>
                <div className="bg-bg rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Amount</div>
                  <div className="flex items-center gap-3">
                    <input type="number" value={spendAmt} onChange={e => { setSpendAmt(e.target.value); setEstimate(null); }}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-[28px] font-bold text-ink outline-none placeholder:text-muted w-0" />
                    <span className="text-[13px] text-muted font-medium shrink-0">USDC</span>
                  </div>
                </div>

                {/* Estimate panel */}
                {estimate && !estimate.error && (
                  <div className="bg-green/6 border border-green/20 rounded-xl px-4 py-3 flex flex-col gap-1.5 text-[12px]">
                    <div className="font-semibold text-green text-[12.5px]">✓ Route available</div>
                    {Array.isArray(estimate.fees) && estimate.fees.map((f: any, i: number) => (
                      <div key={i} className="flex justify-between text-muted">
                        <span>{f.type || "Fee"}</span>
                        <span className="font-mono">{f.amount || "—"} {f.token || "USDC"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {estimate?.error && (
                  <div className="bg-red/8 border border-red/20 rounded-xl px-3 py-2 text-[12px] text-red">❌ {estimate.error}</div>
                )}

                {status && (
                  <div className={`px-3 py-2.5 rounded-xl text-[12px] border ${status.startsWith("✅") ? "bg-green/8 text-green border-green/20" : status.startsWith("❌") ? "bg-red/8 text-red border-red/20" : "bg-surface2 text-muted border-white/8"}`}>
                    {status}
                    {txHash && <div className="mt-1"><a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-accent hover:underline">{txHash.slice(0,18)}…</a></div>}
                  </div>
                )}

                {!isConnected ? (
                  <button onClick={connect} className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold hover:bg-accent/90 transition-colors">Connect Wallet</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={estimateSpend} disabled={estimating || spendAmtNum <= 0 || !spendTo.startsWith("0x")}
                      className="flex-1 py-3 bg-surface2 text-ink rounded-xl text-[13px] font-bold disabled:opacity-40 hover:bg-surface2/80 transition-colors border border-white/8">
                      {estimating ? "Estimating…" : "Estimate"}
                    </button>
                    <button onClick={doSpend} disabled={working || spendAmtNum <= 0 || !spendTo.startsWith("0x")}
                      className="flex-[2] py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors">
                      {working ? "Spending…" : spendAmtNum > 0 ? `Spend ${spendAmt} USDC` : "Enter amount"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* How it works */}
        <div className="w-full bg-surface border border-white/8 rounded-xl p-4">
          <div className="text-[12px] font-semibold text-ink mb-3">How Unified Balance works</div>
          <div className="flex flex-col gap-2.5">
            {[
              ["1. Deposit", "Move USDC from any chain into your unified pool via CCTP"],
              ["2. Pool sits idle", "Your balance is available across all supported chains instantly"],
              ["3. Spend anywhere", "Circle routes the USDC to the destination chain automatically — no manual bridge"],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <div>
                  <div className="text-[12px] font-semibold">{t}</div>
                  <div className="text-[11px] text-muted">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
