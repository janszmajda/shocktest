const DEFAULT_API_BASE = "http://localhost:3000";

// ── API helpers ──

async function getApiBase() {
  const result = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  return result.apiBase.replace(/\/+$/, "");
}

async function apiFetch(path) {
  const base = await getApiBase();
  const url = `${base}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function getShocks() { return apiFetch("/api/shocks"); }
async function getStats() { return apiFetch("/api/stats"); }

// ── DOM refs ──
const $ = (id) => document.getElementById(id);

// ── Helpers ──
function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDelta(delta) {
  return `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}pp`;
}

function formatPct(val) {
  if (val == null) return "\u2014";
  return `${(val * 100).toFixed(0)}%`;
}

function formatPp(val) {
  if (val == null) return "\u2014";
  return `${val > 0 ? "+" : ""}${(val * 100).toFixed(1)}pp`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── State management ──
function showLoading() {
  $("loading").hidden = false;
  $("error").hidden = true;
  $("content").hidden = true;
  $("footer").hidden = true;
  setStatus("loading");
}

function showError(msg) {
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error-msg").textContent = msg;
  $("content").hidden = true;
  $("footer").hidden = true;
  setStatus("disconnected");
}

function showContent() {
  $("loading").hidden = true;
  $("error").hidden = true;
  $("content").hidden = false;
  $("footer").hidden = false;
  setStatus("connected");
}

function setStatus(state) {
  const dot = $("status-dot");
  dot.className = "status-dot " + (state === "connected" ? "connected" : state === "disconnected" ? "disconnected" : "");
  dot.title = state === "connected" ? "Connected" : state === "disconnected" ? "Disconnected" : "Loading...";
}

// ── Render ──
function renderStats(stats) {
  const rate = stats.reversion_rate_6h;
  const $rate = $("reversion-rate");
  if (rate != null) {
    $rate.textContent = `${(rate * 100).toFixed(0)}%`;
    $rate.className = "finding-rate " + (rate > 0.5 ? "positive" : "neutral");
  } else {
    $rate.textContent = "\u2014";
    $rate.className = "finding-rate neutral";
  }

  $("finding-meta").textContent = `Based on ${stats.total_shocks} shocks across ${stats.total_markets} markets`;
  $("stat-shocks").textContent = stats.total_shocks.toLocaleString();
  $("stat-markets").textContent = stats.total_markets.toLocaleString();
  $("stat-winrate").textContent = stats.backtest?.win_rate_6h != null
    ? formatPct(stats.backtest.win_rate_6h) : "\u2014";
  $("stat-mean").textContent = stats.mean_reversion_6h != null
    ? formatPp(stats.mean_reversion_6h) : "\u2014";

  // Last updated timestamp
  $("last-updated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function renderShocks(shocks) {
  const apiBase = await getApiBase();

  // Show all shocks sorted by most recent t2 timestamp
  const list = [...shocks]
    .sort((a, b) => new Date(b.t2).getTime() - new Date(a.t2).getTime())
    .slice(0, 8);

  if (list.length === 0) {
    $("no-shocks").hidden = false;
    $("shocks-list").innerHTML = "";
    return;
  }

  $("no-shocks").hidden = true;
  $("shocks-list").innerHTML = list.map(shock => {
    const isUp = shock.delta > 0;
    const rev6h = shock.reversion_6h;

    return `
      <a class="shock-card" href="${escapeHtml(apiBase)}/shock/${escapeHtml(shock._id)}" target="_blank" rel="noopener">
        <div class="shock-top">
          <div class="shock-meta">
            ${shock.is_live_alert ? '<span class="shock-badge live">LIVE</span>' : ""}
            ${shock.category ? `<span class="shock-badge category">${escapeHtml(shock.category)}</span>` : ""}
            <span class="shock-time">${shock.hours_ago != null ? (shock.hours_ago < 1 ? Math.max(1, Math.round(shock.hours_ago * 60)) + "m ago" : Math.round(shock.hours_ago) + "h ago") : timeAgo(shock.t2)}</span>
          </div>
          <span class="shock-delta ${isUp ? "up" : "down"}">${formatDelta(shock.delta)}</span>
        </div>
        <div class="shock-question">${escapeHtml(shock.question)}</div>
        <div class="shock-bottom">
          <span>${(shock.p_before * 100).toFixed(0)}% \u2192 ${(shock.p_after * 100).toFixed(0)}%</span>
          ${rev6h != null
            ? `<span class="shock-reversion ${rev6h > 0 ? "positive" : "negative"}">${formatPp(rev6h)} rev</span>`
            : '<span class="shock-reversion">pending</span>'
          }
        </div>
      </a>
    `;
  }).join("");
}

// ── Data fetching ──
async function loadData() {
  showLoading();

  // Spin the refresh button
  const refreshBtn = $("btn-refresh");
  refreshBtn.classList.add("spinning");

  try {
    const [shocks, stats] = await Promise.all([getShocks(), getStats()]);
    renderStats(stats);
    await renderShocks(shocks);
    showContent();
  } catch (err) {
    console.error("[ShockTest popup]", err);
    const base = await getApiBase().catch(() => DEFAULT_API_BASE);
    showError(`Could not connect to ${base}. Is the dashboard running?`);
  } finally {
    refreshBtn.classList.remove("spinning");
  }
}

// ── Event listeners ──
document.addEventListener("DOMContentLoaded", () => {
  $("btn-refresh").addEventListener("click", loadData);
  $("btn-retry").addEventListener("click", loadData);
  $("btn-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("btn-dashboard").addEventListener("click", async () => {
    const base = await getApiBase();
    chrome.tabs.create({ url: base });
  });

  loadData();
});
