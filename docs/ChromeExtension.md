# Chrome Extension Plan — ShockTest

> **Goal:** Bring ShockTest signals to traders where they trade — on Polymarket itself, from the toolbar, and via real-time notifications. Three features, one extension.

---

## Architecture Overview

```
chrome-extension/
├── manifest.json              # V3 manifest — permissions, content scripts, service worker
├── background/
│   └── service-worker.js      # Polls /api/shocks, manages alarms, sends notifications
├── content/
│   ├── polymarket.js          # Injected into polymarket.com — reads market page, injects UI
│   └── polymarket.css         # Styles for injected overlay panels
├── popup/
│   ├── popup.html             # Toolbar popup shell
│   ├── popup.js               # Fetches shocks + stats, renders mini dashboard
│   └── popup.css              # Popup styles
├── options/
│   ├── options.html           # Settings page (API URL, alert preferences, threshold)
│   └── options.js
├── lib/
│   └── api.js                 # Shared fetch helpers — all API calls go through here
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md
```

### Key Decisions

- **Manifest V3** (required for Chrome Web Store as of 2024)
- **No bundler needed** — vanilla JS + CSS keeps it simple for a hackathon. Can add Vite later if needed.
- **Single API base URL** — configurable in options, defaults to the deployed Vercel URL
- **All data comes from our existing Next.js API routes** — no direct MongoDB access from the extension

---

## API Surface (what the extension consumes)

| Endpoint | Method | What It Returns | Used By |
|----------|--------|----------------|---------|
| `/api/shocks` | GET | `Shock[]` — all detected shocks, sorted by magnitude | All 3 features |
| `/api/stats` | GET | `AggregateStats` — reversion rates, sample sizes, backtest | Popup |
| `/api/similar-stats?abs_delta=X&direction=up&category=Y` | GET | Backtest stats for similar shocks | Overlay |
| `/api/shock-advisor` | POST | AI analysis of a specific shock | Overlay (stretch) |

### Key Types (reference `dashboard/lib/types.ts`)

```
Shock {
  _id, market_id, source, question, category,
  t1, t2, p_before, p_after, delta, abs_delta,
  reversion_1h/6h/24h, post_move_1h/6h/24h,
  is_live_alert, is_recent, hours_ago,
  ai_analysis?: { likely_cause, overreaction_assessment, reversion_confidence }
}

AggregateStats {
  total_shocks, total_markets,
  reversion_rate_6h, mean_reversion_6h,
  sample_size_6h, backtest?: { win_rate_6h, avg_pnl_per_dollar_6h }
}
```

---

## Feature 1: Polymarket Overlay

**What:** A content script injected on `polymarket.com` that detects which market the user is viewing and shows ShockTest data inline.

### How It Works

1. **Content script runs on** `https://polymarket.com/*`
2. **Detect the current market:**
   - Parse the page URL for the market slug
   - Scrape the market question text from the DOM (the `<h1>` or main title element)
   - Match it against our shock data by `question` field (fuzzy match) or `market_id`
3. **If a matching shock exists**, inject a floating panel showing:
   - Shock magnitude: "+15pp shock detected 3h ago"
   - Reversion probability: "62% of similar shocks revert within 6h"
   - Mean reversion: "Average reversion: +4.2pp"
   - AI analysis (if available): "Likely cause: ..."
   - Category win rate from backtest
   - Link to full detail page on the dashboard
4. **If no shock**, show a subtle "No recent shocks" indicator or hide entirely

### DOM Injection Strategy

```
Target: polymarket.com/event/<slug>
Inject: A fixed-position panel in the bottom-right corner (draggable)
  OR: An inline card inserted after the market title/price section

Preferred: Bottom-right floating panel — less likely to break with Polymarket DOM changes
```

### Content Script Pseudocode

```js
// polymarket.js

// 1. Extract market info from the page
function getMarketInfo() {
  // Option A: Parse URL slug
  const slug = window.location.pathname.split('/event/')[1]?.split('/')[0];

  // Option B: Read the market question from the DOM
  // Polymarket uses React — look for the main heading
  const title = document.querySelector('h1')?.textContent?.trim();

  return { slug, title };
}

// 2. Fetch shocks from our API and find a match
async function findMatchingShock(title) {
  const shocks = await fetch(`${API_BASE}/api/shocks`).then(r => r.json());

  // Exact match first, then fuzzy
  return shocks.find(s => s.question === title)
      || shocks.find(s => title.includes(s.question) || s.question.includes(title));
}

// 3. Inject the overlay panel
function injectPanel(shock, stats) {
  const panel = document.createElement('div');
  panel.id = 'shocktest-overlay';
  panel.innerHTML = `
    <div class="st-header">
      <span class="st-logo">ShockTest</span>
      <button class="st-close">×</button>
    </div>
    <div class="st-badge ${shock.delta > 0 ? 'st-up' : 'st-down'}">
      ${shock.delta > 0 ? '+' : ''}${(shock.delta * 100).toFixed(0)}pp shock
    </div>
    <div class="st-stat">
      <span class="st-label">Reversion probability</span>
      <span class="st-value">${(stats.win_rate * 100).toFixed(0)}%</span>
    </div>
    <div class="st-stat">
      <span class="st-label">Mean reversion (6h)</span>
      <span class="st-value">${(stats.mean_reversion * 100).toFixed(1)}pp</span>
    </div>
    ${shock.ai_analysis ? `
      <div class="st-ai">
        <span class="st-label">AI Analysis</span>
        <p>${shock.ai_analysis.likely_cause}</p>
      </div>
    ` : ''}
    <a href="${DASHBOARD_URL}/shock/${shock._id}" target="_blank" class="st-link">
      Full analysis →
    </a>
  `;
  document.body.appendChild(panel);
}

// 4. Run on page load + URL changes (Polymarket is an SPA)
let lastUrl = '';
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    checkAndInject();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
checkAndInject();
```

### Styling Notes

- Use a `.st-` prefix on all classes to avoid conflicts with Polymarket's CSS
- Match Polymarket's dark theme (dark bg, white text, rounded corners)
- Keep the panel narrow (~300px) and dismissible
- Store dismiss state in `chrome.storage.local` so it doesn't reappear on same market

### Edge Cases

- Polymarket is a React SPA — URL changes don't trigger page reload. Use MutationObserver or `navigation` API to detect route changes.
- Market question text on Polymarket may differ slightly from what we stored (extra punctuation, etc.) — use normalized fuzzy matching.
- Multiple shocks can exist for the same market — show the most recent one.

---

## Feature 2: Popup Dashboard

**What:** Click the extension icon in the toolbar → mini dashboard showing live shocks, key stats, and quick links.

### Layout (popup.html — 380px wide, ~500px tall max)

```
┌─────────────────────────────────┐
│  ShockTest          [⚙ Settings]│
│  ───────────────────────────────│
│  KEY FINDING                    │
│  62% of shocks revert (6h)     │
│  Based on 247 shocks            │
│  ───────────────────────────────│
│  🔴 LIVE SHOCKS                 │
│  ┌─────────────────────────────┐│
│  │ "Will Trump win?"    +15pp  ││
│  │ 3h ago · Politics    62% rev││
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ "BTC above 100k?"   -12pp  ││
│  │ 1h ago · Crypto      58% rev││
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ "Lakers win Game 5?" +20pp  ││
│  │ 30m ago · Sports     45% rev││
│  └─────────────────────────────┘│
│  ───────────────────────────────│
│  [Open Full Dashboard]          │
└─────────────────────────────────┘
```

### Implementation

```js
// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: 'https://YOUR_VERCEL_URL' });

  // Fetch data in parallel
  const [shocks, stats] = await Promise.all([
    fetch(`${apiBase}/api/shocks`).then(r => r.json()),
    fetch(`${apiBase}/api/stats`).then(r => r.json()),
  ]);

  // Render key finding
  renderKeyFinding(stats);

  // Render live shocks (recent + live alerts, max 5)
  const liveShocks = shocks
    .filter(s => s.is_live_alert || (s.is_recent && (s.hours_ago ?? 999) <= 12))
    .sort((a, b) => (a.hours_ago ?? 999) - (b.hours_ago ?? 999))
    .slice(0, 5);
  renderShockList(liveShocks);

  // "Open Full Dashboard" link
  document.getElementById('open-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: apiBase });
  });
});
```

### Popup Interactions

- **Click a shock card** → opens the detail page (`/shock/{id}`) in a new tab
- **Settings gear** → opens options page to configure API URL, alert threshold
- **Refresh button** → re-fetches data
- **Badge on extension icon** — show count of live alerts (set from service worker)

---

## Feature 3: Notification Alerts

**What:** Background polling that sends Chrome desktop notifications when new shocks are detected.

### Service Worker Flow

```js
// background/service-worker.js

// Poll interval — every 2 minutes (matches dashboard refresh)
const POLL_INTERVAL_MS = 2 * 60 * 1000;

// Track seen shocks to avoid duplicate notifications
// Use chrome.storage.local since service workers can be killed

chrome.alarms.create('poll-shocks', { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'poll-shocks') return;

  const { apiBase, minDelta, enableNotifications } = await chrome.storage.sync.get({
    apiBase: 'https://YOUR_VERCEL_URL',
    minDelta: 0.08,
    enableNotifications: true,
  });

  if (!enableNotifications) return;

  try {
    const shocks = await fetch(`${apiBase}/api/shocks`).then(r => r.json());
    const { seenIds = [] } = await chrome.storage.local.get('seenIds');
    const seenSet = new Set(seenIds);

    // Find new live shocks above threshold
    const newShocks = shocks.filter(s =>
      !seenSet.has(s._id) &&
      s.abs_delta >= minDelta &&
      (s.is_live_alert || (s.hours_ago != null && s.hours_ago <= 1))
    );

    // Send notifications for new shocks
    for (const shock of newShocks.slice(0, 3)) {  // max 3 at a time
      const direction = shock.delta > 0 ? '+' : '';
      chrome.notifications.create(shock._id, {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: `Shock: ${direction}${(shock.delta * 100).toFixed(0)}pp`,
        message: `${shock.question}\n${(shock.p_before * 100).toFixed(0)}% → ${(shock.p_after * 100).toFixed(0)}%`,
        priority: 2,
      });
    }

    // Update seen set (keep last 500 to prevent unbounded growth)
    const updatedSeen = [...seenSet, ...newShocks.map(s => s._id)].slice(-500);
    await chrome.storage.local.set({ seenIds: updatedSeen });

    // Update badge with live alert count
    const liveCount = shocks.filter(s => s.is_live_alert).length;
    chrome.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#F26522' });

  } catch (err) {
    console.error('[ShockTest] Poll failed:', err);
  }
});

// Click notification → open shock detail page
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: 'https://YOUR_VERCEL_URL' });
  chrome.tabs.create({ url: `${apiBase}/shock/${notificationId}` });
});
```

### Notification Preferences (options page)

| Setting | Default | Description |
|---------|---------|-------------|
| Enable notifications | `true` | Master toggle |
| Minimum shock size | `8pp` (0.08) | Only alert for shocks above this threshold |
| Categories | All enabled | Toggle per category (politics, sports, crypto, etc.) |
| Quiet hours | None | Suppress notifications during set hours |
| API base URL | Vercel URL | Points to the deployed dashboard |

---

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "ShockTest — Prediction Market Signals",
  "version": "1.0.0",
  "description": "Detect overreactions in prediction markets. Get live alerts, see reversion signals on Polymarket, and track shocks from your toolbar.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon-48.png"
  },
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["https://polymarket.com/*"],
      "js": ["content/polymarket.js"],
      "css": ["content/polymarket.css"],
      "run_at": "document_idle"
    }
  ],
  "permissions": [
    "alarms",
    "notifications",
    "storage"
  ],
  "host_permissions": [
    "https://polymarket.com/*"
  ],
  "options_page": "options/options.html"
}
```

**Note on host_permissions:** The extension also needs access to your API URL. Since that's configurable, you can either:
- Add your Vercel domain to `host_permissions` explicitly
- Use `"host_permissions": ["https://*.vercel.app/*"]` for dev
- Or prompt the user with `chrome.permissions.request()` at runtime for the configured URL

---

## Build Order

### Phase 1 — Scaffold + Popup (fastest to demo)
1. Create `chrome-extension/` directory with manifest.json
2. Generate placeholder icons from the existing logo SVG
3. Build `lib/api.js` — shared fetch helper with configurable base URL
4. Build `popup/` — HTML + JS + CSS for the mini dashboard
5. Build `options/` — settings page with API URL input
6. **Test:** Load unpacked in chrome://extensions, click icon, see live data

### Phase 2 — Notifications
1. Build `background/service-worker.js` with alarm-based polling
2. Wire up notification creation + click handlers
3. Add badge count for live alerts
4. Add notification preferences to options page
5. **Test:** Wait for a shock (or lower threshold), see desktop notification

### Phase 3 — Polymarket Overlay
1. Build `content/polymarket.js` — market detection + shock matching
2. Build `content/polymarket.css` — floating panel styles
3. Handle SPA navigation (MutationObserver)
4. Add dismiss/collapse behavior with storage persistence
5. **Test:** Navigate to a Polymarket page with a known shock, see overlay

### Phase 4 — Polish
1. Proper icons (export from logo SVG at 16/48/128)
2. Error states (API unreachable, no shocks found)
3. Loading states in popup
4. Smooth animations on overlay panel
5. Dark/light mode matching for overlay (detect Polymarket's theme)

---

## CORS Considerations

The extension's content script runs in the page's context, but `fetch()` from content scripts is subject to CORS. Two approaches:

**Option A (simple):** Make API calls from the **service worker** or **popup** (both have extension origin, and `host_permissions` bypasses CORS). The content script sends messages to the service worker to get data.

**Option B (also simple):** Add CORS headers to your Next.js API routes:
```ts
// In each route.ts, add to response headers:
"Access-Control-Allow-Origin": "*"
```

**Recommended:** Option A — keeps the API locked down, content script communicates via `chrome.runtime.sendMessage()`.

```js
// content/polymarket.js
const shocks = await chrome.runtime.sendMessage({ type: 'GET_SHOCKS' });

// background/service-worker.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SHOCKS') {
    fetch(`${apiBase}/api/shocks`).then(r => r.json()).then(sendResponse);
    return true; // async response
  }
});
```

---

## Testing Checklist

- [ ] Popup loads and shows real data from deployed API
- [ ] Popup shows "no connection" state when API is unreachable
- [ ] Clicking a shock card opens the detail page
- [ ] Badge shows live alert count
- [ ] Notification appears within 2 minutes of a new shock
- [ ] Clicking notification opens detail page
- [ ] Overlay appears on Polymarket market page with a known shock
- [ ] Overlay does NOT appear on markets without shocks
- [ ] Overlay persists across SPA navigation on Polymarket
- [ ] Dismissing overlay is remembered for that market
- [ ] Options page saves and loads settings correctly
- [ ] Extension works after Chrome restart (service worker re-registers)
