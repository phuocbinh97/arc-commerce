/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getBridgeHistory, saveBridgeEntry } from "@/lib/storage";

const GATEWAY_API    = "https://gateway-api-testnet.circle.com";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"; // same on all chains
const GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"; // same on all chains

const CHAINS: Record<string, {
  label: string; icon: string; domain: number; chainId: string; rpc: string;
  usdc: string; gas: "USDC" | "ETH"; gwFee: string;
}> = {
  Arc_Testnet: {
    label: "Arc Testnet",    icon: "⚡", domain: 26, chainId: "0x4CEF52",
    rpc:  "https://rpc.testnet.arc.network",
    usdc: "0x3600000000000000000000000000000000000000",
    gas: "USDC", gwFee: "—",
  },
  Ethereum_Sepolia: {
    label: "Ethereum Sepolia", icon: "Ξ", domain: 0, chainId: "0xaa36a7",
    rpc:  "https://rpc.sepolia.org",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    gas: "ETH", gwFee: "$1.00",
  },
  Base_Sepolia: {
    label: "Base Sepolia",    icon: "🔵", domain: 6, chainId: "0x14a34",
    rpc:  "https://sepolia.base.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    gas: "ETH", gwFee: "$0.01",
  },
  Arbitrum_Sepolia: {
    label: "Arbitrum Sepolia", icon: "🔷", domain: 3, chainId: "0x66eee",
    rpc:  "https://sepolia-rollup.arbitrum.io/rpc",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    gas: "ETH", gwFee: "$0.01",
  },
  OP_Sepolia: {
    label: "OP Sepolia",      icon: "🔴", domain: 2, chainId: "0xaa37dc",
    rpc:  "https://sepolia.optimism.io",
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    gas: "ETH", gwFee: "$0.0015",
  },
};

const CHAIN_IDS = Object.keys(CHAINS);

const TRANSFER_SPEC_TYPES = [
  { name: "version",              type: "uint32"  },
  { name: "sourceDomain",         type: "uint32"  },
  { name: "destinationDomain",    type: "uint32"  },
  { name: "sourceContract",       type: "bytes32" },
  { name: "destinationContract",  type: "bytes32" },
  { name: "sourceToken",          type: "bytes32" },
  { name: "destinationToken",     type: "bytes32" },
  { name: "sourceDepositor",      type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" },
  { name: "sourceSigner",         type: "bytes32" },
  { name: "destinationCaller",    type: "bytes32" },
  { name: "value",                type: "uint256" },
  { name: "salt",                 type: "bytes32" },
  { name: "hookData",             type: "bytes"   },
];
const BURN_INTENT_TYPES = [
  { name: "maxBlockHeight", type: "uint256"      },
  { name: "maxFee",         type: "uint256"      },
  { name: "spec",           type: "TransferSpec" },
];
const EIP712_DOMAIN_TYPE = [
  { name: "name",    type: "string" },
  { name: "version", type: "string" },
];

function pad32(addr: string): string {
  return "0x" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
}
function randomSalt(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}
function bigintReplacer(_: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}
async function waitTx(eth: any, hash: string) {
  while (true) {
    await new Promise(r => setTimeout(r, 500));
    const receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) {
      if (receipt.status === "0x0") throw new Error("Transaction reverted on-chain.");
      return receipt;
    }
  }
}

const STEPS = [
  { n: 1, label: "Switch network",    desc: "MetaMask switches to source chain" },
  { n: 2, label: "Estimate fees",     desc: "Calculate exact amount to deposit" },
  { n: 3, label: "Approve USDC",      desc: "Allow Gateway to spend amount + fee" },
  { n: 4, label: "Deposit to Gateway",desc: "Move USDC into Circle Gateway Wallet" },
  { n: 5, label: "Sign burn intent",  desc: "1× EIP-712 signature — no gas" },
  { n: 6, label: "Submit & auto-mint",desc: "Circle mints USDC on destination" },
];

export default function Bridge() {
  const { account, isConnected, connect } = useWallet();
  const [fromChain, setFromChain] = useState("Arc_Testnet");
  const [toChain,   setToChain]   = useState("Base_Sepolia");
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState("");
  const [status,    setStatus]    = useState("");
  const [step,      setStep]      = useState(0);
  const [txId,      setTxId]      = useState("");
  const [feeInfo,   setFeeInfo]   = useState<{ forwarding: string } | null>(null);
  const [history,   setHistory]   = useState<any[]>([]);

  useEffect(() => { if (account) setHistory(getBridgeHistory(account)); }, [account]);

  const src  = CHAINS[fromChain];
  const dst  = CHAINS[toChain];
  const amtNum = parseFloat(amount) || 0;
  const recipientAddr = (recipient || account || "").trim();

  function swapChains() {
    if (fromChain === toChain) return;
    setFromChain(toChain);
    setToChain(fromChain);
    setFeeInfo(null);
  }

  async function doBridge() {
    if (!account || amtNum <= 0 || fromChain === toChain) return;
    const eth = (window as any).ethereum;
    if (!eth) return;
    setTxId(""); setFeeInfo(null);

    try {
      // Step 1 — switch MetaMask to source chain
      setStep(1); setStatus(`Step 1/6 — Switching to ${src.label}…`);
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: src.chainId }] });
      } catch (switchErr: any) {
        // Chain not added yet — add it
        if (switchErr.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: src.chainId, chainName: src.label, rpcUrls: [src.rpc],
              nativeCurrency: src.gas === "ETH"
                ? { name: "ETH", symbol: "ETH", decimals: 18 }
                : { name: "USDC", symbol: "USDC", decimals: 6 } }],
          });
        } else throw switchErr;
      }

      const accs = await eth.request({ method: "eth_accounts" });
      const from = accs[0] as string;
      const value = BigInt(Math.floor(amtNum * 1_000_000));
      const salt  = randomSalt();

      // Check ETH balance for gas (non-Arc chains)
      if (src.gas === "ETH") {
        const ethBal = BigInt(await eth.request({ method: "eth_getBalance", params: [from, "latest"] }));
        const MIN_ETH = BigInt("10000000000000000"); // 0.01 ETH
        if (ethBal < MIN_ETH) {
          throw new Error(
            `Insufficient ETH on ${src.label}. You need at least 0.01 ETH for gas fees.\n` +
            `Current balance: ${(Number(ethBal) / 1e18).toFixed(6)} ETH.\n` +
            `Get ETH from a Sepolia faucet (e.g. sepoliafaucet.com).`
          );
        }
      }

      const spec = {
        version:              1,
        sourceDomain:         src.domain,
        destinationDomain:    dst.domain,
        sourceContract:       pad32(GATEWAY_WALLET),
        destinationContract:  pad32(GATEWAY_MINTER),
        sourceToken:          pad32(src.usdc),
        destinationToken:     pad32(dst.usdc),
        sourceDepositor:      pad32(from),
        destinationRecipient: pad32(recipientAddr || from),
        sourceSigner:         pad32(from),
        destinationCaller:    pad32("0x0000000000000000000000000000000000000000"),
        value:                value.toString(),
        salt,
        hookData:             "0x",
      };

      // Step 2 — estimate fees
      setStep(2); setStatus("Step 2/6 — Estimating fees…");
      const estimateRes = await fetch(`${GATEWAY_API}/v1/estimate?enableForwarder=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ spec }]),
      });
      if (!estimateRes.ok) throw new Error(`Estimate failed: ${await estimateRes.text()}`);
      const estimateJson = await estimateRes.json();
      const estimated = estimateJson?.body?.[0]?.burnIntent ?? estimateJson?.[0]?.burnIntent ?? estimateJson?.burnIntent;
      const fees      = estimateJson?.fees ?? estimateJson?.body?.fees;
      const rawMaxFee = estimated?.maxFee ?? "0";
      const maxBlockHeight = estimated?.maxBlockHeight ?? "0";
      if (rawMaxFee === "0") throw new Error("Could not estimate fees — please try again.");
      // 20% buffer to handle gas price fluctuations
      const maxFee = (BigInt(rawMaxFee) * 120n / 100n).toString();
      setFeeInfo({ forwarding: (Number(rawMaxFee) / 1e6).toFixed(4) });
      const depositAmount = value + BigInt(maxFee);

      // Check USDC balance on source chain
      const usdcBalRes = await fetch(src.rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{
          to: src.usdc,
          data: "0x70a08231" + from.toLowerCase().replace("0x","").padStart(64,"0"),
        }, "latest"] }),
      }).then(r => r.json());
      const usdcBal = BigInt(usdcBalRes.result && usdcBalRes.result !== "0x" ? usdcBalRes.result : "0x0");
      if (usdcBal < depositAmount) {
        throw new Error(
          `Insufficient USDC on ${src.label}.\n` +
          `You have: ${(Number(usdcBal)/1e6).toFixed(4)} USDC\n` +
          `Required: ${(Number(depositAmount)/1e6).toFixed(4)} USDC (amount + forwarding fee)\n` +
          `Get USDC from: https://faucet.circle.com`
        );
      }

      // Step 3 — approve USDC
      setStep(3); setStatus(`Step 3/6 — Approve ${(Number(depositAmount)/1e6).toFixed(4)} USDC…`);
      const approveData = "0x095ea7b3"
        + GATEWAY_WALLET.toLowerCase().replace("0x","").padStart(64,"0")
        + depositAmount.toString(16).padStart(64,"0");
      const approveTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: src.usdc, value: "0x0", data: approveData }],
      });
      setStatus("Confirming approve…");
      await waitTx(eth, approveTx);

      // Step 4 — deposit into Gateway Wallet
      setStep(4); setStatus("Step 4/6 — Depositing into Gateway Wallet…");
      const depositData = "0x47e7ef24"
        + src.usdc.toLowerCase().replace("0x","").padStart(64,"0")
        + depositAmount.toString(16).padStart(64,"0");
      const depositTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: GATEWAY_WALLET, value: "0x0", data: depositData }],
      });
      setStatus("Confirming deposit…");
      await waitTx(eth, depositTx);

      // Step 5 — sign EIP-712
      setStep(5); setStatus("Step 5/6 — Sign burn intent in MetaMask…");
      const message = { maxBlockHeight, maxFee, spec };
      const typedData = {
        domain:      { name: "GatewayWallet", version: "1" },
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPE,
          TransferSpec: TRANSFER_SPEC_TYPES,
          BurnIntent:   BURN_INTENT_TYPES,
        },
        primaryType: "BurnIntent",
        message,
      };
      const signature = await eth.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typedData, bigintReplacer)],
      });

      // Step 6 — submit + poll
      setStep(6); setStatus("Step 6/6 — Submitting to Circle Gateway…");
      const transferRes = await fetch(`${GATEWAY_API}/v1/transfer?enableForwarder=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ burnIntent: message, signature }], bigintReplacer),
      });
      if (!transferRes.ok) throw new Error(`Transfer failed: ${await transferRes.text()}`);
      const { transferId } = await transferRes.json();
      setTxId(transferId);
      setStatus("Waiting for Circle to mint on destination…");

      const deadline = Date.now() + 300_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5_000));
        const poll = await fetch(`${GATEWAY_API}/v1/transfer/${transferId}`);
        if (!poll.ok) continue;
        const d = await poll.json();
        if (d.status === "confirmed" || d.status === "finalized") {
          saveBridgeEntry({ from: fromChain, to: toChain, amount, token: "USDC", ts: Date.now(), status: "completed", txId: transferId }, account);
          setHistory(getBridgeHistory(account));
          setStep(0);
          setStatus(`✅ ${amount} USDC arrived on ${dst.label}!`);
          return;
        }
        if (d.status === "failed")  throw new Error(`Bridge failed: ${d.forwardingDetails?.failureReason ?? "unknown"}`);
        if (d.status === "expired") throw new Error("Transfer expired before minting.");
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
      <div className="p-7 flex-1 grid grid-cols-[500px_1fr] gap-5 items-start">

        {/* Left — form */}
        <div className="bg-surface border border-white/8 rounded-lg">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Bridge USDC</div>
            <div className="text-xs text-muted mt-0.5">Any chain ↔ Any chain · Circle Gateway Forwarding</div>
          </div>
          <div className="p-5 flex flex-col gap-4">

            {/* From / To with swap button */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12.5px] font-semibold text-muted">From</label>
                <button onClick={swapChains}
                  className="text-[11.5px] text-accent hover:text-white px-2 py-0.5 rounded border border-accent/30 hover:border-accent transition-colors">
                  ⇄ Swap
                </button>
              </div>
              <select value={fromChain} onChange={e => { setFromChain(e.target.value); setFeeInfo(null); }}
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                {CHAIN_IDS.filter(id => id !== toChain).map(id => (
                  <option key={id} value={id}>{CHAINS[id].icon} {CHAINS[id].label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">To</label>
              <select value={toChain} onChange={e => { setToChain(e.target.value); setFeeInfo(null); }}
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                {CHAIN_IDS.filter(id => id !== fromChain).map(id => (
                  <option key={id} value={id}>{CHAINS[id].icon} {CHAINS[id].label} · fee {CHAINS[id].gwFee}</option>
                ))}
              </select>
            </div>

            {/* Gas warning for non-Arc source */}
            {src.gas === "ETH" && (
              <div className="bg-amber/8 border border-amber/25 rounded-lg px-3 py-2 text-[12px] text-amber">
                ⚠ You need <strong>ETH</strong> on {src.label} for gas fees (approve + deposit).
                Min ~0.01 ETH. Get from{" "}
                <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer" className="underline">sepoliafaucet.com</a>.
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Amount (USDC)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
            </div>

            {/* Recipient */}
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">
                Recipient on {dst.label} <span className="font-normal text-muted">(default: your wallet)</span>
              </label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder={account || "0x…"}
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
            </div>

            {/* Fee preview */}
            {amtNum > 0 && (
              <div className="bg-surface2 border border-white/8 rounded-lg p-3 text-[13px] flex flex-col gap-1.5">
                <div className="flex justify-between"><span className="text-muted">You send</span><span className="font-semibold">{amount} USDC</span></div>
                <div className="flex justify-between">
                  <span className="text-muted">Forwarding fee</span>
                  <span>{feeInfo ? `${feeInfo.forwarding} USDC` : `~${dst.gwFee}`}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted">Transfer fee</span><span>0.005% ({(amtNum*0.00005).toFixed(6)} USDC)</span></div>
                <div className="flex justify-between border-t border-white/8 pt-1.5 mt-0.5">
                  <span className="text-muted">You receive</span>
                  <span className="text-green font-semibold">
                    {feeInfo
                      ? (amtNum - parseFloat(feeInfo.forwarding) - amtNum*0.00005).toFixed(4)
                      : "~" + (amtNum - 0.20 - amtNum*0.00005).toFixed(4)
                    } USDC
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-muted">Est. time</span><span className="text-accent">~30 seconds</span></div>
              </div>
            )}

            {/* Progress steps */}
            {step > 0 && (
              <div className="flex flex-col gap-1.5">
                {STEPS.map(s => (
                  <div key={s.n} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-colors
                    ${step === s.n ? "bg-accent/10 border border-accent/30 text-ink" :
                      step > s.n  ? "bg-green/8 border border-green/20 text-green" :
                                    "bg-surface2 border border-white/8 text-muted"}`}>
                    <span className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0 border border-current">
                      {step > s.n ? "✓" : s.n}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{s.label}</div>
                    </div>
                    {step === s.n && <span className="text-[11px] animate-pulse shrink-0">…</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Status */}
            {status && (
              <div className={`px-3 py-2.5 rounded-lg text-[12.5px] whitespace-pre-line ${
                status.startsWith("✅") ? "bg-green/10 text-green border border-green/20" :
                status.startsWith("❌") ? "bg-red/10 text-red border border-red/20" :
                "bg-surface2 text-muted border border-white/8"}`}>
                {status}
                {txId && <div className="font-mono text-[11px] mt-1 opacity-60">ID: {txId}</div>}
              </div>
            )}

            {!isConnected ? (
              <button onClick={connect} className="w-full py-2.5 bg-accent text-white rounded-lg text-[13px] font-semibold">
                ⚡ Connect Wallet
              </button>
            ) : (
              <button onClick={doBridge} disabled={step > 0 || !amount || amtNum <= 0 || fromChain === toChain}
                className="w-full py-2.5 bg-accent text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:bg-accent/90 transition-colors">
                {step > 0 ? "Bridging…" : `Bridge ${amount || "—"} USDC  ${src.icon} ${src.label.split(" ")[0]} → ${dst.icon} ${dst.label.split(" ")[0]}`}
              </button>
            )}

            <div className="text-center text-[11.5px] text-muted">
              Powered by{" "}
              <a href="https://developers.circle.com/gateway/references/forwarding-service" target="_blank" rel="noreferrer" className="text-[#6ea8fe]">
                Circle Gateway Forwarding
              </a>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">

          {/* How it works */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8">
              <div className="font-semibold text-sm">How it works</div>
              <div className="text-[11.5px] text-muted mt-0.5">2 tx + 1 signature · Circle handles destination mint</div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {STEPS.map(s => (
                <div key={s.n} className="flex items-start gap-3 p-3 bg-surface2 border border-white/8 rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-accent/15 text-[#6ea8fe] grid place-items-center text-xs font-bold shrink-0">{s.n}</div>
                  <div>
                    <div className="text-[13px] font-semibold">{s.label}</div>
                    <div className="text-[11.5px] text-muted">{s.desc}</div>
                  </div>
                </div>
              ))}
              <div className="p-3 bg-green/8 border border-green/20 rounded-lg text-[12.5px] text-green">
                ✓ No gas needed on destination chain — Circle pays it.
              </div>
            </div>
          </div>

          {/* Supported chains */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Supported Chains</div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {CHAIN_IDS.map(id => {
                const c = CHAINS[id];
                return (
                  <div key={id} className="flex items-center gap-2.5 p-3 bg-surface2 border border-white/8 rounded-lg">
                    <span className="text-lg shrink-0">{c.icon}</span>
                    <div>
                      <div className="text-[12.5px] font-semibold">{c.label}</div>
                      <div className="text-[11px] text-muted">Gas: {c.gas}{c.gwFee !== "—" ? ` · fwd ${c.gwFee}` : " (free)"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bridge history */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Bridge History</div>
            <div className="p-4">
              {history.length === 0 ? (
                <div className="text-center py-6 text-muted text-sm">No bridges yet</div>
              ) : (
                (history as any[]).map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/8 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-purple/10 grid place-items-center text-sm shrink-0">⇄</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">
                        {CHAINS[h.from]?.icon ?? "?"} {h.from?.replace(/_/g," ")} → {CHAINS[h.to]?.icon ?? "?"} {h.to?.replace(/_/g," ")}
                      </div>
                      <div className="text-[11.5px] text-muted">{new Date(h.ts).toLocaleString()}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[13px] font-semibold">{h.amount} USDC</div>
                      <div className="text-[11px] text-green">{h.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
