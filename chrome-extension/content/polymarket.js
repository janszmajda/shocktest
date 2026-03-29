/**
 * ShockTest Content Script — injected on polymarket.com
 *
 * Detects the current market, matches against shock data,
 * shows a floating signal panel, and highlights shocks on the chart
 * using intercepted price history data for accurate positioning.
 */

(() => {
  // Avoid double-injection
  if (document.getElementById("shocktest-overlay")) return;

  let allShocks = [];
  let currentShockIndex = 0;
  let matchedShocks = [];   // broad matches for this event page
  let activeShocks = [];    // filtered to the currently displayed sub-market
  let panelCollapsed = false;
  let dashboardBase = "";
  let lastUrl = window.location.href;

  // Chart data intercepted from Polymarket's own API calls.
  // We store ALL intercepted series keyed by token_id, and track which is "active".
  let allPriceData = {};   // { [tokenId]: { tMin, tMax, points, tokenId } }
  let chartPriceData = null; // the currently active series (most recently fetched)
  let activeTokenId = null;
  let chartObserver = null;
  let chartResizeObserver = null;

  // ── Helpers ──

  function normalize(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")  // strip everything except letters, numbers, spaces
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchScore(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 100;
    if (na.includes(nb) || nb.includes(na)) return 80;
    const wordsA = new Set(na.split(" "));
    const wordsB = new Set(nb.split(" "));
    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w) && w.length > 2) overlap++;
    }
    const total = Math.max(wordsA.size, wordsB.size);
    const ratio = total > 0 ? overlap / total : 0;
    return ratio > 0.5 ? Math.round(ratio * 70) : 0;
  }

  function timeAgo(isoString) {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ══════════════════════════════════════════════════════════════
  //  1. INTERCEPT POLYMARKET PRICE DATA
  // ══════════════════════════════════════════════════════════════
  //
  //  We inject a <script> into the page context that patches fetch()
  //  to capture responses from Polymarket's CLOB price-history API.
  //  The intercepted data is sent back here via window.postMessage.
  // ══════════════════════════════════════════════════════════════

  function injectFetchInterceptor() {
    if (document.getElementById("st-fetch-interceptor")) return;

    // Inject as an external script (src) to avoid CSP inline-script blocks.
    const script = document.createElement("script");
    script.id = "st-fetch-interceptor";
    script.src = chrome.runtime.getURL("content/interceptor.js");
    (document.head || document.documentElement).appendChild(script);
  }

  /** Parse intercepted price data into {tMin, tMax, points} */
  function parsePriceData(raw) {
    // Polymarket CLOB returns { history: [{t, p}] } where t is unix seconds
    // Or it might be an array directly
    let points = [];

    if (raw?.history && Array.isArray(raw.history)) {
      points = raw.history;
    } else if (Array.isArray(raw)) {
      points = raw;
    } else if (raw?.prices && Array.isArray(raw.prices)) {
      points = raw.prices;
    }

    // Normalize: ensure t is in seconds (not ms), p is 0-1
    const normalized = [];
    for (const pt of points) {
      let t = Number(pt.t ?? pt.time ?? pt.timestamp ?? 0);
      let p = Number(pt.p ?? pt.price ?? pt.value ?? 0);
      // If t looks like milliseconds, convert
      if (t > 1e12) t = t / 1000;
      // If p looks like a percentage, convert
      if (p > 1.5) p = p / 100;
      if (t > 0) normalized.push({ t, p });
    }

    if (normalized.length < 2) return null;

    normalized.sort((a, b) => a.t - b.t);
    return {
      tMin: normalized[0].t,
      tMax: normalized[normalized.length - 1].t,
      points: normalized,
    };
  }

  // Listen for intercepted price data
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "ST_PRICE_DATA") return;

    const parsed = parsePriceData(event.data.data);
    if (parsed && parsed.points.length >= 2) {
      const tokenId = event.data.tokenId || "unknown_" + Date.now();
      parsed.tokenId = tokenId;

      console.log("[ShockTest] Price data intercepted:", tokenId, parsed.points.length, "pts");

      allPriceData[tokenId] = parsed;
      // The most recently fetched series is the one the user is looking at
      chartPriceData = parsed;
      activeTokenId = tokenId;

      // Re-filter to only shocks that belong to this specific chart/sub-market
      if (matchedShocks.length > 0) {
        const validShocks = filterShocksForChart(matchedShocks, parsed);
        console.log("[ShockTest] Shocks for chart:", validShocks.length);

        // Update the panel to show only validated shocks
        activeShocks = validShocks;
        if (validShocks.length > 0) {
          currentShockIndex = 0;
          renderShock(validShocks[0]);
          showOverlay();
        } else {
          renderNoShock();
        }

        // New price data — always redraw with the validated shocks.
        // forceChartRedraw uses fingerprinting so it won't flicker if
        // positions haven't actually changed.
        forceChartRedraw(validShocks);
      }
    }
  });

  /**
   * Read the chart title — the sub-market label positioned above the chart.
   *
   * On Polymarket, the title is a <p class="font-semibold"> like "March 31"
   * positioned above the chart SVG. DOM walking doesn't work because they're
   * in different branches — so we use spatial proximity instead: find the
   * font-semibold <p> that is physically closest above the chart and isn't
   * a percentage or price value.
   */
  function getChartTitle() {
    const svg = findChartElement();
    if (!svg) return null;

    const svgRect = svg.getBoundingClientRect();

    // Find all font-semibold paragraphs positioned above the chart
    const candidates = [];
    document.querySelectorAll('p[class*="font-semibold"]').forEach(p => {
      const text = p.textContent.trim();
      if (!text || text.length < 2 || text.length > 300) return;

      const pRect = p.getBoundingClientRect();
      const distAbove = svgRect.top - pRect.bottom; // positive = above chart

      // Must be above the chart (within 300px) and not below it
      if (distAbove < -20 || distAbove > 300) return;

      // Skip percentages, prices, and buy/sell labels
      if (/^\d+(\.\d+)?[%¢$]?$/.test(text)) return;
      if (/^(Yes|No|Buy|Sell)$/i.test(text)) return;
      if (text.includes("¢")) return;

      candidates.push({ text, dist: distAbove });
    });

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0].text;
    console.log("[ShockTest] Chart title:", JSON.stringify(best));
    return best;
  }

  /**
   * Filter shocks to only those that belong to the currently displayed chart.
   *
   * Strategy (in priority order):
   * 1. TITLE MATCH: Read the chart title text above the SVG and match shock
   *    questions against it. This is the most reliable signal.
   * 2. PRICE MATCH (fallback): If no title found, check that the shock's
   *    p_after matches the chart's price at t2.
   */
  function filterShocksForChart(shocks, priceData) {
    if (shocks.length === 0) return shocks;

    // ── Pass 1: Title matching ──
    // The chart title might be the full question ("Will Bitcoin hit 100k by March 31?")
    // or just a short label like "March 31". Both need to work.
    const chartTitle = getChartTitle();
    if (chartTitle) {
      const nt = normalize(chartTitle);

      const titleMatched = shocks.filter(shock => {
        const nq = normalize(shock.question);

        // Exact or fuzzy match (works for full question titles)
        if (matchScore(shock.question, chartTitle) >= 50) return true;

        // Title contained in question (e.g. "march 31" found in "will btc hit 100k by march 31")
        if (nq.includes(nt)) return true;

        // Question contained in title (unlikely but handle it)
        if (nt.includes(nq)) return true;

        // Word-level: every word in the title appears in the question
        // Handles "March 31" matching "...by March 31?"
        const titleWords = nt.split(" ").filter(w => w.length > 1);
        if (titleWords.length > 0 && titleWords.every(w => nq.includes(w))) return true;

        return false;
      });

      if (titleMatched.length > 0) {
        console.log("[ShockTest] Title matched:", titleMatched.length);
        // Still filter by time range if we have price data
        if (priceData && priceData.points.length >= 2) {
          const { tMin, tMax } = priceData;
          const timeRange = tMax - tMin;
          const timeFiltered = titleMatched.filter(shock => {
            const t2 = new Date(shock.t2).getTime() / 1000;
            return t2 >= tMin - timeRange * 0.05 && t2 <= tMax + timeRange * 0.05;
          });
          // Only use time-filtered if it still has results
          return timeFiltered.length > 0 ? timeFiltered : titleMatched;
        }
        return titleMatched;
      }
      console.log("[ShockTest] No shocks matched chart title");
    }

    // ── Pass 2: Price data matching (fallback) ──
    if (!priceData || priceData.points.length < 2) return shocks;

    const { tMin, tMax, points } = priceData;

    return shocks.filter(shock => {
      const shockT2 = new Date(shock.t2).getTime() / 1000;

      const timeRange = tMax - tMin;
      if (shockT2 < tMin - timeRange * 0.05 || shockT2 > tMax + timeRange * 0.05) {
        return false;
      }

      let closestPt = points[0];
      let closestDist = Math.abs(points[0].t - shockT2);
      for (const pt of points) {
        const dist = Math.abs(pt.t - shockT2);
        if (dist < closestDist) {
          closestDist = dist;
          closestPt = pt;
        }
      }

      const priceDiff = Math.abs(closestPt.p - shock.p_after);
      if (priceDiff > 0.15) {
        // Price mismatch — shock belongs to different sub-market
        return false;
      }

      return true;
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  2. CHART DETECTION + OVERLAY
  //
  //  Polymarket uses a visx (React) SVG chart. The SVG element itself
  //  has class="overflow-visible" and contains:
  //    - visx-axis-bottom  (x-axis with date ticks, each has an x position)
  //    - visx-axis-right   (y-axis with % ticks, each has a y position)
  //    - <g id="line-chart"> with the data path
  //  We read axis ticks directly from the SVG to map time/price to pixels.
  // ══════════════════════════════════════════════════════════════

  /** Find the visx chart SVG on the Polymarket page */
  function findChartElement() {
    // Primary: SVG with class="overflow-visible" (the chart itself)
    const svgs = document.querySelectorAll("svg.overflow-visible");
    for (const svg of svgs) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        console.log("[ShockTest] Chart found:", rect.width.toFixed(0) + "x" + rect.height.toFixed(0));
        return svg;
      }
    }

    // Secondary: SVG containing visx axis groups
    const allSvgs = document.querySelectorAll("svg");
    for (const svg of allSvgs) {
      if (svg.querySelector(".visx-axis-bottom, .visx-axis-left, .visx-axis-right")) {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          console.log("[ShockTest] Chart found (visx):", rect.width.toFixed(0) + "x" + rect.height.toFixed(0));
          return svg;
        }
      }
    }

    // Tertiary: SVG containing <g id="line-chart">
    for (const svg of allSvgs) {
      if (svg.querySelector("#line-chart")) {
        const rect = svg.getBoundingClientRect();
        console.log("[ShockTest] Chart found (#line-chart):", rect.width.toFixed(0) + "x" + rect.height.toFixed(0));
        return svg;
      }
    }

    // No chart found
    return null;
  }

  /**
   * Read the visx axis ticks to build exact time→pixel and price→pixel maps.
   * Returns null if the axes can't be parsed.
   *
   * X-axis (visx-axis-bottom): each tick has a translateX(Npx) on the <text>
   *   and a <tspan> with a date string like "Mar 23".
   * Y-axis (visx-axis-right): each tick has a translateY(Npx) on the <text>
   *   and a <tspan> with a % string like "10%".
   */
  function readAxisData(svg) {
    const result = { xTicks: [], yTicks: [], plotTop: 0 };

    // ── Read the top-level g transform to get the y-offset ──
    const topG = svg.querySelector("g[transform]");
    if (topG) {
      const m = topG.getAttribute("transform").match(/translate\(\s*[\d.]+,\s*([\d.]+)\)/);
      if (m) result.plotTop = parseFloat(m[1]); // typically 10
    }

    // ── X-axis ticks ──
    const xAxis = svg.querySelector(".visx-axis-bottom");
    if (xAxis) {
      const ticks = xAxis.querySelectorAll(".visx-axis-tick");
      for (const tick of ticks) {
        const textEl = tick.querySelector("text");
        const tspan = tick.querySelector("tspan");
        if (!textEl || !tspan) continue;

        // Extract x from the style transform: translateX(80px)
        const style = textEl.getAttribute("style") || "";
        const xMatch = style.match(/translateX\(([\d.]+)px\)/);
        if (!xMatch) continue;

        const xPx = parseFloat(xMatch[1]);
        const dateStr = tspan.textContent.trim(); // e.g. "Mar 23"

        // Parse the date — add current year
        const now = new Date();
        const parsed = new Date(dateStr + " " + now.getFullYear());
        // If the parsed date is in the future by more than 6 months, use last year
        if (parsed.getTime() - now.getTime() > 180 * 86400000) {
          parsed.setFullYear(now.getFullYear() - 1);
        }
        if (!isNaN(parsed.getTime())) {
          result.xTicks.push({ px: xPx, time: parsed.getTime() / 1000 });
        }
      }
    }

    // ── Y-axis ticks ──
    const yAxis = svg.querySelector(".visx-axis-right, .visx-axis-left");
    if (yAxis) {
      const ticks = yAxis.querySelectorAll(".visx-axis-tick");
      for (const tick of ticks) {
        const textEl = tick.querySelector("text");
        const tspan = tick.querySelector("tspan");
        if (!textEl || !tspan) continue;

        const style = textEl.getAttribute("style") || "";
        const yMatch = style.match(/translateY\(([\d.]+)px\)/);
        // Also check the line element for y position
        const lineEl = tick.querySelector("line");
        let yPx = null;
        if (yMatch) {
          yPx = parseFloat(yMatch[1]);
        } else if (lineEl) {
          yPx = parseFloat(lineEl.getAttribute("y1"));
        }
        if (yPx === null) continue;

        const pctStr = tspan.textContent.trim(); // e.g. "10%"
        const pctMatch = pctStr.match(/([\d.]+)%/);
        if (!pctMatch) continue;

        result.yTicks.push({ px: yPx, pct: parseFloat(pctMatch[1]) / 100 });
      }
    }

    // Axis parsed
    return result;
  }

  /**
   * Build linear interpolation functions from axis tick data.
   * Returns { timeToX, priceToY, xMin, xMax, plotHeight } or null.
   */
  function buildAxisMappers(axisData) {
    const { xTicks, yTicks } = axisData;

    if (xTicks.length < 2 || yTicks.length < 2) {
      // Not enough ticks
      return null;
    }

    // Sort ticks
    xTicks.sort((a, b) => a.px - b.px);
    yTicks.sort((a, b) => a.px - b.px);

    // X: linear interpolation from time → pixel
    const xFirst = xTicks[0];
    const xLast = xTicks[xTicks.length - 1];
    const timePerPx = (xLast.time - xFirst.time) / (xLast.px - xFirst.px);

    function timeToX(unixSec) {
      const px = xFirst.px + (unixSec - xFirst.time) / timePerPx;
      return px;
    }

    // Also compute the full time range visible on the chart
    // using the intercepted price data if available, else axis ticks
    const tMin = chartPriceData ? chartPriceData.tMin : xFirst.time;
    const tMax = chartPriceData ? chartPriceData.tMax : xLast.time;

    // Y: linear interpolation from probability → pixel
    const yFirst = yTicks[0];
    const yLast = yTicks[yTicks.length - 1];
    const pctPerPx = (yLast.pct - yFirst.pct) / (yLast.px - yFirst.px);

    function priceToY(prob) {
      const px = yFirst.px + (prob - yFirst.pct) / pctPerPx;
      return px;
    }

    // Plot width: from x=0 to the axis line end
    // The visx-axis-bottom line goes from ~0.5 to ~628.5
    const axisLine = document.querySelector(".visx-axis-bottom .visx-axis-line");
    let plotWidth = xLast.px + 20; // default
    if (axisLine) {
      const x2 = parseFloat(axisLine.getAttribute("x2") || "0");
      if (x2 > 0) plotWidth = x2;
    }

    // Plot height from the visx-rows grid lines
    const plotHeight = yFirst.px > yLast.px ? yFirst.px : yLast.px;

    return { timeToX, priceToY, tMin, tMax, plotWidth, plotHeight, plotTop: axisData.plotTop };
  }

  /** Remove overlay elements only (keep the watcher running) */
  function removeChartOverlayElements() {
    document.querySelectorAll(".st-chart-overlay-container").forEach(el => el.remove());
  }

  /** Full cleanup — stop all watchers and remove elements */
  function clearChartOverlay() {
    if (chartObserver) { chartObserver.disconnect(); chartObserver = null; }
    if (chartResizeObserver) { chartResizeObserver.disconnect(); chartResizeObserver = null; }
    removeChartOverlayElements();
    currentChartSvg = null;
  }

  // Track the SVG we last drew on so we know when it changes or disappears
  let currentChartSvg = null;

  /**
   * Persistent chart watcher.
   * Continuously watches the DOM for the chart SVG to appear/disappear.
   * When the chart shows up, draws the overlay.
   * When it disappears (closed/toggled), cleans up and keeps watching.
   * When it reappears (reopened), redraws.
   */
  // The shocks currently being drawn on the chart
  let currentChartShocks = null;

  // Fingerprint of the last drawn overlay — avoids flicker on no-op redraws
  let lastOverlayFingerprint = "";

  /**
   * Called when price data changes (timeframe switch, sub-market switch).
   * Computes where bands would go — only removes and redraws if positions changed.
   */
  function forceChartRedraw(shocks) {
    const svg = findChartElement();
    if (!svg || shocks.length === 0) {
      if (lastOverlayFingerprint !== "empty") {
        removeChartOverlayElements();
        lastOverlayFingerprint = "empty";
      }
      currentChartSvg = null;
      currentChartShocks = null;
      startChartWatcher(shocks);
      return;
    }

    const axisData = readAxisData(svg);
    const mappers = buildAxisMappers(axisData);
    if (!mappers) {
      currentChartSvg = null;
      currentChartShocks = null;
      startChartWatcher(shocks);
      return;
    }

    // Build a fingerprint of where each band would be drawn
    const fp = computeOverlayFingerprint(shocks, mappers);

    if (fp === lastOverlayFingerprint) {
      // Positions unchanged — don't flicker
      // Overlay unchanged
      return;
    }

    // Positions changed — redraw
    console.log("[ShockTest] Redrawing overlay");
    removeChartOverlayElements();
    if (chartResizeObserver) { chartResizeObserver.disconnect(); chartResizeObserver = null; }
    currentChartSvg = null;
    currentChartShocks = null;
    lastOverlayFingerprint = fp;
    startChartWatcher(shocks);
  }

  /**
   * Compute a string fingerprint of where bands would be placed.
   * If two fingerprints are equal, the visual output is identical.
   */
  function computeOverlayFingerprint(shocks, mappers) {
    const { timeToX } = mappers;
    const svgEl = findChartElement();
    if (!svgEl) return "none";

    const svgW = parseFloat(svgEl.getAttribute("width") || "0");
    const svgRect = svgEl.getBoundingClientRect();
    const scaleX = svgRect.width / (svgW || svgRect.width);

    const parts = [];
    for (const shock of shocks) {
      const t2 = new Date(shock.t2).getTime() / 1000;
      const t1 = new Date(shock.t1).getTime() / 1000;
      const x2 = Math.round(timeToX(t2) * scaleX);
      const x1 = Math.round(timeToX(t1) * scaleX);
      // Include shock id + rounded pixel positions
      parts.push(`${shock._id}:${x1},${x2}`);
    }
    return parts.join("|");
  }

  function startChartWatcher(shocks) {
    // If called with a new shock list, force a redraw even if the SVG is the same
    const shocksChanged = shocks !== currentChartShocks;
    if (shocksChanged) {
      removeChartOverlayElements();
      if (chartResizeObserver) { chartResizeObserver.disconnect(); chartResizeObserver = null; }
      currentChartSvg = null;
      currentChartShocks = shocks;
    }

    // Stop any previous DOM watcher (but keep resize observer if SVG unchanged)
    if (chartObserver) { chartObserver.disconnect(); chartObserver = null; }

    if (shocks.length === 0) {
      removeChartOverlayElements();
      return;
    }

    function tryDraw() {
      const svg = findChartElement();

      // Chart disappeared — clean up overlay, keep watching
      if (!svg) {
        if (currentChartSvg) {
          // Chart closed
          removeChartOverlayElements();
          if (chartResizeObserver) { chartResizeObserver.disconnect(); chartResizeObserver = null; }
          currentChartSvg = null;
        }
        return;
      }

      // Same SVG, same shocks, overlay exists — nothing to do
      if (svg === currentChartSvg && document.querySelector(".st-chart-overlay-container")) {
        return;
      }

      // Draw overlay
      const axisData = readAxisData(svg);
      const mappers = buildAxisMappers(axisData);
      if (!mappers) return;

      removeChartOverlayElements();
      if (chartResizeObserver) { chartResizeObserver.disconnect(); chartResizeObserver = null; }

      drawChartOverlay(svg, shocks, mappers);
      currentChartSvg = svg;

      chartResizeObserver = new ResizeObserver(() => {
        removeChartOverlayElements();
        const freshAxis = readAxisData(svg);
        const freshMappers = buildAxisMappers(freshAxis);
        if (freshMappers) drawChartOverlay(svg, shocks, freshMappers);
      });
      chartResizeObserver.observe(svg);

      console.log("[ShockTest] Overlay drawn");
    }

    tryDraw();

    chartObserver = new MutationObserver(() => {
      tryDraw();
    });
    chartObserver.observe(document.body, { childList: true, subtree: true });
  }

  /** Draw shock markers on the chart using exact axis mappers */
  function drawChartOverlay(svg, shocks, mappers) {
    document.querySelectorAll(".st-chart-overlay-container").forEach(el => el.remove());

    const { timeToX, priceToY, plotWidth, plotHeight, plotTop } = mappers;
    const svgRect = svg.getBoundingClientRect();

    // The SVG coordinate system maps to screen pixels via the SVG's own scaling.
    // SVG width attr / bounding rect width gives us the scale factor.
    const svgW = parseFloat(svg.getAttribute("width") || svgRect.width);
    const svgH = parseFloat(svg.getAttribute("height") || svgRect.height);
    const scaleX = svgRect.width / svgW;
    const scaleY = svgRect.height / svgH;

    // Find a positioned ancestor to anchor to
    let anchor = svg.parentElement;
    while (anchor && anchor !== document.body) {
      if (window.getComputedStyle(anchor).position !== "static") break;
      anchor = anchor.parentElement;
    }
    if (!anchor || anchor === document.body) {
      anchor = svg.parentElement;
      if (anchor) anchor.style.position = "relative";
    }
    const anchorRect = anchor.getBoundingClientRect();

    // Container: positioned over the plot area (accounting for SVG's internal translate(0,10))
    const container = document.createElement("div");
    container.className = "st-chart-overlay-container";
    Object.assign(container.style, {
      position: "absolute",
      left: (svgRect.left - anchorRect.left) + "px",
      top: (svgRect.top - anchorRect.top + plotTop * scaleY) + "px",
      width: (plotWidth * scaleX) + "px",
      height: (plotHeight * scaleY) + "px",
      pointerEvents: "none",
      zIndex: "10",
      overflow: "visible",
    });
    anchor.appendChild(container);

    // Drawing overlay

    // Filter shocks to only those matching the chart title (sub-market label above the chart)
    const filtered = filterByChartTitle(shocks);
    if (filtered.length === 0) return; // no shocks for this sub-market

    const visible = filtered.slice(0, 5);
    for (const shock of visible) {
      const t2 = new Date(shock.t2).getTime() / 1000;
      const t1 = new Date(shock.t1).getTime() / 1000;

      // Convert to SVG x coordinates, then scale to screen pixels
      const svgX2 = timeToX(t2);
      const svgX1 = timeToX(t1);
      const x2 = svgX2 * scaleX;
      const x1 = svgX1 * scaleX;

      // Skip if off-screen
      if (x2 < -20 || x2 > (plotWidth * scaleX) + 20) continue;

      const isUp = shock.delta > 0;
      const deltaStr = `${isUp ? "+" : ""}${(shock.delta * 100).toFixed(0)}pp`;

      // Band from t1 to t2
      const bandL = Math.min(x1, x2);
      const bandR = Math.max(x1, x2);
      const bandW = Math.max(4, bandR - bandL);

      const band = document.createElement("div");
      band.className = `st-shock-band ${isUp ? "st-up-shock" : ""}`;
      Object.assign(band.style, {
        position: "absolute",
        left: Math.max(0, bandL) + "px",
        top: "0",
        width: bandW + "px",
        height: "100%",
      });
      container.appendChild(band);

      // Label
      const label = document.createElement("div");
      label.className = `st-shock-label ${isUp ? "st-up-label" : "st-down-label"}`;
      label.textContent = deltaStr;
      band.appendChild(label);

      // Dashed line at t2
      const line = document.createElement("div");
      line.className = "st-shock-line";
      Object.assign(line.style, {
        position: "absolute",
        left: x2 + "px",
        top: "0",
        height: "100%",
      });
      container.appendChild(line);

      // Time tooltip
      const tip = document.createElement("div");
      tip.className = "st-shock-line-tip";
      tip.textContent = new Date(shock.t2).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      line.appendChild(tip);

      // Pulsing dot at the shock price level
      const svgY = priceToY(shock.p_after);
      const dot = document.createElement("div");
      dot.className = "st-shock-dot";
      Object.assign(dot.style, {
        position: "absolute",
        left: x2 + "px",
        top: (svgY * scaleY) + "px",
      });
      container.appendChild(dot);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  3. PANEL (floating info overlay — unchanged logic)
  // ══════════════════════════════════════════════════════════════

  function getMarketTitle() {
    const selectors = [
      'h1[class*="MarketTitle"]', 'h1[class*="market"]', 'h1[class*="question"]',
      '[data-testid="market-title"]', '[data-testid="event-title"]', "h1",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 10) return el.textContent.trim();
    }
    const headings = document.querySelectorAll("h1, h2");
    for (const h of headings) {
      const text = h.textContent.trim();
      if (text.length > 15 && text.length < 300) return text;
    }
    return null;
  }

  /**
   * Filter a list of shocks to only those whose question contains the chart title text.
   * Used by both the panel and chart overlay to show only relevant shocks.
   * Returns the original list if no title is found.
   */
  function filterByChartTitle(shocks) {
    // ── 1. Use the URL slug as primary filter ──
    // e.g. "/event/houthi-military-action-against-israel" → ["houthi", "military", "action", "against", "israel"]
    const slug = getSlugFromUrl();
    if (slug) {
      const slugWords = slug.split("-").filter(w => w.length > 2);
      // Slug filter

      if (slugWords.length > 0) {
        const slugFiltered = shocks.filter(shock => {
          const nq = normalize(shock.question);
          // Most slug words should appear in the shock question (allow a few misses)
          const hits = slugWords.filter(w => nq.includes(w)).length;
          return hits >= slugWords.length - 1;
        });

        if (slugFiltered.length > 0) {
          console.log("[ShockTest] Slug filtered:", slugFiltered.length);

          // ── 2. Then narrow by chart title if available ──
          const chartTitle = getChartTitle();
          if (chartTitle) {
            const nt = normalize(chartTitle);
            const titleWords = nt.split(" ").filter(w => w.length > 1);
            // Narrowing by chart title

            if (titleWords.length > 0) {
              const titleFiltered = slugFiltered.filter(shock => {
                const nq = normalize(shock.question);
                return titleWords.every(w => nq.includes(w));
              });
              if (titleFiltered.length > 0) {
                console.log("[ShockTest] Title narrowed:", titleFiltered.length);
                return titleFiltered;
              }
            }
          }

          return slugFiltered;
        }
      }
    }

    // ── Fallback: chart title only ──
    const chartTitle = getChartTitle();
    if (chartTitle) {
      const nt = normalize(chartTitle);
      const titleWords = nt.split(" ").filter(w => w.length > 1);
      // Fallback: title only

      if (titleWords.length > 0) {
        const filtered = shocks.filter(shock => {
          const nq = normalize(shock.question);
          return titleWords.every(w => nq.includes(w));
        });
        if (filtered.length > 0) {
          console.log("[ShockTest] Title filtered:", filtered.length);
          return filtered;
        }
      }
    }

    // No filter applied
    return shocks;
  }

  function getSlugFromUrl() {
    const match = window.location.pathname.match(/\/event\/([^/]+)/);
    return match ? match[1] : null;
  }

  function findMatchingShocks(title, slug) {
    if (allShocks.length === 0) {
      return [];
    }

    // Use the URL slug to find all shocks for this event
    let matches = [];
    if (slug) {
      const slugWords = slug.split("-").filter(w => w.length > 2);

      if (slugWords.length > 0) {
        matches = allShocks.filter(shock => {
          const nq = normalize(shock.question);
          const hits = slugWords.filter(w => nq.includes(w)).length;
          return hits >= slugWords.length - 1;
        });

        console.log("[ShockTest] Matched:", matches.length, "shocks for", slug);
      }
    }

    if (matches.length === 0) {
      console.log("[ShockTest] No matches for", slug);
      return [];
    }

    // Immediately narrow by chart title if one is visible
    // (don't wait for the chart to open)
    const titleFiltered = filterByChartTitle(matches);
    if (titleFiltered.length > 0 && titleFiltered.length < matches.length) {
      console.log("[ShockTest] Narrowed to", titleFiltered.length);
      return titleFiltered.sort((a, b) => new Date(b.t2).getTime() - new Date(a.t2).getTime());
    }

    return matches.sort((a, b) => new Date(b.t2).getTime() - new Date(a.t2).getTime());
  }

  function createOverlay() {
    const toggle = document.createElement("div");
    toggle.id = "shocktest-toggle";
    toggle.innerHTML = '<span class="st-toggle-dot"></span> ShockTest';
    toggle.addEventListener("click", () => expandPanel());
    document.body.appendChild(toggle);

    const panel = document.createElement("div");
    panel.id = "shocktest-overlay";
    panel.innerHTML = `
      <div class="st-header">
        <div class="st-logo">Shock<span>TEST</span></div>
        <div class="st-header-actions">
          <button class="st-header-btn" id="st-btn-minimize" title="Minimize">\u2212</button>
          <button class="st-header-btn" id="st-btn-close" title="Dismiss">\u00d7</button>
        </div>
      </div>
      <div id="st-content"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector("#st-btn-minimize").addEventListener("click", collapsePanel);
    panel.querySelector("#st-btn-close").addEventListener("click", dismissPanel);
  }

  function collapsePanel() {
    panelCollapsed = true;
    document.getElementById("shocktest-overlay").classList.add("st-hidden");
    document.getElementById("shocktest-toggle").style.display = "flex";
  }

  function expandPanel() {
    panelCollapsed = false;
    document.getElementById("shocktest-overlay").classList.remove("st-hidden");
    document.getElementById("shocktest-toggle").style.display = "none";
  }

  function dismissPanel() {
    document.getElementById("shocktest-overlay").classList.add("st-hidden");
    document.getElementById("shocktest-toggle").style.display = "none";
    const slug = getSlugFromUrl();
    if (slug) {
      chrome.storage.local.get({ dismissedSlugs: [] }, ({ dismissedSlugs }) => {
        if (!dismissedSlugs.includes(slug)) {
          chrome.storage.local.set({ dismissedSlugs: [...dismissedSlugs.slice(-50), slug] });
        }
      });
    }
  }

  function renderShock(shock) {
    const $content = document.getElementById("st-content");
    if (!$content) return;

    const isUp = shock.delta > 0;
    const deltaStr = `${isUp ? "+" : ""}${(shock.delta * 100).toFixed(0)}pp`;
    const rev6h = shock.reversion_6h;
    const hasAi = shock.ai_analysis && shock.ai_analysis.likely_cause;

    let html = `<div class="st-body">`;

    // Market name — important since event pages can have multiple sub-markets
    html += `<div class="st-market-name">${escapeHtml(shock.question)}</div>`;

    html += `
      <div class="st-delta-row">
        <div>
          <div class="st-delta ${isUp ? "st-up" : "st-down"}">${deltaStr}</div>
          <div class="st-delta-label">shock detected</div>
        </div>
        <div style="text-align:right">
          <div class="st-delta-time">${shock.hours_ago != null ? (shock.hours_ago < 1 ? Math.max(1, Math.round(shock.hours_ago * 60)) + "m ago" : Math.round(shock.hours_ago) + "h ago") : timeAgo(shock.t2)}</div>
          ${shock.category ? `<div class="st-delta-label">${escapeHtml(shock.category)}</div>` : ""}
        </div>
      </div>
    `;
    const rev1h = shock.reversion_1h;
    const rev24h = shock.reversion_24h;
    html += `<div class="st-stats">`;
    html += `<div class="st-stat"><div class="st-stat-label">1h Reversion</div><div class="st-stat-value ${rev1h != null && rev1h > 0 ? "st-positive" : ""}">${rev1h != null ? (rev1h > 0 ? "+" : "") + (rev1h * 100).toFixed(1) + "pp" : "pending"}</div></div>`;
    html += `<div class="st-stat"><div class="st-stat-label">6h Reversion</div><div class="st-stat-value ${rev6h != null && rev6h > 0 ? "st-positive" : ""}">${rev6h != null ? (rev6h > 0 ? "+" : "") + (rev6h * 100).toFixed(1) + "pp" : "pending"}</div></div>`;
    html += `<div class="st-stat"><div class="st-stat-label">24h Reversion</div><div class="st-stat-value ${rev24h != null && rev24h > 0 ? "st-positive" : ""}">${rev24h != null ? (rev24h > 0 ? "+" : "") + (rev24h * 100).toFixed(1) + "pp" : "pending"}</div></div>`;
    if (shock.historical_win_rate != null) {
      html += `<div class="st-stat"><div class="st-stat-label">Hist Win Rate</div><div class="st-stat-value st-positive">${(shock.historical_win_rate * 100).toFixed(0)}%</div></div>`;
    }
    html += `</div>`;
    if (hasAi) {
      html += `<div class="st-ai"><div class="st-ai-label">AI Analysis</div><div class="st-ai-text">${escapeHtml(shock.ai_analysis.likely_cause)}</div></div>`;
    }
    html += `<div class="st-prices"><span>${(shock.p_before * 100).toFixed(0)}% \u2192 ${(shock.p_after * 100).toFixed(0)}%</span><span>${shock.source}</span></div>`;
    html += `<a class="st-cta" href="${dashboardBase}/shock/${shock._id}" target="_blank" rel="noopener">Full Analysis on ShockTest \u2192</a>`;
    html += `</div>`;

    // Nav always uses activeShocks — the title-filtered list
    const count = activeShocks.length;

    if (count > 1) {
      html += `<div class="st-nav"><button class="st-nav-btn" id="st-prev">\u2190</button><span>${currentShockIndex + 1} / ${count} shocks</span><button class="st-nav-btn" id="st-next">\u2192</button></div>`;
    }

    $content.innerHTML = html;

    if (count > 1) {
      document.getElementById("st-prev")?.addEventListener("click", () => {
        currentShockIndex = (currentShockIndex - 1 + activeShocks.length) % activeShocks.length;
        renderShock(activeShocks[currentShockIndex]);
      });
      document.getElementById("st-next")?.addEventListener("click", () => {
        currentShockIndex = (currentShockIndex + 1) % activeShocks.length;
        renderShock(activeShocks[currentShockIndex]);
      });
    }
  }

  function renderNoShock() {
    const $content = document.getElementById("st-content");
    if (!$content) return;
    $content.innerHTML = '<div class="st-no-shock">No recent shocks detected for this market.</div>';
  }

  // ══════════════════════════════════════════════════════════════
  //  4. MAIN FLOW
  // ══════════════════════════════════════════════════════════════

  async function checkAndInject() {
    if (!window.location.pathname.includes("/event/")) {
      hideOverlay();
      return;
    }

    const slug = getSlugFromUrl();

    if (slug) {
      const { dismissedSlugs = [] } = await chrome.storage.local.get("dismissedSlugs");
      if (dismissedSlugs.includes(slug)) {
        hideOverlay();
        return;
      }
    }

    // Wait for React to render
    await new Promise(r => setTimeout(r, 1000));

    const title = getMarketTitle();

    if (allShocks.length === 0) {
      try {
        allShocks = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: "GET_SHOCKS" }, response => resolve(response || []));
        });
      } catch { allShocks = []; }
    }

    if (!dashboardBase) {
      const { apiBase } = await chrome.storage.sync.get({ apiBase: "http://localhost:3000" });
      dashboardBase = apiBase.replace(/\/+$/, "");
    }

    matchedShocks = findMatchingShocks(title, slug);
    activeShocks = matchedShocks;
    currentShockIndex = 0;

    if (!document.getElementById("shocktest-overlay")) createOverlay();

    // Don't show the panel yet — wait for the title to be available
    // so we can filter properly before the user ever sees it.
    // Poll until title filter narrows the results (or give up after 5s).
    let titleAttempts = 0;
    function tryFilterAndShow() {
      const filtered = filterByChartTitle(matchedShocks);
      // Title filter actually narrowed results — use it
      if (filtered.length > 0 && filtered.length < matchedShocks.length) {
        activeShocks = filtered;
        currentShockIndex = 0;
        showOverlay();
        renderShock(activeShocks[0]);
        startChartWatcher(activeShocks);
        return;
      }

      titleAttempts++;
      if (titleAttempts < 10) {
        // Try again in 500ms — title element might not be rendered yet
        setTimeout(tryFilterAndShow, 500);
        return;
      }

      // Give up waiting — show whatever we have
      activeShocks = filtered.length > 0 ? filtered : matchedShocks;
      currentShockIndex = 0;
      if (activeShocks.length > 0) {
        showOverlay();
        renderShock(activeShocks[0]);
        startChartWatcher(activeShocks);
      } else {
        showOverlay();
        renderNoShock();
        clearChartOverlay();
        setTimeout(() => {
          if (activeShocks.length === 0 && !panelCollapsed) collapsePanel();
        }, 3000);
      }
    }

    if (matchedShocks.length > 0) {
      tryFilterAndShow();
    } else {
      showOverlay();
      renderNoShock();
      clearChartOverlay();
      setTimeout(() => {
        if (matchedShocks.length === 0 && !panelCollapsed) collapsePanel();
      }, 3000);
    }
  }

  function showOverlay() {
    const panel = document.getElementById("shocktest-overlay");
    const toggle = document.getElementById("shocktest-toggle");
    if (!panel) return;
    if (panelCollapsed) {
      panel.classList.add("st-hidden");
      if (toggle) toggle.style.display = "flex";
    } else {
      panel.classList.remove("st-hidden");
      if (toggle) toggle.style.display = "none";
    }
  }

  function hideOverlay() {
    const panel = document.getElementById("shocktest-overlay");
    const toggle = document.getElementById("shocktest-toggle");
    if (panel) panel.classList.add("st-hidden");
    if (toggle) toggle.style.display = "none";
  }

  // ── SPA navigation ──
  const navObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      matchedShocks = [];
      activeShocks = [];
      currentShockIndex = 0;
      allShocks = [];
      chartPriceData = null;
      allPriceData = {};
      activeTokenId = null;
      lastOverlayFingerprint = "";
      clearChartOverlay();
      checkAndInject();
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  // ── Click listener — redraw overlay when user clicks (timeframe buttons, sub-markets, etc.) ──
  document.addEventListener("click", (e) => {
    // Ignore clicks inside our own overlay panel
    const overlay = document.getElementById("shocktest-overlay");
    const toggle = document.getElementById("shocktest-toggle");
    if (overlay && overlay.contains(e.target)) return;
    if (toggle && toggle.contains(e.target)) return;

    // Short delay to let the chart and title re-render after the click
    setTimeout(() => {
      const titleFiltered = filterByChartTitle(matchedShocks);
      if (titleFiltered.length > 0) {
        // Only reset if the filtered list actually changed
        const changed = titleFiltered.length !== activeShocks.length ||
          titleFiltered.some((s, i) => s._id !== activeShocks[i]?._id);
        if (changed) {
          activeShocks = titleFiltered;
          currentShockIndex = 0;
          renderShock(activeShocks[0]);
        }
        forceChartRedraw(activeShocks);
      } else if (matchedShocks.length > 0) {
        activeShocks = matchedShocks;
        forceChartRedraw(matchedShocks);
      }
    }, 600);
  }, true);

  // ── Init ──
  injectFetchInterceptor();
  checkAndInject();
})();
