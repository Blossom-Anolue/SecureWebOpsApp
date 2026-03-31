import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_SCANS = 5;
const ZAP_ALERT_PAGE_SIZE = 250;

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

interface ActivityLogInput {
  userId: string | null;
  organizationId?: string | null;
  action: "scan.started" | "scan.completed" | "scan.failed";
  resourceId: string;
  target: string;
  details?: Record<string, unknown>;
}

interface ZapAlert {
  pluginId?: string;
  alertRef?: string;
  name?: string;
  alert?: string;
  risk?: string;
  riskdesc?: string;
  confidence?: string;
  confidencedesc?: string;
  desc?: string;
  description?: string;
  solution?: string;
  reference?: string;
  cweid?: string;
  wascid?: string;
  other?: string;
  evidence?: string;
  param?: string;
  url?: string;
  attack?: string;
  method?: string;
  tags?: Record<string, string>;
  instances?: Array<Record<string, string>>;
}

interface Finding {
  id: string;
  plugin_id: string;
  title: string;
  severity: Severity;
  category: string;
  owasp_category: string | null;
  confidence: string | null;
  description: string;
  business_impact: string;
  recommendation: string;
  technical_details: string;
  evidence: string;
  references: string | null;
  instances: number;
  urls: string[];
  cwe_id: string | null;
  wasc_id: string | null;
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
    // Ignore DNS lookup failures and rely on downstream network controls.
  }

  try {
    const v6 = await Deno.resolveDns(hostname, "AAAA");
    if (v6.some((ip) => isPrivateOrLocalIp(ip))) return true;
  } catch {
    // Ignore DNS lookup failures and rely on downstream network controls.
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
  const now = Date.now();
  const prior = rateLimiter.get(ip) ?? [];
  const inWindow = prior.filter((ts) => now - ts <= RATE_LIMIT_WINDOW_MS);
  if (inWindow.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  inWindow.push(now);
  rateLimiter.set(ip, inWindow);
  return true;
}

async function withTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getZapConfig() {
  const baseUrl = Deno.env.get("ZAP_API_BASE_URL")?.trim();
  if (!baseUrl) {
    throw new Error("Missing ZAP_API_BASE_URL");
  }

  return {
    baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    apiKey: Deno.env.get("ZAP_API_KEY")?.trim() ?? "",
    pollIntervalMs: Number(Deno.env.get("ZAP_POLL_INTERVAL_MS") ?? "2000"),
    maxRuntimeMs: Number(Deno.env.get("ZAP_MAX_RUNTIME_MS") ?? "300000"),
    quickMaxChildren: Number(Deno.env.get("ZAP_QUICK_MAX_CHILDREN") ?? "25"),
    fullMaxChildren: Number(Deno.env.get("ZAP_FULL_MAX_CHILDREN") ?? "200"),
  };
}

async function zapGet<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const config = getZapConfig();
  const url = new URL(path.replace(/^\//, ""), config.baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  if (config.apiKey) {
    url.searchParams.set("apikey", config.apiKey);
  }

  const response = await withTimeout(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ZAP API request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (payload && typeof payload === "object" && "code" in payload && "message" in payload) {
    throw new Error(`ZAP API error ${(payload as { code: string }).code}: ${(payload as { message: string }).message}`);
  }

  return payload as T;
}

async function waitForPercentage(
  label: string,
  getPercentage: () => Promise<number>,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const percent = await getPercentage();
    if (percent >= 100) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`${label} timed out`);
}

async function waitForPassiveScan(timeoutMs: number, pollIntervalMs: number): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const result = await zapGet<{ recordsToScan?: string }>("JSON/pscan/view/recordsToScan/", {});
    const remaining = Number(result.recordsToScan ?? "0");
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("ZAP passive scan queue did not finish in time");
}

async function startSpiderScan(target: string, scanType: "quick" | "full"): Promise<string> {
  const config = getZapConfig();
  const result = await zapGet<{ scan?: string }>("JSON/spider/action/scan/", {
    url: target,
    recurse: true,
    subtreeOnly: true,
    maxChildren: scanType === "quick" ? config.quickMaxChildren : config.fullMaxChildren,
  });

  if (!result.scan) {
    throw new Error("ZAP spider did not return a scan id");
  }

  return result.scan;
}

async function startActiveScan(target: string): Promise<string> {
  const result = await zapGet<{ scan?: string }>("JSON/ascan/action/scan/", {
    url: target,
    recurse: true,
    inScopeOnly: false,
  });

  if (!result.scan) {
    throw new Error("ZAP active scan did not return a scan id");
  }

  return result.scan;
}

async function fetchAllAlerts(target: string): Promise<ZapAlert[]> {
  const allAlerts: ZapAlert[] = [];
  let start = 0;

  while (true) {
    const page = await zapGet<{ alerts?: ZapAlert[] }>("JSON/core/view/alerts/", {
      baseurl: target,
      start,
      count: ZAP_ALERT_PAGE_SIZE,
    });

    const alerts = page.alerts ?? [];
    allAlerts.push(...alerts);

    if (alerts.length < ZAP_ALERT_PAGE_SIZE) {
      return allAlerts;
    }

    start += alerts.length;
  }
}

function normalizeSeverity(alert: ZapAlert): Severity | null {
  const risk = `${alert.riskdesc ?? alert.risk ?? ""}`.toLowerCase();
  if (risk.includes("critical")) return "critical";
  if (risk.includes("high")) return "high";
  if (risk.includes("medium")) return "medium";
  if (risk.includes("low")) return "low";
  if (risk.includes("inform")) return null;
  return null;
}

function extractOwaspCategory(alert: ZapAlert): string | null {
  const tags = alert.tags ?? {};
  const owaspTag = Object.keys(tags).find((tag) => /^OWASP_(\d{4})_A\d{2}/.test(tag));
  if (!owaspTag) return null;

  const match = owaspTag.match(/^OWASP_(\d{4})_(A\d{2})/);
  if (!match) return owaspTag.replaceAll("_", " ");
  return `OWASP ${match[1]} ${match[2]}`;
}

function buildBusinessImpact(severity: Severity, title: string): string {
  if (severity === "critical") {
    return `${title} could expose sensitive data or create a direct path for compromise if left unresolved.`;
  }
  if (severity === "high") {
    return `${title} can materially increase the likelihood of account compromise, data exposure, or service disruption.`;
  }
  if (severity === "medium") {
    return `${title} weakens the site's security posture and can make higher-impact attacks easier to execute.`;
  }
  return `${title} is a lower-severity weakness, but it still adds avoidable attack surface and should be cleaned up.`;
}

function buildTechnicalDetails(alert: ZapAlert, urls: string[], instanceCount: number): string {
  const details = [
    `Rule: ${alert.name ?? alert.alert ?? "Unknown rule"}`,
    alert.pluginId ? `Plugin ID: ${alert.pluginId}` : null,
    alert.alertRef ? `Alert Ref: ${alert.alertRef}` : null,
    alert.method ? `HTTP Method: ${alert.method}` : null,
    alert.param ? `Parameter: ${alert.param}` : null,
    alert.attack ? `Attack: ${alert.attack}` : null,
    alert.evidence ? `Evidence: ${alert.evidence}` : null,
    alert.other ? `Other: ${alert.other}` : null,
    alert.cweid && alert.cweid !== "-1" ? `CWE: ${alert.cweid}` : null,
    alert.wascid && alert.wascid !== "-1" ? `WASC: ${alert.wascid}` : null,
    urls.length > 0 ? `Affected URLs: ${urls.join(", ")}` : null,
    `Occurrences: ${instanceCount}`,
  ].filter(Boolean);

  return details.join("\n");
}

function dedupeAlerts(alerts: ZapAlert[]): Finding[] {
  const grouped = new Map<string, ZapAlert[]>();

  for (const alert of alerts) {
    const severity = normalizeSeverity(alert);
    if (!severity) continue;

    const key = alert.pluginId || alert.alertRef || alert.name || alert.alert || crypto.randomUUID();
    const existing = grouped.get(key) ?? [];
    existing.push(alert);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries()).map(([key, group]) => {
    const first = group[0];
    const severity = normalizeSeverity(first) ?? "low";
    const urls = Array.from(new Set(group.flatMap((alert) => {
      const direct = alert.url ? [alert.url] : [];
      const nested = (alert.instances ?? []).flatMap((instance) => instance.uri ? [instance.uri] : []);
      return [...direct, ...nested];
    }))).slice(0, 10);
    const instanceCount = group.reduce((count, alert) => count + Math.max(alert.instances?.length ?? 0, 1), 0);
    const owaspCategory = extractOwaspCategory(first);
    const title = first.name ?? first.alert ?? "OWASP ZAP finding";
    const references = first.reference?.trim() || null;

    return {
      id: crypto.randomUUID(),
      plugin_id: key,
      title,
      severity,
      category: owaspCategory ?? (first.cweid && first.cweid !== "-1" ? `CWE-${first.cweid}` : "OWASP ZAP"),
      owasp_category: owaspCategory,
      confidence: first.confidencedesc ?? first.confidence ?? null,
      description: first.desc ?? first.description ?? "OWASP ZAP identified a security issue during the scan.",
      business_impact: buildBusinessImpact(severity, title),
      recommendation: first.solution?.trim() || "Review the affected surface in OWASP ZAP and remediate according to the rule guidance.",
      technical_details: buildTechnicalDetails(first, urls, instanceCount),
      evidence: first.evidence?.trim() || first.other?.trim() || "See technical details for affected requests and URLs.",
      references,
      instances: instanceCount,
      urls,
      cwe_id: first.cweid && first.cweid !== "-1" ? first.cweid : null,
      wasc_id: first.wascid && first.wascid !== "-1" ? first.wascid : null,
    };
  });
}

function summarizeFindings(findings: Finding[], scanType: "quick" | "full", target: string) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  const penalty = counts.critical * 30 + counts.high * 18 + counts.medium * 10 + counts.low * 4;
  const score = Math.max(0, 100 - penalty);
  const risk = score >= 85 ? "low" : score >= 60 ? "medium" : "high";

  return {
    score,
    risk,
    scanner: "owasp_zap",
    scan_type: scanType,
    target,
    issue_counts: counts,
    generated_at: new Date().toISOString(),
  };
}

async function runZapSecurityScan(target: string, scanType: "quick" | "full") {
  const config = getZapConfig();

  const spiderScanId = await startSpiderScan(target, scanType);
  await waitForPercentage(
    "ZAP spider scan",
    async () => {
      const result = await zapGet<{ status?: string }>("JSON/spider/view/status/", { scanId: spiderScanId });
      return Number(result.status ?? "0");
    },
    config.maxRuntimeMs,
    config.pollIntervalMs,
  );

  await waitForPassiveScan(config.maxRuntimeMs, config.pollIntervalMs);

  if (scanType === "full") {
    const activeScanId = await startActiveScan(target);
    await waitForPercentage(
      "ZAP active scan",
      async () => {
        const result = await zapGet<{ status?: string }>("JSON/ascan/view/status/", { scanId: activeScanId });
        return Number(result.status ?? "0");
      },
      config.maxRuntimeMs,
      config.pollIntervalMs,
    );

    await waitForPassiveScan(config.maxRuntimeMs, config.pollIntervalMs);
  }

  const alerts = await fetchAllAlerts(target);
  const findings = dedupeAlerts(alerts);
  const summary = summarizeFindings(findings, scanType, target);

  return { summary, findings };
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

async function persistScanArtifacts(
  serviceClient: Awaited<ReturnType<typeof getServiceClient>>,
  scanId: string,
  userId: string | null,
  summary: ReturnType<typeof summarizeFindings>,
  findings: Finding[],
): Promise<void> {
  await serviceClient.from("scan_results").upsert({
    scan_id: scanId,
    summary_json: summary,
    findings_json: findings,
    created_at: new Date().toISOString(),
  });

  await serviceClient.from("scan_issues").delete().eq("scan_id", scanId);

  if (userId && findings.length > 0) {
    const issueRows = findings.map((finding) => ({
      scan_id: scanId,
      user_id: userId,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      owasp_category: finding.owasp_category,
      description: finding.description,
      business_impact: finding.business_impact,
      recommendation: finding.recommendation,
      technical_details: finding.technical_details,
      is_resolved: false,
    }));

    const { error: issueError } = await serviceClient.from("scan_issues").insert(issueRows);
    if (issueError) {
      throw new Error(`Failed to store scan issues: ${issueError.message}`);
    }
  }

  if (userId) {
    const { error: scoreError } = await serviceClient.from("security_scores").insert({
      user_id: userId,
      score: summary.score,
    });

    if (scoreError) {
      console.error("Failed to insert security score", scoreError);
    }
  }
}

async function processScan(scanId: string, target: string): Promise<void> {
  const serviceClient = await getServiceClient();
  const { data: scanMeta } = await serviceClient
    .from("scans")
    .select("user_id,organization_id,scan_type")
    .eq("id", scanId)
    .maybeSingle();

  const parsedTarget = new URL(target);
  const scanType = scanMeta?.scan_type === "full" ? "full" : "quick";

  const { data: concurrentScans } = await serviceClient
    .from("scans")
    .select("id", { count: "exact" })
    .in("status", ["running", "queued"])
    .limit(MAX_CONCURRENT_SCANS + 1);

  if ((concurrentScans?.length ?? 0) > MAX_CONCURRENT_SCANS) {
    await serviceClient
      .from("scans")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        scan_error: "Max concurrent scans reached",
      })
      .eq("id", scanId);

    await logScanActivity(serviceClient, {
      userId: scanMeta?.user_id ?? null,
      organizationId: scanMeta?.organization_id ?? null,
      action: "scan.failed",
      resourceId: scanId,
      target,
      details: { reason: "Max concurrent scans reached" },
    });
    return;
  }

  await serviceClient
    .from("scans")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      target_url: target,
      domain: parsedTarget.hostname,
      scan_error: null,
    })
    .eq("id", scanId);

  try {
    const { summary, findings } = await runZapSecurityScan(target, scanType);

    await persistScanArtifacts(
      serviceClient,
      scanId,
      scanMeta?.user_id ?? null,
      summary,
      findings,
    );

    await serviceClient
      .from("scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        score: summary.score,
        critical_count: summary.issue_counts.critical,
        high_count: summary.issue_counts.high,
        medium_count: summary.issue_counts.medium,
        low_count: summary.issue_counts.low,
        scan_error: null,
      })
      .eq("id", scanId);

    await logScanActivity(serviceClient, {
      userId: scanMeta?.user_id ?? null,
      organizationId: scanMeta?.organization_id ?? null,
      action: "scan.completed",
      resourceId: scanId,
      target,
      details: {
        score: summary.score,
        scanner: "owasp_zap",
        issue_counts: summary.issue_counts,
      },
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
      userId: scanMeta?.user_id ?? null,
      organizationId: scanMeta?.organization_id ?? null,
      action: "scan.failed",
      resourceId: scanId,
      target,
      details: { reason: message, scanner: "owasp_zap" },
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
  const scanType = body.scan_type === "full" ? "full" : "quick";

  const { data: scan, error } = await serviceClient
    .from("scans")
    .insert({
      domain: validatedTarget.hostname,
      target_url: validatedTarget.toString(),
      status: "queued",
      created_at: new Date().toISOString(),
      requested_by_user: body.requested_by_user ?? null,
      organization_id: body.org_id ?? null,
      scan_type: scanType,
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
    details: { scan_type: scanType, scanner: "owasp_zap", source: "api" },
  });

  const runner = processScan(scan.id, validatedTarget.toString());
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
    summary: result?.summary_json ?? {
      score: null,
      risk: "unknown",
      scanner: "owasp_zap",
      issue_counts: { critical: 0, high: 0, medium: 0, low: 0 },
    },
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

  await serviceClient
    .from("scans")
    .update({
      status: "queued",
      target_url: validatedTarget.toString(),
      domain: validatedTarget.hostname,
      scan_error: null,
    })
    .eq("id", scanId);

  await logScanActivity(serviceClient, {
    userId: scanMeta?.user_id ?? null,
    organizationId: scanMeta?.organization_id ?? null,
    action: "scan.started",
    resourceId: scanId,
    target: validatedTarget.toString(),
    details: {
      scan_type: scanMeta?.scan_type ?? "quick",
      scanner: "owasp_zap",
      source: "dashboard_legacy",
    },
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
      return await handleLegacyInvoke(req);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Unhandled security-scan error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown server error" }, 500);
  }
});
