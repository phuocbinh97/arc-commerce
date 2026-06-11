"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSettings } from "@/lib/storage";

const PRODUCTS = [
  { id:"w1", cat:"Wood",    emoji:"🪵", tag:"new",  name:"Walnut Tray",          desc:"Solid walnut serving tray, natural oil finish. Food-safe.", price:4.50 },
  { id:"w2", cat:"Wood",    emoji:"🍽️", tag:"",     name:"Teak Wood Bowl",       desc:"Imported teak wood bowl — food-safe, beautiful grain.",    price:3.00 },
  { id:"b1", cat:"Rattan",  emoji:"🧺", tag:"sale", name:"Hand-Woven Basket",    desc:"Handwoven rattan basket, traditional patterns.",           price:2.50 },
  { id:"b2", cat:"Rattan",  emoji:"🪣", tag:"",     name:"Storage Box",          desc:"Bamboo composite box with lid.",                           price:5.00 },
  { id:"c1", cat:"Ceramic", emoji:"🏺", tag:"new",  name:"Artisan Ceramic Vase", desc:"Hand-thrown ceramic vase with natural ash glaze.",         price:3.50 },
  { id:"c2", cat:"Ceramic", emoji:"☕", tag:"",     name:"Tea Cup Set",          desc:"Set of 4 cups, jade glaze.",                               price:4.00 },
  { id:"d1", cat:"Decor",   emoji:"🪔", tag:"",     name:"Wooden Candle Holder", desc:"Hand-carved wood candle holder.",                          price:2.00 },
  { id:"d2", cat:"Decor",   emoji:"🌿", tag:"new",  name:"Bamboo Photo Frame",   desc:"Natural bamboo frame, A4 size.",                           price:1.50 },
];

interface CartItem { id: string; emoji: string; name: string; price: number; uid: number; }

export default function Shop() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catFilter, setCatFilter] = useState("All");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("order_success") === "1") {
      setSuccess(true); setCart([]);
      setTimeout(() => setSuccess(false), 5000);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const cats = ["All", ...Array.from(new Set(PRODUCTS.map(p=>p.cat)))];
  const filtered = catFilter === "All" ? PRODUCTS : PRODUCTS.filter(p=>p.cat===catFilter);
  const total = cart.reduce((s,i)=>s+i.price, 0);

  function addToCart(p: typeof PRODUCTS[0]) {
    setCart(c => [...c, { id:p.id, emoji:p.emoji, name:p.name, price:p.price, uid:Date.now()+Math.random() }]);
    setDrawerOpen(true);
  }
  function remove(uid: number) { setCart(c => c.filter(i=>i.uid!==uid)); }

  function checkout() {
    if (!cart.length) return;
    const settings = getSettings();
    const orderId = "moc-" + Date.now();
    const memo = cart.map(i=>i.name).join(", ");
    const returnUrl = window.location.href + "?order_success=1";
    const url = new URL("/checkout", window.location.origin);
    url.searchParams.set("amount", total.toFixed(2));
    url.searchParams.set("order", orderId);
    url.searchParams.set("memo", memo);
    url.searchParams.set("merchantName", "Moc Craft");
    url.searchParams.set("merchant", "mer_fd28ie0");
    url.searchParams.set("redirect", returnUrl);
    router.push(url.pathname + url.search);
  }

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1c1410] font-sans">
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-50 border border-green-300 text-green-800 px-6 py-3 rounded-xl font-semibold text-sm shadow-lg">
          ✅ Payment confirmed! Thank you for your order.
        </div>
      )}

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-[#faf8f4]/90 backdrop-blur border-b border-[#e8e0d4]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="font-serif font-bold text-xl">Moc<span className="text-[#c45c2a]">.</span></div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 rounded-full text-[12px] font-semibold text-blue-700">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Arc Testnet
            </div>
            <button onClick={()=>setDrawerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1c1410] text-white rounded-full text-[13px] font-semibold">
              🛒 Cart <span className="w-5 h-5 bg-[#c45c2a] rounded-full grid place-items-center text-[11px] font-bold">{cart.length}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-2 gap-12 items-center mb-16">
          <div>
            <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight mb-4">Handcrafted<br /><em className="text-[#c45c2a]">with care</em><br />from nature</h1>
            <p className="text-[#8a7968] text-base mb-3">Artisan goods from wood, rattan, and ceramic.</p>
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-[13px] font-medium text-blue-700 mb-5">⚡ Pay with USDC on Arc Testnet</div>
            <div className="flex gap-2">
              <div className="text-[13px] text-[#8a7968]">⚡ Sub-second finality</div>
              <div className="text-[13px] text-[#8a7968]">· 💵 No ETH needed</div>
              <div className="text-[13px] text-[#8a7968]">· 🔗 On-chain receipt</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["🪵","🧺","🪴"].map((e,i)=>(
              <div key={i} className={`bg-gradient-to-br from-[#f0e8df] to-[#e8ddd2] rounded-xl flex items-center justify-center text-5xl ${i===0?"row-span-2":"aspect-square"}`} style={{minHeight:i===0?"200px":"auto"}}>
                {e}
              </div>
            ))}
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {cats.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${catFilter===c?"bg-[#1c1410] text-white border-[#1c1410]":"bg-white text-[#8a7968] border-[#e8e0d4] hover:border-[#1c1410]"}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Products */}
        <div className="grid grid-cols-4 gap-5">
          {filtered.map(p=>(
            <div key={p.id} className="bg-white border border-[#e8e0d4] rounded-xl overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer">
              <div className="aspect-square bg-gradient-to-br from-[#f0ebe4] to-[#e8e0d5] flex items-center justify-center text-6xl relative">
                {p.emoji}
                {p.tag && <span className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded text-white ${p.tag==="new"?"bg-[#c45c2a]":"bg-[#3a6b45]"}`}>{p.tag==="new"?"New":"Sale"}</span>}
              </div>
              <div className="p-4">
                <div className="text-[11px] font-bold text-[#8a7968] uppercase tracking-wider mb-1">{p.cat}</div>
                <div className="font-serif font-semibold text-base mb-1.5">{p.name}</div>
                <p className="text-[#8a7968] text-[12.5px] mb-3 leading-relaxed">{p.desc}</p>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold">{p.price.toFixed(2)} <span className="text-[12px] text-[#8a7968] font-normal">USDC</span></div>
                  <button onClick={()=>addToCart(p)}
                    className="px-3 py-1.5 bg-[#c45c2a] text-white rounded-lg text-[13px] font-semibold hover:bg-[#a84d22]">
                    Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Drawer */}
      {drawerOpen && <div className="fixed inset-0 bg-black/50 z-50" onClick={()=>setDrawerOpen(false)} />}
      <div className={`fixed top-0 right-0 bottom-0 w-[400px] bg-white z-50 flex flex-col shadow-2xl transition-transform ${drawerOpen?"translate-x-0":"translate-x-full"}`}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="font-serif font-bold text-lg">Your Cart</div>
          <button onClick={()=>setDrawerOpen(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {cart.length===0 ? (
            <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🛒</div><p>Your cart is empty</p></div>
          ) : cart.map(item=>(
            <div key={item.uid} className="flex gap-3.5 py-3.5 border-b last:border-0">
              <div className="w-14 h-14 rounded-lg bg-[#f0ebe4] flex items-center justify-center text-2xl shrink-0">{item.emoji}</div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{item.name}</div>
                <div className="text-[#c45c2a] font-semibold text-sm mt-0.5">{item.price.toFixed(2)} USDC</div>
              </div>
              <button onClick={()=>remove(item.uid)} className="text-gray-400 hover:text-gray-600 text-lg self-start">×</button>
            </div>
          ))}
        </div>
        <div className="p-5 border-t">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-500 text-sm">Total</span>
            <span className="font-serif text-2xl font-bold">{total.toFixed(2)} <span className="text-sm text-gray-400 font-sans font-normal">USDC</span></span>
          </div>
          <div className="text-[12px] text-blue-600 mb-3">⚡ Checkout via Arc USDC — on-chain payment</div>
          <button onClick={checkout} disabled={cart.length===0}
            className="w-full py-3 bg-[#1c1410] text-white rounded-lg font-bold text-sm disabled:opacity-40 hover:opacity-85 transition-opacity">
            Pay with USDC →
          </button>
        </div>
      </div>
    </div>
  );
}
