"use client";
import { useState, useRef, useEffect } from "react";
import { getPaymentHistory, getInvoices } from "@/lib/storage";
import { formatUsdc } from "@/lib/arc";

interface Message { role: "user" | "assistant"; content: string; }

export default function AIWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function buildContext() {
    const hist = getPaymentHistory();
    const invs = getInvoices();
    const total = hist.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
    const today = hist.filter(h => h.ts > Date.now() - 86400000);
    const todayTotal = today.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
    const paid = invs.filter(i => i.status === "paid").length;
    const pending = invs.filter(i => i.status === "pending").length;
    return `You are an AI assistant for Nexmer, a USDC payment platform on Arc Testnet.
Merchant data:
- Total revenue: ${formatUsdc(total)} USDC
- Today's revenue: ${formatUsdc(todayTotal)} USDC (${today.length} transactions)
- Total transactions: ${hist.length}
- Invoices: ${invs.length} total, ${paid} paid, ${pending} pending
Answer concisely in 1-2 sentences. Be helpful and specific with numbers.`;
  }

  async function send() {
    const q = input.trim(); if (!q || loading) return;
    setInput("");
    const newMsgs: Message[] = [...messages, { role: "user", content: q }];
    setMessages(newMsgs); setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          system: buildContext(),
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, no response.";
      setMessages([...newMsgs, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...newMsgs, { role: "assistant", content: "Error connecting to AI." }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2.5">
      {open && (
        <div className="w-[340px] bg-surface border border-white/14 rounded-xl overflow-hidden shadow-2xl">
          <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">✦</span>
              <span className="font-semibold text-sm">AI Assistant</span>
              <span className="text-[10px] bg-purple/15 text-purple px-2 py-0.5 rounded-full font-semibold">Claude</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-ink text-lg leading-none">×</button>
          </div>

          <div className="h-72 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <div className="bg-surface2 rounded-lg p-3 text-[13px] text-muted">
                Hi! Ask me about your payments, revenue, or invoices.<br/>
                <span className="text-ink cursor-pointer" onClick={() => { setInput("What is my total revenue?"); }}>→ "What is my total revenue?"</span><br/>
                <span className="text-ink cursor-pointer" onClick={() => { setInput("How many transactions today?"); }}>→ "How many transactions today?"</span>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-[13px] max-w-[90%] ${
                m.role === "user" ? "self-end bg-accent text-white" : "self-start bg-surface2"
              }`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="self-start bg-surface2 rounded-lg px-3 py-2 text-[13px] text-muted">Thinking…</div>}
            <div ref={endRef} />
          </div>

          <div className="px-3 py-2.5 border-t border-white/8 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about your payments…"
              className="flex-1 bg-surface2 border border-white/14 rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-accent transition-colors" />
            <button onClick={send} disabled={loading}
              className="bg-accent text-white rounded-lg px-3 py-2 text-[13px] font-semibold disabled:opacity-50">↑</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)}
        className="w-12 h-12 bg-accent rounded-full grid place-items-center text-white text-xl shadow-lg shadow-accent/40 hover:scale-105 transition-transform">
        ✦
      </button>
    </div>
  );
}
