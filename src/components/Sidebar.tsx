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
  { href: "/recurring",        icon: "↻", label: "Recurring",        section: "Tools" },
  { href: "/treasury",         icon: "◈", label: "Treasury",         section: "Tools" },
  { href: "/unified-balance",  icon: "⬡", label: "Unified Balance",  section: "Tools" },
  { href: "/settings",         icon: "⊙", label: "Settings",         section: "Other" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();
  const [shopName, setShopName] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [copied, setCopied] = useState(false);
  let lastSection = "";

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}");
      setShopName(session.name || "");
      setMerchantId(session.merchantId || "mer_xxxxxxx");
    } catch { /* ignore */ }
  }, []);

  const embedCode = `<!-- Nexmer Payment Button -->
<script src="https://nexmer.xyz/widget.js"
  data-merchant="${merchantId}"
  data-amount="10.00"
  data-order="ORDER_123"
  data-redirect="https://yoursite.com/success">
</script>`;

  const paymentLink = `https://nexmer.xyz/checkout?merchant=${merchantId}&amount=10.00&order=ORDER_123`;

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <aside className={`
        fixed top-0 left-0 bottom-0 w-[220px] bg-[#0d1018]
        flex flex-col z-50 transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}
      `} style={{ boxShadow: "4px 0 32px rgba(0,0,0,0.6)" }}>

        {/* Logo */}
        <div className="px-[18px] py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div>
            <div className="flex items-end gap-0">
              <span className="text-[22px] font-black tracking-tight text-ink leading-none">Nex</span>
              <span className="text-[22px] font-black tracking-tight text-accent leading-none">mer</span>
            </div>
            <div className="text-[9px] font-bold tracking-[0.18em] text-muted uppercase mt-0.5">On-Chain Checkout</div>
          </div>
          <button onClick={close}
            className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink transition-colors text-lg">
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
                  <div className="text-[10px] font-semibold text-muted/60 uppercase tracking-[0.8px] px-2.5 pt-3 pb-1">
                    {item.section}
                  </div>
                )}
                <Link href={item.href} onClick={close}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] font-medium transition-all
                    ${active
                      ? "bg-accent/15 text-[#6ea8fe] shadow-[0_0_12px_rgba(7,87,249,0.15)]"
                      : "text-muted hover:text-ink hover:bg-white/5"
                    }`}>
                  <span className="text-base w-[18px] text-center shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              </div>
            );
          })}

          {/* Demo Shop dropdown */}
          <div className="mt-1">
            <div className="text-[10px] font-semibold text-muted/60 uppercase tracking-[0.8px] px-2.5 pt-3 pb-1">
              Demo
            </div>
            <button onClick={() => setDemoOpen(v => !v)}
              className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] font-medium text-muted hover:bg-white/5 hover:text-ink transition-all">
              <div className="flex items-center gap-2.5">
                <span className="text-base w-[18px] text-center shrink-0">🏪</span>
                Demo Shop
              </div>
              <span className={`text-[10px] transition-transform duration-200 ${demoOpen ? "rotate-180" : ""}`}>▾</span>
            </button>

            {demoOpen && (
              <div className="ml-[26px] flex flex-col gap-0.5 mt-0.5">
                <button
                  onClick={() => setShowEmbed(true)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12.5px] text-muted hover:bg-white/5 hover:text-ink transition-all text-left">
                  <span className="text-[11px]">{"</>"}</span>
                  Embed Code
                </button>
                <Link href="/shop" onClick={close}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12.5px] text-muted hover:bg-white/5 hover:text-ink transition-all">
                  <span className="text-[11px]">↗</span>
                  Visit Shop
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* Status */}
        <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "rgba(63,185,80,0.08)", boxShadow: "0 0 0 1px rgba(63,185,80,0.15)" }}>
            <span className="w-2 h-2 rounded-full bg-green shrink-0 animate-pulse" />
            <span className="text-[11.5px] text-green font-medium">Arc Testnet · Live</span>
          </div>
        </div>
      </aside>

      {/* Embed Code Modal */}
      {showEmbed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowEmbed(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[520px] rounded-2xl overflow-hidden"
            style={{ background: "#111520", boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}>

            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <div className="font-bold text-[14px]">Embed Payment Button</div>
                <div className="text-[11px] text-muted mt-0.5">Add one-line checkout to any website</div>
              </div>
              <button onClick={() => setShowEmbed(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink transition-colors">
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Widget Script</div>
                <div className="relative">
                  <pre className="rounded-xl p-3.5 text-[11px] font-mono text-ink leading-relaxed overflow-x-auto whitespace-pre-wrap break-all"
                    style={{ background: "#090d12", boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
{embedCode}
                  </pre>
                  <button onClick={copyEmbed}
                    className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-ink transition-colors"
                    style={{ background: "#181e2e", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Or Direct Payment Link</div>
                <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                  style={{ background: "#090d12", boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
                  <span className="text-[11px] font-mono text-accent truncate flex-1">{paymentLink}</span>
                  <button onClick={() => navigator.clipboard.writeText(paymentLink)}
                    className="text-[11px] text-muted hover:text-ink transition-colors shrink-0">
                    Copy
                  </button>
                </div>
              </div>

              <Link href="/shop" onClick={() => { setShowEmbed(false); close(); }}
                className="w-full py-2.5 bg-accent text-white rounded-xl text-[13px] font-bold hover:bg-accent/90 transition-colors text-center">
                Open Demo Shop →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
