-- Allow signed-in users to create organizations they own and bootstrap
-- the first owner membership for that organization.

DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = created_by
);

DROP POLICY IF EXISTS "Admins/owners can add members" ON public.organization_members;

CREATE POLICY "Admins/owners can add members"
ON public.organization_members FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
  OR
  (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_members.organization_id
        AND o.created_by = auth.uid()
    )
  )
);
