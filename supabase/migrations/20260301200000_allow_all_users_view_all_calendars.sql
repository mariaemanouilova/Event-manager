-- Allow all authenticated users to view all calendars
-- so they can link events to any calendar
DROP POLICY IF EXISTS "Users and admins can view calendars" ON public.calendars;
CREATE POLICY "Users and admins can view calendars" ON public.calendars FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );
