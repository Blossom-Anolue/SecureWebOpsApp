// content.js
(function () {
    const BANNER_ID = "pg-banner-root";
  
    function qs(sel, root = document) {
      return root.querySelector(sel);
    }
    function qsa(sel, root = document) {
      return Array.from(root.querySelectorAll(sel));
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
      const existing = document.getElementById(BANNER_ID);
      if (existing) existing.remove();
    }
  
    function renderBanner(result, injectionPoint) {
      removeBanner();
  
      const container = document.createElement("div");
      container.id = BANNER_ID;
      container.className = "pg-banner";
  
      const title = document.createElement("div");
      title.innerHTML = `<strong>Phish Guard:</strong> ${result.level.toUpperCase()} risk <span class="pg-badge">${result.score}/100</span>`;
      container.appendChild(title);
  
      const details = document.createElement("div");
      details.className = "pg-details";
  
      if (result.reasons?.length) {
        const ul = document.createElement("ul");
        ul.className = "pg-list";
        for (const r of result.reasons) {
          const li = document.createElement("li");
          li.textContent = r;
          ul.appendChild(li);
        }
        details.appendChild(ul);
      } else {
        const p = document.createElement("div");
        p.className = "pg-muted";
        p.textContent = "No obvious phishing signals found (heuristics only).";
        details.appendChild(p);
      }
  
      container.appendChild(details);
      (injectionPoint || document.body).prepend(container);
    }
  
    // -----------------------
    // Gmail adapter
    // -----------------------
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
        const m = aria.match(/<([^>]+@[^>]+)>/);
        return m ? m[1].trim() : "";
      },
      getReplyToEmail() {
        const header = qs(".gE.iv.gt") || qs(".adn.ads");
        if (!header) return "";
        const text = header.textContent || "";
        const m = text.match(/reply-to:\s*([^\s<>]+@[^\s<>]+)/i);
        return m ? m[1].trim() : "";
      },
      getBodyText() {
        const body = qs("div.a3s") || qs("div[role='listitem'] div.a3s");
        return (body?.innerText || "").trim();
      },
      getLinks() {
        const bodyRoot = qs("div.a3s") || document;
        const anchors = qsa("a[href]", bodyRoot);
  
        const links = [];
        for (const a of anchors) {
          let href = a.getAttribute("href") || "";
  
          // Gmail Google redirect wrapper -> decode
          try {
            const u = new URL(href);
            if (u.hostname === "www.google.com" && u.pathname === "/url") {
              const q = u.searchParams.get("q");
              if (q) href = q;
            }
          } catch {}
  
          const mismatch = window.PhishGuardRules.displayVsHrefMismatch({
            textContent: a.textContent || "",
            getAttribute: (k) => (k === "href" ? href : a.getAttribute(k))
          });
  
          links.push({
            href,
            text: (a.textContent || "").trim().slice(0, 120),
            mismatch
          });
        }
        return links;
      },
      getInjectionPoint() {
        return qs(".nH .adn") || qs("div[role='main']") || document.body;
      }
    };
  
    // -----------------------
    // Outlook adapter (office365 / office / live)
    // -----------------------
    const outlookAdapter = {
      isEmailOpen() {
        // Must have a main pane and some message body container.
        return !!(
          qs("div[role='main']") &&
          (qs("div[role='document']") ||
            qs("div[aria-label*='Message body']") ||
            qs("article") ||
            qs("iframe"))
        );
      },
      getSubject() {
        // Subject often appears as h1 or heading in main pane
        const main = qs("div[role='main']") || document;
        const h1 = qs("h1", main);
        if (h1?.textContent?.trim()) return h1.textContent.trim();
  
        const heading = qs("div[role='heading']", main);
        return (heading?.textContent || "").trim();
      },
      getSenderEmail() {
        const main = qs("div[role='main']") || document;
  
        // Try common nodes containing email in title
        const candidate =
          qs("[data-testid='message-from']", main) ||
          qs("[aria-label^='From']", main) ||
          qs("span[title*='@']", main) ||
          qs("div[title*='@']", main);
  
        const t = (candidate?.getAttribute("title") || candidate?.textContent || "").trim();
        const m = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        return m ? m[0] : "";
      },
      getReplyToEmail() {
        const main = qs("div[role='main']") || document;
        const text = main.innerText || "";
        const m = text.match(/reply[-\s]?to[:\s]+([^\s<>]+@[^\s<>]+)/i);
        return m ? m[1].trim() : "";
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
  
        // Fallback: some tenants render in iframe
        const iframes = qsa("iframe", main);
        for (const frame of iframes) {
          try {
            const doc = frame.contentDocument;
            const frameBody = doc?.querySelector("div[role='document']") || doc?.body;
            const t = (frameBody?.innerText || "").trim();
            if (t && t.length > 40) return t;
          } catch {
            // cross-origin: ignore
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
  
        const anchors = qsa("a[href]", bodyRoot);
        const links = [];
  
        for (const a of anchors) {
          const href = a.getAttribute("href") || "";
  
          const mismatch = window.PhishGuardRules.displayVsHrefMismatch({
            textContent: a.textContent || "",
            getAttribute: (k) => (k === "href" ? href : a.getAttribute(k))
          });
  
          links.push({
            href,
            text: (a.textContent || "").trim().slice(0, 120),
            mismatch
          });
        }
  
        return links;
      },
      getInjectionPoint() {
        return qs("div[role='main']") || document.body;
      }
    };
  
    function getAdapter(provider) {
      if (provider === "gmail") return gmailAdapter;
      if (provider === "outlook") return outlookAdapter;
      return null;
    }
  
    function analyzeAndShow() {
      if (!window.PhishGuardRules) return;
  
      const provider = detectProvider();
      const adapter = getAdapter(provider);
      if (!adapter) return;
  
      if (!adapter.isEmailOpen()) {
        removeBanner();
        return;
      }
  
      const subject = adapter.getSubject();
      const bodyText = adapter.getBodyText();
  
      if (!subject && !bodyText) {
        removeBanner();
        return;
      }
  
      const senderEmail = adapter.getSenderEmail();
      const replyToEmail = adapter.getReplyToEmail();
      const links = adapter.getLinks();
  
      const result = window.PhishGuardRules.scoreEmail({
        subject,
        bodyText,
        senderEmail,
        replyToEmail,
        links
      });
  
      renderBanner(result, adapter.getInjectionPoint());
    }
  
    // Gmail + Outlook are SPAs: observe changes and rerun
    const observer = new MutationObserver(() => {
      window.clearTimeout(window.__pgTimer);
      window.__pgTimer = window.setTimeout(analyzeAndShow, 250);
    });
  
    observer.observe(document.documentElement, { childList: true, subtree: true });
  
    setTimeout(analyzeAndShow, 900);
  })();