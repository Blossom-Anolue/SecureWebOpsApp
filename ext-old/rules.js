(function () {
  const URGENT_PHRASES = [
    "urgent",
    "immediately",
    "act now",
    "verify your account",
    "verify account",
    "suspended",
    "locked",
    "unusual activity",
    "security alert",
    "payment failed",
    "invoice overdue",
    "password expires",
    "confirm your identity",
    "update billing",
    "wire transfer",
    "gift card",
    "gift cards",
    "click below",
    "login to view",
    "reset password",
  ];

  const SUSPICIOUS_TLDS = [
    "zip",
    "mov",
    "top",
    "xyz",
    "click",
    "country",
    "kim",
    "work",
    "support",
  ];

  const SHORTENERS = new Set([
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "buff.ly",
    "rebrand.ly",
    "rb.gy",
    "is.gd",
    "cutt.ly",
  ]);

  function safeLower(s) {
    return (s || "").toString().toLowerCase();
  }

  function tryParseURL(url) {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  function getRegistrableDomain(hostname) {
    const parts = (hostname || "").split(".").filter(Boolean);
    if (parts.length <= 2) return parts.join(".");
    return parts.slice(-2).join(".");
  }

  function looksLikeIPAddress(hostname) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname || "");
  }

  function hasPunycode(hostname) {
    return (hostname || "").includes("xn--");
  }

  function hasManySubdomains(hostname) {
    const parts = (hostname || "").split(".").filter(Boolean);
    return parts.length >= 4;
  }

  function suspiciousTLD(hostname) {
    const parts = (hostname || "").split(".").filter(Boolean);
    const tld = parts[parts.length - 1] || "";
    return SUSPICIOUS_TLDS.includes(tld);
  }

  function isShortener(hostname) {
    const reg = getRegistrableDomain(hostname);
    return SHORTENERS.has(reg.toLowerCase());
  }

  function textContainsUrgency(text) {
    const t = safeLower(text);
    return URGENT_PHRASES.filter((p) => t.includes(p)).slice(0, 5);
  }

  function displayVsHrefMismatch(anchorLike) {
    const text = (anchorLike.textContent || "").trim();
    const href = anchorLike.getAttribute("href") || "";
    const u = tryParseURL(href.startsWith("http") ? href : "");
    if (!u) return null;

    const urlLike = text.match(/https?:\/\/[^\s]+/i)?.[0];
    if (!urlLike) return null;

    const textUrl = tryParseURL(urlLike);
    if (!textUrl) return null;

    const textDom = getRegistrableDomain(textUrl.hostname);
    const hrefDom = getRegistrableDomain(u.hostname);

    if (textDom && hrefDom && textDom !== hrefDom) {
      return { textDom, hrefDom };
    }
    return null;
  }

  function scoreEmail({ subject, bodyText, senderEmail, replyToEmail, links }) {
    let score = 0;
    const reasons = [];

    const urgencyHits = textContainsUrgency(`${subject}\n${bodyText}`);
    if (urgencyHits.length) {
      score += 20;
      reasons.push(`Urgent/pressure language: ${urgencyHits.join(", ")}`);
    }

    if (senderEmail && replyToEmail && safeLower(senderEmail) !== safeLower(replyToEmail)) {
      score += 20;
      reasons.push(`Reply-To differs from sender (${replyToEmail} vs ${senderEmail})`);
    }

    let suspiciousLinkCount = 0;
    for (const l of links || []) {
      const u = tryParseURL(l.href);
      if (!u) continue;

      const host = u.hostname || "";

      if (u.protocol !== "https:") {
        score += 10;
        suspiciousLinkCount++;
        reasons.push(`Non-HTTPS link: ${host}`);
      }

      if (looksLikeIPAddress(host)) {
        score += 20;
        suspiciousLinkCount++;
        reasons.push(`IP address used as link host: ${host}`);
      }

      if (hasPunycode(host)) {
        score += 25;
        suspiciousLinkCount++;
        reasons.push(`Punycode/IDN domain: ${host}`);
      }

      if (hasManySubdomains(host)) {
        score += 10;
        suspiciousLinkCount++;
        reasons.push(`Many subdomains: ${host}`);
      }

      if (suspiciousTLD(host)) {
        score += 10;
        suspiciousLinkCount++;
        reasons.push(`Suspicious TLD ".${host.split(".").pop()}": ${host}`);
      }

      if (isShortener(host)) {
        score += 15;
        suspiciousLinkCount++;
        reasons.push(`URL shortener used: ${host}`);
      }

      if (l.mismatch) {
        score += 25;
        suspiciousLinkCount++;
        reasons.push(`Misleading link text: shows ${l.mismatch.textDom} but goes to ${l.mismatch.hrefDom}`);
      }
    }

    if (suspiciousLinkCount >= 2) {
      score += 10;
      reasons.push(`Multiple suspicious links detected (${suspiciousLinkCount})`);
    }

    const lowerBody = safeLower(bodyText);
    if (lowerBody.includes("login") && (lowerBody.includes("verify") || lowerBody.includes("confirm"))) {
      score += 10;
      reasons.push("Mentions login with verify/confirm language");
    }

    score = Math.min(100, score);

    let level = "low";
    if (score >= 60) level = "high";
    else if (score >= 35) level = "medium";

    return { score, level, reasons: [...new Set(reasons)].slice(0, 8) };
  }

  window.PhishGuardRules = {
    tryParseURL,
    getRegistrableDomain,
    displayVsHrefMismatch,
    scoreEmail,
  };
})();
