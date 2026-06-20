# Nexmer

> **On-chain checkout platform built on Arc Testnet.** Accept USDC payments, issue invoices, bridge cross-chain, and manage a chain-abstracted balance — all from one dashboard.

**🌐 Live:** [nexmer.xyz](https://nexmer.xyz) · **Built by:** [@phuocbinh97](https://x.com/phuocbinh97)

---

## What is Nexmer?

Nexmer is a Stripe-like payment dashboard for Arc Testnet. Merchants connect their wallet, accept USDC payments directly (no intermediary, no custody), and manage everything from a single interface.

Payments go through the `ArcCheckoutHub` smart contract and land in the merchant wallet in under 1 second — Arc's USDC-as-gas design means no ETH is ever needed.

---

## Features

### 💳 Accept Payment
- Two-step on-chain checkout: `USDC.approve()` → `hub.payToMerchant()`
- Live gas price fetched from Arc RPC on every transaction (+20% buffer)
- Sub-second finality — receipt confirmed in < 1s
- Full transaction history with ArcScan deep links

### 🧾 Invoices
- Create invoices with amount, description, and expiry
- Auto-generated shareable payment link per invoice
- Status lifecycle: **Pending → Paid → Expired**
- Invoice marked Paid automatically after customer pays via the link

### 🏪 Demo Shop
- Sample storefront demonstrating the full customer payment flow
- Cart, category filter, quantity controls
- Checkout routes directly to the merchant via on-chain payment

### 📊 Analytics
- Revenue chart (7d / 30d / 90d / All time)
- Metrics: total revenue, transaction count, average order value, unique customers
- Sortable transaction table

### 👥 Customers
- Wallet-based customer profiles auto-populated from payment history
- Per-customer: total spend, transaction count, last activity

### 🌉 Bridge
- Cross-chain USDC transfer via Circle CCTP v2 + Arc App Kit
- Supported routes: Arc Testnet ↔ Ethereum Sepolia / Base Sepolia / Arbitrum Sepolia
- Fee estimate before confirming
- Bridge history with live status tracking

### ↗ Send
- Direct USDC / EURC transfer to any wallet on any supported chain
- Supports: Arc Testnet, Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia
- Live gas price fetched per chain before each transaction

### ⬡ Unified Balance *(newest)*
Chain-abstracted USDC pool powered by Circle Gateway + CCTP v2.

- **Deposit** from any supported chain into a single pool
- **Spend** from the pool to any chain — recipient gets native USDC
- Only **1 MetaMask signature** required (Circle's forwarder handles destination mint)
- Pool balance auto-loads on page open
- Fee estimate before confirming spend

Think of it as the multichain USDC balance on a CEX — but fully non-custodial and on-chain.

### 💎 Treasury
- Live USDC balance fetched from Arc RPC
- Swap USDC ↔ EURC via Circle App Kit *(blocked on Circle Console whitelist for testnet)*

### ⚙️ Settings
- Configure merchant name and wallet address
- Stored in localStorage per session

---

## Payment Flow

```
1. Customer clicks "Pay"
2. fetchGasPrice()              — reads live baseFee from Arc RPC (+20% buffer)
3. USDC.approve(hub, amount)   — Tx 1: approve hub
4. waitForReceipt()            — polls every 500ms
5. hub.payToMerchant(...)      — Tx 2: route USDC to merchant wallet
6. waitForReceipt()            — confirms on-chain
7. Success screen + ArcScan link
```

The hub contract **never holds funds** — USDC moves directly from buyer to merchant.

---

## Unified Balance Flow

```
1. Deposit USDC from any chain → Circle Gateway pool
2. pool.spend(amount, destination)
3. Circle burns USDC on source chain (1 MetaMask signature)
4. Circle's forwarder mints native USDC on destination chain
5. Recipient receives funds — no bridge UI, no destination gas
```

---

## Arc Network

| | |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` / `0x4CEF52` |
| RPC | `https://rpc.testnet.arc.network` |
| Gas Token | **USDC** (not ETH) |
| USDC | `0x3600000000000000000000000000000000000000` (6 decimals) |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Faucet | [faucet.circle.com](https://faucet.circle.com) |
| Finality | < 1 second |

---

## Smart Contracts

| Contract | Address |
|---|---|
| ArcCheckoutHub | `0xc7cb4f5ace70a4febc3b260591832af72563e988` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 + TypeScript |
| Styling | Tailwind CSS |
| Charts | Chart.js + react-chartjs-2 |
| Wallet | MetaMask (EIP-1193) |
| Arc SDK | `@circle-fin/app-kit` · `@circle-fin/adapter-viem-v2` |
| AI Assistant | Claude API (claude-sonnet-4) |
| Deploy | Vercel |

---

## Local Development

```bash
git clone https://github.com/phuocbinh97/arc-commerce.git
cd arc-commerce
npm install
cp .env.example .env.local
npm run dev
```

### Environment Variables

```env
# Circle App Kit key (keyId:keySecret — no KIT_KEY: prefix)
NEXT_PUBLIC_KIT_KEY=your_key_id:your_key_secret

# Arc
NEXT_PUBLIC_HUB_CONTRACT=0xc7cb4f5ace70a4febc3b260591832af72563e988
NEXT_PUBLIC_MERCHANT_WALLET=0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER=https://testnet.arcscan.app
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Anthropic (AI assistant)
ANTHROPIC_API_KEY=your_key
```

---

## Quick Test

1. Open [nexmer.xyz](https://nexmer.xyz)
2. Connect MetaMask → Arc Testnet (Chain ID: `5042002`)
3. Get testnet USDC from [faucet.circle.com](https://faucet.circle.com)
4. **Demo Shop** → add to cart → pay
5. Check transaction on [ArcScan](https://testnet.arcscan.app)

---

## Roadmap

| Phase | Status |
|---|---|
| HTML prototype (checkout, dashboard, invoices, analytics, treasury, bridge) | ✅ |
| Next.js 15 + TypeScript + Vercel deploy | ✅ |
| Real on-chain payments via ArcCheckoutHub | ✅ |
| Bridge cross-chain via Circle CCTP | ✅ |
| Send USDC/EURC direct transfer | ✅ |
| Unified Balance — deposit & spend across chains | ✅ |
| Multi-merchant SaaS (merchant registry, embeddable widget) | 🔲 |
| Mainnet deployment | 🔲 |

---

*Non-custodial · Payments direct to merchant wallet · Built on Arc Testnet · Powered by Circle USDC*
