# Arc Commerce

> **Stripe for Arc Testnet** — A multi-merchant USDC payment platform. Register your shop, embed a widget, and receive on-chain payments directly to your wallet. No intermediary. No custody.

**🌐 Live Demo:** [arcpay-desk.vercel.app](https://arcpay-desk.vercel.app) · **Built by:** [@phuocbinh97](https://x.com/phuocbinh97)

---

## Overview

Arc Commerce is a full-stack payment dashboard built natively on Arc Testnet. Any merchant can register their wallet, get a unique `merchantId`, and immediately start accepting USDC payments — via a hosted checkout page, a direct payment link, or a one-line embeddable widget.

Payments are routed through the `ArcCheckoutHub` smart contract and arrive directly in the merchant's wallet in under 1 second.

---

## Features

### 💳 Checkout
- Two-step on-chain payment: `USDC.approve()` → `hub.payToMerchant()`
- Live gas estimation from Arc RPC (no hardcoded values)
- Sub-second finality — receipt confirmed in < 1 second
- Full transaction history with ArcScan deep links
- Supports direct URL (`/checkout?merchant=mer_xxx&amount=10.00&order=ORD_1`) and iframe embed mode

### 🧾 Invoices
- Create invoices with custom amount, description, and expiry
- Auto-generate shareable payment links per invoice
- Status lifecycle: **Pending → Paid → Expired**
- Per-merchant invoice storage in Upstash Redis
- Real-time sync: invoice marked **Paid** automatically after customer payment

### 🏪 Demo Shop
- Full e-commerce storefront (Moc Craft — handcrafted goods)
- Category filter, cart drawer, quantity controls
- Demonstrates the complete customer payment flow
- Checkout routes directly to merchant via `merchantId` — no wallet config needed by customer

### 💰 Treasury
- Live USDC balance fetched directly from Arc RPC
- **Swap USDC ↔ EURC** via Circle App Kit (Arc Testnet)
- Payment history summary

### 📊 Analytics
- Revenue chart with selectable time range (7d / 30d / 90d / All time)
- Metrics: total revenue, transaction count, average order value, unique customers
- Filterable and sortable transaction table

### 🌉 Bridge
- Cross-chain USDC transfer via Circle CCTP + Arc App Kit
- Supported routes: Arc Testnet → Ethereum Sepolia / Base Sepolia / Arbitrum Sepolia
- Bridge transaction history

### 👥 Customers
- Wallet-based customer profiles (auto-populated from payment history)
- Per-customer spend, transaction count, and last activity

### ⚙️ Settings & Merchant Registry
- Register wallet → receive unique `merchantId` (e.g. `mer_fd28ie0`)
- Stored in Upstash Redis — auto-loaded on next wallet connection
- Edit business name → synced to Redis in real time
- Embeddable widget code snippet + direct payment link — auto-generated with your `merchantId`

### 🔌 Embeddable Widget
Any external website can accept payments with a single `<script>` tag:

```html
<script src="https://arcpay-desk.vercel.app/widget.js"
  data-merchant="mer_xxxxxxx"
  data-amount="{{order.total}}"
  data-order="{{order.id}}"
  data-redirect="https://yourshop.com/success">
</script>
```

The widget renders a **Pay with USDC** button, opens a checkout modal, processes the payment on-chain, then closes the modal and triggers a callback or redirect.

**JavaScript callback:**
```javascript
window.arcPayOnSuccess = function({ orderId, txHash }) {
  console.log("Payment confirmed!", orderId, txHash);
};
```

**All widget options:**
| Attribute | Required | Description |
|---|---|---|
| `data-merchant` | ✅ | Your `merchantId` from Settings |
| `data-amount` | ✅ | Payment amount in USDC |
| `data-order` | ✅ | Your order/reference ID |
| `data-redirect` | — | URL to redirect after payment |
| `data-label` | — | Button label (default: `Pay with USDC`) |
| `data-color` | — | Button hex color (default: `#0757f9`) |

### 🌓 Dark / Light Mode
- Toggle between dark and light theme from the top bar (🌙 / ☀️)
- Preference saved to localStorage — persists across sessions

---

## How It Works (For Merchants)

**Step 1 — Register**
```
arcpay-desk.vercel.app/settings
→ Connect wallet → Enter shop name → Register as Merchant
→ Receive merchantId: mer_xxxxxxx
```

**Step 2 — Embed**
```html
<script src="https://arcpay-desk.vercel.app/widget.js"
  data-merchant="mer_xxxxxxx"
  data-amount="10.00"
  data-order="ORDER_123"
  data-redirect="https://yourshop.com/success">
</script>
```

**Step 3 — Get Paid**
```
Customer clicks Pay → MetaMask popup → USDC approved → payment sent
→ Funds arrive in merchant wallet in < 1 second
→ Transaction appears in dashboard automatically
```

---

## Payment Flow

```
1. Customer clicks "Pay with USDC"
2. fetchGasPrice()                 — reads live baseFee from Arc RPC (+20% buffer)
3. USDC.approve(hub, amount)       — Transaction 1: approve hub to spend USDC
4. waitForReceipt()                — polls every 500ms (Arc finalizes in < 1s)
5. hub.payToMerchant(wallet, ...)  — Transaction 2: route payment to merchant
6. waitForReceipt()                — confirms payment receipt
7. POST /api/transactions          — saved to Redis under merchantId
8. Success screen + ArcScan link
9. widget: close modal → fire callback or redirect
```

---

## Arc Network

| | |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` / `0x4CEF52` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Gas Token | **USDC** (not ETH) |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` (6 decimals) |
| EURC ERC-20 | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Faucet | [faucet.circle.com](https://faucet.circle.com) |
| Finality | < 1 second |

---

## Smart Contracts

| Contract | Address |
|---|---|
| ArcCheckoutHub | `0xc7cb4f5ace70a4febc3b260591832af72563e988` |

The hub contract receives `payToMerchant(merchantWallet, merchantId, orderId, amount, memo)` and transfers USDC directly from buyer to merchant. **The contract never holds funds.**

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/merchants/register` | Register new merchant or update name |
| `GET` | `/api/merchants/[merchantId]` | Get merchant by ID |
| `GET` | `/api/merchants/by-wallet/[address]` | Get merchant by wallet address |
| `POST` | `/api/merchants/login` | Verify wallet signature |
| `POST` | `/api/transactions` | Save a transaction |
| `GET` | `/api/transactions?merchantId=` | Get merchant transactions |
| `POST` | `/api/invoices` | Create invoice |
| `GET` | `/api/invoices?merchantId=` | Get merchant invoices |
| `PATCH` | `/api/invoices` | Mark invoice as paid |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 + TypeScript |
| Styling | Tailwind CSS (CSS variable theming) |
| Charts | Chart.js + react-chartjs-2 |
| Wallet | MetaMask (EIP-1193) |
| Arc SDK | `@circle-fin/app-kit`, `@circle-fin/adapter-viem-v2` |
| Database | Upstash Redis |
| Auth | EIP-191 wallet signature — no passwords |
| AI Assistant | Claude API (claude-sonnet-4) |
| Deploy | Vercel |

---

## Local Development

```bash
# Clone
git clone https://github.com/phuocbinh97/arc-commerce.git
cd arc-commerce

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your keys

# Start dev server
npm run dev
# → http://localhost:3000
```

### Environment Variables

```env
# Circle App Kit (from console.circle.com → Kit Keys)
# Format: keyId:keySecret  — do NOT add KIT_KEY: prefix, code adds it automatically
NEXT_PUBLIC_KIT_KEY=your_key_id:your_key_secret

# Arc contracts
NEXT_PUBLIC_HUB_CONTRACT=0xc7cb4f5ace70a4febc3b260591832af72563e988
NEXT_PUBLIC_MERCHANT_WALLET=0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER=https://testnet.arcscan.app
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Upstash Redis (from upstash.com)
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=your_token

# Anthropic (for AI assistant widget)
ANTHROPIC_API_KEY=your_key
```

---

## Quick Start (Test a Payment)

1. Open [arcpay-desk.vercel.app](https://arcpay-desk.vercel.app)
2. Connect MetaMask → switch to Arc Testnet (Chain ID: `5042002`, RPC: `rpc.testnet.arc.network`)
3. Get testnet USDC from [faucet.circle.com](https://faucet.circle.com)
4. Go to **Demo Shop** → add items to cart → **Checkout via Arc USDC**
5. Approve USDC (tx 1) → Confirm payment (tx 2)
6. View confirmed transaction on [ArcScan](https://testnet.arcscan.app)

---

## Architecture

```
Customer (any website)
    └─ widget.js / payment link
            ↓
arcpay-desk.vercel.app/checkout?merchant=mer_xxx
            ↓
GET /api/merchants/mer_xxx → Redis → merchant.wallet
            ↓
MetaMask → USDC.approve() + hub.payToMerchant()
            ↓
ArcCheckoutHub contract
            ↓
USDC transferred directly to merchant wallet
            ↓
POST /api/transactions → Redis (per merchantId)
            ↓
Merchant dashboard shows revenue + customer data
```

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Done | HTML prototype — checkout, dashboard, invoices, analytics, treasury, bridge |
| Phase 2 | ✅ Done | Next.js 15 + TypeScript + Vercel deploy |
| Phase 3 | ✅ Done | Real on-chain payments — MetaMask, USDC, ArcCheckoutHub |
| Phase 4 | ✅ Done | Multi-merchant SaaS — Redis registry, embeddable widget, wallet auth |
| Phase 5 | ✅ Done | Production polish — per-merchant isolation, invoice sync, landing page, dark/light mode |
| Phase 6 | ✅ Done | Swap USDC ↔ EURC via Circle App Kit |
| Phase 7 | 🔲 Planned | Mainnet deployment + production merchant onboarding |

---

*Non-custodial · Payments direct to merchant wallet · Built on Arc Testnet · Powered by Circle USDC*
