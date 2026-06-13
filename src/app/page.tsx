"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // If already registered, go to dashboard
    const settings = JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
    if (settings.merchantId) {
      router.replace("/dashboard");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-white/8 px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent rounded-lg grid place-items-center font-bold text-white text-sm">A</div>
          <span className="font-bold text-[15px]">Nexmer</span>
        </div>
        <Link href="/dashboard" className="text-[13px] text-muted hover:text-ink">Already registered? →</Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full text-[12.5px] text-[#6ea8fe] mb-6">
          ⚡ Powered by Arc Testnet · Circle USDC
        </div>
        <h1 className="text-5xl font-black tracking-tight mb-4 max-w-2xl">
          Accept USDC payments<br />
          <span className="text-accent">on any website</span>
        </h1>
        <p className="text-muted text-lg max-w-xl mb-8">
          Nexmer is a Stripe-like payment platform on Arc Testnet.
          Register your shop, embed a widget, and receive USDC directly to your wallet — no middleman.
        </p>

        <div className="flex gap-3 mb-16">
          <Link href="/settings"
            className="px-6 py-3 bg-accent text-white rounded-xl font-semibold text-[15px] hover:bg-accent/90 transition-colors">
            Get Started Free →
          </Link>
          <Link href="/dashboard"
            className="px-6 py-3 bg-surface border border-white/14 text-ink rounded-xl font-semibold text-[15px] hover:bg-surface2 transition-colors">
            View Dashboard
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 max-w-3xl w-full mb-16">
          {[
            { icon: "⚡", title: "Instant Finality", desc: "Arc Testnet confirms in < 1 second. No waiting, no uncertainty." },
            { icon: "🔗", title: "Embed Anywhere", desc: "One <script> tag. Your customers pay without leaving your site." },
            { icon: "💸", title: "Direct to Wallet", desc: "Payments go straight to your wallet. No platform fees, no holds." },
          ].map(f => (
            <div key={f.title} className="bg-surface border border-white/8 rounded-xl p-5 text-left">
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="font-semibold text-[14px] mb-1">{f.title}</div>
              <div className="text-muted text-[13px]">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="max-w-2xl w-full text-left">
          <h2 className="font-bold text-xl text-center mb-6">How it works</h2>
          <div className="flex flex-col gap-3">
            {[
              { n: "1", t: "Register your shop", d: "Connect MetaMask, enter your shop name and wallet address → get a Merchant ID." },
              { n: "2", t: "Copy the embed snippet", d: "Paste one <script> tag into your website. Customize amount and order ID dynamically." },
              { n: "3", t: "Receive payments", d: "Customers pay with USDC via MetaMask. Funds arrive in your wallet instantly." },
              { n: "4", t: "Track everything", d: "Overview, Analytics, Invoices and Customers — all in one dashboard." },
            ].map(s => (
              <div key={s.n} className="flex gap-4 p-4 bg-surface border border-white/8 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-accent/15 text-accent grid place-items-center text-sm font-bold shrink-0">{s.n}</div>
                <div>
                  <div className="font-semibold text-[14px]">{s.t}</div>
                  <div className="text-muted text-[13px] mt-0.5">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/settings"
              className="inline-block px-8 py-3 bg-accent text-white rounded-xl font-semibold text-[15px] hover:bg-accent/90 transition-colors">
              Register Your Shop →
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/8 px-8 py-4 text-center text-[12px] text-muted">
        Nexmer · Built on Arc Testnet · USDC by Circle
      </footer>
    </div>
  );
}
