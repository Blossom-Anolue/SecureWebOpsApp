import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';

const router = express.Router();

function jsonError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
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

router.post('/events', async (req, res) => {
  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
  }

  const eventType = req.body?.eventType ?? req.body?.event_type ?? null;
  const details = req.body?.details ?? {};

  if (!eventType) {
    return jsonError(res, 400, 'missing_event_type', 'eventType is required');
  }

  const userId = authResult.user.id;

  const [eventInsert, activityInsert] = await Promise.all([
    supabaseAdmin.from('browser_extension_events').insert({
      user_id: userId,
      event_type: eventType,
      details,
    }),
    supabaseAdmin.from('activity_logs').insert({
      user_id: userId,
      action: eventType,
      resource_type: 'browser_extension',
      details,
    }),
  ]);

  if (eventInsert.error) {
    return jsonError(res, 500, 'event_log_failed', eventInsert.error.message);
  }

  if (activityInsert.error) {
    console.error('Failed to insert browser extension activity log', activityInsert.error);
  }

  return res.status(202).json({ status: 'logged', eventType });
});

export default router;
