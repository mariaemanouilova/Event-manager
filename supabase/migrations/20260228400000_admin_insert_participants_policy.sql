-- Allow admins to insert participants for any event
CREATE POLICY "Admins can insert any participant" ON public.participants FOR INSERT
  WITH CHECK (public.is_admin());
