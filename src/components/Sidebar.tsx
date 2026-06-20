"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSidebar } from "@/components/SidebarContext";

const NAV = [
  { href: "/dashboard",        icon: "▦", label: "Overview",         section: "Merchant" },
  { href: "/checkout",         icon: "⊕", label: "Accept Payment",   section: "Merchant" },
  { href: "/invoices",         icon: "◧", label: "Invoices",         section: "Merchant" },
  { href: "/customers",        icon: "◎", label: "Customers",        section: "Merchant" },
  { href: "/analytics",        icon: "◉", label: "Analytics",        section: "Analytics" },
  { href: "/bridge",           icon: "⇄", label: "Bridge",           section: "Tools" },
  { href: "/send",             icon: "↗", label: "Send",             section: "Tools" },
  { href: "/treasury",         icon: "◈", label: "Treasury",         section: "Tools" },
  { href: "/unified-balance",  icon: "⬡", label: "Unified Balance",  section: "Tools" },
  { href: "/settings",         icon: "⊙", label: "Settings",         section: "Other" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();
  const [shopName, setShopName] = useState("");
  let lastSection = "";

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}");
      setShopName(session.name || "");
    } catch { /* ignore */ }
  }, []);

  return (
    <aside className={`
      fixed top-0 left-0 bottom-0 w-[220px] bg-surface border-r border-white/8
      flex flex-col z-50 transition-transform duration-300 ease-in-out
      lg:translate-x-0
      ${open ? "translate-x-0" : "-translate-x-full"}
    `}>
      {/* Logo */}
      <div className="px-[18px] py-4 border-b border-white/8 flex items-center justify-between">
        <div>
          <div className="flex items-end gap-0">
            <span className="text-[22px] font-black tracking-tight text-ink leading-none">Nex</span>
            <span className="text-[22px] font-black tracking-tight text-accent leading-none">mer</span>
          </div>
          <div className="text-[9px] font-bold tracking-[0.18em] text-muted uppercase mt-0.5">On-Chain Checkout</div>
        </div>
        {/* Close button — mobile only */}
        <button onClick={close}
          className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors text-lg">
          ✕
        </button>
      </div>

      {/* Nav */}
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
              <Link href={item.href} onClick={close}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all
                  ${active ? "bg-accent/15 text-[#6ea8fe]" : "text-muted hover:bg-surface2 hover:text-ink"}`}>
                <span className="text-base w-[18px] text-center shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-2 border-t border-white/8">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-green/8 border border-green/20">
          <span className="w-2 h-2 rounded-full bg-green shrink-0 animate-pulse" />
          <span className="text-[11.5px] text-green font-medium">Arc Testnet · Live</span>
        </div>
      </div>
    </aside>
  );
}
