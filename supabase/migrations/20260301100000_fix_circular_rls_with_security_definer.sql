-- ============================================================
-- Fix circular RLS policies by using SECURITY DEFINER helpers
-- These functions bypass RLS so subqueries don't trigger
-- circular policy evaluation.
-- ============================================================

-- Helper: returns event IDs where current user is a participant
CREATE OR REPLACE FUNCTION public.user_participant_event_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT event_id FROM participants WHERE user_id = auth.uid();
$$;

-- Helper: returns calendar IDs for events where user is a participant
CREATE OR REPLACE FUNCTION public.user_participant_calendar_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT e.calendar_id
  FROM events e
  JOIN participants p ON p.event_id = e.id
  WHERE p.user_id = auth.uid();
$$;

-- Helper: returns event IDs the user can see (for use in participants policy)
CREATE OR REPLACE FUNCTION public.user_visible_event_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM events
  WHERE creator_id = auth.uid()
     OR is_public = true
     OR calendar_id IN (
         SELECT id FROM calendars WHERE is_public = true OR creator_id = auth.uid()
     );
$$;

-- 1. Events: users see own + public + in own/public calendars + invited + admin
DROP POLICY IF EXISTS "Users and admins can view events" ON public.events;
CREATE POLICY "Users and admins can view events" ON public.events FOR SELECT
  USING (
    auth.uid() = creator_id
    OR is_public = true
    OR calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    OR id IN (SELECT user_participant_event_ids())
    OR is_admin()
  );

-- 2. Calendars: users see public + own + those with events they are invited to + admin
DROP POLICY IF EXISTS "Users and admins can view calendars" ON public.calendars;
CREATE POLICY "Users and admins can view calendars" ON public.calendars FOR SELECT
  USING (
    is_public = true
    OR auth.uid() = creator_id
    OR id IN (SELECT user_participant_calendar_ids())
    OR is_admin()
  );

-- 3. Participants: users see own rows + rows for visible events + admin
DROP POLICY IF EXISTS "Users and admins can view participants" ON public.participants;
CREATE POLICY "Users and admins can view participants" ON public.participants FOR SELECT
  USING (
    auth.uid() = user_id
    OR event_id IN (SELECT user_visible_event_ids())
    OR is_admin()
  );
