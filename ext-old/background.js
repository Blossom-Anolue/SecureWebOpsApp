const APP_BASE_URL = "http://localhost:8080/dashboard";
const APP_TAB_PATTERNS = [
  "http://localhost:8080/*",
  "https://securewebops.gannon.link/*",
];
const SITE_STORAGE_KEY = "sb-culznwivxwtvrmohstht-auth-token";

async function findAppTab() {
  const tabs = await chrome.tabs.query({ url: APP_TAB_PATTERNS });
  return tabs[0] || null;
}

async function injectSession(tabId, session) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (storageKey, sessionValue) => {
      window.localStorage.setItem(storageKey, JSON.stringify(sessionValue));
    },
    args: [SITE_STORAGE_KEY, session],
  });
}

async function clearSession(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (storageKey) => {
      window.localStorage.removeItem(storageKey);
    },
    args: [SITE_STORAGE_KEY],
  });
}

async function openOrFocusAppTab() {
  const existing = await findAppTab();
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return existing;
  }

  return chrome.tabs.create({ url: APP_BASE_URL });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const handler = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(handler);
        resolve();
      }
    };

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") {
        resolve();
        return;
      }

      chrome.tabs.onUpdated.addListener(handler);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "OPEN_DASHBOARD") {
      const tab = await openOrFocusAppTab();
      sendResponse({ ok: true, tabId: tab?.id ?? null });
      return;
    }

    if (message?.type === "SYNC_SESSION_TO_APP") {
      const tab = await openOrFocusAppTab();
      if (!tab?.id) {
        sendResponse({ ok: false, error: "Could not open SecureWebOps app tab." });
        return;
      }

      await waitForTabComplete(tab.id);
      await injectSession(tab.id, message.session);
      await chrome.tabs.reload(tab.id);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "CLEAR_SESSION_IN_APP") {
      const tab = await findAppTab();
      if (tab?.id) {
        await clearSession(tab.id);
        await chrome.tabs.reload(tab.id);
      }
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    console.error("Background action failed", error);
    sendResponse({ ok: false, error: error?.message || String(error) });
  });

  return true;
});
