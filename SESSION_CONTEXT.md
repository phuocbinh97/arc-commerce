# Arc Commerce — Session Context

> File này dành cho Claude để hiểu toàn bộ context dự án khi bắt đầu tab mới.
> Cập nhật lần cuối: 2026-06-11

---

## Dự Án Là Gì

**Arc Commerce** — Stripe-like USDC payment platform trên Arc Testnet.
- Builder: phuocbinh97 ([@phuocbinh97](https://x.com/phuocbinh97))
- Live: https://arcpay-desk.vercel.app
- GitHub: https://github.com/phuocbinh97/arc-commerce
- Deploy: Vercel (auto-deploy khi push main)

---

## Thông Tin Kỹ Thuật Quan Trọng

### Arc Network
- RPC: `https://rpc.testnet.arc.network`
- Chain ID: `5042002` / `0x4CEF52`
- Gas token: USDC (không phải ETH!)
- USDC ERC-20: `0x3600000000000000000000000000000000000000` **(6 decimals)**
- Finality: < 1 giây

### Smart Contracts
- ArcCheckoutHub: `0xc7cb4f5ace70a4febc3b260591832af72563e988`
- Merchant wallet (phuocbinh97): `0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02`

### Kit Key (Circle App Kit)
- Env var `NEXT_PUBLIC_KIT_KEY` = `d0f621ebb671c74834847f8d7c0cd0f4:f18f78b36dddc0c15e3eaf74f9515ed1`
- Format: `keyId:keySecret` — KHÔNG có prefix `KIT_KEY:`
- Code trong `lib/arc.ts` tự thêm prefix: `kitKey: \`KIT_KEY:${KIT_KEY}\``

### Merchant của phuocbinh97
- merchantId: `mer_fd28ie0`
- wallet: `0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02`
- name: Demo Shop / Moc Craft

---

## Cấu Trúc File Quan Trọng

```
src/
├── app/
│   ├── dashboard/page.tsx       — Overview, stats, recent transactions
│   ├── invoices/page.tsx        — Invoice CRUD, payment links
│   ├── checkout/page.tsx        — On-chain USDC payment flow
│   ├── treasury/page.tsx        — USDC balance + Swap USDC↔EURC
│   ├── analytics/page.tsx       — Revenue charts, metrics
│   ├── bridge/page.tsx          — Cross-chain USDC via CCTP
│   ├── customers/page.tsx       — Wallet-based customer tracking
│   ├── settings/page.tsx        — Merchant registration + widget snippet
│   ├── shop/page.tsx            — Demo storefront (Moc Craft)
│   └── api/
│       ├── merchants/register/route.ts       — POST: register/update merchant
│       ├── merchants/[merchantId]/route.ts   — GET: merchant by ID
│       ├── merchants/by-wallet/[addr]/route.ts — GET: merchant by wallet
│       ├── merchants/login/route.ts          — POST: wallet signature auth
│       ├── transactions/route.ts             — GET/POST transactions
│       └── invoices/route.ts                 — GET/POST/PATCH invoices
├── components/
│   ├── Sidebar.tsx      — Left nav (220px), Resources section removed, just nav + Arc Testnet Live badge
│   ├── Topbar.tsx       — Header với action button, merchant badge, wallet dropdown, dark/light toggle
│   ├── AppShell.tsx     — Layout wrapper: Sidebar + content (ml-220px, pb-9) + AIWidget + StatusBar
│   ├── StatusBar.tsx    — Fixed bottom bar: Resources bên trái, ARC TESTNET + stats bên phải
│   └── AIWidget.tsx     — AI chat widget (Claude API)
├── hooks/
│   ├── useWallet.ts     — MetaMask connect/disconnect, arcWalletDisconnected flag
│   └── useCheckout.ts   — Two-step USDC payment flow
└── lib/
    ├── arc.ts           — Constants, helpers, fetch patch cho Circle CORS
    ├── storage.ts       — localStorage helpers
    └── redis.ts         — Upstash Redis client
public/
└── widget.js            — Embeddable payment widget script
```

---

## Những Tính Năng Đã Làm Xong (Session Này)

### 1. Widget Callback Fix
**File:** `public/widget.js`
**Vấn đề:** Modal còn hiện khi `alert()` hoặc callback chạy — browser không repaint trước khi JS block thread.
**Fix:** `overlay.style.display = "none"` → `overlay.remove()` → `setTimeout(100ms)` → callback. Khoảng 100ms cho browser repaint.

### 2. Wallet Disconnect Persistent
**File:** `src/hooks/useWallet.ts`
**Vấn đề:** F5 sau disconnect vẫn reconnect tự động.
**Fix:** `localStorage.setItem("arcWalletDisconnected", "1")` khi disconnect. Xóa flag khi connect. Nếu `wasDisconnected === true` khi connect → `window.location.reload()`.

### 3. All Pages Empty When Disconnected
**Files:** `dashboard`, `invoices`, `analytics`, `customers`, `settings` page.tsx
**Fix:** Mỗi page có guard đầu useEffect:
```typescript
if (localStorage.getItem("arcWalletDisconnected") === "1") return;
```

### 4. Settings Auto-Load Merchant From Redis
**File:** `src/app/settings/page.tsx`
**Logic:** Khi wallet connect → fetch `/api/merchants/by-wallet/${account}` → nếu đã registered thì auto-populate form + set `arcMerchantSession`.

### 5. Save Changes Syncs To Redis
**File:** `src/app/settings/page.tsx` + `api/merchants/register/route.ts`
**Fix:** `save()` gọi `/api/merchants/register` với name mới. Register API kiểm tra nếu đã có → update name trong Redis.

### 6. New API: by-wallet lookup
**File:** `src/app/api/merchants/by-wallet/[address]/route.ts`
```
GET /api/merchants/by-wallet/0x1234...
→ Redis: wallet:0x1234... → merchantId → merchant object
```

### 7. Topbar Cleanup
**File:** `src/components/Topbar.tsx`
- Xóa nút Logout riêng (redundant)
- Merchant Login chỉ hiện khi `isConnected && !hasSavedMerchant`
- Disconnect → `logout()` + `disconnect()` + `window.location.reload()`
- Merchant name badge hiện khi có session

### 8. Swap CORS Fix
**File:** `src/lib/arc.ts`
**Vấn đề:** Circle App Kit tự thêm `X-User-Agent` header vào browser requests. Circle API server không whitelist header này trong CORS policy → block.
**Fix:** Patch `window.fetch` globally 1 lần khi app load:
```typescript
if (typeof window !== "undefined") {
  const _orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (init?.headers) {
      const h = new Headers(init.headers as HeadersInit);
      h.delete("x-user-agent");
      init = { ...init, headers: h };
    }
    return _orig(input, init);
  };
}
```
**Kết quả:** Swap USDC ↔ EURC hoạt động bình thường.

### 9. Demo Shop Dùng merchantId
**File:** `src/app/shop/page.tsx`
- Trước: lấy wallet từ Settings của người dùng hiện tại → họ tự trả cho chính họ
- Sau: hardcode `merchant=mer_fd28ie0` → checkout tự lookup ví từ Redis → tiền về ví phuocbinh97

### 10. All Vietnamese Text → English
**Files:** `settings/page.tsx`, `shop/page.tsx`
- Placeholder, descriptions, comments → tiếng Anh hết

### 11. Status Bar (Footer)
**File:** `src/components/StatusBar.tsx`
- Fixed bottom bar `h-8`, `bg-[#0d1117]` (luôn dark)
- **Bên trái:** Claim Faucet | Arc Explorer | [avatar] Built by @phuocbinh97 [FOLLOW]
- **Bên phải:** ● ARC TESTNET | AVG BLOCK TIME | TOTAL BLOCKS | Updated HH:MM
- Data fetch từ Arc RPC mỗi 30 giây
- Màu hardcode (không dùng CSS variables) vì bar luôn dark dù app đang light mode
- Avatar: `https://unavatar.io/x/phuocbinh97`
- FOLLOW button: `rounded-full bg-[#e6edf3] text-[#0d1117]` style giống X

### 12. Resources Moved From Sidebar To Footer
- Sidebar ban đầu có Resources section → bị xóa vì chiếm chỗ
- Resources (Faucet, Explorer, Built by) → chuyển vào StatusBar bên trái

### 13. Dark / Light Mode Toggle
**Files:** `src/components/Topbar.tsx`, `src/app/globals.css`, `tailwind.config.ts`
- Nút 🌙/☀️ trong Topbar
- Toggle class `light` trên `document.documentElement`
- CSS variables:
  ```css
  :root { --color-bg: #0d1117; --color-surface: #161b22; ... }
  :root.light { --color-bg: #f6f8fa; --color-surface: #ffffff; ... }
  ```
- Tailwind colors dùng `var(--color-bg)` thay vì hardcode
- Lưu preference vào `localStorage("arcTheme")`
- StatusBar giữ màu hardcode vì luôn dark

---

## Những Lỗi Đã Biết & Cách Fix

| Lỗi | Nguyên nhân | Fix |
|-----|------------|-----|
| Widget modal vẫn hiện sau payment | Browser không repaint trước callback | `overlay.remove()` → `setTimeout(100ms)` → callback |
| F5 sau disconnect vẫn connected | Chỉ clear React state | `arcWalletDisconnected=1` trong localStorage |
| Pages có data khi disconnected | Không check flag | Guard `if arcWalletDisconnected return` ở đầu mỗi useEffect |
| Swap CORS `x-user-agent` | Circle SDK thêm header, Circle API không whitelist | Patch `window.fetch` xóa header trước khi gửi |
| Save Changes không có tác dụng | Register API trả về existing merchant không update | Check `merchant.name !== name` → update Redis |
| `KIT_KEY:KIT_KEY:...` double prefix | Env var đã có prefix, code lại thêm | Env var chỉ `keyId:secret`, code add prefix |

---

## Những Thứ KHÔNG ĐƯỢC Thay Đổi

1. **Checkout flow** — đã test thật, hoạt động: `fetchGasPrice → approve → waitReceipt → pay → waitReceipt`
2. **USDC decimals** — luôn 6, không phải 18
3. **createAdapterFromProvider** — không truyền `chain` param
4. **KIT_KEY env format** — chỉ `keyId:secret`, KHÔNG có prefix
5. **Gas price** — luôn `fetchGasPrice()` từ Arc RPC

---

## localStorage Keys

```javascript
"arcWalletDisconnected"  // "1" khi disconnected, xóa khi connect
"arcMerchantSession"     // { merchantId, name, wallet }
"arcCommerceSettings"    // { businessName, merchantId, merchantWallet, hubContract }
"arcCheckoutHistory"     // Array<{ txHash, amount, orderId, merchant, ts }>
"arcCommerceInvoices"    // Array<Invoice>
"arcBridgeHistory"       // Array<BridgeEntry>
"arcTheme"               // "dark" | "light"
```

---

## Vercel Environment Variables

```
NEXT_PUBLIC_KIT_KEY=d0f621ebb671c74834847f8d7c0cd0f4:f18f78b36dddc0c15e3eaf74f9515ed1
NEXT_PUBLIC_HUB_CONTRACT=0xc7cb4f5ace70a4febc3b260591832af72563e988
NEXT_PUBLIC_MERCHANT_WALLET=0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER=https://testnet.arcscan.app
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
KV_REST_API_URL=...  (Upstash Redis)
KV_REST_API_TOKEN=... (Upstash Redis)
ANTHROPIC_API_KEY=...
```

---

## Roadmap Status

| Phase | Status |
|-------|--------|
| HTML prototype | ✅ Done |
| Next.js + Vercel | ✅ Done |
| On-chain payments | ✅ Done |
| Multi-merchant + Widget | ✅ Done |
| Polish (disconnect, auto-load, dark mode, status bar) | ✅ Done (session này) |
| Swap USDC↔EURC | ✅ Done (session này — CORS fix) |
| 1 wallet → multiple merchantIds | 🔲 Chưa làm |
| Mainnet | 🔲 Chưa làm |
