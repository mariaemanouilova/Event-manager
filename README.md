# Event Manager

A full-stack web application for creating and managing events, calendars, and invitations. Users can register, create public or private events, invite participants, track RSVPs, and view everything on an interactive calendar. The app also provides a public calendar view for unauthenticated visitors and an admin panel for platform management.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Local Development Setup](#local-development-setup)
- [Project Structure](#project-structure)

---

## Features

| Role | Capabilities |
|------|-------------|
| **Visitor (unauthenticated)** | Browse public events on a read-only calendar, view the landing page |
| **Registered User** | Create calendars and events, invite other users, RSVP to invitations, upload file attachments, receive real-time notifications, manage personal events |
| **Admin** | Full CRUD on all users, calendars, events, and participants via a dedicated admin panel |

**Highlights:**

- Interactive calendar views powered by **FullCalendar** (month / week)
- Color-coded calendar filter chips
- Drag-and-drop file attachments stored in **Supabase Storage**
- Real-time notification system via **Supabase Realtime** (bell icon + toast popups)
- Participant invitation with chip-based user selection and inline RSVP management
- Google Calendar API integration for syncing events
- Responsive UI built with **Bootstrap 5**

---

## Architecture

The application follows a **client-server** architecture with a clear separation between the frontend SPA and the Supabase backend.

```
┌─────────────────────────────────────────────────────────┐
│                       Frontend                          │
│  Vanilla JS  ·  ES6 Modules  ·  Bootstrap 5  ·  Vite   │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │  Router   │  │Components│  │       Pages           │  │
│  │(SPA-style)│  │(header,  │  │(calendar, events,     │  │
│  │           │  │ footer,  │  │ invitations, admin,   │  │
│  │           │  │ toast,   │  │ login, event-form,    │  │
│  │           │  │ notifs)  │  │ home, index)          │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │  Supabase JS SDK (REST + Realtime)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase Backend                      │
│                                                         │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  Auth         │  │  Storage   │  │  Realtime        │  │
│  │  (email/pwd)  │  │  (files)   │  │  (notifications) │  │
│  └──────────────┘  └───────────┘  └──────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PostgreSQL Database                              │   │
│  │  Row Level Security · SECURITY DEFINER functions  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
              Google Calendar API
              (event sync)
```

### Technologies Used

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML, CSS, vanilla JavaScript (ES6 modules) |
| **UI Framework** | Bootstrap 5, Bootstrap Icons |
| **Calendar** | FullCalendar 6 (daygrid + interaction plugins) |
| **Build Tool** | Vite 7 |
| **Backend** | Supabase (BaaS) |
| **Database** | PostgreSQL (hosted by Supabase) |
| **Authentication** | Supabase Auth (email/password) |
| **File Storage** | Supabase Storage (`event-attachments` bucket) |
| **Real-time** | Supabase Realtime (Postgres changes) |
| **External API** | Google Calendar API |
| **Hosting** | Netlify |
| **Package Manager** | npm |

---

## Database Schema

### Entity-Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐
│  auth.users  │       │   user_roles     │
│──────────────│       │──────────────────│
│ id (PK)      │◄──┐   │ user_id (PK, FK) │
└──────┬───────┘   │   │ role (enum)      │
       │           │   └──────────────────┘
       │ 1:1       │          role ∈ {admin, user}
       ▼           │
┌──────────────┐   │
│    users     │   │
│──────────────│   │
│ id (PK, FK)  │───┘
│ email        │
│ full_name    │──────────────────────────────────────┐
│ created_at   │                                      │
└──┬───────────┘                                      │
   │                                                  │
   │ 1:N                                              │ 1:N
   ▼                                                  ▼
┌──────────────────┐    1:N    ┌──────────────────────────┐
│   calendars      │─────────►│        events             │
│──────────────────│          │──────────────────────────│
│ id (PK)          │          │ id (PK)                   │
│ title            │          │ calendar_id (FK)          │
│ is_public        │          │ title                     │
│ creator_id (FK)  │          │ description               │
│ created_at       │          │ event_date                │
└──────────────────┘          │ location                  │
                              │ is_public                 │
                              │ creator_id (FK → users)   │
                              │ created_at                │
                              └──────┬──────────┬─────────┘
                                     │          │
                              1:N    │          │ 1:N
                                     ▼          ▼
                       ┌──────────────────┐  ┌───────────────────────┐
                       │  participants    │  │  event_attachments    │
                       │──────────────────│  │───────────────────────│
                       │ id (PK)          │  │ id (PK)               │
                       │ event_id (FK)    │  │ event_id (FK)         │
                       │ user_id (FK)     │  │ file_name             │
                       │ status (enum)    │  │ file_path             │
                       │ created_at       │  │ file_type             │
                       └──────────────────┘  │ file_size             │
                         status ∈ {attending,│ uploaded_by (FK)      │
                          declined, maybe,   │ created_at            │
                          invited}           └───────────────────────┘
                                     │
                              1:N    │ (user_id → users)
                                     ▼
                       ┌──────────────────┐
                       │  notifications   │
                       │──────────────────│
                       │ id (PK)          │
                       │ user_id (FK)     │
                       │ event_id (FK)    │
                       │ message          │
                       │ type             │
                       │ is_read          │
                       │ created_at       │
                       └──────────────────┘
                         type ∈ {invitation,
                          rsvp_update, info}
```

### Tables Summary

| Table | Purpose |
|-------|---------|
| **users** | Extends `auth.users`; stores email, full name |
| **user_roles** | Maps each user to a role (`admin` or `user`) |
| **calendars** | Named event containers; can be public or private |
| **events** | Individual events belonging to a calendar with date, location, visibility |
| **participants** | Join table linking users to events with RSVP status |
| **event_attachments** | Metadata for files uploaded to events (stored in Supabase Storage) |
| **notifications** | Real-time user notifications for invitations, RSVP updates, etc. |

### Enums

- **`user_role`** — `admin`, `user`
- **`participant_status`** — `attending`, `declined`, `maybe`, `invited`

### Row Level Security (RLS)

All tables have RLS enabled. Key policies include:

- **Users** — anyone can view profiles; users can edit only their own
- **Calendars** — all authenticated users can view all calendars; only creators can modify
- **Events** — visible to creators, public events, or invited participants
- **Participants** — event creators and users themselves can manage RSVP entries; admins have full access
- **Notifications** — users can only access their own notifications
- **Admin override** — an `is_admin()` helper function grants full CRUD to admin users across all tables

### Security Definer Functions

| Function | Purpose |
|----------|---------|
| `is_admin()` | Checks if the current user has the `admin` role |
| `get_public_events()` | Returns all public events with calendar titles, bypassing RLS for anonymous access |
| `user_participant_event_ids()` | Returns event IDs the user participates in (breaks circular RLS) |
| `user_participant_calendar_ids()` | Returns calendar IDs for events the user participates in |
| `user_visible_event_ids()` | Returns all event IDs visible to the current user |

---

## Local Development Setup

### Prerequisites

- **Node.js** (v18 or later) and **npm**
- A **Supabase** project (free tier works) — [supabase.com](https://supabase.com)
- *(Optional)* Google Cloud project with Calendar API enabled for Google Calendar sync

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/Event-manager.git
cd Event-manager
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

You can find these values in your Supabase project dashboard under **Settings → API**.

### 4. Set Up the Database

Apply the migration files in order to your Supabase project. You can run them in the **Supabase SQL Editor** or use the Supabase CLI:

```bash
# Using Supabase CLI (if configured)
supabase db push
```

Alternatively, execute each SQL file from `supabase/migrations/` manually in the SQL Editor, in chronological order:

1. `20260228000000_init_event_manager_schema.sql` — Core tables, enums, and RLS policies
2. `20260228100000_notifications_table.sql` — Notifications table + realtime
3. `20260228200000_fix_participants_insert_policy.sql` — Fix participant insert policy
4. `20260228300000_admin_rls_policies.sql` — Admin RLS policies
5. `20260228400000_admin_insert_participants_policy.sql` — Admin participant insert
6. `20260301000000_fix_invited_user_select_policies.sql` — Invited user visibility fix
7. `20260301100000_fix_circular_rls_with_security_definer.sql` — Security definer helpers
8. `20260301200000_allow_all_users_view_all_calendars.sql` — Calendar visibility
9. `20260301300000_public_events_function.sql` — Public events RPC function
10. `20260301400000_event_attachments_table_and_storage.sql` — Attachments table + storage bucket
11. `20260302000000_block_private_events_in_public_calendars.sql` — Prevent private events in public calendars

### 5. Start the Dev Server

```bash
npm run dev
```

The app will be available at **http://localhost:5173**.

### 6. Build for Production

```bash
npm run build
npm run preview   # preview the production build locally
```

---

## Project Structure

```
Event-manager/
├── index.html                          # App entry point (single HTML shell)
├── package.json                        # Dependencies and scripts
├── vite.config.js                      # Vite dev server configuration
├── .env                                # Environment variables (not committed)
│
├── src/
│   ├── main.js                         # App bootstrap: imports CSS, calls router
│   ├── supabase.js                     # Supabase client initialization
│   │
│   ├── router/
│   │   └── router.js                   # SPA router: static & dynamic routes,
│   │                                   #   layout mounting, auth redirects
│   │
│   ├── components/                     # Reusable UI components
│   │   ├── header/
│   │   │   ├── header.html             # Nav bar template
│   │   │   ├── header.js               # Dynamic header (auth-aware nav + admin link)
│   │   │   └── header.css
│   │   ├── footer/
│   │   │   ├── footer.html             # Footer template
│   │   │   ├── footer.js
│   │   │   └── footer.css
│   │   ├── notifications/
│   │   │   ├── notifications.js        # Realtime notification bell + dropdown
│   │   │   └── notifications.css
│   │   └── toast/
│   │       ├── toast.js                # Bootstrap toast utility (success/error/info)
│   │       └── toast.css
│   │
│   ├── pages/                          # Application pages (each a module)
│   │   ├── index/                      # Landing page (public)
│   │   │   ├── index.html
│   │   │   ├── index.js
│   │   │   └── index.css
│   │   ├── home/                       # Public calendar view (unauthenticated)
│   │   │   ├── home.html
│   │   │   ├── home.js                 # FullCalendar with get_public_events() RPC
│   │   │   └── home.css
│   │   ├── login/                      # Login & registration
│   │   │   ├── login.html
│   │   │   ├── login.js                # Supabase Auth sign-in / sign-up
│   │   │   └── login.css
│   │   ├── calendar/                   # Authenticated calendar view
│   │   │   ├── calendar.html
│   │   │   ├── calendar.js             # FullCalendar with filter chips + CRUD
│   │   │   └── calendar.css
│   │   ├── events/                     # My Events dashboard
│   │   │   ├── events.html
│   │   │   ├── events.js               # Filterable event table + attachments
│   │   │   └── events.css
│   │   ├── event-form/                 # Create / Edit event form
│   │   │   ├── event-form.html
│   │   │   ├── event-form.js           # Form with participant chips + file upload
│   │   │   └── event-form.css
│   │   ├── invitations/                # Invitations inbox
│   │   │   ├── invitations.html
│   │   │   ├── invitations.js          # RSVP management + event detail modal
│   │   │   └── invitations.css
│   │   └── admin/                      # Admin panel
│   │       ├── admin.html
│   │       ├── admin.js                # Role check + tab orchestration
│   │       ├── admin.css
│   │       ├── services/
│   │       │   └── admin-data.js       # Supabase queries for admin CRUD
│   │       ├── tabs/
│   │       │   ├── users.js            # Users tab logic
│   │       │   ├── calendars.js        # Calendars tab logic
│   │       │   ├── events.js           # Events tab logic
│   │       │   └── participants.js     # Participants tab logic
│   │       └── ui/
│   │           ├── helpers.js          # Admin UI helper utilities
│   │           ├── modal-controller.js # Bootstrap modal management
│   │           └── table-renderer.js   # Dynamic table rendering
│   │
│   └── styles/
│       └── app.css                     # Global application styles
│
├── supabase/
│   └── migrations/                     # SQL migration files (applied in order)
│       ├── 20260228000000_init_event_manager_schema.sql
│       ├── 20260228100000_notifications_table.sql
│       ├── 20260228200000_fix_participants_insert_policy.sql
│       ├── 20260228300000_admin_rls_policies.sql
│       ├── 20260228400000_admin_insert_participants_policy.sql
│       ├── 20260301000000_fix_invited_user_select_policies.sql
│       ├── 20260301100000_fix_circular_rls_with_security_definer.sql
│       ├── 20260301200000_allow_all_users_view_all_calendars.sql
│       ├── 20260301300000_public_events_function.sql
│       ├── 20260301400000_event_attachments_table_and_storage.sql
│       └── 20260302000000_block_private_events_in_public_calendars.sql
│
└── .github/
    └── copilot-instructions.md         # AI assistant project guidelines
```

### Key Files at a Glance

| File / Folder | Purpose |
|---------------|---------|
| `index.html` | Single HTML shell with `<div id="app">` mount point |
| `src/main.js` | Entry point — imports Bootstrap, global CSS, and starts the router |
| `src/supabase.js` | Creates and exports the Supabase client using env vars |
| `src/router/router.js` | SPA router with history API, static + dynamic routes, auth state listener |
| `src/components/` | Shared layout pieces (header, footer) and cross-cutting concerns (notifications, toasts) |
| `src/pages/` | One folder per page; each contains its own HTML template, JS logic, and CSS |
| `src/pages/admin/` | Admin panel split into services, tabs, and UI helpers for maintainability |
| `supabase/migrations/` | Versioned SQL files that define and evolve the database schema |
