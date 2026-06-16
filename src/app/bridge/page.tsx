/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getBridgeHistory, saveBridgeEntry } from "@/lib/storage";

const GATEWAY_API    = "https://gateway-api-testnet.circle.com";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
const HISTORY_PER_PAGE = 10;

const CHAINS: Record<string, { label: string; icon: string; domain: number; chainId: string; rpc: string; usdc: string; gas: "USDC"|"ETH"; gwFee: string }> = {
  Arc_Testnet:      { label: "Arc Testnet",      icon: "⚡", domain: 26, chainId: "0x4CEF52", rpc: "https://rpc.testnet.arc.network",             usdc: "0x3600000000000000000000000000000000000000", gas: "USDC", gwFee: "—"      },
  Ethereum_Sepolia: { label: "Ethereum Sepolia",  icon: "Ξ",  domain: 0,  chainId: "0xaa36a7", rpc: "https://rpc.sepolia.org",                     usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", gas: "ETH",  gwFee: "$1.00"  },
  Base_Sepolia:     { label: "Base Sepolia",      icon: "🔵", domain: 6,  chainId: "0x14a34",  rpc: "https://sepolia.base.org",                    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", gas: "ETH",  gwFee: "$0.01"  },
  Arbitrum_Sepolia: { label: "Arbitrum Sepolia",  icon: "🔷", domain: 3,  chainId: "0x66eee",  rpc: "https://sepolia-rollup.arbitrum.io/rpc",      usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", gas: "ETH",  gwFee: "$0.01"  },
  OP_Sepolia:       { label: "OP Sepolia",        icon: "🔴", domain: 2,  chainId: "0xaa37dc", rpc: "https://sepolia.optimism.io",                 usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", gas: "ETH",  gwFee: "$0.0015"},
};
const CHAIN_IDS = Object.keys(CHAINS);

const TRANSFER_SPEC_TYPES = [
  { name: "version",              type: "uint32"  }, { name: "sourceDomain",         type: "uint32"  },
  { name: "destinationDomain",    type: "uint32"  }, { name: "sourceContract",       type: "bytes32" },
  { name: "destinationContract",  type: "bytes32" }, { name: "sourceToken",          type: "bytes32" },
  { name: "destinationToken",     type: "bytes32" }, { name: "sourceDepositor",      type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" }, { name: "sourceSigner",         type: "bytes32" },
  { name: "destinationCaller",    type: "bytes32" }, { name: "value",                type: "uint256" },
  { name: "salt",                 type: "bytes32" }, { name: "hookData",             type: "bytes"   },
];
const BURN_INTENT_TYPES  = [{ name: "maxBlockHeight", type: "uint256" }, { name: "maxFee", type: "uint256" }, { name: "spec", type: "TransferSpec" }];
const EIP712_DOMAIN_TYPE = [{ name: "name", type: "string" }, { name: "version", type: "string" }];

// Steps for Arc source (Gateway Forwarding)
const STEPS_GW = [
  { n: 1, label: "Switch network",     desc: "MetaMask switches to source chain" },
  { n: 2, label: "Estimate fees",      desc: "Calculate exact deposit amount" },
  { n: 3, label: "Check balance",      desc: "Verify USDC balance" },
  { n: 4, label: "Approve USDC",       desc: "Authorize Gateway to spend USDC" },
  { n: 5, label: "Deposit to Gateway", desc: "Move USDC into Circle Gateway" },
  { n: 6, label: "Sign intent",        desc: "EIP-712 signature (no gas)" },
  { n: 7, label: "Submit & mint",      desc: "Circle mints on destination" },
];
// Steps for non-Arc source (App Kit / CCTP)
const STEPS_KIT = [
  { n: 1, label: "Switch network",  desc: "MetaMask switches to source chain" },
  { n: 2, label: "Approve USDC",   desc: "Authorize Circle to burn USDC" },
  { n: 3, label: "Burn & bridge",  desc: "Circle burns on source, mints on destination" },
];
// Sentinel step numbers for App Kit mode
const KIT_STEP_SWITCH  = 10;
const KIT_STEP_APPROVE = 11;
const KIT_STEP_BRIDGE  = 12;

function pad32(a: string) { return "0x" + a.toLowerCase().replace("0x","").padStart(64,"0"); }
function randomSalt() { const b = new Uint8Array(32); crypto.getRandomValues(b); return "0x" + Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join(""); }
function bigintReplacer(_: string, v: unknown) { return typeof v === "bigint" ? v.toString() : v; }
async function waitTx(eth: any, hash: string) {
  while (true) {
    await new Promise(r => setTimeout(r, 500));
    const r = await eth.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (r) { if (r.status === "0x0") throw new Error("Transaction reverted."); return r; }
  }
}

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface border border-white/8 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface2 transition-colors">
        <span className="font-semibold text-[13.5px]">{title}</span>
        <span className={`text-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="border-t border-white/8">{children}</div>}
    </div>
  );
}

export default function Bridge() {
  const { account, isConnected, connect } = useWallet();
  const [fromChain, setFromChain] = useState("Arc_Testnet");
  const [toChain,   setToChain]   = useState("Base_Sepolia");
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState("");
  const [status,    setStatus]    = useState("");
  const [step,      setStep]      = useState(0);
  const [succeeded, setSucceeded] = useState(false); // keep progress visible after success
  const [txId,      setTxId]      = useState("");
  const [feeInfo,   setFeeInfo]   = useState<{ forwarding: string; receive: string } | null>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [page,      setPage]      = useState(1);

  useEffect(() => { if (account) setHistory(getBridgeHistory(account)); }, [account]);

  const src    = CHAINS[fromChain];
  const dst    = CHAINS[toChain];
  const amtNum = parseFloat(amount) || 0;
  const isKitMode = fromChain !== "Arc_Testnet";
  const STEPS = isKitMode ? STEPS_KIT : STEPS_GW;
  // Map kit sentinel steps to display step numbers
  const displayStep = succeeded
    ? STEPS.length + 1  // all steps green
    : step >= 10
      ? (step === KIT_STEP_SWITCH ? 1 : step === KIT_STEP_APPROVE ? 2 : 3)
      : step;
  const totalPages = Math.ceil(history.length / HISTORY_PER_PAGE);
  const pagedHistory = history.slice((page-1)*HISTORY_PER_PAGE, page*HISTORY_PER_PAGE);

  function swapChains() {
    setFromChain(toChain); setToChain(fromChain); setFeeInfo(null); setStatus(""); setStep(0); setSucceeded(false);
  }

  async function doBridge() {
    if (!account || amtNum <= 0 || fromChain === toChain) return;
    const eth = (window as any).ethereum;
    if (!eth) return;
    setTxId(""); setStatus(""); setSucceeded(false);

    try {
      // Step 1 — switch network
      setStep(1); setStatus(`Switching to ${src.label}…`);
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: src.chainId }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: src.chainId, chainName: src.label, rpcUrls: [src.rpc],
            nativeCurrency: src.gas === "ETH" ? { name:"ETH", symbol:"ETH", decimals:18 } : { name:"USDC", symbol:"USDC", decimals:6 } }] });
        } else throw e;
      }

      const accs = await eth.request({ method: "eth_accounts" });
      const from = accs[0] as string;
      const value = BigInt(Math.floor(amtNum * 1_000_000));
      const salt  = randomSalt();

      // ETH gas check
      if (src.gas === "ETH") {
        const ethBal = BigInt(await eth.request({ method: "eth_getBalance", params: [from, "latest"] }));
        if (ethBal < BigInt("10000000000000000"))
          throw new Error(`Insufficient ETH on ${src.label}.\nYou need at least 0.01 ETH for gas.\nCurrent: ${(Number(ethBal)/1e18).toFixed(6)} ETH\nGet ETH: sepoliafaucet.com`);
      }

      // Non-Arc source → use App Kit (CCTP, adapter required on both sides)
      if (fromChain !== "Arc_Testnet") {
        setStep(KIT_STEP_SWITCH); setStatus("Connecting to Circle App Kit…");
        const appKitModule  = await import("@circle-fin/app-kit");
        const adapterModule = await import("@circle-fin/adapter-viem-v2");
        const AppKit = (appKitModule as any).AppKit;
        const createAdapterFromProvider = (adapterModule as any).createAdapterFromProvider;
        const kit     = new AppKit();
        const adapter = await createAdapterFromProvider({ provider: eth });

        // Snapshot USDC balance before — used to detect cancel (App Kit resolves even on cancel)
        const getUsdcBal = async () => {
          const r = await fetch(src.rpc, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call",
              params:[{ to: src.usdc, data: "0x70a08231" + from.toLowerCase().replace("0x","").padStart(64,"0") }, "latest"] }) }).then(r => r.json());
          return BigInt(r.result && r.result !== "0x" ? r.result : "0x0");
        };
        const balBefore = await getUsdcBal();

        setStep(KIT_STEP_APPROVE); setStatus("Approve & confirm in MetaMask…");
        await (kit as any).bridge({
          from: { adapter, chain: fromChain },
          to:   { adapter, chain: toChain },
          amount: amtNum.toFixed(2), token: "USDC",
        });

        // Verify balance actually decreased — minimum 50% of amount must have left
        const balAfter = await getUsdcBal();
        const minDecrease = BigInt(Math.floor(amtNum * 500_000)); // 50% of amount in 6-decimal units
        if (balBefore - balAfter < minDecrease) {
          throw new Error("Bridge was cancelled or did not complete.");
        }

        setStep(KIT_STEP_BRIDGE);
        saveBridgeEntry({ from: fromChain, to: toChain, amount, token: "USDC", ts: Date.now(), status: "completed" }, account);
        const updated = getBridgeHistory(account); setHistory(updated); setPage(1);
        setStatus(`✅ ${amount} USDC bridged via CCTP!`);
        setStep(0); setSucceeded(true);
        return;
      }

      const spec = {
        version: 1, sourceDomain: src.domain, destinationDomain: dst.domain,
        sourceContract: pad32(GATEWAY_WALLET), destinationContract: pad32(GATEWAY_MINTER),
        sourceToken: pad32(src.usdc), destinationToken: pad32(dst.usdc),
        sourceDepositor: pad32(from), destinationRecipient: pad32((recipient||from).trim()),
        sourceSigner: pad32(from), destinationCaller: pad32("0x0000000000000000000000000000000000000000"),
        value: value.toString(), salt, hookData: "0x",
      };

      // Step 2 — estimate
      setStep(2); setStatus("Estimating fees…");
      const estRes  = await fetch(`${GATEWAY_API}/v1/estimate?enableForwarder=true`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ spec }]),
      });
      if (!estRes.ok) throw new Error(`Estimate failed: ${await estRes.text()}`);
      const estJson = await estRes.json();
      const estimated = estJson?.body?.[0]?.burnIntent ?? estJson?.[0]?.burnIntent ?? estJson?.burnIntent;
      const rawMaxFee  = estimated?.maxFee ?? "0";
      const maxBlockHeight = estimated?.maxBlockHeight ?? "0";
      if (rawMaxFee === "0") throw new Error("Could not estimate fees — please try again.");
      const maxFee = (BigInt(rawMaxFee) * 120n / 100n).toString();
      const depositAmount = value + BigInt(maxFee);
      const fwdDisplay = (Number(rawMaxFee)/1e6).toFixed(4);
      const receiveDisplay = (amtNum - Number(rawMaxFee)/1e6 - amtNum*0.00005).toFixed(4);
      setFeeInfo({ forwarding: fwdDisplay, receive: receiveDisplay });

      // Step 3 — check USDC balance
      setStep(3); setStatus("Checking USDC balance…");
      const balRes = await fetch(src.rpc, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[{ to:src.usdc, data:"0x70a08231"+from.toLowerCase().replace("0x","").padStart(64,"0") },"latest"] }),
      }).then(r => r.json());
      const usdcBal = BigInt(balRes.result && balRes.result !== "0x" ? balRes.result : "0x0");
      if (usdcBal < depositAmount)
        throw new Error(`Insufficient USDC on ${src.label}.\nYou have: ${(Number(usdcBal)/1e6).toFixed(4)} USDC\nRequired:  ${(Number(depositAmount)/1e6).toFixed(4)} USDC (amount + fee)\nGet USDC: faucet.circle.com`);

      // Step 4 — approve
      setStep(4); setStatus(`Approving ${(Number(depositAmount)/1e6).toFixed(4)} USDC…`);
      const approveTx = await eth.request({ method: "eth_sendTransaction", params: [{ from, to: src.usdc, value: "0x0",
        data: "0x095ea7b3" + GATEWAY_WALLET.toLowerCase().replace("0x","").padStart(64,"0") + depositAmount.toString(16).padStart(64,"0") }] });
      setStatus("Confirming approve…"); await waitTx(eth, approveTx);

      // Step 5 — deposit
      setStep(5); setStatus("Depositing into Gateway Wallet…");
      const depositTx = await eth.request({ method: "eth_sendTransaction", params: [{ from, to: GATEWAY_WALLET, value: "0x0",
        data: "0x47e7ef24" + src.usdc.toLowerCase().replace("0x","").padStart(64,"0") + depositAmount.toString(16).padStart(64,"0") }] });
      setStatus("Confirming deposit…"); await waitTx(eth, depositTx);

      // Step 6 — sign
      setStep(6); setStatus("Sign burn intent in MetaMask…");
      const message = { maxBlockHeight, maxFee, spec };
      const signature = await eth.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify({
        domain: { name: "GatewayWallet", version: "1" },
        types: { EIP712Domain: EIP712_DOMAIN_TYPE, TransferSpec: TRANSFER_SPEC_TYPES, BurnIntent: BURN_INTENT_TYPES },
        primaryType: "BurnIntent", message,
      }, bigintReplacer)] });

      // Step 7 — submit + poll
      setStep(7); setStatus("Submitting to Circle Gateway…");
      const txRes = await fetch(`${GATEWAY_API}/v1/transfer?enableForwarder=true`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ burnIntent: message, signature }], bigintReplacer),
      });
      if (!txRes.ok) throw new Error(`Transfer failed: ${await txRes.text()}`);
      const { transferId } = await txRes.json();
      setTxId(transferId);
      setStatus(`Minting on ${dst.label}…`);

      const deadline = Date.now() + 300_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5_000));
        const poll = await fetch(`${GATEWAY_API}/v1/transfer/${transferId}`);
        if (!poll.ok) continue;
        const d = await poll.json();
        if (d.status === "confirmed" || d.status === "finalized") {
          saveBridgeEntry({ from: fromChain, to: toChain, amount, token: "USDC", ts: Date.now(), status: "completed", txId: transferId }, account);
          const updated = getBridgeHistory(account);
          setHistory(updated); setPage(1);
          setStatus(`✅ ${amount} USDC arrived on ${dst.label}!`);
          setStep(0); setSucceeded(true);
          return;
        }
        if (d.status === "failed")  throw new Error(`Bridge failed: ${d.forwardingDetails?.failureReason ?? "unknown"}`);
        if (d.status === "expired") throw new Error("Transfer expired.");
        setStatus(`Minting on ${dst.label}… (${d.status})`);
      }
      throw new Error("Timed out after 5 minutes.");

    } catch (e: any) {
      const msg: string = e?.message || "Bridge failed";
      if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
        setStatus("Bridge cancelled.");
      } else {
        setStatus(`❌ ${msg}`);
      }
      setStep(0);
    }
  }

  return (
    <>
      <Topbar title="Bridge" />
      <div className="p-6 flex-1 flex flex-col items-center gap-5 max-w-[860px] mx-auto w-full">

        {/* Main row: form + progress panel */}
        <div className="flex gap-5 items-start w-full">

          {/* ── Bridge card ── */}
          <div className="flex-1 bg-surface border border-white/8 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div>
                <div className="font-bold text-[14px]">Cross-chain transfer</div>
                <div className="text-[11px] text-muted mt-0.5">
                  {isKitMode ? "Circle CCTP" : "Circle Gateway Forwarding"}
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-green font-medium">● Live</span>
            </div>

            <div className="p-4 flex flex-col gap-3">
              {/* FROM block */}
              <div className="bg-bg rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">From</span>
                  {src.gas === "ETH" && (
                    <span className="text-[11px] text-amber">⚠ Need ETH for gas</span>
                  )}
                </div>
                <select value={fromChain} onChange={e => { setFromChain(e.target.value); setFeeInfo(null); setStatus(""); setStep(0); setSucceeded(false); }}
                  className="w-full bg-surface2 border border-white/6 rounded-lg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent transition-colors cursor-pointer">
                  {CHAIN_IDS.filter(id => id !== toChain).map(id => (
                    <option key={id} value={id}>{CHAINS[id].icon}  {CHAINS[id].label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setFeeInfo(null); }}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[28px] font-bold text-ink outline-none placeholder:text-muted w-0" />
                  <span className="text-[13px] text-muted font-medium shrink-0">USDC</span>
                </div>
              </div>

              {/* Swap button */}
              <div className="flex justify-center -my-1">
                <button onClick={swapChains} title="Swap chains"
                  className="w-8 h-8 rounded-full bg-surface2 border border-white/8 grid place-items-center text-muted hover:text-white hover:border-accent hover:bg-accent/10 transition-all text-sm font-bold select-none z-10">
                  ⇅
                </button>
              </div>

              {/* TO block */}
              <div className="bg-bg rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">To</span>
                  {!isKitMode && dst.gwFee !== "—" && (
                    <span className="text-[11px] text-muted">fwd fee ~{dst.gwFee}</span>
                  )}
                </div>
                <select value={toChain} onChange={e => { setToChain(e.target.value); setFeeInfo(null); setStatus(""); setStep(0); setSucceeded(false); }}
                  className="w-full bg-surface2 border border-white/6 rounded-lg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent transition-colors cursor-pointer">
                  {CHAIN_IDS.filter(id => id !== fromChain).map(id => (
                    <option key={id} value={id}>{CHAINS[id].icon}  {CHAINS[id].label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  <span className={`flex-1 text-[28px] font-bold ${amtNum > 0 ? "text-green" : "text-muted"}`}>
                    {amtNum > 0
                      ? (isKitMode
                          ? `~${(amtNum - amtNum*0.00005).toFixed(4)}`
                          : (feeInfo ? feeInfo.receive : `~${(amtNum - 0.20 - amtNum*0.00005).toFixed(4)}`)
                        )
                      : "0.00"
                    }
                  </span>
                  <span className="text-[13px] text-muted font-medium shrink-0">USDC</span>
                </div>
              </div>

              {/* Recipient — only for Gateway Forwarding (Arc source); App Kit resolves from connected wallet */}
              {!isKitMode && (
                <input value={recipient} onChange={e => setRecipient(e.target.value)}
                  placeholder="Recipient (optional, default: your wallet)"
                  className="w-full bg-bg border border-white/6 rounded-lg px-3 py-2 text-[12px] text-ink font-mono outline-none focus:border-accent transition-colors placeholder:text-muted" />
              )}

              {/* Fee row */}
              {amtNum > 0 && (
                <div className="flex items-center justify-between text-[12px] text-muted px-1">
                  <span>Est. time: <span className="text-accent">{isKitMode ? "~1-2 min" : "~30s"}</span></span>
                  <span>
                    {isKitMode
                      ? `Fee: ${(amtNum*0.00005).toFixed(6)} USDC`
                      : `Fee: ${feeInfo ? feeInfo.forwarding : `~${dst.gwFee}`} + ${(amtNum*0.00005).toFixed(5)} USDC`
                    }
                  </span>
                </div>
              )}

              {/* Status */}
              {status && (
                <div className={`px-3 py-2.5 rounded-xl text-[12px] whitespace-pre-line leading-relaxed border ${
                  status.startsWith("✅") ? "bg-green/8 text-green border-green/20" :
                  status.startsWith("❌") ? "bg-red/8 text-red border-red/20" :
                  "bg-surface2 text-muted border-white/8"}`}>
                  {status}
                  {txId && <div className="font-mono text-[10px] mt-1 opacity-50">ID: {txId}</div>}
                </div>
              )}

              {/* CTA */}
              {!isConnected ? (
                <button onClick={connect}
                  className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold hover:bg-accent/90 transition-colors">
                  Connect Wallet
                </button>
              ) : (
                <button onClick={doBridge} disabled={step > 0 || !amount || amtNum <= 0 || fromChain === toChain}
                  className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors tracking-wide">
                  {step > 0 ? "Processing…" : amtNum > 0 ? `Bridge ${amount} USDC  ${src.icon} → ${dst.icon}` : "Enter amount to bridge"}
                </button>
              )}
            </div>
          </div>

          {/* ── Progress panel ── */}
          {(step > 0 || succeeded) && (
            <div className="w-[280px] shrink-0 bg-surface border border-white/8 rounded-2xl overflow-hidden sticky top-6">
              <div className="px-4 py-3.5 border-b border-white/8">
                <div className="font-bold text-[13px]">Bridge Progress</div>
                <div className="text-[11px] text-muted mt-0.5">
                  {succeeded ? "All done ✓" : `Step ${displayStep} of ${STEPS.length}`}
                </div>
              </div>
              <div className="p-3 flex flex-col gap-2">
                {STEPS.map(s => {
                  const isDone   = displayStep > s.n;
                  const isActive = displayStep === s.n;
                  return (
                    <div key={s.n} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-300 ${
                      isActive ? "bg-accent/10 border-accent/30" :
                      isDone   ? "bg-green/6  border-green/20"   :
                                 "bg-surface2 border-white/6 opacity-40"}`}>
                      <div className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold shrink-0 border transition-colors ${
                        isActive ? "border-accent text-accent" :
                        isDone   ? "border-green  text-green"  :
                                   "border-white/20 text-muted"}`}>
                        {isDone ? "✓" : s.n}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[12px] font-semibold truncate ${isActive ? "text-ink" : isDone ? "text-green" : "text-muted"}`}>
                          {s.label}
                        </div>
                      </div>
                      {isActive && <span className="text-accent text-[9px] animate-pulse shrink-0">●</span>}
                    </div>
                  );
                })}
              </div>
              <div className="px-4 pb-4">
                <div className="text-[10.5px] text-muted text-center bg-green/6 border border-green/15 rounded-lg py-1.5">
                  {isKitMode ? "Circle App Kit · CCTP" : "No gas on destination · Circle pays"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Info row: accordions ── */}
        <div className="flex gap-4 w-full">
          <div className="flex-1">
            <Accordion key="how-it-works" title="How it works">
              <div className="p-4 flex flex-col gap-2">
                {(isKitMode ? STEPS_KIT : STEPS_GW).map(s => (
                  <div key={s.n} className="flex items-start gap-3 py-2 border-b border-white/6 last:border-0">
                    <div className="w-5 h-5 rounded-full bg-accent/10 text-accent grid place-items-center text-[10px] font-bold shrink-0 mt-0.5">{s.n}</div>
                    <div>
                      <div className="text-[12.5px] font-semibold text-ink">{s.label}</div>
                      <div className="text-[11px] text-muted">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Accordion>
          </div>
          <div className="flex-1">
            <Accordion key="supported-chains" title="Supported Chains">
              <div className="p-3 grid grid-cols-2 gap-2">
                {CHAIN_IDS.map(id => {
                  const c = CHAINS[id];
                  return (
                    <div key={id} className="flex items-center gap-2 p-2.5 bg-bg border border-white/8 rounded-xl">
                      <span className="text-lg shrink-0">{c.icon}</span>
                      <div>
                        <div className="text-[12px] font-semibold">{c.label}</div>
                        <div className="text-[10.5px] text-muted">Gas: {c.gas}{c.gwFee !== "—" ? ` · fwd ${c.gwFee}` : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Accordion>
          </div>
        </div>

        {/* ── Bridge History (dropdown) ── */}
        <Accordion key="bridge-history" title={`Bridge History  (${history.length})`}>
          {history.length === 0 ? (
            <div className="py-10 text-center text-muted text-[13px]">No bridges yet</div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] font-semibold text-muted uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Route</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">TX</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map((h: any, i: number) => (
                    <tr key={i} className="border-b border-white/6 last:border-0 hover:bg-surface2 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2 text-[13px] font-medium">
                          <span>{CHAINS[h.from]?.icon ?? "?"}</span>
                          <span className="text-muted text-[11px]">{h.from?.replace(/_/g," ")}</span>
                          <span className="text-muted">→</span>
                          <span>{CHAINS[h.to]?.icon ?? "?"}</span>
                          <span className="text-muted text-[11px]">{h.to?.replace(/_/g," ")}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-[13px] text-ink">{h.amount} USDC</td>
                      <td className="px-6 py-3.5 text-[12px] text-muted">{new Date(h.ts).toLocaleString()}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-green/10 border border-green/20 text-green">
                          ✓ {h.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        {h.txId ? (
                          <a href={`https://testnet.arcscan.app/tx/${h.txId}`} target="_blank" rel="noreferrer"
                            className="font-mono text-[11px] text-accent hover:underline">
                            {h.txId.slice(0,8)}…
                          </a>
                        ) : (
                          <span className="text-muted text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1.5 px-6 py-4 border-t border-white/8">
                  <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                    className="px-3 py-1.5 rounded-lg text-[12px] border border-white/14 text-muted hover:text-ink disabled:opacity-30 transition-colors">← Prev</button>
                  {Array.from({ length: totalPages }, (_,i) => i+1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-[12px] font-semibold border transition-colors ${page===p ? "bg-accent border-accent text-white" : "border-white/14 text-muted hover:text-ink"}`}>{p}</button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                    className="px-3 py-1.5 rounded-lg text-[12px] border border-white/14 text-muted hover:text-ink disabled:opacity-30 transition-colors">Next →</button>
                </div>
              )}
            </>
          )}
        </Accordion>

      </div>
    </>
  );
}
