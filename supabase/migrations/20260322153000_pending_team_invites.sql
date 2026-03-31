-- Make pending company invites visible and actionable for the invited user.
-- This supports smoother multitenant onboarding for both company users and personal accounts.

DROP POLICY IF EXISTS "Members can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins/owners can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins/owners can remove members" ON public.organization_members;

CREATE POLICY "Members and invitees can view org members"
ON public.organization_members FOR SELECT
USING (
  public.is_org_member(auth.uid(), organization_id)
  OR (
    user_id IS NULL
    AND invited_email IS NOT NULL
    AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "Admins/owners and invitees can update members"
ON public.organization_members FOR UPDATE
USING (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  OR (
    user_id IS NULL
    AND invited_email IS NOT NULL
    AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
WITH CHECK (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  OR (
    user_id = auth.uid()
    AND joined_at IS NOT NULL
    AND invited_email IS NOT NULL
    AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "Admins/owners and invitees can remove members"
ON public.organization_members FOR DELETE
USING (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  OR (
    user_id IS NULL
    AND invited_email IS NOT NULL
    AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
