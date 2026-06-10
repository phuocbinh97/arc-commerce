"use client";
import { useWallet } from "@/hooks/useWallet";
import { useMerchantAuth } from "@/hooks/useMerchantAuth";
import { shortAddr } from "@/lib/arc";
import Link from "next/link";

interface TopbarProps {
  title: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export default function Topbar({ title, action }: TopbarProps) {
  const { account, isConnected, isArcNetwork, connect, switchToArc } = useWallet();
  const { session, login, logout, loading } = useMerchantAuth();

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-white/8 px-7 h-14 flex items-center justify-between gap-4">
      <span className="text-base font-semibold tracking-tight">{title}</span>
      <div className="flex items-center gap-2.5">
        {action && (
          action.href ? (
            <Link href={action.href}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-white rounded-lg text-[13px] font-semibold hover:bg-accent/90 transition-colors">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-white rounded-lg text-[13px] font-semibold hover:bg-accent/90 transition-colors">
              {action.label}
            </button>
          )
        )}

        {/* Merchant session badge */}
        {session ? (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-full text-[12.5px] font-medium text-[#6ea8fe]">
              <span className="w-2 h-2 rounded-full bg-accent" />
              {session.name}
            </div>
            <button onClick={logout}
              className="px-2.5 py-1.5 bg-surface2 border border-white/14 rounded-full text-[11.5px] text-muted hover:text-ink transition-colors">
              Logout
            </button>
          </div>
        ) : (
          <button onClick={login} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface2 border border-white/14 rounded-full text-[12.5px] font-medium hover:border-accent transition-colors disabled:opacity-50">
            🔑 {loading ? "Signing…" : "Merchant Login"}
          </button>
        )}

        {/* Wallet status */}
        {!isConnected ? (
          <button onClick={connect}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface2 border border-white/14 rounded-full text-[12.5px] font-medium hover:border-accent transition-colors">
            <span className="w-2 h-2 rounded-full bg-muted" />
            Connect wallet
          </button>
        ) : !isArcNetwork ? (
          <button onClick={switchToArc}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber/10 border border-amber/30 rounded-full text-[12.5px] font-medium text-amber hover:bg-amber/20 transition-colors">
            ⚠ Switch to Arc
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface2 border border-white/14 rounded-full text-[12.5px] font-medium">
            <span className="w-2 h-2 rounded-full bg-green" />
            {shortAddr(account)}
          </div>
        )}
      </div>
    </header>
  );
}
