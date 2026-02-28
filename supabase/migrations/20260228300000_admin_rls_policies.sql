-- ============================================================
-- Admin RLS policies: grant admin users full access to all tables
-- ============================================================

-- Helper function: returns true if the current user has an 'admin' role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ── user_roles: admins can view all roles ────────────────────
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view roles" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE
  USING (public.is_admin());

-- ── users: admins can update/delete any user ─────────────────
CREATE POLICY "Admins can update any user" ON public.users FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete any user" ON public.users FOR DELETE
  USING (public.is_admin());

-- ── calendars: admins have full access ───────────────────────
DROP POLICY IF EXISTS "Users can view public calendars" ON public.calendars;
CREATE POLICY "Users and admins can view calendars" ON public.calendars FOR SELECT
  USING (is_public = true OR auth.uid() = creator_id OR public.is_admin());

CREATE POLICY "Admins can update any calendar" ON public.calendars FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete any calendar" ON public.calendars FOR DELETE
  USING (public.is_admin());

-- ── events: admins have full access ──────────────────────────
DROP POLICY IF EXISTS "Users can view visible events" ON public.events;
CREATE POLICY "Users and admins can view events" ON public.events FOR SELECT
  USING (
    auth.uid() = creator_id OR is_public = true OR
    calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Admins can update any event" ON public.events FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete any event" ON public.events FOR DELETE
  USING (public.is_admin());

-- ── participants: admins have full access ────────────────────
DROP POLICY IF EXISTS "Users can view participants for visible events" ON public.participants;
CREATE POLICY "Users and admins can view participants" ON public.participants FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM public.events WHERE
      auth.uid() = creator_id OR is_public = true OR
      calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    )
    OR public.is_admin()
  );

CREATE POLICY "Admins can update any participant" ON public.participants FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete any participant" ON public.participants FOR DELETE
  USING (public.is_admin());

-- ── notifications: admins can view all notifications ─────────
CREATE POLICY "Admins can view all notifications" ON public.notifications FOR SELECT
  USING (public.is_admin());
