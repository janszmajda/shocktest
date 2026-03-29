// Injected into the page context to intercept Polymarket's price history fetches.
// Communicates back to the content script via window.postMessage.

(function() {
  const _fetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (url.includes("prices-history") || url.includes("price-history") || url.includes("/prices")) {
        const clone = res.clone();
        clone.json().then(data => {
          let tokenId = null;
          try {
            const u = new URL(url);
            tokenId = u.searchParams.get("market") || u.searchParams.get("token_id") || null;
          } catch(e) {}
          window.postMessage({
            type: "ST_PRICE_DATA",
            url: url,
            tokenId: tokenId,
            data: data,
          }, "*");
        }).catch(() => {});
      }
    } catch(e) {}
    return res;
  };
})();
