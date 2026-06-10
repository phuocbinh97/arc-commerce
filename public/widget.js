(function () {
  const BASE = "https://arcpay-desk.vercel.app";

  function getScript() {
    return document.currentScript || (function () {
      const scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();
  }

  function init(script) {
    const merchant = script.getAttribute("data-merchant") || "";
    const amount   = script.getAttribute("data-amount")   || "0.00";
    const order    = script.getAttribute("data-order")    || ("order-" + Date.now());
    const redirect = script.getAttribute("data-redirect") || "";
    const label    = script.getAttribute("data-label")    || "Pay with USDC";
    const color    = script.getAttribute("data-color")    || "#0757f9";

    if (!merchant) { console.warn("[ArcPay] data-merchant is required"); return; }

    // Build checkout URL
    const url = new URL(BASE + "/checkout");
    url.searchParams.set("merchant", merchant);
    url.searchParams.set("amount",   amount);
    url.searchParams.set("order",    order);
    url.searchParams.set("embed",    "1");
    if (redirect) url.searchParams.set("redirect", redirect);

    // Inject button + modal styles
    const style = document.createElement("style");
    style.textContent = `
      .arcpay-btn {
        display: inline-flex; align-items: center; gap: 8px;
        background: ${color}; color: #fff; border: none;
        padding: 10px 20px; border-radius: 8px; font-size: 14px;
        font-weight: 600; cursor: pointer; font-family: inherit;
        transition: opacity .15s;
      }
      .arcpay-btn:hover { opacity: .88; }
      .arcpay-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; backdrop-filter: blur(4px);
      }
      .arcpay-modal {
        background: #161b22; border-radius: 16px;
        width: min(480px, 95vw); height: min(680px, 95vh);
        overflow: hidden; position: relative;
        border: 1px solid rgba(255,255,255,.08);
      }
      .arcpay-close {
        position: absolute; top: 12px; right: 14px;
        background: rgba(255,255,255,.08); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; font-size: 16px;
        cursor: pointer; z-index: 10; display: grid; place-items: center;
      }
      .arcpay-iframe { width: 100%; height: 100%; border: none; }
    `;
    document.head.appendChild(style);

    // Create button
    const btn = document.createElement("button");
    btn.className = "arcpay-btn";
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ${label}`;
    script.parentNode.insertBefore(btn, script.nextSibling);

    btn.addEventListener("click", function () {
      // Build iframe modal
      const overlay = document.createElement("div");
      overlay.className = "arcpay-overlay";

      const modal = document.createElement("div");
      modal.className = "arcpay-modal";

      const closeBtn = document.createElement("button");
      closeBtn.className = "arcpay-close";
      closeBtn.innerHTML = "✕";
      closeBtn.onclick = function () { document.body.removeChild(overlay); };

      const iframe = document.createElement("iframe");
      iframe.className = "arcpay-iframe";
      iframe.src = url.toString();
      iframe.allow = "clipboard-write";

      // Listen for payment success message from iframe
      window.addEventListener("message", function handler(e) {
        if (e.origin !== BASE) return;
        if (e.data && e.data.type === "ARCPAY_SUCCESS") {
          window.removeEventListener("message", handler);

          // Show success state on button before closing
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Payment Confirmed!`;
          btn.style.background = "#3fb950";
          btn.disabled = true;

          // Close popup after short delay so user sees success screen
          setTimeout(function () {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            if (redirect) {
              window.location.href = redirect + "?order=" + e.data.orderId + "&tx=" + e.data.txHash;
            }
            // Fire onSuccess callback if defined
            if (typeof window.arcPayOnSuccess === "function") {
              window.arcPayOnSuccess({ orderId: e.data.orderId, txHash: e.data.txHash });
            }
          }, 2500);
        }
      });

      modal.appendChild(closeBtn);
      modal.appendChild(iframe);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) document.body.removeChild(overlay);
      });
    });
  }

  if (document.readyState === "loading") {
    const s = getScript();
    document.addEventListener("DOMContentLoaded", function () { init(s); });
  } else {
    init(getScript());
  }
})();
