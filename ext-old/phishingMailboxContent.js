(function () {
  const BANNER_ID = "swo-phishing-banner";
  const SESSION_KEY = "securewebopsExtensionSession";
  const MAILBOX_STATUS_KEY = "securewebopsMailboxStatus";
  const SUPABASE_FUNCTION_URL = "https://culznwivxwtvrmohstht.supabase.co/functions/v1/analyze-phishing";
  const MAX_BODY_LENGTH = 5000;

  let lastFingerprint = "";
  let lastBackendFingerprint = "";
  let lastRenderedResult = null;

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function detectProvider() {
    const host = location.hostname.toLowerCase();
    if (host.includes("mail.google.com")) return "gmail";
    if (
      host.includes("outlook.office365.com") ||
      host.includes("outlook.office.com") ||
      host.includes("outlook.live.com")
    ) {
      return "outlook";
    }
    return "unknown";
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function createBanner(result, provider, savedToDashboard) {
    const container = document.createElement("div");
    container.id = BANNER_ID;
    container.className = `swo-risk-${result.level || result.riskLevel || "low"}`;

    const score = Number(result.score ?? result.riskScore ?? 0);
    const level = (result.level || result.riskLevel || "low").toUpperCase();
    const reasons = result.reasons || result.redFlags?.map((flag) => flag.title) || [];

    container.innerHTML = `
      <div class="swo-banner-header">
        <div class="swo-banner-title">SecureWebOps Phishing Check</div>
        <div class="swo-banner-badge">${level} · ${score}/100</div>
      </div>
      <div class="swo-banner-meta">
        ${provider === "gmail" ? "Gmail" : "Outlook"} message analysis${savedToDashboard ? " · saved to your SecureWebOps history" : " · local extension analysis"}
      </div>
      <ul class="swo-banner-list">
        ${(reasons.length ? reasons : ["No obvious phishing indicators were detected by the current checks."])
          .slice(0, 5)
          .map((reason) => `<li>${escapeHtml(reason)}</li>`)
          .join("")}
      </ul>
      <div class="swo-banner-footer">
        ${savedToDashboard
          ? "This result was saved under your personal SecureWebOps account."
          : "Sign in to the SecureWebOps extension if you want these mailbox checks saved to your dashboard."}
      </div>
    `;

    return container;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const gmailAdapter = {
    isEmailOpen() {
      return !!(qs("div.a3s") || qs("h2.hP") || qs("h2[data-thread-perm-id]"));
    },
    getSubject() {
      const h2 = qs("h2.hP") || qs("h2[data-thread-perm-id]");
      return (h2?.textContent || "").trim();
    },
    getSenderEmail() {
      const senderEl = qs(".gD") || qs("[email]");
      const emailAttr = senderEl?.getAttribute("email");
      if (emailAttr) return emailAttr.trim();

      const aria = senderEl?.getAttribute("aria-label") || "";
      const match = aria.match(/<([^>]+@[^>]+)>/);
      return match ? match[1].trim() : "";
    },
    getReplyToEmail() {
      const header = qs(".gE.iv.gt") || qs(".adn.ads");
      const text = header?.textContent || "";
      const match = text.match(/reply-to:\s*([^\s<>]+@[^\s<>]+)/i);
      return match ? match[1].trim() : "";
    },
    getBodyText() {
      const body = qs("div.a3s") || qs("div[role='listitem'] div.a3s");
      return (body?.innerText || "").trim();
    },
    getLinks() {
      const bodyRoot = qs("div.a3s") || document;
      const anchors = qsa("a[href]", bodyRoot);
      return anchors.map((anchor) => {
        let href = anchor.getAttribute("href") || "";
        try {
          const url = new URL(href);
          if (url.hostname === "www.google.com" && url.pathname === "/url") {
            href = url.searchParams.get("q") || href;
          }
        } catch {
          // Ignore malformed Gmail redirect wrapper
        }

        return {
          href,
          text: (anchor.textContent || "").trim().slice(0, 120),
          mismatch: window.PhishGuardRules.displayVsHrefMismatch({
            textContent: anchor.textContent || "",
            getAttribute: (key) => (key === "href" ? href : anchor.getAttribute(key)),
          }),
        };
      });
    },
    getInjectionPoint() {
      return qs(".nH .adn") || qs("div[role='main']") || document.body;
    },
  };

  const outlookAdapter = {
    isEmailOpen() {
      return !!(
        qs("div[role='main']") &&
        (qs("div[role='document']") ||
          qs("div[aria-label*='Message body']") ||
          qs("article") ||
          qs("iframe"))
      );
    },
    getSubject() {
      const main = qs("div[role='main']") || document;
      const h1 = qs("h1", main);
      if (h1?.textContent?.trim()) return h1.textContent.trim();
      const heading = qs("div[role='heading']", main);
      return (heading?.textContent || "").trim();
    },
    getSenderEmail() {
      const main = qs("div[role='main']") || document;
      const candidate =
        qs("[data-testid='message-from']", main) ||
        qs("[aria-label^='From']", main) ||
        qs("span[title*='@']", main) ||
        qs("div[title*='@']", main);

      const text = (candidate?.getAttribute("title") || candidate?.textContent || "").trim();
      const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match ? match[0] : "";
    },
    getReplyToEmail() {
      const main = qs("div[role='main']") || document;
      const text = main.innerText || "";
      const match = text.match(/reply[-\s]?to[:\s]+([^\s<>]+@[^\s<>]+)/i);
      return match ? match[1].trim() : "";
    },
    getBodyText() {
      const main = qs("div[role='main']") || document;
      const body =
        qs("div[aria-label*='Message body']", main) ||
        qs("div[role='document']", main) ||
        qs("article", main) ||
        qs("div[data-testid='message-body']", main);

      let text = (body?.innerText || "").trim();
      if (text) return text;

      const iframes = qsa("iframe", main);
      for (const frame of iframes) {
        try {
          const doc = frame.contentDocument;
          const frameBody = doc?.querySelector("div[role='document']") || doc?.body;
          text = (frameBody?.innerText || "").trim();
          if (text && text.length > 40) return text;
        } catch {
          // Ignore cross-origin frames.
        }
      }

      return "";
    },
    getLinks() {
      const main = qs("div[role='main']") || document;
      const bodyRoot =
        qs("div[aria-label*='Message body']", main) ||
        qs("div[role='document']", main) ||
        qs("article", main) ||
        main;

      return qsa("a[href]", bodyRoot).map((anchor) => {
        const href = anchor.getAttribute("href") || "";
        return {
          href,
          text: (anchor.textContent || "").trim().slice(0, 120),
          mismatch: window.PhishGuardRules.displayVsHrefMismatch({
            textContent: anchor.textContent || "",
            getAttribute: (key) => (key === "href" ? href : anchor.getAttribute(key)),
          }),
        };
      });
    },
    getInjectionPoint() {
      return qs("div[role='main']") || document.body;
    },
  };

  function getAdapter(provider) {
    if (provider === "gmail") return gmailAdapter;
    if (provider === "outlook") return outlookAdapter;
    return null;
  }

  async function getSession() {
    const data = await chrome.storage.local.get([SESSION_KEY]);
    return data[SESSION_KEY] || null;
  }

  async function setMailboxStatus(partial) {
    const data = await chrome.storage.local.get([MAILBOX_STATUS_KEY]);
    const current = data[MAILBOX_STATUS_KEY] || {};
    await chrome.storage.local.set({
      [MAILBOX_STATUS_KEY]: {
        ...current,
        ...partial,
      },
    });
  }

  async function runSavedAnalysis(payload) {
    const session = await getSession();
    if (!session?.access_token) return null;

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`SecureWebOps phishing save failed (${response.status})`);
    }

    return response.json();
  }

  function renderResult(result, injectionPoint, provider, savedToDashboard) {
    removeBanner();
    const banner = createBanner(result, provider, savedToDashboard);
    (injectionPoint || document.body).prepend(banner);
  }

  async function analyzeMailbox() {
    if (!window.PhishGuardRules) return;

    const provider = detectProvider();
    const adapter = getAdapter(provider);
    if (!adapter || !adapter.isEmailOpen()) {
      removeBanner();
      await setMailboxStatus({
        active: false,
        state: "inactive",
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }

    const subject = adapter.getSubject();
    const bodyText = adapter.getBodyText();
    const senderEmail = adapter.getSenderEmail();
    const replyToEmail = adapter.getReplyToEmail();
    const links = adapter.getLinks();

    if (!subject && !bodyText) {
      removeBanner();
      await setMailboxStatus({
        active: false,
        state: "inactive",
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }

    const normalizedBody = bodyText.slice(0, MAX_BODY_LENGTH);
    const fingerprint = JSON.stringify({
      provider,
      subject,
      senderEmail,
      replyToEmail,
      preview: normalizedBody.slice(0, 400),
    });

    if (fingerprint === lastFingerprint && lastRenderedResult) {
      renderResult(lastRenderedResult.result, adapter.getInjectionPoint(), provider, lastRenderedResult.savedToDashboard);
      await setMailboxStatus({
        active: true,
        state: "active",
        provider,
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }

    lastFingerprint = fingerprint;

    const localResult = window.PhishGuardRules.scoreEmail({
      subject,
      bodyText: normalizedBody,
      senderEmail,
      replyToEmail,
      links,
    });

    renderResult(localResult, adapter.getInjectionPoint(), provider, false);
    await setMailboxStatus({
      active: true,
      state: "active",
      provider,
      lastSeenAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      saveStatus: "not_saved",
      lastRiskLevel: localResult.level,
      lastScore: localResult.score,
      lastReasons: localResult.reasons || [],
    });

    try {
      if (fingerprint === lastBackendFingerprint) {
        lastRenderedResult = { result: localResult, savedToDashboard: false };
        return;
      }

      const savedResult = await runSavedAnalysis({
        type: "email",
        content: normalizedBody,
        subject,
        senderEmail,
      });

      lastBackendFingerprint = fingerprint;
      lastRenderedResult = { result: savedResult, savedToDashboard: true };
      renderResult(savedResult, adapter.getInjectionPoint(), provider, true);
      await setMailboxStatus({
        active: true,
        state: "active",
        provider,
        lastSeenAt: new Date().toISOString(),
        lastAnalyzedAt: new Date().toISOString(),
        saveStatus: "saved",
        savedAt: new Date().toISOString(),
        savedCheckId: savedResult.id || null,
        lastRiskLevel: savedResult.riskLevel,
        lastScore: savedResult.riskScore,
        lastReasons: (savedResult.redFlags || []).map((flag) => flag.title),
      });
    } catch {
      lastRenderedResult = { result: localResult, savedToDashboard: false };
      const session = await getSession();
      await setMailboxStatus({
        active: true,
        state: "active",
        provider,
        lastSeenAt: new Date().toISOString(),
        lastAnalyzedAt: new Date().toISOString(),
        saveStatus: session?.access_token ? "save_failed" : "sign_in_required",
        lastRiskLevel: localResult.level,
        lastScore: localResult.score,
        lastReasons: localResult.reasons || [],
      });
    }
  }

  const observer = new MutationObserver(() => {
    window.clearTimeout(window.__swoPhishingTimer);
    window.__swoPhishingTimer = window.setTimeout(analyzeMailbox, 300);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(analyzeMailbox, 1000);
})();
