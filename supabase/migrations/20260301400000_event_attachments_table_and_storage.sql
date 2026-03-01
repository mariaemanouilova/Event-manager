-- Create event_attachments table to track uploaded files
CREATE TABLE public.event_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,       -- MIME type (e.g. image/png, application/pdf)
    file_size BIGINT NOT NULL,     -- size in bytes
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_attachments ENABLE ROW LEVEL SECURITY;

-- Policies: same visibility as the event
CREATE POLICY "Users can view attachments for visible events"
  ON public.event_attachments FOR SELECT USING (
    event_id IN (
      SELECT id FROM public.events WHERE
        auth.uid() = creator_id OR is_public = true OR
        calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    )
  );

CREATE POLICY "Event creators can insert attachments"
  ON public.event_attachments FOR INSERT WITH CHECK (
    event_id IN (SELECT id FROM public.events WHERE creator_id = auth.uid())
  );

CREATE POLICY "Event creators can delete attachments"
  ON public.event_attachments FOR DELETE USING (
    event_id IN (SELECT id FROM public.events WHERE creator_id = auth.uid())
  );

-- Create Storage bucket for event attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-attachments', 'event-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone authenticated can upload to their own event folder
CREATE POLICY "Authenticated users can upload event attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-attachments' AND auth.role() = 'authenticated'
  );

-- Anyone can read event attachments (bucket is public)
CREATE POLICY "Public read access for event attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-attachments');

-- Event creators can delete their event attachments
CREATE POLICY "Users can delete own event attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-attachments' AND auth.role() = 'authenticated'
  );
