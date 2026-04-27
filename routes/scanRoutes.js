import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { checkRateLimit, createAndStartScan, diagnoseZapConnection, processDueSchedules, processScan, validateTargetUrl } from '../services/zapScanService.js';

const router = express.Router();
export const publicScanRouter = express.Router();

function validateDomainInput(input) {
  if (!input) throw new Error("Invalid domain");

  // Block script injection
  if (
    input.includes("<") ||
    input.includes(">") ||
    input.toLowerCase().includes("script") ||
    input.includes("javascript:")
  ) {
    throw new Error("Malicious input detected");
  }

  let parsed;
  try {
    parsed = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    throw new Error("Malformed domain");
  }

  if (!parsed.hostname.includes(".")) {
    throw new Error("Invalid domain format");
  }

  return parsed;
}

function jsonError(res, status, code, message, details = undefined) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

async function authenticateBearerToken(req) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return { error: { status: 401, code: 'missing_authorization', message: 'Missing Authorization: Bearer <token>' } };
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return { error: { status: 401, code: 'invalid_authorization', message: 'Bearer token is empty' } };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { error: { status: 401, code: 'invalid_token', message: 'Invalid or expired bearer token' } };
  }

  return { user: data.user };
}

async function ensureOrganizationAccess(userId, organizationId) {
  if (!organizationId) return { ok: true };

  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, code: 'organization_lookup_failed', message: 'Could not verify organization membership' };
  }

  if (!data) {
    return { ok: false, status: 403, code: 'organization_access_denied', message: 'You do not belong to that organization' };
  }

  return { ok: true };
}

async function getAccessibleScan(scanId, userId) {
  const { data: scan, error } = await supabaseAdmin
    .from('scans')
    .select('id,user_id,organization_id,target_url,domain,status,created_at,started_at,completed_at,scan_error')
    .eq('id', scanId)
    .maybeSingle();

  if (error) {
    return { error: { status: 500, code: 'scan_lookup_failed', message: 'Could not verify scan access' } };
  }

  if (!scan) {
    return { error: { status: 404, code: 'scan_not_found', message: 'Scan not found' } };
  }

  if (scan.user_id === userId) {
    return { scan };
  }

  if (scan.organization_id) {
    const organizationAccess = await ensureOrganizationAccess(userId, scan.organization_id);
    if (organizationAccess.ok) {
      return { scan };
    }
  }

  return { error: { status: 403, code: 'scan_access_denied', message: 'You do not have access to that scan' } };
}

function isAuthorizedScheduler(req) {
  const expected = process.env.SCAN_RUNNER_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers['x-scan-runner-secret'];
  return typeof provided === 'string' && provided === expected;
}

function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

async function handlePublicScanRequest(req, res) {
  if (!checkRateLimit(getClientIp(req))) {
    return jsonError(res, 429, 'rate_limit_exceeded', 'Rate limit exceeded');
  }

  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
  }

  const target =
    req.body?.target_url
    ?? req.body?.target
    ?? req.body?.url
    ?? null;
  const requestedOrganizationId = req.body?.organization_id ?? req.body?.org_id ?? null;
  const scanType = req.body?.scan_type === 'full' ? 'full' : 'quick';

  if (!target) {
    return jsonError(res, 400, 'missing_target', 'target_url is required');
  }

  const organizationAccess = await ensureOrganizationAccess(authResult.user.id, requestedOrganizationId);
  if (!organizationAccess.ok) {
    return jsonError(res, organizationAccess.status, organizationAccess.code, organizationAccess.message);
  }

  try {
    const result = await createAndStartScan({
      target,
      requestedByUser: authResult.user.id,
      organizationId: requestedOrganizationId,
      scanType,
      source: 'browser_extension',
    });

    return res.status(202).json({
      scanId: result.scanId,
      status: result.status,
      targetUrl: result.target,
      scanType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error creating scan';
    const status = /Invalid|blocked|allowlist|private/.test(message) ? 400 : 500;
    const code = status === 400 ? 'invalid_target' : 'scan_create_failed';
    return jsonError(res, status, code, message);
  }
}

publicScanRouter.post('/scan', handlePublicScanRequest);

router.post('/trigger', async (req, res) => {
  const { scanId, url, domain } = req.body ?? {};
  const rawTarget = String(url || domain || '').trim();

  // 🔐 INPUT VALIDATION

  let parsedUrl;
  try {
    parsedUrl = validateDomainInput(rawTarget);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  console.log('[TRIGGER] incoming:', { scanId, url, domain, rawTarget });

  if (!scanId) {
    return res.status(400).json({ error: 'scanId is required' });
  }

  if (!checkRateLimit(getClientIp(req))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
  }

  const scanAccess = await getAccessibleScan(scanId, authResult.user.id);
  if (scanAccess.error) {
    return jsonError(res, scanAccess.error.status, scanAccess.error.code, scanAccess.error.message);
  }

  const normalizedTarget = rawTarget.startsWith('http://') || rawTarget.startsWith('https://')
    ? rawTarget
    : `https://${rawTarget}`;

  console.log('[TRIGGER] normalizedTarget:', normalizedTarget);

  try {
    const validatedTarget = await validateTargetUrl(normalizedTarget);

    await supabaseAdmin
      .from('scans')
      .update({
        status: 'queued',
        target_url: validatedTarget.toString(),
        domain: validatedTarget.hostname,
        scan_error: null,
      })
      .eq('id', scanId);

    processScan(scanId, validatedTarget.toString()).catch((error) => {
      console.error('Background scan failed', error);
    });

    return res.status(202).json({ scan_id: scanId, status: 'queued' });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid target'
    });
  }
});

router.post('/v1/scans', async (req, res) => {
  if (!checkRateLimit(getClientIp(req))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
  }

  const { target, org_id, scan_type } = req.body ?? {};

  // 🔐 VALIDATION
  let parsedUrl;
  try {
    parsedUrl = validateDomainInput(target);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // 🔐 ACCESS CHECK
  const organizationAccess = await ensureOrganizationAccess(authResult.user.id, org_id ?? null);
  if (!organizationAccess.ok) {
    return jsonError(res, organizationAccess.status, organizationAccess.code, organizationAccess.message);
  }

  // 🚀 SCAN EXECUTION
  try {
    const result = await createAndStartScan({
      target: parsedUrl.toString(),
      requestedByUser: authResult.user.id,
      organizationId: org_id ?? null,
      scanType: scan_type === 'full' ? 'full' : 'quick',
    });

    return res.status(201).json({
      scan_id: result.scanId,
      status: result.status,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error creating scan';
    const status = /Invalid|blocked|allowlist|private/.test(message) ? 400 : 500;

    return res.status(status).json({ error: message });
  }
});

router.post('/scan', handlePublicScanRequest);

router.get('/v1/scans/:scanId', async (req, res) => {
  const { scanId } = req.params;
  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
  }

  const scanAccess = await getAccessibleScan(scanId, authResult.user.id);
  if (scanAccess.error) {
    return jsonError(res, scanAccess.error.status, scanAccess.error.code, scanAccess.error.message);
  }

  const scan = scanAccess.scan;

  return res.json({
    scan_id: scan.id,
    target: scan.target_url ?? (scan.domain?.startsWith('http') ? scan.domain : `https://${scan.domain}`),
    status: scan.status,
    created_at: scan.created_at,
    started_at: scan.started_at,
    completed_at: scan.completed_at,
    error: scan.scan_error ?? null,
  });
});

router.get('/v1/scans/:scanId/results', async (req, res) => {
  const { scanId } = req.params;
  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
  }

  const scanAccess = await getAccessibleScan(scanId, authResult.user.id);
  if (scanAccess.error) {
    return jsonError(res, scanAccess.error.status, scanAccess.error.code, scanAccess.error.message);
  }

  const scan = scanAccess.scan;

  if (scan.status !== 'completed') {
    return res.status(409).json({ scan_id: scan.id, status: scan.status, error: 'Scan is not completed yet' });
  }

  const { data: result, error: resultError } = await supabaseAdmin
    .from('scan_results')
    .select('summary_json,findings_json')
    .eq('scan_id', scanId)
    .maybeSingle();

  if (resultError) {
    return res.status(500).json({ error: 'Server error fetching scan results' });
  }

  return res.json({
    scan_id: scan.id,
    summary: result?.summary_json ?? {
      score: null,
      risk: 'unknown',
      scanner: 'hosted_security_scan',
      issue_counts: { critical: 0, high: 0, medium: 0, low: 0 },
    },
    findings: result?.findings_json ?? [],
  });
});

router.post('/scheduled/run', async (req, res) => {
  if (!isAuthorizedScheduler(req)) {
    return res.status(401).json({ error: 'Unauthorized scheduler request' });
  }

  try {
    const result = await processDueSchedules();
    return res.json({
      message: result.scansTriggered === 0 ? 'No scheduled scans due' : 'Scheduled scans processed',
      scansTriggered: result.scansTriggered,
      details: result.details,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process scheduled scans',
    });
  }
});

router.get('/diagnostics/zap', async (req, res) => {
  if (!isAuthorizedScheduler(req)) {
    return res.status(401).json({ error: 'Unauthorized diagnostics request' });
  }

  try {
    const diagnostics = await diagnoseZapConnection();
    return res.json(diagnostics);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to connect to ZAP',
    });
  }
});

export default router;
