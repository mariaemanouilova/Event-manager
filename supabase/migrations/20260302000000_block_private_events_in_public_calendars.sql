-- ============================================================
-- Enforce: event visibility must match calendar visibility.
--   • Public calendar  → only public events allowed
--   • Private calendar → only private events allowed
-- Applies to both regular users and admins.
-- ============================================================

-- Helper: returns the is_public flag of the given calendar
CREATE OR REPLACE FUNCTION public.get_calendar_is_public(cal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT is_public FROM public.calendars WHERE id = cal_id;
$$;

-- ── INSERT policy: regular users ─────────────────────────────
DROP POLICY IF EXISTS "Users can create events" ON public.events;
CREATE POLICY "Users can create events" ON public.events FOR INSERT
  WITH CHECK (
    auth.uid() = creator_id
    AND is_public = public.get_calendar_is_public(calendar_id)
  );

-- ── UPDATE policy: regular users ─────────────────────────────
DROP POLICY IF EXISTS "Users can update own events" ON public.events;
CREATE POLICY "Users can update own events" ON public.events FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (
    is_public = public.get_calendar_is_public(calendar_id)
  );

-- ── UPDATE policy: admins ────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update any event" ON public.events;
CREATE POLICY "Admins can update any event" ON public.events FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (
    is_public = public.get_calendar_is_public(calendar_id)
  );
