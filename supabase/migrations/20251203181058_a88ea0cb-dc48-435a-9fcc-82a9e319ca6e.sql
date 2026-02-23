-- Create role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organization_members table (stores roles separately as required)
CREATE TABLE public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  invited_email TEXT,
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Add organization_id to domains table
ALTER TABLE public.domains ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to scans table  
ALTER TABLE public.scans ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to scan_schedules table
ALTER TABLE public.scan_schedules ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user has role in org (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = ANY(_roles)
  )
$$;

-- Function to check if user is member of org
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- Function to get user's organizations
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
$$;

-- Organizations RLS policies
CREATE POLICY "Users can view their organizations"
ON public.organizations FOR SELECT
USING (id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins/owners can update organizations"
ON public.organizations FOR UPDATE
USING (public.has_org_role(auth.uid(), id, ARRAY['owner', 'admin']::app_role[]));

CREATE POLICY "Only owners can delete organizations"
ON public.organizations FOR DELETE
USING (public.has_org_role(auth.uid(), id, ARRAY['owner']::app_role[]));

-- Organization members RLS policies
CREATE POLICY "Members can view org members"
ON public.organization_members FOR SELECT
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins/owners can add members"
ON public.organization_members FOR INSERT
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[]));

CREATE POLICY "Admins/owners can update members"
ON public.organization_members FOR UPDATE
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[]));

CREATE POLICY "Admins/owners can remove members"
ON public.organization_members FOR DELETE
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[]));

-- Update domains RLS to include org access
CREATE POLICY "Org members can view org domains"
ON public.domains FOR SELECT
USING (
  auth.uid() = user_id 
  OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
);

-- Trigger for organizations updated_at
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();