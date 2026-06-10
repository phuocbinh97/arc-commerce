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
    // Read from merchant session first, fall back to settings
    try {
      const session = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}");
      const settings = JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
      const name = session.name || settings.businessName || "";
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

      <div className="p-2 border-t border-white/8">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-green/8 border border-green/20">
          <span className="w-2 h-2 rounded-full bg-green shrink-0 animate-pulse" />
          <span className="text-[11.5px] text-green font-medium">Arc Testnet · Live</span>
        </div>
      </div>
    </aside>
  );
}
