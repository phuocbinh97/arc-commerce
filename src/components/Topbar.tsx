"use client";
import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useMerchantAuth } from "@/hooks/useMerchantAuth";
import { shortAddr } from "@/lib/arc";
import Link from "next/link";
import WalletModal from "@/components/WalletModal";

interface TopbarProps {
  title: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export default function Topbar({ title, action }: TopbarProps) {
  const { account, isConnected, isArcNetwork, connect, connectWithProvider, switchToArc, disconnect } = useWallet();
  const { session, login, logout, loading } = useMerchantAuth();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [hasSavedMerchant, setHasSavedMerchant] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
      setHasSavedMerchant(!!s.merchantId);
    } catch { /* ignore */ }
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
    <header className="sticky top-0 z-40 bg-surface border-b border-white/8 px-7 h-14 flex items-center justify-between gap-4">
      <span className="text-base font-semibold tracking-tight">{title}</span>
      <div className="flex items-center gap-2.5">
        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface2 border border-white/14 text-muted hover:text-ink hover:border-white/30 transition-colors text-base">
          {isDark ? "🌙" : "☀️"}
        </button>

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

        {/* Show merchant name badge when session active */}
        {session && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-full text-[12.5px] font-medium text-[#6ea8fe]">
            <span className="w-2 h-2 rounded-full bg-accent" />
            {session.name}
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
          <div className="relative">
            <button onClick={() => setShowWalletMenu(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface2 border border-white/14 rounded-full text-[12.5px] font-medium hover:border-white/30 transition-colors">
              <span className="w-2 h-2 rounded-full bg-green" />
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
                  <button onClick={() => {
                    disconnect();
                    logout();
                    setShowWalletMenu(false);
                    window.location.reload();
                  }}
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
