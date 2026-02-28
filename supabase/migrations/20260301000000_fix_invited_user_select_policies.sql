-- ============================================================
-- Fix SELECT policies so invited users can see events/calendars
-- ============================================================

-- 1. Events: users can also see events they are invited to (as participant)
DROP POLICY IF EXISTS "Users and admins can view events" ON public.events;
CREATE POLICY "Users and admins can view events" ON public.events FOR SELECT
  USING (
    auth.uid() = creator_id
    OR is_public = true
    OR calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    OR id IN (SELECT event_id FROM public.participants WHERE user_id = auth.uid())
    OR is_admin()
  );

-- 2. Calendars: users can also see calendars for events they are invited to
DROP POLICY IF EXISTS "Users and admins can view calendars" ON public.calendars;
CREATE POLICY "Users and admins can view calendars" ON public.calendars FOR SELECT
  USING (
    is_public = true
    OR auth.uid() = creator_id
    OR id IN (
      SELECT e.calendar_id FROM public.events e
      JOIN public.participants p ON p.event_id = e.id
      WHERE p.user_id = auth.uid()
    )
    OR is_admin()
  );

-- 3. Participants: users can always see their own participation rows
DROP POLICY IF EXISTS "Users and admins can view participants" ON public.participants;
CREATE POLICY "Users and admins can view participants" ON public.participants FOR SELECT
  USING (
    auth.uid() = user_id
    OR event_id IN (
      SELECT id FROM public.events WHERE
      auth.uid() = creator_id OR is_public = true OR
      calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    )
    OR is_admin()
  );
