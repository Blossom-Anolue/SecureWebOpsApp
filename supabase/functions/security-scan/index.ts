import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const SCAN_TIMEOUT_MS = 20_000;
const MAX_CONCURRENT_SCANS = 5;

const rateLimiter = new Map<string, number[]>();

type ScanStatus = "queued" | "running" | "completed" | "failed" | "canceled" | "pending";
type Severity = "critical" | "high" | "medium" | "low";

interface ScanRequestBody {
  target?: string;
  scan_type?: string;
  options?: Record<string, unknown>;
  requested_by_user?: string;
  org_id?: string;
}

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  evidence: string;
  recommendation: string;
}

interface ActivityLogInput {
  userId: string | null;
  organizationId?: string | null;
  action: "scan.started" | "scan.completed" | "scan.failed";
  resourceId: string;
  target: string;
  details?: Record<string, unknown>;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseIp(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const v4 = parseIp(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }

  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost") return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (isPrivateOrLocalIp(host)) return true;
  return false;
}

function isAllowedTarget(hostname: string): boolean {
  const allowlistRaw = Deno.env.get("SCAN_TARGET_ALLOWLIST")?.trim();
  if (!allowlistRaw) return true;

  const allowed = allowlistRaw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const host = hostname.toLowerCase();
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

async function resolvesToPrivateIp(hostname: string): Promise<boolean> {
  try {
    const v4 = await Deno.resolveDns(hostname, "A");
    if (v4.some((ip) => isPrivateOrLocalIp(ip))) return true;
  } catch {
    // Ignore DNS lookup failures and rely on network fetch controls.
  }

  try {
    const v6 = await Deno.resolveDns(hostname, "AAAA");
    if (v6.some((ip) => isPrivateOrLocalIp(ip))) return true;
  } catch {
    // Ignore DNS lookup failures and rely on network fetch controls.
  }

  return false;
}

async function validateTargetUrl(rawTarget: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawTarget);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!(url.protocol === "http:" || url.protocol === "https:")) {
    throw new Error("Target must use http:// or https://");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("Target is blocked for security reasons");
  }

  if (!isAllowedTarget(url.hostname)) {
    throw new Error("Target is not in allowlist");
  }

  if (await resolvesToPrivateIp(url.hostname)) {
    throw new Error("Target resolves to a private address");
  }

  return url;
}

function checkRateLimit(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const key = ip;
  const now = Date.now();
  const prior = rateLimiter.get(key) ?? [];
  const inWindow = prior.filter((ts) => now - ts <= RATE_LIMIT_WINDOW_MS);
  if (inWindow.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  inWindow.push(now);
  rateLimiter.set(key, inWindow);
  return true;
}

async function withTimeout(url: string, init: RequestInit = {}, timeoutMs = SCAN_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function runLightweightSecurityScan(target: string): Promise<{ summary: Record<string, unknown>; findings: Finding[] }> {
  const findings: Finding[] = [];

  let headResponse: Response | null = null;
  try {
    headResponse = await withTimeout(target, { method: "HEAD" });
  } catch {
    findings.push({
      id: crypto.randomUUID(),
      title: "Target unreachable",
      severity: "high",
      category: "network",
      evidence: "Could not reach target using HEAD request",
      recommendation: "Check DNS records, host availability, and firewall rules",
    });
  }

  if (headResponse && !headResponse.url.startsWith("https://")) {
    findings.push({
      id: crypto.randomUUID(),
      title: "No HTTPS enforced",
      severity: "high",
      category: "transport",
      evidence: `Final URL is ${headResponse.url}`,
      recommendation: "Enforce HTTPS and redirect all HTTP traffic to HTTPS",
    });
  }

  let getResponse: Response | null = null;
  try {
    getResponse = await withTimeout(target);
    const headers = getResponse.headers;

    if (!headers.has("Strict-Transport-Security")) {
      findings.push({
        id: crypto.randomUUID(),
        title: "Missing HSTS header",
        severity: "medium",
        category: "headers",
        evidence: "Strict-Transport-Security header is absent",
        recommendation: "Add Strict-Transport-Security with a suitable max-age",
      });
    }

    if (!headers.has("X-Content-Type-Options")) {
      findings.push({
        id: crypto.randomUUID(),
        title: "Missing X-Content-Type-Options header",
        severity: "medium",
        category: "headers",
        evidence: "X-Content-Type-Options header is absent",
        recommendation: "Set X-Content-Type-Options: nosniff",
      });
    }

    if (!headers.has("Content-Security-Policy")) {
      findings.push({
        id: crypto.randomUUID(),
        title: "Missing Content-Security-Policy header",
        severity: "medium",
        category: "headers",
        evidence: "Content-Security-Policy header is absent",
        recommendation: "Define and deploy a restrictive Content-Security-Policy",
      });
    }
  } catch {
    if (!findings.find((f) => f.title === "Target unreachable")) {
      findings.push({
        id: crypto.randomUUID(),
        title: "Target unreachable",
        severity: "high",
        category: "network",
        evidence: "Could not reach target using GET request",
        recommendation: "Check DNS records, host availability, and firewall rules",
      });
    }
  }

  const issueCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => {
    issueCounts[f.severity] += 1;
  });

  const weightedPenalty = issueCounts.critical * 25 + issueCounts.high * 15 + issueCounts.medium * 8 + issueCounts.low * 3;
  const score = Math.max(0, 100 - weightedPenalty);
  const risk = score >= 85 ? "low" : score >= 60 ? "medium" : "high";

  return {
    summary: {
      score,
      risk,
      issue_counts: issueCounts,
      generated_at: new Date().toISOString(),
    },
    findings,
  };
}

async function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function logScanActivity(
  serviceClient: Awaited<ReturnType<typeof getServiceClient>>,
  input: ActivityLogInput,
): Promise<void> {
  // activity_logs.user_id is NOT NULL; skip logging if scan is not tied to a user.
  if (!input.userId) return;

  const { error } = await serviceClient.from("activity_logs").insert({
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    action: input.action,
    resource_type: "scan",
    resource_id: input.resourceId,
    details: {
      target: input.target,
      ...(input.details ?? {}),
    },
  });

  if (error) {
    console.error("Failed to insert activity log", error);
  }
}

async function processScan(scanId: string, target: string): Promise<void> {
  const serviceClient = await getServiceClient();
  const { data: scanOwner } = await serviceClient
    .from("scans")
    .select("user_id,organization_id")
    .eq("id", scanId)
    .maybeSingle();

  const { data: concurrentScans } = await serviceClient
    .from("scans")
    .select("id", { count: "exact" })
    .in("status", ["running", "queued"])
    .limit(MAX_CONCURRENT_SCANS + 1);

  if ((concurrentScans?.length ?? 0) > MAX_CONCURRENT_SCANS) {
    await serviceClient
      .from("scans")
      .update({ status: "failed", completed_at: new Date().toISOString(), scan_error: "Max concurrent scans reached" })
      .eq("id", scanId);
    await logScanActivity(serviceClient, {
      userId: scanOwner?.user_id ?? null,
      organizationId: scanOwner?.organization_id ?? null,
      action: "scan.failed",
      resourceId: scanId,
      target,
      details: { reason: "Max concurrent scans reached" },
    });
    return;
  }

  await serviceClient
    .from("scans")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", scanId);

  try {
    const { summary, findings } = await runLightweightSecurityScan(target);

    const counts = summary.issue_counts as { critical: number; high: number; medium: number; low: number };
    const score = Number(summary.score ?? 0);

    await serviceClient.from("scan_results").upsert({
      scan_id: scanId,
      summary_json: summary,
      findings_json: findings,
      created_at: new Date().toISOString(),
    });

    await serviceClient
      .from("scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        score,
        critical_count: counts.critical,
        high_count: counts.high,
        medium_count: counts.medium,
        low_count: counts.low,
        scan_error: null,
      })
      .eq("id", scanId);

    await logScanActivity(serviceClient, {
      userId: scanOwner?.user_id ?? null,
      organizationId: scanOwner?.organization_id ?? null,
      action: "scan.completed",
      resourceId: scanId,
      target,
      details: { score, issue_counts: counts },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    await serviceClient
      .from("scans")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        scan_error: message,
      })
      .eq("id", scanId);

    await logScanActivity(serviceClient, {
      userId: scanOwner?.user_id ?? null,
      organizationId: scanOwner?.organization_id ?? null,
      action: "scan.failed",
      resourceId: scanId,
      target,
      details: { reason: message },
    });
  }
}

async function handleCreateScan(req: Request): Promise<Response> {
  if (!checkRateLimit(req)) {
    return jsonResponse({ error: "Rate limit exceeded" }, 429);
  }

  const body: ScanRequestBody = await req.json();
  if (!body.target) {
    return jsonResponse({ error: "Missing target" }, 400);
  }

  let validatedTarget: URL;
  try {
    validatedTarget = await validateTargetUrl(body.target);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid target" }, 400);
  }

  const serviceClient = await getServiceClient();

  const { data: scan, error } = await serviceClient
    .from("scans")
    .insert({
      domain: validatedTarget.hostname,
      target_url: validatedTarget.toString(),
      status: "queued",
      created_at: new Date().toISOString(),
      requested_by_user: body.requested_by_user ?? null,
      organization_id: body.org_id ?? null,
      scan_type: body.scan_type === "full" ? "full" : "quick",
      user_id: body.requested_by_user ?? null,
      domain_id: null,
    })
    .select("id,status")
    .single();

  if (error || !scan) {
    console.error("Failed to create scan", error);
    return jsonResponse({ error: "Server error creating scan" }, 500);
  }

  await logScanActivity(serviceClient, {
    userId: body.requested_by_user ?? null,
    organizationId: body.org_id ?? null,
    action: "scan.started",
    resourceId: scan.id,
    target: validatedTarget.toString(),
    details: { scan_type: body.scan_type ?? "web_vuln", source: "api" },
  });

  const runner = processScan(scan.id, validatedTarget.toString());
  // Keep processing alive after the HTTP response where supported.
  if (typeof (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil === "function") {
    (globalThis as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(runner);
  } else {
    runner.catch((err) => console.error("Background scan failed", err));
  }

  return jsonResponse({ scan_id: scan.id, status: "queued" }, 201);
}

async function handleGetScan(scanId: string): Promise<Response> {
  const serviceClient = await getServiceClient();
  const { data: scan, error } = await serviceClient
    .from("scans")
    .select("id,target_url,domain,status,created_at,started_at,completed_at,scan_error")
    .eq("id", scanId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch scan", error);
    return jsonResponse({ error: "Server error fetching scan" }, 500);
  }

  if (!scan) {
    return jsonResponse({ error: "Scan not found" }, 404);
  }

  return jsonResponse({
    scan_id: scan.id,
    target: scan.target_url ?? (scan.domain?.startsWith("http") ? scan.domain : `https://${scan.domain}`),
    status: scan.status as ScanStatus,
    created_at: scan.created_at,
    started_at: scan.started_at,
    completed_at: scan.completed_at,
    error: scan.scan_error ?? null,
  });
}

async function handleGetResults(scanId: string): Promise<Response> {
  const serviceClient = await getServiceClient();

  const { data: scan, error: scanError } = await serviceClient
    .from("scans")
    .select("id,status")
    .eq("id", scanId)
    .maybeSingle();

  if (scanError) {
    console.error("Failed to fetch scan status", scanError);
    return jsonResponse({ error: "Server error fetching scan" }, 500);
  }

  if (!scan) {
    return jsonResponse({ error: "Scan not found" }, 404);
  }

  if (scan.status !== "completed") {
    return jsonResponse(
      { scan_id: scan.id, status: scan.status, error: "Scan is not completed yet" },
      409,
    );
  }

  const { data: result, error: resultError } = await serviceClient
    .from("scan_results")
    .select("summary_json,findings_json")
    .eq("scan_id", scanId)
    .maybeSingle();

  if (resultError) {
    console.error("Failed to fetch scan results", resultError);
    return jsonResponse({ error: "Server error fetching scan results" }, 500);
  }

  return jsonResponse({
    scan_id: scan.id,
    summary: result?.summary_json ?? { score: null, risk: "unknown", issue_counts: { critical: 0, high: 0, medium: 0, low: 0 } },
    findings: result?.findings_json ?? [],
  });
}

async function handleLegacyInvoke(req: Request): Promise<Response> {
  const body = await req.json();
  const scanId: string | undefined = body?.scanId;
  const domain: string | undefined = body?.domain;

  if (!scanId || !domain) {
    return jsonResponse({ error: "Invalid request payload" }, 400);
  }

  const normalizedTarget = domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;

  let validatedTarget: URL;
  try {
    validatedTarget = await validateTargetUrl(normalizedTarget);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid target" }, 400);
  }

  const serviceClient = await getServiceClient();
  const { data: scanMeta } = await serviceClient
    .from("scans")
    .select("user_id,organization_id,scan_type")
    .eq("id", scanId)
    .maybeSingle();

  await logScanActivity(serviceClient, {
    userId: scanMeta?.user_id ?? null,
    organizationId: scanMeta?.organization_id ?? null,
    action: "scan.started",
    resourceId: scanId,
    target: validatedTarget.toString(),
    details: { scan_type: scanMeta?.scan_type ?? "quick", source: "dashboard_legacy" },
  });

  const runner = processScan(scanId, validatedTarget.toString());
  if (typeof (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil === "function") {
    (globalThis as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(runner);
  } else {
    runner.catch((err) => console.error("Background scan failed", err));
  }

  return jsonResponse({ scan_id: scanId, status: "queued" }, 202);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pathname } = new URL(req.url);

    if (pathname.endsWith("/api/v1/scans") && req.method === "POST") {
      return await handleCreateScan(req);
    }

    const scanStatusMatch = pathname.match(/\/api\/v1\/scans\/([^/]+)$/);
    if (scanStatusMatch && req.method === "GET") {
      return await handleGetScan(scanStatusMatch[1]);
    }

    const scanResultsMatch = pathname.match(/\/api\/v1\/scans\/([^/]+)\/results$/);
    if (scanResultsMatch && req.method === "GET") {
      return await handleGetResults(scanResultsMatch[1]);
    }

    if (req.method === "POST") {
      // Backward compatibility for current dashboard flow:
      // POST body: { scanId, domain, scanType }
      return await handleLegacyInvoke(req);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Unhandled security-scan error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown server error" }, 500);
  }
});
