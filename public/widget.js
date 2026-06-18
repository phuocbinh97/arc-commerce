/* Nexmer Pay Widget v2 — arcpay-desk.vercel.app */
(function () {
  var BASE = "https://arcpay-desk.vercel.app";

  /* ── Styles ────────────────────────────────────────────────────────── */
  var STYLE = [
    ".nxm-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;",
    "background:var(--nxm-color,#0757f9);color:#fff;border:none;border-radius:10px;",
    "font-size:14px;font-weight:700;cursor:pointer;",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;",
    "letter-spacing:-0.01em;transition:opacity .15s,transform .1s;user-select:none;}",
    ".nxm-btn:hover{opacity:.88;}.nxm-btn:active{transform:scale(.97);}",
    ".nxm-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}",
    ".nxm-btn svg{flex-shrink:0;}",
    ".nxm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);",
    "display:flex;align-items:center;justify-content:center;z-index:2147483647;",
    "backdrop-filter:blur(5px);animation:nxm-fade-in .18s ease;}",
    ".nxm-modal{background:#161b22;border-radius:18px;position:relative;",
    "width:min(460px,96vw);height:min(680px,92vh);",
    "border:1px solid rgba(255,255,255,.1);",
    "box-shadow:0 24px 80px rgba(0,0,0,.7);",
    "animation:nxm-slide-up .2s cubic-bezier(.22,.61,.36,1);overflow:hidden;}",
    "@media(max-width:500px){.nxm-modal{width:100vw;height:100dvh;border-radius:0;border:none;}}",
    ".nxm-close{position:absolute;top:10px;right:10px;z-index:10;",
    "background:rgba(255,255,255,.1);border:none;color:#e6edf3;",
    "width:30px;height:30px;border-radius:50%;font-size:17px;",
    "cursor:pointer;display:grid;place-items:center;transition:background .15s;}",
    ".nxm-close:hover{background:rgba(255,255,255,.2);}",
    ".nxm-loader{position:absolute;inset:0;display:flex;flex-direction:column;",
    "align-items:center;justify-content:center;gap:12px;background:#161b22;}",
    ".nxm-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,.12);",
    "border-top-color:#0757f9;border-radius:50%;animation:nxm-spin .7s linear infinite;}",
    ".nxm-loader-txt{font-size:13px;color:#7d8590;",
    "font-family:-apple-system,BlinkMacSystemFont,sans-serif;}",
    ".nxm-iframe{width:100%;height:100%;border:none;display:block;}",
    "@keyframes nxm-fade-in{from{opacity:0}to{opacity:1}}",
    "@keyframes nxm-slide-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}",
    "@keyframes nxm-spin{to{transform:rotate(360deg)}}",
  ].join("");

  function injectStyles() {
    if (document.getElementById("nxm-style")) return;
    var s = document.createElement("style");
    s.id = "nxm-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function getScript() {
    return document.currentScript || (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();
  }

  function buildUrl(merchant, amount, order, redirect, memo) {
    var url = new URL(BASE + "/checkout");
    url.searchParams.set("merchant",  merchant);
    url.searchParams.set("amount",    amount);
    url.searchParams.set("order",     order || ("order-" + Date.now()));
    url.searchParams.set("embed",     "1");
    if (redirect) url.searchParams.set("redirect", redirect);
    if (memo)     url.searchParams.set("memo",     memo);
    return url.toString();
  }

  function openModal(url, btn, redirect) {
    var overlay = document.createElement("div");
    overlay.className = "nxm-overlay";

    var modal = document.createElement("div");
    modal.className = "nxm-modal";

    var closeBtn = document.createElement("button");
    closeBtn.className = "nxm-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = "&#10005;";

    /* Loading state */
    var loader = document.createElement("div");
    loader.className = "nxm-loader";
    loader.innerHTML = '<div class="nxm-spinner"></div><div class="nxm-loader-txt">Loading payment…</div>';

    var iframe = document.createElement("iframe");
    iframe.className = "nxm-iframe";
    iframe.src = url;
    iframe.allow = "clipboard-write";
    iframe.setAttribute("loading", "eager");
    iframe.style.opacity = "0";

    iframe.onload = function () {
      loader.style.display = "none";
      iframe.style.opacity = "1";
      iframe.style.transition = "opacity .2s";
    };

    function close() {
      overlay.style.animation = "nxm-fade-in .15s ease reverse forwards";
      setTimeout(function () { overlay.remove(); }, 150);
      document.removeEventListener("keydown", onEscape);
    }

    function onEscape(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onEscape);

    closeBtn.onclick = close;
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });

    /* Success message from iframe */
    function onMessage(e) {
      if (e.origin !== BASE) return;
      if (!e.data || e.data.type !== "ARCPAY_SUCCESS") return;
      window.removeEventListener("message", onMessage);

      var orderId = e.data.orderId;
      var txHash  = e.data.txHash;

      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Payment Confirmed!';
      btn.style.setProperty("--nxm-color", "#3fb950");
      btn.disabled = true;

      setTimeout(function () {
        close();
        setTimeout(function () {
          if (redirect) {
            window.location.href = redirect + "?order=" + orderId + "&tx=" + txHash;
          } else if (typeof window.nexmerOnSuccess === "function") {
            window.nexmerOnSuccess({ orderId: orderId, txHash: txHash });
          }
        }, 100);
      }, 2500);
    }
    window.addEventListener("message", onMessage);

    modal.appendChild(closeBtn);
    modal.appendChild(loader);
    modal.appendChild(iframe);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function init(script) {
    if (!script) return;
    var merchant = script.getAttribute("data-merchant")  || "";
    var amount   = script.getAttribute("data-amount")    || "0.00";
    var order    = script.getAttribute("data-order")     || "";
    var redirect = script.getAttribute("data-redirect")  || "";
    var memo     = script.getAttribute("data-memo")      || "";
    var label    = script.getAttribute("data-label")     || ("Pay " + amount + " USDC");
    var color    = script.getAttribute("data-color")     || "#0757f9";

    if (!merchant) { console.warn("[Nexmer] data-merchant is required"); return; }

    injectStyles();

    var url = buildUrl(merchant, amount, order, redirect, memo);

    var btn = document.createElement("button");
    btn.className = "nxm-btn";
    btn.style.setProperty("--nxm-color", color);
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' + label;
    btn.onclick = function () { openModal(url, btn, redirect); };

    if (script.parentNode) {
      script.parentNode.insertBefore(btn, script.nextSibling);
    } else {
      document.body.appendChild(btn);
    }
  }

  if (document.readyState === "loading") {
    var s = getScript();
    document.addEventListener("DOMContentLoaded", function () { init(s); });
  } else {
    init(getScript());
  }
})();
