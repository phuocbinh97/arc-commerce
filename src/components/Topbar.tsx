"use client";
import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useMerchantAuth } from "@/hooks/useMerchantAuth";
import { shortAddr } from "@/lib/arc";
import Link from "next/link";
import WalletModal from "@/components/WalletModal";
import { useSidebar } from "@/components/SidebarContext";

interface TopbarProps {
  title: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export default function Topbar({ title, action }: TopbarProps) {
  const { account, isConnected, isArcNetwork, connect, connectWithProvider, switchToArc, disconnect } = useWallet();
  const { session, login, logout, loading } = useMerchantAuth();
  const { toggle } = useSidebar();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (localStorage.getItem("arcTheme") === "light") {
      document.documentElement.classList.add("light");
      setIsDark(false);
    }
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("arcTheme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("arcTheme", "light");
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-white/8 px-4 lg:px-7 h-14 flex items-center justify-between gap-2 lg:gap-4">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button onClick={toggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors shrink-0"
          aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="3.5" width="16" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="1" y="8.25" width="16" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="1" y="13" width="16" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>
        <span className="text-sm lg:text-base font-semibold tracking-tight truncate">{title}</span>
      </div>

      <div className="flex items-center gap-1.5 lg:gap-2.5 shrink-0">
        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface2 border border-white/14 text-muted hover:text-ink hover:border-white/30 transition-colors text-base">
          {isDark ? "🌙" : "☀️"}
        </button>

        {/* Action button */}
        {action && (
          action.href ? (
            <Link href={action.href}
              className="inline-flex items-center gap-1.5 px-2.5 lg:px-3.5 py-1.5 bg-accent text-white rounded-lg text-[12px] lg:text-[13px] font-semibold hover:bg-accent/90 transition-colors whitespace-nowrap">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-2.5 lg:px-3.5 py-1.5 bg-accent text-white rounded-lg text-[12px] lg:text-[13px] font-semibold hover:bg-accent/90 transition-colors whitespace-nowrap">
              {action.label}
            </button>
          )
        )}

        {/* Merchant session badge — hide on small mobile */}
        {session && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-full text-[12px] font-medium text-[#6ea8fe]">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="max-w-[80px] truncate">{session.name}</span>
          </div>
        )}

        {/* Wallet modal */}
        {showWalletModal && (
          <WalletModal
            onConnect={(provider, addr, name) => { setShowWalletModal(false); connectWithProvider(provider, addr, name); }}
            onClose={() => setShowWalletModal(false)}
          />
        )}

        {/* Wallet status */}
        {!isConnected ? (
          <button onClick={() => setShowWalletModal(true)}
            className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 bg-surface2 border border-white/14 rounded-full text-[11.5px] lg:text-[12.5px] font-medium hover:border-accent transition-colors whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-muted shrink-0" />
            <span className="hidden sm:inline">Connect wallet</span>
            <span className="sm:hidden">Connect</span>
          </button>
        ) : !isArcNetwork ? (
          <button onClick={switchToArc}
            className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 bg-amber/10 border border-amber/30 rounded-full text-[11.5px] lg:text-[12.5px] font-medium text-amber hover:bg-amber/20 transition-colors whitespace-nowrap">
            <span className="hidden sm:inline">⚠ Switch to Arc</span>
            <span className="sm:hidden">⚠ Arc</span>
          </button>
        ) : (
          <div className="relative">
            <button onClick={() => setShowWalletMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 bg-surface2 border border-white/14 rounded-full text-[11.5px] lg:text-[12.5px] font-medium hover:border-white/30 transition-colors">
              <span className="w-2 h-2 rounded-full bg-green shrink-0" />
              {shortAddr(account)}
              <span className="text-muted text-[10px]">▾</span>
            </button>
            {showWalletMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowWalletMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-surface border border-white/14 rounded-lg shadow-xl w-44 py-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/8">
                    <div className="text-[11px] text-muted">Connected wallet</div>
                    <div className="font-mono text-[12px] text-ink truncate">{shortAddr(account)}</div>
                  </div>
                  <button onClick={() => { disconnect(); logout(); setShowWalletMenu(false); window.location.reload(); }}
                    className="w-full text-left px-3 py-2 text-[13px] text-red hover:bg-red/8 transition-colors">
                    Disconnect wallet
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
