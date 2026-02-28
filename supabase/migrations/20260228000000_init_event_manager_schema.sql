-- Create Enums
CREATE TYPE public.user_role AS ENUM ('admin', 'user');
CREATE TYPE public.participant_status AS ENUM ('attending', 'declined', 'maybe', 'invited');

-- Create Users table (extend auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create User Roles table
CREATE TABLE public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL
);

-- Create Calendars table
CREATE TABLE public.calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    is_public BOOLEAN DEFAULT false,
    creator_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Events table
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    location TEXT,
    is_public BOOLEAN DEFAULT false,
    creator_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Participants table
CREATE TABLE public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    status public.participant_status DEFAULT 'invited'::public.participant_status NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, user_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view all profiles" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- User Roles policies
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Calendars policies
CREATE POLICY "Users can view public calendars" ON public.calendars FOR SELECT USING (is_public = true OR auth.uid() = creator_id);
CREATE POLICY "Users can create calendars" ON public.calendars FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own calendars" ON public.calendars FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own calendars" ON public.calendars FOR DELETE USING (auth.uid() = creator_id);

-- Events policies
-- Users can view their own events, events on public calendars, or strictly public events
CREATE POLICY "Users can view visible events" ON public.events FOR SELECT USING (
    auth.uid() = creator_id OR is_public = true OR 
    calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
);
CREATE POLICY "Users can create events" ON public.events FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own events" ON public.events FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own events" ON public.events FOR DELETE USING (auth.uid() = creator_id);

-- Participants policies
-- View participants for events they can see
CREATE POLICY "Users can view participants for visible events" ON public.participants FOR SELECT USING (
    event_id IN (
        SELECT id FROM public.events WHERE 
        auth.uid() = creator_id OR is_public = true OR 
        calendar_id IN (SELECT id FROM public.calendars WHERE is_public = true OR creator_id = auth.uid())
    )
);
CREATE POLICY "Users can RSVP to events" ON public.participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own RSVP" ON public.participants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users and event creators can delete RSVPs" ON public.participants FOR DELETE USING (
    auth.uid() = user_id OR 
    event_id IN (SELECT id FROM public.events WHERE creator_id = auth.uid())
);
