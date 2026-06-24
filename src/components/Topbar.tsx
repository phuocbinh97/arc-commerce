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
  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
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
    <header className="sticky top-0 z-40 px-4 lg:px-7 h-14 flex items-center justify-between gap-2 lg:gap-4"
      style={{ background: "var(--topbar-bg)", boxShadow: "0 1px 0 var(--border-color), 0 4px 24px rgba(0,0,0,0.3)" }}>
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink transition-colors shrink-0"
          aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="3.5" width="16" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="1" y="8.25" width="16" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="1" y="13" width="16" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>
        <span className="text-sm lg:text-base font-semibold tracking-tight truncate">{title}</span>
      </div>

      <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink transition-colors text-base"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          {isDark ? "🌙" : "☀️"}
        </button>

        {/* Action button */}
        {action && (
          action.href ? (
            <Link href={action.href}
              className="inline-flex items-center gap-1.5 px-3 lg:px-4 py-1.5 bg-accent text-white rounded-xl text-[12px] lg:text-[13px] font-semibold hover:bg-accent/90 transition-all whitespace-nowrap"
              style={{ boxShadow: "0 2px 12px rgba(7,87,249,0.3)" }}>
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-3 lg:px-4 py-1.5 bg-accent text-white rounded-xl text-[12px] lg:text-[13px] font-semibold hover:bg-accent/90 transition-all whitespace-nowrap"
              style={{ boxShadow: "0 2px 12px rgba(7,87,249,0.3)" }}>
              {action.label}
            </button>
          )
        )}

        {/* Merchant session badge */}
        {session && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium text-[#6ea8fe]"
            style={{ background: "rgba(7,87,249,0.1)", boxShadow: "0 0 0 1px rgba(7,87,249,0.2)" }}>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-muted hover:text-ink transition-colors whitespace-nowrap"
            style={{ background: "rgba(255,255,255,0.05)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
            <span className="w-2 h-2 rounded-full bg-muted shrink-0" />
            <span className="hidden sm:inline">Connect wallet</span>
            <span className="sm:hidden">Connect</span>
          </button>
        ) : !isArcNetwork ? (
          <div className="relative">
            <button onClick={() => setShowNetworkMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-amber whitespace-nowrap transition-colors"
              style={{ background: "rgba(210,153,34,0.1)", boxShadow: "0 0 0 1px rgba(210,153,34,0.25)" }}>
              <span className="hidden sm:inline">⚠ Switch to Arc</span>
              <span className="sm:hidden">⚠ Arc</span>
              <span className="text-[10px]">▾</span>
            </button>
            {showNetworkMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNetworkMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl w-48 py-1 overflow-hidden"
                  style={{ background: "#111520", boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)" }}>
                  <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="text-[11px] text-muted">Wrong network</div>
                    <div className="text-[12px] text-amber font-medium">Arc Testnet required</div>
                  </div>
                  <button onClick={async () => {
                    setShowNetworkMenu(false);
                    try { await switchToArc(); }
                    catch { setShowManualAdd(true); }
                  }} className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-white/5 transition-colors">
                    ⚡ Try switch to Arc
                  </button>
                  <button onClick={() => { setShowNetworkMenu(false); disconnect(); logout(); window.location.reload(); }}
                    className="w-full text-left px-3 py-2 text-[13px] text-red hover:bg-red/8 transition-colors">
                    Disconnect wallet
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="relative">
            <button onClick={() => setShowWalletMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium hover:opacity-80 transition-opacity"
              style={{ background: "rgba(255,255,255,0.05)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
              <span className="w-2 h-2 rounded-full bg-green shrink-0" />
              {shortAddr(account)}
              <span className="text-muted text-[10px]">▾</span>
            </button>
            {showWalletMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowWalletMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl w-44 py-1 overflow-hidden"
                  style={{ background: "#111520", boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)" }}>
                  <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
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

      {/* Manual add Arc Testnet modal */}
      {showManualAdd && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowManualAdd(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[420px] rounded-2xl overflow-hidden"
            style={{ background: "#111520", boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <div className="font-bold text-[15px] text-white">Add Arc Testnet Manually</div>
                <div className="text-[12px] text-muted mt-0.5">Your wallet blocked auto-add — copy these settings</div>
              </div>
              <button onClick={() => setShowManualAdd(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-2.5">
              {[
                { label: "Network Name",    value: "Arc Testnet" },
                { label: "RPC URL",         value: "https://rpc.testnet.arc.network" },
                { label: "Chain ID",        value: "5042002" },
                { label: "Currency Symbol", value: "USDC" },
                { label: "Block Explorer",  value: "https://testnet.arcscan.app" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "#090d12", boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
                  <span className="text-[11.5px] text-muted shrink-0">{label}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[12px] text-ink truncate">{value}</span>
                    <button onClick={() => navigator.clipboard.writeText(value)}
                      className="text-[10px] text-muted hover:text-ink shrink-0 transition-colors">Copy</button>
                  </div>
                </div>
              ))}
              <p className="text-[11.5px] text-muted text-center mt-1">
                In your wallet: Settings → Networks → Add custom network → paste above
              </p>
              <p className="text-[11.5px] text-red/80 text-center">
                Note: Ronin Wallet only supports Ronin chain and cannot connect to Arc Testnet.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
