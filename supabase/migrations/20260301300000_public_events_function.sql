-- Create a security-definer function so unauthenticated (anon) users
-- can fetch every public event regardless of RLS policies.
CREATE OR REPLACE FUNCTION public.get_public_events()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  event_date TIMESTAMPTZ,
  location TEXT,
  is_public BOOLEAN,
  calendar_id UUID,
  calendar_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.event_date,
    e.location,
    e.is_public,
    e.calendar_id,
    c.title AS calendar_title
  FROM public.events e
  LEFT JOIN public.calendars c ON c.id = e.calendar_id
  WHERE e.is_public = true
  ORDER BY e.event_date;
$$;

-- Allow the anon and authenticated roles to call the function
GRANT EXECUTE ON FUNCTION public.get_public_events() TO anon, authenticated;
