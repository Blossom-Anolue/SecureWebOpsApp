import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

let cachedTransporter = null;

function getEmailTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.EMAIL_SMTP_HOST;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASSWORD;
  const port = Number.parseInt(process.env.EMAIL_SMTP_PORT || '587', 10);
  const service = process.env.EMAIL_SMTP_SERVICE;

  if ((!host && !service) || !user || !pass) return null;

  // Enable connection pooling to keep SMTP connections alive, making sending instant
  const config = { port, pool: true, maxConnections: 5, maxMessages: 100 };
  if (service) config.service = service;
  else config.host = host;
  config.auth = { user, pass };

  cachedTransporter = nodemailer.createTransport(config);
  return cachedTransporter;
}

async function sendAppEmail(to, subject, text, html) {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) return false;

    const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'no-reply@securewebops.com';
    const fromName = process.env.EMAIL_FROM_NAME || 'SecureWebOps';

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text,
      html
    });
    console.log(`[EMAIL] Sent '${subject}' to ${to}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err);
    return false;
  }
}

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

router.post('/welcome', async (req, res) => {
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const subject = 'Welcome to SecureWebOps!';
  const text = `Hi ${name || 'there'},\n\nWelcome to SecureWebOps! We're excited to help you secure your business.\n\nLog in to your dashboard here: ${frontendUrl}/auth\n\nBest,\nThe SecureWebOps Team`;
  const html = `<p>Hi ${name || 'there'},</p><p>Welcome to <strong>SecureWebOps</strong>! We're excited to help you secure your business.</p><p><a href="${frontendUrl}/auth">Log in to your dashboard here</a>.</p><p>Best,<br/>The SecureWebOps Team</p>`;

  await sendAppEmail(email, subject, text, html);
  
  return res.status(200).json({ success: true });
});

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

    await sendAppEmail(
      user.email,
      'Your SecureWebOps Account Has Been Deleted',
      'Your account has been successfully deleted. We are sorry to see you go!',
      '<p>Your account has been successfully deleted. We are sorry to see you go!</p>'
    );

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
    
    await sendAppEmail(
      user.email,
      `Workspace Created: ${organization.name}`,
      `You have successfully created the workspace "${organization.name}".\n\nYou can now invite team members and monitor your assets.`,
      `<p>You have successfully created the workspace <strong>${organization.name}</strong>.</p><p>You can now invite team members and monitor your assets.</p>`
    );

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

    if (matchedUser) {
      const { data: existingMembership, error: existingMembershipError } = await supabaseAdmin
        .from('organization_members')
        .select('id, joined_at, role')
        .eq('organization_id', organizationId)
        .eq('user_id', matchedUser.id)
        .maybeSingle();

      if (existingMembershipError) {
        return jsonError(res, 500, existingMembershipError);
      }

      if (existingMembership?.joined_at) {
        return res.status(409).json({ error: 'That user is already part of this workspace.' });
      }
    }

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

    // Get organization & inviter details for the email
    const { data: orgData } = await supabaseAdmin.from('organizations').select('name').eq('id', organizationId).single();
    const orgName = orgData?.name || 'a company workspace';
    const { data: inviterData } = await supabaseAdmin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle();
    const inviterName = inviterData?.full_name || inviterData?.email || user.email || 'A team member';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    await sendAppEmail(
      email,
      `You have been invited to join ${orgName} on SecureWebOps`,
      `Hello!\n\n${inviterName} has invited you to join the ${orgName} workspace on SecureWebOps.\n\nLog in here to accept your invitation: ${frontendUrl}/auth\n\nThank you,\nThe SecureWebOps Team`,
      `<p>Hello!</p><p><strong>${inviterName}</strong> has invited you to join the <strong>${orgName}</strong> workspace on SecureWebOps.</p><p><a href="${frontendUrl}/auth">Click here to log in and accept your invitation</a></p><p>Thank you,<br/>The SecureWebOps Team</p>`
    );

    return res.status(201).json({ invitation });
  } catch (error) {
    console.error('Organization invite error:', error);
    return jsonError(res, 500, error);
  }
});

router.post('/organizations/:organizationId/invitations/:membershipId/accept', async (req, res) => {
  try {
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) {
      return jsonError(res, authResult.error.status, authResult.error);
    }

    const { user } = authResult;
    const organizationId = req.params.organizationId;
    const membershipId = req.params.membershipId;
    const normalizedEmail = user.email?.trim().toLowerCase();

    if (!organizationId || !membershipId || !normalizedEmail) {
      return res.status(400).json({ error: 'Missing invitation details.' });
    }

    const { data: pendingInvites, error: pendingInvitesError } = await supabaseAdmin
      .from('organization_members')
      .select('id, organization_id, invited_email, role, organizations(id, name, slug)')
      .eq('organization_id', organizationId)
      .eq('invited_email', normalizedEmail)
      .is('joined_at', null)
      .order('invited_at', { ascending: true });

    if (pendingInvitesError) {
      return jsonError(res, 500, pendingInvitesError);
    }

    if (!pendingInvites?.length) {
      return res.status(404).json({ error: 'This invitation is no longer available.' });
    }

    const matchingInvite = pendingInvites.find((invite) => invite.id === membershipId);
    const primaryInvite = matchingInvite ?? pendingInvites[0];
    const duplicateInviteIds = pendingInvites
      .map((invite) => invite.id)
      .filter((id) => id !== primaryInvite.id);

    const { data: acceptedInvite, error: acceptedInviteError } = await supabaseAdmin
      .from('organization_members')
      .update({
        user_id: user.id,
        joined_at: new Date().toISOString(),
      })
      .eq('id', primaryInvite.id)
      .select('*, organizations(id, name, slug)')
      .single();

    if (acceptedInviteError) {
      return jsonError(res, 500, acceptedInviteError);
    }

    if (duplicateInviteIds.length > 0) {
      const { error: cleanupError } = await supabaseAdmin
        .from('organization_members')
        .delete()
        .in('id', duplicateInviteIds);

      if (cleanupError) {
        return jsonError(res, 500, cleanupError);
      }
    }

    await sendAppEmail(
      user.email,
      `You joined ${primaryInvite.organizations?.name || 'a workspace'}`,
      `You have successfully joined the workspace "${primaryInvite.organizations?.name || 'a workspace'}" as a ${primaryInvite.role}.`,
      `<p>You have successfully joined the workspace <strong>${primaryInvite.organizations?.name || 'a workspace'}</strong> as a ${primaryInvite.role}.</p>`
    );

    return res.status(200).json({ membership: acceptedInvite });
  } catch (error) {
    console.error('Organization invite accept error:', error);
    return jsonError(res, 500, error);
  }
});

router.delete('/organizations/:organizationId/invitations/:membershipId', async (req, res) => {
  try {
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) {
      return jsonError(res, authResult.error.status, authResult.error);
    }

    const { user } = authResult;
    const organizationId = req.params.organizationId;
    const membershipId = req.params.membershipId;
    const normalizedEmail = user.email?.trim().toLowerCase();

    if (!organizationId || !membershipId || !normalizedEmail) {
      return res.status(400).json({ error: 'Missing invitation details.' });
    }

    const { data: pendingInvites, error: pendingInvitesError } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('invited_email', normalizedEmail)
      .is('joined_at', null);

    if (pendingInvitesError) {
      return jsonError(res, 500, pendingInvitesError);
    }

    const inviteIds = Array.from(
      new Set([membershipId, ...(pendingInvites ?? []).map((invite) => invite.id)])
    );

    const { error: deleteError } = await supabaseAdmin
      .from('organization_members')
      .delete()
      .in('id', inviteIds);

    if (deleteError) {
      return jsonError(res, 500, deleteError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Organization invite decline error:', error);
    return jsonError(res, 500, error);
  }
});

router.delete('/organizations/:organizationId/members/:memberId', async (req, res) => {
  try {
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) return jsonError(res, authResult.error.status, authResult.error);
    const { user } = authResult;
    const { organizationId, memberId } = req.params;

    // 1. Verify requester has admin/owner privileges
    const { data: requester } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Only owners or admins can remove members.' });
    }

    // 2. Get member details for the email
    const { data: memberData } = await supabaseAdmin
      .from('organization_members')
      .select('*, organizations(name)')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!memberData) return res.status(404).json({ error: 'Member not found.' });

    // 3. Delete the member
    const { error: deleteError } = await supabaseAdmin
      .from('organization_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) return jsonError(res, 500, deleteError);

    // 4. Send the removal email
    let targetEmail = memberData.invited_email;
    if (!targetEmail && memberData.user_id) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(memberData.user_id);
      targetEmail = userData?.user?.email;
    }
    
    const orgName = memberData.organizations?.name || 'the workspace';
    
    if (targetEmail) {
      await sendAppEmail(
        targetEmail,
        `You have been removed from ${orgName}`,
        `Hello,\n\nYou have been removed from the workspace "${orgName}" on SecureWebOps.\nIf you believe this was a mistake, please contact the workspace administrator.`,
        `<p>Hello,</p><p>You have been removed from the workspace <strong>${orgName}</strong> on SecureWebOps.</p><p>If you believe this was a mistake, please contact the workspace administrator.</p>`
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Member removal error:', error);
    return jsonError(res, 500, error);
  }
});

export default router;
