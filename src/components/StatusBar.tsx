"use client";
import { useEffect, useState } from "react";
import { ARC_RPC } from "@/lib/arc";

interface Stats {
  blockTime: string;
  totalBlocks: string;
  networkLoad: string;
  totalTxns: string;
  txnsToday: string;
  updated: string;
}

async function fetchStats(): Promise<Stats> {
  const rpc = (method: string, params: unknown[] = []) =>
    fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then(r => r.json()).then(r => r.result);

  const [latest, platformStats] = await Promise.all([
    rpc("eth_getBlockByNumber", ["latest", false]),
    fetch("/api/stats").then(r => r.json()).catch(() => ({ totalTxns: 0, txnsToday: 0 })),
  ]);

  const blockNum = parseInt(latest.number, 16);
  const blockBefore = await rpc("eth_getBlockByNumber", ["0x" + (blockNum - 10).toString(16), false]);
  const avgBlockTime = blockBefore
    ? ((parseInt(latest.timestamp, 16) - parseInt(blockBefore.timestamp, 16)) / 10).toFixed(2)
    : "—";

  const gasUsed = parseInt(latest.gasUsed, 16);
  const gasLimit = parseInt(latest.gasLimit, 16);
  const networkLoad = gasLimit > 0 ? Math.round((gasUsed / gasLimit) * 100) + "%" : "—";

  const fmt = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + "M"
    : n >= 1_000 ? (n / 1_000).toFixed(1) + "K"
    : String(n);

  const now = new Date();
  return {
    blockTime: avgBlockTime + "s",
    totalBlocks: fmt(blockNum),
    networkLoad,
    totalTxns: fmt(Number(platformStats.totalTxns)),
    txnsToday: String(platformStats.txnsToday),
    updated: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function StatusBar() {
  const [stats, setStats] = useState<Stats>({ blockTime: "—", totalBlocks: "—", networkLoad: "—", totalTxns: "—", txnsToday: "—", updated: "—" });

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    const id = setInterval(() => fetchStats().then(setStats).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  const Divider = () => <div className="w-px h-4 bg-white/10 shrink-0" />;

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[#7d8590]">{label}</span>
      <span className="text-[#e6edf3] font-semibold">{value}</span>
    </div>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-8 bg-[#0d1117] border-t border-white/8 flex items-center px-3 gap-3 text-[11px] font-mono select-none">

      {/* Left — Resources (always dark bar, use fixed colors) */}
      <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 text-[#7d8590] hover:text-[#e6edf3] transition-colors shrink-0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8 2 5 5.5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.5-3-7-7-7z"/><circle cx="12" cy="9" r="2"/></svg>
        Claim Faucet
      </a>
      <Divider />
      <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 text-[#7d8590] hover:text-[#e6edf3] transition-colors shrink-0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Arc Explorer
      </a>
      <Divider />
      <a href="https://x.com/phuocbinh97" target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 text-[#7d8590] hover:text-[#e6edf3] transition-colors shrink-0">
        <span className="shrink-0">Built by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://unavatar.io/x/phuocbinh97" alt="" width={16} height={16} className="rounded-full shrink-0" />
        <span className="text-[#e6edf3]">@phuocbinh97</span>
        <span className="text-[10.5px] px-2.5 py-0.5 bg-[#e6edf3] text-[#0d1117] rounded-full font-bold tracking-wide">FOLLOW</span>
      </a>

      <div className="flex-1" />

      {/* Right — Network + Stats */}
      <div className="flex items-center gap-1.5 text-green font-bold shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
        ARC TESTNET
      </div>
      <Divider />
      <Stat label="AVG BLOCK TIME" value={stats.blockTime} />
      <Divider />
      <Stat label="TOTAL BLOCKS" value={stats.totalBlocks} />
      <Divider />
      <Stat label="NETWORK LOAD" value={stats.networkLoad} />
      <Divider />
      <Stat label="TOTAL TXNS" value={stats.totalTxns} />
      <Divider />
      <Stat label="TODAY" value={stats.txnsToday} />
      <Divider />
      <span className="text-white/30 shrink-0">Updated {stats.updated}</span>
    </div>
  );
}
