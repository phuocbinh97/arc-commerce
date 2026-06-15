/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { getBridgeHistory, saveBridgeEntry } from "@/lib/storage";

const GATEWAY_API = "https://gateway-api-testnet.circle.com";
const GATEWAY_WALLET  = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"; // Arc source
const GATEWAY_MINTER  = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"; // destination
const ARC_USDC        = "0x3600000000000000000000000000000000000000";
const ARC_DOMAIN      = 26;

const DEST_CHAINS = [
  { id: "Ethereum_Sepolia", label: "Ξ Ethereum Sepolia", domain: 0,  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", fee: "$1.00" },
  { id: "Base_Sepolia",     label: "🔵 Base Sepolia",    domain: 6,  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", fee: "$0.01" },
  { id: "Arbitrum_Sepolia", label: "🔷 Arbitrum Sepolia",domain: 3,  usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", fee: "$0.01" },
  { id: "OP_Sepolia",       label: "🔴 OP Sepolia",      domain: 2,  usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", fee: "$0.0015" },
];

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
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bigintReplacer(_: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

export default function Bridge() {
  const { account, isConnected, connect } = useWallet();
  const [toChain,   setToChain]   = useState(DEST_CHAINS[1].id); // Base Sepolia default
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState("");
  const [status,    setStatus]    = useState("");
  const [step,      setStep]      = useState<0|1|2|3|4>(0); // 0=idle,1=estimate,2=sign,3=submit,4=done
  const [txId,      setTxId]      = useState("");
  const [feeInfo,   setFeeInfo]   = useState<{total:string;forwarding:string}|null>(null);
  const [history,   setHistory]   = useState<any[]>([]);

  useEffect(() => { if (account) setHistory(getBridgeHistory(account)); }, [account]);

  const dest = DEST_CHAINS.find(c => c.id === toChain)!;
  const amtNum = parseFloat(amount) || 0;
  const recipientAddr = (recipient || account || "").trim();

  async function doBridge() {
    if (!account || amtNum <= 0) return;
    const eth = (window as any).ethereum;
    if (!eth) return;

    try {
      const value = BigInt(Math.floor(amtNum * 1_000_000));
      const salt  = randomSalt();

      const spec = {
        version:              1 as number,
        sourceDomain:         ARC_DOMAIN as number,
        destinationDomain:    dest.domain as number,
        sourceContract:       pad32(GATEWAY_WALLET),
        destinationContract:  pad32(GATEWAY_MINTER),
        sourceToken:          pad32(ARC_USDC),
        destinationToken:     pad32(dest.usdc),
        sourceDepositor:      pad32(account),
        destinationRecipient: pad32(recipientAddr),
        sourceSigner:         pad32(account),
        destinationCaller:    pad32("0x0000000000000000000000000000000000000000"),
        value:                value.toString(),
        salt,
        hookData:             "0x",
      };

      // Step 1 — estimate fees
      setStep(1); setStatus("Estimating fees…");
      const estimateRes = await fetch(`${GATEWAY_API}/v1/estimate?enableForwarder=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ spec }]),
      });
      if (!estimateRes.ok) throw new Error(`Estimate failed: ${estimateRes.status}`);
      const estimateJson = await estimateRes.json();
      const estimated    = estimateJson.body?.[0]?.burnIntent ?? estimateJson[0]?.burnIntent;
      const fees         = estimateJson.fees;
      const maxFee       = estimated?.maxFee       ?? "0";
      const maxBlockHeight = estimated?.maxBlockHeight ?? "0";

      setFeeInfo({
        total:      fees?.total       ?? maxFee,
        forwarding: fees?.forwardingFee ?? "0.20",
      });

      // Step 2 — sign EIP-712
      setStep(2); setStatus("Sign in MetaMask (1 confirmation)…");
      const message = { maxBlockHeight, maxFee, spec };
      const typedData = {
        domain:      { name: "GatewayWallet", version: "1" },
        types: {
          EIP712Domain:  EIP712_DOMAIN_TYPE,
          TransferSpec:  TRANSFER_SPEC_TYPES,
          BurnIntent:    BURN_INTENT_TYPES,
        },
        primaryType: "BurnIntent",
        message,
      };

      const signature = await eth.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(typedData, bigintReplacer)],
      });

      // Step 3 — submit
      setStep(3); setStatus("Submitting to Circle Gateway…");
      const transferRes = await fetch(`${GATEWAY_API}/v1/transfer?enableForwarder=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ burnIntent: message, signature }], bigintReplacer),
      });
      if (!transferRes.ok) {
        const err = await transferRes.text();
        throw new Error(`Transfer failed: ${err}`);
      }
      const transferJson = await transferRes.json();
      const transferId   = transferJson.transferId;
      setTxId(transferId);

      // Step 4 — poll
      setStep(4); setStatus("Waiting for Circle to mint on destination…");
      const deadline = Date.now() + 300_000; // 5 min timeout
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5_000));
        const pollRes = await fetch(`${GATEWAY_API}/v1/transfer/${transferId}`);
        if (!pollRes.ok) continue;
        const details = await pollRes.json();
        const s = details.status;
        if (s === "confirmed" || s === "finalized") {
          saveBridgeEntry({ from: "Arc_Testnet", to: toChain, amount, token: "USDC", ts: Date.now(), status: "completed", txId: transferId }, account);
          setHistory(getBridgeHistory(account));
          setStep(0);
          setStatus(`✅ ${amount} USDC arrived on ${dest.label}!`);
          return;
        }
        if (s === "failed")  throw new Error(`Bridge failed: ${details.forwardingDetails?.failureReason ?? "unknown"}`);
        if (s === "expired") throw new Error("Transfer expired before forwarding completed.");
        setStatus(`Waiting… status: ${s}`);
      }
      throw new Error("Timed out after 5 minutes.");
    } catch (e: any) {
      const msg = e?.message || "Bridge failed";
      if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
        setStatus("Bridge cancelled.");
      } else {
        setStatus(`❌ ${msg.slice(0, 120)}`);
      }
      setStep(0);
    }
  }

  const STEPS = [
    { n: 1, label: "Estimate fees",       desc: "Call Gateway API to get exact fee" },
    { n: 2, label: "Sign burn intent",    desc: "1× MetaMask signature (EIP-712)" },
    { n: 3, label: "Submit to Gateway",   desc: "Circle receives the signed intent" },
    { n: 4, label: "Auto-mint on dest",   desc: "Circle mints USDC — no more confirmations" },
  ];

  return (
    <>
      <Topbar title="Bridge" />
      <div className="p-7 flex-1 grid grid-cols-[480px_1fr] gap-5 items-start">

        {/* Left — form */}
        <div className="bg-surface border border-white/8 rounded-lg">
          <div className="px-5 py-4 border-b border-white/8">
            <div className="font-semibold text-sm">Bridge USDC</div>
            <div className="text-xs text-muted mt-0.5">Arc Testnet → Any chain · Circle Gateway Forwarding</div>
          </div>
          <div className="p-5 flex flex-col gap-4">

            {/* Source — fixed Arc */}
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">From</label>
              <div className="bg-surface2 border border-white/8 rounded-lg px-3 py-2 text-[13px] text-ink flex items-center gap-2">
                <span>⚡</span><span>Arc Testnet</span>
                <span className="ml-auto text-[11px] text-muted font-mono">USDC gas</span>
              </div>
            </div>

            {/* Destination */}
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">To</label>
              <select value={toChain} onChange={e => setToChain(e.target.value)}
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent">
                {DEST_CHAINS.map(c => (
                  <option key={c.id} value={c.id}>{c.label} · gas fee {c.fee}</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">Amount (USDC)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00"
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent" />
            </div>

            {/* Recipient */}
            <div>
              <label className="text-[12.5px] font-semibold text-muted mb-1.5 block">
                Recipient on {dest.label.split(" ").slice(1).join(" ")} <span className="font-normal">(default: your wallet)</span>
              </label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder={account || "0x…"}
                className="w-full bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink font-mono outline-none focus:border-accent" />
            </div>

            {/* Fee preview */}
            {amtNum > 0 && (
              <div className="bg-surface2 border border-white/8 rounded-lg p-3 text-[13px] flex flex-col gap-1.5">
                <div className="flex justify-between"><span className="text-muted">You send</span><span className="font-semibold">{amount} USDC</span></div>
                <div className="flex justify-between"><span className="text-muted">Forwarding fee</span><span>{feeInfo ? `${parseFloat(feeInfo.forwarding).toFixed(4)} USDC` : `~${dest.fee}`}</span></div>
                <div className="flex justify-between"><span className="text-muted">Transfer fee</span><span>0.005% ({(amtNum * 0.00005).toFixed(6)} USDC)</span></div>
                <div className="flex justify-between border-t border-white/8 pt-1.5 mt-0.5">
                  <span className="text-muted">Receive (approx)</span>
                  <span className="text-green font-semibold">{(amtNum - 0.20 - amtNum * 0.00005).toFixed(4)} USDC</span>
                </div>
                <div className="flex justify-between"><span className="text-muted">Est. time</span><span className="text-accent">~30 seconds</span></div>
              </div>
            )}

            {/* Progress steps while bridging */}
            {step > 0 && (
              <div className="flex flex-col gap-1.5">
                {STEPS.map(s => (
                  <div key={s.n} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-colors
                    ${step === s.n ? "bg-accent/10 border border-accent/30 text-ink" :
                      step > s.n  ? "bg-green/8 border border-green/20 text-green" :
                                    "bg-surface2 border border-white/8 text-muted"}`}>
                    <span className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0
                      border border-current">
                      {step > s.n ? "✓" : s.n}
                    </span>
                    <span className="font-medium">{s.label}</span>
                    {step === s.n && <span className="ml-auto text-[11px] animate-pulse">…</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Status */}
            {status && (
              <div className={`px-3 py-2 rounded-lg text-[12.5px] ${
                status.startsWith("✅") ? "bg-green/10 text-green border border-green/20" :
                status.startsWith("❌") ? "bg-red/10 text-red border border-red/20" :
                "bg-surface2 text-muted"}`}>
                {status}
                {txId && <div className="font-mono text-[11px] mt-0.5 opacity-70">ID: {txId}</div>}
              </div>
            )}

            {!isConnected ? (
              <button onClick={connect} className="w-full py-2 bg-accent text-white rounded-lg text-[13px] font-semibold">
                ⚡ Connect Wallet
              </button>
            ) : (
              <button onClick={doBridge} disabled={step > 0 || !amount || amtNum <= 0}
                className="w-full py-2.5 bg-accent text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:bg-accent/90 transition-colors">
                {step > 0 ? "Bridging…" : `Bridge ${amount || "—"} USDC → ${dest.label.split(" ").slice(1).join(" ")}`}
              </button>
            )}

            <div className="text-center text-[11.5px] text-muted">
              Powered by{" "}
              <a href="https://developers.circle.com/gateway/references/forwarding-service" target="_blank" rel="noreferrer" className="text-[#6ea8fe]">
                Circle Gateway Forwarding Service
              </a>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col gap-4">

          {/* How it works */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8">
              <div className="font-semibold text-sm">How it works</div>
              <div className="text-[11.5px] text-muted mt-0.5">1 MetaMask signature · Circle handles the rest</div>
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
                ✓ No gas needed on destination — Circle pays it for you.
              </div>
            </div>
          </div>

          {/* Supported destinations */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Destination Chains</div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {DEST_CHAINS.map(c => (
                <button key={c.id} onClick={() => setToChain(c.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors
                    ${toChain === c.id ? "bg-accent/10 border-accent/40" : "bg-surface2 border-white/8 hover:border-white/20"}`}>
                  <span className="text-lg">{c.label.split(" ")[0]}</span>
                  <div>
                    <div className="text-[12.5px] font-semibold">{c.label.substring(c.label.indexOf(" ")+1)}</div>
                    <div className="text-[11px] text-muted">gas fee {c.fee}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Bridge History</div>
            <div className="p-4">
              {history.length === 0 ? (
                <div className="text-center py-6 text-muted text-sm">No bridges yet</div>
              ) : (
                history.map((h: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/8 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-purple/10 grid place-items-center text-sm shrink-0">⇄</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">Arc → {h.to?.replace("_", " ") ?? h.to}</div>
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
