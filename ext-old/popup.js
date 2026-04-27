const CONFIG = {
  apiBaseUrl: "http://localhost:3000",
  appBaseUrl: "http://localhost:8080",
  supabaseUrl: "https://culznwivxwtvrmohstht.supabase.co",
  supabasePublishableKey: "sb_publishable_m_7Q5T4ZLLuFsiZK7-N1xw_V7KbRTBx",
  projectId: "culznwivxwtvrmohstht",
};

const STORAGE_KEYS = {
  session: "securewebopsExtensionSession",
  lastScanId: "securewebopsLastScanId",
  lastScanResult: "securewebopsLastScanResult",
  mailboxStatus: "securewebopsMailboxStatus",
};

const dom = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();

  const session = await getValidSession();
  renderAuthState(session);

  if (session) {
    const storedResult = await getStorageValue(STORAGE_KEYS.lastScanResult);
    if (storedResult) {
      renderResult(storedResult);
    }
  }

  const mailboxStatus = await getStorageValue(STORAGE_KEYS.mailboxStatus);
  renderMailboxStatus(mailboxStatus);

  setStatus("Ready.");
});

function bindElements() {
  dom.authSection = document.getElementById("authSection");
  dom.loggedOutView = document.getElementById("loggedOutView");
  dom.loggedInView = document.getElementById("loggedInView");
  dom.emailInput = document.getElementById("emailInput");
  dom.passwordInput = document.getElementById("passwordInput");
  dom.signInBtn = document.getElementById("signInBtn");
  dom.signOutBtn = document.getElementById("signOutBtn");
  dom.accountEmail = document.getElementById("accountEmail");
  dom.scanSection = document.getElementById("scanSection");
  dom.urlInput = document.getElementById("urlInput");
  dom.scanBtn = document.getElementById("scanBtn");
  dom.openDashboard = document.getElementById("openDashboard");
  dom.resultSection = document.getElementById("resultSection");
  dom.scoreRing = document.getElementById("scoreRing");
  dom.scoreValue = document.getElementById("scoreValue");
  dom.resultTarget = document.getElementById("resultTarget");
  dom.resultRisk = document.getElementById("resultRisk");
  dom.criticalCount = document.getElementById("criticalCount");
  dom.highCount = document.getElementById("highCount");
  dom.mediumCount = document.getElementById("mediumCount");
  dom.lowCount = document.getElementById("lowCount");
  dom.status = document.getElementById("status");
  dom.mailboxProtectionState = document.getElementById("mailboxProtectionState");
  dom.mailboxSaveState = document.getElementById("mailboxSaveState");
  dom.mailboxLastScore = document.getElementById("mailboxLastScore");
  dom.mailboxProvider = document.getElementById("mailboxProvider");
}

function bindEvents() {
  dom.signInBtn.addEventListener("click", handleSignIn);
  dom.signOutBtn.addEventListener("click", handleSignOut);
  dom.scanBtn.addEventListener("click", handleScan);
  dom.openDashboard.addEventListener("click", handleOpenDashboard);
}

function setStatus(message) {
  dom.status.textContent = message;
}

function normalizeUrl(input) {
  let value = (input || "").trim();
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderAuthState(session) {
  const loggedIn = !!session?.access_token;
  dom.loggedOutView.classList.toggle("hidden", loggedIn);
  dom.loggedInView.classList.toggle("hidden", !loggedIn);
  dom.scanSection.classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    dom.accountEmail.textContent = session.user?.email || "Signed in";
  } else {
    dom.accountEmail.textContent = "";
    dom.resultSection.classList.add("hidden");
  }
}

function scoreColor(score) {
  if (score >= 85) return "#28c76f";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function renderResult(result) {
  const score = Number(result?.score ?? 0);
  const degrees = Math.max(0, Math.min(100, score)) * 3.6;
  const color = scoreColor(score);

  dom.resultSection.classList.remove("hidden");
  dom.scoreRing.style.background = `conic-gradient(${color} ${degrees}deg, #173456 ${degrees}deg)`;
  dom.scoreValue.textContent = Number.isFinite(score) ? String(score) : "--";
  dom.resultTarget.textContent = result?.targetUrl || "Latest scan";
  dom.resultRisk.textContent = `Risk: ${result?.risk || "unknown"}`;
  dom.criticalCount.textContent = String(result?.counts?.critical || 0);
  dom.highCount.textContent = String(result?.counts?.high || 0);
  dom.mediumCount.textContent = String(result?.counts?.medium || 0);
  dom.lowCount.textContent = String(result?.counts?.low || 0);
}

function formatRelativeMailboxTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  return `${diffHours} hours ago`;
}

function renderMailboxStatus(mailboxStatus) {
  const recent = mailboxStatus?.lastSeenAt && (Date.now() - new Date(mailboxStatus.lastSeenAt).getTime()) < 5 * 60 * 1000;
  const protectionText = recent && mailboxStatus?.active
    ? `Active on ${mailboxStatus.provider || "mailbox"}`
    : "Open Gmail or Outlook";

  let saveText = "No mailbox result yet";
  if (mailboxStatus?.saveStatus === "saved") {
    saveText = `Saved ${formatRelativeMailboxTime(mailboxStatus.savedAt)}`.trim();
  } else if (mailboxStatus?.saveStatus === "sign_in_required") {
    saveText = "Sign in to save";
  } else if (mailboxStatus?.saveStatus === "save_failed") {
    saveText = "Save failed";
  } else if (mailboxStatus?.saveStatus === "not_saved" && mailboxStatus?.lastAnalyzedAt) {
    saveText = "Local detection only";
  }

  const scoreText = mailboxStatus?.saveStatus === "saved"
    ? `${mailboxStatus.lastScore ?? "--"}/100`
    : mailboxStatus?.lastScore != null
      ? `${mailboxStatus.lastScore}/100 (local)`
      : "--";

  dom.mailboxProtectionState.textContent = protectionText;
  dom.mailboxSaveState.textContent = saveText;
  dom.mailboxLastScore.textContent = scoreText;
  dom.mailboxProvider.textContent = mailboxStatus?.provider
    ? mailboxStatus.provider.charAt(0).toUpperCase() + mailboxStatus.provider.slice(1)
    : "Gmail / Outlook";
}

async function setStorageValue(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function getStorageValue(key) {
  const data = await chrome.storage.local.get([key]);
  return data[key] ?? null;
}

async function removeStorageKeys(keys) {
  await chrome.storage.local.remove(keys);
}

async function signInWithPassword(email, password) {
  const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.supabasePublishableKey,
      Authorization: `Bearer ${CONFIG.supabasePublishableKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.error_description || payload?.error || "Sign in failed");
  }

  return payload;
}

async function refreshSession(refreshToken) {
  const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.supabasePublishableKey,
      Authorization: `Bearer ${CONFIG.supabasePublishableKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.error_description || payload?.error || "Session refresh failed");
  }

  return payload;
}

async function getValidSession() {
  const session = await getStorageValue(STORAGE_KEYS.session);
  if (!session?.access_token) return null;

  const expiresAt = Number(session.expires_at || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (expiresAt && expiresAt - nowSeconds > 60) {
    return session;
  }

  if (!session.refresh_token) {
    await removeStorageKeys([STORAGE_KEYS.session]);
    return null;
  }

  try {
    const refreshed = await refreshSession(session.refresh_token);
    await setStorageValue(STORAGE_KEYS.session, refreshed);
    return refreshed;
  } catch {
    await removeStorageKeys([STORAGE_KEYS.session]);
    return null;
  }
}

async function callExtensionEventApi(session, eventType, details = {}) {
  try {
    await fetch(`${CONFIG.apiBaseUrl}/api/extension/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ eventType, details }),
    });
  } catch (error) {
    console.error("Failed to log extension event", error);
  }
}

async function handleSignIn() {
  const email = dom.emailInput.value.trim();
  const password = dom.passwordInput.value;

  if (!email || !password) {
    setStatus("Enter your email and password.");
    return;
  }

  dom.signInBtn.disabled = true;
  setStatus("Signing in...");

  try {
    const session = await signInWithPassword(email, password);
    await setStorageValue(STORAGE_KEYS.session, session);
    renderAuthState(session);
    await callExtensionEventApi(session, "extension.sign_in", { email: session.user?.email || email });
    await chrome.runtime.sendMessage({ type: "SYNC_SESSION_TO_APP", session });
    setStatus("Signed in. Your extension and app session are now linked.");
  } catch (error) {
    setStatus(error?.message || "Sign in failed.");
  } finally {
    dom.signInBtn.disabled = false;
  }
}

async function handleSignOut() {
  const session = await getStorageValue(STORAGE_KEYS.session);
  if (session?.access_token) {
    await callExtensionEventApi(session, "extension.sign_out", { email: session.user?.email || null });
  }

  await removeStorageKeys([
    STORAGE_KEYS.session,
    STORAGE_KEYS.lastScanId,
    STORAGE_KEYS.lastScanResult,
    STORAGE_KEYS.mailboxStatus,
  ]);

  dom.emailInput.value = "";
  dom.passwordInput.value = "";
  dom.urlInput.value = "";
  renderAuthState(null);
  renderMailboxStatus(null);
  await chrome.runtime.sendMessage({ type: "CLEAR_SESSION_IN_APP" });
  setStatus("Signed out.");
}

async function queueScan(session, targetUrl) {
  const response = await fetch(`${CONFIG.apiBaseUrl}/api/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      target_url: targetUrl,
      scan_type: "quick",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Scan failed with status ${response.status}`);
  }

  return payload;
}

async function fetchScanStatus(scanId) {
  const session = await getValidSession();
  const response = await fetch(`${CONFIG.apiBaseUrl}/api/scans/v1/scans/${scanId}`, {
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Status check failed with ${response.status}`);
  }
  return payload;
}

async function fetchScanResults(scanId) {
  const session = await getValidSession();
  const response = await fetch(`${CONFIG.apiBaseUrl}/api/scans/v1/scans/${scanId}/results`, {
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Result fetch failed with ${response.status}`);
  }
  return payload;
}

async function pollForResults(session, scanId, targetUrl) {
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const scan = await fetchScanStatus(scanId);

    if (scan.status === "completed") {
      const result = await fetchScanResults(scanId);
      const score = result?.summary?.score ?? 0;
      const counts = result?.summary?.issue_counts || { critical: 0, high: 0, medium: 0, low: 0 };
      const normalizedResult = {
        scanId,
        targetUrl,
        score,
        risk: result?.summary?.risk || "unknown",
        counts,
      };

      await setStorageValue(STORAGE_KEYS.lastScanResult, normalizedResult);
      renderResult(normalizedResult);
      await callExtensionEventApi(session, "extension.scan_result_viewed", {
        scanId,
        targetUrl,
        score,
        counts,
      });
      setStatus(`Scan complete. Score: ${score}/100`);
      return;
    }

    if (scan.status === "failed" || scan.status === "canceled") {
      throw new Error(scan.error || "Scan failed.");
    }

    setStatus(`Scanning... (${scan.status})`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Scan is still running. Reopen the extension in a moment to check again.");
}

async function handleScan() {
  const targetUrl = normalizeUrl(dom.urlInput.value);
  if (!targetUrl) {
    setStatus("Enter a valid URL.");
    return;
  }

  const session = await getValidSession();
  if (!session) {
    renderAuthState(null);
    setStatus("Sign in first.");
    return;
  }

  dom.scanBtn.disabled = true;
  setStatus("Queueing scan...");

  try {
    const queued = await queueScan(session, targetUrl);
    const scanId = queued.scanId || queued.scan_id;
    await setStorageValue(STORAGE_KEYS.lastScanId, scanId);
    await callExtensionEventApi(session, "extension.scan_queued", { scanId, targetUrl, scanType: "quick" });
    setStatus("Scan queued. Waiting for results...");
    await pollForResults(session, scanId, targetUrl);
  } catch (error) {
    setStatus(error?.message || "Scan failed.");
  } finally {
    dom.scanBtn.disabled = false;
  }
}

async function handleOpenDashboard() {
  const session = await getValidSession();
  if (session) {
    await chrome.runtime.sendMessage({ type: "SYNC_SESSION_TO_APP", session });
  }
  await chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
}
