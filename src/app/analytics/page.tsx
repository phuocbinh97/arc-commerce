"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { getPaymentHistory, PaymentHistory } from "@/lib/storage";
import { formatUsdc, shortAddr, decodeMemoData, ARC_RPC } from "@/lib/arc";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Filler, Legend } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Filler, Legend);

const CHART_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor:"#1c2330", borderColor:"rgba(255,255,255,0.1)", borderWidth:1, titleColor:"#7d8590", bodyColor:"#e6edf3" } },
  scales: { x: { grid:{color:"rgba(255,255,255,0.05)"}, ticks:{color:"#7d8590",font:{size:10}} }, y: { grid:{color:"rgba(255,255,255,0.05)"}, ticks:{color:"#7d8590",font:{size:10},callback:(v:any)=>v+" USDC"}, beginAtZero:true } },
};

export default function Analytics() {
  const [hist, setHist]     = useState<PaymentHistory[]>([]);
  const [range, setRange]   = useState(30);
  const [mounted, setMounted] = useState(false);
  const [memoFeed, setMemoFeed] = useState<{ txHash: string; amount: string; ts: number; memo: Record<string, unknown> | null }[]>([]);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem("arcWalletDisconnected") === "1") return;

    async function load() {
      let merchantId = JSON.parse(localStorage.getItem("arcMerchantSession") || "{}").merchantId;
      if (!merchantId) {
        const eth = (window as any).ethereum;
        const accs: string[] = eth ? await eth.request({ method: "eth_accounts" }).catch(() => []) : [];
        if (accs[0]) {
          try {
            const res = await fetch(`/api/merchants/by-wallet/${accs[0]}`);
            if (res.ok) { const { merchant } = await res.json(); merchantId = merchant?.merchantId; }
          } catch {}
        }
      }
      if (!merchantId) return;
      const data = await fetch(`/api/transactions?merchantId=${merchantId}`).then(r => r.json()).catch(() => ({}));
      if (!data.txns) return;
      const normalized = data.txns.map((t: any) => ({ ...t, merchant: t.buyerWallet || t.merchant || t.merchantWallet || "unknown" }));
      const seen = new Set<string>();
      const deduped = normalized.filter((t: any) => { if (seen.has(t.txHash)) return false; seen.add(t.txHash); return true; });
      deduped.sort((a: any, b: any) => b.ts - a.ts);
      setHist(deduped);
    }
    load();
  }, []);

  // Memo Feed: decode on-chain memoData from recent txns
  useEffect(() => {
    if (hist.length === 0) return;
    const recent = hist.slice(0, 6);
    Promise.all(recent.map(async h => {
      if (!h.txHash) return null;
      try {
        const res = await fetch(ARC_RPC, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_getTransactionByHash", params:[h.txHash] }),
        }).then(r => r.json());
        const raw = decodeMemoData(res.result?.input || "");
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw);
          return { txHash: h.txHash, amount: h.amount, ts: h.ts, memo: parsed };
        } catch { return { txHash: h.txHash, amount: h.amount, ts: h.ts, memo: null }; }
      } catch { return null; }
    })).then(results => {
      setMemoFeed(results.filter((r): r is NonNullable<typeof r> => r !== null && r.memo !== null));
    });
  }, [hist]);

  const filtered = range >= 90 ? hist : hist.filter(h => h.ts >= Date.now() - range * 86400000);
  const total = filtered.reduce((s,h) => s+(parseFloat(h.amount)||0), 0);
  const wallets = new Set(filtered.map(h=>h.merchant)).size;
  const aov = filtered.length ? total/filtered.length : 0;

  const days = range >= 90 ? 30 : range;
  const labels: string[] = [], rev: number[] = [], vol: number[] = [];
  for (let i=days-1;i>=0;i--) {
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);
    const end=d.getTime()+86400000;
    const txs=hist.filter(h=>h.ts>=d.getTime()&&h.ts<end);
    labels.push(d.toLocaleDateString("en-US",{month:"short",day:"numeric"}));
    rev.push(parseFloat(txs.reduce((s,h)=>s+(parseFloat(h.amount)||0),0).toFixed(2)));
    vol.push(txs.length);
  }

  const amounts = filtered.map(h=>parseFloat(h.amount)||0);
  const bestDay = (() => {
    const m: Record<string,number> = {};
    hist.forEach(h=>{const d=new Date(h.ts).toLocaleDateString("en-US",{month:"short",day:"numeric"});m[d]=(m[d]||0)+(parseFloat(h.amount)||0);});
    return Object.entries(m).sort((a,b)=>b[1]-a[1])[0];
  })();

  const customerMap: Record<string,{addr:string;total:number}> = {};
  filtered.forEach(h=>{const k=h.merchant||"unknown";if(!customerMap[k])customerMap[k]={addr:k,total:0};customerMap[k].total+=parseFloat(h.amount)||0;});
  const topCustomers = Object.values(customerMap).sort((a,b)=>b.total-a.total).slice(0,5);
  const maxSpend = topCustomers[0]?.total||1;

  if (!mounted) return null;

  return (
    <>
      <Topbar title="Analytics" />
      <div className="p-4 lg:p-7 flex-1">
        <div className="flex justify-end mb-5 gap-1">
          {[7,30,90].map(r=>(
            <button key={r} onClick={()=>setRange(r)} className={`px-3 py-1 rounded-md text-[12.5px] font-semibold transition-all ${range===r?"bg-surface2 text-ink border border-white/14":"text-muted hover:text-ink"}`}>
              {r>=90?"All":`${r}d`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-3.5 mb-6">
          {[["Total Revenue",formatUsdc(total),"USDC"],["Transactions",String(filtered.length),"confirmed"],["Avg Order",formatUsdc(aov),"USDC/tx"],["Unique Wallets",String(wallets),"customers"]].map(([l,v,u])=>(
            <div key={l} className="bg-surface border border-white/8 rounded-lg p-4">
              <div className="text-xs text-muted mb-2">{l}</div>
              <div className="text-2xl font-bold font-mono tracking-tight">{v}</div>
              <div className="text-xs text-muted mt-1">{u}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Revenue Trend</div>
            <div className="p-5 h-[220px]">
              <Line data={{ labels, datasets:[{data:rev,borderColor:"#0757f9",backgroundColor:"rgba(7,87,249,0.15)",borderWidth:2,pointRadius:3,tension:0.4,fill:true}] }} options={CHART_OPTS} />
            </div>
          </div>
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Daily Volume</div>
            <div className="p-5 h-[220px]">
              <Bar data={{ labels, datasets:[{data:vol,backgroundColor:"rgba(163,113,247,0.5)",borderColor:"#a371f7",borderWidth:1,borderRadius:4}] }}
                options={{...CHART_OPTS,scales:{...CHART_OPTS.scales,y:{...CHART_OPTS.scales.y,ticks:{...CHART_OPTS.scales.y.ticks,callback:(v:any)=>v+" txs"}}}}} />
            </div>
          </div>
        </div>

        {/* On-chain Memo Feed */}
        {memoFeed.length > 0 && (
          <div className="mb-4 bg-surface border border-white/8 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">On-chain Memo Feed</div>
                <div className="text-[11px] text-muted mt-0.5">Structured context attached to each payment via Arc Memo contract</div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple/10 border border-purple/20 text-purple font-medium">Arc v0.7.2</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] font-semibold text-muted uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left">Order</th>
                    <th className="px-4 py-2.5 text-left">Merchant</th>
                    <th className="px-4 py-2.5 text-left">Payer</th>
                    <th className="px-4 py-2.5 text-left">Invoice</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-right">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {memoFeed.map((m, i) => (
                    <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-surface2/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11.5px]">{(m.memo?.ord as string || "—").slice(0, 20)}</td>
                      <td className="px-4 py-3 text-muted font-mono text-[11.5px]">{(m.memo?.mid as string || "—").slice(0, 16)}</td>
                      <td className="px-4 py-3">
                        {m.memo?.n
                          ? <span className="text-ink">{m.memo.n as string}</span>
                          : <span className="text-muted/50">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {m.memo?.inv
                          ? <span className="text-purple font-mono text-[11px]">{(m.memo.inv as string).slice(0, 16)}</span>
                          : <span className="text-muted/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-green">+{formatUsdc(m.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <a href={`https://testnet.arcscan.app/tx/${m.txHash}`} target="_blank" rel="noreferrer"
                          className="font-mono text-[11px] text-accent hover:underline">{m.txHash.slice(0, 10)}…</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Top Customers by Spend</div>
            <div className="p-4">
              {topCustomers.length===0 ? <div className="text-center py-8 text-muted text-sm">No data yet</div>
              : topCustomers.map((c,i)=>(
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/8 last:border-0">
                  <div className={`w-[22px] h-[22px] rounded-md grid place-items-center text-[11px] font-bold ${i===0?"bg-amber/15 text-amber":"bg-surface2 text-muted"}`}>{i+1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-mono text-muted mb-1">{shortAddr(c.addr)}</div>
                    <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{width:`${(c.total/maxSpend*100).toFixed(1)}%`}} />
                    </div>
                  </div>
                  <div className="font-mono text-[13px] font-semibold text-green ml-2">{formatUsdc(c.total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-white/8 rounded-lg">
            <div className="px-5 py-4 border-b border-white/8 font-semibold text-sm">Business Metrics</div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 mb-5">
                {[["Best Day",bestDay?.[0]||"—",""],["Best Revenue",bestDay?formatUsdc(bestDay[1]):"0.00","USDC"],
                  ["Biggest Tx",amounts.length?Math.max(...amounts).toFixed(2):"—","USDC"],
                  ["Smallest Tx",amounts.length?Math.min(...amounts).toFixed(2):"—","USDC"]].map(([l,v,u])=>(
                  <div key={l}>
                    <div className="text-[11.5px] text-muted mb-1">{l}</div>
                    <div className="text-base font-bold font-mono">{v} {u&&<span className="text-xs text-muted font-sans">{u}</span>}</div>
                  </div>
                ))}
              </div>
              <div className="h-[120px]">
                <Doughnut data={{ labels:["<5 USDC","5-20 USDC",">20 USDC"],
                  datasets:[{data:[amounts.filter(a=>a<5).length,amounts.filter(a=>a>=5&&a<20).length,amounts.filter(a=>a>=20).length],
                    backgroundColor:["rgba(7,87,249,0.7)","rgba(163,113,247,0.7)","rgba(63,185,80,0.7)"],borderWidth:0}] }}
                  options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"right",labels:{color:"#7d8590",font:{size:11},boxWidth:10}}}}} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
