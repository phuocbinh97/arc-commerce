"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard",  icon: "▦", label: "Overview",    section: "Main" },
  { href: "/invoices",   icon: "◧", label: "Invoices",    section: "Main" },
  { href: "/checkout",   icon: "⊕", label: "Checkout",    section: "Main" },
  { href: "/shop",       icon: "⊟", label: "Demo Shop",   section: "Main" },
  { href: "/treasury",   icon: "◈", label: "Treasury",    section: "Finance" },
  { href: "/analytics",  icon: "◉", label: "Analytics",   section: "Finance" },
  { href: "/bridge",     icon: "⇄", label: "Bridge",      section: "Finance" },
  { href: "/customers",  icon: "◎", label: "Customers",   section: "Other" },
  { href: "/settings",   icon: "⊙", label: "Settings",    section: "Other" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [shopName, setShopName] = useState("");
  const [initial, setInitial] = useState("A");
  let lastSection = "";

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}");
      const name = session.name || "";
      setShopName(name);
      setInitial((name.charAt(0) || "A").toUpperCase());
    } catch { /* ignore */ }
  }, []);

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[220px] bg-surface border-r border-white/8 flex flex-col z-50">
      <div className="px-[18px] py-5 border-b border-white/8 flex items-center gap-3">
        <div className="w-8 h-8 bg-accent rounded-lg grid place-items-center font-bold text-[15px] text-white shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[15px] tracking-tight truncate">
            {shopName || "Arc Commerce"}
          </div>
          <div className="text-[11px] text-muted">Merchant Dashboard</div>
        </div>
      </div>

      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const showSection = item.section !== lastSection;
          lastSection = item.section;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <div key={item.href}>
              {showSection && (
                <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.8px] px-2.5 pt-3 pb-1">
                  {item.section}
                </div>
              )}
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all
                  ${active ? "bg-accent/15 text-[#6ea8fe]" : "text-muted hover:bg-surface2 hover:text-ink"}`}
              >
                <span className="text-base w-[18px] text-center shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Resources */}
      <div className="px-4 pt-3 pb-2 border-t border-white/8">
        <div className="text-[10.5px] font-semibold text-muted uppercase tracking-[0.9px] mb-1.5">Resources</div>

        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
          className="flex items-center justify-between py-2 text-[13px] text-muted hover:text-ink transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-[28px] h-[28px] rounded-lg bg-[#0757f9]/15 grid place-items-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0757f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8 2 5 5.5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.5-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            </div>
            <span className="font-medium">Claim Faucet</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 group-hover:opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>

        <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer"
          className="flex items-center justify-between py-2 text-[13px] text-muted hover:text-ink transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-[28px] h-[28px] rounded-lg bg-[#0757f9]/15 grid place-items-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0757f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <span className="font-medium">Arc Explorer</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 group-hover:opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>

        <a href="https://x.com/phuocbinh97" target="_blank" rel="noreferrer"
          className="flex items-center justify-between py-2 text-[13px] text-muted hover:text-ink transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://unavatar.io/x/phuocbinh97" alt="avatar" width={28} height={28} className="rounded-full shrink-0" />
            <span className="font-medium truncate">Built By @phuocbinh97</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-[#1c1c1e] border border-white/20 text-ink rounded font-bold ml-2 shrink-0">FOLLOW</span>
        </a>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-green/8 border border-green/20">
          <span className="w-2 h-2 rounded-full bg-green shrink-0 animate-pulse" />
          <span className="text-[11.5px] text-green font-medium">Arc Testnet · Live</span>
        </div>
      </div>
    </aside>
  );
}
