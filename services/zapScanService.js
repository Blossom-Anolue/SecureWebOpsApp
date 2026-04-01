import { supabaseAdmin } from './supabaseAdmin.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_SCANS = 5;
const ZAP_ALERT_PAGE_SIZE = 250;

const rateLimiter = new Map();

function parseIp(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateOrLocalIp(ip) {
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
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80:')) return true;
  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost') return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (isPrivateOrLocalIp(host)) return true;
  return false;
}

function isAllowedTarget(hostname) {
  const allowlistRaw = process.env.SCAN_TARGET_ALLOWLIST?.trim();
  if (!allowlistRaw) return true;

  const allowed = allowlistRaw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const host = hostname.toLowerCase();
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

async function resolvesToPrivateIp(hostname) {
  try {
    const addresses = await dnsResolve(hostname);
    return addresses.some((ip) => isPrivateOrLocalIp(ip));
  } catch {
    return false;
  }
}

async function dnsResolve(hostname) {
  const dns = await import('node:dns/promises');
  const addresses = [];
  try {
    addresses.push(...await dns.resolve4(hostname));
  } catch {
    // ignore
  }
  try {
    addresses.push(...await dns.resolve6(hostname));
  } catch {
    // ignore
  }
  return addresses;
}

export async function validateTargetUrl(rawTarget) {
  let url;
  try {
    url = new URL(rawTarget);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!(url.protocol === 'http:' || url.protocol === 'https:')) {
    throw new Error('Target must use http:// or https://');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('Target is blocked for security reasons');
  }

  if (!isAllowedTarget(url.hostname)) {
    throw new Error('Target is not in allowlist');
  }

  if (await resolvesToPrivateIp(url.hostname)) {
    throw new Error('Target resolves to a private address');
  }

  return url;
}

export function checkRateLimit(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  const prior = rateLimiter.get(key) ?? [];
  const inWindow = prior.filter((ts) => now - ts <= RATE_LIMIT_WINDOW_MS);
  if (inWindow.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  inWindow.push(now);
  rateLimiter.set(key, inWindow);
  return true;
}

async function withTimeout(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getZapConfig() {
  const baseUrl = process.env.ZAP_API_BASE_URL?.trim();
  console.log('[ZAP CONFIG] raw baseUrl =', process.env.ZAP_API_BASE_URL);
  if (!baseUrl) {
    throw new Error('Missing ZAP_API_BASE_URL');
  }

  return {
    baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    apiKey: process.env.ZAP_API_KEY?.trim() ?? '',
    pollIntervalMs: Number(process.env.ZAP_POLL_INTERVAL_MS ?? '2000'),

    spiderTimeoutMs: Number(process.env.ZAP_SPIDER_TIMEOUT_MS ?? '120000'),
    passiveTimeoutMs: Number(process.env.ZAP_PASSIVE_TIMEOUT_MS ?? '180000'),
    activeTimeoutMs: Number(process.env.ZAP_ACTIVE_TIMEOUT_MS ?? '600000'),

    quickMaxChildren: Number(process.env.ZAP_QUICK_MAX_CHILDREN ?? '25'),
    fullMaxChildren: Number(process.env.ZAP_FULL_MAX_CHILDREN ?? '200'),
  };
}

async function zapGet(path, params) {
  const config = getZapConfig();
  const url = new URL(path.replace(/^\//, ''), config.baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  if (config.apiKey) {
    url.searchParams.set('apikey', config.apiKey);
  }

  const response = await withTimeout(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ZAP API request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (payload && typeof payload === 'object' && 'code' in payload && 'message' in payload) {
    throw new Error(`ZAP API error ${payload.code}: ${payload.message}`);
  }

  return payload;
}

export async function diagnoseZapConnection() {
  const config = getZapConfig();
  const [version, urls, alerts] = await Promise.all([
    zapGet('JSON/core/view/version/', {}),
    zapGet('JSON/core/view/urls/', {}),
    zapGet('JSON/core/view/alertsSummary/', {}),
  ]);

  return {
    provider: 'zap',
    baseUrl: config.baseUrl,
    apiKeyConfigured: Boolean(config.apiKey),
    version: version.version ?? null,
    knownUrls: Array.isArray(urls.urls) ? urls.urls.length : 0,
    alertSummary: alerts.alertsSummary ?? {},
  };
}

async function waitForPercentage(label, getPercentage, timeoutMs, pollIntervalMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const percent = await getPercentage();
    if (percent >= 100) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`${label} timed out`);
}

async function waitForPassiveScan(timeoutMs, pollIntervalMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await zapGet('JSON/pscan/view/recordsToScan/', {});
    const remaining = Number(result.recordsToScan ?? '0');
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error('ZAP passive scan queue did not finish in time');
}

async function startSpiderScan(target, scanType) {
  const config = getZapConfig();

  console.log('[ZAP] spider target:', target);
  console.log('[ZAP] spider scanType:', scanType);
  console.log('[ZAP] spider config baseUrl:', config.baseUrl);

  const result = await zapGet('JSON/spider/action/scan/', {
    url: target,
    recurse: true,
    maxChildren: scanType === 'quick' ? config.quickMaxChildren : config.fullMaxChildren,
  });

  console.log('[ZAP] spider start result:', result);

  if (!result.scan) {
    throw new Error(`ZAP spider did not return a scan id: ${JSON.stringify(result)}`);
  }

  return result.scan;
}

async function startActiveScan(target) {
  const scanTarget = new URL(target).origin;

  const result = await zapGet('JSON/ascan/action/scan/', {
    url: scanTarget,
    recurse: true,
    inScopeOnly: false,
  });

  if (!result.scan) {
    throw new Error('ZAP active scan did not return a scan id');
  }

  return result.scan;
}

async function fetchAllAlerts(target) {
  const allAlerts = [];
  let start = 0;

  while (true) {
    const page = await zapGet('JSON/core/view/alerts/', {
    start,
    count: ZAP_ALERT_PAGE_SIZE,
  });

    console.log('[ZAP] alerts page raw:', page);

    const alerts = page.alerts ?? [];
    allAlerts.push(...alerts);
    if (alerts.length < ZAP_ALERT_PAGE_SIZE) return allAlerts;
    start += alerts.length;
  }
}

function normalizeSeverity(alert) {
  const risk = `${alert.riskdesc ?? alert.risk ?? ''}`.toLowerCase();
  if (risk.includes('critical')) return 'critical';
  if (risk.includes('high')) return 'high';
  if (risk.includes('medium')) return 'medium';
  if (risk.includes('low')) return 'low';
  if (risk.includes('inform')) return null;
  return null;
}

function extractOwaspCategory(alert) {
  const tags = alert.tags ?? {};
  const owaspTag = Object.keys(tags).find((tag) => /^OWASP_(\d{4})_A\d{2}/.test(tag));
  if (!owaspTag) return null;
  const match = owaspTag.match(/^OWASP_(\d{4})_(A\d{2})/);
  if (!match) return owaspTag.replaceAll('_', ' ');
  return `OWASP ${match[1]} ${match[2]}`;
}

function buildBusinessImpact(severity, title) {
  if (severity === 'critical') return `${title} could expose sensitive data or create a direct path for compromise if left unresolved.`;
  if (severity === 'high') return `${title} can materially increase the likelihood of account compromise, data exposure, or service disruption.`;
  if (severity === 'medium') return `${title} weakens the site's security posture and can make higher-impact attacks easier to execute.`;
  return `${title} is a lower-severity weakness, but it still adds avoidable attack surface and should be cleaned up.`;
}

function buildTechnicalDetails(alert, urls, instanceCount) {
  return [
    `Rule: ${alert.name ?? alert.alert ?? 'Unknown rule'}`,
    alert.pluginId ? `Plugin ID: ${alert.pluginId}` : null,
    alert.alertRef ? `Alert Ref: ${alert.alertRef}` : null,
    alert.method ? `HTTP Method: ${alert.method}` : null,
    alert.param ? `Parameter: ${alert.param}` : null,
    alert.attack ? `Attack: ${alert.attack}` : null,
    alert.evidence ? `Evidence: ${alert.evidence}` : null,
    alert.other ? `Other: ${alert.other}` : null,
    alert.cweid && alert.cweid !== '-1' ? `CWE: ${alert.cweid}` : null,
    alert.wascid && alert.wascid !== '-1' ? `WASC: ${alert.wascid}` : null,
    urls.length > 0 ? `Affected URLs: ${urls.join(', ')}` : null,
    `Occurrences: ${instanceCount}`,
  ].filter(Boolean).join('\n');
}

function dedupeAlerts(alerts) {
  const grouped = new Map();

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
    const severity = normalizeSeverity(first) ?? 'low';
    const urls = Array.from(new Set(group.flatMap((alert) => {
      const direct = alert.url ? [alert.url] : [];
      const nested = (alert.instances ?? []).flatMap((instance) => instance.uri ? [instance.uri] : []);
      return [...direct, ...nested];
    }))).slice(0, 10);
    const instanceCount = group.reduce((count, alert) => count + Math.max(alert.instances?.length ?? 0, 1), 0);
    const owaspCategory = extractOwaspCategory(first);
    const title = first.name ?? first.alert ?? 'OWASP ZAP finding';

    return {
      id: crypto.randomUUID(),
      plugin_id: key,
      title,
      severity,
      category: owaspCategory ?? (first.cweid && first.cweid !== '-1' ? `CWE-${first.cweid}` : 'OWASP ZAP'),
      owasp_category: owaspCategory,
      confidence: first.confidencedesc ?? first.confidence ?? null,
      description: first.desc ?? first.description ?? 'OWASP ZAP identified a security issue during the scan.',
      business_impact: buildBusinessImpact(severity, title),
      recommendation: first.solution?.trim() || 'Review the affected surface in OWASP ZAP and remediate according to the rule guidance.',
      technical_details: buildTechnicalDetails(first, urls, instanceCount),
      evidence: first.evidence?.trim() || first.other?.trim() || 'See technical details for affected requests and URLs.',
      references: first.reference?.trim() || null,
      instances: instanceCount,
      urls,
      cwe_id: first.cweid && first.cweid !== '-1' ? first.cweid : null,
      wasc_id: first.wascid && first.wascid !== '-1' ? first.wascid : null,
    };
  });
}

function summarizeFindings(findings, scanType, target) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  const penalty = counts.critical * 25 + counts.high * 15 + counts.medium * 8 + counts.low * 3;
  const score = Math.max(0, 100 - penalty);
  const risk = score >= 85 ? 'low' : score >= 60 ? 'medium' : 'high';

  return {
    score,
    risk,
    scanner: 'owasp_zap',
    scan_type: scanType,
    target,
    issue_counts: counts,
    generated_at: new Date().toISOString(),
  };
}

function getScanProvider() {
  const configured = process.env.SCAN_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  return 'observatory';
}

function mapHeaderSeverity(headerName) {
  if (headerName === 'strict-transport-security') return 'high';
  if (headerName === 'content-security-policy') return 'high';
  if (headerName === 'x-content-type-options') return 'medium';
  if (headerName === 'x-frame-options') return 'medium';
  if (headerName === 'referrer-policy') return 'low';
  if (headerName === 'permissions-policy') return 'low';
  if (headerName === 'cross-origin-resource-policy') return 'low';
  return 'low';
}

function buildFinding({
  title,
  severity,
  category,
  description,
  recommendation,
  technicalDetails,
  owaspCategory = null,
  evidence = 'See technical details for response evidence.',
  references = null,
  urls = [],
  instances = 1,
}) {
  return {
    id: crypto.randomUUID(),
    plugin_id: crypto.randomUUID(),
    title,
    severity,
    category,
    owasp_category: owaspCategory,
    confidence: 'High',
    description,
    business_impact: buildBusinessImpact(severity, title),
    recommendation,
    technical_details: technicalDetails,
    evidence,
    references,
    instances,
    urls,
    cwe_id: null,
    wasc_id: null,
  };
}

async function requestJson(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const response = await withTimeout(url, init, timeoutMs);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || payload?.raw || `Request failed with status ${response.status}`);
  }

  return payload;
}

async function runObservatoryScan(target) {
  const targetUrl = new URL(target);
  const observatoryUrl = `https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${encodeURIComponent(targetUrl.host)}`;
  return requestJson(observatoryUrl, { method: 'POST' }, 60_000);
}

async function runImmediateHealthCheck(target) {
  const startedAt = Date.now();
  let response;
  try {
    response = await withTimeout(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'SecureWebOps/1.0 health-check',
      },
    });
  } catch (error) {
    return {
      status: 'down',
      reason: error instanceof Error ? error.message : 'Health check failed',
      responseTimeMs: null,
      statusCode: null,
      ok: false,
    };
  }

  return {
    status: response.ok ? 'up' : 'degraded',
    reason: response.ok ? 'Site responded successfully' : `Returned HTTP ${response.status}`,
    responseTimeMs: Date.now() - startedAt,
    statusCode: response.status,
    ok: response.ok,
  };
}

async function fetchWithUserAgent(url, options = {}) {
  return withTimeout(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'user-agent': 'SecureWebOps/1.0 external-assessment',
      ...(options.headers ?? {}),
    },
    ...options,
  });
}

async function inspectTlsCertificate(target) {
  const url = new URL(target);
  if (url.protocol !== 'https:') return null;

  const tls = await import('node:tls');

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: url.hostname,
      rejectUnauthorized: false,
      timeout: 15_000,
    }, () => {
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol?.() ?? null;
      socket.end();
      resolve({
        valid_to: cert?.valid_to ?? null,
        valid_from: cert?.valid_from ?? null,
        issuer: cert?.issuer?.O || cert?.issuer?.CN || null,
        subject: cert?.subject?.CN || null,
        protocol,
      });
    });

    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function collectSensitiveExposureFindings(target) {
  const sensitivePaths = [
    { path: '/.env', severity: 'critical', title: 'Potential exposed .env file' },
    { path: '/.git/HEAD', severity: 'critical', title: 'Potential exposed Git metadata' },
    { path: '/backup.zip', severity: 'high', title: 'Potential exposed backup archive' },
    { path: '/config.php.bak', severity: 'high', title: 'Potential exposed backup configuration file' },
    { path: '/phpinfo.php', severity: 'high', title: 'Potential exposed phpinfo page' },
    { path: '/server-status', severity: 'medium', title: 'Potential exposed server-status endpoint' },
    { path: '/.DS_Store', severity: 'medium', title: 'Potential exposed .DS_Store file' },
  ];

  const findings = [];
  const base = new URL(target);

  for (const item of sensitivePaths) {
    const probeUrl = new URL(item.path, base).toString();
    try {
      const response = await fetchWithUserAgent(probeUrl, { redirect: 'manual' });
      if (response.status === 200) {
        findings.push(buildFinding({
          title: item.title,
          severity: item.severity,
          category: 'Sensitive File Exposure',
          owaspCategory: 'OWASP A05',
          description: `The sensitive path ${item.path} responded with HTTP 200.`,
          recommendation: 'Remove the exposed file or restrict access at the web server and deployment layer.',
          technicalDetails: `Probe ${probeUrl} returned HTTP 200.`,
          urls: [probeUrl],
        }));
      }
    } catch {
      // ignore failed probes
    }
  }

  return findings;
}

async function collectMethodAndDiscoveryFindings(target) {
  const findings = [];

  try {
    const optionsResponse = await withTimeout(target, {
      method: 'OPTIONS',
      headers: {
        'user-agent': 'SecureWebOps/1.0 method-check',
      },
    });

    const allow = optionsResponse.headers.get('allow') || '';
    if (/\bTRACE\b/i.test(allow)) {
      findings.push(buildFinding({
        title: 'TRACE method appears enabled',
        severity: 'medium',
        category: 'HTTP Methods',
        owaspCategory: 'OWASP A05',
        description: 'The Allow header indicates that the TRACE method may be enabled.',
        recommendation: 'Disable TRACE at the web server and upstream proxy unless there is a strong operational reason to keep it enabled.',
        technicalDetails: `OPTIONS Allow header: ${allow}`,
        urls: [target],
      }));
    }
  } catch {
    // ignore
  }

  try {
    const securityTxtUrl = new URL('/.well-known/security.txt', target).toString();
    const response = await fetchWithUserAgent(securityTxtUrl);
    if (response.status !== 200) {
      findings.push(buildFinding({
        title: 'security.txt not found',
        severity: 'low',
        category: 'Security Contact',
        description: 'The site does not appear to publish a security.txt file.',
        recommendation: 'Publish /.well-known/security.txt so researchers and users know how to report vulnerabilities responsibly.',
        technicalDetails: `GET ${securityTxtUrl} returned HTTP ${response.status}.`,
        urls: [securityTxtUrl],
      }));
    }
  } catch {
    // ignore
  }

  return findings;
}

async function getUptimeRobotMonitor(target) {
  const apiKey = process.env.UPTIMEROBOT_API_KEY?.trim();
  if (!apiKey) return null;

  const body = new URLSearchParams({
    api_key: apiKey,
    format: 'json',
    logs: '0',
    response_times: '1',
    search: target,
  });

  try {
    const response = await withTimeout('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    }, 30_000);

    const payload = await response.json();
    const monitor = payload?.monitors?.[0] ?? null;
    if (monitor) return monitor;

    if (process.env.UPTIMEROBOT_AUTO_CREATE_MONITORS?.trim() !== 'true') {
      return null;
    }

    const createBody = new URLSearchParams({
      api_key: apiKey,
      format: 'json',
      type: '1',
      friendly_name: target,
      url: target,
    });

    const createResponse = await withTimeout('https://api.uptimerobot.com/v2/newMonitor', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: createBody,
    }, 30_000);

    const createPayload = await createResponse.json();
    return createPayload?.monitor ?? null;
  } catch (error) {
    console.error('Failed to query UptimeRobot', error);
    return null;
  }
}

async function collectHeaderFindings(target) {
  const findings = [];
  const targetUrl = new URL(target);

  const httpsResponse = await withTimeout(target, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'user-agent': 'SecureWebOps/1.0 header-check',
    },
  });

  const headers = httpsResponse.headers;
  const headerMap = {
    'strict-transport-security': headers.get('strict-transport-security'),
    'content-security-policy': headers.get('content-security-policy'),
    'x-content-type-options': headers.get('x-content-type-options'),
    'x-frame-options': headers.get('x-frame-options'),
    'referrer-policy': headers.get('referrer-policy'),
    'permissions-policy': headers.get('permissions-policy'),
    'cross-origin-resource-policy': headers.get('cross-origin-resource-policy'),
  };

  for (const [headerName, headerValue] of Object.entries(headerMap)) {
    if (headerValue) continue;
    findings.push(buildFinding({
      title: `Missing ${headerName} header`,
      severity: mapHeaderSeverity(headerName),
      category: 'HTTP Security Headers',
      owaspCategory: 'OWASP A05',
      description: `The response is missing the ${headerName} header, which weakens browser-enforced protections.`,
      recommendation: `Configure the application or reverse proxy to send a secure ${headerName} header.`,
      technicalDetails: `Observed response for ${target} did not include ${headerName}.`,
      urls: [target],
    }));
  }

  const corsOrigin = headers.get('access-control-allow-origin');
  if (corsOrigin === '*') {
    findings.push(buildFinding({
      title: 'Wildcard CORS policy detected',
      severity: 'medium',
      category: 'CORS',
      owaspCategory: 'OWASP A05',
      description: 'The server allows any origin via Access-Control-Allow-Origin: *.',
      recommendation: 'Restrict CORS to trusted origins only.',
      technicalDetails: `Access-Control-Allow-Origin header value: ${corsOrigin}`,
      urls: [target],
    }));
  }

  if (targetUrl.protocol === 'https:') {
    const httpUrl = new URL(target);
    httpUrl.protocol = 'http:';
    try {
      const httpResponse = await withTimeout(httpUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': 'SecureWebOps/1.0 redirect-check',
        },
      });

      const redirectLocation = httpResponse.headers.get('location');
      const redirectsToHttps = httpResponse.status >= 300
        && httpResponse.status < 400
        && redirectLocation
        && redirectLocation.startsWith('https://');

      if (!redirectsToHttps) {
        findings.push(buildFinding({
          title: 'HTTP to HTTPS redirect not enforced cleanly',
          severity: 'high',
          category: 'Transport Security',
          owaspCategory: 'OWASP A02',
          description: 'The site did not clearly redirect HTTP traffic to HTTPS on the first hop.',
          recommendation: 'Force all HTTP traffic to redirect directly to the HTTPS version of the same host.',
          technicalDetails: `HTTP probe to ${httpUrl} returned status ${httpResponse.status} with location ${redirectLocation ?? 'none'}.`,
          urls: [httpUrl.toString(), target],
        }));
      }
    } catch (error) {
      findings.push(buildFinding({
        title: 'HTTP endpoint could not be validated for redirect behavior',
        severity: 'low',
        category: 'Transport Security',
        owaspCategory: 'OWASP A02',
        description: 'The service did not provide enough information to validate HTTP to HTTPS redirection behavior.',
        recommendation: 'Verify that plain HTTP requests redirect immediately to HTTPS.',
        technicalDetails: error instanceof Error ? error.message : 'Redirect validation failed.',
        urls: [httpUrl.toString()],
      }));
    }
  }

  const setCookie = headers.get('set-cookie');
  if (setCookie && !/;\s*secure/i.test(setCookie)) {
    findings.push(buildFinding({
      title: 'Cookie missing Secure attribute',
      severity: 'medium',
      category: 'Session Security',
      owaspCategory: 'OWASP A07',
      description: 'A response cookie was observed without the Secure attribute.',
      recommendation: 'Mark authentication and session cookies as Secure so they are not sent over plain HTTP.',
      technicalDetails: `Set-Cookie observed without Secure attribute: ${setCookie}`,
      urls: [target],
    }));
  }

  return findings;
}

function buildObservatoryFinding(observatory, target) {
  const severity = observatory.score >= 90 ? 'low' : observatory.score >= 70 ? 'medium' : 'high';
  return buildFinding({
    title: `HTTP Observatory grade ${observatory.grade ?? 'unknown'}`,
    severity,
    category: 'Hosted Security Assessment',
    owaspCategory: 'OWASP A05',
    description: `Mozilla Observatory reported a score of ${observatory.score ?? 'unknown'} and grade ${observatory.grade ?? 'unknown'}.`,
    recommendation: 'Review the Observatory recommendations and address the missing or weak browser security controls.',
    technicalDetails: JSON.stringify(observatory, null, 2),
    references: observatory.details_url ?? 'https://developer.mozilla.org/en-US/observatory/',
    urls: [target],
  });
}

async function runHostedSecurityScan(target, scanType) {
  const [observatoryResult, healthResult, uptimeRobotResult, headerResult, exposureResult, methodResult, tlsResult] = await Promise.allSettled([
    runObservatoryScan(target),
    runImmediateHealthCheck(target),
    getUptimeRobotMonitor(target),
    collectHeaderFindings(target),
    collectSensitiveExposureFindings(target),
    collectMethodAndDiscoveryFindings(target),
    inspectTlsCertificate(target),
  ]);

  const observatory = observatoryResult.status === 'fulfilled' ? observatoryResult.value : null;
  const health = healthResult.status === 'fulfilled'
    ? healthResult.value
    : {
        status: 'degraded',
        reason: healthResult.reason instanceof Error ? healthResult.reason.message : 'Health check failed',
        responseTimeMs: null,
        statusCode: null,
        ok: false,
      };
  const uptimeRobotMonitor = uptimeRobotResult.status === 'fulfilled' ? uptimeRobotResult.value : null;
  const headerFindings = headerResult.status === 'fulfilled' ? headerResult.value : [];
  const exposureFindings = exposureResult.status === 'fulfilled' ? exposureResult.value : [];
  const methodFindings = methodResult.status === 'fulfilled' ? methodResult.value : [];
  const tlsCertificate = tlsResult.status === 'fulfilled' ? tlsResult.value : null;

  const findings = [
    ...headerFindings,
    ...exposureFindings,
    ...methodFindings,
  ];

  if (observatory) {
    findings.push(buildObservatoryFinding(observatory, target));
  }

  if (!health.ok) {
    findings.push(buildFinding({
      title: 'Website health check failed',
      severity: 'critical',
      category: 'Availability',
      description: `The application did not respond successfully during the live health check. ${health.reason}`,
      recommendation: 'Restore availability, confirm DNS and TLS are working, and verify the application is serving successful HTTP responses.',
      technicalDetails: JSON.stringify(health, null, 2),
      urls: [target],
    }));
  } else if ((health.responseTimeMs ?? 0) > 3000) {
    findings.push(buildFinding({
      title: 'Slow website response time',
      severity: 'low',
      category: 'Performance & Reliability',
      description: `The website responded slowly during the live health check (${health.responseTimeMs} ms).`,
      recommendation: 'Investigate application performance, server load, and network latency.',
      technicalDetails: JSON.stringify(health, null, 2),
      urls: [target],
    }));
  }

  if (tlsCertificate?.valid_to) {
    const expiresAt = new Date(tlsCertificate.valid_to);
    const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (Number.isFinite(daysRemaining) && daysRemaining <= 14) {
      findings.push(buildFinding({
        title: 'TLS certificate expires soon',
        severity: daysRemaining <= 3 ? 'high' : 'medium',
        category: 'TLS Certificate',
        owaspCategory: 'OWASP A02',
        description: `The active TLS certificate expires in ${daysRemaining} day(s).`,
        recommendation: 'Renew and deploy the TLS certificate before it expires.',
        technicalDetails: JSON.stringify(tlsCertificate, null, 2),
        urls: [target],
      }));
    }
  }

  const summary = summarizeFindings(findings, scanType, target);
  summary.provider = observatory ? 'observatory' : 'external_assessment';
  summary.scanner = observatory ? 'mozilla_observatory' : 'securewebops_external_assessment';
  summary.observatory = {
    score: observatory?.score ?? null,
    grade: observatory?.grade ?? null,
    tests_passed: observatory?.tests_passed ?? null,
    tests_failed: observatory?.tests_failed ?? null,
    tests_quantity: observatory?.tests_quantity ?? null,
    details_url: observatory?.details_url ?? null,
  };
  summary.health = health;
  summary.tls = tlsCertificate;
  summary.uptimerobot = uptimeRobotMonitor
    ? {
        id: uptimeRobotMonitor.id ?? null,
        status: uptimeRobotMonitor.status ?? null,
        all_time_uptime_ratio: uptimeRobotMonitor.all_time_uptime_ratio ?? null,
        average_response_time: uptimeRobotMonitor.average_response_time ?? null,
      }
    : null;

  return { summary, findings };
}

async function runZapSecurityScan(target, scanType) {
  if (getScanProvider() !== 'zap') {
    return runHostedSecurityScan(target, scanType);
  }

  const config = getZapConfig();

  await zapGet('JSON/core/action/newSession/', {
    name: `scan-${Date.now()}`,
    overwrite: true,
  });

  // Prime ZAP with the target so it exists in the Sites Tree
  try {
    const primeResult = await zapGet('JSON/core/action/accessUrl/', {
      url: target,
    });
    console.log('[ZAP] accessUrl result:', primeResult);
  } catch (error) {
    console.warn('[ZAP] accessUrl failed, continuing without priming:', error.message);
  }

  const spiderScanId = await startSpiderScan(target, scanType);

  // 🕷️ Spider
  await waitForPercentage(
    'ZAP spider scan',
    async () => {
      const result = await zapGet('JSON/spider/view/status/', { scanId: spiderScanId });
      console.log('[ZAP] spider status raw:', result);
      const percentage = Number(result.status ?? '0');
      console.log(`[ZAP] Spider progress: ${percentage}%`);
      return percentage;
    },
    config.spiderTimeoutMs,
    config.pollIntervalMs
  );

  // 🧠 Passive scan
  await waitForPassiveScan(
    config.passiveTimeoutMs,
    config.pollIntervalMs
  );

  // ⚡ Active scan (FULL only)
  if (scanType === 'full') {
    const activeScanId = await startActiveScan(target);

    await waitForPercentage(
      'ZAP active scan',
      async () => {
        const result = await zapGet('JSON/ascan/view/status/', { scanId: activeScanId });
        const percentage = Number(result.status ?? '0');
        console.log('[ZAP] Active scan progress:', percentage + '%');
        return percentage;
      },
      config.activeTimeoutMs,
      config.pollIntervalMs
    );

    await waitForPassiveScan(
      config.passiveTimeoutMs,
      config.pollIntervalMs
    );
  }

  const alerts = await fetchAllAlerts(target);
  console.log('[ZAP] raw alerts count:', Array.isArray(alerts) ? alerts.length : 'not-array');
  console.log('[ZAP] raw alerts preview:', Array.isArray(alerts) ? alerts.slice(0, 3) : alerts);
  const findings = dedupeAlerts(alerts);
  console.log('[ZAP] deduped findings count:', findings.length);
  const summary = summarizeFindings(findings, scanType, target);

  return { summary, findings };
}

async function logScanActivity(input) {
  if (!input.userId) return;
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    action: input.action,
    resource_type: 'scan',
    resource_id: input.resourceId,
    details: {
      target: input.target,
      ...(input.details ?? {}),
    },
  });
  if (error) console.error('Failed to insert activity log', error);
}

function logScanActivitySafely(input) {
  logScanActivity(input).catch((error) => {
    console.error('Failed to record scan activity', error);
  });
}

async function persistScanArtifacts(scanId, userId, summary, findings) {
  await supabaseAdmin.from('scan_results').upsert({
    scan_id: scanId,
    summary_json: summary,
    findings_json: findings,
    created_at: new Date().toISOString(),
  });

  await supabaseAdmin.from('scan_issues').delete().eq('scan_id', scanId);
  await supabaseAdmin.from('scan_findings').delete().eq('scan_id', scanId);

  if (findings.length > 0) {
    const findingRows = findings.map((finding) => ({
      scan_id: scanId,
      severity: finding.severity,
      finding_type: finding.category,
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
      affected_url: finding.urls?.[0] ?? null,
      metadata: {
        owasp_category: finding.owasp_category,
        confidence: finding.confidence,
        recommendation: finding.recommendation,
        technical_details: finding.technical_details,
        references: finding.references,
        urls: finding.urls ?? [],
        instances: finding.instances ?? 0,
        cwe_id: finding.cwe_id,
        wasc_id: finding.wasc_id,
      },
    }));

    const { error: findingError } = await supabaseAdmin.from('scan_findings').insert(findingRows);
    if (findingError) throw new Error(`Failed to store scan findings: ${findingError.message}`);
  }

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

    const { error: issueError } = await supabaseAdmin.from('scan_issues').insert(issueRows);
    if (issueError) throw new Error(`Failed to store scan issues: ${issueError.message}`);
  }
}

export async function processScan(scanId, target) {
  console.log(`[SCAN] Starting processing for ${scanId} -> ${target}`);
  const { data: scanMeta } = await supabaseAdmin
    .from('scans')
    .select('user_id,organization_id,scan_type')
    .eq('id', scanId)
    .maybeSingle();

  const parsedTarget = new URL(target);
  const scanType = scanMeta?.scan_type === 'full' ? 'full' : 'quick';

  const { data: concurrentScans } = await supabaseAdmin
    .from('scans')
    .select('id', { count: 'exact' })
    .eq('status', 'running')
    .neq('id', scanId)
    .limit(MAX_CONCURRENT_SCANS + 1);

  if ((concurrentScans?.length ?? 0) >= MAX_CONCURRENT_SCANS) {
      console.error(`[SCAN] ${scanId} blocked by concurrency limit`);
      await supabaseAdmin
        .from('scans')
        .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        scan_error: 'Max concurrent scans reached',
      })
      .eq('id', scanId);

    logScanActivitySafely({
      userId: scanMeta?.user_id ?? null,
      organizationId: scanMeta?.organization_id ?? null,
      action: 'scan.failed',
      resourceId: scanId,
      target,
      details: { reason: 'Max concurrent scans reached' },
    });
    return;
  }

  await supabaseAdmin
    .from('scans')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      target_url: target,
      domain: parsedTarget.hostname,
      scan_error: null,
    })
    .eq('id', scanId);
  console.log(`[SCAN] ${scanId} marked running`);

  try {
    const { summary, findings } = await runZapSecurityScan(target, scanType);
    console.log(`[SCAN] ${scanId} completed scan engine run with ${findings.length} findings`);

    await persistScanArtifacts(scanId, scanMeta?.user_id ?? null, summary, findings);

    await supabaseAdmin
      .from('scans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        scan_score: summary.score,
        score: summary.score,
        critical_count: summary.issue_counts.critical,
        high_count: summary.issue_counts.high,
        medium_count: summary.issue_counts.medium,
        low_count: summary.issue_counts.low,
        scan_error: null,
      })
      .eq('id', scanId);
    console.log(`[SCAN] ${scanId} marked completed with score ${summary.score}`);

    logScanActivitySafely({
      userId: scanMeta?.user_id ?? null,
      organizationId: scanMeta?.organization_id ?? null,
      action: 'scan.completed',
      resourceId: scanId,
      target,
      details: { score: summary.score, scanner: summary.scanner, issue_counts: summary.issue_counts },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed';
    console.error(`[SCAN] ${scanId} failed: ${message}`);
    await supabaseAdmin
      .from('scans')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        scan_error: message,
      })
      .eq('id', scanId);

    logScanActivitySafely({
      userId: scanMeta?.user_id ?? null,
      organizationId: scanMeta?.organization_id ?? null,
      action: 'scan.failed',
      resourceId: scanId,
      target,
      details: { reason: message, scanner: getScanProvider() },
    });
  }
}

export async function createAndStartScan({
  target,
  requestedByUser = null,
  organizationId = null,
  scanType = 'quick',
  source = 'node_api',
}) {
  const validatedTarget = await validateTargetUrl(target);
  const { data: scan, error } = await supabaseAdmin
    .from('scans')
    .insert({
      domain: validatedTarget.hostname,
      target_url: validatedTarget.toString(),
      status: 'queued',
      created_at: new Date().toISOString(),
      requested_by_user: requestedByUser,
      organization_id: organizationId,
      scan_type: scanType === 'full' ? 'full' : 'quick',
      source,
      user_id: requestedByUser,
      domain_id: null,
    })
    .select('id,status')
    .single();

  if (error || !scan) {
    throw new Error(error?.message || 'Server error creating scan');
  }

  logScanActivitySafely({
    userId: requestedByUser,
    organizationId,
    action: 'scan.started',
    resourceId: scan.id,
    target: validatedTarget.toString(),
    details: { scan_type: scanType, scanner: getScanProvider(), source },
  });

  processScan(scan.id, validatedTarget.toString()).catch((err) => {
    console.error('Background scan failed', err);
  });

  return { scanId: scan.id, status: 'queued', target: validatedTarget.toString() };
}

function calculateNextRunTime(frequency, dayOfWeek, dayOfMonth) {
  const now = new Date();
  const next = new Date(now);

  if (frequency === 'weekly' && dayOfWeek !== null && dayOfWeek !== undefined) {
    const currentDay = now.getDay();
    let daysUntilNext = dayOfWeek - currentDay;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7;
    }
    next.setDate(now.getDate() + daysUntilNext);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === 'monthly' && dayOfMonth !== null && dayOfMonth !== undefined) {
    next.setDate(dayOfMonth);
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  } else {
    next.setDate(now.getDate() + 7);
    next.setHours(9, 0, 0, 0);
  }

  return next;
}

export async function processDueSchedules() {
  const now = new Date().toISOString();
  const { data: dueSchedules, error: schedulesError } = await supabaseAdmin
    .from('scan_schedules')
    .select(`
      id,
      user_id,
      organization_id,
      domain_id,
      frequency,
      day_of_week,
      day_of_month,
      scan_type,
      domains!inner(domain)
    `)
    .eq('is_active', true)
    .lte('next_run_at', now);

  if (schedulesError) {
    throw new Error(schedulesError.message);
  }

  if (!dueSchedules || dueSchedules.length === 0) {
    return { scansTriggered: 0, details: [] };
  }

  const triggered = [];

  for (const schedule of dueSchedules) {
    try {
      const domain = schedule.domains?.domain;
      if (!domain) {
        console.error(`No domain found for schedule ${schedule.id}`);
        continue;
      }

      const normalizedTarget = domain.startsWith('http://') || domain.startsWith('https://')
        ? domain
        : `https://${domain}`;
      const validatedTarget = await validateTargetUrl(normalizedTarget);

      const { data: scan, error: scanError } = await supabaseAdmin
        .from('scans')
        .insert({
          user_id: schedule.user_id,
          domain_id: schedule.domain_id,
          domain: validatedTarget.hostname,
          target_url: validatedTarget.toString(),
          scan_type: schedule.scan_type,
          status: 'queued',
        })
        .select('id')
        .single();

      if (scanError || !scan) {
        console.error(`Error creating scan for schedule ${schedule.id}:`, scanError);
        continue;
      }

      processScan(scan.id, validatedTarget.toString()).catch((error) => {
        console.error(`Background scheduled scan failed for ${domain}:`, error);
      });

      const nextRunAt = calculateNextRunTime(schedule.frequency, schedule.day_of_week, schedule.day_of_month);
      await supabaseAdmin
        .from('scan_schedules')
        .update({
          last_run_at: now,
          next_run_at: nextRunAt.toISOString(),
        })
        .eq('id', schedule.id);

      triggered.push({
        scheduleId: schedule.id,
        domain,
        scanId: scan.id,
      });
    } catch (error) {
      console.error(`Error processing schedule ${schedule.id}:`, error);
    }
  }

  return {
    scansTriggered: triggered.length,
    details: triggered,
  };
}
