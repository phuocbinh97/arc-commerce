# Arc Commerce

> **Stripe for Arc Testnet** — A multi-merchant USDC payment platform. Register your shop, embed a widget, receive payments directly to your wallet.

**🌐 Live Demo:** https://arcpay-desk.vercel.app

**GitHub:** https://github.com/phuocbinh97/arc-commerce

---

## What It Does

Arc Commerce lets any shop owner accept USDC payments on Arc Testnet — without writing smart contracts or managing infrastructure. Register once, embed one script tag, and payments arrive in your wallet instantly.

| Feature | Description |
|---------|-------------|
| **Multi-Merchant Registry** | Any shop owner registers via wallet signature — gets a unique `merchantId` |
| **Embeddable Widget** | One `<script>` tag creates a Pay button + popup checkout on any website |
| **Payment Routing** | Checkout reads merchant config from Redis — funds go directly to merchant wallet |
| **Checkout** | USDC approve + pay in 2 on-chain transactions. Sub-second finality on Arc |
| **Invoice Builder** | Create invoices with QR codes, shareable links, auto mark-paid via Redis sync |
| **Dashboard** | Per-merchant revenue stats, charts, recent activity — isolated by merchantId |
| **Analytics** | Revenue trends, daily volume, top customers, business metrics |
| **Treasury** | Live USDC balance, swap stablecoins via Arc App Kit |
| **Bridge** | Cross-chain USDC via Circle CCTP (Arc ↔ Ethereum ↔ Base ↔ Arbitrum) |
| **Customers** | Buyer wallet tracking, spend history, average order value |
| **Merchant Login** | EIP-191 wallet signature auth — no passwords, no email |
| **Demo Shop** | Full e-commerce flow: add to cart → checkout → on-chain payment |

---

## How It Works (For Shop Owners)

**Step 1 — Register**
```
arcpay-desk.vercel.app/settings
→ Enter shop name + wallet address → Get Merchant ID (mer_xxxxxxx)
```

**Step 2 — Embed**
```html
<script src="https://arcpay-desk.vercel.app/widget.js"
  data-merchant="mer_xxxxxxx"
  data-amount="{{order.total}}"
  data-order="{{order.id}}"
  data-redirect="https://yourshop.com/success">
</script>
```

**Step 3 — Receive Payments**
```
Customer clicks Pay → MetaMask popup → USDC approved → payment sent
→ Funds arrive in merchant wallet (<1 second on Arc)
→ Transaction recorded in dashboard automatically
```

**Step 4 — Track**
```
Login to arcpay-desk.vercel.app with your wallet signature
→ See your revenue, invoices, and customers
```

---

## Arc-Native Features

- **USDC as gas** — Arc uses USDC as the native gas token, not ETH
- **Sub-second finality** — payments confirm in < 1 second
- **Live gas estimation** — reads `baseFee` from latest block, no hardcoded values
- **Race condition safe** — `waitForReceipt()` polls every 500ms after approve
- **USDC ERC-20 (6 decimals)** — correct decimal handling throughout
- **Arc App Kit** — Treasury swap and Bridge use `@circle-fin/app-kit`
- **Non-custodial** — funds go payer → merchant, contract never holds USDC

---

## Network Config

| | |
|--|--|
| Network | Arc Testnet |
| Chain ID | 5042002 / 0x4CEF52 |
| RPC URL | https://rpc.testnet.arc.network |
| Gas Token | USDC (not ETH) |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |

---

## Deployed Contracts

| Contract | Address |
|----------|---------|
| ArcCheckoutHub | `0xc7cb4f5ace70a4febc3b260591832af72563e988` |

The hub contract routes payments from buyer to merchant wallet in one call — no intermediary.

---

## Quick Start (Test a Payment)

1. Open https://arcpay-desk.vercel.app
2. Connect MetaMask → add Arc Testnet (Chain ID: 5042002, RPC: rpc.testnet.arc.network)
3. Get testnet USDC from https://faucet.circle.com
4. Go to **Demo Shop** → add items → **Pay with USDC**
5. Approve USDC (tx 1) → confirm payment (tx 2)
6. View confirmed tx on ArcScan

---

## Register as a Merchant

1. Go to https://arcpay-desk.vercel.app/settings
2. Enter your shop name and wallet address
3. Click **Register as Merchant** → receive `merchantId`
4. Copy the embed snippet → paste into your website
5. Login to dashboard → click 🔑 Merchant Login → sign with MetaMask

---

## Widget Options

```html
<script src="https://arcpay-desk.vercel.app/widget.js"
  data-merchant="mer_xxxxxxx"   <!-- Required: your merchantId -->
  data-amount="10.00"            <!-- Required: payment amount in USDC -->
  data-order="ORDER_123"         <!-- Required: your order ID -->
  data-redirect="https://..."    <!-- Optional: redirect URL after payment -->
  data-label="Pay with USDC"     <!-- Optional: button label -->
  data-color="#0757f9">          <!-- Optional: button color -->
</script>
```

**JavaScript callback:**
```javascript
window.arcPayOnSuccess = function({ orderId, txHash }) {
  console.log("Paid!", orderId, txHash);
  // Update your order status here
};
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Database | Upstash Redis (merchant registry, transactions, invoices) |
| Auth | EIP-191 wallet signature (no passwords) |
| Charts | Chart.js + React Chart.js 2 |
| Blockchain | MetaMask (EIP-1193) |
| Arc SDK | `@circle-fin/app-kit` (Swap, Bridge) |
| Smart Contracts | Solidity 0.8.24 — ArcCheckoutHub |
| Deploy | Vercel |

---

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/merchants/register` | Register a new merchant |
| GET | `/api/merchants/[merchantId]` | Get merchant by ID |
| POST | `/api/merchants/login` | Verify wallet signature, return merchant |
| POST | `/api/transactions` | Save a transaction |
| GET | `/api/transactions?merchantId=` | Get merchant's transactions |
| POST | `/api/invoices` | Create invoice |
| GET | `/api/invoices?merchantId=` | Get merchant's invoices |
| PATCH | `/api/invoices` | Mark invoice as paid |

---

## Checkout Flow

```
1. Customer clicks "Pay with USDC" (button or widget popup)
2. fetchGasPrice() — reads live baseFee from Arc (+20% buffer)
3. USDC.approve(hubContract, amount) — tx 1
4. waitForReceipt() — polls 500ms until approve confirms (<1s on Arc)
5. hub.payToMerchant(merchantWallet, merchantId, orderId, amount, memo) — tx 2
6. waitForReceipt() — confirms payment
7. POST /api/transactions → saved to Redis under merchantId
8. Success screen with tx hash + ArcScan link
9. postMessage(ARCPAY_SUCCESS) → widget closes popup, fires callback
```

---

## Roadmap

- ✅ Phase 1 — HTML Prototype (checkout, dashboard, invoices, analytics, treasury, bridge)
- ✅ Phase 2 — Next.js 15 + TypeScript + Vercel Deploy
- ✅ Phase 3 — Real blockchain integration (MetaMask, on-chain payments)
- ✅ Phase 4 — Multi-merchant SaaS (Redis registry, embeddable widget, wallet auth)
- ✅ Phase 5 — Production polish (per-merchant isolation, invoice sync, landing page)
- ⏸ Phase 6 — Swap USDC↔EURC (blocked: pending Circle Console domain whitelist)

---

*Built on Arc Testnet · Non-custodial · Payments direct to merchant wallet*
