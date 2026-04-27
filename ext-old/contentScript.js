console.log("✅ contentScript injected on:", location.href);

const SUPABASE_PROJECT_ID = "culznwivxwtvrmohstht";
const STORAGE_KEY = `sb-${SUPABASE_PROJECT_ID}-auth-token`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "GET_SUPABASE_TOKEN") return;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      sendResponse({ ok: false, error: `No token found for key: ${STORAGE_KEY}` });
      return true;
    }

    const parsed = JSON.parse(raw);
    const accessToken = parsed?.access_token;

    if (!accessToken) {
      sendResponse({ ok: false, error: "Token found but access_token missing." });
      return true;
    }

    sendResponse({ ok: true, accessToken });
    return true;
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
    return true;
  }
});