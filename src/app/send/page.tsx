/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/hooks/useWallet";
import { shortAddr } from "@/lib/arc";

const CHAINS_SEND = [
  { key: "Arc_Testnet",      label: "Arc Testnet",      chainId: "0x4CEF52", rpc: "https://rpc.testnet.arc.network",            usdc: "0x3600000000000000000000000000000000000000", gas: "USDC" },
  { key: "Ethereum_Sepolia", label: "Ethereum Sepolia", chainId: "0xaa36a7", rpc: "https://rpc.sepolia.org",                    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", gas: "ETH"  },
  { key: "Base_Sepolia",     label: "Base Sepolia",     chainId: "0x14a34",  rpc: "https://sepolia.base.org",                   usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", gas: "ETH"  },
  { key: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", chainId: "0x66eee",  rpc: "https://sepolia-rollup.arbitrum.io/rpc",     usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", gas: "ETH"  },
  { key: "Optimism_Sepolia", label: "OP Sepolia",       chainId: "0xaa37dc", rpc: "https://sepolia.optimism.io",                usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", gas: "ETH"  },
];

export default function Send() {
  const { account, isConnected, connect, getProvider } = useWallet();
  const [chain,     setChain]     = useState("Arc_Testnet");
  const [token,     setToken]     = useState<"USDC" | "EURC">("USDC");
  const [to,        setTo]        = useState("");
  const [amount,    setAmount]    = useState("");
  const [status,    setStatus]    = useState("");
  const [sending,   setSending]   = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [txHash,    setTxHash]    = useState("");

  const src = CHAINS_SEND.find(c => c.key === chain)!;
  const amtNum = parseFloat(amount) || 0;

  async function doSend() {
    if (!account || amtNum <= 0 || !to.startsWith("0x")) return;
    setSending(true); setStatus(""); setSucceeded(false); setTxHash("");

    try {
      const eth = getProvider();
      if (!eth) throw new Error("No wallet connected");

      setStatus(`Switching to ${src.label}…`);
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: src.chainId }] });
      } catch (e: any) {
        if (e.code === 4902) {
          const sym = src.gas === "USDC" ? "USDC" : src.gas;
          await eth.request({ method: "wallet_addEthereumChain", params: [{
            chainId: src.chainId, chainName: src.label, rpcUrls: [src.rpc],
            nativeCurrency: src.gas === "USDC" ? { name:"USDC",symbol:"USDC",decimals:6 } : { name:sym,symbol:sym,decimals:18 },
          }]});
        } else throw e;
      }

      setStatus("Confirm send in MetaMask…");

      // ERC-20 transfer directly — works on all chains including Arc
      const tokenAddr = token === "USDC" ? src.usdc : (
        chain === "Arc_Testnet" ? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" :
        chain === "Ethereum_Sepolia" ? "0x08210F9170F89Ab7658F0B5E3fF39b0E03C2Af7" :
        chain === "Base_Sepolia"     ? "0x7683022d84F726a96c4A6611cd31DBf5409c0Ac" :
        chain === "Arbitrum_Sepolia" ? "0x8Fb1E3605B536a0F6b8B5B97e40b82c2e43d6EC" :
        "0x4a11590e5326138B514E08a9B52202D42077Ca65" // OP Sepolia EURC
      );
      const recipient = to.trim() as `0x${string}`;
      const amtRaw = BigInt(Math.round(amtNum * 1e6)); // 6 decimals
      // transfer(address,uint256)
      const data = "0xa9059cbb" +
        recipient.toLowerCase().replace("0x","").padStart(64,"0") +
        amtRaw.toString(16).padStart(64,"0");

      // Fetch live gas price from the source chain RPC (+20% buffer)
      const gpRes = await fetch(src.rpc, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
      }).then(r => r.json());
      const gasPrice = "0x" + Math.ceil(parseInt(gpRes.result, 16) * 1.2).toString(16);

      const hash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: tokenAddr, data, gas: "0x186a0", gasPrice }],
      });

      setStatus("Waiting for confirmation…");
      // poll receipt
      let receipt = null;
      const rpc = src.rpc;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const res = await fetch(rpc, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
        }).then(r => r.json());
        if (res.result) { receipt = res.result; break; }
      }
      if (!receipt || receipt.status === "0x0") throw new Error("Transaction failed");

      setTxHash(hash);
      setStatus(`✅ ${amount} ${token} sent to ${shortAddr(to)}!`);
      setSucceeded(true);
    } catch (e: any) {
      const msg = e?.message || "Send failed";
      setStatus(msg.includes("cancel") || msg.includes("rejected") ? "Send cancelled." : `❌ ${msg}`);
    }
    setSending(false);
  }

  return (
    <>
      <Topbar title="Send" />
      <div className="p-4 lg:p-6 flex-1 flex flex-col items-center gap-4 max-w-[520px] mx-auto w-full">

        <div className="w-full bg-surface border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <div>
              <div className="font-bold text-[14px]">Send Tokens</div>
              <div className="text-[11px] text-muted mt-0.5">Transfer USDC or EURC to any wallet on the same chain</div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-green font-medium">● Live</span>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Chain */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Network</label>
              <select value={chain} onChange={e => setChain(e.target.value)}
                className="w-full bg-bg border border-white/6 rounded-2xl px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent transition-colors cursor-pointer">
                {CHAINS_SEND.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>

            {/* Token */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Token</label>
              <div className="flex gap-2">
                {(["USDC", "EURC"] as const).map(t => (
                  <button key={t} onClick={() => setToken(t)}
                    className={`flex-1 py-2.5 rounded-2xl text-[13px] font-semibold border transition-all ${token === t ? "bg-accent/15 border-accent/40 text-accent" : "bg-bg border-white/8 text-muted hover:text-ink"}`}>
                    {t === "USDC" ? "$ USDC" : "€ EURC"}
                  </button>
                ))}
              </div>
            </div>

            {/* To */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Recipient</label>
              <input value={to} onChange={e => setTo(e.target.value)}
                placeholder="0x..."
                className="w-full bg-bg border border-white/6 rounded-2xl px-3 py-2.5 text-[13px] font-mono text-ink outline-none focus:border-accent transition-colors placeholder:text-muted" />
            </div>

            {/* Amount */}
            <div className="bg-bg rounded-xl p-4">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Amount</div>
              <div className="flex items-center gap-3">
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-[28px] font-bold text-ink outline-none placeholder:text-muted w-0" />
                <span className="text-[13px] text-muted font-medium shrink-0">{token}</span>
              </div>
            </div>

            {/* Gas warning */}
            {src.gas !== "USDC" && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber/8 border border-amber/20 text-amber text-[12px]">
                ⚠ Need {src.gas} for gas on {src.label}
              </div>
            )}

            {/* Status */}
            {status && (
              <div className={`px-3 py-2.5 rounded-xl text-[12px] leading-relaxed border ${
                status.startsWith("✅") ? "bg-green/8 text-green border-green/20" :
                status.startsWith("❌") ? "bg-red/8 text-red border-red/20" :
                "bg-surface2 text-muted border-white/8"}`}>
                {status}
                {txHash && (
                  <div className="mt-1">
                    <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer"
                      className="font-mono text-[10px] text-accent hover:underline">{txHash.slice(0,18)}…</a>
                  </div>
                )}
              </div>
            )}

            {/* CTA */}
            {!isConnected ? (
              <button onClick={connect}
                className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold hover:bg-accent/90 transition-colors">
                Connect Wallet
              </button>
            ) : (
              <button onClick={doSend}
                disabled={sending || !amount || amtNum <= 0 || !to.startsWith("0x") || to.length < 42}
                className="w-full py-3 bg-accent text-white rounded-xl text-[13.5px] font-bold disabled:opacity-40 hover:bg-accent/90 transition-colors">
                {sending ? "Sending…" : amtNum > 0 ? `Send ${amount} ${token}` : "Enter amount"}
              </button>
            )}

            {succeeded && (
              <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-muted">
                <span className="text-green">✓</span>
                <span>Tokens sent successfully via Circle App Kit</span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="w-full bg-surface border border-white/8 rounded-xl p-4 flex flex-col gap-2.5">
          <div className="text-[12px] font-semibold text-ink">How it works</div>
          {[
            ["Switch network", "MetaMask switches to selected chain"],
            ["Approve token", "Circle App Kit handles allowance"],
            ["Send & confirm", "Tokens arrive instantly on same chain"],
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
    </>
  );
}
