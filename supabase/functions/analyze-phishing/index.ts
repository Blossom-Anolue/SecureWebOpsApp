import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const SUSPICIOUS_TLDS = new Set([
  "zip",
  "mov",
  "top",
  "xyz",
  "click",
  "country",
  "kim",
  "work",
  "support",
]);

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

const TRUSTED_BRANDS = [
  "microsoft",
  "office365",
  "outlook",
  "google",
  "gmail",
  "paypal",
  "apple",
  "amazon",
  "chase",
  "bank of america",
  "wells fargo",
  "gannon",
];

interface PhishingAnalysisRequest {
  type: "email" | "link";
  content: string;
  subject?: string;
  senderEmail?: string;
  organizationId?: string | null;
}

interface RedFlag {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  weight: number;
}

interface AnalysisResult {
  riskLevel: "high" | "medium" | "low";
  riskScore: number;
  verdict: string;
  redFlags: Array<Omit<RedFlag, "weight">>;
}

function safeLower(value: string | null | undefined) {
  return (value || "").toLowerCase();
}

function tryParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getRegistrableDomain(hostname: string) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function extractUrls(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return [...new Set(matches)];
}

function looksLikeIpAddress(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function hasManySubdomains(hostname: string) {
  return hostname.split(".").filter(Boolean).length >= 4;
}

function hasPunycode(hostname: string) {
  return hostname.includes("xn--");
}

function hasSensitiveRequest(text: string) {
  const normalized = safeLower(text);
  return [
    "password",
    "passcode",
    "verification code",
    "bank account",
    "social security",
    "credit card",
    "gift card",
    "wire transfer",
  ].some((term) => normalized.includes(term));
}

function hasCredentialHarvestPattern(text: string) {
  const normalized = safeLower(text);
  return (
    normalized.includes("login") &&
    (normalized.includes("verify") ||
      normalized.includes("confirm") ||
      normalized.includes("unlock") ||
      normalized.includes("reset"))
  );
}

function getUrgencyHits(text: string) {
  const normalized = safeLower(text);
  return URGENT_PHRASES.filter((phrase) => normalized.includes(phrase)).slice(0, 5);
}

function addFlag(flags: RedFlag[], title: string, description: string, severity: RedFlag["severity"], weight: number) {
  const exists = flags.some((flag) => flag.title === title && flag.description === description);
  if (!exists) {
    flags.push({ title, description, severity, weight });
  }
}

function analyzeUrl(url: string, source: "email" | "link", flags: RedFlag[]) {
  const parsed = tryParseUrl(url);
  if (!parsed) {
    addFlag(flags, "Invalid URL format", "The supplied link is malformed or incomplete, which is common in phishing lures.", "medium", 20);
    return;
  }

  const hostname = parsed.hostname.toLowerCase();
  const registrableDomain = getRegistrableDomain(hostname);

  if (parsed.protocol !== "https:") {
    addFlag(flags, "Non-HTTPS link", `The ${source} points to ${hostname} over HTTP instead of HTTPS.`, "medium", 15);
  }

  if (looksLikeIpAddress(hostname)) {
    addFlag(flags, "IP address used as host", `The link uses the IP address ${hostname} instead of a normal domain name.`, "high", 30);
  }

  if (hasPunycode(hostname)) {
    addFlag(flags, "Lookalike domain encoding", `The hostname ${hostname} uses punycode, which can hide lookalike characters.`, "high", 30);
  }

  if (hasManySubdomains(hostname)) {
    addFlag(flags, "Excessive subdomains", `The hostname ${hostname} uses many subdomains, which is often used to disguise the real destination.`, "medium", 12);
  }

  const tld = hostname.split(".").pop() || "";
  if (SUSPICIOUS_TLDS.has(tld)) {
    addFlag(flags, "Suspicious top-level domain", `The link uses .${tld}, which is frequently abused in phishing campaigns.`, "medium", 12);
  }

  if (SHORTENERS.has(registrableDomain)) {
    addFlag(flags, "Shortened URL", `The link uses the shortened domain ${registrableDomain}, which hides the final destination.`, "medium", 18);
  }

  if (parsed.username || parsed.password || url.includes("@")) {
    addFlag(flags, "Misleading URL structure", "The link contains an @ sign or embedded credentials, which can hide the true destination.", "high", 22);
  }

  if (/[0-9a-f]{16,}/i.test(parsed.pathname) || parsed.href.length > 140) {
    addFlag(flags, "Obfuscated link path", "The URL path appears unusually long or obfuscated, which is common in credential-harvesting links.", "medium", 12);
  }

  const normalizedHref = safeLower(parsed.href);
  if (["login", "signin", "verify", "secure", "account", "reset"].some((term) => normalizedHref.includes(term))) {
    addFlag(flags, "Credential-themed destination", "The link appears to lead to a login, verification, or account recovery page.", "medium", 10);
  }

  const brandHits = TRUSTED_BRANDS.filter((brand) => normalizedHref.includes(brand));
  if (brandHits.length > 0 && !brandHits.some((brand) => registrableDomain.includes(brand.replace(/\s+/g, "")))) {
    addFlag(flags, "Brand impersonation in URL", `The URL references ${brandHits[0]} but resolves to ${registrableDomain}.`, "high", 24);
  }
}

function analyzeEmail(subject: string, senderEmail: string, content: string) {
  const flags: RedFlag[] = [];
  const combined = `${subject}\n${content}`;
  const urgencyHits = getUrgencyHits(combined);

  if (urgencyHits.length > 0) {
    addFlag(flags, "Urgent or threatening language", `The message uses pressure language such as: ${urgencyHits.join(", ")}.`, "high", 20);
  }

  if (hasSensitiveRequest(combined)) {
    addFlag(flags, "Sensitive information requested", "The message asks for credentials, financial details, or other sensitive information.", "high", 24);
  }

  if (hasCredentialHarvestPattern(combined)) {
    addFlag(flags, "Credential harvesting pattern", "The message combines account/login language with verification or reset prompts.", "high", 18);
  }

  if (senderEmail) {
    const normalizedSender = safeLower(senderEmail);
    const senderDomain = normalizedSender.includes("@") ? normalizedSender.split("@").pop() || "" : "";

    if (senderDomain) {
      if (hasPunycode(senderDomain)) {
        addFlag(flags, "Lookalike sender domain", `The sender domain ${senderDomain} uses punycode encoding.`, "high", 28);
      }

      if (SUSPICIOUS_TLDS.has(senderDomain.split(".").pop() || "")) {
        addFlag(flags, "Suspicious sender domain", `The sender domain ${senderDomain} uses a high-risk top-level domain.`, "medium", 12);
      }

      const brandHits = TRUSTED_BRANDS.filter((brand) => combined.toLowerCase().includes(brand));
      if (brandHits.length > 0 && !brandHits.some((brand) => senderDomain.includes(brand.replace(/\s+/g, "")))) {
        addFlag(flags, "Possible sender impersonation", `The message references ${brandHits[0]} but comes from ${senderDomain}.`, "high", 22);
      }
    }
  }

  const urls = extractUrls(content);
  urls.slice(0, 10).forEach((url) => analyzeUrl(url, "email", flags));

  if (urls.length >= 3) {
    addFlag(flags, "Multiple links in message", `The email contains ${urls.length} links, increasing the chance of a phishing lure.`, "medium", 10);
  }

  return flags;
}

function analyzeLink(content: string) {
  const flags: RedFlag[] = [];
  analyzeUrl(content, "link", flags);
  return flags;
}

function buildVerdict(riskLevel: AnalysisResult["riskLevel"], flags: Array<Omit<RedFlag, "weight">>) {
  if (riskLevel === "high") {
    return flags.length > 0
      ? `High-risk phishing indicators were detected, including ${flags[0].title.toLowerCase()}. Do not interact with this message or link.`
      : "High-risk phishing indicators were detected. Do not interact with this message or link.";
  }

  if (riskLevel === "medium") {
    return flags.length > 0
      ? `Several suspicious signals were found, including ${flags[0].title.toLowerCase()}. Verify the sender or destination through a trusted channel before proceeding.`
      : "Several suspicious signals were found. Verify the sender or destination through a trusted channel before proceeding.";
  }

  return "No strong phishing indicators were detected by the current heuristic checks, but you should still verify unexpected requests through official channels.";
}

function finalizeAnalysis(flags: RedFlag[]): AnalysisResult {
  const score = Math.min(100, flags.reduce((sum, flag) => sum + flag.weight, 0));
  const riskLevel = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  const publicFlags = flags
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map(({ weight: _weight, ...rest }) => rest);

  return {
    riskLevel,
    riskScore: score,
    verdict: buildVerdict(riskLevel, publicFlags),
    redFlags: publicFlags,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      type,
      content,
      subject = "",
      senderEmail = "",
      organizationId = null,
    }: PhishingAnalysisRequest = await req.json();

    if (!type || !content?.trim()) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (organizationId) {
      const { data: membership, error: membershipError } = await supabaseClient
        .from("organization_members")
        .select("id, role")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .single();

      if (membershipError || !membership || !["owner", "admin", "member"].includes(membership.role)) {
        return new Response(JSON.stringify({ error: "You do not have permission to run phishing checks for this company." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const flags = type === "email"
      ? analyzeEmail(subject.trim(), senderEmail.trim(), content.trim())
      : analyzeLink(content.trim());
    const analysis = finalizeAnalysis(flags);

    const { data: checkData, error: insertError } = await supabaseClient
      .from("phishing_checks")
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        check_type: type,
        content: content.trim().substring(0, 5000),
        subject: subject.trim() || null,
        sender_email: senderEmail.trim() || null,
        risk_level: analysis.riskLevel,
        risk_score: analysis.riskScore,
        analysis_source: "phish-guard-heuristic",
        verdict: analysis.verdict,
      })
      .select()
      .single();

    if (insertError || !checkData) {
      throw insertError ?? new Error("Failed to save phishing check");
    }

    if (analysis.redFlags.length > 0) {
      const { error: flagsError } = await supabaseClient
        .from("phishing_red_flags")
        .insert(
          analysis.redFlags.map((flag) => ({
            check_id: checkData.id,
            user_id: user.id,
            title: flag.title,
            description: flag.description,
            severity: flag.severity,
          }))
        );

      if (flagsError) {
        throw flagsError;
      }
    }

    const { error: activityError } = await supabaseClient
      .from("activity_logs")
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        action: "phishing.checked",
        resource_type: "phishing_check",
        resource_id: checkData.id,
        details: {
          check_type: type,
          risk_level: analysis.riskLevel,
          risk_score: analysis.riskScore,
          source: "phish-guard-heuristic",
          subject: subject.trim() || null,
          sender_email: senderEmail.trim() || null,
        },
        user_agent: req.headers.get("user-agent"),
      });

    if (activityError) {
      console.error("Failed to save phishing activity log:", activityError);
    }

    return new Response(
      JSON.stringify({
        id: checkData.id,
        organizationId: checkData.organization_id,
        riskLevel: analysis.riskLevel,
        riskScore: analysis.riskScore,
        verdict: analysis.verdict,
        redFlags: analysis.redFlags,
        source: "phish-guard-heuristic",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-phishing:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
