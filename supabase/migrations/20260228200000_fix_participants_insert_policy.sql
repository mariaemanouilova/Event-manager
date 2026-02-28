-- Fix participants INSERT policy: allow event creators to add participants to their own events
DROP POLICY IF EXISTS "Users can RSVP to events" ON public.participants;

CREATE POLICY "Users can RSVP to events" ON public.participants FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    event_id IN (SELECT id FROM public.events WHERE creator_id = auth.uid())
);
