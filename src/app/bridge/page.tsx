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

const CHAINS: Record<string, { label: string; icon: string; domain: number; chainId: string; rpc: string; usdc: string; gas: "USDC"|"ETH"|"AVAX"|"MATIC"; gwFee: string }> = {
  Arc_Testnet:          { label: "Arc Testnet",      icon: "arc", domain: 26, chainId: "0x4CEF52", rpc: "https://rpc.testnet.arc.network",                   usdc: "0x3600000000000000000000000000000000000000", gas: "USDC",  gwFee: "—"     },
  Ethereum_Sepolia:     { label: "Ethereum Sepolia",  icon: "Ξ",  domain: 0,  chainId: "0xaa36a7", rpc: "https://rpc.sepolia.org",                           usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", gas: "ETH",   gwFee: "$1.00" },
  Base_Sepolia:         { label: "Base Sepolia",      icon: "🔵", domain: 6,  chainId: "0x14a34",  rpc: "https://sepolia.base.org",                          usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", gas: "ETH",   gwFee: "$0.01" },
  Arbitrum_Sepolia:     { label: "Arbitrum Sepolia",  icon: "🔷", domain: 3,  chainId: "0x66eee",  rpc: "https://sepolia-rollup.arbitrum.io/rpc",            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", gas: "ETH",   gwFee: "$0.01" },
  Optimism_Sepolia:     { label: "OP Sepolia",        icon: "🔴", domain: 2,  chainId: "0xaa37dc", rpc: "https://sepolia.optimism.io",                       usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", gas: "ETH",   gwFee: "$0.01" },
  Polygon_Amoy_Testnet: { label: "Polygon Amoy",      icon: "🟣", domain: 7,  chainId: "0x13882",  rpc: "https://rpc-amoy.polygon.technology",               usdc: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582", gas: "MATIC", gwFee: "$0.01" },
  Linea_Sepolia:        { label: "Linea Sepolia",     icon: "🟤", domain: 11, chainId: "0xe705",   rpc: "https://rpc.sepolia.linea.build",                   usdc: "0xfece4462d57bd51a6a552365a011b95f0e16d9b7", gas: "ETH",   gwFee: "—"     },
  Unichain_Sepolia:     { label: "Unichain Sepolia",  icon: "🦄", domain: 14, chainId: "0x515",    rpc: "https://sepolia.unichain.org",                      usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F", gas: "ETH",   gwFee: "—"     },
  Avalanche_Fuji:       { label: "Avalanche Fuji",    icon: "🔺", domain: 1,  chainId: "0xa869",   rpc: "https://api.avax-test.network/ext/bc/C/rpc",        usdc: "0x5425890298aed601595a70AB815c96711a31Bc65", gas: "AVAX",  gwFee: "$0.01" },
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

function ChainIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  if (icon === "arc") return <img src="/arc-logo.png" alt="Arc" width={size} height={size} className="rounded-sm" style={{ imageRendering: "crisp-edges" }} />;
  return <span style={{ fontSize: size * 0.85 }}>{icon}</span>;
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

async function fetchChainUsdcBalance(chainKey: string, addr: string): Promise<string> {
  const chain = CHAINS[chainKey];
  const data  = "0x70a08231" + addr.toLowerCase().replace("0x","").padStart(64,"0");
  try {
    const res = await fetch(chain.rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[{ to: chain.usdc, data }, "latest"] }),
    }).then(r => r.json());
    const raw = res.result && res.result !== "0x" ? res.result : "0x0";
    return (Number(BigInt(raw)) / 1e6).toFixed(2);
  } catch { return "—"; }
}

// CCTP v1 testnet MessageTransmitter — same address across all EVM testnets
const MSG_TRANSMITTER = "0x7865fAfC2db2093669d92c0197e5d6f4D14BF9a";
// receiveMessage(bytes message, bytes attestation) selector
function encodeReceiveMessage(message: string, attestation: string): string {
  const sel = "57ecfd28";
  const enc = (hex: string) => {
    const h = hex.startsWith("0x") ? hex.slice(2) : hex;
    const len = (h.length / 2).toString(16).padStart(64, "0");
    const padded = h.padEnd(Math.ceil(h.length / 64) * 64, "0");
    return len + padded;
  };
  const offset1 = (64).toString(16).padStart(64, "0");
  const msgHex = (message.startsWith("0x") ? message.slice(2) : message);
  const offset2 = (64 + 32 + Math.ceil(msgHex.length / 2 / 32) * 32).toString(16).padStart(64, "0");
  return "0x" + sel + offset1 + offset2 + enc(message) + enc(attestation);
}

function PendingBridgeRow({ p, onDismiss, onArrived, getProvider }: { p: any; onDismiss: () => void; onArrived: () => void; getProvider: () => any }) {
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - p.ts) / 1000));

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - p.ts) / 1000)), 1000);
    return () => clearInterval(t);
  }, [p.ts]);

  const ETA_S = 5 * 60;
  const remaining = ETA_S - elapsed;
  const pct = Math.min(elapsed / ETA_S * 100, 99);
  const fmtTime = (s: number) => s <= 0 ? "any moment" : `~${Math.floor(s/60)}m ${s%60}s`;
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;
  const isStuck = elapsed > 8 * 60; // show Manual Claim after 8 min

  async function manualClaim() {
    setClaiming(true); setCheckMsg("Fetching attestation from Circle…");
    try {
      const eth = getProvider();
      if (!eth) throw new Error("No wallet connected");
      const src = CHAINS[p.from];
      if (!src) throw new Error("Unknown source chain");

      // 1. Fetch attestation via server-side proxy (avoids CORS)
      const irisRes = await fetch(`/api/cctp-attestation?domain=${src.domain}&txHash=${p.burnTxHash}`).then(r => r.json());
      const msg = irisRes?.messages?.[0];
      if (!msg || irisRes?.error === "no_attestation") throw new Error("Circle has no record of this transfer — it may have been dropped on testnet. Dismiss and try a new bridge.");
      if (msg.status !== "complete") throw new Error(`Attestation not ready yet (${msg.status}) — wait a moment and try again`);

      setCheckMsg("Switching to destination chain…");
      const dst = CHAINS[p.to];
      // 2. Switch MetaMask to destination chain
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: dst.chainId }] });
      } catch (e: any) {
        if (e.code === 4902) {
          const gs = dst.gas; const sym = gs === "USDC" ? "USDC" : gs;
          await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: dst.chainId, chainName: dst.label, rpcUrls: [dst.rpc],
            nativeCurrency: gs === "USDC" ? { name:"USDC",symbol:"USDC",decimals:6 } : { name:sym,symbol:sym,decimals:18 } }] });
        } else throw e;
      }

      setCheckMsg("Submitting claim tx — confirm in MetaMask…");
      // 3. Call receiveMessage on destination MessageTransmitter
      const data = encodeReceiveMessage(msg.message, msg.attestation);
      const accs = await eth.request({ method: "eth_accounts" });
      const txHash = await eth.request({ method: "eth_sendTransaction", params: [{ from: accs[0], to: MSG_TRANSMITTER, data, gas: "0x493E0" }] });
      setCheckMsg(`Claim tx sent! Waiting for confirmation…`);
      // 4. Wait for receipt
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] });
        if (receipt) {
          if (receipt.status === "0x0") throw new Error("Claim tx reverted — already claimed or invalid");
          setCheckMsg("✅ USDC claimed successfully!");
          setTimeout(onArrived, 1500);
          setClaiming(false); return;
        }
      }
      throw new Error("Claim tx not confirmed after 2 min");
    } catch (e: any) {
      setCheckMsg(`❌ ${e.message}`);
    }
    setClaiming(false);
  }

  async function checkNow() {
    setChecking(true); setCheckMsg("Checking…");
    try {
      const dst = CHAINS[p.to];
      if (!dst) { setCheckMsg("Unknown chain."); setChecking(false); return; }
      const addr = (p.recipient || p.from || "").toLowerCase().replace("0x","").padStart(64,"0");
      const res = await fetch(dst.rpc, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:dst.usdc,data:"0x70a08231"+addr},"latest"] }),
      }).then(r=>r.json());
      const bal = Number(BigInt(res.result && res.result!=="0x" ? res.result : "0x0")) / 1e6;
      if (bal >= parseFloat(p.amount) * 0.9) {
        setCheckMsg(`✅ ${bal.toFixed(2)} USDC arrived!`);
        setTimeout(onArrived, 1500);
      } else {
        setCheckMsg(`${bal.toFixed(2)} USDC on ${dst.label} — not arrived yet`);
      }
    } catch { setCheckMsg("Check failed — try again"); }
    setChecking(false);
  }

  return (
    <div className="flex flex-col gap-2 text-[11.5px] text-muted bg-bg/60 rounded-2xl px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono font-medium text-ink">{p.amount} USDC · {CHAINS[p.from]?.label ?? p.from} → {CHAINS[p.to]?.label ?? p.to}</span>
        <div className="flex items-center gap-2 ml-2">
          {isStuck && (
            <button onClick={manualClaim} disabled={claiming}
              className="text-[11px] px-2 py-0.5 rounded-md bg-amber/10 text-amber hover:bg-amber/20 border border-amber/25 disabled:opacity-50 transition-colors font-semibold">
              {claiming ? "Claiming…" : "⚡ Claim"}
            </button>
          )}
          <button onClick={checkNow} disabled={checking}
            className="text-[11px] px-2 py-0.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 disabled:opacity-50 transition-colors">
            {checking ? "…" : "Check"}
          </button>
          <button onClick={onDismiss} className="text-muted/40 hover:text-muted text-xs">✕</button>
        </div>
      </div>
      {/* Progress bar + time */}
      <div className="h-1 bg-white/6 rounded-full overflow-hidden">
        <div className="h-full bg-amber rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted/70">Elapsed: {elapsedLabel}</span>
        <span className={remaining > 0 ? "text-amber" : "text-green"}>
          {remaining > 0 ? `Est. ${fmtTime(remaining)} remaining` : "Should arrive any moment"}
        </span>
      </div>
      {checkMsg && <div className={`text-[11px] ${checkMsg.startsWith("✅") ? "text-green" : "text-muted"}`}>{checkMsg}</div>}
    </div>
  );
}

function ChainPicker({ value, onChange, exclude, balances, label }: {
  value: string; onChange: (v: string) => void; exclude: string;
  balances: Record<string, string>; label: string;
}) {
  const [open, setOpen] = useState(false);
  const c = CHAINS[value];
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-surface2 border border-white/8 rounded-xl hover:border-white/16 transition-all">
        <span className="text-lg shrink-0 w-6 text-center flex items-center justify-center">
          {c.icon === "arc" ? <img src="/arc-logo.png" alt="Arc" width={20} height={20} className="rounded-sm" /> : c.icon}
        </span>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">{c.label}</div>
          {balances[value] && balances[value] !== "—" && (
            <div className="text-[11px] font-mono text-muted">{balances[value]} USDC</div>
          )}
        </div>
        <span className={`text-muted text-[10px] transition-transform duration-150 shrink-0 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl border border-white/10 overflow-hidden"
            style={{ background: "#111520", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
            {CHAIN_IDS.filter(id => id !== exclude).map(id => {
              const ch = CHAINS[id]; const bal = balances[id];
              const isSelected = id === value;
              return (
                <button key={id} onClick={() => { onChange(id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5 ${isSelected ? "bg-accent/10" : ""}`}>
                  <span className="text-base shrink-0 w-6 text-center flex items-center justify-center">
                    {ch.icon === "arc" ? <img src="/arc-logo.png" alt="Arc" width={18} height={18} className="rounded-sm" /> : ch.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium truncate ${isSelected ? "text-accent" : "text-ink"}`}>{ch.label}</div>
                    {ch.gas !== "USDC" && <div className="text-[10.5px] text-amber">needs {ch.gas} for gas</div>}
                  </div>
                  {bal && bal !== "—" && (
                    <span className="font-mono text-[11px] text-green shrink-0">{bal} USDC</span>
                  )}
                  {isSelected && <span className="text-accent text-[10px] shrink-0">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Bridge() {
  const { account, isConnected, connect, getProvider } = useWallet();
  const [fromChain, setFromChain] = useState("Arc_Testnet");
  const [toChain,   setToChain]   = useState("Base_Sepolia");
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState("");
  const [status,    setStatus]    = useState("");
  const [step,      setStep]      = useState(0);
  const [succeeded, setSucceeded] = useState(false);
  const [txId,      setTxId]      = useState("");
  const [feeInfo,   setFeeInfo]   = useState<{ forwarding: string; receive: string } | null>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [page,      setPage]      = useState(1);
  const [chainBals, setChainBals] = useState<Record<string, string>>({});
  const [pendingBridges, setPendingBridges] = useState<any[]>([]);
  const [relaying, setRelaying] = useState(false);
  const [relayElapsed, setRelayElapsed] = useState(0);
  const [bridgeEst, setBridgeEst] = useState<any>(null);
  const [estimating, setEstimating] = useState(false);

  // Fetch USDC balances on all chains + auto-suggest richest as FROM
  useEffect(() => {
    if (!account) return;
    setHistory(getBridgeHistory(account));
    setPendingBridges(JSON.parse(localStorage.getItem("arcPendingBridges") || "[]"));
    Promise.all(
      CHAIN_IDS.map(id => fetchChainUsdcBalance(id, account).then(bal => ({ id, bal })))
    ).then(results => {
      const bals: Record<string, string> = {};
      results.forEach(r => { bals[r.id] = r.bal; });
      setChainBals(bals);
      // Auto-suggest chain with highest USDC balance
      const best = results
        .filter(r => r.bal !== "—")
        .sort((a, b) => parseFloat(b.bal) - parseFloat(a.bal))[0];
      if (best && parseFloat(best.bal) > 0) {
        setFromChain(prev => prev === best.id ? prev : best.id);
        setToChain(prev => prev === best.id ? (best.id === "Arc_Testnet" ? "Base_Sepolia" : "Arc_Testnet") : prev);
      }
    });
  }, [account]);

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
    setFromChain(toChain); setToChain(fromChain); setFeeInfo(null); setStatus(""); setStep(0); setSucceeded(false); setBridgeEst(null);
  }

  async function estimateBridge() {
    if (!account || amtNum <= 0 || fromChain === toChain || isKitMode) return;
    setEstimating(true); setBridgeEst(null);
    try {
      const eth = getProvider();
      const adapterModule = await import("@circle-fin/adapter-viem-v2");
      const { AppKit }    = await import("@circle-fin/app-kit") as any;
      const createAdapterFromProvider = (adapterModule as any).createAdapterFromProvider;
      const kit     = new AppKit();
      const adapter = await createAdapterFromProvider({ provider: eth });
      const est = await kit.estimateBridge({
        from:   { adapter, chain: fromChain },
        to:     { adapter, chain: toChain },
        amount: amtNum.toFixed(2),
        token:  "USDC",
      });
      setBridgeEst(est);
    } catch (e: any) {
      setBridgeEst({ error: e?.message });
    }
    setEstimating(false);
  }

  async function doBridge() {
    if (!account || amtNum <= 0 || fromChain === toChain) return;
    const eth = getProvider();
    if (!eth) return;
    setTxId(""); setStatus(""); setSucceeded(false);

    try {
      // Step 1 — switch network
      setStep(1); setStatus(`Switching to ${src.label}…`);
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: src.chainId }] });
      } catch (e: any) {
        if (e.code === 4902) {
          const gasSymbol = src.gas === "USDC" ? "USDC" : src.gas;
          await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: src.chainId, chainName: src.label, rpcUrls: [src.rpc],
            nativeCurrency: src.gas === "USDC" ? { name:"USDC", symbol:"USDC", decimals:6 } : { name: gasSymbol, symbol: gasSymbol, decimals:18 } }] });
        } else throw e;
      }

      const accs = await eth.request({ method: "eth_accounts" });
      const from = accs[0] as string;
      const value = BigInt(Math.floor(amtNum * 1_000_000));
      const salt  = randomSalt();

      // Native gas token check (ETH / AVAX / MATIC)
      if (src.gas !== "USDC") {
        const nativeBal = BigInt(await eth.request({ method: "eth_getBalance", params: [from, "latest"] }));
        if (nativeBal < BigInt("10000000000000000"))
          throw new Error(`Insufficient ${src.gas} on ${src.label}.\nYou need at least 0.01 ${src.gas} for gas.\nCurrent: ${(Number(nativeBal)/1e18).toFixed(6)} ${src.gas}`);
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

        // Snapshot USDC balance via MetaMask (avoids RPC caching)
        const getUsdcBal = async () => {
          const result = await eth.request({ method: "eth_call", params: [
            { to: src.usdc, data: "0x70a08231" + from.toLowerCase().replace("0x","").padStart(64,"0") },
            "latest",
          ]});
          return BigInt(result && result !== "0x" ? result : "0x0");
        };
        const balBefore = await getUsdcBal();
        console.log("[Bridge] USDC before:", Number(balBefore)/1e6);

        setStep(KIT_STEP_APPROVE); setStatus("Approve & confirm in MetaMask…");
        const bridgeResult = await (kit as any).bridge({
          from: { adapter, chain: fromChain },
          to:   { adapter, chain: toChain },
          amount: amtNum.toFixed(2), token: "USDC",
        });
        console.log("[Bridge] App Kit result state:", bridgeResult?.state);

        // App Kit returns state:"error" on any failure (cancel approve, cancel burn, cancel mint)
        if (!bridgeResult || bridgeResult.state !== "success") {
          const steps = (bridgeResult?.steps || []) as any[];
          const burnStep = steps.find((s: any) => s.name === "burn" && s.state === "success");
          if (burnStep) {
            // Burn succeeded — USDC is safe. Auto-poll destination balance instead of showing an error.
            const burnTxHash = burnStep.txHash || burnStep.batchId || "";
            const pending = { burnTxHash, from: fromChain, to: toChain, amount: amtNum.toFixed(2), ts: Date.now(), recipient: recipient || from };
            const existing = JSON.parse(localStorage.getItem("arcPendingBridges") || "[]");
            localStorage.setItem("arcPendingBridges", JSON.stringify([...existing, pending]));
            setPendingBridges(prev => [...prev, pending]);

            setRelaying(true);
            setRelayElapsed(0);
            setStep(KIT_STEP_BRIDGE);

            const getDstBal = async () => {
              const r = await fetch(dst.rpc, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[
                  { to: dst.usdc, data: "0x70a08231" + (recipient||from).toLowerCase().replace("0x","").padStart(64,"0") },
                  "latest",
                ]}),
              }).then(r => r.json());
              return BigInt(r.result && r.result !== "0x" ? r.result : "0x0");
            };

            const dstBalBefore = await getDstBal();
            const deadline = Date.now() + 6 * 60 * 1000; // 6 min
            let elapsed = 0;
            while (Date.now() < deadline) {
              await new Promise(r => setTimeout(r, 5000));
              elapsed += 5;
              setRelayElapsed(elapsed);
              setStatus(`⏳ Circle is relaying your USDC to ${dst.label}… ${elapsed}s`);
              const dstBalNow = await getDstBal();
              if (dstBalNow > dstBalBefore) {
                const arrived = Number(dstBalNow - dstBalBefore) / 1e6;
                const updated_pending = JSON.parse(localStorage.getItem("arcPendingBridges") || "[]");
                localStorage.setItem("arcPendingBridges", JSON.stringify(updated_pending.filter((x: any) => x.burnTxHash !== burnTxHash)));
                setPendingBridges(prev => prev.filter(x => x.burnTxHash !== burnTxHash));
                saveBridgeEntry({ from: fromChain, to: toChain, amount: arrived.toFixed(2), token: "USDC", ts: Date.now(), status: "completed" }, account);
                const updated = getBridgeHistory(account); setHistory(updated); setPage(1);
                setStatus(`✅ ${arrived.toFixed(2)} USDC arrived on ${dst.label}!`);
                setStep(0); setSucceeded(true); setRelaying(false);
                return;
              }
            }
            // 6 min timeout — funds are still safe, just taking longer
            setRelaying(false); setStep(0);
            setStatus(`Transfer is processing. Your ${amtNum.toFixed(2)} USDC is safe — Circle may take up to 20 min on first relay. Check your ${dst.label} balance later.`);
            return;
          }
          throw new Error("Bridge cancelled.");
        }

        // Extra: verify balance decreased (catches edge cases where state="success" but nothing happened)
        const balAfter = await getUsdcBal();
        if (balBefore - balAfter < BigInt(Math.floor(amtNum * 900_000))) {
          throw new Error("Bridge did not complete — balance unchanged.");
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
      <div className="p-4 lg:p-6 flex-1 flex flex-col items-center gap-4 lg:gap-5 max-w-[560px] mx-auto w-full">

        {/* Pending bridge relay banner */}
        {pendingBridges.length > 0 && !relaying && (
          <div className="w-full bg-amber/8 border border-amber/25 rounded-xl px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber font-semibold text-[13px]">
                <span>⏳</span>
                <span>{pendingBridges.length} transfer{pendingBridges.length > 1 ? "s" : ""} waiting for Circle relay</span>
              </div>
              <button onClick={() => { localStorage.removeItem("arcPendingBridges"); setPendingBridges([]); }}
                className="text-[11px] text-muted/60 hover:text-muted border border-white/10 rounded-md px-2 py-0.5 transition-colors">
                Dismiss all
              </button>
            </div>
            {pendingBridges.map((p, i) => (
              <PendingBridgeRow key={i} p={p} onDismiss={() => {
                const f = pendingBridges.filter((_,j)=>j!==i);
                setPendingBridges(f);
                localStorage.setItem("arcPendingBridges", JSON.stringify(f));
              }} onArrived={() => {
                const f = pendingBridges.filter((_,j)=>j!==i);
                setPendingBridges(f);
                localStorage.setItem("arcPendingBridges", JSON.stringify(f));
                saveBridgeEntry({ from: p.from, to: p.to, amount: p.amount, token: "USDC", ts: Date.now(), status: "completed" }, account!);
                setHistory(getBridgeHistory(account!));
              }} getProvider={getProvider} />
            ))}
            <div className="text-[11px] text-muted/70">Your USDC is safe. Circle typically relays within 1–5 min.</div>
          </div>
        )}

        {/* Active relay spinner */}
        {relaying && (
          <div className="w-full bg-accent/8 border border-accent/25 rounded-xl px-4 py-4 flex items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent shrink-0 animate-spin" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-accent">Circle is relaying your USDC…</div>
                <div className="text-[12px] font-mono text-muted">{relayElapsed}s <span className="text-muted/50">/ ~60–120s</span></div>
              </div>
              <div className="mt-1.5 h-1 bg-accent/15 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-1000" style={{ width: `${Math.min(relayElapsed / 120 * 100, 95)}%` }} />
              </div>
              <div className="text-[11px] text-muted mt-1.5">Checking destination balance every 5s. Do NOT bridge again.</div>
            </div>
          </div>
        )}

        {/* Main row: form + progress panel */}
        <div className="flex flex-row gap-4 items-start w-full">

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
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">From</span>
                <ChainPicker value={fromChain} onChange={v => { setFromChain(v); setFeeInfo(null); setStatus(""); setStep(0); setSucceeded(false); setBridgeEst(null); }} exclude={toChain} balances={chainBals} label="From" />
                <div className="flex items-center gap-3 mt-1">
                  <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setFeeInfo(null); setBridgeEst(null); }}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[28px] font-bold text-ink outline-none placeholder:text-muted/30 w-0" />
                  <span className="text-[13px] font-semibold text-muted shrink-0">USDC</span>
                </div>
                {src.gas !== "USDC" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber bg-amber/6 border border-amber/15 rounded-lg px-3 py-1.5">
                    ⚠ You need {src.gas} in your wallet for gas on {src.label}
                  </div>
                )}
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
                    <span className="text-[11px] text-muted bg-surface2 border border-white/8 rounded-full px-2 py-0.5">fwd fee ~{dst.gwFee}</span>
                  )}
                </div>
                <ChainPicker value={toChain} onChange={v => { setToChain(v); setFeeInfo(null); setStatus(""); setStep(0); setSucceeded(false); setBridgeEst(null); }} exclude={fromChain} balances={chainBals} label="To" />
                <div className="flex items-center gap-3 mt-1">
                  <span className={`flex-1 text-[28px] font-bold tabular-nums ${amtNum > 0 ? "text-green" : "text-muted/30"}`}>
                    {amtNum > 0
                      ? (isKitMode
                          ? `~${(amtNum - amtNum*0.00005).toFixed(4)}`
                          : (feeInfo ? feeInfo.receive : `~${(amtNum - 0.20 - amtNum*0.00005).toFixed(4)}`)
                        )
                      : "0.00"
                    }
                  </span>
                  <span className="text-[13px] font-semibold text-muted shrink-0">USDC</span>
                </div>
              </div>

              {/* Recipient — only for Gateway Forwarding (Arc source); App Kit resolves from connected wallet */}
              {!isKitMode && (
                <input value={recipient} onChange={e => setRecipient(e.target.value)}
                  placeholder="Recipient (optional, default: your wallet)"
                  className="w-full bg-bg border border-white/6 rounded-2xl px-3 py-2 text-[12px] text-ink font-mono outline-none focus:border-accent transition-colors placeholder:text-muted" />
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

              {/* Estimate panel — Kit mode only */}
              {isKitMode && amtNum > 0 && (
                <div className="flex flex-col gap-2">
                  {bridgeEst && !bridgeEst.error && (
                    <div className="bg-green/6 border border-green/20 rounded-xl px-4 py-3 text-[12px] flex flex-col gap-1">
                      <div className="font-semibold text-green">✓ Route available</div>
                      {bridgeEst.fees?.map((f: any, i: number) => (
                        <div key={i} className="flex justify-between text-muted">
                          <span>{f.type || "Fee"}</span>
                          <span className="font-mono">{f.amount || "—"} {f.token || "USDC"}</span>
                        </div>
                      ))}
                      {bridgeEst.transferredAmount && (
                        <div className="flex justify-between text-ink font-semibold mt-0.5 pt-1 border-t border-white/8">
                          <span>You receive</span>
                          <span className="font-mono text-green">{bridgeEst.transferredAmount} USDC</span>
                        </div>
                      )}
                    </div>
                  )}
                  {bridgeEst?.error && (
                    <div className="bg-red/8 border border-red/20 rounded-xl px-3 py-2 text-[12px] text-red">❌ {bridgeEst.error}</div>
                  )}
                  {!bridgeEst && (
                    <button onClick={estimateBridge} disabled={estimating}
                      className="w-full py-2 text-[12.5px] font-semibold text-accent bg-accent/8 border border-accent/20 rounded-xl hover:bg-accent/15 transition-colors disabled:opacity-50">
                      {estimating ? "Estimating fees…" : "Estimate fees before bridging"}
                    </button>
                  )}
                </div>
              )}

              {/* Status */}
              {status && !relaying && (
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
                <button onClick={doBridge} disabled={step > 0 || relaying || !amount || amtNum <= 0 || fromChain === toChain}
                  className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors tracking-wide">
                  {relaying ? "Relaying in progress…" : step > 0 ? "Processing…" : amtNum > 0 ? `Bridge ${amount} USDC — ${src.label} → ${dst.label}` : "Enter amount to bridge"}
                </button>
              )}
            </div>
          </div>

          {/* ── Progress panel ── */}
          <div className="w-[220px] sm:w-[260px] shrink-0 bg-surface border border-white/8 rounded-2xl overflow-hidden sticky top-6">
              <div className="px-4 py-3.5 border-b border-white/8">
                <div className="font-bold text-[13px]">Bridge Progress</div>
                <div className="text-[11px] text-muted mt-0.5">
                  {succeeded ? "All done ✓" : step > 0 ? `Step ${displayStep} of ${STEPS.length}` : "Waiting to start"}
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
                <div className="text-[10.5px] text-muted text-center bg-green/6 border border-green/15 rounded-2xl py-1.5">
                  {isKitMode ? "Circle App Kit · CCTP" : "No gas on destination · Circle pays"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Info row: accordions ── */}
        <div className="flex flex-col sm:flex-row gap-4 w-full">
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
                      <span className="text-lg shrink-0 flex items-center"><ChainIcon icon={c.icon} size={22} /></span>
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
        {(() => {
          const pendingRows = pendingBridges.map((p: any) => ({ ...p, status: "pending", txId: p.burnTxHash }));
          const allRows = [...pendingRows, ...history].sort((a: any, b: any) => b.ts - a.ts);
          const totalPg = Math.ceil(allRows.length / HISTORY_PER_PAGE);
          const paged = allRows.slice((page-1)*HISTORY_PER_PAGE, page*HISTORY_PER_PAGE);
          return (
        <Accordion key="bridge-history" title={`Bridge History  (${allRows.length})`}>
          {allRows.length === 0 ? (
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
                  {paged.map((h: any, i: number) => (
                    <tr key={i} className="border-b border-white/6 last:border-0 hover:bg-surface2 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2 text-[13px] font-medium">
                          <ChainIcon icon={CHAINS[h.from]?.icon ?? "?"} size={16} />
                          <span className="text-muted text-[11px]">{h.from?.replace(/_/g," ")}</span>
                          <span className="text-muted">→</span>
                          <ChainIcon icon={CHAINS[h.to]?.icon ?? "?"} size={16} />
                          <span className="text-muted text-[11px]">{h.to?.replace(/_/g," ")}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-[13px] text-ink">{h.amount} USDC</td>
                      <td className="px-6 py-3.5 text-[12px] text-muted">{new Date(h.ts).toLocaleString()}</td>
                      <td className="px-6 py-3.5">
                        {h.status === "pending" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber/10 border border-amber/25 text-amber animate-pulse">
                            ⏳ relaying
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-green/10 border border-green/20 text-green">
                            ✓ {h.status}
                          </span>
                        )}
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
              {totalPg > 1 && (
                <div className="flex items-center justify-center gap-1.5 px-6 py-4 border-t border-white/8">
                  <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                    className="px-3 py-1.5 rounded-2xl text-[12px] border border-white/14 text-muted hover:text-ink disabled:opacity-30 transition-colors">← Prev</button>
                  {Array.from({ length: totalPg }, (_,i) => i+1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-2xl text-[12px] font-semibold border transition-colors ${page===p ? "bg-accent border-accent text-white" : "border-white/14 text-muted hover:text-ink"}`}>{p}</button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPg,p+1))} disabled={page===totalPg}
                    className="px-3 py-1.5 rounded-2xl text-[12px] border border-white/14 text-muted hover:text-ink disabled:opacity-30 transition-colors">Next →</button>
                </div>
              )}
            </>
          )}
        </Accordion>
          );
        })()}

      </div>
    </>
  );
}
