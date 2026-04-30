import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

function jsonError(res, status, error) {
  const message =
    error?.message ||
    error?.details ||
    error?.hint ||
    'Request failed';

  return res.status(status).json({ error: message });
}

async function authenticateBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Missing or invalid authorization header' } };
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseClient.auth.getUser(token);

  if (error || !user) {
    return { error: { status: 401, message: 'Invalid token or user not found' } };
  }

  return { user };
}

function buildCandidateSlugs(name, userId) {
  const baseSlug = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return [
    baseSlug,
    `${baseSlug}-${userId.slice(0, 8)}`,
    `${baseSlug}-${Date.now().toString().slice(-6)}`,
  ].filter(Boolean);
}

router.delete('/account', async (req, res) => {
  try {
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) {
      return jsonError(res, authResult.error.status, authResult.error);
    }
    const { user } = authResult;

    // Delete the user using the admin client
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return res.status(500).json({ error: 'Failed to delete account' });
    }

    return res.status(200).json({ message: 'Account successfully deleted' });
  } catch (error) {
    console.error('Account deletion error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/organizations', async (req, res) => {
  try {
    console.log('[ORG] create request received');
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) {
      console.warn('[ORG] auth failed', authResult.error);
      return jsonError(res, authResult.error.status, authResult.error);
    }

    const { user } = authResult;
    const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!requestedName) {
      return res.status(400).json({ error: 'Team name is required.' });
    }

    const requestedSlug =
      typeof req.body?.slug === 'string' && req.body.slug.trim()
        ? req.body.slug.trim()
        : null;

    const candidateSlugs = requestedSlug
      ? [requestedSlug, ...buildCandidateSlugs(requestedName, user.id)]
      : buildCandidateSlugs(requestedName, user.id);

    let organization = null;
    let lastError = null;

    for (const slug of [...new Set(candidateSlugs)]) {
      const { data, error } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: requestedName,
          slug,
          created_by: user.id,
        })
        .select()
        .single();

      if (!error) {
        organization = data;
        break;
      }

      lastError = error;
      const isConflict =
        error.code === '23505' ||
        error.message?.toLowerCase().includes('duplicate') ||
        error.message?.toLowerCase().includes('slug');

      if (!isConflict) {
        console.error('[ORG] create failed', error);
        return jsonError(res, 500, error);
      }
    }

    if (!organization) {
      return jsonError(res, 409, lastError ?? { message: 'Failed to create team.' });
    }

    const { error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner',
        joined_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error('[ORG] owner membership failed', memberError);
      await supabaseAdmin.from('organizations').delete().eq('id', organization.id);
      return jsonError(res, 500, memberError);
    }

    console.log('[ORG] created organization', organization.id);
    return res.status(201).json({ organization });
  } catch (error) {
    console.error('Organization creation error:', error);
    return jsonError(res, 500, error);
  }
});

router.post('/organizations/:organizationId/invitations', async (req, res) => {
  try {
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) {
      return jsonError(res, authResult.error.status, authResult.error);
    }

    const { user } = authResult;
    const organizationId = req.params.organizationId;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = typeof req.body?.role === 'string' ? req.body.role : 'member';

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required.' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Invite email is required.' });
    }

    if (user.email && email === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'You are already on this team.' });
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return jsonError(res, 500, membershipError);
    }

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Only owners or admins can invite members.' });
    }

    const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
      .from('organization_members')
      .select('id, invited_email, user_id')
      .eq('organization_id', organizationId)
      .eq('invited_email', email)
      .maybeSingle();

    if (existingInviteError) {
      return jsonError(res, 500, existingInviteError);
    }

    if (existingInvite) {
      return res.status(409).json({ error: 'An invitation has already been sent to this email.' });
    }

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) {
      return jsonError(res, 500, usersError);
    }

    const matchedUser = usersData?.users?.find(
      (candidate) => candidate.email?.trim().toLowerCase() === email
    );

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: matchedUser?.id ?? null,
        role,
        invited_email: email,
        invited_at: new Date().toISOString(),
        joined_at: null,
      })
      .select()
      .single();

    if (invitationError) {
      return jsonError(res, 500, invitationError);
    }

    return res.status(201).json({ invitation });
  } catch (error) {
    console.error('Organization invite error:', error);
    return jsonError(res, 500, error);
  }
});

export default router;
