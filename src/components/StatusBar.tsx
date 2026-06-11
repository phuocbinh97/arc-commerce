"use client";
import { useEffect, useState } from "react";
import { ARC_RPC } from "@/lib/arc";

interface Stats {
  blockTime: string;
  totalBlocks: string;
  updated: string;
}

async function fetchStats(): Promise<Stats> {
  const rpc = (method: string, params: unknown[] = []) =>
    fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then(r => r.json()).then(r => r.result);

  const [latest, prev] = await Promise.all([
    rpc("eth_getBlockByNumber", ["latest", false]),
    rpc("eth_getBlockByNumber", ["latest", false]),
  ]);

  const blockNum = parseInt(latest.number, 16);
  const blockBefore = await rpc("eth_getBlockByNumber", ["0x" + (blockNum - 10).toString(16), false]);
  const avgBlockTime = blockBefore
    ? ((parseInt(latest.timestamp, 16) - parseInt(blockBefore.timestamp, 16)) / 10).toFixed(2)
    : "—";

  const fmt = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + "M"
    : n >= 1_000 ? (n / 1_000).toFixed(1) + "K"
    : String(n);

  const now = new Date();
  return {
    blockTime: avgBlockTime + "s",
    totalBlocks: fmt(blockNum),
    updated: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function StatusBar() {
  const [stats, setStats] = useState<Stats>({ blockTime: "—", totalBlocks: "—", updated: "—" });

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    const id = setInterval(() => fetchStats().then(setStats).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-9 bg-[#0d1117] border-t border-white/8 flex items-center px-4 gap-6 text-[11.5px] font-mono select-none">
      {/* Network indicator */}
      <div className="flex items-center gap-1.5 text-green font-semibold shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
        ARC TESTNET
      </div>

      <div className="w-px h-4 bg-white/10" />

      {/* Stats */}
      <div className="flex items-center gap-5 text-muted overflow-x-auto">
        <span><span className="text-ink font-semibold">AVG BLOCK TIME</span> {stats.blockTime}</span>
        <span><span className="text-ink font-semibold">TOTAL BLOCKS</span> {stats.totalBlocks}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Links */}
      <div className="flex items-center gap-4 shrink-0 text-muted">
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
          className="hover:text-ink transition-colors">Claim Faucet ↗</a>
        <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer"
          className="hover:text-ink transition-colors">Arc Explorer ↗</a>
        <div className="w-px h-4 bg-white/10" />
        <span className="text-muted">Built by</span>
        <a href="https://x.com/phuocbinh97" target="_blank" rel="noreferrer"
          className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded text-ink hover:bg-white/10 transition-colors font-semibold">
          @phuocbinh97
        </a>
        <span className="text-white/20">· Updated {stats.updated}</span>
      </div>
    </div>
  );
}
