import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

import pdfRoutes from './routes/pdfRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ---- ES module __dirname fix ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Supabase Admin client (server-only) ----
// IMPORTANT: This must be a server-only key (service role / secret key) and must never go in the frontend/extension.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[WARN] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY). /api/scan will fail auth.'
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---- Middleware ----
app.use(cors());
app.use(express.json());

// ---- Routes ----
app.use('/api/pdf', pdfRoutes);

/**
 * Auth middleware: requires a Supabase JWT from the browser (anon session token)
 * Header: Authorization: Bearer <token>
 */
async function requireSupabaseUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
    }

    const token = match[1].trim();

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = data.user; // has id, email, etc.
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Auth middleware failed', details: String(e) });
  }
}

/**
 * POST /api/scan
 * Body example:
 * {
 *   "url":"https://google.com",
 *   "score":90,
 *   "findings":["test"]
 * }
 *
 * This endpoint writes to activity_logs (audit trail).
 */
app.post('/api/scan', requireSupabaseUser, async (req, res) => {
  try {
    const { url, scanType = 'quick' } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Missing required field: url' });

    const userId = req.user.id;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.organization_id) {
      return res.status(400).json({ error: 'User organization not found' });
    }

    const organization_id = profile.organization_id;

    // Normalize URL + domain
    const targetUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    let domain;
    try {
      domain = new URL(targetUrl).hostname.replace(/^www\./, '');
    } catch {
      return res.status(400).json({ error: 'Invalid url' });
    }

    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0] || '').trim() ||
      req.socket.remoteAddress ||
      null;

    const ua = req.headers['user-agent'] || null;

    // 1) Create scan row bound to this user
    const { data: scanRow, error: scanErr } = await supabaseAdmin
      .from('scans')
      .insert([{
        domain,
        scan_type: scanType,
        status: 'pending',
        target_url: targetUrl,
        started_at: new Date().toISOString(),
        user_id: userId,              // IMPORTANT for UI visibility
        requested_by_user: userId,    // IMPORTANT for your schema
        organization_id: organization_id,
      }])
      .select()
      .single();

    if (scanErr) {
      return res.status(500).json({ error: 'Failed to create scan', details: scanErr.message });
    }

    // 2) Log scan.started
    const startedDetails = {
      url: targetUrl,
      domain,
      scanType,
      source: 'api/scan',
    };

    const startPayload = {
      organization_id,
      user_id: userId,
      action: 'scan.started',
      resource_type: 'scan',
      resource_id: scanRow.id,
      details: startedDetails,
      ip_address: ip,
      user_agent: ua,
    };

    console.log("DEBUG activity_logs (started):", startPayload);

    const { error: logStartErr } = await supabaseAdmin
      .from('activity_logs')
      .insert([startPayload]);

    if (logStartErr) {
      // Not fatal; keep going so scans still work
      console.warn('[activity_logs] scan.started insert failed:', logStartErr.message);
    }

    // 3) Invoke the Supabase Edge Function (security-scan)
    const { data: fnData, error: fnErr } = await supabaseAdmin.functions.invoke('security-scan', {
      body: { scanId: scanRow.id, domain, scanType },
    });

    if (fnErr) {
      // Mark scan failed
      await supabaseAdmin
        .from('scans')
        .update({
          status: 'failed',
          scan_error: fnErr.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scanRow.id);

      // Log scan.failed
      const failedPayload = {
  	organization_id,
  	user_id: userId,
  	action: 'scan.failed',
  	resource_type: 'scan',
  	resource_id: scanRow.id,
  	details: { ...startedDetails, error: fnErr.message },
  	ip_address: ip,
  	user_agent: ua,
      };

      console.log("DEBUG activity_logs (failed):", failedPayload);

      const { error: failedLogErr } = await supabaseAdmin
        .from('activity_logs')
        .insert([failedPayload]);

      if (failedLogErr) {
        console.error('activity_logs insert failed (failed):', failedLogErr);
      }

      return res.status(500).json({ error: 'Scan failed to start', details: fnErr.message });
    }

    // 4) Log scan.completed (meaning: queued successfully)
    const completedPayload = {
  	organization_id,
  	user_id: userId,
  	action: 'scan.completed',
  	resource_type: 'scan',
  	resource_id: scanRow.id,
  	details: { ...startedDetails, status: 'queued' },
  	ip_address: ip,
  	user_agent: ua,
    };

    console.log("DEBUG activity_logs (completed):", completedPayload);

    const { error: completedLogErr } = await supabaseAdmin
      .from('activity_logs')
      .insert([completedPayload]);

    if (completedLogErr) {
      console.error('activity_logs insert failed (completed):', completedLogErr);
    }

      return res.status(202).json({
        scanId: scanRow.id,
        status: 'queued',
      });
    } catch (e) {
      console.error('[api/scan] Unhandled error:', e);
      return res.status(500).json({
    	error: 'Server error',
    	details: e?.message || String(e),
    	stack: e?.stack || null,
      });
    }
});

/* ------------------------------
   Serve Static Frontend
-------------------------------- */
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback (must be after API + static)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ---- Start server ----
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SUCCESS] Server started on port ${PORT}`);
  console.log(`Server is globally accessible on the network.`);
});
