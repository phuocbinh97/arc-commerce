# Arc Commerce

> A full-stack USDC payment platform built on Arc Testnet — inspired by Stripe Dashboard.

**Live Demo:** https://arcpay-desk.vercel.app

**GitHub:** https://github.com/phuocbinh97/arc-commerce

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Checkout** | Accept USDC payments via MetaMask — approve + pay in 2 on-chain transactions |
| **Invoice Builder** | Create invoices with QR codes and shareable payment links |
| **Dashboard** | Real-time revenue stats, charts, and recent activity feed |
| **Analytics** | Revenue trends, daily volume, top customers, business metrics |
| **Treasury** | View live USDC balance, swap stablecoins via Arc App Kit |
| **Bridge** | Cross-chain USDC transfers via Circle CCTP (Arc ↔ Ethereum ↔ Base ↔ Arbitrum) |
| **Customers** | Track wallet addresses, total spend, and payment history |
| **AI Assistant** | Claude-powered chat widget — ask about revenue, customers, or create invoices |
| **Demo Shop** | End-to-end e-commerce flow — add to cart → checkout → on-chain payment |

---

## Arc-Native Features

- **USDC as gas** — Arc uses USDC as the native gas token, not ETH
- **Sub-second finality** — payments confirm in under 1 second
- **Live gas estimation** — reads `baseFee` from latest block, never hardcodes gas price
- **Race condition safe** — `waitForReceipt()` polls every 500ms after approve before sending pay tx
- **USDC ERC-20 (6 decimals)** — correct decimal handling throughout
- **Arc App Kit** — Treasury swap and Bridge use `@circle-fin/app-kit`
- **ArcScan links** — every confirmed transaction links to `testnet.arcscan.app`

---

## Network Config

| | |
|--|--|
| Network | Arc Testnet |
| Chain ID | 5042002 / 0x4CEF52 |
| RPC URL | https://rpc.testnet.arc.network |
| Gas Token | USDC (not ETH) |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |

---

## Deployed Contracts

| Contract | Address |
|----------|---------|
| ArcCheckoutHub | `0xc7cb4f5ace70a4febc3b260591832af72563e988` |
| Merchant Wallet | `0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02` |

The hub contract is non-custodial — funds go directly from payer to merchant, never held by the contract.

---

## How to Test a Payment

1. Open https://arcpay-desk.vercel.app
2. Connect MetaMask → switch to Arc Testnet
3. Get testnet USDC from https://faucet.circle.com
4. Open **Demo Shop** → add items to cart → **Pay with USDC**
5. Approve USDC (tx 1) → confirm payment (tx 2)
6. View confirmed transaction on ArcScan

---

## Add Arc Testnet to MetaMask

| Field | Value |
|-------|-------|
| Network Name | Arc Testnet |
| RPC URL | https://rpc.testnet.arc.network |
| Chain ID | 5042002 |
| Currency Symbol | USDC |
| Block Explorer | https://testnet.arcscan.app |

---

## Run Locally

```bash
git clone https://github.com/phuocbinh97/arc-commerce
cd arc-commerce
npm install
npm run dev
# Open http://localhost:3000
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 + TypeScript |
| Charts | Chart.js + React Chart.js 2 |
| Blockchain | MetaMask (EIP-1193) |
| Arc SDK | `@circle-fin/app-kit` (Swap, Bridge) |
| AI Assistant | Claude API (claude-sonnet-4) |
| Smart Contracts | Solidity 0.8.24 |
| Data | localStorage |
| Deploy | Vercel |

---

## Project Structure

```
arc-commerce/
├── src/
│   ├── app/
│   │   ├── dashboard/     # Overview, charts, activity
│   │   ├── invoices/      # Invoice builder with QR
│   │   ├── checkout/      # Core payment flow
│   │   ├── treasury/      # USDC balance + swap
│   │   ├── analytics/     # Revenue charts
│   │   ├── bridge/        # Cross-chain bridge
│   │   ├── customers/     # Wallet tracking
│   │   ├── settings/      # Merchant config
│   │   └── shop/          # Demo e-commerce store
│   ├── components/        # Sidebar, Topbar, AIWidget
│   ├── hooks/             # useWallet, useCheckout
│   └── lib/               # arc.ts, storage.ts
├── .env.local
├── package.json
└── tsconfig.json
```

---

## Checkout Flow

```
1. User clicks "Pay with USDC"
2. fetchGasPrice() — reads live baseFee from Arc (+20% buffer)
3. USDC.approve(hubContract, amount) — tx 1
4. waitForReceipt() — polls 500ms until approve confirms (<1s on Arc)
5. hub.payToMerchant(...) — tx 2
6. waitForReceipt() — polls until confirmed
7. Success screen with tx hash + ArcScan link
```

---

## Roadmap

- ✅ Phase 1 — Dashboard, Invoice, AI Assistant, Settings
- ✅ Phase 2 — Treasury, Analytics, Bridge, Customers
- ✅ Phase 3 — Next.js + Deploy Vercel
- 🔲 Phase 4 — Supabase backend, multi-merchant support

---

*Built on Arc Testnet · USDC payments · Non-custodial*
