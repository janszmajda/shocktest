/** Background service worker — polls for new shocks and sends notifications */

const DEFAULT_API_BASE = "http://localhost:3000";
const POLL_ALARM = "poll-shocks";

// ── Alarm setup ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 2 });
  pollShocks(); // run immediately on install
});

// ── Alarm handler ──
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollShocks();
});

// ── Main poll function ──
async function pollShocks() {
  const { apiBase, minDelta, enableNotifications } = await chrome.storage.sync.get({
    apiBase: DEFAULT_API_BASE,
    minDelta: 0.08,
    enableNotifications: true,
  });

  const base = apiBase.replace(/\/+$/, "");

  try {
    const res = await fetch(`${base}/api/shocks`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const shocks = await res.json();

    // Update badge with live alert count
    const liveCount = shocks.filter(s => s.is_live_alert).length;
    chrome.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#F26522" });

    // Send notifications for new shocks
    if (!enableNotifications) return;

    const { seenIds = [] } = await chrome.storage.local.get("seenIds");
    const seenSet = new Set(seenIds);

    const newShocks = shocks.filter(s =>
      !seenSet.has(s._id) &&
      s.abs_delta >= minDelta &&
      (s.is_live_alert || (s.hours_ago != null && s.hours_ago <= 1))
    );

    for (const shock of newShocks.slice(0, 3)) {
      const dir = shock.delta > 0 ? "+" : "";
      chrome.notifications.create(shock._id, {
        type: "basic",
        iconUrl: "../icons/icon-128.png",
        title: `Shock: ${dir}${(shock.delta * 100).toFixed(0)}pp`,
        message: `${shock.question}\n${(shock.p_before * 100).toFixed(0)}% → ${(shock.p_after * 100).toFixed(0)}%`,
        priority: 2,
      });
    }

    // Persist seen IDs (cap at 500)
    const updatedSeen = [...seenSet, ...newShocks.map(s => s._id)].slice(-500);
    await chrome.storage.local.set({ seenIds: updatedSeen });

  } catch (err) {
    console.error("[ShockTest bg] Poll failed:", err);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
}

// ── Notification click → open detail page ──
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  const base = apiBase.replace(/\/+$/, "");
  chrome.tabs.create({ url: `${base}/shock/${notificationId}` });
  chrome.notifications.clear(notificationId);
});

// ── Message handler for content scripts / popup ──
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_SHOCKS") {
    chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE }).then(({ apiBase }) => {
      const base = apiBase.replace(/\/+$/, "");
      fetch(`${base}/api/shocks`)
        .then(r => r.json())
        .then(sendResponse)
        .catch(() => sendResponse([]));
    });
    return true; // async
  }

  if (msg.type === "GET_STATS") {
    chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE }).then(({ apiBase }) => {
      const base = apiBase.replace(/\/+$/, "");
      fetch(`${base}/api/stats`)
        .then(r => r.json())
        .then(sendResponse)
        .catch(() => sendResponse(null));
    });
    return true;
  }
});
