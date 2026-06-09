# Arc Commerce — Claude Code Context

Đây là file context cho Claude Code. Đọc kỹ trước khi làm bất cứ việc gì.

---

## Project Overview

**Arc Commerce** — USDC payment platform trên Arc Testnet, giống Stripe Dashboard.
- Builder: phuocbinh97
- **Live URL:** https://arcpay-desk.vercel.app
- **GitHub Next.js:** https://github.com/phuocbinh97/arc-commerce
- **GitHub HTML:** https://github.com/phuocbinh97/arc-payment-dapp

---

## Cấu Trúc Repo Trên Máy

```
C:\Users\pc\Documents\Codex\2026-06-02\b-c-th-t-d-c\
├── arc-commerce/          ← Next.js app (ĐANG DEPLOY VERCEL)
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── invoices/page.tsx
│   │   │   ├── checkout/page.tsx
│   │   │   ├── treasury/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── bridge/page.tsx       ← đang fix
│   │   │   ├── customers/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── shop/page.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── AIWidget.tsx
│   │   ├── hooks/
│   │   │   ├── useWallet.ts
│   │   │   └── useCheckout.ts
│   │   └── lib/
│   │       ├── arc.ts
│   │       └── storage.ts
│   ├── .env.local
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.ts
├── app/                   ← HTML prototype (backup)
│   ├── checkout.html      ← Core checkout (đã test thật)
│   ├── index.html
│   ├── invoice.html
│   ├── treasury.html
│   ├── analytics.html
│   ├── bridge.html
│   ├── customers.html
│   ├── settings.html
│   └── shop.html
├── contracts/
│   ├── ArcCheckout.sol
│   └── ArcCheckoutHub.sol
└── README.md
```

---

## Arc Network Config

| | |
|--|--|
| RPC | https://rpc.testnet.arc.network |
| Chain ID | 5042002 / 0x4CEF52 |
| Gas token | USDC (không phải ETH!) |
| USDC ERC-20 | 0x3600000000000000000000000000000000000000 (**6 decimals**) |
| EURC ERC-20 | 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |
| Finality | < 1 giây |

---

## Smart Contracts Đã Deploy

| Contract | Address |
|----------|---------|
| ArcCheckoutHub | `0xc7cb4f5ace70a4febc3b260591832af72563e988` |
| Merchant wallet | `0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02` |

---

## Environment Variables

### .env.local (local dev)
```
NEXT_PUBLIC_KIT_KEY=05b9c7f9ec64e8efa7aa6936077f5295:8f1128bfbfd3679df703cf10e36d7ae9
NEXT_PUBLIC_HUB_CONTRACT=0xc7cb4f5ace70a4febc3b260591832af72563e988
NEXT_PUBLIC_MERCHANT_WALLET=0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER=https://testnet.arcscan.app
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

**QUAN TRỌNG về KitKey:**
- Code trong `lib/arc.ts` export `KIT_KEY = process.env.NEXT_PUBLIC_KIT_KEY`
- Code trong `treasury/page.tsx` dùng: `config: { kitKey: \`KIT_KEY:\${KIT_KEY}\` }`
- Vì vậy env var chỉ chứa `keyId:keySecret` — KHÔNG có prefix `KIT_KEY:`
- Vercel env var phải là: `05b9c7f9ec64e8efa7aa6936077f5295:8f1128bfbfd3679df703cf10e36d7ae9`

---

## Arc App Kit — Thông Tin Quan Trọng

### Đúng function name từ `@circle-fin/adapter-viem-v2`:
```javascript
const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
const adapter = await createAdapterFromProvider({ provider: window.ethereum });
// KHÔNG truyền chain param — không tồn tại trong type
```

### Đúng chain names cho BridgeChain enum:
```javascript
"Arc_Testnet"      // Arc Testnet
"Ethereum_Sepolia" // Ethereum Sepolia
"Base_Sepolia"     // Base Sepolia
"Arbitrum_Sepolia" // Arbitrum Sepolia
```

### Swap:
```javascript
const { AppKit } = await import("@circle-fin/app-kit");
const kit = new AppKit();
await kit.swap({
  from: { adapter, chain: "Arc_Testnet" },
  tokenIn: "USDC",
  tokenOut: "EURC",
  amountIn: "10.00",
  config: { kitKey: `KIT_KEY:${KIT_KEY}` }, // KIT_KEY từ env không có prefix
});
```

### Bridge:
```javascript
await kit.bridge({
  from: { adapter, chain: "Arc_Testnet" },
  to: { chain: "Ethereum_Sepolia" },
  amount: "10.00",
  token: "USDC",
});
```

---

## localStorage Keys

```javascript
"arcCheckoutHistory"    // Array<{ txHash, amount, orderId, merchant, ts }>
"arcCommerceInvoices"   // Array<Invoice>
"arcCommerceSettings"   // MerchantSettings object
"arcBridgeHistory"      // Array<BridgeEntry>
"arcCheckoutHub"        // Hub contract address
"arcCheckoutMerchant"   // Merchant wallet address
```

---

## Checkout Flow (KHÔNG ĐƯỢC THAY ĐỔI — đã test thật)

```
1. fetchGasPrice() → đọc baseFee live từ Arc (+20% buffer)
2. USDC.approve(hubContract, amount) → eth_sendTransaction
3. waitForReceipt() → poll 500ms (Arc finality < 1s)
4. hub.payToMerchant(merchant, merchantId, orderId, amount, memo)
5. waitForReceipt()
6. savePayment() → localStorage
7. Success screen + ArcScan link
```

---

## Design System (Tailwind)

```
bg-bg       = #0d1117   (page background)
bg-surface  = #161b22   (cards, sidebar)
bg-surface2 = #1c2330   (hover)
border      = rgba(255,255,255,0.08)
border2     = rgba(255,255,255,0.14)  (tên class: border-white/14)
text-ink    = #e6edf3
text-muted  = #7d8590
accent      = #0757f9
green       = #3fb950
amber       = #d29922
red         = #f85149
purple      = #a371f7
```

Font: `DM Sans` (UI), `DM Mono` (numbers, addresses)

---

## Roadmap — Trạng Thái Hiện Tại

### ✅ Phase 1 — HTML Prototype (DONE)
- checkout.html, shop.html, invoice.html, dashboard, analytics, treasury, bridge, customers, settings
- Deploy: GitHub Pages

### ✅ Phase 2 — Nâng Cấp (DONE)
- Treasury: USDC balance thật, Swap UI
- Analytics: Revenue chart, metrics
- Bridge: Cross-chain UI
- Customers: Wallet tracking

### ✅ Phase 3 — Next.js + Vercel (DONE)
- Next.js 15 + TypeScript + Tailwind
- Deploy: https://arcpay-desk.vercel.app
- GitHub: https://github.com/phuocbinh97/arc-commerce

### 🔲 Việc Cần Làm Tiếp (THEO THỨ TỰ ƯU TIÊN)

#### 1. Fix bridge/page.tsx — chain names ✅ DONE
#### 2. Verify Swap — ⏸ BLOCKED (Circle Console lỗi, cần whitelist arcpay-desk.vercel.app)
#### 3. Test toàn bộ flow trên Vercel
- [x] Checkout: pay từ Demo Shop → success screen ✅
- [ ] Invoice: tạo invoice → copy link → pay → invoice đổi Paid
- [ ] Treasury: Swap USDC→EURC (blocked)
- [ ] Bridge: Arc_Testnet → Ethereum_Sepolia

---

### 🔲 Phase 4 — Multi-Merchant SaaS Platform (KẾ HOẠCH LỚN)

**Tầm nhìn:** Arc Commerce trở thành Stripe trên Arc Testnet — bất kỳ chủ shop nào cũng đăng ký được, nhúng widget vào trang web của họ, tiền về thẳng ví của họ.

#### 4.1 Backend — Merchant Registry (Vercel KV)
- Dùng Vercel KV (Redis free tier) làm database
- API routes: `POST /api/merchants/register`, `GET /api/merchants/[merchantId]`
- Schema: `{ merchantId, name, wallet, createdAt }`
- Merchant login = ký message bằng wallet (không cần password)

#### 4.2 Settings Page — Merchant Self-Config
- Merchant vào Settings → nhập tên shop + wallet address → Save
- Hệ thống sinh `merchantId` unique (vd: `mer_abc123`)
- Hiển thị snippet nhúng + payment link mẫu

#### 4.3 Embeddable Widget
Merchant copy vào trang web của họ:
```html
<script src="https://arcpay-desk.vercel.app/widget.js"
  data-merchant="mer_abc123"
  data-amount="{{order.total}}"
  data-order="{{order.id}}"
  data-redirect="https://myshop.com/success">
</script>
```
- Widget là popup/iframe checkout
- Đọc config merchant từ API → dùng wallet của merchant đó
- Sau khi pay xong → redirect về `data-redirect`

#### 4.4 Payment Routing
- Checkout đọc `merchantId` từ URL param → lookup wallet từ Vercel KV
- `hub.payToMerchant(merchantWallet, merchantId, orderId, amount, memo)`
- Tiền về **thẳng ví merchant**, không qua trung gian

#### 4.5 Dashboard per Merchant
- Merchant login bằng wallet signature (EIP-191)
- Chỉ thấy transactions của merchantId của họ
- Analytics, invoices, customers riêng biệt

#### Thứ tự build Phase 4:
1. Vercel KV setup + API routes
2. Settings page → register merchant → lấy merchantId
3. Checkout nhận merchantId param → route payment đúng ví
4. Widget embed script (widget.js)
5. Wallet-based auth cho dashboard

---

## Lỗi Đã Biết Và Cách Fix

| Lỗi | Nguyên nhân | Fix |
|-----|------------|-----|
| `chain does not exist in CreateViemAdapterFromProviderParams` | Truyền `chain` vào createAdapterFromProvider | Chỉ truyền `{ provider: eth }` |
| `Invalid chain 'ARC'` | Sai tên BridgeChain enum | Dùng `Arc_Testnet`, `Ethereum_Sepolia`... |
| `KIT_KEY:KIT_KEY:...` double prefix | Env var đã có `KIT_KEY:` prefix, code lại thêm | Env var chỉ chứa `keyId:keySecret` |
| `BigInt literals ES2020` | tsconfig target thấp | `"target": "ES2020"` trong tsconfig.json |
| CORS từ localhost | Circle API block localhost | Chỉ test Swap/Bridge trên Vercel domain |
| `node_modules` push lên GitHub | .gitignore dùng dấu nháy | Dùng Notepad tạo .gitignore không có quotes |

---

## Git Workflow

```bash
# Trong folder arc-commerce
git add <files>
git commit -m "fix: description"
git push
# Vercel tự redeploy sau khi push
```

---

## Những Điều KHÔNG Được Làm

1. **KHÔNG hardcode gas price** — luôn dùng `fetchGasPrice()` đọc live từ Arc
2. **KHÔNG truyền `chain` vào `createAdapterFromProvider`** — type error
3. **KHÔNG dùng `KIT_KEY:` prefix trong env var** — code đã tự thêm
4. **KHÔNG đổi checkout flow** — đã test thật, hoạt động tốt
5. **KHÔNG push node_modules** — .gitignore phải có `node_modules/`
6. **KHÔNG dùng 18 decimals cho USDC** — Arc USDC ERC-20 dùng 6 decimals

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 + TypeScript |
| Styling | Tailwind CSS |
| Charts | Chart.js + react-chartjs-2 |
| Blockchain | MetaMask (EIP-1193) |
| Arc SDK | @circle-fin/app-kit, @circle-fin/adapter-viem-v2 |
| AI | Claude API (claude-sonnet-4-20250514) |
| Data | localStorage |
| Deploy | Vercel (arcpay-desk.vercel.app) |

